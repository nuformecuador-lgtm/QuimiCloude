/**
 * T16 (QC-34) — lo que solo Postgres puede demostrar del CRUD de pedidos, contra una base
 * REAL con la migracion `20260904135210_order_cancellation` aplicada encima de la de QC-33.
 *
 * Requisitos cubiertos: R8, R10, R30, R32, R40, R41 (`design.md > 12`, `tasks.md > T16`).
 *
 * ESTE ARCHIVO ES COPIA DE FORMA de `tests/integration/pedidos/pedidos-constraints.int.test.ts`
 * (QC-33): los helpers de aislamiento, la siembra de las cuatro FK y la forma de afirmar sobre
 * el SQLSTATE son los suyos, y las razones son las mismas. Se repiten aqui —y no se extraen a
 * un modulo comun— por el mismo criterio con el que QC-33 los copio de `recetas` y `unidades`:
 * un archivo de integracion se lee solo.
 *
 * AISLAMIENTO — cada `it` corre dentro de `prisma.$transaction` interactiva que SIEMPRE
 * termina lanzando `RollbackSignal`, asi que Prisma emite `ROLLBACK` y ninguna fila escrita
 * por un test sobrevive. NO es un detalle de estilo: los tests de `tests/integration/` corren
 * EN SERIE contra UNA base compartida (`vitest.config.mts`, `fileParallelism: false`) y algun
 * archivo afirma sobre el estado global de una tabla. Una fila olvidada aqui pone rojo un test
 * ajeno manana.
 *
 * NINGUNA AFIRMACION GLOBAL — ningun caso dice «la tabla tiene N pedidos». Cada uno mira solo
 * las filas que el mismo sembro, localizadas por su `id`.
 *
 * CADA CASO SIEMBRA SUS PROPIAS FK — las cuatro referencias del pedido (`recipe_id`,
 * `created_by`, `updated_by`) son FK REALES aunque Prisma las declare como
 * escalares sin `@relation`. Nada viene de un seed.
 *
 * LO QUE DEBE FALLAR VA CON SQL CRUDO (`design.md > 12`, primer aviso): la API tipada traduce
 * el SQLSTATE a su propio codigo (`P2002`, `P2003`…) y el SQLSTATE se pierde. Y SE AFIRMA
 * SOBRE EL SQLSTATE, NUNCA SOBRE EL TEXTO del mensaje: en esta maquina Postgres responde en
 * espanol. Cada caso se construye para que SOLO UNA restriccion pueda dispararse —por eso el
 * caso que pone `CANCELADO` a un pedido ya borrado escribe TAMBIEN el motivo: sin el saltaria
 * el CHECK de `design.md > 3.3` y el test dejaria de demostrar el de `> 3.4`—.
 *
 * SIN TESTS DE RLS (`design.md > 12`, sexto aviso): un test de RLS escrito con Prisma sale
 * verde pase lo que pase, porque Prisma se conecta como dueno de las tablas. R7 lo cierra
 * `tests/guards/guard-rls-force.test.ts`.
 *
 * SIN LITERALES DE ANO salvo donde el ano ES el punto del test (el caso frontera de R10):
 * el CHECK `orders_order_year_matches_created_at` (QC-33 R41) ata `order_year` al ano UTC de
 * `created_at`, asi que un `2026` escrito a mano pondria la suite roja sola el 1 de enero.
 */
import { randomUUID } from 'node:crypto'

import { Prisma } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { normalizeCompanyName } from '@/lib/modules/identity'
import { normalizePresentationName } from '@/lib/modules/inventario'
import { createFinishedGoodsIntake } from '@/lib/modules/inventario/adapters/driven/persistence/finished-goods-prisma'
import { createMaterialReservations } from '@/lib/modules/inventario/adapters/driven/persistence/reservation-prisma'
import { createCreateOrder, createUpdateOrder } from '@/lib/modules/pedidos'
import { createOrderWriteRepository } from '@/lib/modules/pedidos/adapters/driven/persistence/order-prisma'
import { createRecipeExecutionReader } from '@/lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma'
import { prisma } from '@/lib/shared/db/prisma'

import type { Actor } from '@/lib/modules/pedidos'
import type { PresentationCatalog, ProductCatalog } from '@/lib/modules/inventario'
import type { OrderRepository } from '@/lib/modules/pedidos/ports/order-repository'
import type { OrderUnitOfWork } from '@/lib/modules/pedidos/ports/order-unit-of-work'
import type { RecipeCatalog } from '@/lib/modules/recetas'
import type { UnitCatalog } from '@/lib/modules/unidades'
import { findMassVolumeBridge } from '@/lib/modules/unidades/adapters/driven/persistence/unit-catalog-prisma'
import { findPackagingCostingBatches, findPackagingRefs } from '@/lib/modules/inventario/adapters/driven/persistence/packaging-catalog-prisma';
import type { PackagingCatalog } from '@/lib/modules/inventario';

const packagingCatalog: PackagingCatalog = { findRefs: findPackagingRefs, findCostingBatches: findPackagingCostingBatches };

// ---------------------------------------------------------------------------
// Utilidades de aislamiento
// ---------------------------------------------------------------------------

/** Senal de rollback: no es un fallo, es como se deshace la transaccion del test. */
class RollbackSignal extends Error {
  constructor() {
    super('rollback de aislamiento del test')
    this.name = 'RollbackSignal'
  }
}

/** Ejecuta el cuerpo del test en una transaccion que SIEMPRE termina en ROLLBACK. */
async function inRolledBackTransaction(
  body: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<void> {
  try {
    await prisma.$transaction(
      async (tx) => {
        await body(tx)
        throw new RollbackSignal()
      },
      { maxWait: 10_000, timeout: 30_000 },
    )
  } catch (error) {
    if (!(error instanceof RollbackSignal)) throw error
  }
}

let savepointSeq = 0

/** SQLSTATE de Postgres relevante aqui. Es estable y NO depende del idioma del servidor. */
const CHECK_VIOLATION = '23514'

/**
 * SQLSTATE del error, leido del campo ESTRUCTURADO (`meta.code`) y jamas del texto humano.
 * Ningun test afirma sobre el nombre de la restriccion: se afirma sobre el SQLSTATE y sobre el
 * efecto, y cada caso se construye para que solo una restriccion pueda dispararlo. Los nombres
 * los vigila `tests/unit/pedidos/schema/pedidos-migration.test.ts`.
 */
function sqlStateOf(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const meta: unknown = error.meta
    if (typeof meta === 'object' && meta !== null && 'code' in meta) {
      const code: unknown = (meta as { code: unknown }).code
      if (typeof code === 'string') return code
    }
    return error.code
  }
  return error instanceof Error ? error.message : String(error)
}

/**
 * Corre `run` esperando que la base lo rechace. Devuelve el SQLSTATE y deja la transaccion
 * utilizable: un error de restriccion aborta la transaccion entera, y varios casos comprueban
 * el estado DESPUES del rechazo, asi que la operacion va dentro de un `SAVEPOINT`.
 */
async function expectRejectedByDatabase(
  tx: Prisma.TransactionClient,
  run: () => Promise<unknown>,
  what: string,
): Promise<string> {
  savepointSeq += 1
  const savepoint = `sp_${String(savepointSeq)}`
  await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`)
  try {
    await run()
  } catch (error) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`)
    return sqlStateOf(error)
  }
  await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`)
  throw new Error(`se esperaba que la base rechazara la operacion, pero la acepto: ${what}`)
}

// ---------------------------------------------------------------------------
// Datos de apoyo — las cuatro FK son reales, asi que cada caso siembra las suyas
// ---------------------------------------------------------------------------

const UUID_SHAPE = /^[0-9a-f-]{36}$/u

/** Marcador irrepetible de solo letras y digitos: sobrevive a cualquier normalizacion. */
function token(): string {
  return randomUUID().replace(/-/gu, '')
}

/** Posicion por defecto de los pedidos de este archivo. Crece siempre, asi que dos pedidos del
 *  mismo caso nunca chocan por accidente contra el indice unico del correlativo. */
let nextSequence = 700_000

function freshSequence(): number {
  nextSequence += 1
  return nextSequence
}

/** El ano UTC de HOY: el unico que admite un pedido con `created_at` por defecto. */
function currentUtcYear(): number {
  return new Date().getUTCFullYear()
}

interface Fixtures {
  /** QC-60: `orders.company_id` es NOT NULL, asi que el pedido nace en la empresa del fixture. */
  readonly companyId: string
  readonly unitId: string
  readonly recipeId: string
  readonly userId: string
  /** QC-146: presentacion de la MISMA empresa, lista para R5, R9 y R14. */
  readonly presentationId: string
}

/**
 * Siembra, DENTRO de la transaccion del caso, la unidad, la receta y el usuario que las FK del
 * pedido exigen. Los nombres llevan marcador porque `units`, `recipes`, `roles` y `users`
 * tienen indices unicos y la base local ya trae catalogos sembrados.
 */
async function seedFixtures(tx: Prisma.TransactionClient): Promise<Fixtures> {
  const marca = token()
  const unit = await tx.unit.create({
    // ACTUALIZADO EL 2026-09-08 POR QC-76 (R15, decision cerrada 28): el simbolo pasa a ser
    // UNICO dentro del ambito cuando existe. Esta unidad se siembra SIN empresa —o sea DE
    // SISTEMA—, asi que un `'kg'` fijo choca con `23505` contra el `kilogramo` del catalogo
    // arrancador y contra el de cualquier otro fixture. Se deriva del marcador irrepetible,
    // que es lo que este archivo ya hacia con el nombre. Ningun aserto lee su valor.
    data: { name: `Unidad ${marca}`, nameNormalized: `unidad${marca}`, symbol: `kg${marca}` },
    select: { id: true },
  })
  const documentType = await tx.documentType.create({
    data: { code: `DOC${marca.slice(0, 8)}`, name: 'Tipo de documento de prueba' },
    select: { code: true },
  })
  const role = await tx.role.create({
    data: { name: `rol-${marca}`, description: 'Rol de prueba' },
    select: { id: true },
  })
  // Empresa efimera propia de este fixture: QC-47 R9 hizo `users.company_id` obligatoria, asi
  // que ningun usuario se puede crear ya sin una. NUNCA la empresa de instalacion: el indice
  // `companies_name_unique` es GLOBAL y el nombre chocaria con el de la empresa que siembra
  // `db:seed`. `name_normalized` sale de `normalizeCompanyName` -la UNICA definicion de «mismo
  // nombre de empresa» (R3), importada del contrato publico de `identity`-, nunca de una copia
  // escrita a mano aqui.
  const companyName = `Empresa ${marca}`
  const company = await tx.company.create({
    data: { name: companyName, nameNormalized: normalizeCompanyName(companyName) },
    select: { id: true },
  })
  // La receta es de la MISMA empresa que el pedido: QC-50 hizo `recipes.company_id` obligatoria.
  const recipe = await tx.recipe.create({
    data: { name: `Receta ${marca}`, nameNormalized: `receta${marca}`, companyId: company.id },
    select: { id: true },
  })
  const user = await tx.user.create({
    data: {
      firstNames: 'Ana Maria',
      lastNames: 'Perez Gomez',
      birthDate: new Date('1990-05-17T00:00:00.000Z'),
      email: `ana.${marca}@quimicloude.test`,
      phone: '+57 300 111 2233',
      documentTypeCode: documentType.code,
      documentNumber: marca.slice(0, 12),
      username: `ana.${marca}`,
      passwordHash: 'hash-de-prueba-no-es-un-algoritmo-real',
      roleId: role.id,
      companyId: company.id,
    },
    select: { id: true },
  })
  const presentationName = `Bidon ${marca}`
  const presentation = await tx.presentation.create({
    data: {
      name: presentationName,
      nameNormalized: normalizePresentationName(presentationName),
      unitId: unit.id,
      companyId: company.id,
    },
    select: { id: true },
  })
  return {
    companyId: company.id,
    unitId: unit.id,
    recipeId: recipe.id,
    userId: user.id,
    presentationId: presentation.id,
  }
}

/** Columnas que un alta cruda puede escribir en `orders`. */
type WritableColumn =
  | 'id'
  | 'company_id'
  | 'order_year'
  | 'order_sequence'
  | 'recipe_id'
  | 'quantity'
  | 'priority'
  | 'status'
  | 'cancellation_reason'
  | 'created_by'
  | 'updated_by'
  | 'created_at'
  | 'deleted_at'

/**
 * `INSERT` crudo en `orders`. `columns` decide que se escribe: omitir una entrada es
 * exactamente el caso «ese dato no se escribe». `updated_at` se da siempre porque es NOT NULL
 * SIN DEFAULT (lo rellena el cliente Prisma via `@updatedAt`, no la base).
 */
function rawInsertOrder(
  tx: Prisma.TransactionClient,
  columns: Partial<Record<WritableColumn, Prisma.Sql>>,
): Promise<number> {
  const entries = Object.entries(columns) as [WritableColumn, Prisma.Sql][]
  const names = entries.map(([name]) => Prisma.raw(`"${name}"`))
  const values = entries.map(([, value]) => value)

  names.push(Prisma.raw('"updated_at"'))
  values.push(Prisma.sql`CURRENT_TIMESTAMP`)

  return tx.$executeRaw`INSERT INTO "orders" (${Prisma.join(names)}) VALUES (${Prisma.join(values)})`
}

/** `UPDATE` crudo de un pedido. Va crudo por lo mismo que el `INSERT`: es el unico camino que
 *  deja llegar el SQLSTATE de Postgres sin que Prisma lo traduzca a su propio codigo. */
function rawUpdateOrder(
  tx: Prisma.TransactionClient,
  id: string,
  assignments: Prisma.Sql,
): Promise<number> {
  return tx.$executeRaw`UPDATE "orders" SET ${assignments} WHERE "id" = CAST(${id} AS uuid)`
}

/** Valor SQL de un uuid: el parametro llega como texto y hay que castearlo. */
function asUuid(id: string): Prisma.Sql {
  return Prisma.sql`CAST(${id} AS uuid)`
}

/** Valor SQL de un decimal exacto: se pasa como texto y se castea, nunca como `number`. */
function asDecimal(value: string): Prisma.Sql {
  return Prisma.sql`CAST(${value} AS decimal(14,4))`
}

/** Valor SQL de un instante: se pasa como texto ISO con su desplazamiento y se castea. */
function asTimestamptz(value: string): Prisma.Sql {
  return Prisma.sql`CAST(${value} AS timestamptz)`
}

/** Valor SQL de un estado del conjunto cerrado. */
function asStatus(value: string): Prisma.Sql {
  return Prisma.sql`CAST(${value} AS "OrderStatus")`
}

/** Las columnas obligatorias de un pedido valido, listas para un `INSERT` crudo. Cada caso
 *  sobreescribe la que quiere poner a prueba, y asi solo una restriccion puede dispararse. */
function baseColumns(f: Fixtures, sequence: number): Partial<Record<WritableColumn, Prisma.Sql>> {
  return {
    company_id: asUuid(f.companyId),
    order_year: Prisma.sql`${currentUtcYear()}`,
    order_sequence: Prisma.sql`${sequence}`,
    recipe_id: asUuid(f.recipeId),
    quantity: asDecimal('10'),
  }
}

type OrderStatusValue = 'PENDIENTE' | 'EN_CURSO' | 'ENTREGADO' | 'CANCELADO'
type OrderPriorityValue = 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA'

interface OrderSeed {
  readonly status?: OrderStatusValue
  readonly cancellationReason?: string
  readonly priority?: OrderPriorityValue
  readonly sequence?: number
  readonly createdAt?: Date
  readonly presentationId?: string | null
}

/** Crea un pedido con la API tipada (camino feliz = camino real de la app) y devuelve su id. */
async function createOrder(
  tx: Prisma.TransactionClient,
  f: Fixtures,
  seed: OrderSeed = {},
): Promise<string> {
  const order = await tx.order.create({
    data: {
      companyId: f.companyId,
      orderYear: currentUtcYear(),
      orderSequence: seed.sequence ?? freshSequence(),
      recipeId: f.recipeId,
      quantity: new Prisma.Decimal('10'),
      status: seed.status,
      cancellationReason: seed.cancellationReason,
      priority: seed.priority,
      createdAt: seed.createdAt,
      createdBy: f.userId,
      updatedBy: f.userId,
      presentationLines:
        seed.presentationId === undefined || seed.presentationId === null
          ? undefined
          : { create: [{ companyId: f.companyId, presentationId: seed.presentationId, packages: 1 }] },
    },
    select: { id: true },
  })
  return order.id
}

/** Instante fijo DENTRO del ano UTC de hoy: sirve para que varios pedidos compartan
 *  `created_at` al milisegundo sin romper el CHECK que ata el ano a la fecha (QC-33 R41). */
function sameInstantThisYear(): Date {
  return new Date(Date.UTC(currentUtcYear(), 5, 15, 12, 0, 0, 0))
}

/** El `ORDER BY` de R41, exactamente como lo escribe
 *  `lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts > listAliveOrders`. */
const LIST_ORDER_BY = [
  { priority: 'desc' },
  { createdAt: 'asc' },
  { orderYear: 'asc' },
  { orderSequence: 'asc' },
] satisfies Prisma.OrderOrderByWithRelationInput[]

// ---------------------------------------------------------------------------

beforeAll(async () => {
  // `design.md > 12`, quinto aviso: si falta la migracion de esta ficha hay que decirlo AQUI,
  // con un mensaje accionable, y no reventar a mitad del primer caso con un error de columna
  // inexistente que nadie sabe leer.
  const columnas = await prisma.$queryRaw<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders'
      AND column_name = 'cancellation_reason'`
  if (columnas.length !== 1) {
    throw new Error(
      'la base de pruebas no tiene la columna `orders.cancellation_reason`: falta la migracion ' +
        '`20260904135210_order_cancellation` de QC-34. Corre `pnpm run db:migrate`.',
    )
  }

  const valores = await prisma.$queryRaw<{ enumlabel: string }[]>`
    SELECT e.enumlabel FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'OrderStatus' AND e.enumlabel = 'CANCELADO'`
  if (valores.length !== 1) {
    throw new Error(
      'el tipo `OrderStatus` de la base de pruebas no tiene el valor `CANCELADO`: falta la ' +
        'migracion `20260904135210_order_cancellation` de QC-34. Corre `pnpm run db:migrate`.',
    )
  }
})

afterAll(async () => {
  await prisma.$disconnect()
})

// ---------------------------------------------------------------------------

describe('el alta contra la base (R8, R10)', () => {
  it('persiste el pedido y devuelve su identificador y su correlativo', async () => {
    // R8. Se ejecuta LA MISMA sentencia que
    // `lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts > createOrder`, y no la
    // funcion del adaptador, porque el adaptador habla con el cliente Prisma GLOBAL: llamarla
    // "dentro" de esta transaccion correria en OTRA conexion del pool y haria COMMIT, dejando
    // filas en una base compartida. Lo que este caso demuestra es lo unico que un doble no
    // puede demostrar: que la base acepta el alta, que el numero lo calcula el
    // `max()+1` DENTRO del INSERT y que el `RETURNING` trae id y correlativo.
    //
    // ACTUALIZADO POR QC-60 (T3, T9): `next_order_sequence(integer)` ya no existe. El alta son dos
    // sentencias en una transaccion —el lock de aviso por (empresa, ano) y el INSERT con el maximo
    // de ESA empresa— y la empresa se escribe en la columna Y en el subselect. Aqui la transaccion
    // es la del propio caso. La carrera y el reparto por empresa se prueban contra el adaptador
    // real en `order-sequence-race.int.test.ts` y `company-scope-queries.int.test.ts`.
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const now = new Date()
      const year = now.getUTCFullYear()

      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(60::int, hashtext(${`orders_sequence:${f.companyId}:${String(year)}`}::text))`

      const filas = await tx.$queryRaw<
        { id: string; order_year: number; order_sequence: number }[]
      >`
        INSERT INTO "orders" (
          "company_id", "order_year", "order_sequence", "recipe_id", "quantity",
          "priority", "status", "created_by", "updated_by", "created_at", "updated_at"
        ) VALUES (
          ${f.companyId}::uuid,
          ${year}::integer,
          (SELECT COALESCE(max("order_sequence"), 0) + 1
             FROM "orders"
            WHERE "company_id" = ${f.companyId}::uuid
              AND "order_year" = ${year}::integer),
          ${f.recipeId}::uuid,
          ${'12.5000'}::numeric,
          ${'ALTA'}::"OrderPriority",
          ${'PENDIENTE'}::"OrderStatus",
          ${f.userId}::uuid,
          ${f.userId}::uuid,
          ${now}::timestamptz,
          ${now}::timestamptz
        )
        RETURNING "id", "order_year", "order_sequence"
      `

      const devuelta = filas[0]
      if (devuelta === undefined) throw new Error('el INSERT no devolvio ninguna fila')
      expect(devuelta.id).toMatch(UUID_SHAPE)
      expect(Number(devuelta.order_year)).toBe(year)
      // La empresa del fixture nace en este caso sin pedidos: su serie arranca en 1.
      expect(Number(devuelta.order_sequence)).toBe(1)

      // Y lo devuelto es lo persistido: se relee la fila por su id.
      const stored = await tx.order.findUniqueOrThrow({ where: { id: devuelta.id } })
      expect(stored.companyId).toBe(f.companyId)
      expect(stored.orderYear).toBe(Number(devuelta.order_year))
      expect(stored.orderSequence).toBe(Number(devuelta.order_sequence))
      expect(stored.recipeId).toBe(f.recipeId)
      expect(stored.quantity.toFixed(4)).toBe('12.5000')
      expect(stored.priority).toBe('ALTA')
      expect(stored.status).toBe('PENDIENTE')
      expect(stored.cancellationReason).toBeNull()
      expect(stored.createdBy).toBe(f.userId)
      expect(stored.updatedBy).toBe(f.userId)
      expect(stored.deletedAt).toBeNull()
    })
  })

  it('con el instante del 31/12/2026 a las 20:00 de Ecuador —2027 en UTC— rechaza order_year 2026 con 23514 y acepta 2027', async () => {
    // R10, contra el CHECK `orders_order_year_matches_created_at` de QC-33 R41. ESTE ES EL CASO
    // QUE MUERDE, y el unico de este archivo con anos literales: la fecha tambien es literal, y
    // ahi esta el punto.
    //
    // El adaptador calcula el ano con `now.getUTCFullYear()` sobre el MISMO `now` que escribe en
    // `created_at` (`design.md > 4.2`, «un solo reloj»). Aqui se comprueba que esa es la unica
    // cuenta que la base acepta: quien mire el reloj de pared en Ecuador (UTC-5) diria que el
    // pedido es de 2026, y la base lo rechaza con `23514`.
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const now = new Date('2026-12-31T20:00:00-05:00')
      const enLaFrontera = asTimestamptz('2026-12-31T20:00:00-05:00')

      // El ano del reloj de pared en Ecuador. Es lo que devolveria un `getFullYear()` corriendo
      // en esa zona, y es exactamente lo que NO se puede escribir.
      const anoLocalEcuador = 2026
      expect(now.getUTCFullYear()).toBe(2027)

      const conElAnoLocal = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsertOrder(tx, {
            ...baseColumns(f, 1),
            order_year: Prisma.sql`${anoLocalEcuador}`,
            created_at: enLaFrontera,
          }),
        'pedido de 2027 en UTC numerado con el ano local de Ecuador',
      )
      expect(conElAnoLocal).toBe(CHECK_VIOLATION)

      const id = randomUUID()
      await rawInsertOrder(tx, {
        ...baseColumns(f, 1),
        id: asUuid(id),
        order_year: Prisma.sql`${now.getUTCFullYear()}`,
        created_at: enLaFrontera,
      })

      const stored = await tx.order.findUniqueOrThrow({
        where: { id },
        select: { orderYear: true, createdAt: true },
      })
      expect(stored.orderYear).toBe(2027)
      expect(stored.createdAt.toISOString()).toBe('2027-01-01T01:00:00.000Z')
    })
  })
})

describe('el CHECK del motivo de cancelacion, en sus cuatro casos (R30)', () => {
  // `orders_cancellation_reason_matches_status` es una IGUALDAD DE DOS BOOLEANOS, no una
  // implicacion (`design.md > 3.3`): hay que probar LOS DOS sentidos y sus dos negaciones. Un
  // test que solo comprobara «cancelar sin motivo se rechaza» pasaria verde con un CHECK que
  // permitiera escribir motivos en pedidos vivos.

  it('(1) acepta un pedido CANCELADO CON motivo', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const id = await createOrder(tx, f, {
        status: 'CANCELADO',
        cancellationReason: 'El cliente rectifico el pedido',
      })

      const stored = await tx.order.findUniqueOrThrow({
        where: { id },
        select: { status: true, cancellationReason: true },
      })
      expect(stored.status).toBe('CANCELADO')
      expect(stored.cancellationReason).toBe('El cliente rectifico el pedido')
    })
  })

  it('(2) rechaza con 23514 un pedido CANCELADO SIN motivo', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)

      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsertOrder(tx, {
            ...baseColumns(f, freshSequence()),
            status: asStatus('CANCELADO'),
          }),
        'pedido cancelado sin motivo',
      )
      expect(sqlState).toBe(CHECK_VIOLATION)
    })
  })

  it('(3) rechaza con 23514 un pedido NO cancelado CON motivo, en los tres estados vivos', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)

      for (const status of ['PENDIENTE', 'EN_CURSO', 'ENTREGADO'] as const) {
        const sqlState = await expectRejectedByDatabase(
          tx,
          () =>
            rawInsertOrder(tx, {
              ...baseColumns(f, freshSequence()),
              status: asStatus(status),
              cancellation_reason: Prisma.sql`${'motivo colado sin cancelacion'}`,
            }),
          `pedido ${status} con motivo de cancelacion`,
        )
        expect(sqlState).toBe(CHECK_VIOLATION)
      }
    })
  })

  it('(4) acepta un pedido NO cancelado SIN motivo, en los tres estados vivos', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)

      for (const status of ['PENDIENTE', 'EN_CURSO', 'ENTREGADO'] as const) {
        const id = await createOrder(tx, f, { status })
        const stored = await tx.order.findUniqueOrThrow({
          where: { id },
          select: { status: true, cancellationReason: true },
        })
        expect(stored.status).toBe(status)
        expect(stored.cancellationReason).toBeNull()
      }
    })
  })
})

describe('el CHECK de borrado ampliado, en sus seis casos (R32)', () => {
  // `orders_delivered_not_deleted` pasa a excluir tambien `CANCELADO` (`design.md > 3.4`), y es
  // SIMETRICO: bloquea borrar un estado final Y poner un estado final a uno ya borrado. Hacen
  // falta los seis casos —los dos que PASAN incluidos—: un test que solo probara los rechazos
  // dejaria pasar un CHECK demasiado estricto, que impidiera borrar un PENDIENTE.

  it('(1) deja borrar un pedido PENDIENTE', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const id = await createOrder(tx, f, { status: 'PENDIENTE' })

      await rawUpdateOrder(tx, id, Prisma.sql`"deleted_at" = CURRENT_TIMESTAMP`)

      const stored = await tx.order.findUniqueOrThrow({
        where: { id },
        select: { deletedAt: true },
      })
      expect(stored.deletedAt).not.toBeNull()
    })
  })

  it('(2) deja borrar un pedido EN_CURSO', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const id = await createOrder(tx, f, { status: 'EN_CURSO' })

      await rawUpdateOrder(tx, id, Prisma.sql`"deleted_at" = CURRENT_TIMESTAMP`)

      const stored = await tx.order.findUniqueOrThrow({
        where: { id },
        select: { deletedAt: true },
      })
      expect(stored.deletedAt).not.toBeNull()
    })
  })

  it('(3) rechaza con 23514 borrar un pedido ENTREGADO', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const id = await createOrder(tx, f, { status: 'ENTREGADO' })

      const sqlState = await expectRejectedByDatabase(
        tx,
        () => rawUpdateOrder(tx, id, Prisma.sql`"deleted_at" = CURRENT_TIMESTAMP`),
        'borrado logico de un pedido ENTREGADO',
      )
      expect(sqlState).toBe(CHECK_VIOLATION)

      const stored = await tx.order.findUniqueOrThrow({
        where: { id },
        select: { deletedAt: true },
      })
      expect(stored.deletedAt).toBeNull()
    })
  })

  it('(4) rechaza con 23514 borrar un pedido CANCELADO', async () => {
    // Es lo que ANADE esta ficha al CHECK de QC-33: se cancela para dejar constancia, asi que
    // borrarlo despues la borraria de las consultas (decision cerrada 9).
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const id = await createOrder(tx, f, {
        status: 'CANCELADO',
        cancellationReason: 'Sin materia prima',
      })

      const sqlState = await expectRejectedByDatabase(
        tx,
        () => rawUpdateOrder(tx, id, Prisma.sql`"deleted_at" = CURRENT_TIMESTAMP`),
        'borrado logico de un pedido CANCELADO',
      )
      expect(sqlState).toBe(CHECK_VIOLATION)

      const stored = await tx.order.findUniqueOrThrow({
        where: { id },
        select: { deletedAt: true, cancellationReason: true },
      })
      expect(stored.deletedAt).toBeNull()
      expect(stored.cancellationReason).toBe('Sin materia prima')
    })
  })

  it('(5) rechaza con 23514 poner ENTREGADO a un pedido ya borrado', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const id = await createOrder(tx, f, { status: 'PENDIENTE' })
      await rawUpdateOrder(tx, id, Prisma.sql`"deleted_at" = CURRENT_TIMESTAMP`)

      const sqlState = await expectRejectedByDatabase(
        tx,
        () => rawUpdateOrder(tx, id, Prisma.sql`"status" = ${asStatus('ENTREGADO')}`),
        'ENTREGADO sobre un pedido ya borrado',
      )
      expect(sqlState).toBe(CHECK_VIOLATION)

      const stored = await tx.order.findUniqueOrThrow({ where: { id }, select: { status: true } })
      expect(stored.status).toBe('PENDIENTE')
    })
  })

  it('(6) rechaza con 23514 poner CANCELADO a un pedido ya borrado', async () => {
    // El `UPDATE` escribe el motivo EN LA MISMA sentencia a proposito: sin el saltaria el CHECK
    // del motivo (`design.md > 3.3`) y este caso dejaria de demostrar el de borrado. Cada caso
    // se construye para que solo una restriccion pueda dispararse.
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const id = await createOrder(tx, f, { status: 'PENDIENTE' })
      await rawUpdateOrder(tx, id, Prisma.sql`"deleted_at" = CURRENT_TIMESTAMP`)

      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          rawUpdateOrder(
            tx,
            id,
            Prisma.sql`"status" = ${asStatus('CANCELADO')}, "cancellation_reason" = ${'Se cancela un pedido borrado'}`,
          ),
        'CANCELADO sobre un pedido ya borrado',
      )
      expect(sqlState).toBe(CHECK_VIOLATION)

      const stored = await tx.order.findUniqueOrThrow({
        where: { id },
        select: { status: true, cancellationReason: true },
      })
      expect(stored.status).toBe('PENDIENTE')
      expect(stored.cancellationReason).toBeNull()
    })
  })
})

describe('el orden del listado, tal como lo escribe el adaptador (R41)', () => {
  it('priority DESC da CRITICA, ALTA, MEDIA, BAJA porque Postgres ordena el enum por su orden de declaracion', async () => {
    // R41. Esto NO es un orden alfabetico —alfabeticamente seria ALTA, BAJA, CRITICA, MEDIA—:
    // Postgres ordena un valor de enum por su POSICION EN LA DECLARACION, que QC-33 R16 fijo de
    // menor a mayor. Por eso reordenar esas cuatro lineas del enum cambiaria el listado, y por
    // eso este caso tiene que correr contra la base y no contra un doble.
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const instante = sameInstantThisYear()

      // Se siembran EN DESORDEN para que el resultado no pueda salir del orden de insercion.
      const baja = await createOrder(tx, f, { priority: 'BAJA', createdAt: instante })
      const critica = await createOrder(tx, f, { priority: 'CRITICA', createdAt: instante })
      const media = await createOrder(tx, f, { priority: 'MEDIA', createdAt: instante })
      const alta = await createOrder(tx, f, { priority: 'ALTA', createdAt: instante })

      const filas = await tx.order.findMany({
        where: { id: { in: [baja, critica, media, alta] }, deletedAt: null },
        select: { id: true, priority: true },
        orderBy: LIST_ORDER_BY,
      })

      expect(filas.map((fila) => fila.priority)).toEqual(['CRITICA', 'ALTA', 'MEDIA', 'BAJA'])
      expect(filas.map((fila) => fila.id)).toEqual([critica, alta, media, baja])
    })
  })

  it('desempata por (order_year, order_sequence): dos pedidos del mismo instante salen siempre en el mismo orden', async () => {
    // R41. `created_at` no es desempate suficiente: dos altas del mismo milisegundo lo empatan,
    // y sin un tercer criterio Postgres puede devolverlas en cualquier orden — que es como un
    // pedido acaba saliendo en dos paginas o en ninguna. La pareja (ano, posicion) es UNICA
    // (indice de QC-33 R21), asi que hace el orden TOTAL.
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const instante = sameInstantThisYear()
      const posicionMayor = freshSequence()
      const posicionMenor = posicionMayor - 100_000

      // El de posicion MAYOR se inserta primero: si el orden dependiera de la insercion o del
      // orden fisico de la tabla, este caso lo veria.
      const segundo = await createOrder(tx, f, {
        priority: 'MEDIA',
        createdAt: instante,
        sequence: posicionMayor,
      })
      const primero = await createOrder(tx, f, {
        priority: 'MEDIA',
        createdAt: instante,
        sequence: posicionMenor,
      })

      const orden = async (): Promise<string[]> => {
        const filas = await tx.order.findMany({
          where: { id: { in: [primero, segundo] }, deletedAt: null },
          select: { id: true },
          orderBy: LIST_ORDER_BY,
        })
        return filas.map((fila) => fila.id)
      }

      expect(await orden()).toEqual([primero, segundo])
      // Estable: la misma consulta sobre el mismo conjunto devuelve el mismo orden.
      expect(await orden()).toEqual([primero, segundo])
    })
  })
})

describe('que devuelven las lecturas (R40)', () => {
  it('un pedido borrado no vuelve ni en la ficha ni en el listado, y su fila sigue entera', async () => {
    // R40. El filtro `deleted_at IS NULL` vive en el `where` del adaptador, y aqui se ejercita
    // contra la base: la fila SIGUE EXISTIENDO entera —el borrado es logico (R31)— y aun asi no
    // vuelve por ninguna de las dos lecturas.
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const sequence = freshSequence()
      const id = await createOrder(tx, f, { status: 'PENDIENTE', sequence })
      await rawUpdateOrder(tx, id, Prisma.sql`"deleted_at" = CURRENT_TIMESTAMP`)

      const ficha = await tx.order.findFirst({ where: { id, deletedAt: null } })
      expect(ficha).toBeNull()

      const listado = await tx.order.findMany({
        where: { id: { in: [id] }, deletedAt: null },
        orderBy: LIST_ORDER_BY,
      })
      expect(listado).toEqual([])

      const cruda = await tx.order.findUniqueOrThrow({ where: { id } })
      expect(cruda.deletedAt).not.toBeNull()
      expect(cruda.orderSequence).toBe(sequence)
    })
  })

  it('un pedido cancelado SI vuelve en las dos, con su motivo', async () => {
    // R40, la otra mitad: para eso el cancelado tiene estado propio en vez de desaparecer.
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const id = await createOrder(tx, f, {
        status: 'CANCELADO',
        cancellationReason: 'El cliente ya no lo necesita',
      })

      const ficha = await tx.order.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, status: true, cancellationReason: true },
      })
      expect(ficha).toEqual({
        id,
        status: 'CANCELADO',
        cancellationReason: 'El cliente ya no lo necesita',
      })

      const listado = await tx.order.findMany({
        where: { id: { in: [id] }, deletedAt: null },
        select: { id: true, status: true, cancellationReason: true },
        orderBy: LIST_ORDER_BY,
      })
      expect(listado).toEqual([
        { id, status: 'CANCELADO', cancellationReason: 'El cliente ya no lo necesita' },
      ])
    })
  })
})

describe('QC-146 — la presentacion del pedido, contra la base (hoy, su linea de reparto)', () => {
  it('R5: la baja logica conserva el reparto', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const id = await createOrder(tx, f, { presentationId: f.presentationId })

      await tx.order.update({ where: { id }, data: { deletedAt: new Date() } })

      const stored = await tx.order.findUniqueOrThrow({
        where: { id },
        select: { presentationLines: { select: { presentationId: true } }, deletedAt: true },
      })
      expect(stored.deletedAt).not.toBeNull()
      expect(stored.presentationLines).toEqual([{ presentationId: f.presentationId }])
    })
  })

  it('R9: editar sustituye la presentacion de la linea por otra de la misma empresa', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const otraPresentacion = (
        await tx.presentation.create({
          data: {
            name: `Tambor ${token()}`,
            nameNormalized: normalizePresentationName(`Tambor ${token()}`),
            unitId: f.unitId,
            companyId: f.companyId,
          },
          select: { id: true },
        })
      ).id
      const id = await createOrder(tx, f, { presentationId: f.presentationId })

      await tx.orderPresentationLine.updateMany({
        where: { orderId: id },
        data: { presentationId: otraPresentacion },
      })

      const stored = await tx.orderPresentationLine.findFirstOrThrow({
        where: { orderId: id },
        select: { presentationId: true },
      })
      expect(stored.presentationId).toBe(otraPresentacion)
      expect(stored.presentationId).not.toBe(f.presentationId)
    })
  })

  it('R14: el alta y la edicion con presentacion no escriben movimientos ni cambian la existencia de los lotes', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const product = await tx.product.create({
        data: {
          name: 'Acido citrico',
          nameNormalized: 'acidocitrico',
          companyId: f.companyId,
          unitId: f.unitId,
        },
        select: { id: true },
      })
      const batch = await tx.productBatch.create({
        data: {
          productId: product.id,
          presentationId: f.presentationId,
          stock: 100,
          unitCost: new Prisma.Decimal('5'),
          lot: '1',
          purchaseDate: new Date('2026-01-01'),
          companyId: f.companyId,
        },
        select: { id: true, stock: true },
      })

      const id = await createOrder(tx, f, { presentationId: f.presentationId })
      await tx.order.update({ where: { id }, data: { priority: 'ALTA' } })
      await tx.orderPresentationLine.updateMany({ where: { orderId: id }, data: { packages: 2 } })

      const stockDespues = await tx.productBatch.findUniqueOrThrow({
        where: { id: batch.id },
        select: { stock: true },
      })
      expect(stockDespues.stock.toFixed(4)).toBe(batch.stock.toFixed(4))
      const movimientos = await tx.inventoryMovement.count({ where: { batchId: batch.id } })
      expect(movimientos).toBe(0)
    })
  })
})

// ---------------------------------------------------------------------------
// QC-138 — alta y edicion que bloquean, contra la base y dentro de la transaccion del caso
// ---------------------------------------------------------------------------

/**
 * Los casos de uso REALES de alta y edicion sobre la transaccion del caso. La unidad de trabajo
 * abre un SAVEPOINT y lo deshace si el trabajo lanza: es lo que hace la transaccion propia de
 * `withOrderTransaction`, y asi «no queda nada escrito» se mide de verdad sin committear. Los
 * adaptadores de dentro (pedido, reservas, receta) son los reales; los catalogos de fuera leen
 * por la misma transaccion porque los reales usan el cliente global y no verian el fixture.
 * El importe no se mide aqui: sin lotes costeables sale siempre nulo.
 */
function casosDeUsoSobre(tx: Prisma.TransactionClient) {
  const unitOfWork: OrderUnitOfWork = {
    async run(work) {
      savepointSeq += 1
      const savepoint = `uow_${String(savepointSeq)}`
      await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`)
      try {
        const result = await work({
          orders: createOrderWriteRepository(tx),
          reservations: createMaterialReservations(tx),
          recipes: createRecipeExecutionReader(tx),
          finishedGoods: createFinishedGoodsIntake(tx),
        })
        await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`)
        return result
      } catch (error) {
        await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`)
        throw error
      }
    },
  }
  const orders = {
    findAliveById: (id: string, scope: { companyId: string }) =>
      createOrderWriteRepository(tx).lockAliveById(id, scope),
  } as unknown as OrderRepository
  const recipes = {
    findRefsIncludingDeleted: async (ids: readonly string[], companyId: string) =>
      (
        await tx.recipe.findMany({
          where: { id: { in: [...ids] }, companyId },
          select: { id: true, name: true, deletedAt: true, parent: { select: { id: true, name: true } } },
        })
      ).map((r) => ({
        id: r.id,
        name: r.name,
        ownName: r.name,
        isDeleted: r.deletedAt !== null,
        // Desde QC-172 el alta distingue original de version: estas recetas son originales.
        isUnderReview: false,
        original: r.parent,
      })),
    findExecutionContentById: createRecipeExecutionReader(tx).findExecutionContentById,
  } as unknown as RecipeCatalog
  const presentations = {
    findRefs: async (ids: readonly string[], companyId: string) =>
      (
        await tx.presentation.findMany({
          where: { id: { in: [...ids] }, companyId },
          select: { id: true, name: true },
        })
      ).map((p) => ({ id: p.id, name: p.name, content: null })),
  } as unknown as PresentationCatalog
  const products = { findRefs: async () => [], findCostingBatches: async () => [] } as unknown as ProductCatalog
  const units = {
    findRefs: async (ids: readonly string[], companyId: string) =>
      (
        await tx.unit.findMany({
          where: { id: { in: [...ids] }, OR: [{ companyId }, { companyId: null }] },
          select: { id: true, name: true, symbol: true, baseUnitId: true, factor: true },
        })
      ).map((u) => ({ ...u, factor: u.factor === null ? null : u.factor.toFixed(4) })),
    findRefsSharingBaseInCompany: async () => [],
    findMassVolumeBridge: () => findMassVolumeBridge(tx),
  } as unknown as UnitCatalog
  const now = () => new Date()
  return {
    createOrder: createCreateOrder({ recipes, products, units, presentations, packaging: packagingCatalog, unitOfWork, now }),
    updateOrder: createUpdateOrder({ orders, recipes, products, units, presentations, packaging: packagingCatalog, unitOfWork, now }),
  }
}

/** Un ingrediente con un solo lote de `stock` y una linea al 100 % en la receta del fixture. */
async function seedIngredient(tx: Prisma.TransactionClient, f: Fixtures, stock: string): Promise<string> {
  const marca = token()
  const product = await tx.product.create({
    data: {
      name: `Ingrediente ${marca}`,
      nameNormalized: `ingrediente${marca}`,
      companyId: f.companyId,
      unitId: f.unitId,
    },
    select: { id: true },
  })
  await tx.productBatch.create({
    data: {
      productId: product.id,
      presentationId: f.presentationId,
      stock: new Prisma.Decimal(stock),
      unitCost: new Prisma.Decimal('5'),
      lot: `L${marca.slice(0, 10)}`,
      purchaseDate: new Date('2026-01-01'),
      companyId: f.companyId,
    },
  })
  await tx.recipeLine.create({
    data: { recipeId: f.recipeId, productId: product.id, percentage: new Prisma.Decimal('100.00') },
  })
  return product.id
}

function actorDelFixture(f: Fixtures): Actor {
  return { id: f.userId, companyId: f.companyId, permissions: ['pedidos.consultar', 'pedidos.modificar'] }
}

function entrada(f: Fixtures, quantity: string, confirmBlocked?: boolean) {
  return {
    recipeId: f.recipeId,
    quantity,
    unitId: f.unitId,
    ...(confirmBlocked === undefined ? {} : { confirmBlocked }),
  }
}

async function codigoDe(promesa: Promise<unknown>): Promise<string | null> {
  return promesa.then(
    () => null,
    (error: unknown) => (error as { code?: string }).code ?? String(error),
  )
}

async function estadoDe(tx: Prisma.TransactionClient, id: string) {
  const row = await tx.order.findUniqueOrThrow({
    where: { id },
    select: { status: true, reservedAt: true, ingredientsCost: true, quantity: true },
  })
  const movimientos = await tx.reservationMovement.findMany({
    where: { orderId: id },
    select: { kind: true, quantity: true, createdBy: true },
    orderBy: { createdAt: 'asc' },
  })
  return {
    status: row.status,
    reservedAt: row.reservedAt,
    ingredientsCost: row.ingredientsCost,
    quantity: row.quantity.toFixed(4),
    movimientos: movimientos.map((m) => ({
      kind: m.kind,
      quantity: m.quantity.toFixed(4),
      createdBy: m.createdBy,
    })),
  }
}

describe('QC-138 — el alta y la edicion bloquean con confirmacion, contra la base', () => {
  it('R1, R6: alta que no alcanza sin confirmacion -> order_would_block y ninguna fila, ni pedido ni movimiento', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      await seedIngredient(tx, f, '5')
      const c = casosDeUsoSobre(tx)

      expect(await codigoDe(c.createOrder(entrada(f, '10'), actorDelFixture(f)))).toBe('order_would_block')

      expect(await tx.order.count({ where: { companyId: f.companyId } })).toBe(0)
      expect(await tx.reservationMovement.count({ where: { companyId: f.companyId } })).toBe(0)
    })
  })

  it('R5, R8: alta confirmada que no alcanza -> BLOQUEADO, sin apartado, reserved_at nulo y sin importe', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      await seedIngredient(tx, f, '5')
      const c = casosDeUsoSobre(tx)

      const creado = await c.createOrder(entrada(f, '10', true), actorDelFixture(f))

      expect(await estadoDe(tx, creado.id)).toEqual({
        status: 'BLOQUEADO',
        reservedAt: null,
        ingredientsCost: null,
        quantity: '10.0000',
        movimientos: [],
      })
    })
  })

  it('R8, R10: alta confirmada que si alcanza -> PENDIENTE con su material apartado', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      await seedIngredient(tx, f, '50')
      const c = casosDeUsoSobre(tx)

      const creado = await c.createOrder(entrada(f, '10', true), actorDelFixture(f))

      const estado = await estadoDe(tx, creado.id)
      expect(estado.status).toBe('PENDIENTE')
      expect(estado.reservedAt).not.toBeNull()
      expect(estado.movimientos).toEqual([{ kind: 'reserve', quantity: '10.0000', createdBy: f.userId }])
    })
  })

  it('R2: receta sin lineas -> PENDIENTE sin pedir confirmacion', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const c = casosDeUsoSobre(tx)

      const creado = await c.createOrder(entrada(f, '10'), actorDelFixture(f))

      const estado = await estadoDe(tx, creado.id)
      expect(estado.status).toBe('PENDIENTE')
      expect(estado.reservedAt).toBeNull()
      expect(estado.movimientos).toEqual([])
    })
  })

  it('R10, R26: editar un BLOQUEADO hasta que alcanza lo desbloquea y aparta', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      await seedIngredient(tx, f, '5')
      const c = casosDeUsoSobre(tx)
      const creado = await c.createOrder(entrada(f, '10', true), actorDelFixture(f))

      await c.updateOrder(creado.id, entrada(f, '4'), actorDelFixture(f))

      const estado = await estadoDe(tx, creado.id)
      expect(estado.status).toBe('PENDIENTE')
      expect(estado.quantity).toBe('4.0000')
      expect(estado.reservedAt).not.toBeNull()
      expect(estado.movimientos).toEqual([{ kind: 'reserve', quantity: '4.0000', createdBy: f.userId }])
    })
  })

  it('R6: editar un PENDIENTE hasta que no alcanza sin confirmacion -> order_would_block y nada cambia', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      await seedIngredient(tx, f, '20')
      const c = casosDeUsoSobre(tx)
      const creado = await c.createOrder(entrada(f, '10'), actorDelFixture(f))
      const antes = await estadoDe(tx, creado.id)

      expect(await codigoDe(c.updateOrder(creado.id, entrada(f, '30'), actorDelFixture(f)))).toBe(
        'order_would_block',
      )

      expect(await estadoDe(tx, creado.id)).toEqual(antes)
    })
  })

  it('R11: un PENDIENTE que pasa a BLOQUEADO libera todo lo apartado con quien edita como autor', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      await seedIngredient(tx, f, '20')
      const c = casosDeUsoSobre(tx)
      const creado = await c.createOrder(entrada(f, '10'), actorDelFixture(f))

      await c.updateOrder(creado.id, entrada(f, '30', true), actorDelFixture(f))

      const estado = await estadoDe(tx, creado.id)
      expect(estado.status).toBe('BLOQUEADO')
      expect(estado.reservedAt).toBeNull()
      expect(estado.ingredientsCost).toBeNull()
      expect(estado.movimientos).toEqual([
        { kind: 'reserve', quantity: '10.0000', createdBy: f.userId },
        { kind: 'release', quantity: '10.0000', createdBy: f.userId },
      ])
    })
  })

  it('R12: un EN_CURSO que deja de alcanzar -> insufficient_material sin escribir nada', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      await seedIngredient(tx, f, '20')
      const c = casosDeUsoSobre(tx)
      const creado = await c.createOrder(entrada(f, '10'), actorDelFixture(f))
      await tx.order.update({ where: { id: creado.id }, data: { status: 'EN_CURSO' } })
      const antes = await estadoDe(tx, creado.id)

      expect(await codigoDe(c.updateOrder(creado.id, entrada(f, '30', true), actorDelFixture(f)))).toBe(
        'insufficient_material',
      )

      expect(await estadoDe(tx, creado.id)).toEqual(antes)
    })
  })
})
