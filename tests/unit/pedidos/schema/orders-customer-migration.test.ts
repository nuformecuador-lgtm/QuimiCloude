// Contrato ESTATICO del SQL de `orders_customer` (QC-156).
//
// La migracion es minima a proposito: la columna anulable sin `DEFAULT` ni `UPDATE`, el indice
// `(company_id, customer_id)` y la FK COMPUESTA hacia `customers("company_id","id")`. Este archivo
// vigila esas tres sentencias, que no nombre otra tabla y que el `down.sql` las revierta
// exactamente en orden inverso.
//
// PATRON: predicados puros sobre el texto SQL, aplicados al archivo real (pasa) y a una version
// mutada en memoria (falla). El archivo en disco no se toca nunca. Mismo patron que
// `orders-finished-at-migration.test.ts`.

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

function timestampOf(dir: string): string {
  return (dir.split(/[\\/]/).pop() ?? '').split('_')[0] ?? ''
}

const migrationDir = findMigrationDir('_orders_customer')

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

const ADD_COLUMN = /^ALTER TABLE "orders" ADD COLUMN "customer_id" UUID$/i
const CREATE_INDEX =
  /^CREATE INDEX "orders_company_id_customer_id_idx" ON "orders" \("company_id", "customer_id"\)$/i
const ADD_FK =
  /^ALTER TABLE "orders" ADD CONSTRAINT "orders_company_id_customer_id_fkey" FOREIGN KEY \("company_id", "customer_id"\) REFERENCES "customers"\("company_id", "id"\) ON DELETE RESTRICT ON UPDATE CASCADE$/i

const DROP_FK = /^ALTER TABLE "orders" DROP CONSTRAINT "orders_company_id_customer_id_fkey"$/i
const DROP_INDEX = /^DROP INDEX "orders_company_id_customer_id_idx"$/i
const DROP_COLUMN = /^ALTER TABLE "orders" DROP COLUMN "customer_id"$/i

/** ¿El UP es EXACTAMENTE: columna, indice y FK, en ese orden? */
function upIsExactlyTheThreeStatements(sql: string): boolean {
  const parsed = statements(sql)
  return (
    parsed.length === 3 &&
    ADD_COLUMN.test(parsed[0] as string) &&
    CREATE_INDEX.test(parsed[1] as string) &&
    ADD_FK.test(parsed[2] as string)
  )
}

/** ¿Ni un `DEFAULT` ni un `UPDATE`? Los pedidos existentes quedan sin cliente. */
function fillsNothing(sql: string): boolean {
  const code = stripSqlComments(sql)
  return !/\bUPDATE\s+"?orders"?\s+SET\b/i.test(code) && !/\bDEFAULT\b/i.test(code)
}

/** Tablas que nombra el SQL ejecutable: tras `TABLE`, `ON` (indice), `REFERENCES` e `INTO`. `ON DELETE`/`ON UPDATE` de la FK no son tablas. */
function tablesNamed(sql: string): readonly string[] {
  const code = stripSqlComments(sql)
  const names = [
    ...code.matchAll(/\b(?:TABLE|ON|REFERENCES|INTO)\s+"?([a-z_][a-z0-9_]*)"?/gi),
  ]
    .map((match) => match[1] ?? '')
    .filter((name) => !['DELETE', 'UPDATE'].includes(name.toUpperCase()))
  return [...new Set(names)].sort()
}

/** ¿El DOWN quita, en orden inverso, exactamente la FK, el indice y la columna? */
function downIsExactReverse(sql: string): boolean {
  const parsed = statements(sql)
  return (
    parsed.length === 3 &&
    DROP_FK.test(parsed[0] as string) &&
    DROP_INDEX.test(parsed[1] as string) &&
    DROP_COLUMN.test(parsed[2] as string)
  )
}

describe('orders_customer — orden de aplicacion', () => {
  it('R4: el timestamp es mayor que el de las migraciones que la preceden', () => {
    const ts = timestampOf(migrationDir)
    expect(ts).toMatch(/^\d{14}$/)
    for (const suffix of [
      '_customers',
      '_recipe_packing_steps',
      '_inventory_imports',
      '_inventory_movements_adjustment_count',
    ]) {
      const previous = timestampOf(findMigrationDir(suffix))
      expect(ts > previous, `${ts} debe ser mayor que ${previous} (${suffix})`).toBe(true)
    }
  })
})

describe('migration.sql de orders_customer (R1, R2, R3)', () => {
  it('R1, R2: anade customer_id UUID anulable, sin DEFAULT ni UPDATE', () => {
    expect(statements(upSource).some((s) => ADD_COLUMN.test(s))).toBe(true)
    expect(fillsNothing(upSource)).toBe(true)

    const obligatoria = upSource.replace(
      'ADD COLUMN "customer_id" UUID;',
      'ADD COLUMN "customer_id" UUID NOT NULL;',
    )
    expect(obligatoria, 'la mutacion no se aplico').not.toBe(upSource)
    expect(statements(obligatoria).some((s) => ADD_COLUMN.test(s))).toBe(false)

    const conDefault = upSource.replace(
      'ADD COLUMN "customer_id" UUID;',
      'ADD COLUMN "customer_id" UUID DEFAULT gen_random_uuid();',
    )
    expect(conDefault, 'la mutacion no se aplico').not.toBe(upSource)
    expect(fillsNothing(conDefault)).toBe(false)

    const conRelleno = `${upSource}\nUPDATE "orders" SET "customer_id" = NULL;`
    expect(fillsNothing(conRelleno)).toBe(false)
  })

  it('R3: la FK es COMPUESTA (company_id, customer_id) hacia customers(company_id, id), RESTRICT', () => {
    expect(statements(upSource).some((s) => ADD_FK.test(s))).toBe(true)

    // Una FK simple a customers(id) dejaria apuntar a un cliente de otra empresa.
    const simple = upSource
      .replace('FOREIGN KEY ("company_id", "customer_id")', 'FOREIGN KEY ("customer_id")')
      .replace('REFERENCES "customers"("company_id", "id")', 'REFERENCES "customers"("id")')
    expect(simple, 'la mutacion no se aplico').not.toBe(upSource)
    expect(statements(simple).some((s) => ADD_FK.test(s))).toBe(false)

    const cascada = upSource.replace('ON DELETE RESTRICT', 'ON DELETE CASCADE')
    expect(cascada, 'la mutacion no se aplico').not.toBe(upSource)
    expect(statements(cascada).some((s) => ADD_FK.test(s))).toBe(false)

    const setNull = upSource.replace('ON DELETE RESTRICT', 'ON DELETE SET NULL')
    expect(statements(setNull).some((s) => ADD_FK.test(s))).toBe(false)
  })

  it('R3: crea el indice completo (company_id, customer_id), sin WHERE', () => {
    expect(statements(upSource).some((s) => CREATE_INDEX.test(s))).toBe(true)

    const parcial = upSource.replace(
      '("company_id", "customer_id");',
      '("company_id", "customer_id") WHERE "deleted_at" IS NULL;',
    )
    expect(parcial, 'la mutacion no se aplico').not.toBe(upSource)
    expect(statements(parcial).some((s) => CREATE_INDEX.test(s))).toBe(false)
  })

  it('R2, R4: el UP es exactamente columna, indice y FK, y solo nombra orders y customers', () => {
    expect(upIsExactlyTheThreeStatements(upSource)).toBe(true)
    expect(tablesNamed(upSource)).toEqual(['customers', 'orders'])

    const conExtra = `${upSource}\nALTER TABLE "customers" ADD COLUMN "x" TEXT;`
    expect(upIsExactlyTheThreeStatements(conExtra)).toBe(false)

    const otraTabla = `${upSource}\nALTER TABLE "order_presentation_lines" ADD COLUMN "x" TEXT;`
    expect(tablesNamed(otraTabla)).toContain('order_presentation_lines')
  })
})

describe('down.sql de orders_customer (R4)', () => {
  it('R4: existe y revierte FK, indice y columna, en orden inverso, sin tocar customers', () => {
    expect(downSource.trim().length).toBeGreaterThan(0)
    expect(downIsExactReverse(downSource)).toBe(true)
    expect(tablesNamed(downSource)).toEqual(['orders'])

    const ordenInvertido = [
      'ALTER TABLE "orders" DROP COLUMN "customer_id";',
      'DROP INDEX "orders_company_id_customer_id_idx";',
      'ALTER TABLE "orders" DROP CONSTRAINT "orders_company_id_customer_id_fkey";',
    ].join('\n')
    expect(downIsExactReverse(ordenInvertido)).toBe(false)

    const columnaEquivocada = downSource.replace('DROP COLUMN "customer_id"', 'DROP COLUMN "unit_id"')
    expect(columnaEquivocada, 'la mutacion no se aplico').not.toBe(downSource)
    expect(downIsExactReverse(columnaEquivocada)).toBe(false)

    const conExtra = `${downSource}\nDROP TABLE "customers";`
    expect(downIsExactReverse(conExtra)).toBe(false)
  })
})
