// Contrato ESTATICO del SQL de `order_presentation_lines` (el reparto del pedido, R1-R5) y de
// `orders.unit_id` (R40-R41). Cubre la tabla, sus CHECK, sus unicos e indices, la RLS forzada y
// que `orders.unit_id` nazca anulable sin backfill (R43 lo hace en otra migracion, T3).
//
// PATRON: predicados puros sobre el texto SQL, aplicados dos veces -al archivo real (pasa) y a
// una version mutada en memoria (falla)-. El archivo en disco no se toca nunca.

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/** Sube desde este archivo hasta la raiz del repo (la carpeta con `package.json`). */
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

/** La carpeta se localiza por SUFIJO: si se renombra, el test cae por lo que vigila. */
function findMigrationDir(suffix: string): string {
  const candidates = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith(suffix))
    .map((entry) => entry.name)
    .sort()
  if (candidates.length !== 1) {
    throw new Error(
      `se esperaba exactamente una migracion terminada en "${suffix}"; hay ${String(
        candidates.length,
      )}: ${candidates.join(', ')}`,
    )
  }
  return join(migrationsDir, candidates[0] as string)
}

/** El timestamp (prefijo) de la migracion localizada por sufijo. */
function timestampOf(suffix: string): string {
  const dirName = findMigrationDir(suffix).split(/[\\/]/).pop() ?? ''
  const ts = dirName.split('_')[0]
  if (ts === undefined || ts.length === 0) {
    throw new Error(`no se pudo extraer el timestamp de "${dirName}"`)
  }
  return ts
}

const migrationDir = findMigrationDir('_order_presentation_lines')
const migrationDirName = migrationDir.split(/[\\/]/).pop() ?? ''

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

const upSource = readFileSync(join(migrationDir, 'migration.sql'), 'utf8')
const downSource = readFileSync(join(migrationDir, 'down.sql'), 'utf8')

/** ¿El texto declara `ALTER TABLE <table> <mode> ROW LEVEL SECURITY` para esa tabla? */
function declaresRowLevelSecurity(sql: string, table: string, mode: 'ENABLE' | 'FORCE'): boolean {
  return new RegExp(`ALTER\\s+TABLE\\s+"?${table}"?\\s+${mode}\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i').test(
    stripSqlComments(sql),
  )
}

describe('el nombre de la migracion es posterior a la que necesita para aplicar', () => {
  it('R2: <ts>_order_presentation_lines es estrictamente mayor que packing_permission', () => {
    const ts = migrationDirName.split('_')[0] ?? ''
    expect(ts.length).toBeGreaterThan(0)
    const packingPermission = timestampOf('_packing_permission')
    expect(ts > packingPermission, `${ts} debe ser mayor que ${packingPermission}`).toBe(true)
  })
})

describe('migration.sql de order_presentation_lines — la tabla del reparto (R1, R2, R5)', () => {
  it('crea la tabla con el censo exacto de columnas', () => {
    expect(upSource).toMatch(/CREATE TABLE "order_presentation_lines"/)
    const expectedColumns = [
      '"id" UUID NOT NULL',
      '"order_id" UUID NOT NULL',
      '"company_id" UUID NOT NULL',
      '"presentation_id" UUID NOT NULL',
      '"packages" INTEGER NOT NULL',
      '"presentation_content" DECIMAL(14,4)',
      '"created_at" TIMESTAMPTZ(6) NOT NULL',
      '"updated_at" TIMESTAMPTZ(6) NOT NULL',
    ]
    for (const fragment of expectedColumns) {
      expect(upSource, `falta la columna "${fragment}"`).toContain(fragment)
    }
  })

  it('packages es entero, con CHECK positivo (R1: no hay medios envases)', () => {
    expect(upSource).toMatch(
      /ADD CONSTRAINT "order_presentation_lines_packages_positive"\s+CHECK \("packages" > 0\)/,
    )

    const sinCheck = upSource.replace(
      /ALTER TABLE "order_presentation_lines" ADD CONSTRAINT "order_presentation_lines_packages_positive"\s+CHECK \("packages" > 0\);\n/,
      '',
    )
    expect(sinCheck, 'la mutacion no se aplico').not.toBe(upSource)
    expect(sinCheck).not.toMatch(/order_presentation_lines_packages_positive/)
  })

  it('presentation_content es anulable con CHECK positivo cuando no es NULL', () => {
    expect(upSource).toMatch(
      /ADD CONSTRAINT "order_presentation_lines_content_positive"\s+CHECK \("presentation_content" IS NULL OR "presentation_content" > 0\)/,
    )
  })

  it('una sola linea por presentacion en el mismo pedido (R2)', () => {
    expect(upSource).toMatch(
      /CREATE UNIQUE INDEX "order_presentation_lines_order_id_presentation_id_key"\s+ON "order_presentation_lines"\("order_id", "presentation_id"\)/,
    )
  })

  it('indices del lado hijo de company_id y presentation_id', () => {
    expect(upSource).toMatch(
      /CREATE INDEX "order_presentation_lines_company_id_idx" ON "order_presentation_lines"\("company_id"\)/,
    )
    expect(upSource).toMatch(
      /CREATE INDEX "order_presentation_lines_presentation_id_idx" ON "order_presentation_lines"\("presentation_id"\)/,
    )
  })

  it('order_id es FK SIMPLE hacia orders (mismo modulo, R2)', () => {
    expect(upSource).toMatch(
      /ADD CONSTRAINT "order_presentation_lines_order_id_fkey"\s+FOREIGN KEY \("order_id"\) REFERENCES "orders"\("id"\) ON DELETE RESTRICT ON UPDATE CASCADE/,
    )
  })

  it('company_id es FK simple hacia companies (drift)', () => {
    expect(upSource).toMatch(
      /ADD CONSTRAINT "order_presentation_lines_company_id_fkey"\s+FOREIGN KEY \("company_id"\) REFERENCES "companies"\("id"\) ON DELETE RESTRICT ON UPDATE CASCADE/,
    )
  })

  it('presentation_id es FK COMPUESTA con company_id hacia presentations (drift, ambito por empresa)', () => {
    expect(upSource).toMatch(
      /ADD CONSTRAINT "order_presentation_lines_company_id_presentation_id_fkey"\s+FOREIGN KEY \("company_id", "presentation_id"\) REFERENCES "presentations"\("company_id", "id"\)\s+ON DELETE RESTRICT ON UPDATE CASCADE/,
    )

    // Sensibilidad: una FK simple (solo presentation_id) dejaria pasar una presentacion de otra
    // empresa.
    const fkSimple = upSource.replace(
      'FOREIGN KEY ("company_id", "presentation_id") REFERENCES "presentations"("company_id", "id")',
      'FOREIGN KEY ("presentation_id") REFERENCES "presentations"("id")',
    )
    expect(fkSimple, 'la mutacion no se aplico').not.toBe(upSource)
  })

  it('RLS activada Y forzada, sin ninguna policy (guard-rls-force)', () => {
    expect(declaresRowLevelSecurity(upSource, 'order_presentation_lines', 'ENABLE')).toBe(true)
    expect(declaresRowLevelSecurity(upSource, 'order_presentation_lines', 'FORCE')).toBe(true)
    expect(upSource).not.toMatch(/CREATE POLICY/i)
  })
})

describe('migration.sql de order_presentation_lines — orders.unit_id (R40, R41, R43)', () => {
  it('anade la columna anulable, sin DEFAULT (R43 la rellena en otra migracion)', () => {
    expect(statements(upSource)).toContain('ALTER TABLE "orders" ADD COLUMN "unit_id" UUID')

    const obligatoria = upSource.replace(
      'ALTER TABLE "orders" ADD COLUMN "unit_id" UUID;',
      'ALTER TABLE "orders" ADD COLUMN "unit_id" UUID NOT NULL;',
    )
    expect(obligatoria, 'la mutacion no se aplico').not.toBe(upSource)
    expect(statements(obligatoria)).not.toContain('ALTER TABLE "orders" ADD COLUMN "unit_id" UUID')
  })

  it('no rellena ninguna fila (el backfill de R43 vive en otra migracion)', () => {
    expect(stripSqlComments(upSource)).not.toMatch(/UPDATE\s+"orders"\s+SET\s+"unit_id"/i)
  })

  it('crea el indice del lado hijo y la FK simple hacia units, RESTRICT', () => {
    expect(upSource).toMatch(/CREATE INDEX "orders_unit_id_idx" ON "orders"\("unit_id"\)/)
    expect(upSource).toMatch(
      /ADD CONSTRAINT "orders_unit_id_fkey"\s+FOREIGN KEY \("unit_id"\) REFERENCES "units"\("id"\) ON DELETE RESTRICT ON UPDATE CASCADE/,
    )
  })
})

describe('down.sql de order_presentation_lines — revierte exactamente lo que crea el up', () => {
  it('el down.sql existe y no esta vacio', () => {
    expect(downSource.trim().length).toBeGreaterThan(0)
  })

  it('quita primero orders.unit_id (su FK y su indice) y despues la tabla del reparto', () => {
    const source = statements(downSource)
    const dropUnitFk = source.findIndex((s) => /^ALTER TABLE "orders" DROP CONSTRAINT "orders_unit_id_fkey"$/i.test(s))
    const dropUnitIdx = source.findIndex((s) => /^DROP INDEX "orders_unit_id_idx"$/i.test(s))
    const dropUnitColumn = source.findIndex((s) => /^ALTER TABLE "orders" DROP COLUMN "unit_id"$/i.test(s))
    const dropTable = source.findIndex((s) => /^DROP TABLE "order_presentation_lines"$/i.test(s))

    expect([dropUnitFk, dropUnitIdx, dropUnitColumn, dropTable]).not.toContain(-1)
    expect(dropUnitFk).toBeLessThan(dropUnitColumn)
    expect(dropUnitIdx).toBeLessThan(dropUnitColumn)
    expect(dropUnitColumn).toBeLessThan(dropTable)
  })

  it('sensibilidad: un down que no dropea la tabla no revierte la migracion', () => {
    const sinTabla = downSource.replace('DROP TABLE "order_presentation_lines";', '')
    expect(sinTabla, 'la mutacion no se aplico').not.toBe(downSource)
    expect(sinTabla).not.toMatch(/DROP TABLE "order_presentation_lines"/)
  })
})
