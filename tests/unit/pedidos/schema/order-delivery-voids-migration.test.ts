// Contrato ESTATICO del SQL de `order_delivery_voids` y del valor de enum `delivery_void` que la
// precede.
//
// Vigila lo que Prisma no regenera: la RLS activada y forzada de las dos tablas nuevas, las FK
// compuestas, los CHECK que comparan `"kind"::text`, el indice parcial de un asiento por lote y
// anulacion, que ninguna de las dos tablas tenga `updated_at` ni `deleted_at`, que cada `down.sql`
// revierta su `migration.sql` y que los nombres nuevos esten en ingles.
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

const voidsName = findMigrationDir('_order_delivery_voids')
const enumName = findMigrationDir('_inventory_movement_kind_delivery_void')
const permissionName = findMigrationDir('_delivery_void_permission')
const deliveriesName = findMigrationDir('_order_deliveries')

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
const upSource = read(voidsName, 'migration.sql')
const downSource = read(voidsName, 'down.sql')
const enumUpSource = read(enumName, 'migration.sql')
const enumDownSource = read(enumName, 'down.sql')
const deliveriesUpSource = read(deliveriesName, 'migration.sql')

const NEW_TABLES = ['order_delivery_voids', 'order_delivery_void_lines'] as const

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

/** Las FK declaradas sobre una tabla: nombre, columnas locales, tabla y columnas referidas. */
export function foreignKeysOf(
  sql: string,
  table: string,
): readonly { name: string; columns: readonly string[]; references: string; referencedColumns: readonly string[] }[] {
  const lista = (texto: string) => texto.split(',').map((c) => c.trim().replace(/"/g, ''))
  return statements(sql)
    .map((s) =>
      new RegExp(
        `^ALTER TABLE "${table}" ADD CONSTRAINT "(\\w+)" FOREIGN KEY \\(([^)]*)\\) REFERENCES "(\\w+)"\\(([^)]*)\\)`,
        'i',
      ).exec(s),
    )
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({
      name: m[1] as string,
      columns: lista(m[2] as string),
      references: m[3] as string,
      referencedColumns: lista(m[4] as string),
    }))
}

/**
 * Las FK hacia filas de una empresa que NO son compuestas. Compuesta = con `company_id`, o con
 * `delivery_id` cuando ata la linea anulada a la entrega anulada (la empresa la cubre otra FK).
 */
export function nonCompositeTenantForeignKeys(sql: string): readonly string[] {
  const exentas = new Set(['companies'])
  return [...NEW_TABLES, 'inventory_movements']
    .flatMap((table) => foreignKeysOf(sql, table))
    .filter((fk) => !exentas.has(fk.references) && fk.columns.length < 2)
    .map((fk) => fk.name)
}

/** Los CHECK sobre `inventory_movements` que nombran "kind" sin el cast a texto. */
export function kindChecksWithoutTextCast(sql: string): readonly string[] {
  return statements(sql)
    .filter((s) => /^ALTER TABLE "inventory_movements" ADD CONSTRAINT "\w+" CHECK/i.test(s))
    .filter((s) => /"kind"(?!::text)/.test(s))
    .map((s) => /ADD CONSTRAINT "(\w+)"/.exec(s)?.[1] ?? s)
}

/** Indices parciales cuyo predicado usa el cast de "kind", que Postgres rechaza (42P17). */
export function partialIndexesOnKindCast(sql: string): readonly string[] {
  return statements(sql)
    .filter((s) => /^CREATE (?:UNIQUE )?INDEX "\w+" ON .* WHERE /i.test(s))
    .filter((s) => /WHERE .*"kind"::text/i.test(s))
    .map((s) => /INDEX "(\w+)"/.exec(s)?.[1] ?? s)
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

/** ¿Las tablas nuevas caen en orden inverso (las lineas antes que la anulacion) y sin CASCADE? */
export function downDropsTablesInReverseOrder(sql: string): boolean {
  if (/CASCADE/i.test(stripSqlComments(sql))) return false
  const drops = statements(sql)
    .map((s) => /^DROP TABLE "(\w+)"$/i.exec(s)?.[1])
    .filter((t): t is string => t !== undefined)
  return drops.join(',') === 'order_delivery_void_lines,order_delivery_voids'
}

/** El texto de un CHECK sobre `inventory_movements`, normalizado sin espacios. */
export function checkText(sql: string, name: string): string | undefined {
  return statements(sql)
    .find((s) => new RegExp(`^ALTER TABLE "inventory_movements" ADD CONSTRAINT "${name}" CHECK`, 'i').test(s))
    ?.replace(/\s+/g, '')
}

/** ¿El DOWN del enum aborta con RAISE EXCEPTION si hay asientos delivery_void, ANTES de tocar el tipo? */
export function enumDownGuardsVoidRows(sql: string): boolean {
  const sentencias = statements(sql)
  const guarda = sentencias.findIndex(
    (s) =>
      /^DO \$\$/i.test(s) &&
      /IF EXISTS \(SELECT 1 FROM "inventory_movements" WHERE "kind"(::text)? = 'delivery_void'\)/i.test(s) &&
      /RAISE EXCEPTION/i.test(s),
  )
  const renombre = sentencias.findIndex((s) => /^ALTER TYPE "InventoryMovementKind" RENAME TO/i.test(s))
  return guarda >= 0 && renombre > guarda
}

/** Identificadores nuevos: tablas, columnas de las tablas nuevas, columnas anadidas y valores de enum. */
export function newIdentifiers(up: string, enumUp: string): readonly string[] {
  const nombres = new Set<string>()
  for (const s of statements(up)) {
    const tabla = /^CREATE TABLE "(\w+)"/i.exec(s)?.[1]
    if (tabla !== undefined) {
      nombres.add(tabla)
      for (const columna of columnsOf(up, tabla) ?? []) nombres.add(columna)
    }
    const columna = /^ALTER TABLE "\w+" ADD COLUMN "(\w+)"/i.exec(s)?.[1]
    if (columna !== undefined) nombres.add(columna)
  }
  for (const s of statements(enumUp)) {
    const valor = /^ALTER TYPE "\w+" ADD VALUE '(\w+)'$/i.exec(s)?.[1]
    if (valor !== undefined) nombres.add(valor)
  }
  return [...nombres].sort()
}

/**
 * Vocabulario ingles admitido para los identificadores nuevos. Cada identificador se parte por `_`
 * y cada pieza tiene que estar aqui: un patron `^[a-z_]+$` no distinguiria el idioma.
 */
const VOCABULARIO_INGLES = new Set([
  'at',
  'by',
  'company',
  'created',
  'delivery',
  'id',
  'key',
  'line',
  'lines',
  'order',
  'reason',
  'void',
  'voids',
])

export function nonEnglishIdentifiers(identifiers: readonly string[]): readonly string[] {
  return identifiers.filter(
    (nombre) => !/^[a-z_]+$/.test(nombre) || nombre.split('_').some((pieza) => !VOCABULARIO_INGLES.has(pieza)),
  )
}

// --- La migracion de enum -------------------------------------------------------------------

describe('inventory_movement_kind_delivery_void', () => {
  it('va detras de order_deliveries, y antes que order_delivery_voids y que el permiso', () => {
    const orden = [deliveriesName, enumName, voidsName, permissionName]
    expect(orden.slice().sort()).toEqual(orden)
  })

  it('R24: el UP solo anade el valor delivery_void al tipo', () => {
    expect(statements(enumUpSource)).toEqual([`ALTER TYPE "InventoryMovementKind" ADD VALUE 'delivery_void'`])
  })

  it('R24: el DOWN aborta si hay asientos delivery_void antes de recrear el tipo, y cae sin la guarda', () => {
    expect(enumDownGuardsVoidRows(enumDownSource)).toBe(true)

    const sinGuarda = enumDownSource.replace(/DO \$\$[\s\S]*?\$\$;/, '')
    expect(sinGuarda, 'la mutacion no quito la guarda').not.toBe(enumDownSource)
    expect(enumDownGuardsVoidRows(sinGuarda)).toBe(false)
  })

  it('R24: el DOWN recrea el tipo con los cinco valores previos, en su orden', () => {
    expect(statements(enumDownSource)).toContain(
      `CREATE TYPE "InventoryMovementKind" AS ENUM ('opening', 'adjustment', 'consumption', 'production', 'delivery')`,
    )
  })

  it('R24: el DOWN repone exactamente los CHECK y el indice que suelta', () => {
    const soltados = droppedObjects(enumDownSource).filter((o) => !o.startsWith('column:'))
    const repuestos = createdObjects(enumDownSource).filter((o) => o.startsWith('constraint:') || o.startsWith('index:'))
    expect(soltados.slice().sort()).toEqual(repuestos.slice().sort())
    expect(soltados.length).toBeGreaterThan(0)
  })
})

// --- order_delivery_voids: forma ------------------------------------------------------------

describe('order_delivery_voids migration.sql', () => {
  it('R32: las dos tablas nuevas nacen con RLS ENABLE y FORCE, y cae si falta el FORCE', () => {
    expect(tablesWithForcedRls(upSource)).toEqual([...NEW_TABLES].sort())

    const sinForce = upSource.replace(/ALTER TABLE "order_delivery_void_lines"\s+FORCE\s+ROW LEVEL SECURITY;/, '')
    expect(sinForce, 'la mutacion no quito el FORCE').not.toBe(upSource)
    expect(tablesWithForcedRls(sinForce)).toEqual(['order_delivery_voids'])
  })

  it('R33: ninguna de las dos tablas tiene updated_at ni deleted_at', () => {
    for (const table of NEW_TABLES) {
      const columnas = columnsOf(upSource, table)
      expect(columnas, table).not.toBeNull()
      expect(columnas).toContain('company_id')
      expect(columnas).not.toContain('updated_at')
      expect(columnas).not.toContain('deleted_at')
    }
    const conDeletedAt = upSource.replace(
      `"created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,`,
      `"created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  "deleted_at" TIMESTAMPTZ(6),`,
    )
    expect(conDeletedAt, 'la mutacion no anadio deleted_at').not.toBe(upSource)
    expect(columnsOf(conDeletedAt, 'order_delivery_voids')).toContain('deleted_at')
  })

  it('R32: toda FK hacia una fila de empresa es compuesta, y cae si una deja de serlo', () => {
    expect(nonCompositeTenantForeignKeys(upSource)).toEqual([])
    const nombres = [...NEW_TABLES, 'inventory_movements'].flatMap((t) => foreignKeysOf(upSource, t).map((fk) => fk.name))
    expect(nombres.sort()).toEqual(
      [
        'inventory_movements_order_delivery_void_id_fkey',
        'order_delivery_void_lines_delivery_line_fkey',
        'order_delivery_void_lines_void_company_fkey',
        'order_delivery_void_lines_void_fkey',
        'order_delivery_voids_company_id_fkey',
        'order_delivery_voids_created_by_fkey',
        'order_delivery_voids_delivery_id_fkey',
      ].sort(),
    )

    const entregaSimple = upSource.replace(
      `FOREIGN KEY ("delivery_id", "company_id") REFERENCES "order_deliveries"("id", "company_id")`,
      `FOREIGN KEY ("delivery_id") REFERENCES "order_deliveries"("id")`,
    )
    expect(entregaSimple, 'la mutacion no simplifico la FK de la entrega').not.toBe(upSource)
    expect(nonCompositeTenantForeignKeys(entregaSimple)).toEqual(['order_delivery_voids_delivery_id_fkey'])
  })

  it('R32: la anulacion, el autor y el asiento van contra claves (id, company_id)', () => {
    const fk = (table: string, name: string) => foreignKeysOf(upSource, table).find((f) => f.name === name)
    expect(fk('order_delivery_voids', 'order_delivery_voids_delivery_id_fkey')).toMatchObject({
      columns: ['delivery_id', 'company_id'],
      references: 'order_deliveries',
      referencedColumns: ['id', 'company_id'],
    })
    expect(fk('order_delivery_voids', 'order_delivery_voids_created_by_fkey')).toMatchObject({
      columns: ['created_by', 'company_id'],
      references: 'users',
      referencedColumns: ['id', 'company_id'],
    })
    expect(fk('order_delivery_void_lines', 'order_delivery_void_lines_void_company_fkey')).toMatchObject({
      columns: ['void_id', 'company_id'],
      references: 'order_delivery_voids',
      referencedColumns: ['id', 'company_id'],
    })
    expect(fk('inventory_movements', 'inventory_movements_order_delivery_void_id_fkey')).toMatchObject({
      columns: ['order_delivery_void_id', 'company_id'],
      references: 'order_delivery_voids',
      referencedColumns: ['id', 'company_id'],
    })
  })

  it('R32: la linea anulada es de la entrega anulada: las dos FK comparten delivery_id, y cae si una lo pierde', () => {
    const fks = foreignKeysOf(upSource, 'order_delivery_void_lines')
    expect(fks.find((f) => f.name === 'order_delivery_void_lines_void_fkey')).toMatchObject({
      columns: ['void_id', 'delivery_id'],
      references: 'order_delivery_voids',
      referencedColumns: ['id', 'delivery_id'],
    })
    expect(fks.find((f) => f.name === 'order_delivery_void_lines_delivery_line_fkey')).toMatchObject({
      columns: ['delivery_line_id', 'delivery_id'],
      references: 'order_delivery_lines',
      referencedColumns: ['id', 'delivery_id'],
    })
    const s = statements(upSource)
    expect(s).toContain(
      `ALTER TABLE "order_delivery_lines" ADD CONSTRAINT "order_delivery_lines_id_delivery_id_key" UNIQUE ("id", "delivery_id")`,
    )
    expect(s).toContain(
      `ALTER TABLE "order_delivery_voids" ADD CONSTRAINT "order_delivery_voids_id_delivery_id_key" UNIQUE ("id", "delivery_id")`,
    )

    const lineaSimple = upSource.replace(
      `FOREIGN KEY ("delivery_line_id", "delivery_id") REFERENCES "order_delivery_lines"("id", "delivery_id")`,
      `FOREIGN KEY ("delivery_line_id") REFERENCES "order_delivery_lines"("id")`,
    )
    expect(lineaSimple, 'la mutacion no simplifico la FK de la linea').not.toBe(upSource)
    expect(nonCompositeTenantForeignKeys(lineaSimple)).toEqual(['order_delivery_void_lines_delivery_line_fkey'])
  })

  it('R32: una linea de entrega se anula una sola vez, y la clave es unica por empresa', () => {
    const s = statements(upSource)
    expect(s).toContain(
      `ALTER TABLE "order_delivery_void_lines" ADD CONSTRAINT "order_delivery_void_lines_delivery_line_unique" UNIQUE ("delivery_line_id")`,
    )
    expect(s).toContain(
      `ALTER TABLE "order_delivery_voids" ADD CONSTRAINT "order_delivery_voids_company_key_unique" UNIQUE ("company_id", "void_key")`,
    )
  })

  it('R32: el motivo no puede ser vacio ni solo espacios', () => {
    expect(statements(upSource)).toContain(
      `ALTER TABLE "order_delivery_voids" ADD CONSTRAINT "order_delivery_voids_reason_not_blank" CHECK (length(btrim("reason")) BETWEEN 1 AND 500)`,
    )
  })

  it('R32: los CHECK de inventory_movements comparan "kind"::text, y cae si uno usa el literal del tipo', () => {
    expect(kindChecksWithoutTextCast(upSource)).toEqual([])

    const sinCast = upSource.replace(
      `CHECK ("kind"::text <> 'delivery_void' OR "quantity" > 0)`,
      `CHECK ("kind" <> 'delivery_void' OR "quantity" > 0)`,
    )
    expect(sinCast, 'la mutacion no quito el cast').not.toBe(upSource)
    expect(kindChecksWithoutTextCast(sinCast)).toEqual(['inventory_movements_delivery_void_quantity_positive'])
  })

  it('R32: el indice parcial filtra por order_delivery_void_id IS NOT NULL, no por el cast de kind', () => {
    expect(partialIndexesOnKindCast(upSource)).toEqual([])
    expect(statements(upSource)).toContain(
      `CREATE UNIQUE INDEX "inventory_movements_one_delivery_void_per_batch" ON "inventory_movements" ("order_delivery_void_id", "batch_id") WHERE "order_delivery_void_id" IS NOT NULL`,
    )

    const conCast = upSource.replace(
      `WHERE "order_delivery_void_id" IS NOT NULL;`,
      `WHERE "kind"::text = 'delivery_void';`,
    )
    expect(conCast, 'la mutacion no cambio el predicado').not.toBe(upSource)
    expect(partialIndexesOnKindCast(conCast)).toEqual(['inventory_movements_one_delivery_void_per_batch'])
  })

  it('R24, R32: delivery_void entra en los CHECK de order_id y reason, la cantidad es positiva y lleva su anulacion', () => {
    expect(checkText(upSource, 'inventory_movements_order_id_matches_kind')).toBe(
      `ALTERTABLE"inventory_movements"ADDCONSTRAINT"inventory_movements_order_id_matches_kind"CHECK(("kind"::textIN('consumption','production','delivery','delivery_void'))=("order_id"ISNOTNULL))`,
    )
    expect(checkText(upSource, 'inventory_movements_reason_matches_kind')).toBe(
      `ALTERTABLE"inventory_movements"ADDCONSTRAINT"inventory_movements_reason_matches_kind"CHECK(("kind"::text='adjustment'AND"reason"ISNOTNULL)OR("kind"::textIN('opening','consumption','production','delivery','delivery_void')AND"reason"ISNULL))`,
    )
    expect(checkText(upSource, 'inventory_movements_order_delivery_void_id_matches_kind')).toBe(
      `ALTERTABLE"inventory_movements"ADDCONSTRAINT"inventory_movements_order_delivery_void_id_matches_kind"CHECK(("kind"::text='delivery_void')=("order_delivery_void_id"ISNOTNULL))`,
    )
    expect(checkText(upSource, 'inventory_movements_delivery_void_quantity_positive')).toBe(
      `ALTERTABLE"inventory_movements"ADDCONSTRAINT"inventory_movements_delivery_void_quantity_positive"CHECK("kind"::text<>'delivery_void'OR"quantity">0)`,
    )
  })

  it('R32: los dos CHECK reescritos parten del texto que dejo la migracion de la entrega', () => {
    for (const name of ['inventory_movements_order_id_matches_kind', 'inventory_movements_reason_matches_kind']) {
      expect(checkText(downSource, name), name).toBe(checkText(deliveriesUpSource, name))
    }
  })

  it('R34: tablas, columnas y valor de enum nuevos estan en ingles y son exactamente los esperados', () => {
    const nombres = newIdentifiers(upSource, enumUpSource)
    expect(nombres).toEqual(
      [
        'company_id',
        'created_at',
        'created_by',
        'delivery_id',
        'delivery_line_id',
        'delivery_void',
        'id',
        'order_delivery_void_id',
        'order_delivery_void_lines',
        'order_delivery_voids',
        'reason',
        'void_id',
        'void_key',
      ].sort(),
    )
    expect(nonEnglishIdentifiers(nombres)).toEqual([])
    expect(nonEnglishIdentifiers([...nombres, 'motivo_anulacion'])).toEqual(['motivo_anulacion'])
  })
})

// --- order_delivery_voids: el DOWN ----------------------------------------------------------

describe('order_delivery_voids down.sql', () => {
  it('quita cada objeto que crea el UP, y cae si falta uno', () => {
    expect(objectsNotReverted(upSource, downSource)).toEqual([])

    const sinClave = downSource.replace(
      `ALTER TABLE "order_delivery_lines" DROP CONSTRAINT "order_delivery_lines_id_delivery_id_key";`,
      '',
    )
    expect(sinClave, 'la mutacion no quito el DROP CONSTRAINT').not.toBe(downSource)
    expect(objectsNotReverted(upSource, sinClave)).toEqual(['constraint:order_delivery_lines_id_delivery_id_key'])
  })

  it('las tablas caen en orden inverso y sin CASCADE', () => {
    expect(downDropsTablesInReverseOrder(downSource)).toBe(true)

    const invertido = downSource
      .replace('DROP TABLE "order_delivery_void_lines";', '__X__')
      .replace('DROP TABLE "order_delivery_voids";', 'DROP TABLE "order_delivery_void_lines";')
      .replace('__X__', 'DROP TABLE "order_delivery_voids";')
    expect(downDropsTablesInReverseOrder(invertido)).toBe(false)
  })

  it('repone los dos CHECK reescritos con su texto previo, sin delivery_void', () => {
    expect(checkText(downSource, 'inventory_movements_order_id_matches_kind')).toBe(
      `ALTERTABLE"inventory_movements"ADDCONSTRAINT"inventory_movements_order_id_matches_kind"CHECK(("kind"::textIN('consumption','production','delivery'))=("order_id"ISNOTNULL))`,
    )
    expect(checkText(downSource, 'inventory_movements_reason_matches_kind')).toBe(
      `ALTERTABLE"inventory_movements"ADDCONSTRAINT"inventory_movements_reason_matches_kind"CHECK(("kind"::text='adjustment'AND"reason"ISNOTNULL)OR("kind"::textIN('opening','consumption','production','delivery')AND"reason"ISNULL))`,
    )
  })
})
