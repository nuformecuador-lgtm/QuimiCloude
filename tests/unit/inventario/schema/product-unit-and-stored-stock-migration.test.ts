// Contrato ESTATICO del SQL de `*_product_unit_and_stored_stock`. Mismo patron que los hermanos
// de esta carpeta: cada afirmacion es un predicado puro exportado, aplicado al texto real y a una
// copia mutada EN MEMORIA. El archivo en disco nunca se toca.

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

const dirs = readdirSync(migrationsDir).filter((name) => name.endsWith('_product_unit_and_stored_stock'))
expect(dirs, 'debe existir exactamente una migracion *_product_unit_and_stored_stock').toHaveLength(1)
const migrationName = dirs[0] as string
const migrationDir = join(migrationsDir, migrationName)

const upSource = readFileSync(join(migrationDir, 'migration.sql'), 'utf8')
const downSource = readFileSync(join(migrationDir, 'down.sql'), 'utf8')

/** Lo que se afirma es SQL ejecutable, no prosa. */
export function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
}

export function statements(sql: string): readonly string[] {
  return stripSqlComments(sql)
    .split(';')
    .map((statement) => statement.replace(/\s+/g, ' ').trim())
    .filter((statement) => statement.length > 0)
}

// --- El parentesis de RLS sobre las tres tablas -----------------------------------------------

export function releasesAndRestoresForce(sql: string, table: string): boolean {
  const source = statements(sql)
  const suelta = new RegExp(`^ALTER TABLE "?${table}"? NO FORCE ROW LEVEL SECURITY$`, 'i')
  const enable = new RegExp(`^ALTER TABLE "?${table}"? ENABLE ROW LEVEL SECURITY$`, 'i')
  const force = new RegExp(`^ALTER TABLE "?${table}"? FORCE ?ROW LEVEL SECURITY$`, 'i')
  return (
    source.some((statement) => suelta.test(statement)) &&
    source.some((statement) => enable.test(statement)) &&
    source.some((statement) => force.test(statement))
  )
}

/** ¿Las TRES tablas -products, product_batches, presentations- sueltan y restituyen el FORCE? */
export function releasesAndRestoresForceOfTheThreeTables(sql: string): boolean {
  return ['products', 'product_batches', 'presentations'].every((table) => releasesAndRestoresForce(sql, table))
}

export function createsNoPolicy(sql: string): boolean {
  return !/CREATE\s+POLICY/i.test(stripSqlComments(sql))
}

// --- El relleno: unidad del lote mas reciente, existencia sumada, sin RAISE por mezcla --------

/** El primer bloque de sentencias `UPDATE "products"` seguido de su `FROM (...)`. */
function backfillUpdates(sql: string): readonly string[] {
  return statements(sql).filter((statement) => /^UPDATE "?products"?/i.test(statement))
}

/**
 * ¿El relleno de unidad toma la del LOTE MAS RECIENTE -desempate por id descendente- via
 * `DISTINCT ON`, sin ningun `RAISE EXCEPTION` por lotes que mezclen unidad?
 */
export function backfillsUnitFromLatestBatchWithoutMismatchCheck(sql: string): boolean {
  const updates = backfillUpdates(sql)
  const unitUpdate = updates.find((statement) => /SET "?unit_id"?\s*=/i.test(statement))
  if (unitUpdate === undefined) return false
  const distinctOnProduct = /DISTINCT ON\s*\(\s*b\."?product_id"?\s*\)/i.test(unitUpdate)
  const ordenaPorFechaYId = /ORDER BY[\s\S]*"?created_at"?\s+DESC[\s\S]*"?id"?\s+DESC/i.test(unitUpdate)
  const sinRaise = !/RAISE\s+EXCEPTION/i.test(unitUpdate)
  return distinctOnProduct && ordenaPorFechaYId && sinRaise
}

/** ¿El relleno de existencia suma TODOS los lotes del producto, con `COALESCE(..., 0)`? */
export function backfillsStockAsSumOfBatches(sql: string): boolean {
  const updates = backfillUpdates(sql)
  const stockUpdate = updates.find((statement) => /SET "?stock"?\s*=/i.test(statement))
  if (stockUpdate === undefined) return false
  const suma = /COALESCE\s*\(\s*SUM\s*\(\s*b\."?stock"?\s*\)\s*,\s*0\s*\)/i.test(stockUpdate)
  const agrupaPorProducto = /GROUP BY\s*b\."?product_id"?/i.test(stockUpdate)
  return suma && agrupaPorProducto
}

/** ¿El archivo entero no contiene NINGUN `RAISE EXCEPTION` sobre lotes mezclando unidad? */
export function backfillNeverAbortsOnMixedUnits(sql: string): boolean {
  const text = stripSqlComments(sql)
  return !/mezcl/i.test(text) && !/DISTINCT.*unit_id.*>\s*1/i.test(text)
}

// --- Ningun disparador escribe stock: mantenerlo es responsabilidad de la aplicacion ----------

/** El cuerpo de cada `CREATE OR REPLACE FUNCTION` del archivo. */
function functionBodies(sql: string): readonly string[] {
  const text = stripSqlComments(sql)
  return [...text.matchAll(/CREATE (?:OR REPLACE )?FUNCTION[\s\S]*?LANGUAGE plpgsql/gi)].map((match) => match[0])
}

/** ¿Ningun disparador de esta migracion escribe la columna `stock`? */
export function noTriggerWritesStock(sql: string): boolean {
  const bodies = functionBodies(sql)
  if (bodies.length === 0) return false
  return bodies.every((body) => !/UPDATE\s+"?products"?[\s\S]*?SET[\s\S]*?"?stock"?\s*=/i.test(body))
}

// --- El down.sql revierte cada objeto que crea el up -------------------------------------------

type CreatedObjects = {
  readonly columns: readonly string[]
  readonly checks: readonly string[]
  readonly foreignKeys: readonly string[]
  readonly indexes: readonly string[]
  readonly functions: readonly string[]
  readonly triggers: readonly string[]
}

export function objectsCreatedByUp(sql: string): CreatedObjects {
  const text = stripSqlComments(sql)
  return {
    columns: [...text.matchAll(/ADD COLUMN "(\w+)"/gi)].map((m) => m[1] as string),
    checks: [...text.matchAll(/ADD CONSTRAINT "(\w+)"\s+CHECK/gi)].map((m) => m[1] as string),
    foreignKeys: [...text.matchAll(/ADD CONSTRAINT "(\w+)"\s+FOREIGN KEY/gi)].map((m) => m[1] as string),
    indexes: [...text.matchAll(/CREATE (?:UNIQUE )?INDEX "(\w+)"/gi)].map((m) => m[1] as string),
    functions: [...text.matchAll(/CREATE (?:OR REPLACE )?FUNCTION (\w+)\(/gi)].map((m) => m[1] as string),
    triggers: [...text.matchAll(/CREATE TRIGGER "(\w+)"/gi)].map((m) => m[1] as string),
  }
}

export function objectsDroppedByDown(sql: string): CreatedObjects {
  const text = stripSqlComments(sql)
  const droppedConstraints = [...text.matchAll(/DROP CONSTRAINT (?:IF EXISTS )?"(\w+)"/gi)].map((m) => m[1] as string)
  return {
    columns: [...text.matchAll(/DROP COLUMN (?:IF EXISTS )?"(\w+)"/gi)].map((m) => m[1] as string),
    checks: droppedConstraints.filter((name) => !name.endsWith('_fkey')),
    foreignKeys: droppedConstraints.filter((name) => name.endsWith('_fkey')),
    indexes: [...text.matchAll(/DROP INDEX (?:IF EXISTS )?"(\w+)"/gi)].map((m) => m[1] as string),
    functions: [...text.matchAll(/DROP FUNCTION (?:IF EXISTS )?(\w+)\(/gi)].map((m) => m[1] as string),
    triggers: [...text.matchAll(/DROP TRIGGER (?:IF EXISTS )?"(\w+)"/gi)].map((m) => m[1] as string),
  }
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length > 0 && a.length === b.length && [...a].sort().join(',') === [...b].sort().join(',')
}

export function downRevertsEveryObjectCreatedByUp(upSql: string, downSql: string): boolean {
  const created = objectsCreatedByUp(upSql)
  const dropped = objectsDroppedByDown(downSql)
  return (
    sameSet(created.columns, dropped.columns) &&
    sameSet(created.checks, dropped.checks) &&
    sameSet(created.foreignKeys, dropped.foreignKeys) &&
    sameSet(created.indexes, dropped.indexes) &&
    sameSet(created.functions, dropped.functions) &&
    sameSet(created.triggers, dropped.triggers) &&
    created.columns.length === 2 &&
    created.checks.length === 1 &&
    created.foreignKeys.length === 1 &&
    created.indexes.length === 2 &&
    created.functions.length === 2 &&
    created.triggers.length === 2
  )
}

// --- El down.sql no nombra el libro de movimientos, y el timestamp va despues de sus migraciones

export function downNeverNamesTheLedger(sql: string): boolean {
  return !/inventory_movements/i.test(sql) && !/InventoryMovementKind/i.test(sql)
}

export function migrationTimestampIsAfter(name: string, floor: string): boolean {
  const match = /^(\d{14})_/.exec(name)
  if (match === null) return false
  return (match[1] as string) > floor
}

// --- Casos ---------------------------------------------------------------------------------

describe('QC-121 migration.sql — el parentesis de RLS sobre las tres tablas', () => {
  it('products, product_batches y presentations sueltan y restituyen el FORCE, y no crea ninguna policy', () => {
    expect(releasesAndRestoresForceOfTheThreeTables(upSource)).toBe(true)
    expect(createsNoPolicy(upSource)).toBe(true)
    expect(createsNoPolicy(downSource)).toBe(true)

    for (const table of ['products', 'product_batches', 'presentations']) {
      const sinSoltar = upSource.replace(
        new RegExp(`ALTER TABLE "${table}"\\s+NO FORCE ROW LEVEL SECURITY;\\n?`),
        '',
      )
      expect(sinSoltar, `la mutacion no quito el NO FORCE de ${table}`).not.toBe(upSource)
      expect(releasesAndRestoresForceOfTheThreeTables(sinSoltar), `sin soltar ${table}`).toBe(false)
    }

    const conPolicy = `${upSource}\nCREATE POLICY "todo" ON "products" USING (true);\n`
    expect(createsNoPolicy(conPolicy)).toBe(false)
  })
})

describe('QC-121 migration.sql — R23: el relleno', () => {
  it('la unidad viene del lote mas reciente y la existencia es la suma de todos, sin abortar por mezcla', () => {
    expect(backfillsUnitFromLatestBatchWithoutMismatchCheck(upSource)).toBe(true)
    expect(backfillsStockAsSumOfBatches(upSource)).toBe(true)
    expect(backfillNeverAbortsOnMixedUnits(upSource)).toBe(true)

    // Sensibilidad: sin el desempate por id descendente, dos lotes del mismo instante serian
    // ambiguos.
    const sinDesempate = upSource.replace('b."created_at" DESC, b."id" DESC', 'b."created_at" DESC')
    expect(sinDesempate).not.toBe(upSource)
    expect(backfillsUnitFromLatestBatchWithoutMismatchCheck(sinDesempate)).toBe(false)

    // Sensibilidad: sin el COALESCE, un producto sin lotes en el JOIN quedaria en NULL en vez de 0.
    const sinCoalesce = upSource.replace('COALESCE(SUM(b."stock"), 0)', 'SUM(b."stock")')
    expect(sinCoalesce).not.toBe(upSource)
    expect(backfillsStockAsSumOfBatches(sinCoalesce)).toBe(false)

    // Sensibilidad: un RAISE EXCEPTION por mezcla fabricado en el UPDATE de unidad tiene que
    // tumbar el detector "sin RAISE por mezcla".
    const conAborto = upSource.replace(
      'WHERE p."id" = latest."product_id";',
      "WHERE p.\"id\" = latest.\"product_id\" AND (RAISE EXCEPTION 'mezcla de unidades');",
    )
    expect(conAborto).not.toBe(upSource)
    expect(backfillsUnitFromLatestBatchWithoutMismatchCheck(conAborto)).toBe(false)
  })
})

describe('QC-121 migration.sql — R12: la existencia la mantiene la aplicacion, no un disparador', () => {
  it('ninguna funcion de la migracion escribe products.stock', () => {
    expect(noTriggerWritesStock(upSource)).toBe(true)

    // Autoprueba de vacuidad: sin ninguna funcion, no puede dar verde.
    expect(noTriggerWritesStock('SELECT 1;')).toBe(false)

    // Sensibilidad: una funcion fabricada que si escribe stock tiene que caer.
    const conEscrituraDeStock = upSource.replace(
      'END;\n$product_batches_check_unit$ LANGUAGE plpgsql;',
      'UPDATE "products" SET "stock" = 0 WHERE "id" = NEW."product_id";\n  END;\n$product_batches_check_unit$ LANGUAGE plpgsql;',
    )
    expect(conEscrituraDeStock, 'la mutacion no anadio la escritura de stock').not.toBe(upSource)
    expect(noTriggerWritesStock(conEscrituraDeStock)).toBe(false)
  })
})

describe('QC-121 down.sql — revierte exactamente lo que crea el up', () => {
  it('las 2 columnas, el CHECK, la FK, los 2 indices, las 2 funciones y los 2 disparadores tienen su reversion', () => {
    expect(downRevertsEveryObjectCreatedByUp(upSource, downSource)).toBe(true)

    const created = objectsCreatedByUp(upSource)
    expect([...created.columns].sort()).toEqual(['stock', 'unit_id'].sort())
    expect(created.checks).toEqual(['products_stock_non_negative'])
    expect(created.foreignKeys).toEqual(['products_unit_id_fkey'])
    expect([...created.indexes].sort()).toEqual(['products_stock_idx', 'products_unit_id_idx'].sort())
    expect([...created.functions].sort()).toEqual(
      ['product_batches_check_unit', 'presentations_check_unit_locked'].sort(),
    )
    expect([...created.triggers].sort()).toEqual(
      ['product_batches_check_unit_trigger', 'presentations_check_unit_locked_trigger'].sort(),
    )

    // Sensibilidad: si al down se le olvida una columna, la correspondencia cae.
    const sinUnaColumna = downSource.replace('ALTER TABLE "products" DROP COLUMN IF EXISTS "stock";\n', '')
    expect(sinUnaColumna, 'la mutacion no quito el DROP de la columna').not.toBe(downSource)
    expect(downRevertsEveryObjectCreatedByUp(upSource, sinUnaColumna)).toBe(false)

    // Sensibilidad: si le falta un disparador o su funcion.
    const sinDisparador = downSource.replace(
      'DROP TRIGGER IF EXISTS "presentations_check_unit_locked_trigger" ON "presentations";\n',
      '',
    )
    expect(sinDisparador).not.toBe(downSource)
    expect(downRevertsEveryObjectCreatedByUp(upSource, sinDisparador)).toBe(false)

    const sinFuncion = downSource.replace('DROP FUNCTION IF EXISTS presentations_check_unit_locked();\n', '')
    expect(sinFuncion).not.toBe(downSource)
    expect(downRevertsEveryObjectCreatedByUp(upSource, sinFuncion)).toBe(false)
  })
})

describe('QC-121 down.sql — R33: el libro de movimientos queda intacto', () => {
  it('el down no nombra inventory_movements ni su enum, y el timestamp va despues de las dos migraciones del libro', () => {
    expect(downNeverNamesTheLedger(downSource)).toBe(true)
    expect(migrationTimestampIsAfter(migrationName, '20260918120000')).toBe(true)

    // Sensibilidad: nombrar el libro por accidente tiene que caer.
    const conLibro = `${downSource}\n-- ver inventory_movements`
    expect(conLibro).not.toBe(downSource)
    expect(downNeverNamesTheLedger(conLibro)).toBe(false)

    expect(migrationTimestampIsAfter('20260918110000_otra_cosa', '20260918120000')).toBe(false)
  })
})
