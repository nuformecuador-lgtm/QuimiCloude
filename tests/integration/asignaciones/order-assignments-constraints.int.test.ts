/**
 * QC-86 (T10) — Tests de integracion del MODELO de asignacion de pedidos contra una base
 * Postgres REAL, con la migracion `20260911120000_order_assignments` aplicada.
 *
 * Es el unico sitio donde se demuestran R2, R3, R4, R7, R8, R9, R10, R11, R12, R13, R15, R16,
 * R17, R18, R19, R20, R21, R22 y R23 con `SQLSTATE` de verdad (`design.md > 6`), y la mitad de
 * R1 y R6 que solo se ve cuando alguien lo intenta. Lo que vigila el SQL ESCRITO —que las dos
 * FK hacia `identity` sean COMPUESTAS, que no aparezca el modo de coincidencia estricto, que no
 * haya `deleted_at`— es el test de esquema; lo que se comprueba AQUI es lo que la base HACE.
 *
 * AISLAMIENTO — cada `it` corre dentro de `prisma.$transaction` interactiva y termina lanzando
 * `RollbackSignal`, lo que hace que Prisma emita `ROLLBACK`: ninguna fila escrita por un test
 * sobrevive, y por eso los tests son repetibles e independientes del orden. Se usa la
 * transaccion interactiva de Prisma (y no un cliente `pg` aparte) porque asi se ejercita
 * EXACTAMENTE el camino de datos de la app y porque el SQL crudo dentro de la misma transaccion
 * comparte conexion, y por tanto aislamiento. Mismo patron que
 * `tests/integration/identity/work-groups-constraints.int.test.ts` (QC-83), que es el
 * precedente directo de este archivo.
 *
 * LAS DOS EMPRESAS — R11, R12 y R13 son el corazon de la ficha y tratan justamente de que la
 * persona de la empresa A no acabe asignada con un grupo de la empresa B, asi que cada
 * transaccion fabrica DOS empresas efimeras propias, con nombre irrepetible (`randomUUID`).
 * NUNCA se usa la empresa de instalacion que siembra QC-6: `companies_name_unique` es GLOBAL y
 * el alta chocaria con ella. El rol, las personas, los grupos, la receta y los pedidos se
 * fabrican tambien dentro de la transaccion, por lo mismo: ningun caso depende del seed ni
 * puede ensuciarlo.
 *
 * SAVEPOINTS — un error de constraint aborta la transaccion de Postgres entera, y casi todos
 * los requisitos de aqui exigen mirar el estado DESPUES del rechazo («no crear ni modificar
 * ninguna fila», «el pedido y sus asignaciones quedan intactos»). Por eso toda operacion que se
 * espera que falle va envuelta en un `SAVEPOINT` y se deshace con `ROLLBACK TO SAVEPOINT`, que
 * deja la transaccion viva y permite seguir consultando.
 *
 * SQL CRUDO, Y POR QUE PASA POR `pg_temp.qc86_try` — las operaciones que se espera que fallen
 * se escriben en SQL crudo a proposito: (1) omitir una columna obligatoria no se puede expresar
 * con la API tipada (no compilaria) y (2) hace falta el error de Postgres SIN traducir. Y se
 * ejecutan a traves de una funcion PL/pgSQL efimera —creada dentro de la propia transaccion,
 * asi que muere con ella— porque su bloque `EXCEPTION` puede leer `GET STACKED DIAGNOSTICS`: de
 * ahi salen `RETURNED_SQLSTATE`, `CONSTRAINT_NAME` y `COLUMN_NAME` como CAMPOS, no como texto.
 * Asi cada caso afirma contra la RESTRICCION CONCRETA —`order_assignments_user_id_fkey`,
 * `order_assignments_work_group_id_fkey`, `order_assignments_pkey`,
 * `order_assignments_work_group_name_matches_group`— y no contra «algo fallo», que es lo que
 * pide T10. Los caminos felices y las lecturas van con la API tipada de Prisma.
 *
 * CRITERIO DE HECHO DE T10 — los casos de R11, R12 y R13 caen si alguien convierte las dos FK
 * compuestas en simples (dejarian de fallar: el `23503` desaparece) o si escribe el modo de
 * coincidencia estricto en la FK del grupo (la asignacion SUELTA de R13 dejaria de aceptarse).
 */
import { randomUUID } from 'node:crypto'

import { Prisma } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  DOCUMENT_TYPE_CC,
  normalizeCompanyName,
  normalizeWorkGroupName,
} from '@/lib/modules/identity'
import { prisma } from '@/lib/shared/db/prisma'

// ---------------------------------------------------------------------------
// Aislamiento
// ---------------------------------------------------------------------------

/** Senal de rollback: no es un fallo, es como se deshace la transaccion del test. */
class RollbackSignal extends Error {
  constructor() {
    super('rollback de aislamiento del test')
    this.name = 'RollbackSignal'
  }
}

/** Las dos empresas del caso, el rol del que cuelgan las personas y la receta de los pedidos. */
interface Fixture {
  readonly tx: Prisma.TransactionClient
  /** Empresa A: la «propia» en casi todos los casos. */
  readonly companyA: string
  /** Empresa B: la ajena, con la que se construye la fila cruzada de R11. */
  readonly companyB: string
  readonly roleId: string
  /** Receta efimera: `orders.recipe_id` es una FK REAL, asi que cada caso siembra la suya. */
  readonly recipeId: string
}

/**
 * La funcion efimera que ejecuta una sentencia y, si Postgres la rechaza, devuelve el
 * diagnostico ESTRUCTURADO en vez de propagar un mensaje traducido. El bloque `EXCEPTION` de
 * PL/pgSQL abre su propio savepoint implicito, asi que al volver la transaccion sigue viva y la
 * sentencia fallida no dejo nada escrito. Vive en `pg_temp`, se crea dentro de la transaccion
 * del test y desaparece con ella. Copia del patron de QC-83.
 */
const CREATE_TRY_FUNCTION = `
  CREATE OR REPLACE FUNCTION pg_temp.qc86_try(stmt text) RETURNS text AS $qc86fn$
  DECLARE
    v_state text; v_constraint text; v_column text;
  BEGIN
    EXECUTE stmt;
    RETURN 'ACEPTADO||';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS
      v_state = RETURNED_SQLSTATE, v_constraint = CONSTRAINT_NAME, v_column = COLUMN_NAME;
    RETURN v_state || '|' || coalesce(v_constraint, '') || '|' || coalesce(v_column, '');
  END $qc86fn$ LANGUAGE plpgsql`

/** Ejecuta el cuerpo del test en una transaccion que SIEMPRE termina en ROLLBACK. */
async function inRolledBackTransaction(body: (fixture: Fixture) => Promise<void>): Promise<void> {
  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(CREATE_TRY_FUNCTION)
        // Las dos empresas, el rol y la receta nacen AQUI, antes del cuerpo, y nunca dentro de
        // un `SAVEPOINT` que luego se deshaga: si desaparecieran mientras su id sigue en una
        // variable, el siguiente alta fallaria con un 23503 que no mide lo que el caso quiere.
        const companyA = await createCompany(tx, 'empresa-a')
        const companyB = await createCompany(tx, 'empresa-b')
        const roleId = await createRole(tx)
        const recipeId = await createRecipe(tx, companyA)
        await body({ tx, companyA, companyB, roleId, recipeId })
        throw new RollbackSignal()
      },
      { maxWait: 10_000, timeout: 30_000 },
    )
  } catch (error) {
    if (!(error instanceof RollbackSignal)) throw error
  }
}

let savepointSeq = 0

/** SQLSTATE de Postgres relevantes aqui. Son estables y NO dependen del idioma. */
const NOT_NULL_VIOLATION = '23502'
const FOREIGN_KEY_VIOLATION = '23503'
const UNIQUE_VIOLATION = '23505'
const CHECK_VIOLATION = '23514'

/**
 * Las restricciones de esta tabla, por su nombre exacto: se afirma contra ellas, no contra
 * «algo fallo». Si alguien las renombra, las borra o las simplifica, estos tests se ponen rojos.
 */
// QC-60 (R25): la FK del pedido dejo de ser simple. Ahora es COMPUESTA `(order_id, company_id)`
// hacia `orders(id, company_id)`, y con ella cambio de nombre.
const FK_ORDEN = 'order_assignments_order_id_company_id_fkey'
const FK_PERSONA = 'order_assignments_user_id_fkey'
const FK_GRUPO = 'order_assignments_work_group_id_fkey'
const PK_ASIGNACION = 'order_assignments_pkey'
const CHECK_GRUPO_Y_NOMBRE = 'order_assignments_work_group_name_matches_group'

/** Lo que respondio la base al rechazar la sentencia. */
interface Rejection {
  readonly sqlState: string
  /** Nombre de la restriccion o del indice que la disparo; `null` en un `NOT NULL`. */
  readonly constraint: string | null
  /** Columna implicada; `null` salvo en un `NOT NULL`. */
  readonly column: string | null
}

/**
 * Corre `sql` esperando que la base lo rechace, y devuelve el diagnostico. El `SAVEPOINT`
 * explicito envuelve tambien la llamada a la funcion: si la sentencia se ACEPTA, lo escrito se
 * deshace antes de que el test falle, y ningun caso posterior hereda basura.
 */
async function expectRejectedByDatabase(
  tx: Prisma.TransactionClient,
  sql: string,
  what: string,
): Promise<Rejection> {
  savepointSeq += 1
  const savepoint = `sp_oa_${String(savepointSeq)}`
  await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`)
  const rows = await tx.$queryRawUnsafe<{ r: string }[]>(
    `SELECT pg_temp.qc86_try($qc86stmt$${sql}$qc86stmt$) AS r`,
  )
  await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`)

  const [sqlState = '', constraint = '', column = ''] = (rows[0]?.r ?? '').split('|')
  if (sqlState === 'ACEPTADO') {
    throw new Error(`se esperaba que la base rechazara la operacion, pero la acepto: ${what}`)
  }
  return {
    sqlState,
    constraint: constraint === '' ? null : constraint,
    column: column === '' ? null : column,
  }
}

// ---------------------------------------------------------------------------
// Datos de apoyo — cada caso siembra los suyos
// ---------------------------------------------------------------------------

/** Literal SQL de un texto. Los valores los fabrica el propio test; solo hay que escapar `'`. */
function lit(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

/** Literal SQL de un uuid. */
function uuidLit(value: string): string {
  return `CAST(${lit(value)} AS uuid)`
}

/** Nombre de empresa irrepetible: `companies_name_unique` es GLOBAL (QC-47). */
async function createCompany(tx: Prisma.TransactionClient, prefix: string): Promise<string> {
  const name = `${prefix}-${randomUUID()}`
  const company = await tx.company.create({
    data: { name, nameNormalized: normalizeCompanyName(name) },
    select: { id: true },
  })
  return company.id
}

/** Nombre de rol irrepetible: la unicidad de `roles.name` es global y sensible a caso. */
async function createRole(tx: Prisma.TransactionClient): Promise<string> {
  const role = await tx.role.create({
    data: { name: `rol-qc86-${randomUUID()}`, description: 'Rol de prueba' },
    select: { id: true },
  })
  return role.id
}

/** Receta efimera SIN lineas: es solo el otro lado de `orders_recipe_id_fkey`. Es de la misma
 *  empresa que los pedidos que la usan (`companyA`): QC-50 hizo `recipes.company_id` obligatoria. */
async function createRecipe(tx: Prisma.TransactionClient, companyId: string): Promise<string> {
  const marca = randomUUID().replaceAll('-', '')
  const recipe = await tx.recipe.create({
    data: { name: `Receta ${marca}`, nameNormalized: `receta${marca}`, companyId },
    select: { id: true },
  })
  return recipe.id
}

/** Crea una persona viva de esa empresa. Correo, username y documento irrepetibles. */
async function createUser(fixture: Fixture, companyId: string): Promise<string> {
  const tag = randomUUID()
  const user = await fixture.tx.user.create({
    data: {
      firstNames: 'Ana Maria',
      lastNames: 'Perez Gomez',
      birthDate: new Date('1990-05-17T00:00:00.000Z'),
      email: `${tag}@example.com`,
      phone: '+57 300 111 2233',
      documentTypeCode: DOCUMENT_TYPE_CC,
      documentNumber: tag.replaceAll('-', '').slice(0, 15),
      username: tag,
      passwordHash: 'hash-de-prueba-no-es-un-algoritmo-real',
      roleId: fixture.roleId,
      companyId,
    },
    select: { id: true },
  })
  return user.id
}

/**
 * Crea un grupo de esa empresa. El normalizado sale de la UNICA definicion publicada por el
 * contrato de `identity` (QC-83 R3): el test no reimplementa la normalizacion, la importa.
 */
async function createWorkGroup(
  tx: Prisma.TransactionClient,
  companyId: string,
  name = `Turno noche ${randomUUID()}`,
): Promise<{ id: string; name: string }> {
  return tx.workGroup.create({
    data: { name, nameNormalized: normalizeWorkGroupName(name), companyId },
    select: { id: true, name: true },
  })
}

/**
 * Posicion del correlativo de los pedidos que fabrica este archivo. Arranca en un punto
 * aleatorio alto y solo crece, asi que no choca contra
 * `orders_order_year_order_sequence_key` ni con los pedidos de otro archivo que corra a la vez.
 */
let nextSequence = 700_000 + Math.floor(Math.random() * 100_000)

/**
 * Crea un pedido. El ano NO se escribe a mano: el CHECK `orders_order_year_matches_created_at`
 * (QC-33 R41) ata `order_year` con `created_at`, asi que un pedido con `created_at` por defecto
 * solo admite el ano UTC de hoy. Un literal pondria esta suite roja sola el 1 de enero.
 */
async function createOrder(fixture: Fixture): Promise<string> {
  nextSequence += 1
  const order = await fixture.tx.order.create({
    data: {
      // QC-60: `orders.company_id` es NOT NULL y la FK de la asignacion ya es compuesta, asi que
      // el pedido nace en la MISMA empresa que sus asignaciones.
      companyId: fixture.companyA,
      orderYear: new Date().getUTCFullYear(),
      orderSequence: nextSequence,
      recipeId: fixture.recipeId,
      quantity: new Prisma.Decimal('10'),
    },
    select: { id: true },
  })
  return order.id
}

/** Columnas que un alta cruda puede escribir en `order_assignments`. */
interface AssignmentColumns {
  order_id?: string
  user_id?: string
  company_id?: string
  work_group_id?: string
  work_group_name?: string
}

/**
 * `INSERT INTO order_assignments` crudo. Omitir una clave del objeto es exactamente el caso
 * «falta un dato obligatorio» (R1), que la API tipada no deja ni escribir, y poner el grupo sin
 * su nombre es el caso «la congelacion a medias» (R7), que el CHECK rechaza. `updated_at` se
 * pone siempre porque es NOT NULL sin default de base: lo rellena `@updatedAt` del cliente.
 */
function insertAssignmentSql(columns: AssignmentColumns): string {
  const entries = Object.entries(columns).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  )
  const names = [...entries.map(([name]) => `"${name}"`), '"updated_at"']
  const values = [
    ...entries.map(([name, value]) => (name === 'work_group_name' ? lit(value) : uuidLit(value))),
    'CURRENT_TIMESTAMP',
  ]
  return `INSERT INTO "order_assignments" (${names.join(', ')}) VALUES (${values.join(', ')})`
}

/** Asigna por el camino feliz (API tipada), que es el camino real de la app. */
async function assign(
  tx: Prisma.TransactionClient,
  data: {
    orderId: string
    userId: string
    companyId: string
    workGroupId?: string
    workGroupName?: string
  },
): Promise<void> {
  await tx.orderAssignment.create({
    data: {
      orderId: data.orderId,
      userId: data.userId,
      companyId: data.companyId,
      workGroupId: data.workGroupId ?? null,
      workGroupName: data.workGroupName ?? null,
    },
  })
}

/** La fila completa de una asignacion, para compararla columna por columna. */
interface AssignmentRow {
  orderId: string
  userId: string
  companyId: string
  workGroupId: string | null
  workGroupName: string | null
  createdAt: Date
  updatedAt: Date
}

/** Las asignaciones de un pedido, en orden estable, para comparar la FILA ENTERA. */
function assignmentsOf(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<AssignmentRow[]> {
  return tx.orderAssignment.findMany({ where: { orderId }, orderBy: { userId: 'asc' } })
}

/**
 * Cuantas asignaciones tienen la empresa DESINCRONIZADA de la de su persona o de la de su
 * grupo. Es la mitad de R11 y R12 que no se ve en el SQLSTATE: no basta con que la operacion
 * falle, tiene que no quedar ninguna fila cruzada.
 */
async function desyncedAssignments(tx: Prisma.TransactionClient): Promise<number> {
  const rows = await tx.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n
    FROM "order_assignments" a
    JOIN "users" u ON u."id" = a."user_id"
    LEFT JOIN "work_groups" g ON g."id" = a."work_group_id"
    WHERE a."company_id" <> u."company_id"
       OR (g."id" IS NOT NULL AND a."company_id" <> g."company_id")`
  return rows[0]?.n ?? -1
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------

beforeAll(async () => {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'order_assignments'`
  if (tables.length !== 1) {
    throw new Error(
      'la base de pruebas no tiene aplicada la migracion de asignaciones (QC-86). ' +
        'Corre `pnpm run db:migrate` antes de estos tests.',
    )
  }
})

afterAll(async () => {
  await prisma.$disconnect()
})

// ===========================================================================
// R11 — EL CORAZON: la fila cruzada la rechaza POSTGRES
// ===========================================================================

describe('la persona de una empresa no se asigna con el grupo de otra', () => {
  it('R11: rechaza la asignacion con persona de la empresa A y grupo de la empresa B', async () => {
    // Con `company_id` = la de la PERSONA, la FK que no puede casar es la del GRUPO: la pareja
    // `(work_group_id, company_id)` no existe en `work_groups(id, company_id)`. Si alguien
    // convierte esa FK en simple, este `INSERT` se acepta y el caso cae.
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA, companyB } = fixture
      const pedido = await createOrder(fixture)
      const personaDeA = await createUser(fixture, companyA)
      const grupoDeB = await createWorkGroup(tx, companyB)

      const rechazo = await expectRejectedByDatabase(
        tx,
        insertAssignmentSql({
          order_id: pedido,
          user_id: personaDeA,
          company_id: companyA,
          work_group_id: grupoDeB.id,
          work_group_name: grupoDeB.name,
        }),
        'asignacion con persona de la empresa A y grupo de la empresa B',
      )
      expect(rechazo.sqlState).toBe(FOREIGN_KEY_VIOLATION)
      expect(rechazo.constraint).toBe(FK_GRUPO)

      // «no crear ni modificar ninguna fila».
      expect(await tx.orderAssignment.count({ where: { orderId: pedido } })).toBe(0)
      expect(await desyncedAssignments(tx)).toBe(0)
    })
  })

  it('R11: rechaza la misma asignacion cruzada declarando la empresa del grupo', async () => {
    // El otro sentido: con `company_id` = la del GRUPO, la que no casa es la FK de la PERSONA.
    // Se escriben los dos porque cada uno prueba una FK compuesta distinta.
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA, companyB } = fixture
      const pedido = await createOrder(fixture)
      const personaDeA = await createUser(fixture, companyA)
      const grupoDeB = await createWorkGroup(tx, companyB)

      const rechazo = await expectRejectedByDatabase(
        tx,
        insertAssignmentSql({
          order_id: pedido,
          user_id: personaDeA,
          company_id: companyB,
          work_group_id: grupoDeB.id,
          work_group_name: grupoDeB.name,
        }),
        'asignacion cruzada declarando la empresa del grupo',
      )
      expect(rechazo.sqlState).toBe(FOREIGN_KEY_VIOLATION)
      expect(rechazo.constraint).toBe(FK_PERSONA)
      expect(await tx.orderAssignment.count({ where: { orderId: pedido } })).toBe(0)
      expect(await desyncedAssignments(tx)).toBe(0)
    })
  })

  it('R11: rechaza la asignacion cuya empresa no es la de la persona ni la del grupo', async () => {
    // Persona y grupo SI son de la misma empresa, pero la fila declara una TERCERA. Las dos FK
    // compuestas fallan a la vez; Postgres reporta la primera que evalua, y el caso afirma que
    // es una de las dos —nunca `null`, nunca otra— y que ninguna fila entra.
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA } = fixture
      const otraEmpresa = await createCompany(tx, 'empresa-c')
      const pedido = await createOrder(fixture)
      const persona = await createUser(fixture, companyA)
      const grupo = await createWorkGroup(tx, companyA)

      const rechazo = await expectRejectedByDatabase(
        tx,
        insertAssignmentSql({
          order_id: pedido,
          user_id: persona,
          company_id: otraEmpresa,
          work_group_id: grupo.id,
          work_group_name: grupo.name,
        }),
        'asignacion con una empresa que no es la de la persona ni la del grupo',
      )
      expect(rechazo.sqlState).toBe(FOREIGN_KEY_VIOLATION)
      expect([FK_PERSONA, FK_GRUPO]).toContain(rechazo.constraint)
      expect(await tx.orderAssignment.count({ where: { orderId: pedido } })).toBe(0)
      expect(await desyncedAssignments(tx)).toBe(0)
    })
  })

  it('R11: rechaza tambien AL MODIFICAR la asignacion hacia un grupo de otra empresa', async () => {
    // R11 dice «tanto al insertar como al modificar»: la garantia no es del `INSERT`, es de la
    // definicion de la tabla.
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA, companyB } = fixture
      const pedido = await createOrder(fixture)
      const persona = await createUser(fixture, companyA)
      const grupoPropio = await createWorkGroup(tx, companyA)
      const grupoAjeno = await createWorkGroup(tx, companyB)
      await assign(tx, {
        orderId: pedido,
        userId: persona,
        companyId: companyA,
        workGroupId: grupoPropio.id,
        workGroupName: grupoPropio.name,
      })
      const antes = await assignmentsOf(tx, pedido)

      const rechazo = await expectRejectedByDatabase(
        tx,
        `UPDATE "order_assignments"
         SET "work_group_id" = ${uuidLit(grupoAjeno.id)}, "work_group_name" = ${lit(grupoAjeno.name)}
         WHERE "order_id" = ${uuidLit(pedido)}`,
        'mover la asignacion hacia un grupo de otra empresa',
      )
      expect(rechazo.sqlState).toBe(FOREIGN_KEY_VIOLATION)
      expect(rechazo.constraint).toBe(FK_GRUPO)

      // La fila original sigue intacta, columna por columna.
      expect(await assignmentsOf(tx, pedido)).toEqual(antes)
      expect(await desyncedAssignments(tx)).toBe(0)
    })
  })

  it('R11: acepta la asignacion cuando la persona, el grupo y la empresa son la misma', async () => {
    // El contrapunto del que dependen los cuatro casos anteriores: lo que rechaza la base es el
    // CRUCE, no la tabla entera.
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA } = fixture
      const pedido = await createOrder(fixture)
      const persona = await createUser(fixture, companyA)
      const grupo = await createWorkGroup(tx, companyA)

      await assign(tx, {
        orderId: pedido,
        userId: persona,
        companyId: companyA,
        workGroupId: grupo.id,
        workGroupName: grupo.name,
      })

      const filas = await assignmentsOf(tx, pedido)
      expect(filas).toHaveLength(1)
      expect(filas[0]).toMatchObject({
        orderId: pedido,
        userId: persona,
        companyId: companyA,
        workGroupId: grupo.id,
        workGroupName: grupo.name,
      })
      expect(await desyncedAssignments(tx)).toBe(0)
    })
  })
})

// ===========================================================================
// R12 — mover de empresa a un padre con asignaciones
// ===========================================================================

describe('mover de empresa a un padre ya asignado', () => {
  it('R12: rechaza cambiar de empresa a una persona con una asignacion de grupo', async () => {
    // El `ON UPDATE CASCADE` propaga primero la empresa nueva a las filas de asignacion y
    // ENTONCES la FK del GRUPO deja de casar: el 23503 llega contra la OTRA FK. Lo que el
    // requisito exige es el resultado, no cual de las dos lo grita.
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA, companyB } = fixture
      const pedido = await createOrder(fixture)
      const persona = await createUser(fixture, companyA)
      const grupo = await createWorkGroup(tx, companyA)
      await assign(tx, {
        orderId: pedido,
        userId: persona,
        companyId: companyA,
        workGroupId: grupo.id,
        workGroupName: grupo.name,
      })
      const antes = await assignmentsOf(tx, pedido)

      const rechazo = await expectRejectedByDatabase(
        tx,
        `UPDATE "users" SET "company_id" = ${uuidLit(companyB)} WHERE "id" = ${uuidLit(persona)}`,
        'mover de empresa a una persona con una asignacion de grupo',
      )
      expect(rechazo.sqlState).toBe(FOREIGN_KEY_VIOLATION)
      expect(rechazo.constraint).toBe(FK_GRUPO)

      // Ni la persona se movio, ni quedo ninguna asignacion desincronizada.
      const despues = await tx.user.findUniqueOrThrow({
        where: { id: persona },
        select: { companyId: true },
      })
      expect(despues.companyId).toBe(companyA)
      expect(await assignmentsOf(tx, pedido)).toEqual(antes)
      expect(await desyncedAssignments(tx)).toBe(0)
    })
  })

  it('R12: rechaza cambiar de empresa a un grupo ya aplicado a un pedido', async () => {
    // El sentido simetrico: la cascada llega a la asignacion y la FK de la PERSONA es la que
    // deja de casar.
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA, companyB } = fixture
      const pedido = await createOrder(fixture)
      const persona = await createUser(fixture, companyA)
      const grupo = await createWorkGroup(tx, companyA)
      await assign(tx, {
        orderId: pedido,
        userId: persona,
        companyId: companyA,
        workGroupId: grupo.id,
        workGroupName: grupo.name,
      })
      const antes = await assignmentsOf(tx, pedido)

      const rechazo = await expectRejectedByDatabase(
        tx,
        `UPDATE "work_groups" SET "company_id" = ${uuidLit(companyB)} WHERE "id" = ${uuidLit(grupo.id)}`,
        'mover de empresa a un grupo ya aplicado',
      )
      expect(rechazo.sqlState).toBe(FOREIGN_KEY_VIOLATION)
      expect(rechazo.constraint).toBe(FK_PERSONA)

      const despues = await tx.workGroup.findUniqueOrThrow({
        where: { id: grupo.id },
        select: { companyId: true },
      })
      expect(despues.companyId).toBe(companyA)
      expect(await assignmentsOf(tx, pedido)).toEqual(antes)
      expect(await desyncedAssignments(tx)).toBe(0)
    })
  })

  it('R12: acepta mover de empresa a un grupo sin aplicar y a una persona sin asignaciones', async () => {
    // La otra cara de R12: lo que la base bloquea es la DESINCRONIZACION, no el `UPDATE`.
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA, companyB } = fixture
      const grupoSinAplicar = await createWorkGroup(tx, companyA)
      const personaSinAsignar = await createUser(fixture, companyA)

      await tx.workGroup.update({
        where: { id: grupoSinAplicar.id },
        data: { companyId: companyB },
      })
      await tx.user.update({ where: { id: personaSinAsignar }, data: { companyId: companyB } })

      expect(
        (await tx.workGroup.findUniqueOrThrow({ where: { id: grupoSinAplicar.id } })).companyId,
      ).toBe(companyB)
      expect((await tx.user.findUniqueOrThrow({ where: { id: personaSinAsignar } })).companyId).toBe(
        companyB,
      )
      expect(await desyncedAssignments(tx)).toBe(0)
    })
  })
})

// ===========================================================================
// R13 — el caso legitimo: la asignacion SUELTA
// ===========================================================================

describe('la asignacion suelta, sin ningun grupo', () => {
  it('R13: acepta la asignacion sin grupo cuya empresa es la de su persona', async () => {
    // Es el caso que el modo de coincidencia estricto MATARIA: con `work_group_id IS NULL` la FK
    // compuesta del grupo NO SE EVALUA y la fila entra. Si alguien lo escribe, este `create`
    // empieza a fallar con 23503 y el caso cae.
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA } = fixture
      const pedido = await createOrder(fixture)
      const persona = await createUser(fixture, companyA)

      await assign(tx, { orderId: pedido, userId: persona, companyId: companyA })

      const filas = await assignmentsOf(tx, pedido)
      expect(filas).toHaveLength(1)
      expect(filas[0]).toMatchObject({
        userId: persona,
        companyId: companyA,
        workGroupId: null,
        workGroupName: null,
      })
      expect(await desyncedAssignments(tx)).toBe(0)
    })
  })

  it('R13: rechaza la asignacion sin grupo cuya empresa no es la de su persona', async () => {
    // La otra mitad: que no haya grupo NO afloja la coherencia de empresa de la persona. Si la
    // FK de la persona se convierte en simple, este `INSERT` se acepta y el caso cae.
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA, companyB } = fixture
      const pedido = await createOrder(fixture)
      const personaDeA = await createUser(fixture, companyA)

      const rechazo = await expectRejectedByDatabase(
        tx,
        insertAssignmentSql({ order_id: pedido, user_id: personaDeA, company_id: companyB }),
        'asignacion suelta con la empresa ajena a su persona',
      )
      expect(rechazo.sqlState).toBe(FOREIGN_KEY_VIOLATION)
      expect(rechazo.constraint).toBe(FK_PERSONA)
      expect(await tx.orderAssignment.count({ where: { orderId: pedido } })).toBe(0)
    })
  })
})

// ===========================================================================
// R3, R4 — cuantas veces y cuantos
// ===========================================================================

describe('la misma persona en el mismo pedido', () => {
  it('R3: rechaza asignar dos veces a la misma persona al mismo pedido', async () => {
    // Contra la PK compuesta `(order_id, user_id)`, no contra un SELECT previo.
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA } = fixture
      const pedido = await createOrder(fixture)
      const persona = await createUser(fixture, companyA)
      await assign(tx, { orderId: pedido, userId: persona, companyId: companyA })

      const rechazo = await expectRejectedByDatabase(
        tx,
        insertAssignmentSql({ order_id: pedido, user_id: persona, company_id: companyA }),
        'la misma persona dos veces en el mismo pedido',
      )
      expect(rechazo.sqlState).toBe(UNIQUE_VIOLATION)
      expect(rechazo.constraint).toBe(PK_ASIGNACION)

      expect(await tx.orderAssignment.count({ where: { orderId: pedido } })).toBe(1)
    })
  })

  it('R3: rechaza la segunda llegada venga con un grupo o con otro grupo distinto', async () => {
    // Decision cerrada 3, «gana el primero que la trajo»: la PK no distingue el camino. Primero
    // suelta y luego dentro de un grupo; y primero dentro de un grupo y luego dentro de OTRO.
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA } = fixture
      const turnoNoche = await createWorkGroup(tx, companyA)
      const planta2 = await createWorkGroup(tx, companyA)

      // (a) la primera era SUELTA y la segunda llega dentro de un grupo.
      const pedidoA = await createOrder(fixture)
      const ana = await createUser(fixture, companyA)
      await assign(tx, { orderId: pedidoA, userId: ana, companyId: companyA })
      const conGrupo = await expectRejectedByDatabase(
        tx,
        insertAssignmentSql({
          order_id: pedidoA,
          user_id: ana,
          company_id: companyA,
          work_group_id: turnoNoche.id,
          work_group_name: turnoNoche.name,
        }),
        'segunda llegada de la misma persona dentro de un grupo',
      )
      expect(conGrupo.sqlState).toBe(UNIQUE_VIOLATION)
      expect(conGrupo.constraint).toBe(PK_ASIGNACION)
      // La que queda es la PRIMERA, y sigue suelta.
      const filasA = await assignmentsOf(tx, pedidoA)
      expect(filasA).toHaveLength(1)
      expect(filasA[0]).toMatchObject({ userId: ana, workGroupId: null, workGroupName: null })

      // (b) la primera vino en un grupo y la segunda llega dentro de OTRO grupo.
      const pedidoB = await createOrder(fixture)
      const luis = await createUser(fixture, companyA)
      await assign(tx, {
        orderId: pedidoB,
        userId: luis,
        companyId: companyA,
        workGroupId: turnoNoche.id,
        workGroupName: turnoNoche.name,
      })
      const conOtroGrupo = await expectRejectedByDatabase(
        tx,
        insertAssignmentSql({
          order_id: pedidoB,
          user_id: luis,
          company_id: companyA,
          work_group_id: planta2.id,
          work_group_name: planta2.name,
        }),
        'segunda llegada de la misma persona dentro de otro grupo',
      )
      expect(conOtroGrupo.sqlState).toBe(UNIQUE_VIOLATION)
      expect(conOtroGrupo.constraint).toBe(PK_ASIGNACION)
      const filasB = await assignmentsOf(tx, pedidoB)
      expect(filasB).toHaveLength(1)
      expect(filasB[0]).toMatchObject({ userId: luis, workGroupId: turnoNoche.id })
    })
  })

  it('R4: acepta un pedido con varias personas y una persona en varios pedidos', async () => {
    // La base no limita ni una cosa ni la otra.
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA } = fixture
      const pedido1 = await createOrder(fixture)
      const pedido2 = await createOrder(fixture)
      const ana = await createUser(fixture, companyA)
      const luis = await createUser(fixture, companyA)

      await assign(tx, { orderId: pedido1, userId: ana, companyId: companyA })
      await assign(tx, { orderId: pedido1, userId: luis, companyId: companyA })
      await assign(tx, { orderId: pedido2, userId: ana, companyId: companyA })

      const delPedido1 = await assignmentsOf(tx, pedido1)
      expect(delPedido1.map((fila) => fila.userId).sort()).toEqual([ana, luis].sort())

      const deAna = await tx.orderAssignment.findMany({
        where: { userId: ana },
        select: { orderId: true },
      })
      expect(deAna.map((fila) => fila.orderId).sort()).toEqual([pedido1, pedido2].sort())
    })
  })
})

// ===========================================================================
// R1, R2 — las tres referencias son obligatorias y el pedido tiene que existir
// ===========================================================================

describe('las tres referencias de la asignacion', () => {
  it('R1: rechaza la asignacion a la que le falta el pedido, la persona o la empresa', async () => {
    // Cada vuelta omite UNA y solo una columna, y el diagnostico devuelve exactamente esa: no
    // hay forma de que el 23502 venga de otra.
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA } = fixture
      const pedido = await createOrder(fixture)
      const persona = await createUser(fixture, companyA)
      const completa = { order_id: pedido, user_id: persona, company_id: companyA }

      for (const omitida of ['order_id', 'user_id', 'company_id'] as const) {
        const parcial: AssignmentColumns = { ...completa }
        delete parcial[omitida]

        const rechazo = await expectRejectedByDatabase(
          tx,
          insertAssignmentSql(parcial),
          `asignacion sin "${omitida}"`,
        )
        expect(rechazo.sqlState, `omitiendo "${omitida}"`).toBe(NOT_NULL_VIOLATION)
        expect(rechazo.column, `omitiendo "${omitida}"`).toBe(omitida)
        expect(await tx.orderAssignment.count({ where: { orderId: pedido } })).toBe(0)
      }
    })
  })

  it('R2: rechaza la asignacion cuyo pedido no existe', async () => {
    // La FK del pedido es COMPUESTA desde QC-60 y apunta a `orders(id, company_id)`: la pareja con
    // el uuid inventado no esta.
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA } = fixture
      const persona = await createUser(fixture, companyA)
      const pedidoFantasma = randomUUID()

      const rechazo = await expectRejectedByDatabase(
        tx,
        insertAssignmentSql({
          order_id: pedidoFantasma,
          user_id: persona,
          company_id: companyA,
        }),
        'asignacion con un pedido inexistente',
      )
      expect(rechazo.sqlState).toBe(FOREIGN_KEY_VIOLATION)
      expect(rechazo.constraint).toBe(FK_ORDEN)
      expect(await tx.orderAssignment.count({ where: { userId: persona } })).toBe(0)
    })
  })
})

// ===========================================================================
// R6, R7 — el grupo y su nombre congelado existen el uno por el otro
// ===========================================================================

describe('el grupo y su nombre congelado', () => {
  it('R7: rechaza el grupo sin nombre congelado y el nombre congelado sin grupo', async () => {
    // Las dos ramas del CHECK `order_assignments_work_group_name_matches_group`, y tambien AL
    // MODIFICAR: R7 dice «tanto al insertar como al modificar».
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA } = fixture
      const pedido = await createOrder(fixture)
      const persona = await createUser(fixture, companyA)
      const otraPersona = await createUser(fixture, companyA)
      const grupo = await createWorkGroup(tx, companyA)

      const sinNombre = await expectRejectedByDatabase(
        tx,
        insertAssignmentSql({
          order_id: pedido,
          user_id: persona,
          company_id: companyA,
          work_group_id: grupo.id,
        }),
        'asignacion con grupo y sin nombre congelado',
      )
      expect(sinNombre.sqlState).toBe(CHECK_VIOLATION)
      expect(sinNombre.constraint).toBe(CHECK_GRUPO_Y_NOMBRE)

      const sinGrupo = await expectRejectedByDatabase(
        tx,
        insertAssignmentSql({
          order_id: pedido,
          user_id: persona,
          company_id: companyA,
          work_group_name: grupo.name,
        }),
        'asignacion con nombre congelado y sin grupo',
      )
      expect(sinGrupo.sqlState).toBe(CHECK_VIOLATION)
      expect(sinGrupo.constraint).toBe(CHECK_GRUPO_Y_NOMBRE)
      expect(await tx.orderAssignment.count({ where: { orderId: pedido } })).toBe(0)

      // Al MODIFICAR: vaciar solo una de las dos columnas de una fila valida tampoco pasa.
      await assign(tx, {
        orderId: pedido,
        userId: otraPersona,
        companyId: companyA,
        workGroupId: grupo.id,
        workGroupName: grupo.name,
      })
      const alModificar = await expectRejectedByDatabase(
        tx,
        `UPDATE "order_assignments" SET "work_group_name" = NULL
         WHERE "order_id" = ${uuidLit(pedido)}`,
        'dejar la asignacion con grupo y sin nombre congelado',
      )
      expect(alModificar.sqlState).toBe(CHECK_VIOLATION)
      expect(alModificar.constraint).toBe(CHECK_GRUPO_Y_NOMBRE)
    })
  })

  it('R6: acepta las dos columnas juntas y distingue en la fila el origen de la persona', async () => {
    // «Vino de un grupo» NO es una columna aparte: es `work_group_id IS NOT NULL`. Las dos
    // juntas se aceptan, y la suelta se distingue de la que llego dentro de un grupo.
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA } = fixture
      const pedido = await createOrder(fixture)
      const suelta = await createUser(fixture, companyA)
      const deGrupo = await createUser(fixture, companyA)
      const grupo = await createWorkGroup(tx, companyA)

      await assign(tx, { orderId: pedido, userId: suelta, companyId: companyA })
      await assign(tx, {
        orderId: pedido,
        userId: deGrupo,
        companyId: companyA,
        workGroupId: grupo.id,
        workGroupName: grupo.name,
      })

      const filas = await assignmentsOf(tx, pedido)
      expect(filas).toHaveLength(2)
      const laSuelta = filas.find((fila) => fila.userId === suelta)
      const laDeGrupo = filas.find((fila) => fila.userId === deGrupo)
      expect(laSuelta).toMatchObject({ workGroupId: null, workGroupName: null })
      expect(laDeGrupo).toMatchObject({ workGroupId: grupo.id, workGroupName: grupo.name })
    })
  })
})

// ===========================================================================
// R8, R9 — la congelacion: lo que le pase al grupo despues no toca la fila
// ===========================================================================

describe('la congelacion del grupo', () => {
  it('R8: renombrar el grupo despues de asignar no cambia el nombre congelado', async () => {
    // Lo que el CHECK no puede garantizar y este caso si: `work_group_name` es un SNAPSHOT, no
    // una desnormalizacion que un `JOIN` pueda sustituir.
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA } = fixture
      const pedido = await createOrder(fixture)
      const persona = await createUser(fixture, companyA)
      const nombreDeEntonces = `Turno noche ${randomUUID()}`
      const grupo = await createWorkGroup(tx, companyA, nombreDeEntonces)
      await assign(tx, {
        orderId: pedido,
        userId: persona,
        companyId: companyA,
        workGroupId: grupo.id,
        workGroupName: grupo.name,
      })
      const antes = await assignmentsOf(tx, pedido)

      await sleep(20)
      const nombreNuevo = `Turno tarde ${randomUUID()}`
      await tx.workGroup.update({
        where: { id: grupo.id },
        data: { name: nombreNuevo, nameNormalized: normalizeWorkGroupName(nombreNuevo) },
      })

      const despues = await assignmentsOf(tx, pedido)
      expect(despues).toEqual(antes)
      expect(despues[0]?.workGroupName).toBe(nombreDeEntonces)
      expect(despues[0]?.workGroupName).not.toBe(nombreNuevo)
    })
  })

  it('R8: dar de baja el grupo no cambia ninguna columna de la asignacion', async () => {
    // La baja del grupo es un `UPDATE`, y ninguna FK reacciona a un `UPDATE`. Se compara la
    // FILA ENTERA, `updated_at` incluido.
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA } = fixture
      const pedido = await createOrder(fixture)
      const ana = await createUser(fixture, companyA)
      const luis = await createUser(fixture, companyA)
      const grupo = await createWorkGroup(tx, companyA)
      await assign(tx, {
        orderId: pedido,
        userId: ana,
        companyId: companyA,
        workGroupId: grupo.id,
        workGroupName: grupo.name,
      })
      await assign(tx, {
        orderId: pedido,
        userId: luis,
        companyId: companyA,
        workGroupId: grupo.id,
        workGroupName: grupo.name,
      })
      const antes = await assignmentsOf(tx, pedido)
      expect(antes).toHaveLength(2)

      await sleep(20)
      await tx.workGroup.update({ where: { id: grupo.id }, data: { deletedAt: new Date() } })

      expect(await assignmentsOf(tx, pedido)).toEqual(antes)
      expect(
        (await tx.workGroup.findUniqueOrThrow({ where: { id: grupo.id } })).deletedAt,
      ).not.toBeNull()
    })
  })

  it('R9: meter y sacar personas del grupo despues de asignar no crea, borra ni modifica ninguna asignacion', async () => {
    // La lista de responsables del pedido NO se deriva de la pertenencia vigente: se comprueba
    // comparando las dos listas, que acaban siendo DISTINTAS a proposito.
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA } = fixture
      const pedido = await createOrder(fixture)
      const ana = await createUser(fixture, companyA)
      const luis = await createUser(fixture, companyA)
      const nueva = await createUser(fixture, companyA)
      const grupo = await createWorkGroup(tx, companyA)
      await tx.workGroupMember.create({
        data: { workGroupId: grupo.id, userId: ana, companyId: companyA },
      })
      await tx.workGroupMember.create({
        data: { workGroupId: grupo.id, userId: luis, companyId: companyA },
      })
      // Se congela lo que el grupo tenia EN ESE MOMENTO: Ana y Luis.
      await assign(tx, {
        orderId: pedido,
        userId: ana,
        companyId: companyA,
        workGroupId: grupo.id,
        workGroupName: grupo.name,
      })
      await assign(tx, {
        orderId: pedido,
        userId: luis,
        companyId: companyA,
        workGroupId: grupo.id,
        workGroupName: grupo.name,
      })
      const antes = await assignmentsOf(tx, pedido)
      expect(antes.map((fila) => fila.userId).sort()).toEqual([ana, luis].sort())

      await sleep(20)
      // Entra una persona nueva y sale Luis: la pertenencia vigente cambia entera.
      await tx.workGroupMember.create({
        data: { workGroupId: grupo.id, userId: nueva, companyId: companyA },
      })
      await tx.workGroupMember.delete({
        where: { workGroupId_userId: { workGroupId: grupo.id, userId: luis } },
      })

      // Ni una fila creada, ni una borrada, ni una columna distinta.
      expect(await assignmentsOf(tx, pedido)).toEqual(antes)
      expect(await tx.orderAssignment.count({ where: { userId: nueva } })).toBe(0)
      expect(await tx.orderAssignment.count({ where: { orderId: pedido, userId: luis } })).toBe(1)

      // Y las dos listas ya NO coinciden, que es justo lo que dice R9.
      const pertenenciaVigente = await tx.workGroupMember.findMany({
        where: { workGroupId: grupo.id },
        select: { userId: true },
      })
      expect(pertenenciaVigente.map((fila) => fila.userId).sort()).toEqual([ana, nueva].sort())
      expect(antes.map((fila) => fila.userId).sort()).not.toEqual(
        pertenenciaVigente.map((fila) => fila.userId).sort(),
      )
    })
  })
})

// ===========================================================================
// R10, R20, R22 — los tres RESTRICT
// ===========================================================================

describe('el borrado fisico de los tres padres', () => {
  it('R10: rechaza borrar fisicamente un grupo con asignaciones, y grupo y filas quedan intactos', async () => {
    // `ON DELETE RESTRICT`, y aqui es DISTINTO de QC-83: alli la pertenencia iba en CASCADE
    // porque ES parte del grupo; aqui la asignacion es un hecho congelado DEL PEDIDO.
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA } = fixture
      const pedido = await createOrder(fixture)
      const persona = await createUser(fixture, companyA)
      const grupo = await createWorkGroup(tx, companyA)
      await assign(tx, {
        orderId: pedido,
        userId: persona,
        companyId: companyA,
        workGroupId: grupo.id,
        workGroupName: grupo.name,
      })
      const antes = await assignmentsOf(tx, pedido)

      const rechazo = await expectRejectedByDatabase(
        tx,
        `DELETE FROM "work_groups" WHERE "id" = ${uuidLit(grupo.id)}`,
        'borrado fisico de un grupo con asignaciones',
      )
      expect(rechazo.sqlState).toBe(FOREIGN_KEY_VIOLATION)
      expect(rechazo.constraint).toBe(FK_GRUPO)

      expect(await tx.workGroup.findUnique({ where: { id: grupo.id } })).not.toBeNull()
      expect(await assignmentsOf(tx, pedido)).toEqual(antes)
    })
  })

  it('R20: rechaza borrar fisicamente un pedido con asignaciones, y pedido y filas quedan intactos', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA } = fixture
      const pedido = await createOrder(fixture)
      const persona = await createUser(fixture, companyA)
      await assign(tx, { orderId: pedido, userId: persona, companyId: companyA })
      const antes = await assignmentsOf(tx, pedido)
      const pedidoAntes = await tx.order.findUniqueOrThrow({ where: { id: pedido } })

      const rechazo = await expectRejectedByDatabase(
        tx,
        `DELETE FROM "orders" WHERE "id" = ${uuidLit(pedido)}`,
        'borrado fisico de un pedido con asignaciones',
      )
      expect(rechazo.sqlState).toBe(FOREIGN_KEY_VIOLATION)
      expect(rechazo.constraint).toBe(FK_ORDEN)

      expect(await tx.order.findUniqueOrThrow({ where: { id: pedido } })).toEqual(pedidoAntes)
      expect(await assignmentsOf(tx, pedido)).toEqual(antes)
    })
  })

  it('R22: rechaza borrar fisicamente a una persona con asignaciones, y persona y filas quedan intactas', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA } = fixture
      const pedido = await createOrder(fixture)
      const persona = await createUser(fixture, companyA)
      await assign(tx, { orderId: pedido, userId: persona, companyId: companyA })
      const antes = await assignmentsOf(tx, pedido)
      const personaAntes = await tx.user.findUniqueOrThrow({ where: { id: persona } })

      const rechazo = await expectRejectedByDatabase(
        tx,
        `DELETE FROM "users" WHERE "id" = ${uuidLit(persona)}`,
        'borrado fisico de una persona con asignaciones',
      )
      expect(rechazo.sqlState).toBe(FOREIGN_KEY_VIOLATION)
      expect(rechazo.constraint).toBe(FK_PERSONA)

      expect(await tx.user.findUniqueOrThrow({ where: { id: persona } })).toEqual(personaAntes)
      expect(await assignmentsOf(tx, pedido)).toEqual(antes)
    })
  })
})

// ===========================================================================
// R15, R16, R17, R18 — quitar responsables
// ===========================================================================

describe('quitar a una persona del pedido', () => {
  it('R15: elimina fisicamente la fila y no deja ningun rastro', async () => {
    // Es la EXCEPCION EXPLICITA al borrado logico (decision cerrada 5). Ademas se enumeran las
    // columnas de la tabla: no hay `deleted_at` ni ninguna otra donde pudiera quedar el rastro.
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA } = fixture
      const pedido = await createOrder(fixture)
      const persona = await createUser(fixture, companyA)
      await assign(tx, { orderId: pedido, userId: persona, companyId: companyA })
      expect(await tx.orderAssignment.count({ where: { orderId: pedido } })).toBe(1)

      await tx.orderAssignment.delete({
        where: { orderId_userId: { orderId: pedido, userId: persona } },
      })

      expect(await tx.orderAssignment.count({ where: { orderId: pedido } })).toBe(0)
      expect(await tx.orderAssignment.count({ where: { userId: persona } })).toBe(0)
      const crudo = await tx.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM "order_assignments"
        WHERE "order_id" = CAST(${pedido} AS uuid)`
      expect(crudo[0]?.n).toBe(0)

      const columnas = await tx.$queryRaw<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'order_assignments'
        ORDER BY column_name`
      expect(columnas.map((columna) => columna.column_name)).toEqual([
        'company_id',
        'created_at',
        'order_id',
        'updated_at',
        'user_id',
        'work_group_id',
        'work_group_name',
      ])
    })
  })

  it('R16: borrar una sola fila de un grupo deja las demas de ese grupo intactas', async () => {
    // Se puede sacar a UNA persona que vino dentro de un grupo: el pedido queda con el grupo
    // aplicado pero sin ella. Se compara la FILA ENTERA de las que quedan.
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA } = fixture
      const pedido = await createOrder(fixture)
      const grupo = await createWorkGroup(tx, companyA)
      const ana = await createUser(fixture, companyA)
      const luis = await createUser(fixture, companyA)
      const marta = await createUser(fixture, companyA)
      for (const persona of [ana, luis, marta]) {
        await assign(tx, {
          orderId: pedido,
          userId: persona,
          companyId: companyA,
          workGroupId: grupo.id,
          workGroupName: grupo.name,
        })
      }
      const antes = await assignmentsOf(tx, pedido)
      const esperadas = antes.filter((fila) => fila.userId !== ana)

      await sleep(20)
      await tx.orderAssignment.delete({
        where: { orderId_userId: { orderId: pedido, userId: ana } },
      })

      const despues = await assignmentsOf(tx, pedido)
      expect(despues).toEqual(esperadas)
      expect(despues).toHaveLength(2)
      expect(await tx.orderAssignment.count({ where: { orderId: pedido, userId: ana } })).toBe(0)
    })
  })

  it('R17: borrar por pedido y grupo se lleva solo las de ese grupo, ni las sueltas ni las de otro grupo', async () => {
    // El grupo se identifica SOLO con columnas de la propia fila: `work_group_id`.
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA } = fixture
      const pedido = await createOrder(fixture)
      const turnoNoche = await createWorkGroup(tx, companyA)
      const planta2 = await createWorkGroup(tx, companyA)
      const deTurno = await createUser(fixture, companyA)
      const dePlanta = await createUser(fixture, companyA)
      const suelta = await createUser(fixture, companyA)
      await assign(tx, {
        orderId: pedido,
        userId: deTurno,
        companyId: companyA,
        workGroupId: turnoNoche.id,
        workGroupName: turnoNoche.name,
      })
      await assign(tx, {
        orderId: pedido,
        userId: dePlanta,
        companyId: companyA,
        workGroupId: planta2.id,
        workGroupName: planta2.name,
      })
      await assign(tx, { orderId: pedido, userId: suelta, companyId: companyA })
      const antes = await assignmentsOf(tx, pedido)
      const esperadas = antes.filter((fila) => fila.userId !== deTurno)

      const borradas = await tx.orderAssignment.deleteMany({
        where: { orderId: pedido, workGroupId: turnoNoche.id },
      })
      expect(borradas.count).toBe(1)

      const despues = await assignmentsOf(tx, pedido)
      expect(despues).toEqual(esperadas)
      expect(despues.map((fila) => fila.userId).sort()).toEqual([dePlanta, suelta].sort())
    })
  })

  it('R18: un pedido sin asignaciones existe, y borrar la ultima no cambia ni una columna del pedido', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA } = fixture
      // Un pedido que nunca tuvo responsables existe igual: es el estado de todos los que ya hay.
      const sinNadie = await createOrder(fixture)
      expect(await tx.order.findUnique({ where: { id: sinNadie } })).not.toBeNull()
      expect(await tx.orderAssignment.count({ where: { orderId: sinNadie } })).toBe(0)

      const pedido = await createOrder(fixture)
      const persona = await createUser(fixture, companyA)
      await assign(tx, { orderId: pedido, userId: persona, companyId: companyA })
      const antes = await tx.order.findUniqueOrThrow({ where: { id: pedido } })

      await sleep(20)
      await tx.orderAssignment.delete({
        where: { orderId_userId: { orderId: pedido, userId: persona } },
      })

      // Ni borrado, ni dado de baja, ni modificado: la fila entera es la misma.
      const despues = await tx.order.findUniqueOrThrow({ where: { id: pedido } })
      expect(despues).toEqual(antes)
      expect(despues.deletedAt).toBeNull()
      expect(await tx.orderAssignment.count({ where: { orderId: pedido } })).toBe(0)
    })
  })
})

// ===========================================================================
// R19, R21 — las dos bajas logicas no tocan las asignaciones
// ===========================================================================

describe('las bajas logicas no tocan las asignaciones', () => {
  it('R19: dar de baja el pedido conserva intactas todas sus asignaciones', async () => {
    // Dar de baja es un `UPDATE`, y ninguna FK reacciona a un `UPDATE`: las asignaciones se
    // quedan sin que nadie haga nada. La asignacion es parte de la historia del pedido.
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA } = fixture
      const pedido = await createOrder(fixture)
      const ana = await createUser(fixture, companyA)
      const luis = await createUser(fixture, companyA)
      await assign(tx, { orderId: pedido, userId: ana, companyId: companyA })
      await assign(tx, { orderId: pedido, userId: luis, companyId: companyA })
      const antes = await assignmentsOf(tx, pedido)
      expect(antes).toHaveLength(2)

      await sleep(20)
      await tx.order.update({ where: { id: pedido }, data: { deletedAt: new Date() } })

      expect(await assignmentsOf(tx, pedido)).toEqual(antes)
      expect((await tx.order.findUniqueOrThrow({ where: { id: pedido } })).deletedAt).not.toBeNull()
    })
  })

  it('R21: dar de baja a una persona, o dejarla inactive o blocked, conserva sus asignaciones', async () => {
    // Decision cerrada 9: la persona de baja sigue siendo responsable y quien LEE la filtra.
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA } = fixture
      const pedido1 = await createOrder(fixture)
      const pedido2 = await createOrder(fixture)
      const persona = await createUser(fixture, companyA)
      await assign(tx, { orderId: pedido1, userId: persona, companyId: companyA })
      await assign(tx, { orderId: pedido2, userId: persona, companyId: companyA })

      const antes = await tx.orderAssignment.findMany({
        where: { userId: persona },
        orderBy: { orderId: 'asc' },
      })
      expect(antes).toHaveLength(2)

      await sleep(20)
      // Los tres estados de «esta persona ya no deberia entrar», uno detras de otro.
      await tx.user.update({ where: { id: persona }, data: { accountStatus: 'inactive' } })
      await tx.user.update({ where: { id: persona }, data: { accountStatus: 'blocked' } })
      await tx.user.update({ where: { id: persona }, data: { deletedAt: new Date() } })

      const despues = await tx.orderAssignment.findMany({
        where: { userId: persona },
        orderBy: { orderId: 'asc' },
      })
      expect(despues).toEqual(antes)

      // Y reactivarla la devuelve a sus pedidos sin ninguna escritura adicional.
      await tx.user.update({
        where: { id: persona },
        data: { deletedAt: null, accountStatus: 'active' },
      })
      const reactivada = await tx.orderAssignment.findMany({
        where: { userId: persona },
        orderBy: { orderId: 'asc' },
      })
      expect(reactivada).toEqual(antes)
    })
  })
})

// ===========================================================================
// R23 — las marcas de tiempo
// ===========================================================================

describe('las marcas de tiempo de la asignacion', () => {
  it('R23: created_at y updated_at se rellenan solos y el segundo cambia al modificar la fila', async () => {
    // Nunca se pasan: los ponen el DEFAULT de la base y el `@updatedAt` de Prisma.
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA } = fixture
      const pedido = await createOrder(fixture)
      const persona = await createUser(fixture, companyA)
      const grupo = await createWorkGroup(tx, companyA)

      const creada = await tx.orderAssignment.create({
        data: {
          orderId: pedido,
          userId: persona,
          companyId: companyA,
          workGroupId: grupo.id,
          workGroupName: grupo.name,
        },
      })
      expect(creada.createdAt).toBeInstanceOf(Date)
      expect(creada.updatedAt).toBeInstanceOf(Date)

      await sleep(20)
      const modificada = await tx.orderAssignment.update({
        where: { orderId_userId: { orderId: pedido, userId: persona } },
        data: { workGroupName: `${grupo.name} (corregido)` },
      })
      expect(modificada.createdAt.getTime()).toBe(creada.createdAt.getTime())
      expect(modificada.updatedAt.getTime()).toBeGreaterThan(creada.updatedAt.getTime())
    })
  })
})
