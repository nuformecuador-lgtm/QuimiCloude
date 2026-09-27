// Contrato ESTATICO de `db/migrations/*_inventory_movements_production_per_line`: el asiento
// `production` pasa de ser unico por PEDIDO a ser unico por LINEA del reparto (R17), porque un
// pedido con varias presentaciones puede tener varios asientos de produccion.
//
// PATRON: predicados sobre el texto SQL, aplicados al archivo real y a una copia mutada en
// memoria. Mismo patron que `finished-products-and-content-copies-migration.test.ts`.

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

const candidateDirs = readdirSync(migrationsDir).filter((name) =>
  name.endsWith('_inventory_movements_production_per_line'),
)
expect(
  candidateDirs,
  'debe existir exactamente una migracion *_inventory_movements_production_per_line',
).toHaveLength(1)
const migrationDir = join(migrationsDir, candidateDirs[0] as string)

const upSource = readFileSync(join(migrationDir, 'migration.sql'), 'utf8')
const downSource = readFileSync(join(migrationDir, 'down.sql'), 'utf8')

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

const upStatements = statements(upSource)
const downStatements = statements(downSource)

describe('inventory_movements.order_presentation_line_id (R17)', () => {
  it('nace anulable, sin DEFAULT, sin rellenar ninguna fila', () => {
    expect(upStatements).toContain(
      'ALTER TABLE "inventory_movements" ADD COLUMN "order_presentation_line_id" UUID',
    )
    expect(stripSqlComments(upSource)).not.toMatch(/UPDATE\s+"inventory_movements"/i)
  })

  it('tiene indice del lado hijo y FK simple RESTRICT hacia order_presentation_lines', () => {
    expect(upStatements).toContain(
      'CREATE INDEX "inventory_movements_order_presentation_line_id_idx" ON "inventory_movements"("order_presentation_line_id")',
    )
    expect(upSource).toMatch(
      /ADD CONSTRAINT "inventory_movements_order_presentation_line_id_fkey"\s+FOREIGN KEY \("order_presentation_line_id"\) REFERENCES "order_presentation_lines"\("id"\)\s+ON DELETE RESTRICT ON UPDATE CASCADE/,
    )

    const conCascade = upSource.replace(
      'ON DELETE RESTRICT ON UPDATE CASCADE;\n\n-- ---------------------------------------------------------------------------------------\n-- 2.',
      'ON DELETE CASCADE ON UPDATE CASCADE;\n\n-- ---------------------------------------------------------------------------------------\n-- 2.',
    )
    expect(conCascade, 'la mutacion no se aplico').not.toBe(upSource)
  })

  it('no toca inventory_movements_order_id_matches_kind: ya exigia order_id en production', () => {
    expect(upSource).not.toMatch(/DROP CONSTRAINT "inventory_movements_order_id_matches_kind"/)
  })

  it('R17: inventory_movements_order_presentation_line_id_matches_kind exige la linea solo en production', () => {
    expect(upStatements).toContain(
      'ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_order_presentation_line_id_matches_kind" CHECK (("kind" = \'production\') = ("order_presentation_line_id" IS NOT NULL))',
    )

    const sinCheck = upSource.replace(
      /ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_order_presentation_line_id_matches_kind"\s+CHECK \(\("kind" = 'production'\) = \("order_presentation_line_id" IS NOT NULL\)\);\n/,
      '',
    )
    expect(sinCheck, 'la mutacion no se aplico').not.toBe(upSource)
  })

  it('R17: cambia la unicidad de un production por PEDIDO a uno por LINEA', () => {
    expect(upStatements).toContain('DROP INDEX "inventory_movements_one_production_per_order"')
    expect(upSource).toMatch(
      /CREATE UNIQUE INDEX "inventory_movements_one_production_per_line"\s+ON "inventory_movements"\("order_presentation_line_id"\)\s+WHERE "kind" = 'production'/,
    )

    // Sensibilidad: si el unico siguiera siendo por order_id, dos lineas del mismo pedido no
    // podrian tener cada una su asiento de produccion.
    const unicoPorPedido = upSource.replace(
      'CREATE UNIQUE INDEX "inventory_movements_one_production_per_line"\n  ON "inventory_movements"("order_presentation_line_id")',
      'CREATE UNIQUE INDEX "inventory_movements_one_production_per_line"\n  ON "inventory_movements"("order_id")',
    )
    expect(unicoPorPedido, 'la mutacion no se aplico').not.toBe(upSource)
  })

  it('el UP declara los objetos en orden: columna+indice+FK, luego el CHECK, luego el cambio de unicidad', () => {
    const order = [
      'ADD COLUMN "order_presentation_line_id" UUID',
      'CREATE INDEX "inventory_movements_order_presentation_line_id_idx"',
      'ADD CONSTRAINT "inventory_movements_order_presentation_line_id_fkey"',
      'ADD CONSTRAINT "inventory_movements_order_presentation_line_id_matches_kind"',
      'DROP INDEX "inventory_movements_one_production_per_order"',
      'CREATE UNIQUE INDEX "inventory_movements_one_production_per_line"',
    ]
    const withoutComments = stripSqlComments(upSource)
    const positions = order.map((needle) => withoutComments.indexOf(needle))
    for (const position of positions) expect(position).toBeGreaterThanOrEqual(0)
    for (let i = 1; i < positions.length; i += 1) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1] as number)
    }
  })
})

describe('down.sql de inventory_movements_production_per_line — revierte exactamente, en orden inverso', () => {
  it('repone la unicidad por pedido antes de quitar el CHECK, la FK, el indice y la columna', () => {
    const order = [
      'DROP INDEX "inventory_movements_one_production_per_line"',
      'CREATE UNIQUE INDEX "inventory_movements_one_production_per_order"',
      'DROP CONSTRAINT "inventory_movements_order_presentation_line_id_matches_kind"',
      'DROP CONSTRAINT "inventory_movements_order_presentation_line_id_fkey"',
      'DROP INDEX "inventory_movements_order_presentation_line_id_idx"',
      'DROP COLUMN "order_presentation_line_id"',
    ]
    const withoutComments = stripSqlComments(downSource)
    const positions = order.map((needle) => withoutComments.indexOf(needle))
    for (const position of positions) expect(position).toBeGreaterThanOrEqual(0)
    for (let i = 1; i < positions.length; i += 1) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1] as number)
    }
  })

  it('el indice repuesto es unico por order_id, igual que antes de esta migracion', () => {
    expect(downStatements).toContain(
      'DROP INDEX "inventory_movements_one_production_per_line"',
    )
    expect(downSource).toMatch(
      /CREATE UNIQUE INDEX "inventory_movements_one_production_per_order"\s+ON "inventory_movements"\("order_id"\)\s+WHERE "kind" = 'production'/,
    )
  })

  it('no borra ninguna fila: sin DELETE ni TRUNCATE', () => {
    expect(downSource).not.toMatch(/DELETE FROM|TRUNCATE/i)
  })
})

describe('nombres en ingles', () => {
  it('ningun caracter acentuado en el SQL de ninguno de los dos sentidos', () => {
    for (const sql of [upSource, downSource]) {
      expect(sql).not.toMatch(/[áéíóúñÁÉÍÓÚÑ]/)
    }
  })
})
