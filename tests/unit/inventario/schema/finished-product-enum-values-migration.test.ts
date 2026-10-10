// Contrato estatico de `db/migrations/*_finished_product_enum_values`: los dos enums ganan un
// valor al final, solos en su propia migracion, y su reversion falla si queda algun producto
// terminado o algun asiento de produccion.

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
  name.endsWith('_finished_product_enum_values'),
)
expect(
  candidateDirs,
  'debe existir exactamente una migracion *_finished_product_enum_values',
).toHaveLength(1)
const migrationDir = join(migrationsDir, candidateDirs[0] as string)

const upSource = readFileSync(join(migrationDir, 'migration.sql'), 'utf8')
const downSource = readFileSync(join(migrationDir, 'down.sql'), 'utf8')

const schema = readFileSync(join(repoRoot, 'db', 'schema.prisma'), 'utf8')

function parseEnum(name: string): readonly string[] {
  const match = new RegExp(`^enum\\s+${name}\\s*\\{([\\s\\S]*?)^\\}`, 'm').exec(schema)
  if (match === null || match[1] === undefined) throw new Error(`no existe el enum ${name}`)
  return match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('///'))
}

describe('db/migrations/*_finished_product_enum_values', () => {
  it('R1: db/schema.prisma declara ProductType en orden PRODUCT, MACHINE, PACKAGING, FINISHED_PRODUCT', () => {
    expect(parseEnum('ProductType')).toEqual(['PRODUCT', 'MACHINE', 'PACKAGING', 'FINISHED_PRODUCT'])
  })

  it('R1: db/schema.prisma declara InventoryMovementKind en orden opening, adjustment, consumption, production', () => {
    // QC-223 2026-10-08: `delivery` se anade al final, sin reordenar; los cuatro primeros siguen
    // siendo exactamente estos.
    expect(parseEnum('InventoryMovementKind').slice(0, 4)).toEqual([
      'opening',
      'adjustment',
      'consumption',
      'production',
    ])
    expect(parseEnum('InventoryMovementKind')).toEqual([
      'opening',
      'adjustment',
      'consumption',
      'production',
      'delivery',
    ])
  })

  it('el UP anade los dos valores y no hace nada mas', () => {
    expect(upSource).toMatch(/ALTER TYPE\s+"ProductType"\s+ADD VALUE\s+'FINISHED_PRODUCT'/)
    expect(upSource).toMatch(/ALTER TYPE\s+"InventoryMovementKind"\s+ADD VALUE\s+'production'/)
    expect(upSource).not.toMatch(/CREATE TABLE|ALTER TABLE.*ADD COLUMN|DROP TABLE/i)
  })

  it('R36: el down.sql falla con un RAISE EXCEPTION si queda algun producto FINISHED_PRODUCT', () => {
    expect(downSource).toMatch(/RAISE EXCEPTION/)
    expect(downSource).toMatch(/"type"\s*=\s*'FINISHED_PRODUCT'/)
    expect(downSource).toMatch(/USING ERRCODE = '23514'/)
  })

  it('R36: el down.sql falla con un RAISE EXCEPTION si queda algun asiento production', () => {
    expect(downSource).toMatch(/"kind"\s*=\s*'production'/)
  })

  it('el down.sql recrea ProductType sin FINISHED_PRODUCT y repone su DEFAULT', () => {
    expect(downSource).toMatch(/CREATE TYPE "ProductType" AS ENUM \('PRODUCT', 'MACHINE', 'PACKAGING'\)/)
    expect(downSource).toMatch(/ALTER TABLE "products" ALTER COLUMN "type" DROP DEFAULT/)
    expect(downSource).toMatch(/ALTER TABLE "products" ALTER COLUMN "type" SET DEFAULT 'PRODUCT'/)
  })

  it('el down.sql recrea InventoryMovementKind sin production y no borra ningun asiento ni producto', () => {
    expect(downSource).toMatch(
      /CREATE TYPE "InventoryMovementKind" AS ENUM \('opening', 'adjustment', 'consumption'\)/,
    )
    expect(downSource).not.toMatch(/DELETE FROM|TRUNCATE/i)
  })

  it('el down.sql repone los dos CHECK de inventory_movements que comparan kind', () => {
    expect(downSource).toMatch(/ADD CONSTRAINT "inventory_movements_reason_matches_kind"/)
    expect(downSource).toMatch(/ADD CONSTRAINT "inventory_movements_order_id_matches_kind"/)
  })

  it('no nombra ninguna tabla ni columna fuera de ingles, en minusculas y snake_case', () => {
    for (const sql of [upSource, downSource]) {
      expect(sql).not.toMatch(/[áéíóúñÁÉÍÓÚÑ]/)
    }
  })
})
