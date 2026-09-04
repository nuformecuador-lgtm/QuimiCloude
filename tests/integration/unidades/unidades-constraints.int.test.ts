/**
 * Tests de integracion de QC-32 (modelo-unidades) contra una base Postgres REAL, con la
 * migracion `20260903121404_units_catalog` aplicada.
 *
 * Los helpers de aislamiento son copia literal de
 * `tests/integration/recetas/recetas-constraints.int.test.ts` (QC-24), como manda
 * `tasks.md > T11`. Las razones son las mismas y se repiten aqui para que este archivo se
 * lea solo:
 *
 * AISLAMIENTO — cada `it` corre dentro de `prisma.$transaction` interactiva y termina
 * lanzando `RollbackSignal`, lo que hace que Prisma emita `ROLLBACK`: ninguna fila escrita
 * por un test sobrevive. Se usa la transaccion interactiva de Prisma (y no un cliente `pg`
 * aparte) porque asi se ejercita EXACTAMENTE el camino de datos de la app, y porque
 * `$executeRaw` dentro de la misma transaccion reutiliza la conexion, asi que el SQL crudo
 * comparte el aislamiento.
 *
 * NINGUNA AFIRMACION GLOBAL — no se afirma «la tabla esta vacia» ni «hay N filas en
 * total». Cada test mira solo las filas que el mismo sembro, localizadas por su `id` o por
 * un marcador irrepetible. La base local ya tiene el catalogo arrancador sembrado (cinco
 * unidades) y otras sesiones corren contra la MISMA base: un test que dependiera del seed
 * o de un conteo global cambiaria de color segun quien pase antes.
 *
 * CADA CASO SIEMBRA SUS PROPIAS FK — `products.unit_id` -> `units` y
 * `recipe_lines.unit_id` -> `units` son FK REALES aunque el esquema Prisma las declare como
 * escalares sin `@relation` (`design.md` seccion 4.3, R18). Por eso cada caso crea dentro
 * de su propia transaccion la unidad, la presentacion, el producto y la receta que
 * necesita, con nombres marcados: NO se depende del seed ni del orden de los archivos.
 *
 * SAVEPOINTS — un error de constraint aborta la transaccion de Postgres entera, y varios
 * casos exigen comprobar el estado DESPUES del rechazo («no crear ninguna fila»). Por eso
 * toda operacion que se espera que falle se envuelve en un `SAVEPOINT` y se deshace con
 * `ROLLBACK TO SAVEPOINT`, que deja la transaccion viva y permite seguir consultando.
 *
 * SQL CRUDO — TODA operacion que se espera que la base rechace se hace con `$executeRaw`,
 * por dos motivos: (1) omitir una columna obligatoria no se puede expresar con la API
 * tipada (no compilaria), y (2) solo el raw propaga el SQLSTATE de Postgres en `meta.code`.
 * La API tipada lo traduce a su propio codigo (`P2002`, `P2003`…) y el SQLSTATE se pierde
 * (`design.md` seccion 9, QC-24 seccion 10.1). Se afirma sobre el SQLSTATE y NUNCA sobre
 * el texto del mensaje: en esta maquina Postgres responde en espanol. Los caminos felices y
 * las lecturas si van con la API tipada, que es el camino real de la app.
 *
 * NOMBRE NORMALIZADO — `name_normalized` se escribe LITERAL en cada caso, sin llamar a
 * `normalizeUnitName`. Lo que aqui se prueba es el indice unico de la base (R5); el
 * algoritmo lo prueba `tests/unit/unidades/domain/unit-name.test.ts`. Si este archivo
 * importara la funcion, un fallo del algoritmo podria dejarlo verde.
 *
 * SIN TESTS DE RLS — un test de RLS escrito con Prisma sale verde pase lo que pase, porque
 * Prisma se conecta como dueno de las tablas (`design.md` seccion 9, `docs/architecture.md
 * > Acceso a datos y autorizacion`). R21 se cierra con el test estatico sobre el SQL y con
 * `tests/guards/guard-rls-force.test.ts`, no aqui: escribirlo seria un falso verde.
 *
 * Requisitos cubiertos: R1, R2, R3, R5, R6, R7, R9, R10, R11, R12, R13, R14 y R18.
 */
import { randomUUID } from 'node:crypto'

import { Prisma } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

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

/**
 * SQLSTATE del error. Se lee de `meta.code` y no del texto: el mensaje de Postgres esta
 * traducido al idioma del servidor (en esta maquina, espanol). Por eso NINGUN test afirma
 * sobre el nombre de la restriccion: se afirma sobre el SQLSTATE y sobre el efecto, y cada
 * caso se construye para que solo una restriccion pueda dispararlo.
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
 * Corre `run` esperando que la base lo rechace. Devuelve el SQLSTATE para que el test
 * afirme sobre el tipo exacto de violacion, y deja la transaccion utilizable.
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
// Datos de apoyo — las FK son reales, asi que cada caso siembra los suyos
// ---------------------------------------------------------------------------

const UUID_SHAPE = /^[0-9a-f-]{36}$/u

/** Marcador irrepetible de solo letras y digitos: sobrevive a cualquier normalizacion. */
function token(): string {
  return randomUUID().replace(/-/gu, '')
}

/**
 * Crea una unidad con la API tipada. El nombre lleva SIEMPRE un marcador irrepetible: el
 * indice unico `units_name_normalized_key` es total (no parcial), asi que un nombre fijo
 * chocaria contra el catalogo arrancador ya sembrado o contra otro caso de este archivo.
 * `nameNormalized` se pasa a mano, sin llamar a `normalizeUnitName` (ver cabecera).
 */
async function createUnit(
  tx: Prisma.TransactionClient,
  marker: string,
  symbol: string | null = 'kg',
): Promise<string> {
  const unit = await tx.unit.create({
    data: { name: `Unidad ${marker}`, nameNormalized: `unidad${marker}`, symbol },
    select: { id: true },
  })
  return unit.id
}

/** Crea un producto con su presentacion propia. `products.name` no es unico (QC-14). */
async function createProduct(
  tx: Prisma.TransactionClient,
  unitId: string | null = null,
  name = 'Acido citrico monohidratado',
): Promise<string> {
  // `presentations.name_normalized` es NOT NULL con indice unico (QC-20 R17, R20), y este
  // helper se llama varias veces en la misma transaccion: el marcador evita el choque.
  const marca = token()
  const presentation = await tx.presentation.create({
    data: { name: `Bidon 20 L ${marca}`, nameNormalized: `bidon20l${marca}` },
    select: { id: true },
  })
  const product = await tx.product.create({
    data: { name, presentationId: presentation.id, unitId },
    select: { id: true },
  })
  return product.id
}

/** Crea una receta viva. `nameNormalized` se pasa a mano (ver cabecera). */
async function createRecipe(tx: Prisma.TransactionClient, marker: string): Promise<string> {
  const recipe = await tx.recipe.create({
    data: { name: `Receta ${marker}`, nameNormalized: `receta${marker}` },
    select: { id: true },
  })
  return recipe.id
}

/** Crea una linea con la API tipada. Devuelve el id para poder releerla por el. */
async function createLine(
  tx: Prisma.TransactionClient,
  recipeId: string,
  productId: string,
  unitId: string,
  quantity = '1.0000',
): Promise<string> {
  const line = await tx.recipeLine.create({
    data: { recipeId, productId, unitId, quantity: new Prisma.Decimal(quantity) },
    select: { id: true },
  })
  return line.id
}

/** Columnas que un alta cruda puede escribir en las tablas que toca esta feature. */
type WritableColumn =
  | 'name'
  | 'name_normalized'
  | 'symbol'
  | 'presentation_id'
  | 'unit_id'
  | 'recipe_id'
  | 'product_id'
  | 'quantity'

/**
 * `INSERT` crudo. `columns` decide que se escribe: omitir una entrada es exactamente el
 * caso «falta un dato obligatorio», que la API tipada de Prisma no deja ni compilar.
 * `updated_at` se da siempre porque es NOT NULL sin DEFAULT en las tres tablas (lo rellena
 * el cliente Prisma via `@updatedAt`, no la base).
 */
function rawInsert(
  tx: Prisma.TransactionClient,
  table: 'units' | 'products' | 'recipe_lines',
  columns: Partial<Record<WritableColumn, Prisma.Sql>>,
): Promise<number> {
  const entries = Object.entries(columns) as [WritableColumn, Prisma.Sql][]
  const names = entries.map(([name]) => Prisma.raw(`"${name}"`))
  const values = entries.map(([, value]) => value)

  names.push(Prisma.raw('"updated_at"'))
  values.push(Prisma.sql`CURRENT_TIMESTAMP`)

  const target = Prisma.raw(`"${table}"`)
  return tx.$executeRaw`INSERT INTO ${target} (${Prisma.join(names)}) VALUES (${Prisma.join(values)})`
}

/** Valor SQL de un uuid: el parametro llega como texto y hay que castearlo. */
function asUuid(id: string): Prisma.Sql {
  return Prisma.sql`CAST(${id} AS uuid)`
}

interface ColumnInfo {
  readonly column_name: string
  readonly data_type: string
  readonly is_nullable: string
}

/** Forma REAL de unas columnas segun `information_schema`, no segun el esquema Prisma. */
function columnInfo(
  tx: Prisma.TransactionClient,
  table: string,
  columns: readonly string[],
): Promise<ColumnInfo[]> {
  return tx.$queryRaw<ColumnInfo[]>`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ${table}
      AND column_name IN (${Prisma.join([...columns])})
    ORDER BY column_name`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------

beforeAll(async () => {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'units'`
  if (tables.length !== 1) {
    throw new Error(
      'la base de pruebas no tiene aplicada la migracion de QC-32 (tabla `units`). ' +
        'Corre `pnpm run db:migrate` antes de estos tests.',
    )
  }
})

afterAll(async () => {
  await prisma.$disconnect()
})

// ---------------------------------------------------------------------------

describe('la unidad como entidad del catalogo', () => {
  it('crea una unidad con nombre y simbolo y la relee sin perdida', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()

      const created = await tx.unit.create({
        data: {
          name: `Kilogramo ${marker}`,
          nameNormalized: `kilogramo${marker}`,
          symbol: 'kg',
        },
        select: { id: true },
      })

      // R1: identificador propio, estable y no derivado de los datos de negocio.
      expect(created.id).toMatch(UUID_SHAPE)

      const unit = await tx.unit.findUniqueOrThrow({ where: { id: created.id } })
      expect(unit.name).toBe(`Kilogramo ${marker}`)
      expect(unit.nameNormalized).toBe(`kilogramo${marker}`)
      expect(unit.symbol).toBe('kg')

      // «No derivado de sus datos de negocio»: renombrarla no cambia el identificador.
      const renamed = await tx.unit.update({
        where: { id: created.id },
        data: { name: `Kilo ${marker}`, symbol: 'Kg' },
        select: { id: true },
      })
      expect(renamed.id).toBe(created.id)

      const reread = await tx.unit.findUniqueOrThrow({
        where: { id: created.id },
        select: { name: true, symbol: true },
      })
      expect(reread).toEqual({ name: `Kilo ${marker}`, symbol: 'Kg' })
    })
  })

  it('rechaza una unidad sin nombre con SQLSTATE 23502', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()

      // SQL crudo a proposito: `tx.unit.create({ data: { nameNormalized } })` no
      // compilaria. La unica columna obligatoria que falta es `name`, asi que el 23502
      // solo puede venir de ella.
      const sqlState = await expectRejectedByDatabase(
        tx,
        () => rawInsert(tx, 'units', { name_normalized: Prisma.sql`${marker}` }),
        'unidad sin nombre',
      )
      expect(sqlState).toBe(NOT_NULL_VIOLATION)

      // «No crear ninguna fila»: se busca lo que ese intento habria escrito, no el total.
      const survivors = await tx.unit.findMany({
        where: { nameNormalized: marker },
        select: { id: true },
      })
      expect(survivors).toEqual([])
    })
  })

  it('acepta una unidad sin simbolo y la relee con ausencia de valor, no con cadena vacia', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()

      const { id } = await tx.unit.create({
        data: { name: `Unidad ${marker}`, nameNormalized: `unidad${marker}` },
        select: { id: true },
      })

      // R3: la ausencia es ausencia. Ni cadena vacia ni relleno.
      const unit = await tx.unit.findUniqueOrThrow({ where: { id } })
      expect(unit.symbol).toBeNull()
      expect(unit.symbol).not.toBe('')

      // Y lo que hay en la base es un NULL de verdad, no una cadena vacia disfrazada.
      const shape = await tx.$queryRaw<{ sin_simbolo: boolean; vacio: boolean }[]>`
        SELECT ("symbol" IS NULL) AS sin_simbolo,
               ("symbol" IS NOT DISTINCT FROM '') AS vacio
        FROM "units" WHERE "id" = ${asUuid(id)}`
      expect(shape).toEqual([{ sin_simbolo: true, vacio: false }])

      // La razon por la que entra: la columna es TEXT anulable, sin NOT NULL ni DEFAULT.
      const columns = await columnInfo(tx, 'units', ['symbol'])
      expect(columns).toEqual([
        { column_name: 'symbol', data_type: 'text', is_nullable: 'YES' },
      ])
    })
  })

  it('rechaza una segunda unidad con el mismo nombre normalizado con SQLSTATE 23505', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const normalized = `mililitro${marker}`

      const { id: firstId } = await tx.unit.create({
        data: { name: `mililitro ${marker}`, nameNormalized: normalized, symbol: 'mL' },
        select: { id: true },
      })

      // El nombre original es distinto («MILI-LITRO …» frente a «mililitro …»); lo que
      // choca es la clave normalizada, que es justo lo que R5 exige.
      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'units', {
            name: Prisma.sql`${`MILI-LITRO ${marker}`}`,
            name_normalized: Prisma.sql`${normalized}`,
            symbol: Prisma.sql`${'ml'}`,
          }),
        'segunda unidad con el mismo nombre normalizado',
      )
      expect(sqlState).toBe(UNIQUE_VIOLATION)

      // «No crear ni modificar ninguna fila»: solo sobrevive la primera, intacta.
      const rows = await tx.unit.findMany({
        where: { nameNormalized: normalized },
        select: { id: true, name: true, symbol: true },
      })
      expect(rows).toEqual([{ id: firstId, name: `mililitro ${marker}`, symbol: 'mL' }])
    })
  })

  it('acepta un nombre de 500 caracteres', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const name = marker + 'a'.repeat(500 - marker.length)
      expect(name).toHaveLength(500)

      const { id } = await tx.unit.create({
        data: { name, nameNormalized: name, symbol: 'x' },
        select: { id: true },
      })

      const unit = await tx.unit.findUniqueOrThrow({ where: { id } })
      expect(unit.name).toBe(name)
      expect(unit.name).toHaveLength(500)

      // R6, la razon por la que entra: las dos columnas de texto son TEXT sin longitud
      // declarada. Cualquier limite de forma es validacion de aplicacion, no de columna.
      const columns = await columnInfo(tx, 'units', ['name', 'symbol'])
      expect(columns.map((column) => [column.column_name, column.data_type])).toEqual([
        ['name', 'text'],
        ['symbol', 'text'],
      ])
    })
  })

  it('acepta dos unidades distintas con el mismo simbolo', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const symbol = `u${marker.slice(0, 6)}`

      const { id: primera } = await tx.unit.create({
        data: { name: `Primera ${marker}`, nameNormalized: `primera${marker}`, symbol },
        select: { id: true },
      })
      const { id: segunda } = await tx.unit.create({
        data: { name: `Segunda ${marker}`, nameNormalized: `segunda${marker}`, symbol },
        select: { id: true },
      })

      // R7: la identidad de la unidad es su NOMBRE; el simbolo no distingue nada.
      const rows = await tx.unit.findMany({ where: { symbol }, select: { id: true } })
      expect(rows.map((row) => row.id).sort()).toEqual([primera, segunda].sort())

      // El porque: no hay ningun indice de la tabla que incluya la columna `symbol`.
      const symbolIndexes = await tx.$queryRaw<{ indexname: string }[]>`
        SELECT indexname FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'units' AND indexdef LIKE '%symbol%'`
      expect(symbolIndexes).toEqual([])
    })
  })

  it('created_at y updated_at se rellenan solos y updated_at cambia al modificar', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const id = await createUnit(tx, marker, 'kg')

      const antes = await tx.unit.findUniqueOrThrow({
        where: { id },
        select: { createdAt: true, updatedAt: true },
      })
      expect(antes.createdAt).toBeInstanceOf(Date)
      expect(antes.updatedAt).toBeInstanceOf(Date)

      await sleep(20)
      await tx.unit.update({ where: { id }, data: { symbol: 'kilo' } })

      const despues = await tx.unit.findUniqueOrThrow({
        where: { id },
        select: { createdAt: true, updatedAt: true },
      })
      expect(despues.createdAt.getTime()).toBe(antes.createdAt.getTime())
      expect(despues.updatedAt.getTime()).toBeGreaterThan(antes.updatedAt.getTime())
    })
  })
})

describe('el uso de la unidad desde inventario y recetas', () => {
  it('acepta un producto sin unidad y otro con unidad', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const unitId = await createUnit(tx, marker, 'kg')

      const sinUnidad = await createProduct(tx, null, 'Producto sin unidad declarada')
      const conUnidad = await createProduct(tx, unitId, 'Producto con unidad declarada')

      // R10: la unidad del producto es OPCIONAL, y la ausencia se guarda como ausencia.
      const sin = await tx.product.findUniqueOrThrow({
        where: { id: sinUnidad },
        select: { unitId: true },
      })
      const con = await tx.product.findUniqueOrThrow({
        where: { id: conUnidad },
        select: { unitId: true },
      })
      expect(sin.unitId).toBeNull()
      expect(con.unitId).toBe(unitId)

      // Y la columna lo permite: uuid anulable, y ninguna columna `unit` de texto.
      const columns = await columnInfo(tx, 'products', ['unit_id', 'unit'])
      expect(columns).toEqual([
        { column_name: 'unit_id', data_type: 'uuid', is_nullable: 'YES' },
      ])
    })
  })

  it('rechaza una linea de receta sin unidad con SQLSTATE 23502', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const recipeId = await createRecipe(tx, marker)
      const productId = await createProduct(tx)

      // SQL crudo a proposito: omitir `unitId` en la API tipada no compilaria.
      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'recipe_lines', {
            recipe_id: asUuid(recipeId),
            product_id: asUuid(productId),
            quantity: Prisma.sql`1.0000`,
          }),
        'linea de receta sin unidad',
      )
      expect(sqlState).toBe(NOT_NULL_VIOLATION)

      // «No crear ninguna fila»: la receta se queda sin ninguna linea.
      const survivors = await tx.recipeLine.findMany({ where: { recipeId }, select: { id: true } })
      expect(survivors).toEqual([])

      // R11, la razon: la columna es uuid OBLIGATORIO, al reves que la del producto.
      const columns = await columnInfo(tx, 'recipe_lines', ['unit_id', 'unit'])
      expect(columns).toEqual([
        { column_name: 'unit_id', data_type: 'uuid', is_nullable: 'NO' },
      ])
    })
  })

  it('rechaza un producto y una linea con unit_id inexistente con SQLSTATE 23503', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const recipeId = await createRecipe(tx, marker)
      const unitId = await createUnit(tx, marker, 'kg')
      const productId = await createProduct(tx, unitId)
      const presentationMarker = token()
      const presentation = await tx.presentation.create({
        data: {
          name: `Bidon 20 L ${presentationMarker}`,
          nameNormalized: `bidon20l${presentationMarker}`,
        },
        select: { id: true },
      })
      const inventada = randomUUID()

      // R12 en el alta de producto. Crudo: por la API tipada Prisma traduciria el
      // SQLSTATE a su propio `P2003` y no se podria afirmar sobre `23503`.
      const productoConUnidadFantasma = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'products', {
            name: Prisma.sql`${`Producto con unidad fantasma ${marker}`}`,
            presentation_id: asUuid(presentation.id),
            unit_id: asUuid(inventada),
          }),
        'producto con unit_id inexistente',
      )
      expect(productoConUnidadFantasma).toBe(FOREIGN_KEY_VIOLATION)

      // R12 en el alta de linea.
      const lineaConUnidadFantasma = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'recipe_lines', {
            recipe_id: asUuid(recipeId),
            product_id: asUuid(productId),
            quantity: Prisma.sql`1.0000`,
            unit_id: asUuid(inventada),
          }),
        'linea con unit_id inexistente',
      )
      expect(lineaConUnidadFantasma).toBe(FOREIGN_KEY_VIOLATION)

      // R12 tambien al EDITAR, no solo al dar de alta.
      const edicionConUnidadFantasma = await expectRejectedByDatabase(
        tx,
        () =>
          tx.$executeRaw`UPDATE "products" SET "unit_id" = ${asUuid(inventada)} WHERE "id" = ${asUuid(productId)}`,
        'edicion de producto apuntando a una unidad inexistente',
      )
      expect(edicionConUnidadFantasma).toBe(FOREIGN_KEY_VIOLATION)

      // «No crear ni modificar ninguna fila»: ninguno de los tres intentos dejo rastro.
      const productosDeLaPresentacion = await tx.product.findMany({
        where: { presentationId: presentation.id },
        select: { id: true },
      })
      expect(productosDeLaPresentacion).toEqual([])
      expect(await tx.recipeLine.findMany({ where: { recipeId }, select: { id: true } })).toEqual([])
      const producto = await tx.product.findUniqueOrThrow({
        where: { id: productId },
        select: { unitId: true },
      })
      expect(producto.unitId).toBe(unitId)
    })
  })

  it('rechaza el borrado de una unidad usada por un producto y por una linea con SQLSTATE 23503, y permite el de una unidad libre', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const unidadDeProducto = await createUnit(tx, `p${marker}`, 'kg')
      const unidadDeLinea = await createUnit(tx, `l${marker}`, 'L')
      const unidadLibre = await createUnit(tx, `x${marker}`, null)

      const productId = await createProduct(tx, unidadDeProducto)
      const recipeId = await createRecipe(tx, marker)
      const productoDeLaLinea = await createProduct(tx, null, 'Insumo de la linea')
      const lineId = await createLine(tx, recipeId, productoDeLaLinea, unidadDeLinea)

      // R13 — ON DELETE RESTRICT: la unidad en uso no se puede borrar. Crudo, para poder
      // afirmar sobre el SQLSTATE y no sobre el `P2003` que devolveria la API tipada.
      const usadaPorProducto = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`DELETE FROM "units" WHERE "id" = ${asUuid(unidadDeProducto)}`,
        'borrado de una unidad usada por un producto',
      )
      expect(usadaPorProducto).toBe(FOREIGN_KEY_VIOLATION)

      const usadaPorLinea = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`DELETE FROM "units" WHERE "id" = ${asUuid(unidadDeLinea)}`,
        'borrado de una unidad usada por una linea de receta',
      )
      expect(usadaPorLinea).toBe(FOREIGN_KEY_VIOLATION)

      // Nada se movio: ni las unidades, ni el producto, ni la linea.
      expect(await tx.unit.findUnique({ where: { id: unidadDeProducto } })).not.toBeNull()
      expect(await tx.unit.findUnique({ where: { id: unidadDeLinea } })).not.toBeNull()
      const producto = await tx.product.findUniqueOrThrow({
        where: { id: productId },
        select: { unitId: true },
      })
      expect(producto.unitId).toBe(unidadDeProducto)
      const linea = await tx.recipeLine.findUniqueOrThrow({
        where: { id: lineId },
        select: { unitId: true },
      })
      expect(linea.unitId).toBe(unidadDeLinea)

      // La otra mitad de R13: la que NO esta en uso si se borra. Sin esto, el test
      // pasaria igual con una tabla que no deja borrar nada nunca.
      await tx.unit.delete({ where: { id: unidadLibre } })
      expect(await tx.unit.findUnique({ where: { id: unidadLibre } })).toBeNull()
    })
  })

  it('una linea puede usar una unidad distinta de la de su producto', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const unidadDelProducto = await createUnit(tx, `kg${marker}`, 'kg')
      const unidadDeLaLinea = await createUnit(tx, `g${marker}`, 'g')

      const productId = await createProduct(tx, unidadDelProducto, 'Colorante azul')
      const recipeId = await createRecipe(tx, marker)
      const lineId = await createLine(tx, recipeId, productId, unidadDeLaLinea, '0.0100')

      // R14: la unidad es ANOTATIVA. La base no relaciona la de la linea con la del
      // producto, no convierte nada y no exige que coincidan.
      const linea = await tx.recipeLine.findUniqueOrThrow({
        where: { id: lineId },
        select: { unitId: true, quantity: true },
      })
      const producto = await tx.product.findUniqueOrThrow({
        where: { id: productId },
        select: { unitId: true },
      })
      expect(producto.unitId).toBe(unidadDelProducto)
      expect(linea.unitId).toBe(unidadDeLaLinea)
      expect(linea.unitId).not.toBe(producto.unitId)
      // La cantidad se guarda tal cual: nadie la convirtio de gramos a kilogramos.
      expect(linea.quantity.toString()).toBe('0.01')

      // Y no existe en el catalogo ninguna columna de factor, base ni equivalencia con la
      // que convertir (R14): la tabla tiene exactamente estas seis columnas.
      const columns = await tx.$queryRaw<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'units'
        ORDER BY column_name`
      expect(columns.map((column) => column.column_name)).toEqual([
        'created_at',
        'id',
        'name',
        'name_normalized',
        'symbol',
        'updated_at',
      ])
    })
  })
})

describe('frontera con unidades: FK reales sin relacion de Prisma', () => {
  it('la base rechaza un unit_id inexistente aunque Prisma no declare la relacion', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const recipeId = await createRecipe(tx, marker)
      const productId = await createProduct(tx)
      const presentationMarker = token()
      const presentation = await tx.presentation.create({
        data: {
          name: `Bidon 20 L ${presentationMarker}`,
          nameNormalized: `bidon20l${presentationMarker}`,
        },
        select: { id: true },
      })

      const unidadFantasmaEnProducto = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'products', {
            name: Prisma.sql`${`Producto ${marker}`}`,
            presentation_id: asUuid(presentation.id),
            unit_id: asUuid(randomUUID()),
          }),
        'producto con unit_id inventado',
      )
      expect(unidadFantasmaEnProducto).toBe(FOREIGN_KEY_VIOLATION)

      const unidadFantasmaEnLinea = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'recipe_lines', {
            recipe_id: asUuid(recipeId),
            product_id: asUuid(productId),
            quantity: Prisma.sql`1.0000`,
            unit_id: asUuid(randomUUID()),
          }),
        'linea con unit_id inventado',
      )
      expect(unidadFantasmaEnLinea).toBe(FOREIGN_KEY_VIOLATION)

      // El porque: las dos FK existen en la base —con ON DELETE RESTRICT (`confdeltype`
      // = 'r') y ON UPDATE CASCADE (`confupdtype` = 'c')— aunque el esquema Prisma
      // declare `unit_id` como escalar sin `@relation`. La integridad la da Postgres; el
      // ORM no puede atravesar la frontera con un `include` (R18, `design.md` 4.3).
      // El JOIN con `pg_namespace` acota la consulta al esquema `public` y NO es adorno:
      // `pg_constraint` es global a la BASE, no al esquema. La base de pruebas es
      // compartida y llego a tener un esquema espejo (`public_shadow_qc52`) con las
      // mismas tablas; sin este filtro cada FK aparecia DOS veces. No sirve confiar en
      // el `search_path` ni en `::regclass`, que solo cualifica cuando la tabla NO esta
      // en el path: por eso el sintoma era tan confuso.
      // Aqui se acota el esquema de las DOS puntas (`n` la tabla que declara la FK, `fn` la
      // referenciada) porque el predicado del caso es sobre la referenciada: son las FK de
      // `public` hacia `public.units`, no hacia cualquier tabla llamada `units`.
      const foreignKeys = await tx.$queryRaw<
        { conname: string; referencia: string; confdeltype: string; confupdtype: string }[]
      >`
        SELECT c.conname, ft.relname AS referencia, c.confdeltype::text, c.confupdtype::text
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_class ft ON ft.oid = c.confrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN pg_namespace fn ON fn.oid = ft.relnamespace
        WHERE c.contype = 'f' AND n.nspname = 'public' AND fn.nspname = 'public'
          AND ft.relname = 'units'
        ORDER BY c.conname`
      // ACTUALIZADO EL 2026-09-04 POR QC-52
      // (`specs/QC-52-separar-producto-de-catalogo-de-proveedor/`). La lista era de TRES
      // —dos originales mas `orders_unit_id_fkey`, que sumo QC-33 el 2026-09-03— y sigue
      // siendo EXACTA: ahora son CUATRO. La nueva la trae QC-52, que da unidad propia a la
      // linea de catalogo del proveedor (`supplier_catalog_lines.unit_id`, R8 y R10) y por
      // eso anade `supplier_catalog_lines_unit_id_fkey`, con las mismas dos reglas que las
      // otras tres —RESTRICT al borrar ('r'), CASCADE al actualizar ('c')—, que es
      // justamente lo que R13 de QC-32 exige de CUALQUIER referencia al catalogo. Que la
      // columna sea anulable no afloja nada: la FK solo se verifica cuando hay valor. Va la
      // ultima porque la consulta ordena por `conname`. No se convierte en `toContain`: si
      // manana alguien anade una FK a `units` sin RESTRICT, o se pierde una de las cuatro en
      // un drift de `migrate dev`, este caso tiene que seguir siendo quien lo diga.
      expect(foreignKeys).toEqual([
        {
          conname: 'orders_unit_id_fkey',
          referencia: 'units',
          confdeltype: 'r',
          confupdtype: 'c',
        },
        {
          conname: 'products_unit_id_fkey',
          referencia: 'units',
          confdeltype: 'r',
          confupdtype: 'c',
        },
        {
          conname: 'recipe_lines_unit_id_fkey',
          referencia: 'units',
          confdeltype: 'r',
          confupdtype: 'c',
        },
        {
          conname: 'supplier_catalog_lines_unit_id_fkey',
          referencia: 'units',
          confdeltype: 'r',
          confupdtype: 'c',
        },
      ])
    })
  })
})
