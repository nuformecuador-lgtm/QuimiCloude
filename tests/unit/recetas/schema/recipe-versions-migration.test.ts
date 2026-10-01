// Contrato estatico del SQL de `recipe_versions` y de `model Recipe`. La migracion esta escrita a
// mano: nada del toolchain compara su `down.sql` con lo que habia antes, asi que lo hace este
// archivo. Cada predicado se prueba tambien contra el SQL mutado EN MEMORIA, para que no pueda
// pasar en verde por no mirar nada.

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

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

function migrationDir(suffix: string): string {
  const dirs = readdirSync(migrationsDir).filter((name) => name.endsWith(suffix))
  expect(dirs, `debe existir exactamente una migracion *${suffix}`).toHaveLength(1)
  return join(migrationsDir, dirs[0] as string)
}

const versionsDir = migrationDir('_recipe_versions')
const scopeDir = migrationDir('_recipes_company_scope')

const upSource = readFileSync(join(versionsDir, 'migration.sql'), 'utf8')
const downSource = readFileSync(join(versionsDir, 'down.sql'), 'utf8')
const scopeUpSource = readFileSync(join(scopeDir, 'migration.sql'), 'utf8')

/** Quita los comentarios `--` fuera de cadenas: se afirma sobre SQL ejecutable, no sobre prosa. */
function stripLineComments(sql: string): string {
  return sql
    .split('\n')
    .map((line) => {
      let inQuote = false
      for (let i = 0; i < line.length; i += 1) {
        const char = line[i]
        if (char === "'") inQuote = !inQuote
        if (!inQuote && char === '-' && line[i + 1] === '-') return line.slice(0, i)
      }
      return line
    })
    .join('\n')
}

/** Sentencias de nivel superior con espacios normalizados; un bloque `DO $$ ... $$` es una sola. */
function statements(sql: string): string[] {
  const clean = stripLineComments(sql)
  const result: string[] = []
  let current = ''
  let inDollar = false
  let inQuote = false
  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i] as string
    if (!inQuote && clean.slice(i, i + 2) === '$$') {
      inDollar = !inDollar
      current += '$$'
      i += 1
      continue
    }
    if (!inDollar && char === "'") inQuote = !inQuote
    if (!inDollar && !inQuote && char === ';') {
      result.push(current)
      current = ''
      continue
    }
    current += char
  }
  result.push(current)
  return result.map((s) => s.replace(/\s+/g, ' ').trim()).filter((s) => s.length > 0)
}

const up = statements(upSource)
const down = statements(downSource)

const COMPANY_INDEX = /^CREATE UNIQUE INDEX "recipes_company_name_unique" ON "recipes" ?\(/i

function companyIndexIn(stmts: readonly string[]): string | undefined {
  return stmts.find((s) => COMPANY_INDEX.test(s))
}

/** Misma definicion, sin depender de los espacios alrededor del parentesis de columnas. */
function canonical(statement: string): string {
  return statement.replace(/\s*\(\s*/g, '(').replace(/\s*\)\s*/g, ')').replace(/\s*,\s*/g, ',')
}

describe('migration.sql de recipe_versions', () => {
  it('R42: anade la columna anulable sin DEFAULT y no toca ningun dato', () => {
    expect(up).toContain('ALTER TABLE "recipes" ADD COLUMN "parent_recipe_id" UUID')
    expect(upSource).not.toMatch(/\bDEFAULT\b|\bSET NOT NULL\b/i)
    for (const statement of up) {
      expect(statement, `el UP no debe tener DML: ${statement}`).not.toMatch(
        /^(INSERT|UPDATE|DELETE|TRUNCATE)\b/i,
      )
    }
  })

  it('declara la FK RESTRICT a la propia tabla y el CHECK contra apuntarse a si misma', () => {
    expect(up).toContain(
      'ALTER TABLE "recipes" ADD CONSTRAINT "recipes_parent_recipe_id_fkey" FOREIGN KEY ("parent_recipe_id") REFERENCES "recipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE',
    )
    expect(up).toContain(
      'ALTER TABLE "recipes" ADD CONSTRAINT "recipes_parent_not_self" CHECK ("parent_recipe_id" IS NULL OR "parent_recipe_id" <> "id")',
    )
  })

  it('R12, R13: parte la unicidad de nombre en dos indices parciales disjuntos', () => {
    const dropAt = up.indexOf('DROP INDEX "recipes_company_name_unique"')
    const createAt = up.findIndex((s) => COMPANY_INDEX.test(s))
    expect(dropAt).toBeGreaterThanOrEqual(0)
    expect(createAt).toBeGreaterThan(dropAt)
    expect(up[createAt]).toBe(
      'CREATE UNIQUE INDEX "recipes_company_name_unique" ON "recipes" ("company_id", "name_normalized") WHERE "deleted_at" IS NULL AND "parent_recipe_id" IS NULL',
    )
    expect(up).toContain(
      'CREATE UNIQUE INDEX "recipes_version_name_unique" ON "recipes" ("parent_recipe_id", "name_normalized") WHERE "deleted_at" IS NULL AND "parent_recipe_id" IS NOT NULL',
    )
  })
})

describe('down.sql de recipe_versions (R43)', () => {
  it('R43: la guardia de versiones es la PRIMERA sentencia y aborta con RAISE EXCEPTION', () => {
    const guard = down[0] as string
    expect(guard.startsWith('DO $$')).toBe(true)
    expect(guard).toMatch(/FROM "recipes" WHERE "parent_recipe_id" IS NOT NULL/)
    expect(guard).toMatch(/IF versions_count > 0 THEN RAISE EXCEPTION/)
    // Dice como localizarlas.
    expect(guard).toContain('SELECT id, parent_recipe_id, name FROM recipes WHERE parent_recipe_id IS NOT NULL')
    expect(down.filter((s) => s.startsWith('DO $$'))).toHaveLength(1)
  })

  it('R43: recrea recipes_company_name_unique igual que recipes_company_scope', () => {
    const before = companyIndexIn(statements(scopeUpSource))
    const restored = companyIndexIn(down)
    expect(before, 'recipes_company_scope ya no declara el indice').toBeDefined()
    expect(restored, 'el down.sql no recrea el indice').toBeDefined()
    expect(canonical(restored as string)).toBe(canonical(before as string))

    // Sensibilidad: dejar el predicado nuevo en la restauracion tiene que verse.
    const mutated = (restored as string).replace(
      'WHERE "deleted_at" IS NULL',
      'WHERE "deleted_at" IS NULL AND "parent_recipe_id" IS NULL',
    )
    expect(mutated).not.toBe(restored)
    expect(canonical(mutated)).not.toBe(canonical(before as string))
  })

  it('R43: deshace todo lo del UP, en orden inverso, y no borra filas', () => {
    expect(down.slice(1)).toEqual([
      'DROP INDEX "recipes_version_name_unique"',
      'DROP INDEX "recipes_company_name_unique"',
      companyIndexIn(down),
      'ALTER TABLE "recipes" DROP CONSTRAINT "recipes_parent_not_self"',
      'ALTER TABLE "recipes" DROP CONSTRAINT "recipes_parent_recipe_id_fkey"',
      'ALTER TABLE "recipes" DROP COLUMN "parent_recipe_id"',
    ])
    expect(downSource).not.toMatch(/\bDELETE\b|\bUPDATE\b|\bTRUNCATE\b/i)
  })
})

describe('model Recipe en schema.prisma', () => {
  it('declara parentRecipeId y la relacion RecipeVersions con RESTRICT', () => {
    const schema = readFileSync(join(repoRoot, 'db', 'schema.prisma'), 'utf8')
    const model = /model Recipe \{([\s\S]*?)\n\}/.exec(schema)?.[1] ?? ''
    expect(model).toMatch(/parentRecipeId\s+String\?\s+@map\("parent_recipe_id"\) @db\.Uuid/)
    expect(model).toMatch(
      /parent\s+Recipe\?\s+@relation\("RecipeVersions", fields: \[parentRecipeId\], references: \[id\], onDelete: Restrict, onUpdate: Cascade\)/,
    )
    expect(model).toMatch(/versions\s+Recipe\[\]\s+@relation\("RecipeVersions"\)/)
  })
})
