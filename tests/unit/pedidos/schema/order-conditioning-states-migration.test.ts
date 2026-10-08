// Contrato estatico del SQL de las dos migraciones que anaden los estados de acondicionamiento y
// TERMINADO a `OrderStatus`, la columna `conditioned_by` y el indice de terminados.
//
// Lo que se lee del disco es el SQL: el `up` anade los valores de forma idempotente y sin tocar
// filas, sus CHECK comparan `"status"::text` (el valor nuevo no se puede usar como valor del enum
// en la transaccion que lo anade), y el `down` aborta si hay filas en un estado nuevo y recrea las
// piezas que nombran `status` con el texto LITERAL de la migracion que las dejo vigentes.

import { readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
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
const migrationsRoot = join(repoRoot, 'db', 'migrations')

function findMigrationDir(suffix: string): string {
  const pattern = new RegExp(`^\\d{14}${suffix}$`)
  const candidates = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && pattern.test(entry.name))
    .map((entry) => entry.name)
    .sort()
  if (candidates.length !== 1) {
    throw new Error(
      `se esperaba exactamente una migracion terminada en "${suffix}"; hay ${String(candidates.length)}`,
    )
  }
  return join(migrationsRoot, candidates[0] as string)
}

function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
}

/** Ignora `;` dentro de un bloque `$$`, que usa la guardia de datos del DOWN. */
function splitTopLevelStatements(sql: string): readonly string[] {
  const out: string[] = []
  let current = ''
  let dentroDeDolar = false
  for (let i = 0; i < sql.length; i += 1) {
    if (sql.startsWith('$$', i)) {
      dentroDeDolar = !dentroDeDolar
      current += '$$'
      i += 1
      continue
    }
    const caracter = sql[i] as string
    if (caracter === ';' && !dentroDeDolar) {
      out.push(current)
      current = ''
      continue
    }
    current += caracter
  }
  out.push(current)
  return out
}

function statements(sql: string): readonly string[] {
  return splitTopLevelStatements(stripSqlComments(sql))
    .map((statement) => statement.replace(/\s+/g, ' ').trim())
    .filter((statement) => statement.length > 0)
}

function findStatement(source: readonly string[], pattern: RegExp): string {
  const found = source.filter((statement) => pattern.test(statement))
  expect(found, `ninguna sentencia coincide con ${String(pattern)}`).toHaveLength(1)
  return found[0] as string
}

const statesDir = findMigrationDir('_order_conditioning_states')
const indexDir = findMigrationDir('_order_terminated_finished_index')
const statesUp = statements(readFileSync(join(statesDir, 'migration.sql'), 'utf8'))
const statesDown = statements(readFileSync(join(statesDir, 'down.sql'), 'utf8'))
const indexUp = statements(readFileSync(join(indexDir, 'migration.sql'), 'utf8'))
const indexDown = statements(readFileSync(join(indexDir, 'down.sql'), 'utf8'))

/** El texto vigente de una sentencia, leido de la migracion que la dejo asi. */
function literalFrom(migrationSuffix: string, pattern: RegExp): string {
  const source = statements(readFileSync(join(findMigrationDir(migrationSuffix), 'migration.sql'), 'utf8'))
  return findStatement(source, pattern)
}

function valoresDelEsquema(): readonly string[] {
  const esquema = readFileSync(join(repoRoot, 'db', 'schema.prisma'), 'utf8')
  const bloque = /enum\s+OrderStatus\s*\{([^}]*)\}/.exec(esquema)
  if (bloque === null) throw new Error('db/schema.prisma no declara enum OrderStatus')
  return (bloque[1] as string)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('///'))
}

const NUEVOS = ['POR_ACONDICIONAR', 'EN_ACONDICIONAMIENTO', 'TERMINADO'] as const

const CHECK_CONDITIONED_BY = `ALTER TABLE "orders" ADD CONSTRAINT "orders_conditioned_by_matches_status" CHECK ( ("status"::text NOT IN ('EN_ACONDICIONAMIENTO', 'TERMINADO') OR "conditioned_by" IS NOT NULL) AND ("status"::text NOT IN ('PENDIENTE', 'EN_CURSO', 'POR_EMPACAR', 'EN_EMPAQUE', 'POR_ACONDICIONAR', 'CANCELADO', 'BLOQUEADO') OR "conditioned_by" IS NULL) )`
const CHECK_PACKED_BY = `ALTER TABLE "orders" ADD CONSTRAINT "orders_packed_by_matches_status" CHECK ( ("status"::text NOT IN ('EN_EMPAQUE', 'POR_ACONDICIONAR', 'EN_ACONDICIONAMIENTO', 'TERMINADO') OR "packed_by" IS NOT NULL) AND ("status"::text NOT IN ('PENDIENTE', 'EN_CURSO', 'POR_EMPACAR', 'CANCELADO') OR "packed_by" IS NULL) )`
const CHECK_NOT_DELETED = `ALTER TABLE "orders" ADD CONSTRAINT "orders_delivered_not_deleted" CHECK ("deleted_at" IS NULL OR "status"::text NOT IN ('ENTREGADO', 'CANCELADO', 'POR_EMPACAR', 'EN_EMPAQUE', 'POR_ACONDICIONAR', 'EN_ACONDICIONAMIENTO', 'TERMINADO'))`
const CHECK_FINISHED_AT = `ALTER TABLE "orders" ADD CONSTRAINT "orders_finished_at_requires_delivered" CHECK ("finished_at" IS NULL OR "status"::text IN ('TERMINADO', 'ENTREGADO'))`
const CHECK_TERMINATED_FINISHED = `ALTER TABLE "orders" ADD CONSTRAINT "orders_finished_requires_finished_at" CHECK ("status"::text <> 'TERMINADO' OR "finished_at" IS NOT NULL)`

describe('migration.sql de los estados — valores, columna y restricciones', () => {
  it('R26: las tres primeras sentencias anaden los valores, idempotentes y en orden', () => {
    expect(statesUp.slice(0, 3)).toEqual(
      NUEVOS.map((valor) => `ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS '${valor}'`),
    )
    expect(statesUp.filter((statement) => /ADD VALUE/i.test(statement))).toHaveLength(3)
    // Un `BEFORE`/`AFTER` seria un reorden, que `ADD VALUE` no puede hacer sin recrear el tipo.
    for (const statement of statesUp.slice(0, 3)) expect(statement).not.toMatch(/\bBEFORE\b|\bAFTER\b/i)
  })

  it('R1, R30: los tres valores son los ultimos del esquema, detras de BLOQUEADO', () => {
    const valores = valoresDelEsquema()
    expect(valores.slice(-4)).toEqual(['BLOQUEADO', ...NUEVOS])
  })

  it('R26: la migracion no modifica ninguna fila de orders', () => {
    // `ON UPDATE CASCADE` de la FK no es una escritura: se mira el comienzo de cada sentencia.
    for (const statement of statesUp) {
      expect(statement).not.toMatch(/^(UPDATE|DELETE|INSERT|TRUNCATE)\b/i)
      expect(statement).not.toMatch(/^DO\b/i)
    }
  })

  it('R25: anade conditioned_by con su indice y la FK compuesta contra la empresa', () => {
    expect(statesUp).toContain('ALTER TABLE "orders" ADD COLUMN "conditioned_by" UUID')
    expect(statesUp).toContain('CREATE INDEX "orders_conditioned_by_idx" ON "orders" ("conditioned_by")')
    expect(statesUp).toContain(
      'ALTER TABLE "orders" ADD CONSTRAINT "orders_conditioned_by_company_id_fkey" FOREIGN KEY ("conditioned_by", "company_id") REFERENCES "users"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE',
    )
  })

  it('R25: el CHECK de quien acondiciona lo exige en EN_ACONDICIONAMIENTO y TERMINADO y lo prohibe antes', () => {
    expect(findStatement(statesUp, /ADD CONSTRAINT "orders_conditioned_by_matches_status"/)).toBe(
      CHECK_CONDITIONED_BY,
    )
  })

  it('R24, R30: amplia quien empaca y el borrado a los estados nuevos', () => {
    expect(statesUp).toContain('ALTER TABLE "orders" DROP CONSTRAINT "orders_packed_by_matches_status"')
    expect(findStatement(statesUp, /ADD CONSTRAINT "orders_packed_by_matches_status"/)).toBe(CHECK_PACKED_BY)
    expect(statesUp).toContain('ALTER TABLE "orders" DROP CONSTRAINT "orders_delivered_not_deleted"')
    expect(findStatement(statesUp, /ADD CONSTRAINT "orders_delivered_not_deleted"/)).toBe(CHECK_NOT_DELETED)
  })

  it('R24, R30: finished_at solo en TERMINADO y ENTREGADO, y obligatorio en TERMINADO', () => {
    expect(statesUp).toContain('ALTER TABLE "orders" DROP CONSTRAINT "orders_finished_at_requires_delivered"')
    expect(findStatement(statesUp, /ADD CONSTRAINT "orders_finished_at_requires_delivered"/)).toBe(
      CHECK_FINISHED_AT,
    )
    expect(findStatement(statesUp, /ADD CONSTRAINT "orders_finished_requires_finished_at"/)).toBe(
      CHECK_TERMINATED_FINISHED,
    )
  })

  it('R26: ninguna sentencia usa un valor nuevo como valor del enum en la misma transaccion', () => {
    for (const statement of statesUp.slice(3)) {
      expect(statement).not.toMatch(/"status"\s*(=|<>|IN)/)
      expect(statement).not.toMatch(/OrderStatus/)
    }
  })
})

describe('down.sql de los estados — guardia de datos y reversion exacta', () => {
  it('R27: la primera sentencia aborta si hay pedidos en un estado nuevo', () => {
    const guardia = statesDown[0] as string
    expect(guardia).toMatch(/^DO \$\$/i)
    expect(guardia).toMatch(/RAISE EXCEPTION 'ROLLBACK ABORTADO/)
    expect(guardia).toContain(`"status"::text IN ('POR_ACONDICIONAR', 'EN_ACONDICIONAMIENTO', 'TERMINADO')`)
    expect(guardia).toMatch(/IF\s+afectados\s*>\s*0\s+THEN/i)
    expect(statesDown.join('\n')).not.toMatch(/\bUPDATE\s+"?orders"?/i)
  })

  it('R27: dropea los CHECK y los indices que nombran "status" ANTES del ALTER COLUMN TYPE', () => {
    const cambioDeTipo = statesDown.findIndex((statement) =>
      /^ALTER TABLE "orders" ALTER COLUMN "status" TYPE "OrderStatus"/i.test(statement),
    )
    expect(cambioDeTipo).toBeGreaterThan(-1)

    for (const nombre of [
      'orders_finished_requires_finished_at',
      'orders_conditioned_by_matches_status',
      'orders_packed_by_matches_status',
      'orders_delivered_not_deleted',
      'orders_finished_at_requires_delivered',
      'orders_cancellation_reason_matches_status',
    ]) {
      const drop = statesDown.indexOf(`ALTER TABLE "orders" DROP CONSTRAINT "${nombre}"`)
      expect(drop, `falta el DROP CONSTRAINT de ${nombre}`).toBeGreaterThan(-1)
      expect(drop, `${nombre} debe caer antes del ALTER COLUMN TYPE`).toBeLessThan(cambioDeTipo)
    }

    for (const nombre of [
      'orders_status_idx',
      'orders_expirable_idx',
      'orders_company_finished_idx',
      'orders_blocked_company_created_idx',
    ]) {
      const drop = statesDown.indexOf(`DROP INDEX "${nombre}"`)
      expect(drop, `falta el DROP INDEX de ${nombre}`).toBeGreaterThan(-1)
      expect(drop, `${nombre} debe caer antes del ALTER COLUMN TYPE`).toBeLessThan(cambioDeTipo)
    }
  })

  it('R27: quita la columna de quien acondiciona con su FK y su indice', () => {
    expect(statesDown).toContain('ALTER TABLE "orders" DROP CONSTRAINT "orders_conditioned_by_company_id_fkey"')
    expect(statesDown).toContain('DROP INDEX "orders_conditioned_by_idx"')
    expect(statesDown).toContain('ALTER TABLE "orders" DROP COLUMN "conditioned_by"')
  })

  it('R27: recrea OrderStatus con los valores de antes, sacados del esquema', () => {
    const valores = valoresDelEsquema()
    const antes = valores.slice(0, valores.indexOf('POR_ACONDICIONAR'))
    expect(antes.at(-1)).toBe('BLOQUEADO')
    expect(statesDown).toContain(
      `CREATE TYPE "OrderStatus" AS ENUM (${antes.map((v) => `'${v}'`).join(', ')})`,
    )
    expect(statesDown).toContain('ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old"')
    expect(statesDown).toContain('DROP TYPE "OrderStatus_old"')
    expect(statesDown.some((statement) => /DROP VALUE/i.test(statement))).toBe(false)

    const quit = statesDown.indexOf('ALTER TABLE "orders" ALTER COLUMN "status" DROP DEFAULT')
    const cambio = statesDown.findIndex((statement) =>
      /^ALTER TABLE "orders" ALTER COLUMN "status" TYPE "OrderStatus"/i.test(statement),
    )
    const puesto = statesDown.indexOf(`ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'PENDIENTE'`)
    expect(quit).toBeGreaterThan(-1)
    expect(quit).toBeLessThan(cambio)
    expect(puesto).toBeGreaterThan(cambio)
  })

  it('R27: recrea los cuatro CHECK con el texto LITERAL de la migracion que los dejo vigentes', () => {
    const casos: ReadonlyArray<readonly [string, string]> = [
      ['orders_cancellation_reason_matches_status', '_order_cancellation'],
      ['orders_finished_at_requires_delivered', '_orders_finished_at'],
      ['orders_delivered_not_deleted', '_order_packing_states'],
      ['orders_packed_by_matches_status', '_order_packing_states'],
    ]
    const cambio = statesDown.findIndex((statement) =>
      /^ALTER TABLE "orders" ALTER COLUMN "status" TYPE "OrderStatus"/i.test(statement),
    )
    for (const [nombre, fuente] of casos) {
      const patron = new RegExp(`ADD CONSTRAINT "${nombre}"`)
      const original = literalFrom(fuente, patron)
      const recreado = findStatement(statesDown, patron)
      expect(recreado, nombre).toBe(original)
      expect(statesDown.indexOf(recreado), `${nombre} se recrea despues del cambio de tipo`).toBeGreaterThan(cambio)
    }
  })

  it('R27: recrea los cuatro indices con el texto LITERAL de la migracion que los declaro', () => {
    const casos: ReadonlyArray<readonly [string, string]> = [
      ['orders_status_idx', '_list_query_indexes'],
      ['orders_expirable_idx', '_reservations_and_decimal_stock'],
      ['orders_company_finished_idx', '_orders_finished_at'],
      ['orders_blocked_company_created_idx', '_orders_blocked_index'],
    ]
    for (const [nombre, fuente] of casos) {
      const patron = new RegExp(`^CREATE INDEX "${nombre}"`)
      expect(findStatement(statesDown, patron), nombre).toBe(literalFrom(fuente, patron))
    }
  })

  it('R27: los CHECK nuevos no se recrean y ninguna pieza recreada nombra un valor nuevo', () => {
    expect(statesDown.join('\n')).not.toMatch(/ADD CONSTRAINT "orders_conditioned_by_matches_status"/)
    expect(statesDown.join('\n')).not.toMatch(/ADD CONSTRAINT "orders_finished_requires_finished_at"/)
    const recreadas = statesDown.filter((statement) =>
      /^(ALTER TABLE "orders" ADD|CREATE (UNIQUE )?INDEX)/i.test(statement),
    )
    expect(recreadas.length).toBeGreaterThan(0)
    for (const statement of recreadas) {
      for (const valor of NUEVOS) expect(statement).not.toContain(valor)
    }
  })
})

describe('migracion del indice de terminados', () => {
  it('R30: crea el gemelo de orders_company_finished_idx para TERMINADO', () => {
    const gemelo = literalFrom('_orders_finished_at', /^CREATE INDEX "orders_company_finished_idx"/)
    expect(indexUp).toEqual([
      gemelo
        .replace('"orders_company_finished_idx"', '"orders_company_terminated_idx"')
        .replace(`"status" = 'ENTREGADO'`, `"status" = 'TERMINADO'`),
    ])
  })

  it('R30: va en su propia migracion, despues de la que anade el valor', () => {
    expect(basename(indexDir) > basename(statesDir)).toBe(true)
    expect(statesUp.join('\n')).not.toContain('orders_company_terminated_idx')
    expect(statesDown.join('\n')).not.toContain('orders_company_terminated_idx')
  })

  it('R27: el DOWN del indice lo borra con IF EXISTS y no crea nada', () => {
    expect(indexDown).toEqual(['DROP INDEX IF EXISTS "orders_company_terminated_idx"'])
  })
})
