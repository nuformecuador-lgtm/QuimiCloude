/**
 * Contra la base ya migrada por `*_recipe_lines_percentage`: R6 (rango y redondeo del porcentaje)
 * y R8 (las recetas previas conservan sus datos con cero lineas). La base es compartida: cada caso
 * siembra sus propias filas con marcadores irrepetibles y se deshace en un ROLLBACK.
 */
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { Prisma } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { normalizeCompanyName } from '@/lib/modules/identity'
import { prisma } from '@/lib/shared/db/prisma'

function findRepoRoot(startDir: string): string {
  let dir = startDir
  for (;;) {
    try {
      readFileSync(join(dir, 'package.json'))
      return dir
    } catch {
      const parent = dirname(dir)
      if (parent === dir) throw new Error(`no se encontro package.json subiendo desde ${startDir}`)
      dir = parent
    }
  }
}

const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)))
const migrationsDir = join(repoRoot, 'db', 'migrations')
const percentageMigrationDirs = readdirSync(migrationsDir).filter((name) =>
  name.endsWith('_recipe_lines_percentage'),
)
expect(percentageMigrationDirs, 'debe existir exactamente una migracion *_recipe_lines_percentage').toHaveLength(1)
const percentageMigrationDir = join(migrationsDir, percentageMigrationDirs[0] as string)

function leerMigracion(archivo: string): string {
  return readFileSync(join(percentageMigrationDir, archivo), 'utf8')
}

/** Trocea por `;` de nivel superior. No hay bloques `$$` ni comillas con `;` dentro en este par
 *  de archivos, asi que basta descartar los comentarios `--` antes de partir. */
function sentenciasSql(sql: string): readonly string[] {
  return sql
    .replace(/--.*$/gm, '')
    .split(';')
    .map((sentencia) => sentencia.trim())
    .filter((sentencia) => sentencia.length > 0)
}

const SENTENCIAS_DEL_UP = sentenciasSql(leerMigracion('migration.sql'))
const SENTENCIAS_DEL_DOWN = sentenciasSql(leerMigracion('down.sql'))

async function ejecutar(tx: Prisma.TransactionClient, sentencias: readonly string[]): Promise<void> {
  for (const sentencia of sentencias) {
    await tx.$executeRawUnsafe(sentencia)
  }
}

class RollbackSignal extends Error {
  constructor() {
    super('rollback de aislamiento del test')
    this.name = 'RollbackSignal'
  }
}

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

const CHECK_VIOLATION = '23514'

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

function token(): string {
  return randomUUID().replace(/-/gu, '')
}

function asUuid(id: string): Prisma.Sql {
  return Prisma.sql`CAST(${id} AS uuid)`
}

function normalizeProductNameForTest(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]/gu, '')
}

const empresasDeInventario = new WeakMap<object, Promise<string>>()

function inventoryCompanyOf(tx: Prisma.TransactionClient): Promise<string> {
  const enCurso = empresasDeInventario.get(tx)
  if (enCurso !== undefined) return enCurso
  const creando = (async (): Promise<string> => {
    const companyName = `Empresa porcentaje ${token()}`
    const company = await tx.company.create({
      data: { name: companyName, nameNormalized: normalizeCompanyName(companyName) },
      select: { id: true },
    })
    return company.id
  })()
  empresasDeInventario.set(tx, creando)
  return creando
}

async function createProduct(tx: Prisma.TransactionClient, name = 'Insumo de prueba'): Promise<string> {
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

async function createRecipe(
  tx: Prisma.TransactionClient,
  marker: string,
  steps: readonly string[] = [],
): Promise<string> {
  const recipe = await tx.recipe.create({
    data: {
      name: `Receta ${marker}`,
      nameNormalized: `receta${marker}`,
      steps: [...steps],
      companyId: await inventoryCompanyOf(tx),
    },
    select: { id: true },
  })
  return recipe.id
}

beforeAll(async () => {
  const columns = await prisma.$queryRaw<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'recipe_lines' AND column_name = 'percentage'`
  if (columns.length !== 1) {
    throw new Error(
      'la base de pruebas no tiene aplicada la migracion *_recipe_lines_percentage. ' +
        'Corre `pnpm run db:migrate` antes de estos tests.',
    )
  }
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('recipe_lines.percentage — rango y redondeo (R6)', () => {
  it('rechaza 0, -1 y 100.01 con SQLSTATE 23514', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const recipeId = await createRecipe(tx, marker)
      const productId = await createProduct(tx)

      // Insercion cruda: la API tipada traduciria el SQLSTATE a su propio codigo (P2010, sin
      // `meta.code`), y aqui hace falta el SQLSTATE real.
      for (const invalido of ['0', '-1', '100.01']) {
        const sqlState = await expectRejectedByDatabase(
          tx,
          () => tx.$executeRaw`
            INSERT INTO "recipe_lines" ("id", "recipe_id", "product_id", "percentage", "updated_at")
            VALUES (gen_random_uuid(), ${asUuid(recipeId)}, ${asUuid(productId)}, CAST(${invalido} AS numeric), CURRENT_TIMESTAMP)`,
          `linea con porcentaje ${invalido}`,
        )
        expect(sqlState, `porcentaje ${invalido}`).toBe(CHECK_VIOLATION)
      }

      const survivors = await tx.recipeLine.findMany({ where: { recipeId }, select: { id: true } })
      expect(survivors).toEqual([])
    })
  })

  it('acepta 100.00', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const recipeId = await createRecipe(tx, marker)
      const productId = await createProduct(tx)

      const line = await tx.recipeLine.create({
        data: { recipeId, productId, percentage: new Prisma.Decimal('100.00') },
        select: { percentage: true },
      })
      expect(line.percentage.toString()).toBe('100')
    })
  })

  it('relee 12.345 como 12.35: la base redondea, no rechaza, un tercer decimal', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const recipeId = await createRecipe(tx, marker)
      const productId = await createProduct(tx)

      await tx.$executeRaw`
        INSERT INTO "recipe_lines" ("id", "recipe_id", "product_id", "percentage", "updated_at")
        VALUES (gen_random_uuid(), ${asUuid(recipeId)}, ${asUuid(productId)}, 12.345, CURRENT_TIMESTAMP)`

      const line = await tx.recipeLine.findFirstOrThrow({
        where: { recipeId },
        select: { percentage: true },
      })
      expect(line.percentage.toString()).toBe('12.35')

      const crudo = await tx.$queryRaw<{ percentage: string }[]>`
        SELECT "percentage"::text AS percentage FROM "recipe_lines" WHERE "recipe_id" = ${asUuid(recipeId)}`
      expect(crudo).toEqual([{ percentage: '12.35' }])
    })
  })
})

describe('recetas previas sin lineas conservan sus datos (R8)', () => {
  it('una receta con cero lineas conserva nombre, pasos y updated_at al pasar por la migracion de verdad', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const steps = ['Pesar el insumo', 'Mezclar', 'Envasar']

      // La base de la corrida ya tiene la migracion aplicada (schema con `percentage`). Para
      // ejercitarla de verdad, primero se vuelve al esquema viejo con `down.sql`.
      await ejecutar(tx, SENTENCIAS_DEL_DOWN)

      const recipeId = await createRecipe(tx, marker, steps)
      const productId = await createProduct(tx)
      const unidad = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "units" LIMIT 1`
      const unitId = unidad[0]?.id
      expect(unitId, 'no hay ninguna unidad sembrada para levantar la linea vieja').toBeDefined()

      // Una linea con la forma VIEJA: quantity + unit_id, que es justo lo que la migracion de
      // esta ficha se lleva por delante.
      await tx.$executeRaw`
        INSERT INTO "recipe_lines" ("id", "recipe_id", "product_id", "quantity", "unit_id", "updated_at")
        VALUES (gen_random_uuid(), ${asUuid(recipeId)}, ${asUuid(productId)}, 10, CAST(${unitId} AS uuid), CURRENT_TIMESTAMP)`

      const antes = await tx.recipe.findUniqueOrThrow({
        where: { id: recipeId },
        select: { name: true, description: true, steps: true, updatedAt: true, deletedAt: true },
      })
      expect(antes.name).toBe(`Receta ${marker}`)
      expect(antes.steps).toEqual(steps)
      expect(antes.deletedAt).toBeNull()

      // Ahora la migracion de verdad, leida del disco: vacia `recipe_lines` y la reconstruye
      // con `percentage`.
      await ejecutar(tx, SENTENCIAS_DEL_UP)

      const despues = await tx.recipe.findUniqueOrThrow({
        where: { id: recipeId },
        select: { name: true, description: true, steps: true, updatedAt: true, deletedAt: true },
      })
      expect(despues.name).toBe(antes.name)
      expect(despues.description).toBe(antes.description)
      expect(despues.steps).toEqual(antes.steps)
      expect(despues.updatedAt.getTime()).toBe(antes.updatedAt.getTime())
      expect(despues.deletedAt).toBeNull()

      const lines = await tx.recipeLine.findMany({ where: { recipeId }, select: { id: true } })
      expect(lines).toEqual([])
    })
  })
})

describe('down.sql revierte y migration.sql reaplica, sobre la estructura de verdad (R9)', () => {
  it('el DOWN deja quantity + unit_id con sus restricciones, y el UP los devuelve a percentage', async () => {
    await inRolledBackTransaction(async (tx) => {
      await ejecutar(tx, SENTENCIAS_DEL_DOWN)

      const columnasViejas = await tx.$queryRaw<
        { column_name: string; data_type: string; numeric_precision: number | null; numeric_scale: number | null; is_nullable: string }[]
      >`
        SELECT column_name, data_type, numeric_precision, numeric_scale, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'recipe_lines'
          AND column_name IN ('quantity', 'unit_id', 'percentage')`
      const porNombre = Object.fromEntries(columnasViejas.map((c) => [c.column_name, c]))

      expect(porNombre['percentage'], 'percentage deberia haber desaparecido tras el DOWN').toBeUndefined()
      expect(porNombre['quantity']).toMatchObject({
        data_type: 'numeric',
        numeric_precision: 14,
        numeric_scale: 4,
        is_nullable: 'NO',
      })
      expect(porNombre['unit_id']).toMatchObject({ data_type: 'uuid', is_nullable: 'NO' })

      const restriccionesViejas = await tx.$queryRaw<{ conname: string; contype: string }[]>`
        SELECT conname, contype FROM pg_constraint
        WHERE conrelid = '"recipe_lines"'::regclass
          AND conname IN ('recipe_lines_quantity_positive', 'recipe_lines_unit_id_fkey', 'recipe_lines_percentage_range')`
      const nombresViejos = restriccionesViejas.map((r) => r.conname).sort()
      expect(nombresViejos).toEqual(['recipe_lines_quantity_positive', 'recipe_lines_unit_id_fkey'])

      const indicesViejos = await tx.$queryRaw<{ indexname: string }[]>`
        SELECT indexname FROM pg_indexes WHERE tablename = 'recipe_lines' AND indexname = 'recipe_lines_unit_id_idx'`
      expect(indicesViejos).toHaveLength(1)

      await ejecutar(tx, SENTENCIAS_DEL_UP)

      const columnasNuevas = await tx.$queryRaw<
        { column_name: string; data_type: string; numeric_precision: number | null; numeric_scale: number | null; is_nullable: string }[]
      >`
        SELECT column_name, data_type, numeric_precision, numeric_scale, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'recipe_lines'
          AND column_name IN ('quantity', 'unit_id', 'percentage')`
      const porNombreNuevo = Object.fromEntries(columnasNuevas.map((c) => [c.column_name, c]))
      expect(porNombreNuevo['quantity'], 'quantity deberia haber desaparecido tras el UP').toBeUndefined()
      expect(porNombreNuevo['unit_id'], 'unit_id deberia haber desaparecido tras el UP').toBeUndefined()
      expect(porNombreNuevo['percentage']).toMatchObject({
        data_type: 'numeric',
        numeric_precision: 5,
        numeric_scale: 2,
        is_nullable: 'NO',
      })

      const restriccionesNuevas = await tx.$queryRaw<{ conname: string }[]>`
        SELECT conname FROM pg_constraint
        WHERE conrelid = '"recipe_lines"'::regclass
          AND conname IN ('recipe_lines_quantity_positive', 'recipe_lines_unit_id_fkey', 'recipe_lines_percentage_range')`
      expect(restriccionesNuevas.map((r) => r.conname)).toEqual(['recipe_lines_percentage_range'])
    })
  })
})
