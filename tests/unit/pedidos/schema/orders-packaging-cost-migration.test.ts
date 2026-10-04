// Contrato ESTATICO del SQL de `orders_packaging_cost` (QC-195, P6 = A, R47).
//
// La columna desglosa la parte de envases del importe; `ingredients_cost` sigue siendo el total.
// Se vigila que nazca opcional, que un importe que ya incluya envases quede en NULL (E6) en vez de
// abortar, que el resto del relleno solo ponga 0 donde ya hay importe, que el CHECK ate las dos
// columnas y que el `down.sql` revierta exactamente eso.
//
// PATRON: predicados puros sobre el texto SQL, aplicados al archivo real (pasa) y a una version
// mutada en memoria (falla). El archivo en disco no se toca nunca.

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

const migrationsDir = join(findRepoRoot(dirname(fileURLToPath(import.meta.url))), 'db', 'migrations')

function findMigrationDir(suffix: string): string {
  const candidates = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith(suffix))
    .map((entry) => entry.name)
  if (candidates.length !== 1) {
    throw new Error(`se esperaba exactamente una migracion terminada en "${suffix}"; hay ${String(candidates.length)}`)
  }
  return join(migrationsDir, candidates[0] as string)
}

const migrationDir = findMigrationDir('_orders_packaging_cost')
const upSource = readFileSync(join(migrationDir, 'migration.sql'), 'utf8')
const downSource = readFileSync(join(migrationDir, 'down.sql'), 'utf8')

function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
}

function normalized(sql: string): string {
  return stripSqlComments(sql).replace(/\s+/g, ' ').trim()
}

function addsNullableColumn(sql: string): boolean {
  return /ALTER TABLE "orders" ADD COLUMN "packaging_cost" DECIMAL\(14,4\);/.test(normalized(sql))
}

const NULLS_COST_WITH_PACKAGING =
  'UPDATE "orders" o SET "ingredients_cost" = NULL, "packaging_cost" = NULL WHERE o."ingredients_cost" IS NOT NULL AND EXISTS ( SELECT 1 FROM "order_presentation_lines" l WHERE l."order_id" = o."id" AND l."packaging_product_id" IS NOT NULL );'
const FILLS_ZERO = 'UPDATE "orders" SET "packaging_cost" = 0 WHERE "ingredients_cost" IS NOT NULL;'

function orderUpdates(sql: string): string[] {
  return normalized(sql).match(/UPDATE "orders"[^;]*;/g) ?? []
}

/** Los dos unicos rellenos: primero anula los importes con envases, luego pone 0 al resto. */
function fillsInOrder(sql: string): boolean {
  const updates = orderUpdates(sql)
  return updates.length === 2 && updates[0] === NULLS_COST_WITH_PACKAGING && updates[1] === FILLS_ZERO
}

function neverAborts(sql: string): boolean {
  return !normalized(sql).includes('RAISE EXCEPTION')
}

function addsCheck(sql: string): boolean {
  return normalized(sql).includes(
    'ALTER TABLE "orders" ADD CONSTRAINT "orders_packaging_cost_matches_ingredients_cost" CHECK (("packaging_cost" IS NULL) = ("ingredients_cost" IS NULL));',
  )
}

function restoresForcedRls(sql: string): boolean {
  const text = normalized(sql)
  return (
    text.endsWith(
      'ALTER TABLE "orders" FORCE ROW LEVEL SECURITY; ALTER TABLE "order_presentation_lines" FORCE ROW LEVEL SECURITY;',
    ) && text.includes('ALTER TABLE "orders" NO FORCE ROW LEVEL SECURITY;')
  )
}

function downRevertsExactly(sql: string): boolean {
  return (
    normalized(sql) ===
    'ALTER TABLE "orders" DROP CONSTRAINT "orders_packaging_cost_matches_ingredients_cost"; ALTER TABLE "orders" DROP COLUMN "packaging_cost";'
  )
}

describe('migration.sql de orders_packaging_cost — QC-195 R47 (P6 = A)', () => {
  it('R47: la columna nace opcional, decimal(14,4) y sin default', () => {
    expect(addsNullableColumn(upSource)).toBe(true)
    const conDefault = upSource.replace('DECIMAL(14,4);', 'DECIMAL(14,4) DEFAULT 0;')
    expect(conDefault).not.toBe(upSource)
    expect(addsNullableColumn(conDefault)).toBe(false)
  })

  it('R47: el relleno pone 0 solo en los pedidos con importe', () => {
    expect(fillsInOrder(upSource)).toBe(true)
    const sinFiltro = upSource.replace(' WHERE "ingredients_cost" IS NOT NULL;', ';')
    expect(sinFiltro).not.toBe(upSource)
    expect(fillsInOrder(sinFiltro)).toBe(false)
  })

  it('R47 E6: un pedido con importe y envases en el reparto queda sin importe, antes de rellenar con 0', () => {
    expect(fillsInOrder(upSource)).toBe(true)
    const soloElTotal = upSource.replace(
      'SET "ingredients_cost" = NULL, "packaging_cost" = NULL',
      'SET "ingredients_cost" = NULL',
    )
    expect(soloElTotal).not.toBe(upSource)
    expect(fillsInOrder(soloElTotal)).toBe(false)
    const ordenInverso = upSource.replace(
      /(UPDATE "orders" o SET[\s\S]*?\);)\s*(UPDATE "orders" SET "packaging_cost" = 0[^;]*;)/,
      '$2\n$1',
    )
    expect(ordenInverso).not.toBe(upSource)
    expect(fillsInOrder(ordenInverso)).toBe(false)
  })

  it('R47 E6: no aborta la migracion', () => {
    expect(neverAborts(upSource)).toBe(true)
    const conGuardia = `${upSource}\nDO $$ BEGIN RAISE EXCEPTION 'orders_packaging_cost_unknown'; END $$;`
    expect(neverAborts(conGuardia)).toBe(false)
  })

  it('R47: el CHECK exige packaging_cost NULL si y solo si ingredients_cost es NULL', () => {
    expect(addsCheck(upSource)).toBe(true)
    const soloUnaDireccion = upSource.replace(
      'CHECK (("packaging_cost" IS NULL) = ("ingredients_cost" IS NULL))',
      'CHECK ("ingredients_cost" IS NOT NULL OR "packaging_cost" IS NULL)',
    )
    expect(soloUnaDireccion).not.toBe(upSource)
    expect(addsCheck(soloUnaDireccion)).toBe(false)
  })

  it('cierra el parentesis de RLS con FORCE en las dos tablas', () => {
    expect(restoresForcedRls(upSource)).toBe(true)
    const sinCerrar = upSource.replace(/ALTER TABLE "orders"\s+FORCE ROW LEVEL SECURITY;/, '')
    expect(sinCerrar).not.toBe(upSource)
    expect(restoresForcedRls(sinCerrar)).toBe(false)
  })

  it('down.sql quita el CHECK y la columna, y nada mas', () => {
    expect(downRevertsExactly(downSource)).toBe(true)
    const tocaElTotal = `${downSource}\nUPDATE "orders" SET "ingredients_cost" = NULL;`
    expect(downRevertsExactly(tocaElTotal)).toBe(false)
  })
})
