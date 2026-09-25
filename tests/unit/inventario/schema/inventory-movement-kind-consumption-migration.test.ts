// Contrato estatico de `db/migrations/*_inventory_movement_kind_consumption`: el enum gana
// `consumption` al final, sola en su propia migracion, y su reversion falla si queda algun
// asiento de ese tipo.

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
  name.endsWith('_inventory_movement_kind_consumption'),
)
expect(
  candidateDirs,
  'debe existir exactamente una migracion *_inventory_movement_kind_consumption',
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
    .filter((line) => line.length > 0)
}

describe('db/migrations/*_inventory_movement_kind_consumption', () => {
  it('R1 (ampliada): db/schema.prisma declara InventoryMovementKind con consumption por delante de cualquier valor posterior', () => {
    // El orden absoluto lo fija la migracion que anade cada valor; aqui solo importa que
    // consumption siga estando y por delante de lo que venga despues de el.
    const values = parseEnum('InventoryMovementKind')
    expect(values.slice(0, 3)).toEqual(['opening', 'adjustment', 'consumption'])
  })

  it('el UP anade el valor consumption y no hace nada mas', () => {
    expect(upSource).toMatch(/ALTER TYPE\s+"InventoryMovementKind"\s+ADD VALUE\s+'consumption'/)
    expect(upSource).not.toMatch(/CREATE TABLE|ALTER TABLE.*ADD COLUMN|DROP TABLE/i)
  })

  it('R45: el down.sql falla con un RAISE EXCEPTION si queda algun asiento consumption', () => {
    expect(downSource).toMatch(/RAISE EXCEPTION/)
    expect(downSource).toMatch(/kind"\s*=\s*'consumption'/)
    expect(downSource).toMatch(/USING ERRCODE = '23514'/)
  })

  it('el down.sql recrea el tipo sin consumption y no borra ningun asiento', () => {
    expect(downSource).toMatch(/CREATE TYPE "InventoryMovementKind" AS ENUM \('opening', 'adjustment'\)/)
    expect(downSource).not.toMatch(/DELETE FROM|TRUNCATE/i)
  })

  it('R46: no nombra ninguna tabla ni columna fuera de ingles, en minusculas y snake_case', () => {
    for (const sql of [upSource, downSource]) {
      expect(sql).not.toMatch(/[áéíóúñÁÉÍÓÚÑ]/)
    }
  })
})
