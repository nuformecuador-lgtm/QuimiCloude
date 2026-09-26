// Contrato estatico de los limites de la ficha: ni tabla ni registro de ejecucion propios, y sin
// enmendar la carpeta de otra ficha por su cuenta.

import { readFileSync } from 'node:fs'
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

const migrationFiles = [
  join(repoRoot, 'db', 'migrations', '20260925120000_order_packing_states', 'migration.sql'),
  join(repoRoot, 'db', 'migrations', '20260925120000_order_packing_states', 'down.sql'),
  join(repoRoot, 'db', 'migrations', '20260925120100_packing_permission', 'migration.sql'),
  join(repoRoot, 'db', 'migrations', '20260925120100_packing_permission', 'down.sql'),
]

const domainFiles = [
  join(repoRoot, 'lib', 'modules', 'asignaciones', 'domain', 'start-packing.ts'),
  join(repoRoot, 'lib', 'modules', 'asignaciones', 'domain', 'finish-packing.ts'),
  join(repoRoot, 'lib', 'modules', 'asignaciones', 'domain', 'list-packing-orders.ts'),
  join(repoRoot, 'lib', 'modules', 'asignaciones', 'domain', 'get-packing-order.ts'),
  join(repoRoot, 'lib', 'modules', 'asignaciones', 'domain', 'packing-order-view.ts'),
  join(repoRoot, 'lib', 'modules', 'pedidos', 'domain', 'order-packing.ts'),
]

describe('R44 — sin tabla ni registro de ejecucion propios', () => {
  it('ninguna de las dos migraciones de la ficha crea una tabla', () => {
    for (const file of migrationFiles) {
      const sql = readFileSync(file, 'utf8')
      expect(sql, file).not.toMatch(/CREATE TABLE/i)
    }
  })

  it('ninguna de las dos migraciones nombra un registro de ejecucion', () => {
    for (const file of migrationFiles) {
      const sql = readFileSync(file, 'utf8')
      expect(sql, file).not.toMatch(/execution/i)
      expect(sql, file).not.toMatch(/ejecucion/i)
    }
  })

  it('el dominio de empezar/terminar/listar empaque no importa ni menciona un puerto de registro de ejecucion', () => {
    // El puerto se llamaria `ExecutionLog` o `execution-log` si existiera; no existe en el repo,
    // asi que su ausencia en estos archivos es la unica forma de verificarla.
    for (const file of domainFiles) {
      const source = readFileSync(file, 'utf8')
      expect(source, file).not.toMatch(/ExecutionLog/)
      expect(source, file).not.toMatch(/execution-log/)
      expect(source, file).not.toMatch(/executionLog/)
    }
  })
})

describe('R45 — no modifica la ficha de QC-82', () => {
  const qc82Dir = join(repoRoot, 'specs', 'QC-82-registro-de-ejecucion-de-receta')
  const qc82Files = ['requirements.md', 'design.md', 'tasks.md'].map((name) => join(qc82Dir, name))

  it('ningun archivo de QC-82 trae una nota de enmienda de esta ficha', () => {
    for (const file of qc82Files) {
      const source = readFileSync(file, 'utf8')
      expect(source, file).not.toMatch(/Enmendado[^\n]*QC-168/)
      expect(source, file).not.toMatch(/QC-168/)
    }
  })

  it('ningun archivo de QC-82 menciona POR_EMPACAR ni EN_EMPAQUE por cuenta de esta ficha', () => {
    for (const file of qc82Files) {
      const source = readFileSync(file, 'utf8')
      expect(source, file).not.toMatch(/POR_EMPACAR/)
      expect(source, file).not.toMatch(/EN_EMPAQUE/)
    }
  })
})
