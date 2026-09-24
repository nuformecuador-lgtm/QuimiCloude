/**
 * QC-57 (T5, T6) — estado RESULTANTE de la migracion `20260904160000_list_query_indexes`
 * contra Postgres REAL, y la escritura de `products.name_normalized` por el camino real de
 * la app.
 *
 * POR QUE AQUI Y NO EN `tests/unit/inventario/schema/` — el hermano estatico
 * (`list-query-indexes-migration.test.ts`) afirma sobre el TEXTO del `migration.sql`: dice
 * «esta sentencia esta escrita» y «esta otra no deberia estar». Lo que NO puede decir es si
 * la base la aplico, ni si `pg_trgm` existe de verdad, ni si el backfill coincide con lo que
 * devuelve `normalizeProductName`. Eso solo lo sabe Postgres, y por eso estas afirmaciones
 * viven en integracion. Las dos mitades hacen falta: el texto vigila lo que la migracion NO
 * hace, la base vigila lo que SI consiguio.
 *
 * NINGUNA AFIRMACION GLOBAL sobre los datos: el caso del backfill recorre TODAS las filas de
 * `products` a proposito —es literalmente lo que R23 pide, «poblada para las filas que ya
 * existen»— pero no afirma cuantas hay ni cuales son. Una base con mas catalogo cargado no
 * puede volverlo rojo; una fila con la columna mal calculada, si.
 *
 * AISLAMIENTO de la mitad de escritura: el adaptador (`createProduct`, `updateAliveProduct`)
 * llama al cliente Prisma GLOBAL, no a un `tx` inyectado, asi que una transaccion que se
 * deshace NO lo envuelve (esta explicado con detalle en la cabecera de
 * `product-crud.int.test.ts`). Se crean filas REALES y se borran por su `id` exacto en un
 * `finally`.
 *
 * Cubre R19, R21, R23.
 */
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { normalizeProductName } from '@/lib/modules/inventario'
import {
  createProduct,
  updateAliveProduct,
} from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma'
import { prisma } from '@/lib/shared/db/prisma'

import type { InventoryScope } from '@/lib/modules/inventario/domain/inventory-scope'

function token(): string {
  return randomUUID().replace(/-/gu, '')
}

/**
 * Empresa propia del archivo y AMBITO de las llamadas al adaptador (QC-49 R1, R13).
 *
 * `products.company_id` es NOT NULL desde `<ts>_inventory_company_scope` y `createProduct` /
 * `updateAliveProduct` exigen el ambito en su firma: sin el no compilan. La empresa es EFIMERA
 * y se borra al final, cuando ya no queda ningun producto que la referencie.
 *
 * ESTE ARCHIVO NO PRUEBA EL AISLAMIENTO: sigue probando los indices del listado y la escritura
 * de `name_normalized` (QC-57 R19, R21, R23). El aislamiento es
 * `company-scope-queries.int.test.ts`.
 */
let empresaDelArchivo: string

function ambito(): InventoryScope {
  return { companyId: empresaDelArchivo }
}

beforeAll(async () => {
  const nombre = `Empresa indices de listado ${token()}`
  const { id } = await prisma.company.create({
    data: { name: nombre, nameNormalized: nombre.toLowerCase().replace(/[^a-z0-9]/gu, '') },
    select: { id: true },
  })
  empresaDelArchivo = id
})

afterAll(async () => {
  await prisma.company.deleteMany({ where: { id: empresaDelArchivo } })
})

// ---------------------------------------------------------------------------
// Lo que la migracion tenia que dejar en la base
// ---------------------------------------------------------------------------

interface IndexRow {
  readonly indexname: string
  readonly indexdef: string
}

/** `pg_indexes` de las siete tablas, leido una sola vez. */
async function readIndexes(): Promise<Map<string, string>> {
  const rows = await prisma.$queryRaw<IndexRow[]>`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename IN ('products', 'presentations', 'recipes', 'suppliers',
                        'supplier_catalog_lines', 'units', 'orders')`
  return new Map(rows.map((row) => [row.indexname, row.indexdef]))
}

/** Los siete indices de busqueda: GIN de trigramas sobre `name_normalized`.
 *
 * `recipes_name_normalized_all_trgm_idx` entro el 2026-09-18 (QC-68): busca recetas por nombre
 * PARA EL LISTADO DE PEDIDOS, que tiene que encontrar tambien las dadas de baja. Convive con
 * `recipes_name_normalized_trgm_idx`, el parcial de abajo: los dos sirven a lecturas distintas. */
const SEARCH_INDEXES = [
  'products_name_normalized_trgm_idx',
  'presentations_name_normalized_trgm_idx',
  'recipes_name_normalized_trgm_idx',
  'recipes_name_normalized_all_trgm_idx',
  'suppliers_name_normalized_trgm_idx',
  'supplier_catalog_lines_name_normalized_trgm_idx',
  'units_name_normalized_trgm_idx',
] as const

/** Los de las cinco tablas con borrado logico: PARCIALES (R7).
 *
 * `products_stock_idx` cayo el 2026-09-17 con su columna
 * (`db/migrations/20260917120000_drop_product_stock`, QC-91 R2) y vuelve el 2026-09-18 con la
 * columna guardada de nuevo, con el mismo nombre y la misma forma
 * (`db/migrations/20260918130000_product_unit_and_stored_stock`): `stock` vuelve a
 * `PRODUCT_QUERYABLE.sortable`/`.filterable`. */
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
  // `orders_unit_price_idx` estuvo aqui hasta el 2026-09-07: cayo con su columna en
  // `db/migrations/20260907120000_orders_drop_unit_and_unit_price` (decision humana), y con ella
  // `unitPrice` salio de `ORDER_QUERYABLE.sortable`, asi que ya no hay orden que servir.
] as const

/** Los de `presentations` y `units`, que no tienen `deleted_at`: TOTALES. */
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

/**
 * `recipes_name_normalized_all_trgm_idx` (QC-68, nota fechada 2026-09-18): va sobre `recipes`,
 * que SI tiene `deleted_at`, pero es TOTAL a proposito -no cabe en `PARTIAL_INDEXES`, cuyo caso
 * exige `WHERE (deleted_at IS NULL)`, ni en `FULL_INDEXES`, cuyo motivo escrito es que esas tablas
 * NO tienen `deleted_at`-. Es total porque la busqueda del listado de pedidos tiene que encontrar
 * tambien las recetas dadas de baja: un pedido conserva el nombre de su receta aunque la den de
 * baja, y si la busqueda no la viera, el pedido parecería perdido.
 */
const TOTAL_POR_DECISION = ['recipes_name_normalized_all_trgm_idx'] as const

const ALL_INDEXES = [...PARTIAL_INDEXES, ...FULL_INDEXES, ...TOTAL_POR_DECISION] as const

/**
 * Los que YA existian antes de esta migracion. Se afirma que SIGUEN ahi: la mina de esta
 * ficha era que una migracion generada se llevara por delante lo que Prisma no conoce, y un
 * indice unico que desaparece no rompe ningun test hasta el dia que alguien duplica un nombre.
 */
const PRE_EXISTING_INDEXES = [
  // `presentations_name_normalized_key` (unico GLOBAL sobre el nombre normalizado, de QC-20)
  // salio de esta lista el 2026-09-11 con QC-49. NO es un indice perdido por descuido, que es
  // justo lo que este caso vigila: la unicidad del nombre de presentacion pasa a medirse POR
  // EMPRESA porque dos empresas pueden tener cada una su «Garrafa 20 L» (R20, decision cerrada
  // 3). Un unico global lo impediria, y ademas seria un ORACULO DE EXISTENCIA sobre el catalogo
  // ajeno. Su sustituto es UN solo indice compuesto, `presentations_company_name_unique`, que
  // se afirma abajo en su propio caso: si la migracion se hubiera llevado el global SIN dejar
  // el compuesto, el catalogo se quedaria sin ninguna garantia de unicidad y este archivo
  // seguiria siendo quien lo dijera.
  // `units_name_normalized_key` (unico GLOBAL sobre el nombre normalizado, de QC-32 R5) salio de
  // esta lista el 2026-09-08 con QC-76. NO es un indice que se perdiera por descuido, que es
  // justo lo que este caso vigila: la unicidad del nombre de unidad pasa a medirse POR AMBITO
  // -dentro de la empresa, y las de sistema entre ellas- porque dos empresas pueden tener cada
  // una su «kilogramo» (R14, decision cerrada 14). Un unico global lo impediria. Su sustituto
  // son CUATRO indices PARCIALES, y para que este caso no pierda ni un gramo de fuerza se
  // afirman abajo, en `UNIT_SCOPE_INDEXES`: si la migracion de QC-76 se llevara el global SIN
  // dejar los parciales, el catalogo se quedaria sin ninguna garantia de unicidad y este
  // archivo seguiria siendo quien lo dijera.
  // `recipes_name_unique` (unico GLOBAL sobre el nombre normalizado, de QC-24) salio de esta
  // lista el 2026-09-16 con QC-50. NO es un indice perdido por descuido, que es justo lo que
  // este caso vigila: la unicidad del nombre de receta pasa a medirse POR EMPRESA porque dos
  // empresas pueden tener cada una su misma receta. Un unico global lo
  // impediria. Su sustituto es UN solo indice compuesto PARCIAL,
  // `recipes_company_name_unique`, que se afirma abajo en su propio caso: si la migracion se
  // hubiera llevado el global SIN dejar el compuesto, el catalogo de recetas se quedaria sin
  // ninguna garantia de unicidad y este archivo seguiria siendo quien lo dijera.
  // `suppliers_name_unique` (unico GLOBAL y PARCIAL sobre el nombre normalizado, de QC-42) salio
  // de esta lista el 2026-09-17. NO es un indice perdido por descuido, que es justo lo que este
  // caso vigila: la unicidad del nombre de proveedor pasa a medirse POR EMPRESA porque dos
  // empresas pueden tener cada una su mismo proveedor -se surten del mismo sitio- y con el
  // global la segunda no podria darlo de alta. Su sustituto es UN solo indice compuesto y
  // TAMBIEN PARCIAL, `suppliers_company_name_unique`, que se afirma abajo en su propio caso: si
  // la migracion se hubiera llevado el global SIN dejar el compuesto, el listado de proveedores
  // se quedaria sin ninguna garantia de unicidad y este archivo seguiria siendo quien lo dijera.
  'supplier_catalog_lines_name_presentation_unique',
  // `products_presentation_id_idx` cayo el 2026-09-09 con la columna `products.presentation_id`,
  // en la misma migracion que creo `product_batches`: la presentacion se mudo al lote, y el
  // lado hijo de la FK ya no es `products` sino `product_batches` (cuyo indice, tambien
  // del lado hijo, esta arriba en `PARTIAL_INDEXES`).
  // `products_unit_id_idx` salio de esta lista el 2026-09-11 con QC-80 -el producto dejaba de
  // declarar unidad- y vuelve a existir el 2026-09-18, cuando el producto la vuelve a declarar
  // como columna propia y fija: se afirma en `ALL_INDEXES`, no aqui.
  'supplier_catalog_lines_presentation_id_idx',
  'supplier_catalog_lines_unit_id_idx',
  'orders_recipe_id_idx',
  // `orders_unit_id_idx` (indice de la FK que QC-33 creo) cayo el 2026-09-07 con la columna
  // `orders.unit_id`, en la misma migracion.
  // `orders_order_year_order_sequence_key` (unico GLOBAL sobre `(order_year, order_sequence)`)
  // salio de esta lista el 2026-09-15 con QC-60. NO es un indice perdido por descuido, que es
  // justo lo que este caso vigila: la numeracion de pedidos pasa a ser POR EMPRESA, porque con el
  // global dos empresas no podrian llevar cada una su propia serie. Su sustituto es UN solo indice
  // compuesto, `orders_company_year_sequence_key`, que se afirma abajo en su propio caso: si la
  // migracion se hubiera llevado el global SIN dejar el compuesto, la numeracion se quedaria sin
  // ninguna garantia de unicidad y este archivo seguiria siendo quien lo dijera.
] as const

/**
 * Los CUATRO indices unicos PARCIALES con los que QC-76 sustituyo al `units_name_normalized_key`
 * global: dos para el nombre normalizado y dos para el simbolo, cada pareja partida en «de la
 * empresa» (`company_id IS NOT NULL`) y «de sistema» (`company_id IS NULL`). Son parciales
 * porque en un unico normal dos `NULL` no chocan, y `UNIQUE (company_id, name_normalized)` a
 * secas dejaria meter «kilogramo» de sistema tantas veces como se quisiera.
 */
const UNIT_SCOPE_INDEXES = [
  'units_company_name_unique',
  'units_system_name_unique',
  'units_company_symbol_unique',
  'units_system_symbol_unique',
] as const

describe('QC-57 — la migracion en la base (R21, R23)', () => {
  it('products.name_normalized existe, es texto y es NOT NULL', async () => {
    const rows = await prisma.$queryRaw<
      { data_type: string; is_nullable: string; column_default: string | null }[]
    >`
      SELECT data_type, is_nullable, column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'products'
        AND column_name = 'name_normalized'`
    expect(rows).toHaveLength(1)
    expect(rows[0]?.data_type).toBe('text')
    expect(rows[0]?.is_nullable).toBe('NO')
    // Sin DEFAULT a proposito: quien escriba un producto TIENE que calcular la columna.
    expect(rows[0]?.column_default).toBeNull()
  })

  it('la extension pg_trgm esta instalada (via A)', async () => {
    // Sin ella los seis indices de busqueda ni siquiera se pueden crear. Es la dependencia de
    // INFRAESTRUCTURA que ninguna guardia vigila (no es un paquete de npm): este caso es el
    // unico sitio del arnes que lo comprueba.
    const rows = await prisma.$queryRaw<{ extname: string }[]>`
      SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'`
    expect(rows).toHaveLength(1)
  })

  it('los 35 indices nuevos existen, cada uno con su nombre exacto', async () => {
    const indexes = await readIndexes()
    // 35 desde el 2026-09-18: `products_stock_idx` vuelve con la columna guardada
    // (`20260918130000_product_unit_and_stored_stock`). Antes eran 34, desde que
    // `recipes_name_normalized_all_trgm_idx` sumo uno (QC-68) sobre las 33 que quedaron cuando
    // `products_stock_idx` cayo con su columna el 2026-09-17 (QC-91 R2).
    expect(ALL_INDEXES).toHaveLength(35)
    const faltan = ALL_INDEXES.filter((name) => !indexes.has(name))
    expect(faltan, `indices que la base no tiene: ${faltan.join(', ')}`).toEqual([])
  })

  it('products_stock_idx vuelve a existir', async () => {
    const indexes = await readIndexes()
    expect(indexes.has('products_stock_idx')).toBe(true)
  })

  it('los siete de busqueda son GIN de trigramas sobre name_normalized', async () => {
    // Que existan no basta: un btree con el mismo nombre dejaria la busqueda por subcadena
    // sin indice y en verde. Se lee la DEFINICION, no solo el nombre.
    const indexes = await readIndexes()
    for (const name of SEARCH_INDEXES) {
      const def = indexes.get(name)
      expect(def, `falta ${name}`).toBeDefined()
      expect(def, `${name} deberia ser USING gin`).toContain('USING gin')
      expect(def, `${name} deberia usar gin_trgm_ops`).toContain('gin_trgm_ops')
      expect(def, `${name} deberia ir sobre name_normalized`).toContain('name_normalized')
    }

    // El nuevo (QC-68) es el unico de los siete que NO lleva WHERE: es total a proposito.
    const total = indexes.get('recipes_name_normalized_all_trgm_idx')
    expect(total, 'falta recipes_name_normalized_all_trgm_idx').toBeDefined()
    expect(total, 'deberia ser total: sin WHERE').not.toContain('WHERE')
  })

  it('los de las tablas con borrado logico son parciales, con WHERE deleted_at IS NULL', async () => {
    const indexes = await readIndexes()
    for (const name of PARTIAL_INDEXES) {
      const def = indexes.get(name)
      expect(def, `falta ${name}`).toBeDefined()
      expect(def, `${name} deberia ser parcial`).toMatch(/WHERE \(deleted_at IS NULL\)/u)
    }
  })

  it('los de presentations y units son totales: esas tablas no tienen deleted_at', async () => {
    const indexes = await readIndexes()
    for (const name of FULL_INDEXES) {
      const def = indexes.get(name)
      expect(def, `falta ${name}`).toBeDefined()
      expect(def, `${name} no puede filtrar por una columna inexistente`).not.toContain('deleted_at')
    }
  })

  it('ningun indice nuevo indexa deleted_at como COLUMNA (decision cerrada 8)', async () => {
    const indexes = await readIndexes()
    for (const name of ALL_INDEXES) {
      const def = indexes.get(name) ?? ''
      const columnas = /USING \w+ \(([^)]*)\)/u.exec(def)?.[1] ?? ''
      expect(columnas, `columnas indexadas de ${name}: ${def}`).not.toContain('deleted_at')
    }
  })

  it('los indices que ya existian siguen todos ahi', async () => {
    const indexes = await readIndexes()
    const perdidos = PRE_EXISTING_INDEXES.filter((name) => !indexes.has(name))
    expect(perdidos, `indices anteriores que la migracion se llevo: ${perdidos.join(', ')}`).toEqual(
      [],
    )
  })

  it('el unico de nombre de presentacion es POR EMPRESA, y el global ya no esta (QC-49 R20)', async () => {
    // El RELEVO de `presentations_name_normalized_key`, que sale de `PRE_EXISTING_INDEXES`
    // arriba. Los dos no pueden convivir: con el global en pie, dos empresas seguirian sin
    // poder tener cada una su «Garrafa 20 L», que es lo que R20 abre.
    const indexes = await readIndexes()
    const compuesto = indexes.get('presentations_company_name_unique')
    expect(compuesto, 'falta presentations_company_name_unique').toBeDefined()
    expect(compuesto).toContain('UNIQUE')
    // `company_id` va DE CABEZA: asi el mismo indice sirve para la verificacion del RESTRICT de
    // `presentations_company_id_fkey` y `presentations` no necesita uno propio de empresa (R10).
    expect(compuesto).toMatch(/\(company_id, name_normalized\)/u)
    // Y NO es parcial: esa verificacion tiene que ver todas las filas.
    expect(compuesto).not.toContain('WHERE')

    expect(indexes.has('presentations_name_normalized_key')).toBe(false)
  })

  it('el unico de nombre de receta es POR EMPRESA y PARCIAL, y el global ya no esta (QC-50 R9, R10)', async () => {
    // El RELEVO de `recipes_name_unique`, que sale de `PRE_EXISTING_INDEXES` arriba. Los dos no
    // pueden convivir: con el global en pie, dos empresas seguirian sin poder tener cada una su
    // misma receta.
    //
    // A DIFERENCIA del molde de presentaciones (arriba, `presentations_company_name_unique`),
    // que es TOTAL porque `presentations` no tiene borrado logico, este indice es PARCIAL: la
    // tabla `recipes` SI tiene `deleted_at` (ver `PARTIAL_INDEXES`), y sin el `WHERE deleted_at
    // IS NULL` borrar una receta dejaria su nombre ocupado PARA SIEMPRE dentro de la empresa,
    // sin que ninguna alta pudiera reusarlo. Si alguien quitara el `WHERE` de la migracion este
    // caso se pone ROJO en su ultima asercion, aunque las columnas sigan siendo las correctas.
    const indexes = await readIndexes()
    const compuesto = indexes.get('recipes_company_name_unique')
    expect(compuesto, 'falta recipes_company_name_unique').toBeDefined()
    expect(compuesto).toContain('UNIQUE')
    // `company_id` va DE CABEZA: mismo motivo que en presentaciones y pedidos.
    expect(compuesto).toMatch(/\(company_id, name_normalized\)/u)
    // Y ES parcial, con el mismo WHERE que el resto de indices de esta tabla con borrado
    // logico: esta es la asercion que la falsabilidad del caso depende de que exista.
    expect(compuesto, `${compuesto ?? ''} deberia ser parcial`).toMatch(/WHERE \(deleted_at IS NULL\)/u)

    expect(indexes.has('recipes_name_unique')).toBe(false)
  })

  it('el unico de nombre de proveedor es POR EMPRESA y PARCIAL, y el global ya no esta (R13, R14, R15)', async () => {
    // El RELEVO de `suppliers_name_unique`, que sale de `PRE_EXISTING_INDEXES` arriba. Los dos
    // no pueden convivir: con el global en pie, dos empresas seguirian sin poder tener cada una
    // al mismo proveedor dado de alta.
    //
    // Mismo molde que el de recetas, y por el mismo motivo: `suppliers` tiene `deleted_at` (ver
    // `PARTIAL_INDEXES`), asi que sin el `WHERE deleted_at IS NULL` dar de baja un proveedor
    // dejaria su nombre ocupado PARA SIEMPRE dentro de la empresa y ninguna alta podria
    // reusarlo. Por eso el predicado se exige LITERAL y no basta con que haya un `WHERE`
    // cualquiera: un `WHERE deleted_at IS NOT NULL` tambien traeria la palabra y significaria lo
    // contrario.
    const indexes = await readIndexes()
    const compuesto = indexes.get('suppliers_company_name_unique')
    expect(compuesto, 'falta suppliers_company_name_unique').toBeDefined()
    expect(compuesto).toContain('UNIQUE')
    // `company_id` va DE CABEZA: asi el mismo indice sirve para filtrar el listado por empresa,
    // sin que la tabla necesite un indice propio de la columna.
    expect(compuesto).toMatch(/\(company_id, name_normalized\)/u)
    expect(compuesto, `${compuesto ?? ''} deberia ser parcial`).toMatch(
      /WHERE \(deleted_at IS NULL\)/u,
    )

    // FALSABILIDAD, y en memoria para no tocar la base: el mismo `def` que acaba de pasar, con
    // su `WHERE` recortado, tiene que FALLAR la asercion de arriba. Sin esto, un dia en que
    // `pg_indexes` devolviera la definicion en otro formato el caso pasaria en verde sin medir
    // nada, que es exactamente el falso verde que la parcialidad no se puede permitir.
    const sinWhere = (compuesto ?? '').replace(/\s*WHERE \(deleted_at IS NULL\)/u, '')
    expect(sinWhere, 'el recorte no quito el WHERE: la falsabilidad no prueba nada').not.toBe(
      compuesto,
    )
    expect(sinWhere).not.toMatch(/WHERE \(deleted_at IS NULL\)/u)
    // Y lo que NO cambia al recortarlo: sigue siendo UNIQUE y sigue llevando las dos columnas en
    // orden. Es la prueba de que la asercion del predicado mide el predicado y no otra cosa.
    expect(sinWhere).toContain('UNIQUE')
    expect(sinWhere).toMatch(/\(company_id, name_normalized\)/u)

    expect(indexes.has('suppliers_name_unique')).toBe(false)
  })

  it('el unico del numero de pedido es POR EMPRESA, y el global ya no esta (QC-60)', async () => {
    // El RELEVO de `orders_order_year_order_sequence_key`, que sale de `PRE_EXISTING_INDEXES`
    // arriba. Los dos no pueden convivir: con el global en pie, dos empresas seguirian sin poder
    // llevar cada una su propia serie de numeracion.
    const indexes = await readIndexes()
    const compuesto = indexes.get('orders_company_year_sequence_key')
    expect(compuesto, 'falta orders_company_year_sequence_key').toBeDefined()
    expect(compuesto).toContain('UNIQUE')
    // `company_id` va DE CABEZA: asi el mismo indice sirve para filtrar por empresa y para la
    // verificacion del RESTRICT de la FK de empresa, sin un indice propio de empresa.
    expect(compuesto).toMatch(/\(company_id, order_year, order_sequence\)/u)
    // Y NO es parcial: un pedido borrado o cancelado conserva su numero.
    expect(compuesto).not.toContain('WHERE')

    expect(indexes.has('orders_order_year_order_sequence_key')).toBe(false)
  })

  it('el indice de la unidad de la presentacion existe y va sobre unit_id (QC-80 R3)', async () => {
    // El relevo del `products_unit_id_idx` que salio de `PRE_EXISTING_INDEXES`. Es el indice del
    // lado hijo de `presentations_unit_id_fkey`: sin el, cada borrado de unidad tendria que
    // recorrer `presentations` entera para comprobar el RESTRICT.
    const indexes = await readIndexes()
    const def = indexes.get('presentations_unit_id_idx')
    expect(def, 'falta presentations_unit_id_idx').toBeDefined()
    expect(def).toContain('unit_id')
    expect(def, 'no es unico: varias presentaciones comparten unidad').not.toContain('UNIQUE')
  })

  it('la unicidad del catalogo de unidades sigue garantizada, ahora POR AMBITO (QC-76 R14, R15)', async () => {
    // El relevo del `units_name_normalized_key` global que salio de `PRE_EXISTING_INDEXES`.
    // Este caso es la mitad que impide que aquella retirada se lea como permiso para dejar el
    // catalogo sin garantia: los cuatro tienen que existir, ser UNICOS y ser PARCIALES -su
    // `WHERE` es lo que separa «de la empresa» de «de sistema», y sin el dos unidades de
    // sistema con el mismo nombre volverian a caber, que es exactamente lo que R14 prohibe-.
    const indexes = await readIndexes()

    for (const name of UNIT_SCOPE_INDEXES) {
      const def = indexes.get(name)
      expect(def, `falta el indice de ambito ${name} (QC-76 R14/R15)`).toBeDefined()
      expect(def, `${name} tiene que ser UNICO: ${def ?? ''}`).toContain('CREATE UNIQUE INDEX')
      expect(def, `${name} tiene que ser PARCIAL, con su WHERE: ${def ?? ''}`).toContain('WHERE')
    }
  })

  it('products.name_normalized no tiene ningun indice UNICO (el nombre no es unico)', async () => {
    // Decision cerrada 6 de QC-14. Si alguien lo anadiera, dos productos homonimos —que la
    // base acepta a proposito— empezarian a fallar con un 23505.
    const indexes = await readIndexes()
    const unicosSobreLaColumna = [...indexes.entries()].filter(
      ([, def]) =>
        def.includes('ON public.products') &&
        def.includes('name_normalized') &&
        def.includes('UNIQUE'),
    )
    expect(unicosSobreLaColumna).toEqual([])
  })

  it('el backfill dejo la columna igual a lo que devuelve normalizeProductName (R23)', async () => {
    // El corazon de R23: la columna tiene que estar poblada para las filas que YA existian,
    // no solo para las que se escriban despues, y con EL MISMO valor que calcularia el
    // dominio. El SQL de la migracion usa `translate`, el dominio usa NFD: dos caminos
    // distintos que tienen que dar el mismo resultado, y este es el unico sitio donde eso se
    // comprueba de verdad. Se recorren TODAS las filas, borradas incluidas.
    const rows = await prisma.product.findMany({
      select: { id: true, name: true, nameNormalized: true },
    })
    const discrepantes = rows.filter((row) => row.nameNormalized !== normalizeProductName(row.name))
    expect(
      discrepantes.map((row) => `${row.name} -> ${row.nameNormalized}`),
      'filas cuya columna no coincide con normalizeProductName',
    ).toEqual([])
    // Y ninguna quedo vacia por no haberse rellenado: la clave vacia solo puede salir de un
    // nombre que se normaliza a vacio, y los nombres de producto pasan por zod antes.
    expect(rows.filter((row) => row.nameNormalized === '' && row.name.trim() !== '')).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// La escritura de la columna por el camino real (T5)
// ---------------------------------------------------------------------------

describe('QC-57 — el adaptador escribe name_normalized en toda alta y edicion (R19, R23)', () => {
  it('la escribe al crear y la RECALCULA al editar, con la misma definicion del dominio', async () => {
    let productId: string | null = null
    try {
      // Nombre con acentos, mayusculas y signos: los tres caminos que la normalizacion tiene
      // que aplanar. Es el ejemplo literal de la decision cerrada 9 («solucion» encuentra
      // «Solución Buffer pH 7»).
      const nombreAlta = `Solución Buffer pH 7 ${token()}`
      const created = await createProduct(
        // QC-80 (R21): `NewProduct` ya no lleva unidad; el producto no la declara.
        { name: nombreAlta, qtyAlert: '1' },
        new Date('2026-01-01T00:00:00Z'),
        ambito(),
      )
      productId = created.id

      const trasAlta = await prisma.product.findUniqueOrThrow({
        where: { id: created.id },
        select: { name: true, nameNormalized: true },
      })
      expect(trasAlta.name).toBe(nombreAlta)
      expect(trasAlta.nameNormalized).toBe(normalizeProductName(nombreAlta))
      // Y de verdad esta aplanado: ni acentos, ni mayusculas, ni espacios.
      expect(trasAlta.nameNormalized).toMatch(/^[a-z0-9]+$/u)
      expect(trasAlta.nameNormalized).toContain('solucionbufferph7')

      const nombreEdicion = `Hipoclorito de sodio 5% ${token()}`
      const ok = await updateAliveProduct(
        created.id,
        { name: nombreEdicion, qtyAlert: '1' },
        new Date('2026-01-02T00:00:00Z'),
        ambito(),
      )
      expect(ok).toBe(true)

      const trasEdicion = await prisma.product.findUniqueOrThrow({
        where: { id: created.id },
        select: { name: true, nameNormalized: true },
      })
      // La mitad que se rompe sola si alguien escribe `name` y se olvida de la columna: el
      // producto quedaria encontrable por su nombre VIEJO y no por el nuevo, en silencio.
      expect(trasEdicion.name).toBe(nombreEdicion)
      expect(trasEdicion.nameNormalized).toBe(normalizeProductName(nombreEdicion))
      expect(trasEdicion.nameNormalized).not.toBe(trasAlta.nameNormalized)
    } finally {
      if (productId !== null) await prisma.product.delete({ where: { id: productId } })
    }
  })

  it('dos productos con el mismo nombre comparten clave y la base los acepta', async () => {
    // La consecuencia de que la columna NO sea unica (decision cerrada 6 de QC-14), probada
    // contra la base real: si alguien anadiera el indice unico «por simetria» con las otras
    // cinco tablas, este caso lo caza con un 23505 en vez de descubrirse en produccion.
    let ids: string[] = []
    try {
      const nombre = `Sosa caustica ${token()}`
      const data = { name: nombre, qtyAlert: null }

      const primero = await createProduct(data, new Date('2026-01-01T00:00:00Z'), ambito())
      const segundo = await createProduct(
        { ...data, name: nombre.toUpperCase() },
        new Date('2026-01-01T00:00:00Z'),
        ambito(),
      )
      ids = [primero.id, segundo.id]

      const rows = await prisma.product.findMany({
        where: { id: { in: ids } },
        select: { id: true, nameNormalized: true },
      })
      expect(rows).toHaveLength(2)
      expect(new Set(rows.map((row) => row.nameNormalized)).size).toBe(1)
    } finally {
      if (ids.length > 0) await prisma.product.deleteMany({ where: { id: { in: ids } } })
    }
  })
})
