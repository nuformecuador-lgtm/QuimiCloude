/**
 * Tests de integracion de QC-33 (modelo-pedidos) contra una base Postgres REAL, con la
 * migracion `20260903191204_orders` aplicada.
 *
 * Los helpers de aislamiento son copia literal de
 * `tests/integration/recetas/recetas-constraints.int.test.ts` (QC-24) y de
 * `tests/integration/unidades/unidades-constraints.int.test.ts` (QC-32), como manda
 * `tasks.md > T9`. Las razones son las mismas y se repiten aqui para que este archivo se
 * lea solo:
 *
 * AISLAMIENTO — cada `it` corre dentro de `prisma.$transaction` interactiva y termina
 * lanzando `RollbackSignal`, lo que hace que Prisma emita `ROLLBACK`: ninguna fila escrita
 * por un test sobrevive. Se usa la transaccion interactiva de Prisma (y no un cliente `pg`
 * aparte) porque asi se ejercita EXACTAMENTE el camino de datos de la app, y porque
 * `$executeRaw` dentro de la misma transaccion reutiliza la conexion, asi que el SQL crudo
 * comparte el aislamiento.
 *
 * NINGUNA AFIRMACION GLOBAL — no se afirma «la tabla esta vacia» ni «hay N filas en total».
 * Cada test mira solo las filas que el mismo sembro, localizadas por su `id`. `orders` nace
 * vacia hoy, pero manana no lo estara y este archivo no puede depender de eso.
 *
 * CADA CASO SIEMBRA SUS PROPIAS FK — las CUATRO referencias del pedido (`recipe_id` ->
 * `recipes`, `created_by` / `updated_by` -> `users`) son FK REALES
 * aunque el esquema Prisma las declare como escalares sin `@relation` (`design.md > 4`,
 * R33). Por eso cada caso crea dentro de su propia transaccion la presentacion, el producto,
 * la unidad, la receta y el usuario que necesita: NO se depende de ningun seed ni del orden
 * de los archivos.
 *
 * SAVEPOINTS — un error de constraint aborta la transaccion de Postgres entera, y varios
 * casos exigen comprobar el estado DESPUES del rechazo. Por eso toda operacion que se espera
 * que falle se envuelve en un `SAVEPOINT` y se deshace con `ROLLBACK TO SAVEPOINT`, que deja
 * la transaccion viva y permite seguir consultando.
 *
 * SQL CRUDO — TODA operacion que se espera que la base rechace se hace con `$executeRaw`,
 * por dos motivos: (1) omitir una columna obligatoria no se puede expresar con la API tipada
 * (no compilaria), y (2) solo el raw propaga el SQLSTATE de Postgres en `meta.code`. La API
 * tipada lo traduce a su propio codigo (`P2002`, `P2003`…) y el SQLSTATE se pierde
 * (`design.md > 9`). Se afirma sobre el SQLSTATE y NUNCA sobre el texto del mensaje: en esta
 * maquina Postgres responde en espanol. Los caminos felices y las lecturas si van con la API
 * tipada, que es el camino real de la app.
 *
 * EL ANO DEL CORRELATIVO NO SE ESCRIBE A MANO — desde la decision cerrada 28 (R41) existe el
 * CHECK `orders_order_year_matches_created_at`, que exige
 * `order_year = EXTRACT(YEAR FROM (created_at AT TIME ZONE 'UTC'))::int`. Un pedido con
 * `created_at` por defecto SOLO admite el ano UTC de hoy, asi que el helper `createOrder` lo
 * calcula con `new Date().getUTCFullYear()`. Si estos tests escribieran el literal `2026`,
 * la suite entera se pondria roja sola el 1 de enero con un `23514` que nadie sabria leer.
 * LOS UNICOS ANOS LITERALES DE ESTE ARCHIVO estan en los dos casos que fijan `created_at`
 * explicitamente —la frontera de ano de R41 y el reinicio anual de R23—, donde el literal es
 * el punto del test.
 *
 * DECIMALES — `quantity` se maneja como `Prisma.Decimal` y se compara con
 * `.toString()`, o contra `quantity::text` de la propia base. Convertirlos a `number`
 * reintroduciria la coma flotante binaria que `docs/architecture.md > Dominio` n.o 4 prohibe
 * y los tests dejarian de demostrar R6 y R8.
 *
 * SIN TESTS DE RLS — un test de RLS escrito con Prisma sale verde pase lo que pase, porque
 * Prisma se conecta como dueno de las tablas (`design.md > 9`, `docs/architecture.md >
 * Acceso a datos y autorizacion`). R37 se cierra con el test estatico sobre el SQL y con
 * `tests/guards/guard-rls-force.test.ts`, no aqui: escribirlo seria un falso verde.
 *
 * Requisitos cubiertos: R1, R6, R7, R8, R9, R10, R12, R13, R14, R15, R16, R17, R18, R19,
 * R20, R21, R22, R23, R25, R26, R27, R28, R29, R30, R33, R41 y R42.
 */
import { randomUUID } from 'node:crypto'

import { Prisma } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { normalizeCompanyName } from '@/lib/modules/identity'
import { normalizePresentationName } from '@/lib/modules/inventario'
import { prisma } from '@/lib/shared/db/prisma'

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

/** SQLSTATE de Postgres relevantes aqui. Son estables y NO dependen del idioma. */
const NOT_NULL_VIOLATION = '23502'
const FOREIGN_KEY_VIOLATION = '23503'
const UNIQUE_VIOLATION = '23505'
const CHECK_VIOLATION = '23514'
/** `invalid_input_value_for_enum`: un valor que no esta en el tipo enumerado. */
const INVALID_ENUM_VALUE = '22P02'

/**
 * SQLSTATE del error. Se lee de `meta.code` y no del texto: el mensaje de Postgres esta
 * traducido al idioma del servidor (en esta maquina, espanol). Por eso NINGUN test afirma
 * sobre el nombre de la restriccion: se afirma sobre el SQLSTATE y sobre el efecto, y cada
 * caso se construye para que solo una restriccion pueda dispararlo. Los nombres de los
 * CHECK, de los indices y de las FK los vigila `tests/unit/pedidos/schema/`.
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
 * Corre `run` esperando que la base lo rechace. Devuelve el SQLSTATE para que el test afirme
 * sobre el tipo exacto de violacion, y deja la transaccion utilizable.
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

/**
 * Posicion del correlativo que usa `createOrder` cuando el caso no fija una. Crece siempre,
 * asi que dos pedidos del mismo caso nunca chocan por accidente contra el indice unico: el
 * `23505` solo aparece donde el test lo pide a proposito (R21, R22).
 */
let nextSequence = 500_000

/**
 * El ano UTC de HOY. Es el unico ano que admite un pedido con `created_at` por defecto,
 * porque el CHECK `orders_order_year_matches_created_at` (R41, decision cerrada 28) ata las
 * dos columnas. NO se escribe `2026` a mano: ver la cabecera.
 */
function currentUtcYear(): number {
  return new Date().getUTCFullYear()
}

/** Crea una unidad del catalogo. El nombre lleva marcador porque `units_name_normalized_key`
 *  es un indice unico TOTAL y la base local ya trae el catalogo arrancador sembrado. */
async function createUnit(tx: Prisma.TransactionClient): Promise<string> {
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
  return unit.id
}

/** Crea una presentacion del catalogo de `inventario`, de la empresa dada. Necesita su propia
 *  unidad porque `presentations.unit_id` es obligatoria. */
async function createPresentation(tx: Prisma.TransactionClient, companyId: string): Promise<string> {
  const marca = token()
  const unitId = await createUnit(tx)
  const name = `Bidon ${marca}`
  const presentation = await tx.presentation.create({
    data: {
      name,
      nameNormalized: normalizePresentationName(name),
      unitId,
      companyId,
    },
    select: { id: true },
  })
  return presentation.id
}

/**
 * Crea un usuario completo con su tipo de documento y su rol propios. Los nombres y codigos
 * se aleatorizan porque `roles.name` es unico global y `users` tiene indices unicos parciales
 * sobre correo, nombre de usuario y documento (QC-4).
 */
async function createUser(tx: Prisma.TransactionClient): Promise<string> {
  const marca = token()
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
  return user.id
}

/** Todo lo que un pedido necesita al otro lado de sus cuatro FK, mas el producto que da
 *  contexto real a la receta. */
interface Fixtures {
  /** QC-60: `orders.company_id` es NOT NULL, asi que el pedido nace en la empresa del fixture. */
  readonly companyId: string
  readonly productId: string
  readonly unitId: string
  readonly recipeId: string
  readonly userId: string
  /** Presentacion de la MISMA empresa que el pedido, lista para el describe «la presentacion
   *  del pedido». */
  readonly presentationId: string
}

/**
 * Siembra, DENTRO de la transaccion del caso, el producto, la unidad, la receta y el usuario
 * (`tasks.md > T9`). Nada de esto viene de un seed.
 *
 * OJO — la receta se crea SIN lineas a proposito. Asi, en el caso de R15, lo UNICO que puede
 * bloquear su borrado fisico es el pedido: si la receta tuviera lineas, el `23503` podria
 * venir de `recipe_lines` y el test dejaria de demostrar `orders_recipe_id_fkey`.
 */
async function seedFixtures(tx: Prisma.TransactionClient): Promise<Fixtures> {
  const marca = token()
  // QC-49 R1: `products.company_id` es NOT NULL con FK a `companies`, asi que el andamiaje
  // necesita su propia empresa efimera. NUNCA la de instalacion: `companies_name_unique` es
  // global y el nombre chocaria con el que siembra `db:seed`.
  const companyName = `Empresa producto ${marca}`
  const company = await tx.company.create({
    data: { name: companyName, nameNormalized: normalizeCompanyName(companyName) },
    select: { id: true },
  })
  const product = await tx.product.create({
    // `name_normalized` (QC-57) es NOT NULL y se pasa LITERAL, sin llamar a
    // `normalizeProductName`: mismo criterio que el resto de nombres normalizados de este
    // archivo. Aqui el producto es solo andamiaje de la receta del pedido.
    data: {
      name: 'Acido citrico monohidratado',
      nameNormalized: 'acidocitricomonohidratado',
      companyId: company.id,
    },
    select: { id: true },
  })
  const unitId = await createUnit(tx)
  const recipe = await tx.recipe.create({
    data: { name: `Receta ${marca}`, nameNormalized: `receta${marca}`, companyId: company.id },
    select: { id: true },
  })
  const userId = await createUser(tx)
  const presentationId = await createPresentation(tx, company.id)
  return {
    companyId: company.id,
    productId: product.id,
    unitId,
    recipeId: recipe.id,
    userId,
    presentationId,
  }
}

type OrderStatusValue = 'PENDIENTE' | 'EN_CURSO' | 'ENTREGADO' | 'BLOQUEADO'
type OrderPriorityValue = 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA'

interface OrderSeed {
  readonly companyId: string
  readonly recipeId: string
  readonly year?: number
  readonly sequence?: number
  readonly quantity?: string
  readonly status?: OrderStatusValue
  readonly priority?: OrderPriorityValue
  readonly createdBy?: string | null
  readonly updatedBy?: string | null
  readonly presentationId?: string | null
}

/**
 * Crea un pedido con la API tipada (camino feliz = camino real de la app). El ano por defecto
 * es el UTC de HOY, nunca un literal: ver la cabecera y `design.md > 3`.
 */
async function createOrder(tx: Prisma.TransactionClient, seed: OrderSeed): Promise<string> {
  nextSequence += 1
  const order = await tx.order.create({
    data: {
      companyId: seed.companyId,
      orderYear: seed.year ?? currentUtcYear(),
      orderSequence: seed.sequence ?? nextSequence,
      recipeId: seed.recipeId,

      quantity: new Prisma.Decimal(seed.quantity ?? '10'),
      status: seed.status,
      priority: seed.priority,
      createdBy: seed.createdBy ?? null,
      updatedBy: seed.updatedBy ?? null,
      presentationId: seed.presentationId ?? null,
    },
    select: { id: true },
  })
  return order.id
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
  | 'created_by'
  | 'updated_by'
  | 'created_at'
  | 'deleted_at'
  | 'presentation_id'

/**
 * `INSERT` crudo en `orders`. `columns` decide que se escribe: omitir una entrada es
 * exactamente el caso «falta un dato obligatorio», que la API tipada no deja ni compilar.
 * `updated_at` se da siempre porque es NOT NULL SIN DEFAULT (lo rellena el cliente Prisma via
 * `@updatedAt`, no la base).
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

/**
 * Las columnas obligatorias de un pedido valido, listas para un `INSERT` crudo. Cada caso
 * sobreescribe o elimina la que quiere poner a prueba, y asi solo una restriccion puede
 * dispararse.
 */
function baseColumns(f: Fixtures, sequence: number): Partial<Record<WritableColumn, Prisma.Sql>> {
  return {
    company_id: asUuid(f.companyId),
    order_year: Prisma.sql`${currentUtcYear()}`,
    order_sequence: Prisma.sql`${sequence}`,
    recipe_id: asUuid(f.recipeId),
    quantity: asDecimal('10'),
  }
}

/** Posicion irrepetible para un alta cruda. */
function freshSequence(): number {
  nextSequence += 1
  return nextSequence
}

// ---------------------------------------------------------------------------

beforeAll(async () => {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'orders'`
  if (tables.length !== 1) {
    throw new Error(
      'la base de pruebas no tiene aplicada la migracion de QC-33 (tabla `orders`). ' +
        'Corre `pnpm run db:migrate` antes de estos tests.',
    )
  }
})

afterAll(async () => {
  await prisma.$disconnect()
})

// ---------------------------------------------------------------------------

describe('el pedido como fila completa', () => {
  it('crea un pedido completo y lo relee sin perdida', async () => {
    // R1: identificador propio y no derivado, receta, cantidad, unidad, precio unitario,
    // prioridad y estado.
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const id = await createOrder(tx, {
        companyId: f.companyId,
        recipeId: f.recipeId,
        quantity: '12.5000',
        status: 'EN_CURSO',
        priority: 'ALTA',
        createdBy: f.userId,
      })

      const stored = await tx.order.findUniqueOrThrow({ where: { id } })
      expect(stored.id).toMatch(UUID_SHAPE)
      expect(stored.recipeId).toBe(f.recipeId)
      expect(stored.quantity.toString()).toBe('12.5')
      expect(stored.status).toBe('EN_CURSO')
      expect(stored.priority).toBe('ALTA')
      expect(stored.createdBy).toBe(f.userId)
      expect(stored.orderYear).toBe(currentUtcYear())
      expect(stored.orderSequence).toBeGreaterThan(0)
      expect(stored.deletedAt).toBeNull()
    })
  })

  it('la tabla real no tiene ninguna columna de total, subtotal, impuesto ni cliente', async () => {
    // R10 (y de paso R3 y R11) leidos contra `information_schema`, no contra el texto del
    // esquema: es la unica forma de que la AUSENCIA se compruebe donde de verdad importa.
    // La lista se lee entera para que anadir una columna prohibida se vea aqui.
    const columns = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'orders'`
    const names = columns.map((c) => c.column_name).sort()
    expect(names).toEqual([
      // `cancellation_reason` la anade QC-34 (su R48, decision cerrada 4): es la UNICA columna
      // que esa ficha puede anadir a `orders`. Aparece la PRIMERA porque el `sort()` es
      // lexicografico y 'ca' < 'cr'. Sigue sin haber total, subtotal, impuesto ni cliente.
      'cancellation_reason',
      // `company_id` la anade QC-60 (R1): la empresa del pedido. No es un total, un impuesto ni un
      // cliente. Va entre las dos por el mismo `sort()` lexicografico ('ca' < 'co' < 'cr').
      'company_id',
      'created_at',
      'created_by',
      'deleted_at',
      // `finished_at` es el instante en que el pedido paso a ENTREGADO al finalizarlo en
      // planta: no es un total, un subtotal, un impuesto ni un cliente. Entre `deleted_at` e
      // `id` por el mismo `sort()` lexicografico ('d' < 'f' < 'i').
      'finished_at',
      'id',
      // `ingredients_cost` es el COSTE DE LOS INGREDIENTES, leido de los lotes vigentes al
      // guardar: no es un precio de venta, ni un total, ni un subtotal, ni un impuesto. Entre
      // `id` y `order_sequence` por el mismo `sort()` lexicografico ('id' < 'in' < 'or').
      'ingredients_cost',
      'order_sequence',
      'order_year',
      // `packed_by` es quien tiene el pedido en empaque: no es un total, un impuesto ni un
      // cliente. Entre `order_year` y `presentation_content` por el mismo `sort()`
      // lexicografico ('order_year' < 'packed_by' < 'presentation_c').
      'packed_by',
      // `presentation_content` es la copia del contenido de la presentacion:
      // no es un total, un impuesto ni un cliente. Antes de `presentation_id` por el mismo
      // `sort()` lexicografico ('presentation_c' < 'presentation_i').
      'presentation_content',
      // `presentation_id` es el envase en que se entrega lo fabricado, opcional: no es un
      // total, un impuesto ni un cliente. Entre `order_year` y `priority` por el mismo
      // `sort()` lexicografico ('presentation' < 'priority').
      'presentation_id',
      'priority',
      'quantity',
      'recipe_id',
      // `reserved_at`: el instante desde el que cuenta la caducidad de la reserva, o `null` si
      // el pedido no tiene material apartado.
      'reserved_at',
      'status',
      'updated_at',
      'updated_by',
    ])
  })
})

describe('la cantidad', () => {
  it('guarda y relee una cantidad con cuatro decimales sin perdida', async () => {
    // R6: `decimal(14,4)`, nunca coma flotante binaria.
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const id = await createOrder(tx, {
        companyId: f.companyId,
        recipeId: f.recipeId,
        quantity: '1234567890.1234',
      })

      const stored = await tx.order.findUniqueOrThrow({ where: { id }, select: { quantity: true } })
      expect(stored.quantity.toString()).toBe('1234567890.1234')

      // Y tal como la ve la propia base, sin pasar por ningun `number` de JavaScript.
      const [row] = await tx.$queryRaw<{ quantity: string }[]>`
        SELECT "quantity"::text AS quantity FROM "orders" WHERE "id" = CAST(${id} AS uuid)`
      expect(row.quantity).toBe('1234567890.1234')
    })
  })

  // QC-35bis (2026-09-07): aqui vivia el caso gemelo del PRECIO UNITARIO con cuatro decimales.
  // La columna `unit_price` se dropeo con la decision humana, asi que no queda decimal que
  // comprobar aparte de la cantidad, justo encima.

  it('rechaza cantidad cero, negativa y ausente con SQLSTATE 23514 / 23502', async () => {
    // R7: `> 0`, ni cero ni negativa. La ausencia la para el NOT NULL, no el CHECK.
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)

      const cero = await expectRejectedByDatabase(
        tx,
        () => rawInsertOrder(tx, { ...baseColumns(f, freshSequence()), quantity: asDecimal('0') }),
        'cantidad cero',
      )
      expect(cero).toBe(CHECK_VIOLATION)

      const negativa = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsertOrder(tx, { ...baseColumns(f, freshSequence()), quantity: asDecimal('-0.0001') }),
        'cantidad negativa',
      )
      expect(negativa).toBe(CHECK_VIOLATION)

      const columnas = baseColumns(f, freshSequence())
      delete columnas.quantity
      const ausente = await expectRejectedByDatabase(
        tx,
        () => rawInsertOrder(tx, columnas),
        'cantidad ausente',
      )
      expect(ausente).toBe(NOT_NULL_VIOLATION)
    })
  })

  // QC-35bis (2026-09-07): aqui vivia «rechaza un precio negativo con 23514, acepta el precio
  // cero y rechaza el precio ausente con 23502». El CHECK `orders_unit_price_non_negative` y su
  // columna se fueron en la migracion `20260907120000_orders_drop_unit_and_unit_price`, asi que
  // el caso se quedo sin restriccion que ejercitar. El de la CANTIDAD -que es el que separa el
  // `> 0` del `>= 0`- sigue justo encima, intacto.
})

describe('la unidad y la receta', () => {
  // QC-35bis (2026-09-07): aqui vivian los dos casos de la UNIDAD -«rechaza un pedido sin
  // unidad (23502) y con unit_id inexistente (23503)» y «rechaza el borrado de una unidad usada
  // por un pedido con 23503»-. La columna `unit_id` y su FK `orders_unit_id_fkey` se fueron con
  // la decision humana, y con ellas la unica frontera de `orders` hacia `units`. Los dos casos
  // equivalentes de la RECETA -NOT NULL, FK y ON DELETE RESTRICT- siguen debajo y son los que
  // sostienen ahora esa clase de garantia.


  it('rechaza un pedido sin receta (23502) y con recipe_id inexistente (23503)', async () => {
    // R14: la receta es obligatoria y tiene que existir.
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)

      const columnas = baseColumns(f, freshSequence())
      delete columnas.recipe_id
      const sinReceta = await expectRejectedByDatabase(
        tx,
        () => rawInsertOrder(tx, columnas),
        'pedido sin receta',
      )
      expect(sinReceta).toBe(NOT_NULL_VIOLATION)

      const inexistente = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsertOrder(tx, {
            ...baseColumns(f, freshSequence()),
            recipe_id: asUuid(randomUUID()),
          }),
        'pedido con receta inexistente',
      )
      expect(inexistente).toBe(FOREIGN_KEY_VIOLATION)
    })
  })

  it('una receta borrada logicamente deja el pedido intacto apuntando a ella; el borrado FISICO de esa receta se rechaza con 23503', async () => {
    // R15: el borrado de receta es LOGICO (QC-24), asi que la FK ni se entera —una FK no
    // reacciona a un UPDATE— y el pedido conserva su referencia. El RESTRICT existe para que
    // una purga o un DELETE por consola no deje pedidos apuntando al vacio.
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const orderId = await createOrder(tx, {
        companyId: f.companyId,
        recipeId: f.recipeId,
        quantity: '7.5000',
      })

      await tx.recipe.update({ where: { id: f.recipeId }, data: { deletedAt: new Date() } })

      const stored = await tx.order.findUniqueOrThrow({ where: { id: orderId } })
      expect(stored.recipeId).toBe(f.recipeId)
      expect(stored.deletedAt).toBeNull()
      expect(stored.quantity.toString()).toBe('7.5')

      const fisico = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`DELETE FROM "recipes" WHERE "id" = CAST(${f.recipeId} AS uuid)`,
        'borrado fisico de una receta usada por un pedido',
      )
      expect(fisico).toBe(FOREIGN_KEY_VIOLATION)

      expect(await tx.recipe.count({ where: { id: f.recipeId } })).toBe(1)
    })
  })
})

describe('el estado y la prioridad', () => {
  it('rechaza un estado y una prioridad fuera del enum con SQLSTATE 22P02', async () => {
    // R16: los dos conjuntos son CERRADOS en el propio esquema. `DEVUELTO` y `URGENTE` son
    // dos valores plausibles que alguien pedira algun dia: hoy son una migracion del tipo,
    // no un INSERT.
    //
    // El ejemplo del estado ERA `CANCELADO` y lo cambio QC-34 (T7), no por relajar nada, sino
    // porque su migracion `..._order_cancellation` hizo EXACTAMENTE la migracion del tipo que
    // este comentario anticipaba: `CANCELADO` ya esta en `OrderStatus`, asi que ha dejado de
    // servir como «valor fuera del enum» -de hecho hoy caeria con 23514, el CHECK del motivo de
    // QC-34 R30, y no con 22P02-. `DEVUELTO` sigue sin existir en el tipo y por tanto sigue
    // demostrando que el conjunto es cerrado.
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)

      const estado = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsertOrder(tx, {
            ...baseColumns(f, freshSequence()),
            status: Prisma.raw(`CAST('DEVUELTO' AS "OrderStatus")`),
          }),
        'estado fuera del enum',
      )
      expect(estado).toBe(INVALID_ENUM_VALUE)

      const prioridad = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsertOrder(tx, {
            ...baseColumns(f, freshSequence()),
            priority: Prisma.raw(`CAST('URGENTE' AS "OrderPriority")`),
          }),
        'prioridad fuera del enum',
      )
      expect(prioridad).toBe(INVALID_ENUM_VALUE)
    })
  })

  it('un pedido insertado sin estado queda PENDIENTE', async () => {
    // R17: el estado es obligatorio y su defecto lo pone la BASE, no el cliente. Por eso el
    // alta va cruda, omitiendo la columna: con la API tipada el defecto podria venir de
    // Prisma y el test no demostraria nada de la base.
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const id = randomUUID()

      await rawInsertOrder(tx, { ...baseColumns(f, freshSequence()), id: asUuid(id) })

      const stored = await tx.order.findUniqueOrThrow({ where: { id }, select: { status: true } })
      expect(stored.status).toBe('PENDIENTE')
    })
  })

  it('un pedido insertado sin prioridad queda BAJA, no NULL', async () => {
    // R18: «opcional» es opcional EN LA ENTRADA. En la columna, ausencia de valor y
    // «prioridad baja» serian dos cosas distintas que significan lo mismo.
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const id = randomUUID()

      await rawInsertOrder(tx, { ...baseColumns(f, freshSequence()), id: asUuid(id) })

      const stored = await tx.order.findUniqueOrThrow({ where: { id }, select: { priority: true } })
      expect(stored.priority).toBe('BAJA')

      const [row] = await tx.$queryRaw<{ nulo: boolean }[]>`
        SELECT ("priority" IS NULL) AS nulo FROM "orders" WHERE "id" = CAST(${id} AS uuid)`
      expect(row.nulo).toBe(false)
    })
  })

  it('la base acepta pasar de PENDIENTE a ENTREGADO y de ENTREGADO a PENDIENTE', async () => {
    // R19: el esquema NO restringe las transiciones. Cuales son validas es de QC-34, y este
    // test es lo que demuestra que hoy la base no decide por adelantado.
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const id = await createOrder(tx, { companyId: f.companyId, recipeId: f.recipeId })

      const entregado = await tx.order.update({
        where: { id },
        data: { status: 'ENTREGADO' },
        select: { status: true },
      })
      expect(entregado.status).toBe('ENTREGADO')

      const pendiente = await tx.order.update({
        where: { id },
        data: { status: 'PENDIENTE' },
        select: { status: true },
      })
      expect(pendiente.status).toBe('PENDIENTE')

      // Y tambien el salto que se salta el paso intermedio, en los dos sentidos.
      const enCurso = await tx.order.update({
        where: { id },
        data: { status: 'EN_CURSO' },
        select: { status: true },
      })
      expect(enCurso.status).toBe('EN_CURSO')
    })
  })
})

describe('el correlativo por ano', () => {
  it('rechaza un pedido sin ano, sin posicion (23502) y con posicion cero o negativa (23514)', async () => {
    // R20: el correlativo son dos enteros obligatorios y la posicion es positiva.
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)

      const sinAno = baseColumns(f, freshSequence())
      delete sinAno.order_year
      expect(
        await expectRejectedByDatabase(tx, () => rawInsertOrder(tx, sinAno), 'pedido sin ano'),
      ).toBe(NOT_NULL_VIOLATION)

      const sinPosicion = baseColumns(f, freshSequence())
      delete sinPosicion.order_sequence
      expect(
        await expectRejectedByDatabase(
          tx,
          () => rawInsertOrder(tx, sinPosicion),
          'pedido sin posicion',
        ),
      ).toBe(NOT_NULL_VIOLATION)

      expect(
        await expectRejectedByDatabase(
          tx,
          () =>
            rawInsertOrder(tx, { ...baseColumns(f, freshSequence()), order_sequence: Prisma.sql`0` }),
          'posicion cero',
        ),
      ).toBe(CHECK_VIOLATION)

      expect(
        await expectRejectedByDatabase(
          tx,
          () =>
            rawInsertOrder(tx, {
              ...baseColumns(f, freshSequence()),
              order_sequence: Prisma.sql`-1`,
            }),
          'posicion negativa',
        ),
      ).toBe(CHECK_VIOLATION)
    })
  })

  it('rechaza un segundo pedido con el mismo ano y posicion con SQLSTATE 23505', async () => {
    // R21: la unica garantia real es el indice unico. No hay comprobacion previa por
    // igualdad, que seria una carrera entre el SELECT y el INSERT.
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const sequence = freshSequence()

      const id = await createOrder(tx, { companyId: f.companyId, recipeId: f.recipeId, sequence })

      const duplicado = await expectRejectedByDatabase(
        tx,
        () => rawInsertOrder(tx, baseColumns(f, sequence)),
        'segundo pedido con el mismo ano y posicion',
      )
      expect(duplicado).toBe(UNIQUE_VIOLATION)

      // Y no se creo ninguna fila de mas: sigue habiendo exactamente la primera.
      const filas = await tx.order.findMany({
        where: { orderYear: currentUtcYear(), orderSequence: sequence },
        select: { id: true },
      })
      expect(filas.map((r) => r.id)).toEqual([id])
    })
  })

  it('tras borrar logicamente el pedido (2026, 1), un segundo (2026, 1) sigue fallando con 23505', async () => {
    // R22: EL INDICE ES TOTAL, sin `WHERE "deleted_at" IS NULL`. Es lo CONTRARIO de
    // `recipes_name_unique` (QC-24 R9), que si es parcial y libera el nombre al borrar. Un
    // numero de pedido no se reutiliza nunca, ni siquiera despues del borrado logico: este es
    // el caso que distingue esta ficha de QC-24, y sin el el indice podria volverse parcial
    // sin que nadie se entere.
    //
    // El ano es el UTC de HOY, no el literal 2026: lo exige el CHECK de R41 (ver cabecera).
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const sequence = freshSequence()

      const id = await createOrder(tx, { companyId: f.companyId, recipeId: f.recipeId, sequence })
      await tx.order.update({ where: { id }, data: { deletedAt: new Date() } })

      const borrado = await tx.order.findUniqueOrThrow({
        where: { id },
        select: { deletedAt: true },
      })
      expect(borrado.deletedAt).not.toBeNull()

      const segundo = await expectRejectedByDatabase(
        tx,
        () => rawInsertOrder(tx, baseColumns(f, sequence)),
        'segundo pedido con el correlativo de uno borrado logicamente',
      )
      expect(segundo).toBe(UNIQUE_VIOLATION)
    })
  })

  it('acepta (2026, 1) y (2027, 1) a la vez', async () => {
    // R23: la numeracion se reinicia cada ano, y sale gratis de que el ano este EN el indice.
    //
    // ESTE CASO SI USA ANOS LITERALES, a proposito: para que dos pedidos de anos DISTINTOS
    // convivan hace falta fijar `created_at` en cada uno, porque el CHECK de R41 ata el ano
    // del correlativo al ano UTC de la fecha de creacion. Con la fecha por defecto los dos
    // pedidos serian del mismo ano y el caso no probaria el reinicio.
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const de2026 = randomUUID()
      const de2027 = randomUUID()

      await rawInsertOrder(tx, {
        ...baseColumns(f, 1),
        id: asUuid(de2026),
        order_year: Prisma.sql`2026`,
        created_at: asTimestamptz('2026-06-15T12:00:00Z'),
      })
      await rawInsertOrder(tx, {
        ...baseColumns(f, 1),
        id: asUuid(de2027),
        order_year: Prisma.sql`2027`,
        created_at: asTimestamptz('2027-06-15T12:00:00Z'),
      })

      const filas = await tx.order.findMany({
        where: { id: { in: [de2026, de2027] } },
        select: { orderYear: true, orderSequence: true },
        orderBy: { orderYear: 'asc' },
      })
      expect(filas).toEqual([
        { orderYear: 2026, orderSequence: 1 },
        { orderYear: 2027, orderSequence: 1 },
      ])
    })
  })

  it('acepta (2026, 1) y despues (2026, 5): los huecos no se rechazan ni se rellenan', async () => {
    // R42 (decision cerrada 27): una AUSENCIA de restriccion solo se demuestra ejerciendola.
    // Si algun dia alguien anadiera un trigger o un CHECK de continuidad «para que el
    // correlativo no tenga saltos», este test se pondria rojo, que es justo lo que se quiere.
    //
    // El ano es el UTC de HOY (helper), no el literal 2026: el titulo viene de la tabla de
    // trazabilidad, la fila no.
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const primero = await createOrder(tx, {
        companyId: f.companyId,
        recipeId: f.recipeId,
        sequence: 1,
      })
      const quinto = await createOrder(tx, { companyId: f.companyId, recipeId: f.recipeId, sequence: 5 })

      const filas = await tx.order.findMany({
        where: { id: { in: [primero, quinto] } },
        select: { orderYear: true, orderSequence: true },
        orderBy: { orderSequence: 'asc' },
      })
      expect(filas).toEqual([
        { orderYear: currentUtcYear(), orderSequence: 1 },
        { orderYear: currentUtcYear(), orderSequence: 5 },
      ])

      // Y el hueco sigue libre: nadie lo relleno por su cuenta.
      const tres = await tx.order.count({
        where: { orderYear: currentUtcYear(), orderSequence: 3 },
      })
      expect(tres).toBe(0)
    })
  })

  it('con created_at el 31/12/2026 a las 20:00 de Ecuador —2027 en UTC— rechaza order_year 2026 con 23514 y acepta 2027', async () => {
    // R41 (decision cerrada 28). ESTE ES EL CASO QUE MUERDE, y el unico junto con el de R23
    // que escribe anos literales: la fecha tambien es literal, y ahi esta el punto.
    //
    // `2026-12-31T20:00:00-05:00` es `2027-01-01T01:00:00Z`. Quien mira el reloj de la pared
    // en Ecuador diria que el pedido es de 2026; el CHECK dice que es de 2027, porque el ano
    // del correlativo tiene UNA sola definicion y esta medida en UTC. Sin el
    // `AT TIME ZONE 'UTC'` del constraint, este par de afirmaciones cambiaria de resultado
    // segun el `TimeZone` de la conexion.
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const enLaFrontera = asTimestamptz('2026-12-31T20:00:00-05:00')

      const conElAnoLocal = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsertOrder(tx, {
            ...baseColumns(f, 1),
            order_year: Prisma.sql`2026`,
            created_at: enLaFrontera,
          }),
        'pedido de 2027 en UTC numerado como 2026',
      )
      expect(conElAnoLocal).toBe(CHECK_VIOLATION)

      const id = randomUUID()
      await rawInsertOrder(tx, {
        ...baseColumns(f, 1),
        id: asUuid(id),
        order_year: Prisma.sql`2027`,
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

describe('la autoria, el borrado logico y las marcas de tiempo', () => {
  it('rechaza un autor inexistente con 23503', async () => {
    // R25: `created_by` y `updated_by` son FK REALES a `users` aunque Prisma las declare como
    // escalares sin `@relation`.
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)

      const creador = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsertOrder(tx, {
            ...baseColumns(f, freshSequence()),
            created_by: asUuid(randomUUID()),
          }),
        'pedido con autor de creacion inexistente',
      )
      expect(creador).toBe(FOREIGN_KEY_VIOLATION)

      const modificador = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsertOrder(tx, {
            ...baseColumns(f, freshSequence()),
            updated_by: asUuid(randomUUID()),
          }),
        'pedido con autor de modificacion inexistente',
      )
      expect(modificador).toBe(FOREIGN_KEY_VIOLATION)
    })
  })

  it('acepta un pedido sin autor y lo relee con ausencia de valor', async () => {
    // R26: NULL significa «no lo creo una persona» —una importacion, un seed—, no «se perdio
    // el dato». Que la columna sea anulable no afloja la FK: en SQL una FK solo se verifica
    // cuando la columna tiene valor.
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const id = await createOrder(tx, { companyId: f.companyId, recipeId: f.recipeId })

      const stored = await tx.order.findUniqueOrThrow({
        where: { id },
        select: { createdBy: true, updatedBy: true },
      })
      expect(stored.createdBy).toBeNull()
      expect(stored.updatedBy).toBeNull()
    })
  })

  it('tras el borrado logico la fila sigue completa, con su instante de borrado y su correlativo', async () => {
    // R27: borrar un pedido no elimina ninguno de sus datos ni libera su numero.
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const sequence = freshSequence()
      const id = await createOrder(tx, {
        companyId: f.companyId,
        recipeId: f.recipeId,
        sequence,
        quantity: '3.2500',
        priority: 'CRITICA',
        createdBy: f.userId,
      })

      await tx.order.update({ where: { id }, data: { deletedAt: new Date() } })

      const stored = await tx.order.findUniqueOrThrow({ where: { id } })
      expect(stored.deletedAt).not.toBeNull()
      expect(stored.orderYear).toBe(currentUtcYear())
      expect(stored.orderSequence).toBe(sequence)
      expect(stored.recipeId).toBe(f.recipeId)
      expect(stored.quantity.toString()).toBe('3.25')
      expect(stored.priority).toBe('CRITICA')
      expect(stored.createdBy).toBe(f.userId)
    })
  })

  it('created_at y updated_at se rellenan solos y updated_at cambia al modificar', async () => {
    // R28. `created_at` lo pone la BASE (`DEFAULT CURRENT_TIMESTAMP`); `updated_at` lo pone el
    // cliente Prisma via `@updatedAt`, porque la columna es NOT NULL SIN DEFAULT y no hay
    // trigger. Por eso este caso va entero con la API tipada: es el unico camino por el que
    // `updated_at` se mantiene solo.
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const id = await createOrder(tx, { companyId: f.companyId, recipeId: f.recipeId })

      const antes = await tx.order.findUniqueOrThrow({
        where: { id },
        select: { createdAt: true, updatedAt: true },
      })
      expect(antes.createdAt).toBeInstanceOf(Date)
      expect(antes.updatedAt).toBeInstanceOf(Date)

      // Espera corta para que las dos marcas no puedan caer en el mismo milisegundo: lo que
      // se prueba es que la segunda AVANZA, no la resolucion del reloj.
      await new Promise((resolve) => setTimeout(resolve, 10))

      const despues = await tx.order.update({
        where: { id },
        data: { priority: 'MEDIA' },
        select: { createdAt: true, updatedAt: true },
      })
      expect(despues.createdAt.getTime()).toBe(antes.createdAt.getTime())
      expect(despues.updatedAt.getTime()).toBeGreaterThan(antes.updatedAt.getTime())
    })
  })
})

describe('el CHECK del pedido entregado', () => {
  it('rechaza borrar un ENTREGADO con 23514, y rechaza poner ENTREGADO a uno ya borrado', async () => {
    // R29 (decision cerrada 14), leido en sus DOS sentidos: la condicion
    // `deleted_at IS NULL OR status <> 'ENTREGADO'` es simetrica y bloquea el UPDATE por los
    // dos lados. Van crudos porque son operaciones que la base debe rechazar.
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)

      // (a) un pedido ENTREGADO no se puede borrar.
      const entregado = await createOrder(tx, {
        companyId: f.companyId,
        recipeId: f.recipeId,
        status: 'ENTREGADO',
      })
      const alBorrar = await expectRejectedByDatabase(
        tx,
        () =>
          tx.$executeRaw`UPDATE "orders" SET "deleted_at" = CURRENT_TIMESTAMP WHERE "id" = CAST(${entregado} AS uuid)`,
        'borrado logico de un pedido ENTREGADO',
      )
      expect(alBorrar).toBe(CHECK_VIOLATION)
      const sigueVivo = await tx.order.findUniqueOrThrow({
        where: { id: entregado },
        select: { deletedAt: true, status: true },
      })
      expect(sigueVivo.deletedAt).toBeNull()
      expect(sigueVivo.status).toBe('ENTREGADO')

      // (b) un pedido ya borrado no se puede entregar.
      const borrado = await createOrder(tx, { companyId: f.companyId, recipeId: f.recipeId })
      await tx.order.update({ where: { id: borrado }, data: { deletedAt: new Date() } })
      const alEntregar = await expectRejectedByDatabase(
        tx,
        () =>
          tx.$executeRaw`UPDATE "orders" SET "status" = 'ENTREGADO' WHERE "id" = CAST(${borrado} AS uuid)`,
        'poner ENTREGADO un pedido ya borrado',
      )
      expect(alEntregar).toBe(CHECK_VIOLATION)
      const sigueBorrado = await tx.order.findUniqueOrThrow({
        where: { id: borrado },
        select: { status: true },
      })
      expect(sigueBorrado.status).toBe('PENDIENTE')

      // (c) y el INSERT que nace con las dos cosas a la vez tampoco pasa.
      const alNacer = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsertOrder(tx, {
            ...baseColumns(f, freshSequence()),
            status: Prisma.raw(`CAST('ENTREGADO' AS "OrderStatus")`),
            deleted_at: Prisma.sql`CURRENT_TIMESTAMP`,
          }),
        'pedido que nace ENTREGADO y borrado',
      )
      expect(alNacer).toBe(CHECK_VIOLATION)
    })
  })

  it('acepta borrar logicamente un PENDIENTE y un EN_CURSO, y acepta poner ENTREGADO a un pedido vivo', async () => {
    // R30: el CHECK alcanza SOLO a `ENTREGADO`. Sin este caso, un CHECK demasiado estricto
    // —uno que prohibiera cualquier borrado logico— pasaria el test de R29 sin que nadie lo
    // notara hasta produccion.
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)

      const pendiente = await createOrder(tx, { companyId: f.companyId, recipeId: f.recipeId })
      const borradoPendiente = await tx.order.update({
        where: { id: pendiente },
        data: { deletedAt: new Date() },
        select: { deletedAt: true, status: true },
      })
      expect(borradoPendiente.deletedAt).not.toBeNull()
      expect(borradoPendiente.status).toBe('PENDIENTE')

      const enCurso = await createOrder(tx, {
        companyId: f.companyId,
        recipeId: f.recipeId,
        status: 'EN_CURSO',
      })
      const borradoEnCurso = await tx.order.update({
        where: { id: enCurso },
        data: { deletedAt: new Date() },
        select: { deletedAt: true, status: true },
      })
      expect(borradoEnCurso.deletedAt).not.toBeNull()
      expect(borradoEnCurso.status).toBe('EN_CURSO')

      const vivo = await createOrder(tx, { companyId: f.companyId, recipeId: f.recipeId })
      const entregado = await tx.order.update({
        where: { id: vivo },
        data: { status: 'ENTREGADO' },
        select: { status: true, deletedAt: true },
      })
      expect(entregado.status).toBe('ENTREGADO')
      expect(entregado.deletedAt).toBeNull()
    })
  })

  it('R35: un pedido BLOQUEADO vivo se inserta sin motivo de cancelacion, sin packed_by ni finished_at, y se borra logicamente', async () => {
    // Ninguno de los CHECK existentes nombra BLOQUEADO -solo miran ENTREGADO, CANCELADO o el
    // conjunto de empaque-, asi que un pedido bloqueado nace con esas tres columnas nulas y
    // el borrado logico se acepta igual que en PENDIENTE o EN_CURSO.
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)

      const bloqueado = await createOrder(tx, {
        companyId: f.companyId,
        recipeId: f.recipeId,
        status: 'BLOQUEADO',
      })
      const nacido = await tx.order.findUniqueOrThrow({
        where: { id: bloqueado },
        select: { status: true, cancellationReason: true, packedBy: true, finishedAt: true, deletedAt: true },
      })
      expect(nacido.status).toBe('BLOQUEADO')
      expect(nacido.cancellationReason).toBeNull()
      expect(nacido.packedBy).toBeNull()
      expect(nacido.finishedAt).toBeNull()
      expect(nacido.deletedAt).toBeNull()

      const borrado = await tx.order.update({
        where: { id: bloqueado },
        data: { deletedAt: new Date() },
        select: { deletedAt: true, status: true },
      })
      expect(borrado.deletedAt).not.toBeNull()
      expect(borrado.status).toBe('BLOQUEADO')
    })
  })
})

describe('las cuatro fronteras que Prisma no declara', () => {
  it('la base rechaza las cuatro referencias inexistentes aunque Prisma no declare ninguna relacion', async () => {
    // R33: `recipe_id`, `unit_id`, `created_by` y `updated_by` son escalares SIN `@relation`
    // —asi el ORM no puede atravesar de `pedidos` a `recetas`, `unidades` ni `users` con un
    // `include`— y aun asi las CUATRO FK existen de verdad en la base. Las cuatro se ejercen
    // aqui de una vez: si una migracion futura borrara alguna por drift, este caso la caza.
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      // `unit_id` estaba en esta lista hasta el 2026-09-07: se fue con la columna.
      const columnas: WritableColumn[] = ['recipe_id', 'created_by', 'updated_by']

      for (const columna of columnas) {
        const estado = await expectRejectedByDatabase(
          tx,
          () =>
            rawInsertOrder(tx, {
              ...baseColumns(f, freshSequence()),
              [columna]: asUuid(randomUUID()),
            }),
          `pedido con ${columna} inexistente`,
        )
        expect(estado, `la FK de ${columna} no rechazo la referencia inexistente`).toBe(
          FOREIGN_KEY_VIOLATION,
        )
      }
    })
  })
})

describe('la presentacion del pedido', () => {
  it('R1: guarda y relee un pedido con una presentacion de su empresa', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const id = await createOrder(tx, {
        companyId: f.companyId,
        recipeId: f.recipeId,
        presentationId: f.presentationId,
      })

      const stored = await tx.order.findUniqueOrThrow({
        where: { id },
        select: { presentationId: true },
      })
      expect(stored.presentationId).toBe(f.presentationId)
    })
  })

  it('R2: un pedido sin presentacion se acepta y se relee con ausencia de valor', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const id = await createOrder(tx, { companyId: f.companyId, recipeId: f.recipeId })

      const stored = await tx.order.findUniqueOrThrow({
        where: { id },
        select: { presentationId: true },
      })
      expect(stored.presentationId).toBeNull()
    })
  })

  it('R3: rechaza una presentacion de otra empresa y una inexistente con 23503', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const otra = await seedFixtures(tx)

      const deOtraEmpresa = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsertOrder(tx, {
            ...baseColumns(f, freshSequence()),
            presentation_id: asUuid(otra.presentationId),
          }),
        'pedido con presentacion de otra empresa',
      )
      expect(deOtraEmpresa).toBe(FOREIGN_KEY_VIOLATION)

      const inexistente = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsertOrder(tx, {
            ...baseColumns(f, freshSequence()),
            presentation_id: asUuid(randomUUID()),
          }),
        'pedido con presentacion inexistente',
      )
      expect(inexistente).toBe(FOREIGN_KEY_VIOLATION)
    })
  })

  /** Un unico pedido apuntando a `f.presentationId`, en el ESTADO que pide el caso, y la
   *  afirmacion comun: el `DELETE` de la presentacion se rechaza con 23503 y las dos filas
   *  quedan intactas. */
  async function esperaRechazoDelBorradoConUnPedido(
    tx: Prisma.TransactionClient,
    f: Fixtures,
    orderId: string,
    etiqueta: string,
  ): Promise<void> {
    const rechazado = await expectRejectedByDatabase(
      tx,
      () =>
        tx.$executeRaw`DELETE FROM "presentations" WHERE "id" = CAST(${f.presentationId} AS uuid)`,
      `borrado de una presentacion usada por un pedido ${etiqueta}`,
    )
    expect(rechazado).toBe(FOREIGN_KEY_VIOLATION)

    expect(await tx.presentation.count({ where: { id: f.presentationId } })).toBe(1)
    const stored = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { presentationId: true },
    })
    expect(stored.presentationId).toBe(f.presentationId)
  }

  it('R4: borrar una presentacion usada por un pedido vivo se rechaza con 23503 y deja las dos filas', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const vivo = await createOrder(tx, {
        companyId: f.companyId,
        recipeId: f.recipeId,
        presentationId: f.presentationId,
      })

      await esperaRechazoDelBorradoConUnPedido(tx, f, vivo, 'vivo')
    })
  })

  it('R4: borrar una presentacion usada por un pedido CANCELADO se rechaza con 23503 y deja las dos filas', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const cancelado = await createOrder(tx, {
        companyId: f.companyId,
        recipeId: f.recipeId,
        presentationId: f.presentationId,
      })
      await tx.order.update({
        where: { id: cancelado },
        data: { status: 'CANCELADO', cancellationReason: 'motivo de prueba' },
      })

      await esperaRechazoDelBorradoConUnPedido(tx, f, cancelado, 'CANCELADO')
    })
  })

  it('R4: borrar una presentacion usada por un pedido ENTREGADO se rechaza con 23503 y deja las dos filas', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const entregado = await createOrder(tx, {
        companyId: f.companyId,
        recipeId: f.recipeId,
        presentationId: f.presentationId,
      })
      await tx.order.update({ where: { id: entregado }, data: { status: 'ENTREGADO' } })

      await esperaRechazoDelBorradoConUnPedido(tx, f, entregado, 'ENTREGADO')
    })
  })

  it('R4: borrar una presentacion usada por un pedido dado de baja se rechaza con 23503 y deja las dos filas', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const dadoDeBaja = await createOrder(tx, {
        companyId: f.companyId,
        recipeId: f.recipeId,
        presentationId: f.presentationId,
      })
      await tx.order.update({ where: { id: dadoDeBaja }, data: { deletedAt: new Date() } })

      await esperaRechazoDelBorradoConUnPedido(tx, f, dadoDeBaja, 'dado de baja')
    })
  })
})
