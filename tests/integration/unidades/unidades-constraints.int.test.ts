/**
 * La base es compartida y ya trae el catalogo arrancador: ningun caso afirma conteos globales y
 * cada uno siembra sus propias filas con marcadores irrepetibles.
 * Sin tests de RLS: Prisma conecta como dueno de las tablas y saldrian verdes siempre.
 */
import { randomUUID } from 'node:crypto'

import { Prisma } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '@/lib/shared/db/prisma'

/** Senal de rollback: no es un fallo, es como se deshace la transaccion del test. */
class RollbackSignal extends Error {
  constructor() {
    super('rollback de aislamiento del test')
    this.name = 'RollbackSignal'
  }
}

/** `$executeRaw` dentro de la transaccion reutiliza su conexion: el SQL crudo tambien se deshace. */
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

const NOT_NULL_VIOLATION = '23502'
const FOREIGN_KEY_VIOLATION = '23503'
const UNIQUE_VIOLATION = '23505'
/** Tambien lo levantan los `RAISE` del disparador de derivacion de `units`. */
const CHECK_VIOLATION = '23514'

/**
 * Solo el SQL crudo deja el SQLSTATE en `meta.code`; la API tipada lo traduce a `P20xx`. No se
 * mira el texto porque sale en el idioma del servidor, asi que cada caso se monta para que solo
 * una restriccion pueda dar ese SQLSTATE.
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
 * Va dentro de un SAVEPOINT porque un error de constraint aborta la transaccion entera, y los
 * casos necesitan seguir consultando despues del rechazo.
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

const UUID_SHAPE = /^[0-9a-f-]{36}$/u

/** Marcador irrepetible de solo letras y digitos: sobrevive a cualquier normalizacion. */
function token(): string {
  return randomUUID().replace(/-/gu, '')
}

/**
 * El simbolo es unico dentro de su ambito y el arrancador ya ocupa `kg` como unidad de sistema:
 * un literal fijo chocaria contra el o contra otro caso por una razon que no es la del test.
 */
function symbolFor(marker: string): string {
  return `u${marker.slice(0, 8)}`
}

/**
 * Sin empresa la unidad es de sistema, el mismo ambito que el arrancador: por eso el nombre
 * lleva marcador. `nameNormalized` va literal, sin `normalizeUnitName`, para que un fallo del
 * algoritmo no deje verde este archivo.
 */
async function createUnit(
  tx: Prisma.TransactionClient,
  marker: string,
  symbol: string | null = symbolFor(marker),
  extra: {
    readonly companyId?: string | null
    readonly baseUnitId?: string | null
    readonly factor?: string | null
  } = {},
): Promise<string> {
  const unit = await tx.unit.create({
    data: {
      name: `Unidad ${marker}`,
      nameNormalized: `unidad${marker}`,
      symbol,
      companyId: extra.companyId ?? null,
      baseUnitId: extra.baseUnitId ?? null,
      factor: extra.factor === undefined || extra.factor === null ? null : new Prisma.Decimal(extra.factor),
    },
    select: { id: true },
  })
  return unit.id
}

/** El marcador evita choques con el indice unico de nombre de `companies`. */
async function createCompany(tx: Prisma.TransactionClient, marker: string): Promise<string> {
  const company = await tx.company.create({
    data: { name: `Empresa ${marker}`, nameNormalized: `empresa${marker}` },
    select: { id: true },
  })
  return company.id
}


/** Copia local de `normalizeProductName` a proposito: si el algoritmo real se rompiera, este
 *  archivo no debe quedar verde por arrastre. */
function normalizeProductNameForTest(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]/gu, '')
}

/**
 * Una empresa por transaccion: `product_batches_check_company` exige que el lote, su producto y
 * su presentacion compartan empresa. Ningun aserto de este archivo depende de cual sea.
 */
const empresasDeInventario = new WeakMap<object, Promise<string>>()

function inventoryCompanyOf(tx: Prisma.TransactionClient): Promise<string> {
  const enCurso = empresasDeInventario.get(tx)
  if (enCurso !== undefined) return enCurso
  const creando = createCompany(tx, `inv${token()}`)
  empresasDeInventario.set(tx, creando)
  return creando
}

async function createProduct(
  tx: Prisma.TransactionClient,
  name = 'Acido citrico monohidratado',
): Promise<string> {
  const product = await tx.product.create({
    data: {
      name,
      nameNormalized: normalizeProductNameForTest(name),
      companyId: await inventoryCompanyOf(tx),
    },
    select: { id: true },
  })
  return product.id
}

/** El nombre lleva marcador: `name_normalized` tiene indice unico por empresa. */
async function createPresentation(
  tx: Prisma.TransactionClient,
  marker: string,
  unitId: string,
): Promise<string> {
  const presentation = await tx.presentation.create({
    data: {
      name: `Presentacion ${marker}`,
      nameNormalized: `presentacion${marker}`,
      unitId,
      companyId: await inventoryCompanyOf(tx),
    },
    select: { id: true },
  })
  return presentation.id
}

/** Via por la que un producto llega a tener unidad: la de la presentacion de su lote mas
 *  reciente. */
async function createBatch(
  tx: Prisma.TransactionClient,
  productId: string,
  presentationId: string,
): Promise<string> {
  const batch = await tx.productBatch.create({
    data: {
      productId,
      presentationId,
      stock: 1,
      unitCost: new Prisma.Decimal('1.0000'),
      // `lot` es unico por empresa.
      lot: `L-${randomUUID()}`,
      purchaseDate: new Date('2026-09-01T00:00:00Z'),
      companyId: await inventoryCompanyOf(tx),
    },
    select: { id: true },
  })
  return batch.id
}

async function createRecipe(tx: Prisma.TransactionClient, marker: string): Promise<string> {
  const recipe = await tx.recipe.create({
    data: { name: `Receta ${marker}`, nameNormalized: `receta${marker}` },
    select: { id: true },
  })
  return recipe.id
}

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

type WritableColumn =
  | 'id'
  | 'name'
  | 'name_normalized'
  | 'symbol'
  | 'unit_id'
  | 'recipe_id'
  | 'product_id'
  | 'quantity'
  // `factor` sin `unit_id`, o al reves, solo se puede intentar escribir a pelo.
  | 'company_id'
  | 'factor'

/**
 * Omitir una entrada de `columns` es el caso «falta un dato obligatorio», que la API tipada no
 * deja ni compilar. Las columnas NOT NULL sin DEFAULT que no son el sujeto del caso se rellenan
 * siempre: si no, el rechazo llegaria como 23502 sobre ellas y el caso dejaria de probar lo suyo.
 * `updated_at` es una de ellas porque la rellena Prisma con `@updatedAt`, no la base.
 */
async function rawInsert(
  tx: Prisma.TransactionClient,
  table: 'units' | 'products' | 'presentations' | 'recipe_lines',
  columns: Partial<Record<WritableColumn, Prisma.Sql>>,
): Promise<number> {
  const entries = Object.entries(columns) as [WritableColumn, Prisma.Sql][]
  const names = entries.map(([name]) => Prisma.raw(`"${name}"`))
  const values = entries.map(([, value]) => value)

  if ((table === 'products' || table === 'presentations') && columns.company_id === undefined) {
    names.push(Prisma.raw('"company_id"'))
    values.push(asUuid(await inventoryCompanyOf(tx)))
  }

  // Vacia no choca: `products.name_normalized` no tiene indice unico.
  if (table === 'products') {
    names.push(Prisma.raw('"name_normalized"'))
    values.push(Prisma.sql`${''}`)
  }
  // Esta si tiene indice unico, asi que no puede ir vacia como la del producto.
  if (table === 'presentations') {
    names.push(Prisma.raw('"name_normalized"'))
    values.push(Prisma.sql`${token()}`)
  }
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

describe('la unidad como entidad del catalogo', () => {
  it('crea una unidad con nombre y simbolo y la relee sin perdida', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()

      const created = await tx.unit.create({
        data: {
          name: `Kilogramo ${marker}`,
          nameNormalized: `kilogramo${marker}`,
          symbol: symbolFor(marker),
        },
        select: { id: true },
      })

      expect(created.id).toMatch(UUID_SHAPE)

      const unit = await tx.unit.findUniqueOrThrow({ where: { id: created.id } })
      expect(unit.name).toBe(`Kilogramo ${marker}`)
      expect(unit.nameNormalized).toBe(`kilogramo${marker}`)
      expect(unit.symbol).toBe(symbolFor(marker))

      // Si el identificador saliera de los datos de negocio, renombrarla lo cambiaria.
      const renamed = await tx.unit.update({
        where: { id: created.id },
        data: { name: `Kilo ${marker}`, symbol: `${symbolFor(marker)}b` },
        select: { id: true },
      })
      expect(renamed.id).toBe(created.id)

      const reread = await tx.unit.findUniqueOrThrow({
        where: { id: created.id },
        select: { name: true, symbol: true },
      })
      expect(reread).toEqual({ name: `Kilo ${marker}`, symbol: `${symbolFor(marker)}b` })
    })
  })

  it('rechaza una unidad sin nombre con SQLSTATE 23502', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()

      // La unica columna obligatoria que falta es `name`: el 23502 solo puede venir de ella.
      const sqlState = await expectRejectedByDatabase(
        tx,
        () => rawInsert(tx, 'units', { name_normalized: Prisma.sql`${marker}` }),
        'unidad sin nombre',
      )
      expect(sqlState).toBe(NOT_NULL_VIOLATION)

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

      const unit = await tx.unit.findUniqueOrThrow({ where: { id } })
      expect(unit.symbol).toBeNull()
      expect(unit.symbol).not.toBe('')

      const shape = await tx.$queryRaw<{ sin_simbolo: boolean; vacio: boolean }[]>`
        SELECT ("symbol" IS NULL) AS sin_simbolo,
               ("symbol" IS NOT DISTINCT FROM '') AS vacio
        FROM "units" WHERE "id" = ${asUuid(id)}`
      expect(shape).toEqual([{ sin_simbolo: true, vacio: false }])

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
        // Simbolos distintos: si coincidieran, el 23505 podria venir del indice del simbolo
        // y no del de nombre.
        data: { name: `mililitro ${marker}`, nameNormalized: normalized, symbol: symbolFor(marker) },
        select: { id: true },
      })

      // El nombre original es distinto: lo que choca es la clave normalizada.
      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'units', {
            name: Prisma.sql`${`MILI-LITRO ${marker}`}`,
            name_normalized: Prisma.sql`${normalized}`,
            symbol: Prisma.sql`${`${symbolFor(marker)}b`}`,
          }),
        'segunda unidad con el mismo nombre normalizado',
      )
      expect(sqlState).toBe(UNIQUE_VIOLATION)

      const rows = await tx.unit.findMany({
        where: { nameNormalized: normalized },
        select: { id: true, name: true, symbol: true },
      })
      expect(rows).toEqual([{ id: firstId, name: `mililitro ${marker}`, symbol: symbolFor(marker) }])
    })
  })

  it('acepta un nombre de 500 caracteres', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const name = marker + 'a'.repeat(500 - marker.length)
      expect(name).toHaveLength(500)

      const { id } = await tx.unit.create({
        data: { name, nameNormalized: name, symbol: symbolFor(marker) },
        select: { id: true },
      })

      const unit = await tx.unit.findUniqueOrThrow({ where: { id } })
      expect(unit.name).toBe(name)
      expect(unit.name).toHaveLength(500)

      // Cualquier limite de longitud es validacion de aplicacion, no de columna.
      const columns = await columnInfo(tx, 'units', ['name', 'symbol'])
      expect(columns.map((column) => [column.column_name, column.data_type])).toEqual([
        ['name', 'text'],
        ['symbol', 'text'],
      ])
    })
  })

  it('acepta dos unidades con el mismo simbolo en AMBITOS distintos, y ninguna @unique de Prisma', async () => {
    // Medida global, la unicidad del simbolo haria que el `kg` de sistema bloqueara el de una
    // empresa que si puede tener su propio kilogramo.
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const symbol = `u${marker.slice(0, 6)}`
      const companyId = await createCompany(tx, marker)

      const { id: deSistema } = await tx.unit.create({
        data: { name: `Primera ${marker}`, nameNormalized: `primera${marker}`, symbol },
        select: { id: true },
      })
      const { id: deEmpresa } = await tx.unit.create({
        data: { name: `Segunda ${marker}`, nameNormalized: `segunda${marker}`, symbol, companyId },
        select: { id: true },
      })

      const rows = await tx.unit.findMany({ where: { symbol }, select: { id: true } })
      expect(rows.map((row) => row.id).sort()).toEqual([deSistema, deEmpresa].sort())

      // Un `@unique` en el esquema Prisma tambien crearia un indice total: por eso se mira la
      // base y no el esquema.
      const symbolUniqueIndexes = await tx.$queryRaw<{ indexname: string; indexdef: string }[]>`
        SELECT indexname, indexdef FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'units'
          AND indexdef LIKE '%symbol%' AND indexdef LIKE '%UNIQUE%'
        ORDER BY indexname`
      expect(symbolUniqueIndexes.map((index) => index.indexname)).toEqual([
        'units_company_symbol_unique',
        'units_system_symbol_unique',
      ])
      // Sin su `WHERE`, la unicidad dejaria de ser por ambito.
      for (const index of symbolUniqueIndexes) {
        expect(index.indexdef, `${index.indexname} debe ser parcial`).toMatch(/WHERE/i)
        expect(index.indexdef).toMatch(/symbol.*IS NOT NULL/i)
      }
    })
  })

  it('created_at y updated_at se rellenan solos y updated_at cambia al modificar', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const id = await createUnit(tx, marker)

      const antes = await tx.unit.findUniqueOrThrow({
        where: { id },
        select: { createdAt: true, updatedAt: true },
      })
      expect(antes.createdAt).toBeInstanceOf(Date)
      expect(antes.updatedAt).toBeInstanceOf(Date)

      await sleep(20)
      await tx.unit.update({ where: { id }, data: { symbol: `${symbolFor(marker)}b` } })

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
  it('la unidad la declara la PRESENTACION, obligatoria, y el producto ya no tiene donde declararla (QC-80 R1, R21)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const primera = await createUnit(tx, `a${marker}`)
      const segunda = await createUnit(tx, `b${marker}`)

      const unaPresentacion = await createPresentation(tx, `p1${marker}`, primera)
      const otraPresentacion = await createPresentation(tx, `p2${marker}`, segunda)

      const leidas = await tx.presentation.findMany({
        where: { id: { in: [unaPresentacion, otraPresentacion] } },
        select: { id: true, unitId: true },
      })
      expect(leidas.find((row) => row.id === unaPresentacion)?.unitId).toBe(primera)
      expect(leidas.find((row) => row.id === otraPresentacion)?.unitId).toBe(segunda)

      expect(await columnInfo(tx, 'presentations', ['unit_id'])).toEqual([
        { column_name: 'unit_id', data_type: 'uuid', is_nullable: 'NO' },
      ])
      expect(await columnInfo(tx, 'products', ['unit_id', 'unit'])).toEqual([])
    })
  })

  it('rechaza una linea de receta sin unidad con SQLSTATE 23502', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const recipeId = await createRecipe(tx, marker)
      const productId = await createProduct(tx)

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

      const survivors = await tx.recipeLine.findMany({ where: { recipeId }, select: { id: true } })
      expect(survivors).toEqual([])

      const columns = await columnInfo(tx, 'recipe_lines', ['unit_id', 'unit'])
      expect(columns).toEqual([
        { column_name: 'unit_id', data_type: 'uuid', is_nullable: 'NO' },
      ])
    })
  })

  it('rechaza una presentacion y una linea con unit_id inexistente con SQLSTATE 23503', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const recipeId = await createRecipe(tx, marker)
      const unitId = await createUnit(tx, marker)
      const productId = await createProduct(tx)
      const presentationId = await createPresentation(tx, marker, unitId)
      const inventada = randomUUID()

      const presentacionConUnidadFantasma = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'presentations', {
            name: Prisma.sql`${`Presentacion con unidad fantasma ${marker}`}`,
            unit_id: asUuid(inventada),
          }),
        'presentacion con unit_id inexistente',
      )
      expect(presentacionConUnidadFantasma).toBe(FOREIGN_KEY_VIOLATION)

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

      const edicionConUnidadFantasma = await expectRejectedByDatabase(
        tx,
        () =>
          tx.$executeRaw`UPDATE "presentations" SET "unit_id" = ${asUuid(inventada)} WHERE "id" = ${asUuid(presentationId)}`,
        'edicion de presentacion apuntando a una unidad inexistente',
      )
      expect(edicionConUnidadFantasma).toBe(FOREIGN_KEY_VIOLATION)

      const presentacionesDelIntento = await tx.presentation.findMany({
        where: { name: `Presentacion con unidad fantasma ${marker}` },
        select: { id: true },
      })
      expect(presentacionesDelIntento).toEqual([])
      expect(await tx.recipeLine.findMany({ where: { recipeId }, select: { id: true } })).toEqual([])
      const presentacion = await tx.presentation.findUniqueOrThrow({
        where: { id: presentationId },
        select: { unitId: true },
      })
      expect(presentacion.unitId).toBe(unitId)
      expect(await tx.product.findUnique({ where: { id: productId }, select: { id: true } })).not.toBeNull()
    })
  })

  it('rechaza el borrado de una unidad usada por una presentacion y por una linea con SQLSTATE 23503, y permite el de una unidad libre', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const unidadDePresentacion = await createUnit(tx, `p${marker}`)
      const unidadDeLinea = await createUnit(tx, `l${marker}`)
      const unidadLibre = await createUnit(tx, `x${marker}`, null)

      const presentationId = await createPresentation(tx, marker, unidadDePresentacion)
      const recipeId = await createRecipe(tx, marker)
      const productoDeLaLinea = await createProduct(tx, 'Insumo de la linea')
      const lineId = await createLine(tx, recipeId, productoDeLaLinea, unidadDeLinea)

      const usadaPorPresentacion = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`DELETE FROM "units" WHERE "id" = ${asUuid(unidadDePresentacion)}`,
        'borrado de una unidad usada por una presentacion',
      )
      expect(usadaPorPresentacion).toBe(FOREIGN_KEY_VIOLATION)

      const usadaPorLinea = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`DELETE FROM "units" WHERE "id" = ${asUuid(unidadDeLinea)}`,
        'borrado de una unidad usada por una linea de receta',
      )
      expect(usadaPorLinea).toBe(FOREIGN_KEY_VIOLATION)

      expect(await tx.unit.findUnique({ where: { id: unidadDePresentacion } })).not.toBeNull()
      expect(await tx.unit.findUnique({ where: { id: unidadDeLinea } })).not.toBeNull()
      const presentacion = await tx.presentation.findUniqueOrThrow({
        where: { id: presentationId },
        select: { unitId: true },
      })
      expect(presentacion.unitId).toBe(unidadDePresentacion)
      const linea = await tx.recipeLine.findUniqueOrThrow({
        where: { id: lineId },
        select: { unitId: true },
      })
      expect(linea.unitId).toBe(unidadDeLinea)

      // Sin esto, el test pasaria igual con una tabla que no deja borrar nada nunca.
      await tx.unit.delete({ where: { id: unidadLibre } })
      expect(await tx.unit.findUnique({ where: { id: unidadLibre } })).toBeNull()
    })
  })

  it('una linea puede usar una unidad distinta de la que su producto DERIVA del lote', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const unidadDelProducto = await createUnit(tx, `kg${marker}`)
      const unidadDeLaLinea = await createUnit(tx, `g${marker}`)

      const productId = await createProduct(tx, 'Colorante azul')
      const presentationId = await createPresentation(tx, marker, unidadDelProducto)
      await createBatch(tx, productId, presentationId)
      const recipeId = await createRecipe(tx, marker)
      const lineId = await createLine(tx, recipeId, productId, unidadDeLaLinea, '0.0100')

      const linea = await tx.recipeLine.findUniqueOrThrow({
        where: { id: lineId },
        select: { unitId: true, quantity: true },
      })
      const [loteDelProducto] = await tx.productBatch.findMany({
        where: { productId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 1,
        select: { presentation: { select: { unitId: true } } },
      })
      const unidadDerivada = loteDelProducto?.presentation.unitId ?? null
      expect(unidadDerivada).toBe(unidadDelProducto)
      expect(linea.unitId).toBe(unidadDeLaLinea)
      expect(linea.unitId).not.toBe(unidadDerivada)
      expect(linea.quantity.toString()).toBe('0.01')

      const columns = await tx.$queryRaw<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'units'
        ORDER BY column_name`
      expect(columns.map((column) => column.column_name)).toEqual([
        'company_id',
        'created_at',
        'factor',
        'id',
        'name',
        'name_normalized',
        'symbol',
        'unit_id',
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

      const unidadFantasmaEnPresentacion = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'presentations', {
            name: Prisma.sql`${`Presentacion ${marker}`}`,
            unit_id: asUuid(randomUUID()),
          }),
        'presentacion con unit_id inventado',
      )
      expect(unidadFantasmaEnPresentacion).toBe(FOREIGN_KEY_VIOLATION)

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

      // Prisma declara `unit_id` sin `@relation`: la integridad la da Postgres.
      // `pg_constraint` abarca toda la base, no un esquema, asi que un esquema espejo con las
      // mismas tablas duplicaria cada FK. Se acota `public` en las dos puntas porque
      // `search_path` y `::regclass` no bastan.
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
      // Lista exacta y no `toContain`: una FK nueva hacia `units` sin RESTRICT, o una perdida
      // por drift de `migrate dev`, tiene que poner rojo este caso.
      expect(foreignKeys).toEqual([
        {
          conname: 'presentations_unit_id_fkey',
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
        // Su RESTRICT es lo unico que impide borrar una unidad de la que otra deriva.
        {
          conname: 'units_unit_id_fkey',
          referencia: 'units',
          confdeltype: 'r',
          confupdtype: 'c',
        },
      ])
    })
  })
})

describe('QC-76 — la equivalencia entre unidades', () => {
  it('acepta una unidad BASE, sin unidad de la que derive y sin factor (R1)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const id = await createUnit(tx, marker)

      const unit = await tx.unit.findUniqueOrThrow({
        where: { id },
        select: { baseUnitId: true, factor: true, companyId: true },
      })
      expect(unit.baseUnitId).toBeNull()
      expect(unit.factor).toBeNull()
      expect(unit.companyId).toBeNull()
    })
  })

  it('acepta una unidad derivada con la pareja completa y la relee sin perdida (R1)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const base = await createUnit(tx, `base${marker}`)
      const derivada = await createUnit(tx, `der${marker}`, symbolFor(`d${marker}`), {
        baseUnitId: base,
        factor: '1000.0000',
      })

      const unit = await tx.unit.findUniqueOrThrow({
        where: { id: derivada },
        select: { baseUnitId: true, factor: true },
      })
      expect(unit.baseUnitId).toBe(base)
      expect(unit.factor?.toString()).toBe('1000')
    })
  })

  it('rechaza la pareja incompleta en las DOS direcciones con SQLSTATE 23514 (R2)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const base = await createUnit(tx, `base${marker}`)

      // El padre es valido, hoja y del mismo ambito: el disparador no rechaza y el unico
      // rechazo posible es `units_derivation_pair_check`.
      const sinFactor = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'units', {
            name: Prisma.sql`${`Sin factor ${marker}`}`,
            name_normalized: Prisma.sql`${`sinfactor${marker}`}`,
            unit_id: asUuid(base),
          }),
        'unidad con unidad base y sin factor',
      )
      expect(sinFactor).toBe(CHECK_VIOLATION)

      // Con `unit_id` NULL el disparador no comprueba nada: solo puede rechazarlo el CHECK.
      const sinBase = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'units', {
            name: Prisma.sql`${`Sin base ${marker}`}`,
            name_normalized: Prisma.sql`${`sinbase${marker}`}`,
            factor: Prisma.sql`1000.0000`,
          }),
        'unidad con factor y sin unidad base',
      )
      expect(sinBase).toBe(CHECK_VIOLATION)

      expect(
        await tx.unit.findMany({
          where: { nameNormalized: { in: [`sinfactor${marker}`, `sinbase${marker}`] } },
          select: { id: true },
        }),
      ).toEqual([])
    })
  })

  it('conserva sin perdida un factor de CUATRO decimales (R3)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const base = await createUnit(tx, `base${marker}`)
      const derivada = await createUnit(tx, `der${marker}`, symbolFor(`d${marker}`), {
        baseUnitId: base,
        factor: '1234.5678',
      })

      // `1234.5678` no es representable en coma flotante binaria.
      const unit = await tx.unit.findUniqueOrThrow({
        where: { id: derivada },
        select: { factor: true },
      })
      expect(unit.factor?.toString()).toBe('1234.5678')

      // El crudo descarta que sea el cliente quien lo redondea al leer.
      const crudo = await tx.$queryRaw<{ factor: string }[]>`
        SELECT "factor"::text AS factor FROM "units" WHERE "id" = ${asUuid(derivada)}`
      expect(crudo).toEqual([{ factor: '1234.5678' }])

      const tipo = await tx.$queryRaw<
        { data_type: string; numeric_precision: number; numeric_scale: number }[]
      >`
        SELECT data_type, numeric_precision, numeric_scale
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'units' AND column_name = 'factor'`
      expect(tipo).toEqual([{ data_type: 'numeric', numeric_precision: 14, numeric_scale: 4 }])
    })
  })

  it('rechaza el factor 0 y el factor -1 con SQLSTATE 23514 (R4)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const base = await createUnit(tx, `base${marker}`)

      // Con factor cero la conversion inversa dividiria por cero; con uno negativo, una
      // cantidad positiva pasaria a negativa.
      for (const [etiqueta, factor] of [
        ['cero', '0.0000'],
        ['negativo', '-1.0000'],
      ] as const) {
        const sqlState = await expectRejectedByDatabase(
          tx,
          () =>
            rawInsert(tx, 'units', {
              name: Prisma.sql`${`Factor ${etiqueta} ${marker}`}`,
              name_normalized: Prisma.sql`${`factor${etiqueta}${marker}`}`,
              unit_id: asUuid(base),
              factor: Prisma.sql`CAST(${factor} AS numeric)`,
            }),
          `unidad con factor ${etiqueta}`,
        )
        expect(sqlState, `factor ${factor}`).toBe(CHECK_VIOLATION)
        expect(
          await tx.unit.findMany({
            where: { nameNormalized: `factor${etiqueta}${marker}` },
            select: { id: true },
          }),
        ).toEqual([])
      }
    })
  })

  it('acepta un factor MENOR que 1, sin normalizarlo (R5)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      // La unidad base no tiene por que ser la mas pequena de su familia, y nadie invierte el
      // factor por su cuenta.
      const garrafa = await createUnit(tx, `garrafa${marker}`)
      const media = await createUnit(tx, `media${marker}`, symbolFor(`m${marker}`), {
        baseUnitId: garrafa,
        factor: '0.5000',
      })

      const unit = await tx.unit.findUniqueOrThrow({
        where: { id: media },
        select: { baseUnitId: true, factor: true },
      })
      expect(unit.baseUnitId).toBe(garrafa)
      expect(unit.factor?.toString()).toBe('0.5')
      const base = await tx.unit.findUniqueOrThrow({
        where: { id: garrafa },
        select: { baseUnitId: true, factor: true },
      })
      expect(base).toEqual({ baseUnitId: null, factor: null })
    })
  })

  it('rechaza que una unidad HOJA derive de si misma con SQLSTATE 23514 (R7)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      // Hoja a proposito: si ya fuera padre de otra, el disparador `BEFORE` la rechazaria antes
      // que `units_no_self_derivation_check`, con el mismo 23514.
      const sola = await createUnit(tx, marker)

      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          tx.$executeRaw`UPDATE "units" SET "unit_id" = ${asUuid(sola)}, "factor" = 2.0000 WHERE "id" = ${asUuid(sola)}`,
        'unidad que deriva de si misma',
      )
      expect(sqlState).toBe(CHECK_VIOLATION)

      const unit = await tx.unit.findUniqueOrThrow({
        where: { id: sola },
        select: { baseUnitId: true, factor: true },
      })
      expect(unit).toEqual({ baseUnitId: null, factor: null })
    })
  })

  it('rechaza el segundo nivel de derivacion en las DOS direcciones con SQLSTATE 23514 (R6)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const base = await createUnit(tx, `base${marker}`)
      const derivada = await createUnit(tx, `der${marker}`, symbolFor(`d${marker}`), {
        baseUnitId: base,
        factor: '1000.0000',
      })
      const otraBase = await createUnit(tx, `otra${marker}`)

      const nieta = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'units', {
            name: Prisma.sql`${`Nieta ${marker}`}`,
            name_normalized: Prisma.sql`${`nieta${marker}`}`,
            unit_id: asUuid(derivada),
            factor: Prisma.sql`10.0000`,
          }),
        'unidad que deriva de una unidad ya derivada',
      )
      expect(nieta).toBe(CHECK_VIOLATION)
      expect(
        await tx.unit.findMany({ where: { nameNormalized: `nieta${marker}` }, select: { id: true } }),
      ).toEqual([])

      // Sin esta direccion, la cadena de dos niveles entraria por un UPDATE sobre el padre.
      const padreDerivado = await expectRejectedByDatabase(
        tx,
        () =>
          tx.$executeRaw`UPDATE "units" SET "unit_id" = ${asUuid(otraBase)}, "factor" = 5.0000 WHERE "id" = ${asUuid(base)}`,
        'unidad padre que pasa a derivar de otra',
      )
      expect(padreDerivado).toBe(CHECK_VIOLATION)

      expect(
        await tx.unit.findUniqueOrThrow({
          where: { id: base },
          select: { baseUnitId: true, factor: true },
        }),
      ).toEqual({ baseUnitId: null, factor: null })
      expect(
        await tx.unit.findUniqueOrThrow({ where: { id: derivada }, select: { baseUnitId: true } }),
      ).toEqual({ baseUnitId: base })
    })
  })

  it('rechaza el borrado de una unidad de la que deriva otra con SQLSTATE 23503, y permite el de la hija (R8)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      // Unidades propias: una del catalogo puede estar usada por recetas, y el borrado saltaria
      // por `recipe_lines_unit_id_fkey` en vez de por `units_unit_id_fkey`.
      const madre = await createUnit(tx, `madre${marker}`)
      const hija = await createUnit(tx, `hija${marker}`, symbolFor(`h${marker}`), {
        baseUnitId: madre,
        factor: '1000.0000',
      })

      const sqlState = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`DELETE FROM "units" WHERE "id" = ${asUuid(madre)}`,
        'borrado de una unidad de la que deriva otra',
      )
      expect(sqlState).toBe(FOREIGN_KEY_VIOLATION)

      expect(await tx.unit.findUnique({ where: { id: madre }, select: { id: true } })).not.toBeNull()
      expect(
        await tx.unit.findUniqueOrThrow({
          where: { id: hija },
          select: { baseUnitId: true, factor: true },
        }),
      ).toEqual({ baseUnitId: madre, factor: new Prisma.Decimal('1000.0000') })

      // Sin esto, el caso pasaria igual con una tabla que no deja borrar nada nunca.
      await tx.unit.delete({ where: { id: hija } })
      await tx.unit.delete({ where: { id: madre } })
      expect(await tx.unit.findUnique({ where: { id: madre }, select: { id: true } })).toBeNull()
    })
  })
})

describe('QC-76 — el ambito por empresa', () => {
  it('acepta que una unidad de empresa derive de una suya o de una de sistema (R9)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const companyId = await createCompany(tx, marker)

      const deSistema = await createUnit(tx, `sis${marker}`)
      const propia = await createUnit(tx, `pro${marker}`, symbolFor(`p${marker}`), { companyId })

      const desdeLaSuya = await createUnit(tx, `a${marker}`, symbolFor(`a${marker}`), {
        companyId,
        baseUnitId: propia,
        factor: '10.0000',
      })
      const desdeSistema = await createUnit(tx, `b${marker}`, symbolFor(`b${marker}`), {
        companyId,
        baseUnitId: deSistema,
        factor: '1000.0000',
      })

      const filas = await tx.unit.findMany({
        where: { id: { in: [desdeLaSuya, desdeSistema] } },
        select: { id: true, companyId: true, baseUnitId: true },
        orderBy: { nameNormalized: 'asc' },
      })
      expect(filas).toEqual([
        { id: desdeLaSuya, companyId, baseUnitId: propia },
        { id: desdeSistema, companyId, baseUnitId: deSistema },
      ])
    })
  })

  it('rechaza derivar de una unidad de OTRA empresa, y que una de sistema derive de una de empresa, con SQLSTATE 23514 (R9)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const empresaA = await createCompany(tx, `a${marker}`)
      const empresaB = await createCompany(tx, `b${marker}`)
      const deLaB = await createUnit(tx, `b${marker}`, symbolFor(`b${marker}`), {
        companyId: empresaB,
      })

      // Derivar de una unidad de otra empresa romperia el aislamiento: borrar algo en una
      // empresa afectaria a otra.
      const ajena = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'units', {
            name: Prisma.sql`${`Ajena ${marker}`}`,
            name_normalized: Prisma.sql`${`ajena${marker}`}`,
            company_id: asUuid(empresaA),
            unit_id: asUuid(deLaB),
            factor: Prisma.sql`2.0000`,
          }),
        'unidad de una empresa que deriva de una unidad de otra',
      )
      expect(ajena).toBe(CHECK_VIOLATION)

      // Una unidad que vale para todas las empresas no puede depender de la privada de una.
      const sistemaDesdeEmpresa = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'units', {
            name: Prisma.sql`${`Sistema ${marker}`}`,
            name_normalized: Prisma.sql`${`sistema${marker}`}`,
            unit_id: asUuid(deLaB),
            factor: Prisma.sql`2.0000`,
          }),
        'unidad de sistema que deriva de una unidad de empresa',
      )
      expect(sistemaDesdeEmpresa).toBe(CHECK_VIOLATION)

      expect(
        await tx.unit.findMany({
          where: { nameNormalized: { in: [`ajena${marker}`, `sistema${marker}`] } },
          select: { id: true },
        }),
      ).toEqual([])
    })
  })

  it('rechaza una unidad cuya empresa no existe con SQLSTATE 23503 (R13)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const empresaFantasma = randomUUID()

      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'units', {
            name: Prisma.sql`${`Fantasma ${marker}`}`,
            name_normalized: Prisma.sql`${`fantasma${marker}`}`,
            company_id: asUuid(empresaFantasma),
          }),
        'unidad con una empresa inexistente',
      )
      // El escalar sin `@relation` de Prisma no impide nada: lo rechaza la FK real.
      expect(sqlState).toBe(FOREIGN_KEY_VIOLATION)
      expect(
        await tx.unit.findMany({
          where: { nameNormalized: `fantasma${marker}` },
          select: { id: true },
        }),
      ).toEqual([])
    })
  })

  it('rechaza el mismo nombre normalizado DENTRO del ambito con SQLSTATE 23505 (R14)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const companyId = await createCompany(tx, marker)
      const normalized = `kilogramo${marker}`

      const { id: primera } = await tx.unit.create({
        data: { name: `Kilogramo ${marker}`, nameNormalized: normalized, companyId, symbol: null },
        select: { id: true },
      })

      const enLaEmpresa = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'units', {
            name: Prisma.sql`${`KILO-GRAMO ${marker}`}`,
            name_normalized: Prisma.sql`${normalized}`,
            company_id: asUuid(companyId),
          }),
        'segunda unidad con el mismo nombre normalizado en la misma empresa',
      )
      expect(enLaEmpresa).toBe(UNIQUE_VIOLATION)

      // La garantia es el indice: una comprobacion previa al vuelo seria una carrera.
      const deSistema = `sistema${marker}`
      await tx.unit.create({
        data: { name: `Sistema ${marker}`, nameNormalized: deSistema, symbol: null },
        select: { id: true },
      })
      const entreSistema = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'units', {
            name: Prisma.sql`${`SIS-TEMA ${marker}`}`,
            name_normalized: Prisma.sql`${deSistema}`,
          }),
        'segunda unidad de sistema con el mismo nombre normalizado',
      )
      expect(entreSistema).toBe(UNIQUE_VIOLATION)

      const filas = await tx.unit.findMany({
        where: { nameNormalized: normalized },
        select: { id: true, name: true },
      })
      expect(filas).toEqual([{ id: primera, name: `Kilogramo ${marker}` }])
    })
  })

  it('acepta el mismo nombre normalizado en DOS empresas y en una empresa frente a sistema (R14)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const empresaA = await createCompany(tx, `a${marker}`)
      const empresaB = await createCompany(tx, `b${marker}`)
      const normalized = `kilogramo${marker}`

      const deSistema = await tx.unit.create({
        data: { name: `Kilogramo ${marker}`, nameNormalized: normalized, symbol: null },
        select: { id: true },
      })
      const deLaA = await tx.unit.create({
        data: {
          name: `Kilogramo ${marker}`,
          nameNormalized: normalized,
          companyId: empresaA,
          symbol: null,
        },
        select: { id: true },
      })
      const deLaB = await tx.unit.create({
        data: {
          name: `Kilogramo ${marker}`,
          nameNormalized: normalized,
          companyId: empresaB,
          symbol: null,
        },
        select: { id: true },
      })

      const filas = await tx.unit.findMany({
        where: { nameNormalized: normalized },
        select: { id: true, companyId: true },
      })
      expect(filas.map((fila) => fila.id).sort()).toEqual(
        [deSistema.id, deLaA.id, deLaB.id].sort(),
      )
      expect(filas.filter((fila) => fila.companyId === null)).toHaveLength(1)
    })
  })

  it('rechaza el mismo simbolo DENTRO del ambito con SQLSTATE 23505 (R15)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const companyId = await createCompany(tx, marker)
      const symbol = `s${marker.slice(0, 6)}`

      await tx.unit.create({
        data: { name: `Primera ${marker}`, nameNormalized: `primera${marker}`, symbol, companyId },
        select: { id: true },
      })

      // Nombre distinto a proposito: el 23505 solo puede venir del indice del simbolo.
      const enLaEmpresa = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'units', {
            name: Prisma.sql`${`Segunda ${marker}`}`,
            name_normalized: Prisma.sql`${`segunda${marker}`}`,
            symbol: Prisma.sql`${symbol}`,
            company_id: asUuid(companyId),
          }),
        'segunda unidad con el mismo simbolo en la misma empresa',
      )
      expect(enLaEmpresa).toBe(UNIQUE_VIOLATION)

      const symbolSistema = `t${marker.slice(0, 6)}`
      await tx.unit.create({
        data: {
          name: `Sistema uno ${marker}`,
          nameNormalized: `sistemauno${marker}`,
          symbol: symbolSistema,
        },
        select: { id: true },
      })
      const entreSistema = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'units', {
            name: Prisma.sql`${`Sistema dos ${marker}`}`,
            name_normalized: Prisma.sql`${`sistemados${marker}`}`,
            symbol: Prisma.sql`${symbolSistema}`,
          }),
        'segunda unidad de sistema con el mismo simbolo',
      )
      expect(entreSistema).toBe(UNIQUE_VIOLATION)
    })
  })

  it('acepta VARIAS unidades sin simbolo en el mismo ambito (R15)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const companyId = await createCompany(tx, marker)

      // Sin el `WHERE "symbol" IS NOT NULL` de los indices, un ambito solo podria tener una
      // unidad sin simbolo.
      const sinSimboloEmpresa = [
        await createUnit(tx, `e1${marker}`, null, { companyId }),
        await createUnit(tx, `e2${marker}`, null, { companyId }),
        await createUnit(tx, `e3${marker}`, null, { companyId }),
      ]
      const sinSimboloSistema = [
        await createUnit(tx, `s1${marker}`, null),
        await createUnit(tx, `s2${marker}`, null),
      ]

      const filas = await tx.unit.findMany({
        where: { id: { in: [...sinSimboloEmpresa, ...sinSimboloSistema] } },
        select: { id: true, symbol: true },
      })
      expect(filas).toHaveLength(5)
      for (const fila of filas) expect(fila.symbol).toBeNull()
    })
  })

  it('acepta el MISMO simbolo en dos empresas distintas (R15)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const empresaA = await createCompany(tx, `a${marker}`)
      const empresaB = await createCompany(tx, `b${marker}`)
      const symbol = `s${marker.slice(0, 6)}`

      const deLaA = await createUnit(tx, `a${marker}`, symbol, { companyId: empresaA })
      const deLaB = await createUnit(tx, `b${marker}`, symbol, { companyId: empresaB })

      const filas = await tx.unit.findMany({ where: { symbol }, select: { id: true } })
      expect(filas.map((fila) => fila.id).sort()).toEqual([deLaA, deLaB].sort())
    })
  })

  it('marcar la empresa como borrada NO toca ninguna de sus unidades (R16)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const companyId = await createCompany(tx, marker)
      const base = await createUnit(tx, `base${marker}`, symbolFor(`b${marker}`), { companyId })
      const derivada = await createUnit(tx, `der${marker}`, symbolFor(`d${marker}`), {
        companyId,
        baseUnitId: base,
        factor: '1000.0000',
      })

      const antes = await tx.unit.findMany({
        where: { companyId },
        select: { id: true, companyId: true, baseUnitId: true, factor: true },
        orderBy: { nameNormalized: 'asc' },
      })

      // El borrado de `companies` es logico, asi que el RESTRICT de la FK no interviene: lo
      // unico que protege este caso es que nada vacie las unidades al marcar la empresa.
      await tx.company.update({ where: { id: companyId }, data: { deletedAt: new Date() } })

      const despues = await tx.unit.findMany({
        where: { companyId },
        select: { id: true, companyId: true, baseUnitId: true, factor: true },
        orderBy: { nameNormalized: 'asc' },
      })
      expect(despues).toEqual(antes)
      expect(despues.map((fila) => fila.id).sort()).toEqual([base, derivada].sort())
    })
  })
})

describe('QC-76 — cambiar la equivalencia de una unidad en uso', () => {
  it('permite cambiar factor y base con una presentacion y una linea de receta apuntando, sin invalidar nada (R10)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const enUso = await createUnit(tx, `uso${marker}`)
      const primeraBase = await createUnit(tx, `b1${marker}`)
      const segundaBase = await createUnit(tx, `b2${marker}`)

      const productId = await createProduct(tx, 'Colorante azul')
      const presentationId = await createPresentation(tx, marker, enUso)
      const recipeId = await createRecipe(tx, marker)
      const lineId = await createLine(tx, recipeId, productId, enUso, '0.0100')

      await tx.unit.update({
        where: { id: enUso },
        data: { baseUnitId: primeraBase, factor: new Prisma.Decimal('1000.0000') },
      })
      await tx.unit.update({
        where: { id: enUso },
        data: { baseUnitId: segundaBase, factor: new Prisma.Decimal('0.2500') },
      })

      const unit = await tx.unit.findUniqueOrThrow({
        where: { id: enUso },
        select: { baseUnitId: true, factor: true },
      })
      expect(unit.baseUnitId).toBe(segundaBase)
      expect(unit.factor?.toString()).toBe('0.25')

      // La presentacion y la linea guardan una referencia a la unidad, no una cantidad ya
      // convertida: no hay nada que invalidar.
      const presentacion = await tx.presentation.findUniqueOrThrow({
        where: { id: presentationId },
        select: { unitId: true },
      })
      expect(presentacion.unitId).toBe(enUso)
      const linea = await tx.recipeLine.findUniqueOrThrow({
        where: { id: lineId },
        select: { unitId: true, quantity: true },
      })
      expect(linea.unitId).toBe(enUso)
      expect(linea.quantity.toString()).toBe('0.01')

      // Quitar la equivalencia tambien es legal si los dos campos se quitan juntos.
      await tx.unit.update({ where: { id: enUso }, data: { baseUnitId: null, factor: null } })
      expect(
        await tx.unit.findUniqueOrThrow({
          where: { id: enUso },
          select: { baseUnitId: true, factor: true },
        }),
      ).toEqual({ baseUnitId: null, factor: null })
    })
  })
})
