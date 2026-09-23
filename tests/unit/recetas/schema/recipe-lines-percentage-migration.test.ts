// Contrato ESTATICO del SQL de `*_recipe_lines_percentage`. Mismo patron que los hermanos de
// `tests/unit/*/schema/`: cada afirmacion es un predicado puro aplicado al texto real de la
// migracion, nunca a la base.

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

const dirs = readdirSync(migrationsDir).filter((name) => name.endsWith('_recipe_lines_percentage'))
expect(dirs, 'debe existir exactamente una migracion *_recipe_lines_percentage').toHaveLength(1)
const migrationName = dirs[0] as string
const migrationDir = join(migrationsDir, migrationName)

const upSource = readFileSync(join(migrationDir, 'migration.sql'), 'utf8')
const downSource = readFileSync(join(migrationDir, 'down.sql'), 'utf8')

/** Lo que se afirma es SQL ejecutable, no prosa. */
function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
}

function statements(sql: string): readonly string[] {
  return stripSqlComments(sql)
    .split(';')
    .map((statement) => statement.replace(/\s+/g, ' ').trim())
    .filter((statement) => statement.length > 0)
}

function indexOfMatching(source: readonly string[], pattern: RegExp): number {
  return source.findIndex((statement) => pattern.test(statement))
}

describe(`${migrationName}/migration.sql`, () => {
  it('suelta y restituye el FORCE sobre recipe_lines, sin crear ninguna policy', () => {
    const source = statements(upSource)
    expect(indexOfMatching(source, /^ALTER TABLE "?recipe_lines"? NO FORCE ROW LEVEL SECURITY$/i)).toBeGreaterThanOrEqual(0)
    expect(indexOfMatching(source, /^ALTER TABLE "?recipe_lines"? ENABLE ROW LEVEL SECURITY$/i)).toBeGreaterThanOrEqual(0)
    expect(indexOfMatching(source, /^ALTER TABLE "?recipe_lines"? FORCE ?ROW LEVEL SECURITY$/i)).toBeGreaterThanOrEqual(0)
    expect(stripSqlComments(upSource)).not.toMatch(/CREATE\s+POLICY/i)
  })

  it('el NO FORCE va antes del DELETE, y el DELETE antes del ADD COLUMN "percentage" (R8)', () => {
    const source = statements(upSource)
    const noForceIndex = indexOfMatching(source, /^ALTER TABLE "?recipe_lines"? NO FORCE ROW LEVEL SECURITY$/i)
    const deleteIndex = indexOfMatching(source, /^DELETE FROM "?recipe_lines"?$/i)
    const addColumnIndex = indexOfMatching(source, /^ALTER TABLE "?recipe_lines"? ADD COLUMN "?percentage"?/i)

    expect(noForceIndex).toBeGreaterThanOrEqual(0)
    expect(deleteIndex).toBeGreaterThanOrEqual(0)
    expect(addColumnIndex).toBeGreaterThanOrEqual(0)
    expect(noForceIndex).toBeLessThan(deleteIndex)
    expect(deleteIndex).toBeLessThan(addColumnIndex)
  })

  it('declara percentage DECIMAL(5,2) con el CHECK de rango (R6)', () => {
    const text = stripSqlComments(upSource)
    expect(text).toMatch(/ADD COLUMN "percentage" DECIMAL\(\s*5\s*,\s*2\s*\)\s+NOT NULL/i)
    expect(text).toMatch(
      /ADD CONSTRAINT "recipe_lines_percentage_range"\s+CHECK\s*\(\s*"percentage"\s*>\s*0\s+AND\s+"percentage"\s*<=\s*100\s*\)/i,
    )
  })

  it('quita la FK, el indice y la columna de unidad, y el CHECK y la columna de cantidad', () => {
    const text = stripSqlComments(upSource)
    expect(text).toMatch(/DROP CONSTRAINT "recipe_lines_unit_id_fkey"/i)
    expect(text).toMatch(/DROP INDEX "recipe_lines_unit_id_idx"/i)
    expect(text).toMatch(/DROP COLUMN "unit_id"/i)
    expect(text).toMatch(/DROP CONSTRAINT "recipe_lines_quantity_positive"/i)
    expect(text).toMatch(/DROP COLUMN "quantity"/i)
  })

  it('no menciona "recipes" en ninguna sentencia: la migracion solo toca recipe_lines (R8)', () => {
    const source = statements(upSource)
    for (const statement of source) {
      expect(/"recipes"/i.test(statement), statement).toBe(false)
    }
  })

  it('el timestamp es posterior al de la ultima migracion que existia cuando esta nacio', () => {
    // Compara con un nombre fijo, no con "la ultima del repo": esa ultima cambia con cada
    // migracion posterior y rompia este caso sin que esta migracion tuviera nada que ver.
    const ultimaAlNacer = '20260922150000_product_type_enum'
    const match = /^(\d{14})_/.exec(migrationName)
    expect(match).not.toBeNull()
    const timestamp = match?.[1] as string
    const otherTimestamp = (/^(\d{14})_/.exec(ultimaAlNacer)?.[1]) as string
    expect(timestamp > otherTimestamp, `${migrationName} debe ser posterior a ${ultimaAlNacer}`).toBe(true)
  })
})

describe(`${migrationName}/down.sql`, () => {
  it('existe y revierte el UP en orden inverso: vacia, quita percentage y su CHECK, y repone quantity y unit_id', () => {
    expect(downSource.length).toBeGreaterThan(0)
    const source = statements(downSource)

    const noForceIndex = indexOfMatching(source, /^ALTER TABLE "?recipe_lines"? NO FORCE ROW LEVEL SECURITY$/i)
    const deleteIndex = indexOfMatching(source, /^DELETE FROM "?recipe_lines"?$/i)
    const dropCheckIndex = indexOfMatching(source, /^ALTER TABLE "?recipe_lines"? DROP CONSTRAINT "recipe_lines_percentage_range"$/i)
    const dropColumnIndex = indexOfMatching(source, /^ALTER TABLE "?recipe_lines"? DROP COLUMN "percentage"$/i)
    const addQuantityIndex = indexOfMatching(source, /^ALTER TABLE "?recipe_lines"? ADD COLUMN "quantity" DECIMAL\(\s*14\s*,\s*4\s*\)\s+NOT NULL$/i)
    const addUnitIndex = indexOfMatching(source, /^ALTER TABLE "?recipe_lines"? ADD COLUMN "unit_id" UUID NOT NULL$/i)

    expect(noForceIndex).toBeGreaterThanOrEqual(0)
    expect(deleteIndex).toBeGreaterThanOrEqual(0)
    expect(dropCheckIndex).toBeGreaterThanOrEqual(0)
    expect(dropColumnIndex).toBeGreaterThanOrEqual(0)
    expect(addQuantityIndex).toBeGreaterThanOrEqual(0)
    expect(addUnitIndex).toBeGreaterThanOrEqual(0)

    expect(noForceIndex).toBeLessThan(deleteIndex)
    expect(deleteIndex).toBeLessThan(dropCheckIndex)
    expect(dropCheckIndex).toBeLessThan(dropColumnIndex)
    expect(dropColumnIndex).toBeLessThan(addQuantityIndex)
    expect(addQuantityIndex).toBeLessThan(addUnitIndex)

    const text = stripSqlComments(downSource)
    expect(text).toMatch(/ADD CONSTRAINT "recipe_lines_quantity_positive" CHECK\s*\(\s*"quantity"\s*>\s*0\s*\)/i)
    expect(text).toMatch(
      /ADD CONSTRAINT "recipe_lines_unit_id_fkey"\s+FOREIGN KEY\s*\(\s*"unit_id"\s*\)\s+REFERENCES\s+"units"\s*\(\s*"id"\s*\)\s+ON DELETE RESTRICT ON UPDATE CASCADE/i,
    )
    expect(text).toMatch(/CREATE INDEX "recipe_lines_unit_id_idx" ON "recipe_lines"\("unit_id"\)/i)
    expect(text).toMatch(/ENABLE ROW LEVEL SECURITY/i)
    expect(text).toMatch(/FORCE\s+ROW LEVEL SECURITY/i)
  })
})
