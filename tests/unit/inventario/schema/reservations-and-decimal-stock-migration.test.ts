// Contrato estatico de `db/migrations/*_reservations_and_decimal_stock`: las cuatro columnas
// pasan a decimal(14,4), el libro de reservas nace con sus FK compuestas y su CHECK, y la
// reversion falla si alguna de esas columnas tiene todavia parte decimal.

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
  name.endsWith('_reservations_and_decimal_stock'),
)
expect(candidateDirs, 'debe existir exactamente una migracion *_reservations_and_decimal_stock').toHaveLength(1)
const migrationDir = join(migrationsDir, candidateDirs[0] as string)

const upSource = readFileSync(join(migrationDir, 'migration.sql'), 'utf8')
const downSource = readFileSync(join(migrationDir, 'down.sql'), 'utf8')

describe('db/migrations/*_reservations_and_decimal_stock', () => {
  it('R1: convierte las cuatro columnas de existencia a decimal(14,4)', () => {
    const conversions: ReadonlyArray<readonly [string, string]> = [
      ['product_batches', 'stock'],
      ['inventory_movements', 'quantity'],
      ['products', 'stock'],
      ['products', 'qty_alert'],
    ]
    for (const [table, column] of conversions) {
      const pattern = new RegExp(
        `ALTER TABLE "${table}"\\s+ALTER COLUMN "${column}" TYPE DECIMAL\\(14,4\\) USING "${column}"::DECIMAL\\(14,4\\)`,
      )
      expect(upSource, `falta la conversion de ${table}.${column}`).toMatch(pattern)
    }
  })

  it('la clave unica compuesta de product_batches nace para las FK del libro de reservas', () => {
    expect(upSource).toMatch(
      /ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_id_company_id_key" UNIQUE \("id", "company_id"\)/,
    )
  })

  it('reservation_movements nace append-only: sin updated_at, sin deleted_at y con cantidad siempre positiva', () => {
    const createStatement = /CREATE TABLE "reservation_movements" \(([\s\S]*?)\);/.exec(upSource)
    expect(createStatement, 'no se encontro el CREATE TABLE de reservation_movements').not.toBeNull()
    const body = createStatement?.[1] ?? ''
    expect(body).not.toMatch(/"updated_at"/)
    expect(body).not.toMatch(/"deleted_at"/)
    expect(upSource).toMatch(/ADD CONSTRAINT "reservation_movements_quantity_positive" CHECK \("quantity" > 0\)/)
  })

  it('la caducidad nunca lleva autor', () => {
    expect(upSource).toMatch(
      /ADD CONSTRAINT "reservation_movements_expire_without_author" CHECK \("kind" <> 'expire' OR "created_by" IS NULL\)/,
    )
  })

  it('las FK del pedido y del lote son compuestas con company_id, y RLS queda activada y forzada', () => {
    expect(upSource).toMatch(
      /FOREIGN KEY \("order_id", "company_id"\) REFERENCES "orders"\("id", "company_id"\)/,
    )
    expect(upSource).toMatch(
      /FOREIGN KEY \("batch_id", "company_id"\) REFERENCES "product_batches"\("id", "company_id"\)/,
    )
    expect(upSource).toMatch(/ALTER TABLE "reservation_movements" ENABLE ROW LEVEL SECURITY/)
    expect(upSource).toMatch(/ALTER TABLE "reservation_movements" FORCE ROW LEVEL SECURITY/)
    expect(upSource, 'sin ninguna policy: deny-by-default').not.toMatch(/CREATE POLICY/i)
  })

  it('inventory_movements gana order_id, y solo un asiento consumption lo lleva', () => {
    expect(upSource).toMatch(/ALTER TABLE "inventory_movements" ADD COLUMN "order_id" UUID/)
    expect(upSource).toMatch(
      /ADD CONSTRAINT "inventory_movements_order_id_matches_kind"\s+CHECK \(\("kind" = 'consumption'\) = \("order_id" IS NOT NULL\)\)/,
    )
    expect(upSource).toMatch(/"kind" IN \('opening', 'consumption'\) AND "reason" IS NULL/)
  })

  it('orders gana reserved_at y su indice parcial para el proceso diario', () => {
    expect(upSource).toMatch(/ALTER TABLE "orders" ADD COLUMN "reserved_at" TIMESTAMPTZ\(6\)/)
    expect(upSource).toMatch(
      /CREATE INDEX "orders_expirable_idx" ON "orders" \("reserved_at"\)\s+WHERE "status" = 'PENDIENTE' AND "deleted_at" IS NULL AND "reserved_at" IS NOT NULL/,
    )
  })

  it('R45: el down.sql falla con un RAISE EXCEPTION si alguna columna de existencia tiene parte decimal', () => {
    expect(downSource).toMatch(/RAISE EXCEPTION/)
    expect(downSource).toMatch(/"stock"\s*<>\s*trunc\("stock"\)/)
    expect(downSource).toMatch(/"quantity"\s*<>\s*trunc\("quantity"\)/)
    expect(downSource).toMatch(/"qty_alert"\s*<>\s*trunc\("qty_alert"\)/)
    expect(downSource).toMatch(/USING ERRCODE = '23514'/)
  })

  it('el down.sql revierte los cuatro tipos a entero y borra el libro de reservas entero', () => {
    for (const column of ['"qty_alert" TYPE INTEGER', '"stock" TYPE INTEGER', '"quantity" TYPE INTEGER']) {
      expect(downSource, `falta revertir ${column}`).toMatch(new RegExp(column.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    }
    expect(downSource).toMatch(/DROP TABLE IF EXISTS "reservation_movements"/)
    expect(downSource).toMatch(/DROP TYPE IF EXISTS "ReservationMovementKind"/)
  })

  it('R46: no nombra ninguna tabla ni columna fuera de ingles, en minusculas y snake_case', () => {
    for (const sql of [upSource, downSource]) {
      expect(sql).not.toMatch(/[áéíóúñÁÉÍÓÚÑ]/)
    }
  })
})
