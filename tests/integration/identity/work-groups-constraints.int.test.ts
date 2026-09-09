/**
 * QC-83 (T8) — Tests de integracion del MODELO de grupos de trabajo contra una base
 * Postgres REAL, con la migracion `20260908210000_work_groups_and_members` aplicada.
 *
 * Es el unico sitio donde se demuestran R14, R15 y R16 —los `23503`/`23505` de verdad—, y
 * tambien R1, R2, R4, R5, R6, R7, R8, R9, R10, R11, R13, R17, R18, R19, R20 y R21
 * (`design.md > 6`). Lo que vigila el SQL escrito —que las FK sean COMPUESTAS, que el indice
 * del nombre sea parcial y funcional, que no haya `deleted_at` en la pertenencia— es el test
 * de esquema; lo que se comprueba AQUI es lo que la base HACE cuando alguien lo intenta.
 *
 * AISLAMIENTO — cada `it` corre dentro de `prisma.$transaction` interactiva y termina
 * lanzando `RollbackSignal`, lo que hace que Prisma emita `ROLLBACK`: ninguna fila escrita
 * por un test sobrevive, y por eso los tests son repetibles e independientes del orden. Se
 * usa la transaccion interactiva de Prisma (y no un cliente `pg` aparte) porque asi se
 * ejercita EXACTAMENTE el camino de datos de la app y porque el SQL crudo dentro de la misma
 * transaccion comparte conexion, y por tanto aislamiento. Mismo patron que
 * `identity-constraints.int.test.ts`.
 *
 * LAS DOS EMPRESAS — la ficha entera trata de que la persona de la empresa A no acabe en un
 * grupo de la empresa B, asi que cada transaccion fabrica DOS empresas efimeras propias, con
 * nombre irrepetible (`randomUUID`). NUNCA se usa la empresa de instalacion que siembra QC-6:
 * `companies_name_unique` es GLOBAL y el alta chocaria con ella. Los usuarios y los roles se
 * fabrican tambien dentro de la transaccion, por lo mismo.
 *
 * SAVEPOINTS — un error de constraint aborta la transaccion de Postgres entera, y casi todos
 * los requisitos de aqui exigen mirar el estado DESPUES del rechazo («no crear ni modificar
 * ninguna fila», «ninguna fila con la empresa desincronizada»). Por eso toda operacion que se
 * espera que falle va envuelta en un `SAVEPOINT` y se deshace con `ROLLBACK TO SAVEPOINT`,
 * que deja la transaccion viva y permite seguir consultando.
 *
 * SQL CRUDO, Y POR QUE PASA POR `pg_temp.qc83_try` — las operaciones que se espera que fallen
 * se escriben en SQL crudo a proposito: (1) omitir una columna obligatoria no se puede
 * expresar con la API tipada (no compilaria) y (2) hace falta el error de Postgres SIN
 * traducir. Y se ejecutan a traves de una funcion PL/pgSQL efimera —creada dentro de la
 * propia transaccion, asi que muere con ella— porque su bloque `EXCEPTION` puede leer
 * `GET STACKED DIAGNOSTICS`: de ahi salen `RETURNED_SQLSTATE`, `CONSTRAINT_NAME` y
 * `COLUMN_NAME` como CAMPOS, no como texto. Esa es la diferencia con QC-4/QC-47, que solo
 * podian afirmar sobre el SQLSTATE: el cliente Prisma propaga unicamente el DETAIL del error
 * («Ya existe la llave (name)=(x)»), donde el nombre del indice no aparece, y el mensaje
 * ademas viene traducido al idioma del servidor. Aqui cada caso afirma contra la RESTRICCION
 * CONCRETA —`work_group_members_user_id_fkey`, `work_groups_name_unique`,
 * `work_group_members_pkey`— y no contra «algo fallo», que es lo que pide T8. Los caminos
 * felices y las lecturas van con la API tipada de Prisma.
 */
import { randomUUID } from 'node:crypto'

import { Prisma } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '@/lib/shared/db/prisma'
import {
  DOCUMENT_TYPE_CC,
  normalizeCompanyName,
  normalizeWorkGroupName,
} from '@/lib/modules/identity'

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

/** Las dos empresas del caso, y un rol para colgar de el a las personas que se creen. */
interface Fixture {
  readonly tx: Prisma.TransactionClient
  /** Empresa A: la «propia» en casi todos los casos. */
  readonly companyA: string
  /** Empresa B: la ajena, con la que se construye la fila cruzada de R14. */
  readonly companyB: string
  readonly roleId: string
}

/**
 * La funcion efimera que ejecuta una sentencia y, si Postgres la rechaza, devuelve el
 * diagnostico ESTRUCTURADO en vez de propagar un mensaje traducido. El bloque `EXCEPTION` de
 * PL/pgSQL abre su propio savepoint implicito, asi que al volver la transaccion sigue viva y
 * la sentencia fallida no dejo nada escrito. Vive en `pg_temp`, se crea dentro de la
 * transaccion del test y desaparece con ella.
 */
const CREATE_TRY_FUNCTION = `
  CREATE OR REPLACE FUNCTION pg_temp.qc83_try(stmt text) RETURNS text AS $qc83fn$
  DECLARE
    v_state text; v_constraint text; v_column text;
  BEGIN
    EXECUTE stmt;
    RETURN 'ACEPTADO||';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS
      v_state = RETURNED_SQLSTATE, v_constraint = CONSTRAINT_NAME, v_column = COLUMN_NAME;
    RETURN v_state || '|' || coalesce(v_constraint, '') || '|' || coalesce(v_column, '');
  END $qc83fn$ LANGUAGE plpgsql`

/** Ejecuta el cuerpo del test en una transaccion que SIEMPRE termina en ROLLBACK. */
async function inRolledBackTransaction(body: (fixture: Fixture) => Promise<void>): Promise<void> {
  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(CREATE_TRY_FUNCTION)
        // Las dos empresas y el rol nacen AQUI, antes del cuerpo, y nunca dentro de un
        // `SAVEPOINT` que luego se deshaga: si desaparecieran mientras su id sigue en una
        // variable, el siguiente alta fallaria con un 23503 que no mide lo que el caso quiere.
        const companyA = await createCompany(tx, 'empresa-a')
        const companyB = await createCompany(tx, 'empresa-b')
        const roleId = await createRole(tx)
        await body({ tx, companyA, companyB, roleId })
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
  const savepoint = `sp_wg_${String(savepointSeq)}`
  await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`)
  const rows = await tx.$queryRawUnsafe<{ r: string }[]>(
    `SELECT pg_temp.qc83_try($qc83stmt$${sql}$qc83stmt$) AS r`,
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
// Datos de apoyo
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
    data: { name: `rol-qc83-${randomUUID()}`, description: 'Rol de prueba' },
  })
  return role.id
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
 * contrato del modulo (R3): el test no reimplementa la normalizacion, la importa.
 */
async function createWorkGroup(
  tx: Prisma.TransactionClient,
  companyId: string,
  name = `Turno noche ${randomUUID()}`,
  deletedAt: Date | null = null,
): Promise<string> {
  const group = await tx.workGroup.create({
    data: {
      name,
      nameNormalized: normalizeWorkGroupName(name),
      companyId,
      ...(deletedAt === null ? {} : { deletedAt }),
    },
    select: { id: true },
  })
  return group.id
}

/** Mete a una persona en un grupo por el camino feliz (API tipada). */
async function addMember(
  tx: Prisma.TransactionClient,
  workGroupId: string,
  userId: string,
  companyId: string,
): Promise<void> {
  await tx.workGroupMember.create({ data: { workGroupId, userId, companyId } })
}

/** Saca a una persona de un grupo por el camino feliz: `DELETE`, no baja logica (R18). */
async function removeMember(
  tx: Prisma.TransactionClient,
  workGroupId: string,
  userId: string,
): Promise<void> {
  await tx.workGroupMember.delete({ where: { workGroupId_userId: { workGroupId, userId } } })
}

/**
 * `INSERT INTO work_group_members` crudo. Omitir una clave del objeto es exactamente el caso
 * «falta un dato obligatorio» (R13), que la API tipada no deja ni escribir. `updated_at` se
 * pone siempre porque es NOT NULL sin default de base: lo rellena `@updatedAt` del cliente.
 */
function insertMemberSql(columns: {
  work_group_id?: string
  user_id?: string
  company_id?: string
}): string {
  const entries = Object.entries(columns).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  )
  const names = [...entries.map(([name]) => `"${name}"`), '"updated_at"']
  const values = [...entries.map(([, value]) => uuidLit(value)), 'CURRENT_TIMESTAMP']
  return `INSERT INTO "work_group_members" (${names.join(', ')}) VALUES (${values.join(', ')})`
}

/** `INSERT INTO work_groups` crudo, por lo mismo: omitir `name` o `company_id` a voluntad. */
function insertWorkGroupSql(values: {
  name?: string
  nameNormalized: string
  companyId?: string
}): string {
  const names = ['"name_normalized"', '"updated_at"']
  const data = [lit(values.nameNormalized), 'CURRENT_TIMESTAMP']

  if (values.name !== undefined) {
    names.push('"name"')
    data.push(lit(values.name))
  }
  if (values.companyId !== undefined) {
    names.push('"company_id"')
    data.push(uuidLit(values.companyId))
  }

  return `INSERT INTO "work_groups" (${names.join(', ')}) VALUES (${data.join(', ')})`
}

/**
 * Cuantas pertenencias tienen la empresa DESINCRONIZADA de la de su grupo o de la de su
 * persona. Es la mitad de R15 que no se ve en el SQLSTATE: no basta con que el `UPDATE`
 * falle, tiene que no quedar ninguna fila cruzada.
 */
async function desyncedMemberships(tx: Prisma.TransactionClient): Promise<number> {
  const rows = await tx.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n
    FROM "work_group_members" m
    JOIN "work_groups" g ON g."id" = m."work_group_id"
    JOIN "users" u ON u."id" = m."user_id"
    WHERE m."company_id" <> g."company_id" OR m."company_id" <> u."company_id"`
  return rows[0]?.n ?? -1
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------

beforeAll(async () => {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename IN ('work_groups', 'work_group_members')`
  if (tables.length !== 2) {
    throw new Error(
      'la base de pruebas no tiene aplicada la migracion de grupos de trabajo (QC-83). ' +
        'Corre `pnpm run db:migrate` antes de estos tests.',
    )
  }
})

afterAll(async () => {
  await prisma.$disconnect()
})

// ===========================================================================
// R14 — EL CORAZON: la fila cruzada la rechaza POSTGRES
// ===========================================================================

describe('la persona de una empresa no entra en el grupo de otra', () => {
  it('rechaza la pertenencia de una persona de la empresa B a un grupo de la empresa A', async () => {
    // R14 — con `company_id` = la del GRUPO, la FK que no puede casar es la de la persona:
    // la pareja `(user_id, company_id)` no existe en `users(id, company_id)`.
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA, companyB } = fixture
      const grupoDeA = await createWorkGroup(tx, companyA)
      const personaDeB = await createUser(fixture, companyB)

      const rechazo = await expectRejectedByDatabase(
        tx,
        insertMemberSql({
          work_group_id: grupoDeA,
          user_id: personaDeB,
          company_id: companyA,
        }),
        'pertenencia con grupo de la empresa A y persona de la empresa B',
      )
      expect(rechazo.sqlState).toBe(FOREIGN_KEY_VIOLATION)
      expect(rechazo.constraint).toBe('work_group_members_user_id_fkey')

      // "no crear ni modificar ninguna fila".
      expect(await tx.workGroupMember.count({ where: { workGroupId: grupoDeA } })).toBe(0)
    })
  })

  it('rechaza la misma pertenencia cruzada declarando la empresa de la persona', async () => {
    // R14, el otro sentido: con `company_id` = la de la PERSONA, la que no casa es la FK del
    // grupo. Se escriben los dos porque cada uno prueba una FK compuesta distinta.
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA, companyB } = fixture
      const grupoDeA = await createWorkGroup(tx, companyA)
      const personaDeB = await createUser(fixture, companyB)

      const rechazo = await expectRejectedByDatabase(
        tx,
        insertMemberSql({
          work_group_id: grupoDeA,
          user_id: personaDeB,
          company_id: companyB,
        }),
        'pertenencia cruzada declarando la empresa de la persona',
      )
      expect(rechazo.sqlState).toBe(FOREIGN_KEY_VIOLATION)
      expect(rechazo.constraint).toBe('work_group_members_work_group_id_fkey')
      expect(await tx.workGroupMember.count({ where: { workGroupId: grupoDeA } })).toBe(0)
    })
  })

  it('rechaza la pertenencia cuya empresa no es la del grupo ni la de la persona', async () => {
    // R14 — grupo y persona SI son de la misma empresa, pero la fila declara una TERCERA. Las
    // dos FK compuestas fallan a la vez; Postgres reporta la primera que evalua, y el caso
    // afirma que es una de las dos —nunca `null`, nunca otra— y que ninguna fila entra.
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA } = fixture
      const otraEmpresa = await createCompany(tx, 'empresa-c')
      const grupo = await createWorkGroup(tx, companyA)
      const persona = await createUser(fixture, companyA)

      const rechazo = await expectRejectedByDatabase(
        tx,
        insertMemberSql({
          work_group_id: grupo,
          user_id: persona,
          company_id: otraEmpresa,
        }),
        'pertenencia con una empresa que no es la del grupo ni la de la persona',
      )
      expect(rechazo.sqlState).toBe(FOREIGN_KEY_VIOLATION)
      expect([
        'work_group_members_work_group_id_fkey',
        'work_group_members_user_id_fkey',
      ]).toContain(rechazo.constraint)
      expect(await tx.workGroupMember.count({ where: { workGroupId: grupo } })).toBe(0)
    })
  })

  it('rechaza tambien AL MODIFICAR una pertenencia hacia una persona de otra empresa', async () => {
    // R14 dice «tanto al insertar como al modificar»: la garantia no es del `INSERT`, es de la
    // definicion de la tabla.
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA, companyB } = fixture
      const grupo = await createWorkGroup(tx, companyA)
      const propia = await createUser(fixture, companyA)
      const ajena = await createUser(fixture, companyB)
      await addMember(tx, grupo, propia, companyA)

      const rechazo = await expectRejectedByDatabase(
        tx,
        `UPDATE "work_group_members" SET "user_id" = ${uuidLit(ajena)}
         WHERE "work_group_id" = ${uuidLit(grupo)}`,
        'cambiar la pertenencia hacia una persona de otra empresa',
      )
      expect(rechazo.sqlState).toBe(FOREIGN_KEY_VIOLATION)
      expect(rechazo.constraint).toBe('work_group_members_user_id_fkey')

      // La fila original sigue intacta y no hay ninguna cruzada.
      const filas = await tx.workGroupMember.findMany({
        where: { workGroupId: grupo },
        select: { userId: true, companyId: true },
      })
      expect(filas).toEqual([{ userId: propia, companyId: companyA }])
      expect(await desyncedMemberships(tx)).toBe(0)
    })
  })

  it('acepta la pertenencia cuando el grupo, la persona y la empresa son la misma', async () => {
    // El contrapunto del que dependen los tres casos anteriores: lo que rechaza la base es el
    // CRUCE, no la tabla entera.
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA } = fixture
      const grupo = await createWorkGroup(tx, companyA)
      const persona = await createUser(fixture, companyA)

      await addMember(tx, grupo, persona, companyA)

      const filas = await tx.workGroupMember.findMany({
        where: { workGroupId: grupo },
        select: { workGroupId: true, userId: true, companyId: true },
      })
      expect(filas).toEqual([{ workGroupId: grupo, userId: persona, companyId: companyA }])
    })
  })
})

// ===========================================================================
// R15 — mover de empresa al padre tampoco deja cruzar
// ===========================================================================

describe('mover de empresa a un padre con pertenencias', () => {
  it('rechaza cambiar de empresa a una persona que esta en un grupo', async () => {
    // R15 — el `ON UPDATE CASCADE` propaga primero la empresa nueva a las filas de pertenencia
    // y ENTONCES la FK del GRUPO deja de casar: el 23503 llega contra la OTRA FK. Lo que el
    // requisito exige es el resultado, no cual de las dos lo grita.
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA, companyB } = fixture
      const grupo = await createWorkGroup(tx, companyA)
      const persona = await createUser(fixture, companyA)
      await addMember(tx, grupo, persona, companyA)

      const rechazo = await expectRejectedByDatabase(
        tx,
        `UPDATE "users" SET "company_id" = ${uuidLit(companyB)} WHERE "id" = ${uuidLit(persona)}`,
        'mover de empresa a una persona que esta en un grupo',
      )
      expect(rechazo.sqlState).toBe(FOREIGN_KEY_VIOLATION)
      expect(rechazo.constraint).toBe('work_group_members_work_group_id_fkey')

      // Ni la persona se movio, ni quedo ninguna pertenencia con la empresa desincronizada.
      const despues = await tx.user.findUniqueOrThrow({
        where: { id: persona },
        select: { companyId: true },
      })
      expect(despues.companyId).toBe(companyA)
      const filas = await tx.workGroupMember.findMany({
        where: { workGroupId: grupo },
        select: { userId: true, companyId: true },
      })
      expect(filas).toEqual([{ userId: persona, companyId: companyA }])
      expect(await desyncedMemberships(tx)).toBe(0)
    })
  })

  it('rechaza cambiar de empresa a un grupo que tiene personas dentro', async () => {
    // R15, el sentido simetrico: la cascada llega a la pertenencia y la FK de la PERSONA es la
    // que deja de casar.
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA, companyB } = fixture
      const grupo = await createWorkGroup(tx, companyA)
      const persona = await createUser(fixture, companyA)
      await addMember(tx, grupo, persona, companyA)

      const rechazo = await expectRejectedByDatabase(
        tx,
        `UPDATE "work_groups" SET "company_id" = ${uuidLit(companyB)} WHERE "id" = ${uuidLit(grupo)}`,
        'mover de empresa a un grupo poblado',
      )
      expect(rechazo.sqlState).toBe(FOREIGN_KEY_VIOLATION)
      expect(rechazo.constraint).toBe('work_group_members_user_id_fkey')

      const despues = await tx.workGroup.findUniqueOrThrow({
        where: { id: grupo },
        select: { companyId: true },
      })
      expect(despues.companyId).toBe(companyA)
      const filas = await tx.workGroupMember.findMany({
        where: { workGroupId: grupo },
        select: { userId: true, companyId: true },
      })
      expect(filas).toEqual([{ userId: persona, companyId: companyA }])
      expect(await desyncedMemberships(tx)).toBe(0)
    })
  })

  it('acepta mover de empresa a un grupo vacio y a una persona sin grupos', async () => {
    // La otra cara de R15: lo que la base bloquea es la DESINCRONIZACION, no el `UPDATE`.
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA, companyB } = fixture
      const grupoVacio = await createWorkGroup(tx, companyA)
      const personaSinGrupos = await createUser(fixture, companyA)

      await tx.workGroup.update({ where: { id: grupoVacio }, data: { companyId: companyB } })
      await tx.user.update({ where: { id: personaSinGrupos }, data: { companyId: companyB } })

      expect((await tx.workGroup.findUniqueOrThrow({ where: { id: grupoVacio } })).companyId).toBe(
        companyB,
      )
      expect((await tx.user.findUniqueOrThrow({ where: { id: personaSinGrupos } })).companyId).toBe(
        companyB,
      )
      expect(await desyncedMemberships(tx)).toBe(0)
    })
  })
})

// ===========================================================================
// R16 y R17 — cuantas veces y cuantos
// ===========================================================================

describe('la misma persona en el mismo grupo', () => {
  it('rechaza meter dos veces a la misma persona en el mismo grupo', async () => {
    // R16 — contra la PK compuesta `(work_group_id, user_id)`, no contra un SELECT previo.
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA } = fixture
      const grupo = await createWorkGroup(tx, companyA)
      const persona = await createUser(fixture, companyA)
      await addMember(tx, grupo, persona, companyA)

      const rechazo = await expectRejectedByDatabase(
        tx,
        insertMemberSql({ work_group_id: grupo, user_id: persona, company_id: companyA }),
        'la misma persona dos veces en el mismo grupo',
      )
      expect(rechazo.sqlState).toBe(UNIQUE_VIOLATION)
      expect(rechazo.constraint).toBe('work_group_members_pkey')

      expect(await tx.workGroupMember.count({ where: { workGroupId: grupo } })).toBe(1)
    })
  })

  it('acepta una persona en varios grupos y un grupo con varias personas', async () => {
    // R17 — la base no limita ni una cosa ni la otra.
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA } = fixture
      const turnoNoche = await createWorkGroup(tx, companyA)
      const planta2 = await createWorkGroup(tx, companyA)
      const ana = await createUser(fixture, companyA)
      const luis = await createUser(fixture, companyA)

      await addMember(tx, turnoNoche, ana, companyA)
      await addMember(tx, planta2, ana, companyA)
      await addMember(tx, turnoNoche, luis, companyA)

      // Una persona en dos grupos.
      const gruposDeAna = await tx.workGroupMember.findMany({
        where: { userId: ana },
        select: { workGroupId: true },
      })
      expect(gruposDeAna.map((fila) => fila.workGroupId).sort()).toEqual(
        [turnoNoche, planta2].sort(),
      )

      // Un grupo con dos personas.
      const personasDelTurno = await tx.workGroupMember.findMany({
        where: { workGroupId: turnoNoche },
        select: { userId: true },
      })
      expect(personasDelTurno.map((fila) => fila.userId).sort()).toEqual([ana, luis].sort())
    })
  })
})

// ===========================================================================
// R4, R5, R6 — el nombre del grupo dentro de la empresa
// ===========================================================================

describe('el nombre del grupo es unico dentro de la empresa', () => {
  it('rechaza un segundo grupo vivo con el mismo nombre normalizado en la misma empresa', async () => {
    // R4 — contra el INDICE UNICO `work_groups_name_unique`, no contra una comprobacion previa
    // al vuelo. Las dos grafias son «la misma» segun la UNICA definicion del contrato (R3).
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA } = fixture
      const nombre = `Turno Noche ${randomUUID()}`
      const variante = nombre.toUpperCase().replace('TURNO', 'TÚRNO')
      expect(normalizeWorkGroupName(variante)).toBe(normalizeWorkGroupName(nombre))

      const primero = await createWorkGroup(tx, companyA, nombre)

      const rechazo = await expectRejectedByDatabase(
        tx,
        insertWorkGroupSql({
          name: variante,
          nameNormalized: normalizeWorkGroupName(variante),
          companyId: companyA,
        }),
        'segundo grupo vivo con el mismo nombre normalizado en la misma empresa',
      )
      expect(rechazo.sqlState).toBe(UNIQUE_VIOLATION)
      expect(rechazo.constraint).toBe('work_groups_name_unique')

      // Y tambien si quien escribe no normalizo la caja: el indice va sobre
      // `lower("name_normalized")`, asi que la unicidad no depende del llamante.
      const enOtraCaja = await expectRejectedByDatabase(
        tx,
        insertWorkGroupSql({
          name: variante,
          nameNormalized: normalizeWorkGroupName(nombre).toUpperCase(),
          companyId: companyA,
        }),
        'segundo grupo con el nombre normalizado escrito en mayusculas',
      )
      expect(enOtraCaja.sqlState).toBe(UNIQUE_VIOLATION)
      expect(enOtraCaja.constraint).toBe('work_groups_name_unique')

      // "no crear ni modificar ninguna fila": queda solo el primero, tal como se tecleo.
      const filas = await tx.workGroup.findMany({
        where: { companyId: companyA },
        select: { id: true, name: true },
      })
      expect(filas).toEqual([{ id: primero, name: nombre }])
    })
  })

  it('acepta el mismo nombre de grupo en otra empresa', async () => {
    // R5 — el indice es COMPUESTO con `company_id`: cada empresa tiene su «Turno noche».
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA, companyB } = fixture
      const nombre = `Turno noche ${randomUUID()}`

      const enA = await createWorkGroup(tx, companyA, nombre)
      const enB = await createWorkGroup(tx, companyB, nombre)
      expect(enB).not.toBe(enA)

      const filas = await tx.workGroup.findMany({
        where: { nameNormalized: normalizeWorkGroupName(nombre) },
        select: { id: true, companyId: true },
      })
      expect(filas).toHaveLength(2)
      expect(filas.map((fila) => fila.companyId).sort()).toEqual([companyA, companyB].sort())
    })
  })

  it('el nombre de un grupo dado de baja queda libre en su misma empresa', async () => {
    // R6 — el indice es PARCIAL (`WHERE deleted_at IS NULL`), el precedente de
    // `companies_name_unique` y `users_email_unique`.
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA } = fixture
      const nombre = `Turno noche ${randomUUID()}`

      const dadoDeBaja = await createWorkGroup(tx, companyA, nombre, new Date())
      const vivo = await createWorkGroup(tx, companyA, nombre)
      expect(vivo).not.toBe(dadoDeBaja)

      const filas = await tx.workGroup.findMany({
        where: { companyId: companyA },
        select: { id: true, deletedAt: true },
      })
      expect(filas).toHaveLength(2)
      expect(filas.filter((fila) => fila.deletedAt === null).map((fila) => fila.id)).toEqual([vivo])

      // Pero dos VIVOS con ese nombre siguen sin poder convivir.
      const rechazo = await expectRejectedByDatabase(
        tx,
        insertWorkGroupSql({
          name: nombre,
          nameNormalized: normalizeWorkGroupName(nombre),
          companyId: companyA,
        }),
        'tercer grupo vivo con el nombre ya reutilizado',
      )
      expect(rechazo.sqlState).toBe(UNIQUE_VIOLATION)
      expect(rechazo.constraint).toBe('work_groups_name_unique')
    })
  })
})

// ===========================================================================
// R1, R2, R7, R8, R9, R10, R11 — la estructura del grupo
// ===========================================================================

describe('la estructura del grupo', () => {
  it('el id del grupo lo genera la base y dos grupos reciben uuids distintos', async () => {
    // R1 — nunca se pasa `id` en el `create`.
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA } = fixture
      const primero = await createWorkGroup(tx, companyA)
      const segundo = await createWorkGroup(tx, companyA)

      const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
      expect(primero).toMatch(uuidV4)
      expect(segundo).toMatch(uuidV4)
      expect(segundo).not.toBe(primero)
    })
  })

  it('rechaza un grupo sin nombre', async () => {
    // R2 — la obligatoriedad la impone la BASE. La unica columna omitida es `name`, y el
    // diagnostico de Postgres la nombra: el 23502 no puede venir de otra cosa.
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA } = fixture
      const nameNormalized = normalizeWorkGroupName(`grupo sin nombre ${randomUUID()}`)

      const rechazo = await expectRejectedByDatabase(
        tx,
        insertWorkGroupSql({ nameNormalized, companyId: companyA }),
        'alta de grupo sin nombre',
      )
      expect(rechazo.sqlState).toBe(NOT_NULL_VIOLATION)
      expect(rechazo.column).toBe('name')
      expect(await tx.workGroup.count({ where: { companyId: companyA } })).toBe(0)
    })
  })

  it('rechaza un grupo sin empresa o con una empresa inexistente', async () => {
    // R8 (obligatoria en la propia base) y R9 (tiene que existir).
    await inRolledBackTransaction(async (fixture) => {
      const { tx } = fixture
      const nombre = `grupo huerfano ${randomUUID()}`
      const nameNormalized = normalizeWorkGroupName(nombre)

      // Sin empresa: la unica columna omitida es `company_id`.
      const sinEmpresa = await expectRejectedByDatabase(
        tx,
        insertWorkGroupSql({ name: nombre, nameNormalized }),
        'alta de grupo sin empresa',
      )
      expect(sinEmpresa.sqlState).toBe(NOT_NULL_VIOLATION)
      expect(sinEmpresa.column).toBe('company_id')
      expect(await tx.workGroup.count({ where: { nameNormalized } })).toBe(0)

      // Con una empresa inexistente: la unica FK de la tabla es la de la empresa.
      const empresaFantasma = await expectRejectedByDatabase(
        tx,
        insertWorkGroupSql({ name: nombre, nameNormalized, companyId: randomUUID() }),
        'alta de grupo con una empresa inexistente',
      )
      expect(empresaFantasma.sqlState).toBe(FOREIGN_KEY_VIOLATION)
      expect(empresaFantasma.constraint).toBe('work_groups_company_id_fkey')
      expect(await tx.workGroup.count({ where: { nameNormalized } })).toBe(0)
    })
  })

  it('rechaza borrar una empresa con un grupo vivo dentro', async () => {
    // R10 — `ON DELETE RESTRICT` de `work_groups_company_id_fkey`.
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA } = fixture
      const grupo = await createWorkGroup(tx, companyA)

      const rechazo = await expectRejectedByDatabase(
        tx,
        `DELETE FROM "companies" WHERE "id" = ${uuidLit(companyA)}`,
        'borrado de una empresa con un grupo vivo',
      )
      expect(rechazo.sqlState).toBe(FOREIGN_KEY_VIOLATION)
      expect(rechazo.constraint).toBe('work_groups_company_id_fkey')

      // La empresa y su grupo quedan intactos.
      expect(await tx.company.findUnique({ where: { id: companyA } })).not.toBeNull()
      const fila = await tx.workGroup.findUniqueOrThrow({ where: { id: grupo } })
      expect(fila.companyId).toBe(companyA)
      expect(fila.deletedAt).toBeNull()
    })
  })

  it('rechaza borrar una empresa cuyo unico grupo esta dado de baja', async () => {
    // R10 en su mitad olvidada: la FK no sabe nada de `deleted_at`, y eso es deliberado. Un
    // grupo de baja SIGUE contando como "esta empresa tiene grupos".
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA } = fixture
      const grupo = await createWorkGroup(tx, companyA, `Turno viejo ${randomUUID()}`, new Date())

      const rechazo = await expectRejectedByDatabase(
        tx,
        `DELETE FROM "companies" WHERE "id" = ${uuidLit(companyA)}`,
        'borrado de una empresa cuyo unico grupo esta dado de baja',
      )
      expect(rechazo.sqlState).toBe(FOREIGN_KEY_VIOLATION)
      expect(rechazo.constraint).toBe('work_groups_company_id_fkey')

      expect(await tx.company.findUnique({ where: { id: companyA } })).not.toBeNull()
      const fila = await tx.workGroup.findUniqueOrThrow({ where: { id: grupo } })
      expect(fila.companyId).toBe(companyA)
      expect(fila.deletedAt).not.toBeNull()
    })
  })

  it('created_at y updated_at se rellenan solos en las dos tablas y el del grupo cambia al modificarlo', async () => {
    // R11 — nunca se pasan: los ponen el DEFAULT de la base y el `@updatedAt` de Prisma.
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA } = fixture
      const nombre = `Turno noche ${randomUUID()}`
      const grupo = await tx.workGroup.create({
        data: { name: nombre, nameNormalized: normalizeWorkGroupName(nombre), companyId: companyA },
      })
      expect(grupo.createdAt).toBeInstanceOf(Date)
      expect(grupo.updatedAt).toBeInstanceOf(Date)
      // R7: la marca de baja del grupo nace VACIA.
      expect(grupo.deletedAt).toBeNull()

      const persona = await createUser(fixture, companyA)
      const pertenencia = await tx.workGroupMember.create({
        data: { workGroupId: grupo.id, userId: persona, companyId: companyA },
      })
      expect(pertenencia.createdAt).toBeInstanceOf(Date)
      expect(pertenencia.updatedAt).toBeInstanceOf(Date)

      await sleep(20)
      const otroNombre = `Turno tarde ${randomUUID()}`
      const modificado = await tx.workGroup.update({
        where: { id: grupo.id },
        data: { name: otroNombre, nameNormalized: normalizeWorkGroupName(otroNombre) },
      })
      expect(modificado.createdAt.getTime()).toBe(grupo.createdAt.getTime())
      expect(modificado.updatedAt.getTime()).toBeGreaterThan(grupo.updatedAt.getTime())
    })
  })
})

// ===========================================================================
// R13 — las tres referencias de la pertenencia son obligatorias
// ===========================================================================

describe('las tres referencias de la pertenencia', () => {
  it('rechaza la pertenencia a la que le falta el grupo, la persona o la empresa', async () => {
    // R13 — cada vuelta omite UNA y solo una columna, y el diagnostico devuelve exactamente
    // esa: no hay forma de que el 23502 venga de otra.
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA } = fixture
      const grupo = await createWorkGroup(tx, companyA)
      const persona = await createUser(fixture, companyA)
      const completa = { work_group_id: grupo, user_id: persona, company_id: companyA }

      for (const omitida of ['work_group_id', 'user_id', 'company_id'] as const) {
        const parcial: { work_group_id?: string; user_id?: string; company_id?: string } = {
          ...completa,
        }
        delete parcial[omitida]

        const rechazo = await expectRejectedByDatabase(
          tx,
          insertMemberSql(parcial),
          `pertenencia sin "${omitida}"`,
        )
        expect(rechazo.sqlState, `omitiendo "${omitida}"`).toBe(NOT_NULL_VIOLATION)
        expect(rechazo.column, `omitiendo "${omitida}"`).toBe(omitida)
        expect(await tx.workGroupMember.count({ where: { workGroupId: grupo } })).toBe(0)
      }
    })
  })
})

// ===========================================================================
// R18, R19, R20, R21 — sacar a alguien, y las dos bajas logicas
// ===========================================================================

describe('sacar a una persona de un grupo', () => {
  it('elimina fisicamente la fila y no deja ningun rastro', async () => {
    // R18 — es la EXCEPCION EXPLICITA al borrado logico (decision cerrada 4).
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA } = fixture
      const grupo = await createWorkGroup(tx, companyA)
      const persona = await createUser(fixture, companyA)
      await addMember(tx, grupo, persona, companyA)
      expect(await tx.workGroupMember.count({ where: { workGroupId: grupo } })).toBe(1)

      await removeMember(tx, grupo, persona)

      // No queda la fila, ni "apagada" ni de ninguna otra forma.
      expect(await tx.workGroupMember.count({ where: { workGroupId: grupo } })).toBe(0)
      expect(await tx.workGroupMember.count({ where: { userId: persona } })).toBe(0)
      const crudo = await tx.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM "work_group_members"
        WHERE "work_group_id" = CAST(${grupo} AS uuid)`
      expect(crudo[0]?.n).toBe(0)

      // Y NO hay ninguna columna donde pudiera haber quedado el rastro: la tabla tiene
      // exactamente estas cinco, sin `deleted_at` ni equivalente.
      const columnas = await tx.$queryRaw<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'work_group_members'
        ORDER BY column_name`
      expect(columnas.map((columna) => columna.column_name)).toEqual([
        'company_id',
        'created_at',
        'updated_at',
        'user_id',
        'work_group_id',
      ])
    })
  })

  it('sacar a la ultima persona deja el grupo vivo e intacto, y un grupo sin nadie existe', async () => {
    // R19 — sacar a la ultima persona NO borra el grupo, NO lo da de baja y NO lo modifica de
    // ninguna forma: se compara la FILA ENTERA antes y despues, `updated_at` y `deleted_at`
    // incluidos.
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA } = fixture
      const grupo = await createWorkGroup(tx, companyA)
      const persona = await createUser(fixture, companyA)
      await addMember(tx, grupo, persona, companyA)
      const antes = await tx.workGroup.findUniqueOrThrow({ where: { id: grupo } })

      await sleep(20)
      await removeMember(tx, grupo, persona)

      const despues = await tx.workGroup.findUniqueOrThrow({ where: { id: grupo } })
      expect(despues).toEqual(antes)
      expect(despues.deletedAt).toBeNull()
      expect(await tx.workGroupMember.count({ where: { workGroupId: grupo } })).toBe(0)

      // Y un grupo que nunca tuvo a nadie existe igual.
      const vacio = await createWorkGroup(tx, companyA)
      expect(await tx.workGroup.findUnique({ where: { id: vacio } })).not.toBeNull()
      expect(await tx.workGroupMember.count({ where: { workGroupId: vacio } })).toBe(0)
    })
  })
})

describe('las bajas logicas no tocan las pertenencias', () => {
  it('dar de baja a una persona, o dejarla inactive o blocked, conserva sus pertenencias', async () => {
    // R20 — la pertenencia no se toca: sale del grupo el dia que alguien la saca. Quien FILTRA
    // al leer es QC-84, no la base.
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA } = fixture
      const turnoNoche = await createWorkGroup(tx, companyA)
      const planta2 = await createWorkGroup(tx, companyA)
      const persona = await createUser(fixture, companyA)
      await addMember(tx, turnoNoche, persona, companyA)
      await addMember(tx, planta2, persona, companyA)

      const antes = await tx.workGroupMember.findMany({
        where: { userId: persona },
        orderBy: { workGroupId: 'asc' },
      })
      expect(antes).toHaveLength(2)

      // Los tres estados de "esta persona ya no deberia entrar", uno detras de otro.
      await tx.user.update({ where: { id: persona }, data: { accountStatus: 'inactive' } })
      await tx.user.update({ where: { id: persona }, data: { accountStatus: 'blocked' } })
      await tx.user.update({ where: { id: persona }, data: { deletedAt: new Date() } })

      const despues = await tx.workGroupMember.findMany({
        where: { userId: persona },
        orderBy: { workGroupId: 'asc' },
      })
      expect(despues).toEqual(antes)

      // Y reactivarla la devuelve a sus grupos sin ninguna escritura adicional.
      await tx.user.update({
        where: { id: persona },
        data: { deletedAt: null, accountStatus: 'active' },
      })
      const reactivada = await tx.workGroupMember.findMany({
        where: { userId: persona },
        orderBy: { workGroupId: 'asc' },
      })
      expect(reactivada).toEqual(antes)
    })
  })

  it('dar de baja un grupo conserva intactas sus filas de pertenencia', async () => {
    // R21 — la baja del grupo es un `UPDATE`, y ninguna FK reacciona a un `UPDATE`.
    await inRolledBackTransaction(async (fixture) => {
      const { tx, companyA } = fixture
      const grupo = await createWorkGroup(tx, companyA)
      const ana = await createUser(fixture, companyA)
      const luis = await createUser(fixture, companyA)
      await addMember(tx, grupo, ana, companyA)
      await addMember(tx, grupo, luis, companyA)

      const antes = await tx.workGroupMember.findMany({
        where: { workGroupId: grupo },
        orderBy: { userId: 'asc' },
      })
      expect(antes).toHaveLength(2)

      await tx.workGroup.update({ where: { id: grupo }, data: { deletedAt: new Date() } })

      const despues = await tx.workGroupMember.findMany({
        where: { workGroupId: grupo },
        orderBy: { userId: 'asc' },
      })
      expect(despues).toEqual(antes)
      expect((await tx.workGroup.findUniqueOrThrow({ where: { id: grupo } })).deletedAt).not.toBeNull()
    })
  })
})
