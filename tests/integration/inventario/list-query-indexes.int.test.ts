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

import { describe, expect, it } from 'vitest'

import { normalizeProductName } from '@/lib/modules/inventario'
import {
  createProduct,
  updateAliveProduct,
} from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma'
import { prisma } from '@/lib/shared/db/prisma'

import type { Prisma } from '@prisma/client'

type Db = Prisma.TransactionClient

function token(): string {
  return randomUUID().replace(/-/gu, '')
}

/** Copia local de la normalizacion, para los datos de APOYO (presentacion, unidad). */
function normalizeForTest(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]/gu, '')
}

async function createTestPresentation(db: Db): Promise<string> {
  const name = `Bidon ${token()}`
  const presentation = await db.presentation.create({
    data: { name, nameNormalized: normalizeForTest(name) },
    select: { id: true },
  })
  return presentation.id
}

/** Usuario REAL: `created_by`/`updated_by` son FK a `users` (escritas a mano, QC-20). */
async function createTestUser(db: Db): Promise<string> {
  const marker = token()
  const documentType = await db.documentType.create({
    data: { code: `DOC${marker.slice(0, 8)}`, name: 'Tipo de documento de prueba' },
    select: { code: true },
  })
  const role = await db.role.create({
    data: { name: `rol-${marker}`, description: 'Rol de prueba' },
    select: { id: true },
  })
  const user = await db.user.create({
    data: {
      firstNames: 'Ana Maria',
      lastNames: 'Perez Gomez',
      birthDate: new Date('1990-05-17T00:00:00.000Z'),
      email: `ana.${marker}@quimicloude.test`,
      phone: '+57 300 111 2233',
      documentTypeCode: documentType.code,
      documentNumber: marker.slice(0, 12),
      username: `ana.${marker}`,
      passwordHash: 'hash-de-prueba-no-es-un-algoritmo-real',
      roleId: role.id,
    },
    select: { id: true },
  })
  return user.id
}

async function deleteTestUser(db: Db, userId: string): Promise<void> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { roleId: true, documentTypeCode: true },
  })
  await db.user.delete({ where: { id: userId } })
  await db.role.delete({ where: { id: user.roleId } })
  await db.documentType.delete({ where: { code: user.documentTypeCode } })
}

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

/** Los seis indices de busqueda: GIN de trigramas sobre `name_normalized`. */
const SEARCH_INDEXES = [
  'products_name_normalized_trgm_idx',
  'presentations_name_normalized_trgm_idx',
  'recipes_name_normalized_trgm_idx',
  'suppliers_name_normalized_trgm_idx',
  'supplier_catalog_lines_name_normalized_trgm_idx',
  'units_name_normalized_trgm_idx',
] as const

/** Los de las cinco tablas con borrado logico: PARCIALES (R7). */
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

const ALL_INDEXES = [...PARTIAL_INDEXES, ...FULL_INDEXES] as const

/**
 * Los que YA existian antes de esta migracion. Se afirma que SIGUEN ahi: la mina de esta
 * ficha era que una migracion generada se llevara por delante lo que Prisma no conoce, y un
 * indice unico que desaparece no rompe ningun test hasta el dia que alguien duplica un nombre.
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
    expect(ALL_INDEXES).toHaveLength(35)
    const faltan = ALL_INDEXES.filter((name) => !indexes.has(name))
    expect(faltan, `indices que la base no tiene: ${faltan.join(', ')}`).toEqual([])
  })

  it('los seis de busqueda son GIN de trigramas sobre name_normalized', async () => {
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
    let presentationId: string | null = null
    let actorId: string | null = null
    try {
      presentationId = await createTestPresentation(prisma)
      actorId = await createTestUser(prisma)

      // Nombre con acentos, mayusculas y signos: los tres caminos que la normalizacion tiene
      // que aplanar. Es el ejemplo literal de la decision cerrada 9 («solucion» encuentra
      // «Solución Buffer pH 7»).
      const nombreAlta = `Solución Buffer pH 7 ${token()}`
      const created = await createProduct(
        { name: nombreAlta, presentationId, stock: 3, qtyAlert: 1, unitId: null },
        actorId,
        new Date('2026-01-01T00:00:00Z'),
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
        { name: nombreEdicion, presentationId, stock: 3, qtyAlert: 1, unitId: null },
        actorId,
        new Date('2026-01-02T00:00:00Z'),
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
      if (presentationId !== null) await prisma.presentation.delete({ where: { id: presentationId } })
      if (actorId !== null) await deleteTestUser(prisma, actorId)
    }
  })

  it('dos productos con el mismo nombre comparten clave y la base los acepta', async () => {
    // La consecuencia de que la columna NO sea unica (decision cerrada 6 de QC-14), probada
    // contra la base real: si alguien anadiera el indice unico «por simetria» con las otras
    // cinco tablas, este caso lo caza con un 23505 en vez de descubrirse en produccion.
    let ids: string[] = []
    let presentationId: string | null = null
    let actorId: string | null = null
    try {
      presentationId = await createTestPresentation(prisma)
      actorId = await createTestUser(prisma)
      const nombre = `Sosa caustica ${token()}`
      const data = { name: nombre, presentationId, stock: null, qtyAlert: null, unitId: null }

      const primero = await createProduct(data, actorId, new Date('2026-01-01T00:00:00Z'))
      const segundo = await createProduct(
        { ...data, name: nombre.toUpperCase() },
        actorId,
        new Date('2026-01-01T00:00:00Z'),
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
      if (presentationId !== null) await prisma.presentation.delete({ where: { id: presentationId } })
      if (actorId !== null) await deleteTestUser(prisma, actorId)
    }
  })
})
