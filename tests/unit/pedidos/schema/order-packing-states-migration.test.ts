// Contrato estatico del SQL de la migracion `order_packing_states`.
//
// Lo que Prisma regenera de esta migracion es solo la columna `packed_by`: los dos `ALTER TYPE`,
// la FK compuesta, el indice y los dos CHECK son drift, escritos a mano, y esta es su unica
// guardia. El `down.sql` recrea el tipo de cuatro valores y todo lo que depende de "status": se
// compara su texto contra el de las migraciones que lo declararon, para que "identico" no
// dependa de una copia a mano que puede desviarse sin que nada lo note.
//
// Cubre R1, R3, R8, R28, R46 y R47.

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

/** Como el troceador de `pedidos-migration.test.ts`: ignora `;` dentro de un bloque `$$`, que
 *  aqui usa la guardia de datos del DOWN. */
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

const migrationDir = findMigrationDir('_order_packing_states')
const up = statements(readFileSync(join(migrationDir, 'migration.sql'), 'utf8'))
const down = statements(readFileSync(join(migrationDir, 'down.sql'), 'utf8'))

/** El texto EXACTO -normalizado de espacios- de una sentencia de OTRA migracion, la que la
 *  declaro por primera vez. Comparar contra la FUENTE, no contra una copia a mano, es lo que
 *  hace que "recrea la definicion literal" sea una afirmacion verificable. */
function literalFrom(migrationSuffix: string, file: 'migration.sql' | 'down.sql', pattern: RegExp): string {
  const source = statements(readFileSync(join(findMigrationDir(migrationSuffix), file), 'utf8'))
  return findStatement(source, pattern)
}

describe('migration.sql — los dos estados nuevos y quien empaca', () => {
  it('anade POR_EMPACAR y EN_EMPAQUE al final, comparando "status" como TEXTO (R1)', () => {
    const values = up.filter((statement) => /^ALTER TYPE "OrderStatus" ADD VALUE/i.test(statement))
    expect(values).toEqual([
      `ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'POR_EMPACAR'`,
      `ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'EN_EMPAQUE'`,
    ])
  })

  it('la columna packed_by nace UUID anulable, sin default (R28)', () => {
    const columna = findStatement(up, /^ALTER TABLE "orders" ADD COLUMN "packed_by"/i)
    expect(columna).toBe('ALTER TABLE "orders" ADD COLUMN "packed_by" UUID')
    expect(columna).not.toMatch(/NOT NULL/i)
    expect(columna).not.toMatch(/DEFAULT/i)
  })

  it('el indice y la FK compuesta de packed_by hacia users(id, company_id) (R28)', () => {
    const indice = findStatement(up, /^CREATE INDEX "orders_packed_by_idx"/i)
    expect(indice).toBe('CREATE INDEX "orders_packed_by_idx" ON "orders" ("packed_by")')

    const fk = findStatement(up, /ADD CONSTRAINT "orders_packed_by_company_id_fkey"/i)
    expect(fk).toMatch(/FOREIGN KEY \("packed_by", "company_id"\)/)
    expect(fk).toMatch(/REFERENCES "users"\("id", "company_id"\)/)
    expect(fk).toMatch(/ON DELETE RESTRICT ON UPDATE CASCADE/i)
  })

  it('orders_packed_by_matches_status compara "status" como TEXTO, nunca como valor de enum (R28)', () => {
    // Un valor recien anadido a un enum no se puede usar como VALOR DEL ENUM en la misma
    // transaccion que lo anade (55P04), y cada migracion corre en una: el CHECK tiene que
    // castear a texto y no comparar "status" directamente contra el tipo.
    const check = findStatement(up, /ADD CONSTRAINT "orders_packed_by_matches_status"/i)
    expect(check).toContain('"status"::text')
    expect(check).not.toMatch(/"status"\s*(?:=|<>|IN|NOT IN)/i)
    expect(check).toContain(`("status"::text <> 'EN_EMPAQUE' OR "packed_by" IS NOT NULL)`)
    expect(check).toContain(
      `("status"::text NOT IN ('PENDIENTE', 'EN_CURSO', 'POR_EMPACAR', 'CANCELADO') OR "packed_by" IS NULL)`,
    )

    // MUTACION: quitar el cast a texto tiene que hacer que la comparacion directa se note.
    const mutado = check.replace(/"status"::text/g, '"status"')
    expect(mutado).not.toBe(check)
    expect(mutado).toMatch(/"status"\s*(?:<>|NOT IN)/i)
  })

  it('orders_delivered_not_deleted se amplia con los dos estados nuevos, con su mismo nombre (R3, R8)', () => {
    const check = findStatement(up, /DROP CONSTRAINT "orders_delivered_not_deleted"/i)
    expect(check).toBe('ALTER TABLE "orders" DROP CONSTRAINT "orders_delivered_not_deleted"')

    const recreado = findStatement(up, /ADD CONSTRAINT "orders_delivered_not_deleted"/i)
    expect(recreado).toContain('"status"::text')
    expect(recreado).toContain(
      `CHECK ("deleted_at" IS NULL OR "status"::text NOT IN ('ENTREGADO', 'CANCELADO', 'POR_EMPACAR', 'EN_EMPAQUE'))`,
    )

    // El DROP va ANTES del ADD: la migracion no puede tener dos CHECK con el mismo nombre a la
    // vez.
    expect(up.indexOf(check)).toBeLessThan(up.indexOf(recreado))
  })
})

describe('down.sql — reversion exacta al esquema de cuatro estados', () => {
  it('aborta si hay pedidos POR_EMPACAR o EN_EMPAQUE, sin tocar nada mas (R47)', () => {
    const guardia = down.find(
      (statement) => /^DO \$\$/i.test(statement) && /RAISE EXCEPTION/i.test(statement),
    )
    expect(guardia, 'falta la guardia de datos del paso 0').toBeDefined()
    expect(guardia as string).toMatch(
      /"status"::text IN \('POR_EMPACAR', 'EN_EMPAQUE'\)/,
    )
    expect(guardia as string).toMatch(/IF en_empaque > 0 THEN/)
    expect(guardia as string).toMatch(/RAISE EXCEPTION 'ROLLBACK ABORTADO/)
    // Es la PRIMERA sentencia: nada se toca antes de comprobar que se puede revertir.
    expect(down[0]).toBe(guardia)
  })

  it('dropea los CHECK y los indices que nombran "status" ANTES del ALTER COLUMN TYPE (R47)', () => {
    const indiceDelCambioDeTipo = down.findIndex((statement) =>
      /^ALTER TABLE "orders" ALTER COLUMN "status" TYPE "OrderStatus"/i.test(statement),
    )
    expect(indiceDelCambioDeTipo).toBeGreaterThan(-1)

    for (const nombre of [
      'orders_packed_by_matches_status',
      'orders_delivered_not_deleted',
      'orders_cancellation_reason_matches_status',
      'orders_finished_at_requires_delivered',
    ]) {
      const drop = down.findIndex((statement) =>
        new RegExp(`^ALTER TABLE "orders" DROP CONSTRAINT "${nombre}"$`, 'i').test(statement),
      )
      expect(drop, `falta el DROP CONSTRAINT de ${nombre}`).toBeGreaterThan(-1)
      expect(drop, `${nombre} debe caer antes del ALTER COLUMN TYPE`).toBeLessThan(indiceDelCambioDeTipo)
    }

    for (const nombre of ['orders_status_idx', 'orders_expirable_idx', 'orders_company_finished_idx']) {
      const drop = down.findIndex((statement) => new RegExp(`^DROP INDEX "${nombre}"$`, 'i').test(statement))
      expect(drop, `falta el DROP INDEX de ${nombre}`).toBeGreaterThan(-1)
      expect(drop, `${nombre} debe caer antes del ALTER COLUMN TYPE`).toBeLessThan(indiceDelCambioDeTipo)
    }
  })

  it('borra la FK, el indice y la columna de packed_by (R47)', () => {
    expect(down).toContain('ALTER TABLE "orders" DROP CONSTRAINT "orders_packed_by_company_id_fkey"')
    expect(down).toContain('DROP INDEX "orders_packed_by_idx"')
    expect(down).toContain('ALTER TABLE "orders" DROP COLUMN "packed_by"')
  })

  it('recrea OrderStatus con los cuatro valores de antes, sin ningun DROP VALUE (R47)', () => {
    expect(down).toContain('ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old"')
    expect(down).toContain(
      `CREATE TYPE "OrderStatus" AS ENUM ('PENDIENTE', 'EN_CURSO', 'ENTREGADO', 'CANCELADO')`,
    )
    expect(down).toContain('ALTER TABLE "orders" ALTER COLUMN "status" DROP DEFAULT')
    expect(
      down.some((statement) =>
        /ALTER COLUMN "status" TYPE "OrderStatus" USING \("status"::text::"OrderStatus"\)/i.test(statement),
      ),
    ).toBe(true)
    expect(down).toContain(`ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'PENDIENTE'`)
    expect(down).toContain('DROP TYPE "OrderStatus_old"')

    // `ALTER TYPE ... DROP VALUE` no existe en Postgres, en ninguna version.
    expect(down.some((statement) => /DROP VALUE/i.test(statement))).toBe(false)
  })

  it('recrea orders_cancellation_reason_matches_status con el texto LITERAL de quien lo declaro (R47)', () => {
    const original = literalFrom(
      '_order_cancellation',
      'migration.sql',
      /ADD CONSTRAINT "orders_cancellation_reason_matches_status"/i,
    )
    const recreado = findStatement(down, /ADD CONSTRAINT "orders_cancellation_reason_matches_status"/i)
    expect(recreado).toBe(original)
  })

  it('recrea orders_delivered_not_deleted con el texto LITERAL de QC-34, sin los dos estados de empaque (R47)', () => {
    const original = literalFrom(
      '_order_cancellation',
      'migration.sql',
      /ADD CONSTRAINT "orders_delivered_not_deleted"/i,
    )
    const recreado = findStatement(down, /ADD CONSTRAINT "orders_delivered_not_deleted"/i)
    expect(recreado).toBe(original)
    expect(recreado).not.toContain('POR_EMPACAR')
    expect(recreado).not.toContain('EN_EMPAQUE')
  })

  it('recrea orders_finished_at_requires_delivered con su texto LITERAL (R47)', () => {
    const original = literalFrom(
      '_orders_finished_at',
      'migration.sql',
      /ADD CONSTRAINT "orders_finished_at_requires_delivered"/i,
    )
    const recreado = findStatement(down, /ADD CONSTRAINT "orders_finished_at_requires_delivered"/i)
    expect(recreado).toBe(original)
  })

  it('recrea orders_status_idx, orders_expirable_idx y orders_company_finished_idx con su texto LITERAL (R47)', () => {
    const statusIdxOriginal = literalFrom(
      '_list_query_indexes',
      'migration.sql',
      /^CREATE INDEX "orders_status_idx"/i,
    )
    expect(findStatement(down, /^CREATE INDEX "orders_status_idx"/i)).toBe(statusIdxOriginal)

    const expirableIdxOriginal = literalFrom(
      '_reservations_and_decimal_stock',
      'migration.sql',
      /^CREATE INDEX "orders_expirable_idx"/i,
    )
    expect(findStatement(down, /^CREATE INDEX "orders_expirable_idx"/i)).toBe(expirableIdxOriginal)

    const finishedIdxOriginal = literalFrom(
      '_orders_finished_at',
      'migration.sql',
      /^CREATE INDEX "orders_company_finished_idx"/i,
    )
    expect(findStatement(down, /^CREATE INDEX "orders_company_finished_idx"/i)).toBe(finishedIdxOriginal)
  })

  it('el DOWN no menciona a POR_EMPACAR ni a EN_EMPAQUE en ninguna sentencia recreada', () => {
    // Sensibilidad de la reversion: si algun CHECK o indice recreado siguiera nombrando un
    // estado de empaque, el esquema NO habria vuelto al de antes de esta migracion.
    const recreadas = down.filter((statement) => /^(ALTER TABLE|CREATE (UNIQUE )?INDEX)/i.test(statement))
    for (const statement of recreadas) {
      expect(statement).not.toContain('POR_EMPACAR')
      expect(statement).not.toContain('EN_EMPAQUE')
    }
  })
})
