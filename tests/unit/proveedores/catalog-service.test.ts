// T9 (QC-43) — Los cuatro casos de uso del catalogo, con DOBLES del repositorio y del
// contrato de `inventario`.
//
// Cubre R25, R26, R27, R31, R33, R34, R35, R36 y R37 (`tasks.md > Grupo B`). El doble de
// `ProductCatalog` no solo responde: CUENTA cuantas veces le preguntan, porque «una sola
// llamada por operacion» (`design.md > 5.3`) es la mitad del requisito -la otra es que se
// pregunte al contrato y no a `prisma.product`, que cierran `module-contract.test.ts` y la
// guardia de arquitectura-.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it, vi } from 'vitest'

import { ROLE_ADMINISTRADOR } from '@/lib/modules/identity'
import { createCreateCatalogLine } from '@/lib/modules/proveedores/domain/create-catalog-line'
import { createDeleteCatalogLine } from '@/lib/modules/proveedores/domain/delete-catalog-line'
import {
  DuplicateCatalogLineError,
  NotFoundError,
  ProductNotFoundError,
} from '@/lib/modules/proveedores/domain/errors'
import { createListCatalogLines } from '@/lib/modules/proveedores/domain/list-catalog-lines'
import { createUpdateCatalogLine } from '@/lib/modules/proveedores/domain/update-catalog-line'

import type { ProductRef } from '@/lib/modules/inventario'
import type { Actor } from '@/lib/modules/proveedores/domain/actor'
import type { CatalogLineView } from '@/lib/modules/proveedores/domain/catalog-line-view'
import type { SupplierCatalogRepository } from '@/lib/modules/proveedores/ports/supplier-catalog-repository'

const moduloDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'lib',
  'modules',
  'proveedores',
)
const read = (...partes: readonly string[]): string =>
  readFileSync(join(moduloDir, ...partes), 'utf8')

const ADMIN: Actor = { id: '11111111-1111-4111-8111-111111111111', roleName: ROLE_ADMINISTRADOR }
const AHORA = new Date('2026-09-03T12:00:00.000Z')
const now = () => AHORA

const SUPPLIER_ID = '22222222-2222-4222-8222-222222222222'
const PRODUCTO_VIVO = '33333333-3333-4333-8333-333333333333'
const PRODUCTO_DE_BAJA = '44444444-4444-4444-8444-444444444444'

const ALTA_VALIDA = {
  supplierId: SUPPLIER_ID,
  productId: PRODUCTO_VIVO,
  cost: '12.5000',
  minPurchase: null,
  deliveryTime: null,
}

/** Doble del repositorio del catalogo: espias con resultado exitoso por defecto. */
function makeCatalog(overrides: Partial<SupplierCatalogRepository> = {}): {
  readonly repo: SupplierCatalogRepository
  readonly spies: Record<keyof SupplierCatalogRepository, ReturnType<typeof vi.fn>>
} {
  const spies = {
    create: vi.fn(async () => ({ id: 'linea-1' })),
    updateTerms: vi.fn(async () => 'ok'),
    deleteById: vi.fn(async () => 'deleted'),
    listBySupplierAlive: vi.fn(async () => ({
      items: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    })),
  }
  // Los `overrides` REEMPLAZAN al espia por defecto, asi que `spies` tiene que ser el
  // objeto ya fusionado: si no, una asercion sobre un metodo sobrescrito miraria un espia
  // que nadie llamo y pasaria por vacio.
  const repo = { ...spies, ...overrides }
  return {
    repo: repo as unknown as SupplierCatalogRepository,
    spies: repo as unknown as Record<keyof SupplierCatalogRepository, ReturnType<typeof vi.fn>>,
  }
}

/**
 * Doble del contrato de `inventario`. Devuelve SOLO los ids que estan en `vivos`, que es
 * exactamente lo que hace `findRefs` de verdad (`design.md > 5.3`): un producto dado de
 * baja no vuelve, y por eso «no existe» y «esta de baja» son el mismo caso.
 */
function makeProducts(vivos: readonly string[]): {
  readonly products: { findRefs: (ids: readonly string[]) => Promise<readonly ProductRef[]> }
  readonly findRefs: ReturnType<typeof vi.fn>
} {
  const findRefs = vi.fn(async (ids: readonly string[]) =>
    ids
      .filter((id) => vivos.includes(id))
      .map((id) => ({ id, name: `Producto ${id.slice(0, 4)}`, unitId: null })),
  )
  return { products: { findRefs }, findRefs }
}

/** Fila del catalogo tal como la devuelve el puerto: con `productName` todavia en null. */
function linea(id: string, productId: string): CatalogLineView {
  return {
    id,
    supplierId: SUPPLIER_ID,
    productId,
    productName: null,
    cost: '12.5000',
    minPurchase: null,
    deliveryTime: null,
    createdAt: AHORA,
    updatedAt: AHORA,
    createdBy: ADMIN.id,
    updatedBy: ADMIN.id,
  }
}

describe('casos de uso del catalogo del proveedor (QC-43 T9)', () => {
  it('rechaza la linea cuyo producto no existe o esta dado de baja, preguntando al contrato de inventario', async () => {
    // R26. Se pregunta UNA vez, con la lista de ids, y el repositorio NO se toca cuando el
    // producto no vuelve. Mutacion que lo pone rojo: quitar el `if (refs.length === 0)` de
    // `create-catalog-line.ts`, o preguntar despues de escribir en vez de antes.
    const { repo, spies } = makeCatalog()
    const { products, findRefs } = makeProducts([PRODUCTO_VIVO])

    const fallo = await createCreateCatalogLine({ catalog: repo, products, now })(
      { ...ALTA_VALIDA, productId: PRODUCTO_DE_BAJA },
      ADMIN,
    ).catch((error: unknown) => error)

    expect(fallo).toBeInstanceOf(ProductNotFoundError)
    expect((fallo as ProductNotFoundError).code).toBe('product_not_found')
    expect(spies.create).not.toHaveBeenCalled()
    expect(findRefs).toHaveBeenCalledTimes(1)
    expect(findRefs).toHaveBeenCalledWith([PRODUCTO_DE_BAJA])

    // Y con el producto vivo, la misma alta pasa y devuelve el identificador (R25).
    const creada = await createCreateCatalogLine({ catalog: repo, products, now })(
      ALTA_VALIDA,
      ADMIN,
    )
    expect(creada).toEqual({ id: 'linea-1' })
  })

  it('traduce el duplicado del puerto a error de linea repetida', async () => {
    // R27. El 23505 del indice unico (supplier_id, product_id) llega ya traducido a un
    // resultado discriminado; el dominio lo convierte en su error con `code` estable y no
    // intenta ninguna segunda escritura.
    const { repo, spies } = makeCatalog({ create: vi.fn(async () => 'duplicate' as const) })
    const { products } = makeProducts([PRODUCTO_VIVO])

    const fallo = await createCreateCatalogLine({ catalog: repo, products, now })(
      ALTA_VALIDA,
      ADMIN,
    ).catch((error: unknown) => error)

    expect(fallo).toBeInstanceOf(DuplicateCatalogLineError)
    expect((fallo as DuplicateCatalogLineError).code).toBe('duplicate_catalog_line')
    expect(spies.updateTerms).not.toHaveBeenCalled()

    // Y el proveedor inexistente -la FK- es «no encontrado», no un duplicado (R25).
    const sinProveedor = makeCatalog({ create: vi.fn(async () => 'supplier_not_found' as const) })
    await expect(
      createCreateCatalogLine({ catalog: sinProveedor.repo, products, now })(ALTA_VALIDA, ADMIN),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('guarda al actor como autor de creacion y de modificacion de la linea, y al editarla no toca ningun dato del proveedor', async () => {
    // R31. El puerto recibe el `actorId` y el instante inyectado en las dos operaciones.
    // Que al crear se escriban las DOS columnas de autor y al editar solo `updated_by` es
    // del adaptador (T12) y se prueba contra Postgres en T18; lo que se cierra aqui es que
    // el dominio no manda ningun dato de proveedor en la edicion -no tiene con que
    // tocarlo- y que la edicion no llama a ningun repositorio de proveedores.
    const { repo, spies } = makeCatalog()
    const { products } = makeProducts([PRODUCTO_VIVO])

    await createCreateCatalogLine({ catalog: repo, products, now })(ALTA_VALIDA, ADMIN)
    expect(spies.create).toHaveBeenCalledWith(expect.anything(), ADMIN.id, AHORA)

    await createUpdateCatalogLine({ catalog: repo, now })(
      'linea-1',
      { cost: '9.0000', minPurchase: null, deliveryTime: null },
      ADMIN,
    )
    expect(spies.updateTerms).toHaveBeenCalledWith('linea-1', expect.anything(), ADMIN.id, AHORA)

    // La edicion depende SOLO del repositorio del catalogo: no hay repositorio de
    // proveedores en sus dependencias, asi que no puede escribir en `suppliers`.
    // Mutacion que lo pone rojo: anadir `readonly suppliers: SupplierRepository` a
    // `UpdateCatalogLineDeps`.
    expect(clavesDelTipoDeps(read('domain', 'update-catalog-line.ts'))).toEqual(['catalog', 'now'])
  })

  it('la edicion cambia solo costo, minimo y plazo', async () => {
    // R33. El dato que llega al puerto tiene EXACTAMENTE las tres condiciones comerciales:
    // ni `supplierId` ni `productId`. Mutacion que lo pone rojo: pasarle `parsed.data` con
    // un `supplierId` colado, o cambiar el esquema de edicion para que lo admita.
    const { repo, spies } = makeCatalog()

    await createUpdateCatalogLine({ catalog: repo, now })(
      'linea-1',
      { cost: '9.0000', minPurchase: '25.0000', deliveryTime: 3 },
      ADMIN,
    )
    expect(spies.updateTerms.mock.calls[0]?.[1]).toEqual({
      cost: '9.0000',
      minPurchase: '25.0000',
      deliveryTime: 3,
    })

    // R30: lo que no se indica llega como AUSENCIA explicita, nunca como `undefined`.
    await createUpdateCatalogLine({ catalog: repo, now })('linea-1', { cost: '9.0000' }, ADMIN)
    expect(spies.updateTerms.mock.calls[1]?.[1]).toEqual({
      cost: '9.0000',
      minPurchase: null,
      deliveryTime: null,
    })

    // Y la baja de la linea es FISICA (R34): el puerto solo ofrece `deleteById`, no hay
    // ningun `softDelete` que llamar.
    const { repo: repo2, spies: spies2 } = makeCatalog()
    await createDeleteCatalogLine({ catalog: repo2 })('linea-1', ADMIN)
    expect(spies2.deleteById).toHaveBeenCalledWith('linea-1')
    expect(metodosDelPuerto()).toEqual([
      'create',
      'deleteById',
      'listBySupplierAlive',
      'updateTerms',
    ])

    // Y una linea inexistente es «no encontrado» (R34, R24).
    const vacio = makeCatalog({ deleteById: vi.fn(async () => 'not_found' as const) })
    await expect(
      createDeleteCatalogLine({ catalog: vacio.repo })('linea-x', ADMIN),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('el catalogo se consulta con su propio listado paginado y ordenado', async () => {
    // R35, R36 y R37, mas la parte de R26 que dice «una sola llamada»:
    //
    // - el listado es propio y paginado: recibe el proveedor y la consulta de pagina, y
    //   devuelve la pagina tal cual la dio el puerto -con `total` y `pageSize` efectivos-;
    // - se pregunta al catalogo de productos UNA sola vez para TODA la pagina, con los tres
    //   ids juntos. Mutacion que lo pone rojo: mover el `findRefs` dentro del `map` de
    //   lineas -tres llamadas y `toHaveBeenCalledTimes(1)` cae-;
    // - la linea del producto dado de baja SIGUE en la pagina, con `productName` en null.
    const PRODUCTO_VIVO_2 = '55555555-5555-4555-8555-555555555555'
    const { repo, spies } = makeCatalog({
      listBySupplierAlive: vi.fn(async () => ({
        items: [
          linea('l-1', PRODUCTO_VIVO),
          linea('l-2', PRODUCTO_DE_BAJA),
          linea('l-3', PRODUCTO_VIVO_2),
        ],
        total: 3,
        page: 1,
        pageSize: 10,
        totalPages: 1,
      })),
    })
    const { products, findRefs } = makeProducts([PRODUCTO_VIVO, PRODUCTO_VIVO_2])

    const pagina = await createListCatalogLines({ catalog: repo, products })(
      SUPPLIER_ID,
      { page: 1 },
      ADMIN,
    )

    expect(spies.listBySupplierAlive).toHaveBeenCalledWith(SUPPLIER_ID, { page: 1 })
    expect(findRefs).toHaveBeenCalledTimes(1)
    expect(findRefs).toHaveBeenCalledWith([PRODUCTO_VIVO, PRODUCTO_DE_BAJA, PRODUCTO_VIVO_2])
    expect(pagina.total).toBe(3)
    expect(pagina.items.map((item) => item.id)).toEqual(['l-1', 'l-2', 'l-3'])
    expect(pagina.items.map((item) => item.productName)).toEqual([
      `Producto ${PRODUCTO_VIVO.slice(0, 4)}`,
      null,
      `Producto ${PRODUCTO_VIVO_2.slice(0, 4)}`,
    ])
  })

  it('el listado no devuelve nada de un proveedor dado de baja y no pregunta por sus productos', async () => {
    // R36. El filtro de proveedor vivo es del PUERTO (`listBySupplierAlive`), no de un `if`
    // del dominio; cuando dice que no hay proveedor, el caso de uso lanza «no encontrado» y
    // ni siquiera llega a preguntar por los nombres de producto.
    const { repo } = makeCatalog({
      listBySupplierAlive: vi.fn(async () => 'supplier_not_found' as const),
    })
    const { products, findRefs } = makeProducts([PRODUCTO_VIVO])

    await expect(
      createListCatalogLines({ catalog: repo, products })(SUPPLIER_ID, { page: 1 }, ADMIN),
    ).rejects.toBeInstanceOf(NotFoundError)
    expect(findRefs).not.toHaveBeenCalled()

    // Y con la pagina vacia tampoco se pregunta: no hay ningun id por el que preguntar.
    const vacio = makeCatalog()
    const pagina = await createListCatalogLines({ catalog: vacio.repo, products })(
      SUPPLIER_ID,
      { page: 1 },
      ADMIN,
    )
    expect(pagina.items).toEqual([])
    expect(findRefs).not.toHaveBeenCalled()
  })
})

/** Nombres de metodo declarados por la interfaz del puerto del catalogo. */
function metodosDelPuerto(): readonly string[] {
  return [...read('ports', 'supplier-catalog-repository.ts').matchAll(/^ {2}(\w+)\(/gm)]
    .map((m) => m[1] as string)
    .sort()
}

/** Nombres de las dependencias declaradas en el `type ...Deps` de un caso de uso. */
function clavesDelTipoDeps(fuente: string): readonly string[] {
  const bloque = /export type \w+Deps = \{([\s\S]*?)\n\};/.exec(fuente)?.[1] ?? ''
  return [...bloque.matchAll(/^\s*readonly (\w+)\??:/gm)].map((m) => m[1] as string).sort()
}
