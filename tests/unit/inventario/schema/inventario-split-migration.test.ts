// T18 (parte de `inventario`) — Contrato estatico del SQL de la migracion
// `split_product_and_supplier_catalog` (QC-52).
//
// Es un test de TEXTO sobre `migration.sql`, del mismo tipo que
// `tests/unit/proveedores/schema/proveedores-migration.test.ts`, y existe por una razon muy
// concreta: `prisma migrate dev --create-only` genero QUINCE `DROP CONSTRAINT` de mas sobre
// las FK que cruzan de modulo -las de autoria de `products`, `recipes`, `recipe_lines`,
// `suppliers`, `supplier_catalog_lines` y `orders`, la de unidad de `products` y
// `recipe_lines`, y la de producto de `recipe_lines`-, porque ninguna esta declarada en
// `db/schema.prisma` (son escalares sin `@relation`, decision cerrada 10). Se borraron a
// mano una por una; este archivo es lo que impide que vuelvan la proxima vez que alguien
// regenere el SQL y no lo audite (R29).
//
// Los tests de INTEGRACION (`tests/integration/inventario/inventario-constraints.int.test.ts`,
// describe «QC-52 — censo de products tras la migracion») afirman el estado RESULTANTE contra
// Postgres real. Este afirma el TEXTO, que es lo unico capaz de decir «esta sentencia no
// deberia estar aqui» aunque la base ya la haya aplicado.
//
// Cubre R1, R2, R3, R4, R26, R27, R29.

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
const migrationDir = join(
  repoRoot,
  'db',
  'migrations',
  '20260904123854_split_product_and_supplier_catalog',
)

/**
 * Quita comentarios de linea y de bloque: lo que se afirma es SQL EJECUTABLE, no prosa.
 *
 * Es imprescindible aqui y no es un detalle: la cabecera de esta migracion ENUMERA POR SU
 * NOMBRE los quince `DROP CONSTRAINT` que se borraron a mano, para que quien la lea sepa que
 * pasó. Sin `stripSqlComments`, el test de R29 se pondria rojo leyendo justamente la prosa
 * que documenta que el trabajo se hizo bien.
 */
function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
}

/** Sentencias ejecutables, con los espacios normalizados para poder afirmar sobre ellas. */
function statements(sql: string): readonly string[] {
  return stripSqlComments(sql)
    .split(';')
    .map((statement) => statement.replace(/\s+/g, ' ').trim())
    .filter((statement) => statement.length > 0)
}

const upSource = readFileSync(join(migrationDir, 'migration.sql'), 'utf8')
const upCode = stripSqlComments(upSource)
const up = statements(upSource)

/**
 * Las FK que R29 enumera: cruzan de modulo, viven escritas a mano en migraciones anteriores
 * y son DRIFT para Prisma, que las propone borrar en cada generacion. Ninguna puede aparecer
 * en un `DROP CONSTRAINT` de esta migracion.
 */
const FK_INTOCABLES = [
  'products_created_by_fkey',
  'products_updated_by_fkey',
  'products_unit_id_fkey',
  'recipes_created_by_fkey',
  'recipes_updated_by_fkey',
  'recipe_lines_created_by_fkey',
  'recipe_lines_updated_by_fkey',
  'recipe_lines_product_id_fkey',
  'recipe_lines_unit_id_fkey',
  'suppliers_created_by_fkey',
  'suppliers_updated_by_fkey',
  'supplier_catalog_lines_created_by_fkey',
  'supplier_catalog_lines_updated_by_fkey',
  'orders_created_by_fkey',
  'orders_updated_by_fkey',
  'orders_recipe_id_fkey',
  'orders_unit_id_fkey',
] as const

describe('migration.sql de QC-52 — lo que el producto pierde', () => {
  it('borra exactamente las tres columnas de products, y ninguna mas', () => {
    // R1. La igualdad es lo que muerde: un cuarto `DROP COLUMN` sobre `products` -por
    // ejemplo el de `image_path` que el drift de P4 iba a colar- pone esto rojo.
    const dropped = [
      ...upCode.matchAll(/DROP COLUMN\s+(?:IF EXISTS\s+)?"(\w+)"/gi),
    ].map((match) => match[1])
    expect([...dropped].sort()).toEqual(
      ['cost', 'delivery_time', 'min_purchase', 'product_id'].sort(),
    )
  })

  it('no menciona image_path de products por ninguna sentencia', () => {
    // R4: el cambio de `image_path` es SOLO de modelo Prisma, sin ninguna sentencia SQL. La
    // unica mencion legitima a `image_path` en este archivo es el `ADD COLUMN` de la LINEA
    // de catalogo, que es otra tabla.
    const conImagePath = up.filter((statement) => /image_path/i.test(statement))
    expect(conImagePath).toHaveLength(1)
    expect(conImagePath[0]).toMatch(/ALTER TABLE "supplier_catalog_lines"/i)
    expect(conImagePath[0]).not.toMatch(/"products"/i)
  })

  it('no toca ninguna de las columnas que el producto conserva', () => {
    // R2. Ni `ALTER COLUMN`, ni `DROP COLUMN`, ni `ADD COLUMN` sobre ellas: la migracion
    // le quita tres cosas al producto y no le hace nada mas.
    const conservadas = [
      'name',
      'presentation_id',
      'unit_id',
      'image_path',
      'stock',
      'qty_alert',
      'created_at',
      'updated_at',
      'deleted_at',
      'created_by',
      'updated_by',
    ]
    const sobreProducts = up.filter((statement) => /ALTER TABLE "products"/i.test(statement))
    // Ancla: si el filtro no encontrara nada, el bucle de abajo pasaria por vacio.
    expect(sobreProducts).toHaveLength(1)

    for (const columna of conservadas) {
      expect(
        sobreProducts[0],
        `la sentencia sobre products no puede mencionar "${columna}"`,
      ).not.toContain(`"${columna}"`)
    }
  })
})

describe('migration.sql de QC-52 — lo que NO puede contener', () => {
  it('no contiene ningun DROP CONSTRAINT de las FK que cruzan de modulo', () => {
    // R29. Este es el caso caro de la ficha: aplicarlas habria destruido en silencio la
    // integridad referencial de cinco features ya mergeadas.
    for (const fk of FK_INTOCABLES) {
      expect(upCode, `la migracion no puede borrar "${fk}" (R29)`).not.toContain(fk)
    }
  })

  it('el unico DROP CONSTRAINT que queda es el legitimo de la linea', () => {
    // R29, en positivo: no basta con que no esten las diecisiete: hay que fijar cual SI
    // esta, o manana podria colarse una decimoctava que nadie enumero.
    const dropConstraints = [
      ...upCode.matchAll(/DROP CONSTRAINT\s+(?:IF EXISTS\s+)?"(\w+)"/gi),
    ].map((match) => match[1])
    expect(dropConstraints).toEqual(['supplier_catalog_lines_product_id_fkey'])
  })

  it('no contiene ninguna sentencia de RLS', () => {
    // R26. RLS sigue habilitada y forzada en las dos tablas desde sus migraciones
    // originales; una sentencia aqui solo podria estropearlo. Que siga puesta EN LA BASE lo
    // afirma el test de integracion; que la migracion no la toque, este.
    for (const patron of [
      /ROW\s+LEVEL\s+SECURITY/i,
      /CREATE\s+POLICY/i,
      /DROP\s+POLICY/i,
      /ALTER\s+POLICY/i,
    ]) {
      expect(upCode, `la migracion no puede contener ${String(patron)} (R26)`).not.toMatch(patron)
    }
  })

  it('no altera ninguna otra tabla que products y supplier_catalog_lines', () => {
    // R27: una sola migracion con los dos cambios, y NADA de ninguna otra tabla.
    // `presentations` y `units` aparecen, pero solo como DESTINO de un `REFERENCES`, nunca
    // como sujeto de un `ALTER`/`CREATE`/`DROP`.
    const sujetos = [
      ...upCode.matchAll(
        /(?:ALTER TABLE|CREATE TABLE|DROP TABLE|CREATE(?: UNIQUE)? INDEX|CREATE TRIGGER)\s+(?:IF (?:NOT )?EXISTS\s+)?"?(\w+)"?(?:\s+ON\s+"?(\w+)"?)?/gi,
      ),
    ].map((match) => match[2] ?? match[1])
    expect(sujetos.length).toBeGreaterThan(0)
    expect([...new Set(sujetos)].sort()).toEqual(['products', 'supplier_catalog_lines'])
  })

  it('no crea, renombra ni borra ningun identificador que no este en ingles y en snake_case', () => {
    // R12. Se miran los nombres que la migracion ESCRIBE: columnas anadidas, indices
    // creados y restricciones anadidas.
    const identificadores = [
      ...[...upCode.matchAll(/ADD COLUMN\s+"(\w+)"/gi)].map((match) => match[1]),
      ...[...upCode.matchAll(/CREATE(?: UNIQUE)? INDEX\s+"(\w+)"/gi)].map((match) => match[1]),
      ...[...upCode.matchAll(/ADD CONSTRAINT\s+"(\w+)"/gi)].map((match) => match[1]),
    ]
    expect(identificadores.length).toBeGreaterThan(0)
    for (const identificador of identificadores) {
      expect(identificador, `"${identificador}" no es snake_case`).toMatch(/^[a-z][a-z0-9_]*$/)
    }
  })
})
