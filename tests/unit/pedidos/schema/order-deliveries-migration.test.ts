// Contrato ESTATICO del SQL de `order_deliveries` y del valor de enum `delivery` que la precede.
//
// Vigila lo que Prisma no regenera: la RLS activada y forzada de las dos tablas nuevas, las FK
// compuestas con `company_id`, los CHECK que comparan `"kind"::text`, el indice parcial de un
// asiento por lote y entrega, que ninguna de las dos tablas tenga `updated_at` ni `deleted_at`, y
// que cada `down.sql` revierta su `migration.sql`.
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
    .filter((entry) => entry.isDirectory() && /^\d{14}_/.test(entry.name) && entry.name.endsWith(suffix))
    .map((entry) => entry.name)
  if (candidates.length !== 1) {
    throw new Error(`se esperaba exactamente una migracion terminada en "${suffix}"; hay ${String(candidates.length)}`)
  }
  return candidates[0] as string
}

const deliveriesName = findMigrationDir('_order_deliveries')
const enumName = findMigrationDir('_inventory_movement_kind_delivery')
const permissionName = findMigrationDir('_delivery_permission')

function stripSqlComments(sql: string): string {
  return sql
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
}

/** Sentencias ejecutables; respeta el bloque `DO $$ ... $$` como una sola sentencia. */
function statements(sql: string): readonly string[] {
  const sinComentarios = stripSqlComments(sql)
  const bloques: string[] = []
  const sinDo = sinComentarios.replace(/DO \$\$[\s\S]*?\$\$/g, (bloque) => {
    bloques.push(bloque)
    return `__DO_${String(bloques.length - 1)}__`
  })
  return sinDo
    .split(';')
    .map((statement) =>
      statement.replace(/__DO_(\d+)__/g, (_, i: string) => bloques[Number(i)] as string).replace(/\s+/g, ' ').trim(),
    )
    .filter((statement) => statement.length > 0)
}

const read = (dir: string, file: string): string => readFileSync(join(migrationsDir, dir, file), 'utf8')
const upSource = read(deliveriesName, 'migration.sql')
const downSource = read(deliveriesName, 'down.sql')
const enumUpSource = read(enumName, 'migration.sql')
const enumDownSource = read(enumName, 'down.sql')

const NEW_TABLES = ['order_deliveries', 'order_delivery_lines'] as const

// --- Predicados puros ----------------------------------------------------------------------

/** Tablas con `ENABLE` y `FORCE ROW LEVEL SECURITY`, las dos. */
export function tablesWithForcedRls(sql: string): readonly string[] {
  const sentencias = statements(sql)
  const con = (accion: string) =>
    new Set(
      sentencias
        .map((s) => new RegExp(`^ALTER TABLE "(\\w+)" ${accion} ROW LEVEL SECURITY$`, 'i').exec(s)?.[1])
        .filter((t): t is string => t !== undefined),
    )
  const enable = con('ENABLE')
  const force = con('FORCE')
  return [...enable].filter((t) => force.has(t)).sort()
}

/** Las columnas del `CREATE TABLE` de una tabla, o `null` si no esta. */
export function columnsOf(sql: string, table: string): readonly string[] | null {
  const create = statements(sql).find((s) => new RegExp(`^CREATE TABLE "${table}" \\(`, 'i').test(s))
  if (create === undefined) return null
  return [...create.matchAll(/"(\w+)" (?:UUID|INTEGER|DECIMAL|TIMESTAMPTZ|TEXT)/gi)].map((m) => m[1] as string)
}

/** Las FK declaradas sobre una tabla: nombre, columnas locales y tabla referida. */
export function foreignKeysOf(
  sql: string,
  table: string,
): readonly { name: string; columns: readonly string[]; references: string }[] {
  return statements(sql)
    .map((s) =>
      new RegExp(
        `^ALTER TABLE "${table}" ADD CONSTRAINT "(\\w+)" FOREIGN KEY \\(([^)]*)\\) REFERENCES "(\\w+)"`,
        'i',
      ).exec(s),
    )
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({
      name: m[1] as string,
      columns: (m[2] as string).split(',').map((c) => c.trim().replace(/"/g, '')),
      references: m[3] as string,
    }))
}

/** Las FK hacia filas de una empresa que NO son compuestas con `company_id`. */
export function nonCompositeTenantForeignKeys(sql: string): readonly string[] {
  const exentas = new Set(['companies', 'users'])
  return [...NEW_TABLES, 'inventory_movements']
    .flatMap((table) => foreignKeysOf(sql, table))
    .filter((fk) => !exentas.has(fk.references) && !fk.columns.includes('company_id'))
    .map((fk) => fk.name)
}

/** Los CHECK sobre `inventory_movements` que nombran "kind" sin el cast a texto. */
export function kindChecksWithoutTextCast(sql: string): readonly string[] {
  return statements(sql)
    .filter((s) => /^ALTER TABLE "inventory_movements" ADD CONSTRAINT "\w+" CHECK/i.test(s))
    .filter((s) => /"kind"(?!::text)/.test(s))
    .map((s) => /ADD CONSTRAINT "(\w+)"/.exec(s)?.[1] ?? s)
}

/** Objetos con nombre que crea un SQL: restricciones, indices, tablas y columnas. */
export function createdObjects(sql: string): readonly string[] {
  const objetos: string[] = []
  for (const s of statements(sql)) {
    const tabla = /^CREATE TABLE "(\w+)"/i.exec(s)?.[1]
    if (tabla !== undefined) objetos.push(`table:${tabla}`)
    const indice = /^CREATE (?:UNIQUE )?INDEX "(\w+)"/i.exec(s)?.[1]
    if (indice !== undefined) objetos.push(`index:${indice}`)
    const columna = /^ALTER TABLE "(\w+)" ADD COLUMN "(\w+)"/i.exec(s)
    if (columna !== null) objetos.push(`column:${columna[1] as string}.${columna[2] as string}`)
    const restriccion = /^ALTER TABLE "(\w+)" ADD CONSTRAINT "(\w+)"/i.exec(s)
    if (restriccion !== null && !NEW_TABLES.includes(restriccion[1] as (typeof NEW_TABLES)[number])) {
      objetos.push(`constraint:${restriccion[2] as string}`)
    }
  }
  return objetos
}

/** Objetos que un DOWN quita (una tabla quitada se lleva sus restricciones e indices). */
export function droppedObjects(sql: string): readonly string[] {
  const objetos: string[] = []
  for (const s of statements(sql)) {
    const tabla = /^DROP TABLE "(\w+)"/i.exec(s)?.[1]
    if (tabla !== undefined) objetos.push(`table:${tabla}`)
    const indice = /^DROP INDEX "(\w+)"/i.exec(s)?.[1]
    if (indice !== undefined) objetos.push(`index:${indice}`)
    const columna = /^ALTER TABLE "(\w+)" DROP COLUMN "(\w+)"/i.exec(s)
    if (columna !== null) objetos.push(`column:${columna[1] as string}.${columna[2] as string}`)
    const restriccion = /^ALTER TABLE "\w+" DROP CONSTRAINT "(\w+)"/i.exec(s)?.[1]
    if (restriccion !== undefined) objetos.push(`constraint:${restriccion}`)
  }
  return objetos
}

/** Objetos que crea el UP y que el DOWN no quita (los de las tablas nuevas van con su DROP TABLE). */
export function objectsNotReverted(up: string, down: string): readonly string[] {
  const quitados = new Set(droppedObjects(down))
  const indicesDeTablasNuevas = new Set(
    statements(up)
      .map((s) => /^CREATE (?:UNIQUE )?INDEX "(\w+)" ON "(\w+)"/i.exec(s))
      .filter((m): m is RegExpExecArray => m !== null && NEW_TABLES.includes(m[2] as (typeof NEW_TABLES)[number]))
      .map((m) => `index:${m[1] as string}`),
  )
  return createdObjects(up).filter((o) => !quitados.has(o) && !indicesDeTablasNuevas.has(o))
}

/** ¿Las tablas nuevas caen en orden inverso (las lineas antes que la entrega) y sin CASCADE? */
export function downDropsTablesInReverseOrder(sql: string): boolean {
  if (/CASCADE/i.test(stripSqlComments(sql))) return false
  const drops = statements(sql)
    .map((s) => /^DROP TABLE "(\w+)"$/i.exec(s)?.[1])
    .filter((t): t is string => t !== undefined)
  return drops.join(',') === 'order_delivery_lines,order_deliveries'
}

/** El texto de un CHECK que el DOWN repone sobre `inventory_movements`, normalizado. */
export function restoredCheck(sql: string, name: string): string | undefined {
  return statements(sql)
    .find((s) => new RegExp(`^ALTER TABLE "inventory_movements" ADD CONSTRAINT "${name}" CHECK`, 'i').test(s))
    ?.replace(/\s+/g, '')
}

/** ¿El DOWN del enum aborta con RAISE EXCEPTION si hay asientos delivery, ANTES de tocar el tipo? */
export function enumDownGuardsDeliveryRows(sql: string): boolean {
  const sentencias = statements(sql)
  const guarda = sentencias.findIndex(
    (s) =>
      /^DO \$\$/i.test(s) &&
      /IF EXISTS \(SELECT 1 FROM "inventory_movements" WHERE "kind"(::text)? = 'delivery'\)/i.test(s) &&
      /RAISE EXCEPTION/i.test(s),
  )
  const renombre = sentencias.findIndex((s) => /^ALTER TYPE "InventoryMovementKind" RENAME TO/i.test(s))
  return guarda >= 0 && renombre > guarda
}

// --- La migracion de enum -------------------------------------------------------------------

describe('inventory_movement_kind_delivery', () => {
  it('va antes que order_deliveries y que el permiso, en orden de timestamp', () => {
    expect([enumName, deliveriesName, permissionName].slice().sort()).toEqual([enumName, deliveriesName, permissionName])
  })

  it('R24: el UP solo anade el valor delivery al tipo', () => {
    expect(statements(enumUpSource)).toEqual([`ALTER TYPE "InventoryMovementKind" ADD VALUE 'delivery'`])
  })

  it('R24: el DOWN aborta si hay asientos delivery antes de recrear el tipo, y cae sin la guarda', () => {
    expect(enumDownGuardsDeliveryRows(enumDownSource)).toBe(true)

    const sinGuarda = enumDownSource.replace(/DO \$\$[\s\S]*?\$\$;/, '')
    expect(sinGuarda, 'la mutacion no quito la guarda').not.toBe(enumDownSource)
    expect(enumDownGuardsDeliveryRows(sinGuarda)).toBe(false)
  })

  it('R24: el DOWN recrea el tipo con los cuatro valores previos, en su orden', () => {
    expect(statements(enumDownSource)).toContain(
      `CREATE TYPE "InventoryMovementKind" AS ENUM ('opening', 'adjustment', 'consumption', 'production')`,
    )
  })
})

// --- order_deliveries: forma ----------------------------------------------------------------

describe('order_deliveries migration.sql', () => {
  it('R31: las dos tablas nuevas nacen con RLS ENABLE y FORCE, y cae si falta el FORCE', () => {
    expect(tablesWithForcedRls(upSource)).toEqual([...NEW_TABLES].sort())

    const sinForce = upSource.replace(/ALTER TABLE "order_delivery_lines"\s+FORCE\s+ROW LEVEL SECURITY;/, '')
    expect(sinForce, 'la mutacion no quito el FORCE').not.toBe(upSource)
    expect(tablesWithForcedRls(sinForce)).toEqual(['order_deliveries'])
  })

  it('R32: ninguna de las dos tablas tiene updated_at ni deleted_at', () => {
    for (const table of NEW_TABLES) {
      const columnas = columnsOf(upSource, table)
      expect(columnas, table).not.toBeNull()
      expect(columnas).toContain('company_id')
      expect(columnas).not.toContain('updated_at')
      expect(columnas).not.toContain('deleted_at')
    }
    const conUpdatedAt = upSource.replace(
      `"created_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,`,
      `"created_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  "updated_at" TIMESTAMPTZ(6) NOT NULL,`,
    )
    expect(conUpdatedAt, 'la mutacion no anadio updated_at').not.toBe(upSource)
    expect(columnsOf(conUpdatedAt, 'order_deliveries')).toContain('updated_at')
  })

  it('R31: toda FK hacia una fila de empresa es compuesta con company_id, y cae si una deja de serlo', () => {
    expect(nonCompositeTenantForeignKeys(upSource)).toEqual([])
    const nombres = [...NEW_TABLES, 'inventory_movements'].flatMap((t) => foreignKeysOf(upSource, t).map((fk) => fk.name))
    expect(nombres.sort()).toEqual(
      [
        'inventory_movements_order_delivery_id_fkey',
        'order_deliveries_company_id_fkey',
        'order_deliveries_created_by_fkey',
        'order_deliveries_customer_id_fkey',
        'order_deliveries_order_id_fkey',
        'order_delivery_lines_batch_id_fkey',
        'order_delivery_lines_delivery_id_fkey',
        'order_delivery_lines_presentation_line_id_fkey',
      ].sort(),
    )

    const loteSimple = upSource.replace(
      `FOREIGN KEY ("batch_id", "company_id") REFERENCES "product_batches"("id", "company_id")`,
      `FOREIGN KEY ("batch_id") REFERENCES "product_batches"("id")`,
    )
    expect(loteSimple, 'la mutacion no simplifico la FK del lote').not.toBe(upSource)
    expect(nonCompositeTenantForeignKeys(loteSimple)).toEqual(['order_delivery_lines_batch_id_fkey'])
  })

  it('R31: el cliente va contra la clave (company_id, id) de customers', () => {
    expect(statements(upSource)).toContain(
      `ALTER TABLE "order_deliveries" ADD CONSTRAINT "order_deliveries_customer_id_fkey" FOREIGN KEY ("company_id", "customer_id") REFERENCES "customers"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    )
  })

  // QC-223 2026-10-08: decision del humano, la FK del autor pasa a ser compuesta con company_id.
  it('R31: el autor va contra la clave (id, company_id) de users, y la FK simple ya no esta', () => {
    const sentencias = statements(upSource)
    expect(sentencias).toContain(
      `ALTER TABLE "order_deliveries" ADD CONSTRAINT "order_deliveries_created_by_fkey" FOREIGN KEY ("created_by", "company_id") REFERENCES "users"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    )
    expect(sentencias.some((s) => s.includes(`FOREIGN KEY ("created_by") REFERENCES "users"("id")`))).toBe(false)
  })

  it('R31: los CHECK de inventory_movements comparan "kind"::text, y cae si uno usa el literal del tipo', () => {
    expect(kindChecksWithoutTextCast(upSource)).toEqual([])

    const sinCast = upSource.replace(
      `CHECK ("kind"::text <> 'delivery' OR "quantity" < 0)`,
      `CHECK ("kind" <> 'delivery' OR "quantity" < 0)`,
    )
    expect(sinCast, 'la mutacion no quito el cast').not.toBe(upSource)
    expect(kindChecksWithoutTextCast(sinCast)).toEqual(['inventory_movements_delivery_quantity_negative'])
  })

  it('R24, R31: delivery entra en los CHECK de order_id y reason, la cantidad es negativa y hay un asiento por lote y entrega', () => {
    const s = statements(upSource)
    expect(s).toContain(
      `ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_order_id_matches_kind" CHECK (("kind"::text IN ('consumption', 'production', 'delivery')) = ("order_id" IS NOT NULL))`,
    )
    expect(s).toContain(
      `ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_reason_matches_kind" CHECK (("kind"::text = 'adjustment' AND "reason" IS NOT NULL) OR ("kind"::text IN ('opening', 'consumption', 'production', 'delivery') AND "reason" IS NULL))`,
    )
    expect(s).toContain(
      `ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_order_delivery_id_matches_kind" CHECK (("kind"::text = 'delivery') = ("order_delivery_id" IS NOT NULL))`,
    )
    expect(s).toContain(
      `ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_delivery_quantity_negative" CHECK ("kind"::text <> 'delivery' OR "quantity" < 0)`,
    )
    expect(s).toContain(
      `CREATE UNIQUE INDEX "inventory_movements_one_delivery_per_batch" ON "inventory_movements" ("order_delivery_id", "batch_id") WHERE "order_delivery_id" IS NOT NULL`,
    )
  })

  it('R29: la clave de idempotencia es unica por empresa', () => {
    expect(statements(upSource)).toContain(
      `ALTER TABLE "order_deliveries" ADD CONSTRAINT "order_deliveries_company_key_unique" UNIQUE ("company_id", "delivery_key")`,
    )
  })
})

// --- order_deliveries: el DOWN --------------------------------------------------------------

describe('order_deliveries down.sql', () => {
  it('quita cada objeto que crea el UP, y cae si falta uno', () => {
    expect(objectsNotReverted(upSource, downSource)).toEqual([])

    const sinIndice = downSource.replace(`DROP INDEX "inventory_movements_order_delivery_id_idx";`, '')
    expect(sinIndice, 'la mutacion no quito el DROP INDEX').not.toBe(downSource)
    expect(objectsNotReverted(upSource, sinIndice)).toEqual(['index:inventory_movements_order_delivery_id_idx'])
  })

  it('las tablas caen en orden inverso y sin CASCADE', () => {
    expect(downDropsTablesInReverseOrder(downSource)).toBe(true)

    const invertido = downSource
      .replace('DROP TABLE "order_delivery_lines";', '__X__')
      .replace('DROP TABLE "order_deliveries";', 'DROP TABLE "order_delivery_lines";')
      .replace('__X__', 'DROP TABLE "order_deliveries";')
    expect(downDropsTablesInReverseOrder(invertido)).toBe(false)
  })

  it('repone los dos CHECK reescritos con su texto previo, sin delivery', () => {
    expect(restoredCheck(downSource, 'inventory_movements_order_id_matches_kind')).toBe(
      `ALTERTABLE"inventory_movements"ADDCONSTRAINT"inventory_movements_order_id_matches_kind"CHECK(("kind"IN('consumption','production'))=("order_id"ISNOTNULL))`,
    )
    expect(restoredCheck(downSource, 'inventory_movements_reason_matches_kind')).toBe(
      `ALTERTABLE"inventory_movements"ADDCONSTRAINT"inventory_movements_reason_matches_kind"CHECK(("kind"='adjustment'AND"reason"ISNOTNULL)OR("kind"IN('opening','consumption','production')AND"reason"ISNULL))`,
    )
  })
})
