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

  // Nota 2026-10-06 (QC-82): QC-82 hace que empezar y terminar empaque anoten en el registro de
  // ejecucion dentro de la misma transaccion. En `start-packing.ts` y `finish-packing.ts` se admite
  // SOLO el import del puerto `ExecutionLogRepository` desde `../ports/execution-log-repository` y
  // su uso como tipo; cualquier otra mencion, y cualquier mencion en el resto de archivos, sigue roja.
  it('el dominio de empezar/terminar/listar empaque no importa ni menciona un puerto de registro de ejecucion', () => {
    const conRegistroDeQc82 = new Set([
      join(repoRoot, 'lib', 'modules', 'asignaciones', 'domain', 'start-packing.ts'),
      join(repoRoot, 'lib', 'modules', 'asignaciones', 'domain', 'finish-packing.ts'),
    ])
    for (const file of domainFiles) {
      let source = readFileSync(file, 'utf8')
      if (conRegistroDeQc82.has(file)) {
        source = source
          .replace(
            /^import type \{ ExecutionLogRepository \} from '\.\.\/ports\/execution-log-repository';?\r?$/m,
            '',
          )
          .replace(/\breadonly log: ExecutionLogRepository;/g, '')
      }
      expect(source, file).not.toMatch(/ExecutionLog/)
      expect(source, file).not.toMatch(/execution-log/)
      expect(source, file).not.toMatch(/executionLog/)
    }
  })
})

// Nota 2026-10-06 (QC-82): R45 deja de barrer `specs/QC-82-registro-de-ejecucion-de-receta/`. Es
// QC-82 quien enmienda su propia carpeta para incluir el registro de empezar/terminar empaque, asi
// que mencionar QC-168, POR_EMPACAR o EN_EMPAQUE alli ya no indica que esta ficha la haya tocado.
// Los dos casos que la barrian se retiran; R44 sigue vigilado arriba.
