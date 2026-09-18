// T6 — Contrato estatico del SQL de la migracion `list_query_indexes` (QC-57).
//
// Es un test de TEXTO sobre `migration.sql` y `down.sql`, del mismo tipo que
// `tests/unit/inventario/schema/inventario-split-migration.test.ts`, y existe por la misma
// razon: `products`, `recipes`, `supplier_catalog_lines` y `orders` tienen FK escalares sin
// `@relation`, CHECK y RLS escritos A MANO que Prisma NO conoce (`design.md > 10.3`), y
// cualquier regeneracion automatica de esta migracion emitiria `DROP CONSTRAINT` sobre ellos.
// Esta migracion se escribio a mano justamente para que no pasara; este archivo es lo que
// impide que vuelva a pasar la proxima vez que alguien la regenere y no la audite.
//
// El estado RESULTANTE contra Postgres real lo afirma
// `tests/integration/inventario/list-query-indexes.int.test.ts`. Este afirma el TEXTO, que es
// lo unico capaz de decir «esta sentencia no deberia estar aqui» aunque la base ya la haya
// aplicado, y «el down borra exactamente lo que el up crea» sin tener que ejecutarlo.
//
// Cubre R21, R22, R23.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/** Sube desde este archivo hasta la raiz del repo (la carpeta con `package.json`). */
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
const migrationDir = join(repoRoot, 'db', 'migrations', '20260904160000_list_query_indexes')

/** Quita comentarios: lo que se afirma es SQL EJECUTABLE, no la prosa que lo explica. */
function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
}

/** Sentencias ejecutables, con los espacios normalizados. */
function statements(sql: string): readonly string[] {
  return stripSqlComments(sql)
    .split(';')
    .map((statement) => statement.replace(/\s+/g, ' ').trim())
    .filter((statement) => statement.length > 0)
}

const upSource = readFileSync(join(migrationDir, 'migration.sql'), 'utf8')
const downSource = readFileSync(join(migrationDir, 'down.sql'), 'utf8')
const up = statements(upSource)
const down = statements(downSource)

/**
 * Los 35 indices que esta migracion crea, con el nombre EXACTO. La lista es la fuente de
 * verdad de los dos sentidos: el UP tiene que crearlos todos y el DOWN tiene que borrarlos
 * todos, ni uno mas ni uno menos. Se recorre en bucle a proposito y no con 35 asertos
 * sueltos: un aserto por indice es una lista que alguien amplia a medias.
 */
const SEARCH_INDEXES = [
  'products_name_normalized_trgm_idx',
  'presentations_name_normalized_trgm_idx',
  'recipes_name_normalized_trgm_idx',
  'suppliers_name_normalized_trgm_idx',
  'supplier_catalog_lines_name_normalized_trgm_idx',
  'units_name_normalized_trgm_idx',
] as const

/** Indices sobre tabla con borrado logico: TIENEN que ser parciales (R7). */
const PARTIAL_INDEXES = [
  'products_name_normalized_trgm_idx',
  'products_name_idx',
  'products_stock_idx',
  'products_qty_alert_idx',
  'products_created_at_idx',
  'products_updated_at_idx',
  'recipes_name_normalized_trgm_idx',
  'recipes_name_idx',
  'recipes_created_at_idx',
  'recipes_updated_at_idx',
  'suppliers_name_normalized_trgm_idx',
  'suppliers_name_idx',
  'suppliers_created_at_idx',
  'suppliers_updated_at_idx',
  'supplier_catalog_lines_name_normalized_trgm_idx',
  'supplier_catalog_lines_name_idx',
  'supplier_catalog_lines_cost_idx',
  'supplier_catalog_lines_min_purchase_idx',
  'supplier_catalog_lines_delivery_time_idx',
  'supplier_catalog_lines_created_at_idx',
  'supplier_catalog_lines_updated_at_idx',
  'orders_status_idx',
  'orders_priority_idx',
  'orders_created_at_idx',
  'orders_quantity_idx',
  'orders_unit_price_idx',
] as const

/** Indices sobre tabla SIN borrado logico: son totales y NO pueden llevar `WHERE`. */
const FULL_INDEXES = [
  'presentations_name_normalized_trgm_idx',
  'presentations_name_idx',
  'presentations_created_at_idx',
  'presentations_updated_at_idx',
  'units_name_normalized_trgm_idx',
  'units_name_idx',
  'units_symbol_idx',
  'units_created_at_idx',
  'units_updated_at_idx',
] as const

const ALL_INDEXES = [...PARTIAL_INDEXES, ...FULL_INDEXES] as const

/**
 * Nombres de indice que el TEXTO de esta migracion no puede contener, ni en el UP ni en el
 * `down.sql`. No es un censo de lo que existe en la base: es una afirmacion sobre este archivo
 * y solo sobre el. No se recrean y —sobre todo— no se borran: un `DROP INDEX` de mas aqui se
 * llevaria por delante la unicidad de recetas, proveedores, presentaciones, unidades o lineas
 * de catalogo.
 *
 * Por eso los nombres de indices YA RELEVADOS se conservan en la lista aunque su indice ya no
 * exista en la base: que otra ficha los haya sustituido no le da a esta migracion ningun
 * derecho nuevo sobre ellos, ni para crearlos ni para borrarlos. Sacarlos seria aflojar la
 * lista, no actualizarla. Y por el mismo motivo entran tambien los objetos NUEVOS que otras
 * fichas crean sobre estas tablas: esta migracion tampoco puede nombrarlos.
 */
const PRE_EXISTING_INDEXES = [
  'presentations_name_normalized_key',
  'units_name_normalized_key',
  'recipes_name_unique',
  'suppliers_name_unique',
  'supplier_catalog_lines_name_presentation_unique',
  'products_presentation_id_idx',
  'products_unit_id_idx',
  'supplier_catalog_lines_presentation_id_idx',
  'supplier_catalog_lines_unit_id_idx',
  'orders_recipe_id_idx',
  'orders_unit_id_idx',
  'orders_order_year_order_sequence_key',
  // 2026-09-17 - los tres objetos con los que el ambito de empresa dota a `suppliers` y a
  // `supplier_catalog_lines`. Nacen en su propia migracion, muy posterior a esta, asi que esta
  // no los puede nombrar de ninguna forma; si un dia apareciera aqui un `CREATE` o un `DROP`
  // con cualquiera de ellos, seria alcance de otra ficha metido en este archivo. Se nombran uno
  // a uno, como todo lo demas de la lista, para que un cuarto objeto nuevo siga sin cobertura y
  // haya que pensarlo.
  //
  // El unico compuesto y parcial del nombre de proveedor, que releva al global
  // `suppliers_name_unique` -que sigue arriba, y sigue por el mismo motivo: relevado no es lo
  // mismo que disponible-.
  'suppliers_company_name_unique',
  // La clave candidata `(company_id, id)` del proveedor: destino de la clave foranea compuesta
  // que obliga a que la linea y su proveedor sean de la misma empresa.
  'suppliers_company_id_id_key',
  // El indice del lado hijo de esa misma clave foranea compuesta, con la empresa de cabeza.
  'supplier_catalog_lines_company_id_supplier_id_idx',
] as const

/** Restricciones escritas A MANO que Prisma no conoce (`design.md > 10.3`). */
const HAND_WRITTEN_CONSTRAINTS = [
  'products_created_by_fkey',
  'products_updated_by_fkey',
  'products_unit_id_fkey',
  'products_presentation_id_fkey',
  'products_stock_non_negative',
  'products_qty_alert_non_negative',
  'recipes_created_by_fkey',
  'recipes_updated_by_fkey',
  'suppliers_created_by_fkey',
  'suppliers_updated_by_fkey',
  'suppliers_contact_required',
  'supplier_catalog_lines_presentation_id_fkey',
  'supplier_catalog_lines_unit_id_fkey',
  'supplier_catalog_lines_created_by_fkey',
  'supplier_catalog_lines_updated_by_fkey',
  'supplier_catalog_lines_cost_positive',
  'supplier_catalog_lines_min_purchase_non_negative',
  'supplier_catalog_lines_delivery_time_non_negative',
  'orders_recipe_id_fkey',
  'orders_unit_id_fkey',
  'orders_created_by_fkey',
  'orders_updated_by_fkey',
  'orders_order_year_matches_created_at',
  'orders_order_sequence_positive',
  'orders_quantity_positive',
  'orders_unit_price_non_negative',
  'orders_delivered_not_deleted',
  'orders_cancellation_reason_matches_status',
] as const

describe('migration.sql — lo que la migracion NO hace (design.md > 10.3)', () => {
  it('no borra NINGUNA restriccion escrita a mano', () => {
    // El riesgo numero uno de la ficha: la unica columna nueva vive en `products`, la tabla
    // con mas drift del repo. Se afirma sobre la lista completa y por su nombre.
    for (const constraint of HAND_WRITTEN_CONSTRAINTS) {
      expect(upSource, `la migracion menciona «${constraint}»`).not.toContain(constraint)
      expect(downSource, `el down menciona «${constraint}»`).not.toContain(constraint)
    }
  })

  it('no contiene ningun DROP: solo ANADE una columna y CREA indices', () => {
    const drops = up.filter((statement) => /\bDROP\b/iu.test(statement))
    expect(drops, `sentencias con DROP en el UP: ${drops.join(' // ')}`).toEqual([])
  })

  it('no toca RLS ni ninguna politica', () => {
    for (const forbidden of ['ROW LEVEL SECURITY', 'POLICY', 'REVOKE', 'GRANT']) {
      expect(stripSqlComments(upSource).toUpperCase()).not.toContain(forbidden)
      expect(stripSqlComments(downSource).toUpperCase()).not.toContain(forbidden)
    }
  })

  it('no recrea ni borra ningun indice que ya existia', () => {
    for (const index of PRE_EXISTING_INDEXES) {
      expect(stripSqlComments(upSource), `el UP toca «${index}»`).not.toContain(index)
      expect(stripSqlComments(downSource), `el DOWN toca «${index}»`).not.toContain(index)
    }
  })

  it('no crea ningun indice UNICO sobre products.name_normalized (el nombre no es unico)', () => {
    // Decision cerrada 6 de QC-14: dos productos pueden llamarse igual. La columna es para
    // BUSCAR. Un `UNIQUE` aqui romperia altas legitimas con un 23505 incomprensible.
    const uniques = up.filter((statement) => /CREATE UNIQUE INDEX/iu.test(statement))
    expect(uniques).toEqual([])
  })
})

describe('migration.sql — la columna normalizada de products (R23)', () => {
  it('la anade, la rellena y solo despues la pone NOT NULL, en ese orden', () => {
    const add = up.findIndex((s) => /ALTER TABLE "products" ADD COLUMN "name_normalized" text/iu.test(s))
    const backfill = up.findIndex((s) => /^UPDATE "products" SET "name_normalized"/iu.test(s))
    const notNull = up.findIndex((s) =>
      /ALTER TABLE "products" ALTER COLUMN "name_normalized" SET NOT NULL/iu.test(s),
    )
    expect(add, 'falta el ADD COLUMN').toBeGreaterThanOrEqual(0)
    expect(backfill, 'falta el backfill').toBeGreaterThan(add)
    expect(notNull, 'el SET NOT NULL va DESPUES del backfill o la migracion falla').toBeGreaterThan(
      backfill,
    )
  })

  it('el backfill normaliza: minusculas, sin acentos y solo [a-z0-9]', () => {
    const backfill = up.find((s) => /^UPDATE "products" SET "name_normalized"/iu.test(s))
    expect(backfill).toBeDefined()
    expect(backfill).toContain('lower(')
    expect(backfill).toContain('translate(')
    expect(backfill).toContain("'[^a-z0-9]', '', 'g'")
    // Que el resultado COINCIDA con `normalizeProductName` para los nombres ya cargados no se
    // puede afirmar sobre texto: lo hace el test de integracion (R23).
  })

  it('la columna nueva NO lleva DEFAULT: un producto sin nombre normalizado no puede existir', () => {
    const add = up.find((s) => /ADD COLUMN "name_normalized"/iu.test(s))
    expect(add).toBeDefined()
    expect(add?.toUpperCase()).not.toContain('DEFAULT')
  })
})

describe('migration.sql — indices (R21)', () => {
  it('habilita pg_trgm antes de crear el primer indice de busqueda (via A)', () => {
    const extension = up.findIndex((s) => /CREATE EXTENSION IF NOT EXISTS pg_trgm/iu.test(s))
    const primerGin = up.findIndex((s) => /USING gin/iu.test(s))
    expect(extension, 'falta CREATE EXTENSION pg_trgm').toBeGreaterThanOrEqual(0)
    expect(primerGin).toBeGreaterThan(extension)
  })

  it('crea los seis indices de busqueda como GIN de trigramas', () => {
    // Un btree NO acelera `LIKE '%texto%'`: si alguien cambiara estos a btree, la busqueda
    // por subcadena seguiria funcionando pero sin indice, y nadie se enteraria (`design.md > 4.3`).
    for (const index of SEARCH_INDEXES) {
      const statement = up.find((s) => s.includes(`"${index}"`))
      expect(statement, `falta el indice ${index}`).toBeDefined()
      expect(statement, `${index} deberia ser GIN`).toMatch(/USING gin/iu)
      expect(statement, `${index} deberia usar gin_trgm_ops`).toContain('gin_trgm_ops')
      expect(statement, `${index} deberia ir sobre name_normalized`).toContain('"name_normalized"')
    }
  })

  it('orders NO tiene indice de busqueda: no tiene columna name (R17)', () => {
    const ginSobreOrders = up.filter((s) => /USING gin/iu.test(s) && /ON "orders"/iu.test(s))
    expect(ginSobreOrders).toEqual([])
  })

  it('crea los 35 indices declarados, cada uno con su nombre exacto', () => {
    expect(ALL_INDEXES).toHaveLength(35)
    for (const index of ALL_INDEXES) {
      const statement = up.find((s) => s.includes(`"${index}"`))
      expect(statement, `falta CREATE INDEX "${index}"`).toBeDefined()
      expect(statement).toMatch(/^CREATE INDEX/iu)
    }
  })

  it('no crea ningun indice de mas', () => {
    const creados = up
      .filter((s) => /^CREATE INDEX/iu.test(s))
      .map((s) => /^CREATE INDEX "([^"]+)"/u.exec(s)?.[1] ?? '')
    expect([...creados].sort()).toEqual([...ALL_INDEXES].sort())
  })

  it('los indices de las cinco tablas con borrado logico son PARCIALES (R7)', () => {
    for (const index of PARTIAL_INDEXES) {
      const statement = up.find((s) => s.includes(`"${index}"`))
      expect(statement, `${index} deberia llevar WHERE "deleted_at" IS NULL`).toContain(
        'WHERE "deleted_at" IS NULL',
      )
    }
  })

  it('los de presentations y units son TOTALES: esas tablas no tienen deleted_at', () => {
    for (const index of FULL_INDEXES) {
      const statement = up.find((s) => s.includes(`"${index}"`))
      expect(statement, `${index} no puede filtrar por una columna que no existe`).not.toContain(
        'deleted_at',
      )
    }
  })

  it('`deleted_at` solo aparece como PREDICADO del indice parcial, nunca como columna indexada', () => {
    // Decision cerrada 8: `deleted_at` NUNCA es consultable. Que aparezca en el `WHERE` de un
    // indice parcial es otra cosa y es correcto; que apareciera dentro de los parentesis de la
    // lista de columnas significaria que alguien la hizo ordenable.
    for (const statement of up.filter((s) => /^CREATE INDEX/iu.test(s))) {
      const columnas = /\(([^)]*)\)/u.exec(statement)?.[1] ?? ''
      expect(columnas, `columnas indexadas de: ${statement}`).not.toContain('deleted_at')
    }
  })
})

describe('down.sql — revierte exactamente el up (R22)', () => {
  it('borra los 35 indices que el up crea, y solo esos', () => {
    const borrados = down
      .filter((s) => /^DROP INDEX/iu.test(s))
      .map((s) => /DROP INDEX IF EXISTS "([^"]+)"/u.exec(s)?.[1] ?? '')
    expect([...borrados].sort()).toEqual([...ALL_INDEXES].sort())
  })

  it('borra la columna que el up anade', () => {
    expect(
      down.some((s) => /ALTER TABLE "products" DROP COLUMN IF EXISTS "name_normalized"/iu.test(s)),
    ).toBe(true)
  })

  it('NO hace DROP EXTENSION pg_trgm, y lo dice por escrito', () => {
    // `design.md > 10.4`: borrar una extension que otra cosa podria estar usando es peor que
    // dejarla. Las dos mitades importan: que no lo haga, y que el archivo explique por que —un
    // `down` que omite algo en silencio parece un olvido y alguien lo «arregla»—.
    expect(down.some((s) => /DROP EXTENSION/iu.test(s))).toBe(false)
    expect(downSource).toContain('DROP EXTENSION')
    expect(downSource.toLowerCase()).toContain('deliberado')
  })

  it('no toca ninguna otra tabla ni ninguna otra columna', () => {
    const dropColumns = down.filter((s) => /DROP COLUMN/iu.test(s))
    expect(dropColumns).toHaveLength(1)
    const alters = down.filter((s) => /^ALTER TABLE/iu.test(s))
    expect(alters).toHaveLength(1)
  })
})

describe('R2: products_stock_idx, creado aqui, se dropea con el nombre exacto en la migracion que lo quita', () => {
  it('el nombre que crea esta migracion es el mismo que dropea 20260917120000_drop_product_stock', () => {
    const creado = up.find((s) => s.includes('"products_stock_idx"'))
    expect(creado, 'esta migracion sigue creando products_stock_idx').toBeDefined()

    const dropMigrationDir = join(repoRoot, 'db', 'migrations', '20260917120000_drop_product_stock')
    const dropUpSource = readFileSync(join(dropMigrationDir, 'migration.sql'), 'utf8')
    expect(stripSqlComments(dropUpSource)).toMatch(/DROP INDEX IF EXISTS "products_stock_idx"/iu)
  })
})
