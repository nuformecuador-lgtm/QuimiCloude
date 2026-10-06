/**
 * Contra la base migrada por `*_recipe_versions`: la unicidad de nombre partida entre originales y
 * versiones, el CHECK contra apuntarse a si misma, y el `down.sql` ejecutado de verdad (aborta con
 * versiones; sin ellas, revertir y volver a aplicar no cambia ninguna fila).
 *
 * Cada caso corre en una transaccion que termina en ROLLBACK: en Postgres el DDL es transaccional,
 * asi que ni el `down.sql` ni el `migration.sql` ejecutados aqui sobreviven al caso. `SAVEPOINT`
 * para lo que se espera que falle.
 */
import { randomUUID } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Prisma } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import { normalizeCompanyName } from '@/lib/modules/identity'
import { prisma } from '@/lib/shared/db/prisma'

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
      { maxWait: 10_000, timeout: 60_000 },
    )
  } catch (error) {
    if (!(error instanceof RollbackSignal)) throw error
  }
}

let savepointSeq = 0

async function expectRejected(
  tx: Prisma.TransactionClient,
  run: () => Promise<unknown>,
  what: string,
): Promise<unknown> {
  savepointSeq += 1
  const savepoint = `sp_${String(savepointSeq)}`
  await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`)
  try {
    await run()
  } catch (error) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`)
    return error
  }
  await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`)
  throw new Error(`se esperaba que la base rechazara la operacion, pero la acepto: ${what}`)
}

/** SQLSTATE de Postgres, venga por `meta.code` (raw) o como codigo Prisma conocido. */
function sqlStateOf(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const meta: unknown = error.meta
    if (typeof meta === 'object' && meta !== null && 'code' in meta) {
      const code: unknown = (meta as { code: unknown }).code
      if (typeof code === 'string') return code
    }
    if (error.code === 'P2002') return '23505'
    return error.code
  }
  return ''
}

function metaTargetOf(error: unknown): readonly string[] {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    throw new Error(`se esperaba un PrismaClientKnownRequestError, llego: ${String(error)}`)
  }
  const target: unknown = error.meta?.target
  if (Array.isArray(target)) return target as string[]
  throw new Error(`meta.target no vino como array: ${JSON.stringify(error.meta)}`)
}

function messageOf(error: unknown): string {
  const parts: string[] = []
  if (error instanceof Error) parts.push(error.message)
  if (error instanceof Prisma.PrismaClientKnownRequestError) parts.push(JSON.stringify(error.meta))
  return parts.join(' | ')
}

function token(): string {
  return randomUUID().replace(/-/gu, '')
}

// ---------------------------------------------------------------------------
// SQL de la migracion, leido del disco
// ---------------------------------------------------------------------------

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

const migrationsDir = join(findRepoRoot(dirname(fileURLToPath(import.meta.url))), 'db', 'migrations')
const versionDirs = readdirSync(migrationsDir).filter((name) => name.endsWith('_recipe_versions'))
expect(versionDirs, 'debe existir exactamente una migracion *_recipe_versions').toHaveLength(1)
const migrationDir = join(migrationsDir, versionDirs[0] as string)

/** Sentencias de nivel superior; los `;` dentro de `$$ ... $$`, cadenas o comentarios no cortan. */
function sqlStatements(sql: string): string[] {
  const result: string[] = []
  let current = ''
  let inDollar = false
  let inQuote = false
  let inComment = false
  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i] as string
    const pair = sql.slice(i, i + 2)
    if (inComment) {
      if (char === '\n') {
        inComment = false
        current += char
      }
    } else if (!inDollar && !inQuote && pair === '--') {
      inComment = true
      i += 1
    } else if (!inDollar && char === "'") {
      inQuote = !inQuote
      current += char
    } else if (!inQuote && pair === '$$') {
      inDollar = !inDollar
      current += pair
      i += 1
    } else if (!inDollar && !inQuote && char === ';') {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  if (current.trim() !== '') result.push(current.trim())
  return result.filter((s) => s !== '')
}

const UP = sqlStatements(readFileSync(join(migrationDir, 'migration.sql'), 'utf8'))
const DOWN = sqlStatements(readFileSync(join(migrationDir, 'down.sql'), 'utf8'))
expect(DOWN[0]?.startsWith('DO $$'), 'la guardia debe ser la primera sentencia del down').toBe(true)

async function runStatements(tx: Prisma.TransactionClient, statements: readonly string[]): Promise<void> {
  for (const statement of statements) await tx.$executeRawUnsafe(statement)
}

// ---------------------------------------------------------------------------
// Datos de apoyo
// ---------------------------------------------------------------------------

async function createCompany(tx: Prisma.TransactionClient): Promise<string> {
  const name = `Empresa versiones ${token()}`
  const company = await tx.company.create({
    data: { name, nameNormalized: normalizeCompanyName(name) },
    select: { id: true },
  })
  return company.id
}

/** `nameNormalized` literal: lo que se prueba es el indice, no el normalizador. */
async function createRecipe(
  tx: Prisma.TransactionClient,
  companyId: string,
  nameNormalized: string,
  parentRecipeId: string | null = null,
): Promise<string> {
  const recipe = await tx.recipe.create({
    data: { name: `Receta ${nameNormalized}`, nameNormalized, companyId, parentRecipeId },
    select: { id: true },
  })
  return recipe.id
}

// ---------------------------------------------------------------------------
// Unicidad de nombre
// ---------------------------------------------------------------------------

describe('recipe_versions — unicidad de nombre por ambito', () => {
  it('R12: dos versiones vivas de la misma original con el mismo nombre → 23505 con name_normalized en meta.target', async () => {
    await inRolledBackTransaction(async (tx) => {
      const company = await createCompany(tx)
      const original = await createRecipe(tx, company, `original${token()}`)
      const shared = `version${token()}`
      await createRecipe(tx, company, shared, original)

      const error = await expectRejected(
        tx,
        () => createRecipe(tx, company, shared, original),
        'segunda version viva con el mismo nombre de la misma original',
      )
      expect(sqlStateOf(error)).toBe('23505')
      expect(metaTargetOf(error)).toContain('name_normalized')
      expect(await tx.recipe.count({ where: { parentRecipeId: original } })).toBe(1)
    })
  })

  it('R12: una version dada de baja libera su nombre dentro de la original', async () => {
    await inRolledBackTransaction(async (tx) => {
      const company = await createCompany(tx)
      const original = await createRecipe(tx, company, `original${token()}`)
      const shared = `version${token()}`
      const first = await createRecipe(tx, company, shared, original)
      await tx.recipe.update({ where: { id: first }, data: { deletedAt: new Date() } })

      await expect(createRecipe(tx, company, shared, original)).resolves.toMatch(/^[0-9a-f-]{36}$/u)
    })
  })

  it('R13: una version con el nombre de una original viva de la empresa → aceptada', async () => {
    await inRolledBackTransaction(async (tx) => {
      const company = await createCompany(tx)
      const original = await createRecipe(tx, company, `original${token()}`)
      const otherOriginalName = `otra${token()}`
      await createRecipe(tx, company, otherOriginalName)

      await expect(createRecipe(tx, company, otherOriginalName, original)).resolves.toMatch(
        /^[0-9a-f-]{36}$/u,
      )
    })
  })

  it('R13: una version con el nombre de una version de OTRA original → aceptada', async () => {
    await inRolledBackTransaction(async (tx) => {
      const company = await createCompany(tx)
      const originalA = await createRecipe(tx, company, `originala${token()}`)
      const originalB = await createRecipe(tx, company, `originalb${token()}`)
      const shared = `version${token()}`
      await createRecipe(tx, company, shared, originalA)

      await expect(createRecipe(tx, company, shared, originalB)).resolves.toMatch(/^[0-9a-f-]{36}$/u)
    })
  })

  it('R13: una original con el nombre de una version → aceptada; y dos originales iguales siguen chocando', async () => {
    await inRolledBackTransaction(async (tx) => {
      const company = await createCompany(tx)
      const original = await createRecipe(tx, company, `original${token()}`)
      const shared = `version${token()}`
      await createRecipe(tx, company, shared, original)

      await expect(createRecipe(tx, company, shared)).resolves.toMatch(/^[0-9a-f-]{36}$/u)

      const error = await expectRejected(
        tx,
        () => createRecipe(tx, company, shared),
        'segunda original viva con el mismo nombre en la misma empresa',
      )
      expect(sqlStateOf(error)).toBe('23505')
      expect(metaTargetOf(error)).toContain('name_normalized')
    })
  })
})

// ---------------------------------------------------------------------------
// Restricciones de la columna
// ---------------------------------------------------------------------------

describe('recipe_versions — parent_recipe_id', () => {
  it('parent_recipe_id = id → 23514 (recipes_parent_not_self)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const company = await createCompany(tx)
      const recipe = await createRecipe(tx, company, `original${token()}`)

      const error = await expectRejected(
        tx,
        () => tx.$executeRaw`UPDATE "recipes" SET "parent_recipe_id" = "id" WHERE "id" = ${recipe}::uuid`,
        'receta que se apunta a si misma',
      )
      expect(sqlStateOf(error)).toBe('23514')
      expect(messageOf(error)).toContain('recipes_parent_not_self')
    })
  })

  it('una original con versiones no se puede borrar fisicamente (FK RESTRICT)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const company = await createCompany(tx)
      const original = await createRecipe(tx, company, `original${token()}`)
      await createRecipe(tx, company, `version${token()}`, original)

      const error = await expectRejected(
        tx,
        () => tx.$executeRaw`DELETE FROM "recipes" WHERE "id" = ${original}::uuid`,
        'borrado fisico de una original con versiones',
      )
      expect(sqlStateOf(error)).toBe('23503')
      expect(messageOf(error)).toContain('recipes_parent_recipe_id_fkey')
    })
  })
})

// ---------------------------------------------------------------------------
// down.sql y migration.sql ejecutados de verdad
// ---------------------------------------------------------------------------

type RecipeSnapshot = {
  readonly recipes: string
  readonly lines: string
  readonly orders: string
}

/** Retrato textual de los datos de recetas, lineas y pedidos, sin `parent_recipe_id`. */
async function snapshot(tx: Prisma.TransactionClient): Promise<RecipeSnapshot> {
  const [recipes] = await tx.$queryRaw<{ v: string | null }[]>`
    SELECT string_agg(concat_ws('|', id, name, name_normalized, description, steps::text, image_path,
             company_id, created_by, updated_by, created_at, updated_at, deleted_at), E'\n' ORDER BY id) AS v
      FROM "recipes"`
  const [lines] = await tx.$queryRaw<{ v: string | null }[]>`
    SELECT string_agg(concat_ws('|', id, recipe_id, product_id, percentage, created_at, updated_at),
             E'\n' ORDER BY id) AS v
      FROM "recipe_lines"`
  const [orders] = await tx.$queryRaw<{ v: string | null }[]>`
    SELECT string_agg(t::text, E'\n' ORDER BY t.id) AS v FROM "orders" t`
  return { recipes: recipes?.v ?? '', lines: lines?.v ?? '', orders: orders?.v ?? '' }
}

async function hasParentColumn(tx: Prisma.TransactionClient): Promise<boolean> {
  const rows = await tx.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'recipes' AND column_name = 'parent_recipe_id'`
  return rows[0]?.n === 1
}

async function recipeIndexDefs(tx: Prisma.TransactionClient): Promise<string[]> {
  const rows = await tx.$queryRaw<{ d: string }[]>`
    SELECT indexname || ' | ' || indexdef AS d FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'recipes' ORDER BY indexname`
  return rows.map((r) => r.d)
}

/** Deja la base sin versiones dentro de la transaccion, por si otro archivo commiteo alguna. */
async function withoutVersions(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw`
    UPDATE "recipes" SET "parent_recipe_id" = NULL, "deleted_at" = COALESCE("deleted_at", now())
     WHERE "parent_recipe_id" IS NOT NULL`
}

describe('recipe_versions — reversion', () => {
  it('R43: con una version guardada el down.sql aborta, dice como localizarlas y no cambia nada', async () => {
    await inRolledBackTransaction(async (tx) => {
      const company = await createCompany(tx)
      const original = await createRecipe(tx, company, `original${token()}`)
      await createRecipe(tx, company, `version${token()}`, original)
      const indexesBefore = await recipeIndexDefs(tx)

      const error = await expectRejected(tx, () => runStatements(tx, DOWN), 'down.sql con versiones')
      const message = messageOf(error)
      expect(message).toMatch(/recipe_versions: hay \d+ version\(es\)/)
      expect(message).toContain('SELECT id, parent_recipe_id, name FROM recipes WHERE parent_recipe_id IS NOT NULL')

      expect(await hasParentColumn(tx)).toBe(true)
      expect(await recipeIndexDefs(tx)).toEqual(indexesBefore)
      expect(await tx.recipe.count({ where: { parentRecipeId: original } })).toBe(1)
    })
  })

  it('R42, R43: sin versiones, down → up deja los datos intactos, todas originales, y el esquema igual', async () => {
    await inRolledBackTransaction(async (tx) => {
      const company = await createCompany(tx)
      await createRecipe(tx, company, `original${token()}`)
      await withoutVersions(tx)
      const indexesBefore = await recipeIndexDefs(tx)

      await runStatements(tx, DOWN)
      expect(await hasParentColumn(tx)).toBe(false)
      const companyIndex = (await recipeIndexDefs(tx)).find((d) =>
        d.startsWith('recipes_company_name_unique | '),
      )
      expect(companyIndex).toMatch(/WHERE \(deleted_at IS NULL\)$/u)
      const beforeUp = await snapshot(tx)

      await runStatements(tx, UP)
      expect(await snapshot(tx)).toEqual(beforeUp)
      const [versions] = await tx.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM "recipes" WHERE "parent_recipe_id" IS NOT NULL`
      expect(versions?.n).toBe(0)
      expect(await recipeIndexDefs(tx)).toEqual(indexesBefore)
    })
  })
})
