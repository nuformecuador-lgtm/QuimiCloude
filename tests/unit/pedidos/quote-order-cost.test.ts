// `createQuoteOrderCost`: autorizacion, forma de entrada y aislamiento por empresa.

import { describe, expect, it, vi } from 'vitest'

import { createCreateOrder } from '@/lib/modules/pedidos/domain/create-order'
import { UnauthorizedError, ValidationError } from '@/lib/modules/pedidos/domain/errors'
import { createQuoteOrderCost, type QuoteOrderCostDeps } from '@/lib/modules/pedidos/domain/quote-order-cost'
import { createUpdateOrder } from '@/lib/modules/pedidos/domain/update-order'
import { fakeUnitOfWork } from '@/tests/helpers/order-unit-of-work-double'

import type { Actor } from '@/lib/modules/pedidos/domain/actor'
import type { OrderRow } from '@/lib/modules/pedidos/domain/order-view'
import type { OrderRepository } from '@/lib/modules/pedidos/ports/order-repository'
import type { PresentationCatalog, ProductCatalog } from '@/lib/modules/inventario'
import type { RecipeCatalog } from '@/lib/modules/recetas'
import type { UnitCatalog } from '@/lib/modules/unidades'
import { fakePackagingCatalog, packagingRef } from '../../helpers/packaging-catalog-double';

const RECIPE_ID = '22222222-2222-4222-8222-222222222222'
const PRESENTATION_ID = '66666666-6666-4666-8666-666666666666'
const COMPANY_ID = '33333333-3333-4333-8333-333333333333'
const OTHER_COMPANY_ID = '44444444-4444-4444-8444-444444444444'

const CONTENT = { lines: [{ productId: 'p-1', percentage: '100.00' }] }
const BATCH = {
  productId: 'p-1',
  unitId: 'u-1',
  lot: '1',
  stock: '100',
  available: '100',
  unitCost: '10.0000',
  purchaseDate: '2026-01-01',
}
const PRODUCT_REF = { id: 'p-1', unitId: 'u-1' }
const UNIT_REF = { id: 'u-1', baseUnitId: null, factor: null }

function actorCon(...permissions: readonly string[]): Actor {
  return { id: 'u-1', companyId: COMPANY_ID, permissions }
}

/** Dobles que devuelven una receta con lineas y un lote suficiente: da `'40.0000'`. */
function dobles() {
  const recipes = {
    findExecutionContentById: vi.fn(async () => CONTENT),
    findRefsIncludingDeleted: vi.fn(),
  } as unknown as RecipeCatalog

  const products = {
    findCostingBatches: vi.fn(async () => [BATCH]),
    findRefs: vi.fn(async () => [PRODUCT_REF]),
  } as unknown as ProductCatalog

  // Devuelve el mismo `UNIT_REF` con el id PEDIDO: asi resuelve tanto la unidad de costeo -que
  // pide 'u-1'- como la unidad del pedido -que pide un UUID, exigido por `unitIdSchema`-, sin
  // ninguna conversion real entre las dos (las dos declaran `baseUnitId: null`).
  const units = {
    findRefs: vi.fn(async (ids: readonly string[]) => ids.map((id) => ({ ...UNIT_REF, id }))),
    findRefsSharingBaseInCompany: vi.fn(),
  } as unknown as UnitCatalog

  return { recipes, products, units }
}

function depsDe(dobles: ReturnType<typeof crearDobles>): QuoteOrderCostDeps {
  return { recipes: dobles.recipes, products: dobles.products, units: dobles.units, packaging: fakePackagingCatalog() }
}

function crearDobles() {
  return dobles()
}

const ORDER_ID = '11111111-1111-4111-8111-111111111111'

function filaExistente(): OrderRow {
  return {
    id: ORDER_ID,
    number: { year: 2026, sequence: 7 },
    recipeId: RECIPE_ID,
    quantity: '10.0000',
    priority: 'BAJA',
    status: 'PENDIENTE',
    cancellationReason: null,
    ingredientsCost: null,
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    createdBy: 'admin-0',
    updatedBy: 'admin-0',
    presentationLines: [],
    unitId: null,
  }
}

describe('R1: el mismo resultado que recibirian orders.create y orders.updateAlive', () => {
  it('con importe: la cotizacion coincide con el ingredientsCost del alta y de la edicion', async () => {
    const d = crearDobles()
    const presentations: PresentationCatalog = {
      findRefs: vi.fn(async () => [{ id: PRESENTATION_ID, name: 'Presentacion de prueba', content: null, unitId: 'unidad-1' }]),
      findByNormalizedNames: vi.fn(async () => []),
    }
    const recipesConVigencia = {
      ...d.recipes,
      findRefsIncludingDeleted: vi.fn(async () => [{ id: RECIPE_ID, isDeleted: false, isUnderReview: false, original: null }]),
    } as unknown as RecipeCatalog

    const create = vi.fn(async () => filaExistente())
    const { unitOfWork: unitOfWorkDeAlta } = fakeUnitOfWork({ orders: { create, setReservedAt: vi.fn(async () => undefined) } })

    const alta = createCreateOrder({
      unitOfWork: unitOfWorkDeAlta,
      recipes: recipesConVigencia,
      products: d.products,
      units: d.units,
      presentations, packaging: fakePackagingCatalog(),
      now: () => new Date('2026-05-01T00:00:00.000Z'),
    })
    await alta(
      { recipeId: RECIPE_ID, quantity: '4.0000', unitId: '99999999-9999-4999-8999-999999999999' },
      actorCon('pedidos.modificar'),
    )
    const ingredientsCostDelAlta = ((create.mock.calls[0] as unknown as readonly unknown[])[4] as { total: string } | null)?.total ?? null

    const filaVista = filaExistente()
    const orders = {
      findAliveById: vi.fn(async () => filaVista),
    } as unknown as OrderRepository
    const updateAlive = vi.fn(async () => 'ok' as const)
    const { unitOfWork: unitOfWorkDeEdicion } = fakeUnitOfWork({
      orders: {
        lockAliveById: vi.fn(async () => ({ ...filaVista, reservedAt: null, packagingCost: null })),
        updateAlive,
        setReservedAt: vi.fn(async () => undefined),
      },
    })

    const edicion = createUpdateOrder({
      orders,
      unitOfWork: unitOfWorkDeEdicion,
      recipes: recipesConVigencia,
      products: d.products,
      units: d.units,
      presentations, packaging: fakePackagingCatalog(),
      now: () => new Date('2026-05-01T00:00:00.000Z'),
    })
    await edicion(
      ORDER_ID,
      {
        recipeId: RECIPE_ID,
        quantity: '4.0000',
        unitId: '99999999-9999-4999-8999-999999999999',
      },
      actorCon('pedidos.modificar'),
    )
    const ingredientsCostDeLaEdicion = ((updateAlive.mock.calls[0] as unknown as readonly unknown[])[4] as { total: string } | null)?.total ?? null

    const cotizar = createQuoteOrderCost(depsDe(d))
    const cotizacion = await cotizar(
      { recipeId: RECIPE_ID, quantity: '4.0000' },
      actorCon('pedidos.modificar'),
    )

    expect(cotizacion.ingredientsCost).toBe(ingredientsCostDelAlta)
    expect(cotizacion.ingredientsCost).toBe(ingredientsCostDeLaEdicion)
    expect(cotizacion.ingredientsCost).toBe('40.0000')
  })

  it('sin importe: receta sin lineas da null, igual que el alta', async () => {
    const d = crearDobles()
    d.recipes.findExecutionContentById = vi.fn(async () => ({ lines: [] })) as never
    d.products.findCostingBatches = vi.fn(async () => []) as never
    d.products.findRefs = vi.fn(async () => []) as never
    d.units.findRefs = vi.fn(async () => []) as never

    const cotizar = createQuoteOrderCost(depsDe(d))
    const resultado = await cotizar(
      { recipeId: RECIPE_ID, quantity: '4.0000' },
      actorCon('pedidos.modificar'),
    )
    expect(resultado.ingredientsCost).toBeNull()
  })
})

describe('R2: solo lecturas, y el tipo de dependencias no admite el repositorio de pedidos', () => {
  it('solo se llama a findExecutionContentById, findCostingBatches y findRefs', async () => {
    const d = crearDobles()
    const cotizar = createQuoteOrderCost(depsDe(d))
    await cotizar({ recipeId: RECIPE_ID, quantity: '4.0000' }, actorCon('pedidos.modificar'))

    expect(d.recipes.findExecutionContentById).toHaveBeenCalledTimes(1)
    expect(d.products.findCostingBatches).toHaveBeenCalledTimes(1)
    expect(d.products.findRefs).toHaveBeenCalledTimes(1)
    expect(d.units.findRefs).toHaveBeenCalledTimes(1)
  })

  it('QuoteOrderCostDeps no tiene orders (asercion de tipo)', () => {
    const deps: QuoteOrderCostDeps = { recipes: {} as never, products: {} as never, units: {} as never, packaging: {} as never }
    // @ts-expect-error `orders` no pertenece a QuoteOrderCostDeps: es solo-lectura por construccion.
    void deps.orders
    expect(Object.keys(deps).sort()).toEqual(['packaging', 'products', 'recipes', 'units'])
  })
})

describe('R3: sin actor o sin permiso rechaza antes de tocar ningun catalogo', () => {
  const CASOS: readonly (readonly [string, Actor | null | undefined])[] = [
    ['actor null', null],
    ['actor undefined', undefined],
    ['sin permisos', actorCon()],
    ['solo pedidos.consultar', actorCon('pedidos.consultar')],
  ]

  for (const [nombre, actor] of CASOS) {
    it(`${nombre}: UnauthorizedError sin llamar a ningun doble`, async () => {
      const d = crearDobles()
      const cotizar = createQuoteOrderCost(depsDe(d))
      await expect(
        cotizar({ recipeId: RECIPE_ID, quantity: '4.0000' }, actor),
      ).rejects.toBeInstanceOf(UnauthorizedError)
      expect(d.recipes.findExecutionContentById).not.toHaveBeenCalled()
      expect(d.products.findCostingBatches).not.toHaveBeenCalled()
      expect(d.products.findRefs).not.toHaveBeenCalled()
      expect(d.units.findRefs).not.toHaveBeenCalled()
    })
  }

  it('tambien rechaza con entrada invalida antes de validar', async () => {
    const d = crearDobles()
    const cotizar = createQuoteOrderCost(depsDe(d))
    await expect(
      cotizar({ recipeId: 'no-es-un-uuid', quantity: '-1' }, actorCon('pedidos.consultar')),
    ).rejects.toBeInstanceOf(UnauthorizedError)
    expect(d.recipes.findExecutionContentById).not.toHaveBeenCalled()
  })
})

describe('R5: entrada invalida rechaza con ValidationError y cero llamadas', () => {
  const INVALIDAS: readonly (readonly [string, unknown])[] = [
    ['quantity 0', { recipeId: RECIPE_ID, quantity: '0' }],
    ['quantity negativa', { recipeId: RECIPE_ID, quantity: '-1' }],
    ['quantity no numerica', { recipeId: RECIPE_ID, quantity: 'abc' }],
    ['quantity con 11 enteros', { recipeId: RECIPE_ID, quantity: '12345678901' }],
    ['quantity con 5 decimales', { recipeId: RECIPE_ID, quantity: '1.12345' }],
    ['recipeId no uuid', { recipeId: 'no-es-un-uuid', quantity: '1.0000' }],
  ]

  for (const [nombre, input] of INVALIDAS) {
    it(`${nombre}: ValidationError sin llamar a ningun doble`, async () => {
      const d = crearDobles()
      const cotizar = createQuoteOrderCost(depsDe(d))
      await expect(cotizar(input, actorCon('pedidos.modificar'))).rejects.toBeInstanceOf(
        ValidationError,
      )
      expect(d.recipes.findExecutionContentById).not.toHaveBeenCalled()
      expect(d.products.findCostingBatches).not.toHaveBeenCalled()
      expect(d.products.findRefs).not.toHaveBeenCalled()
      expect(d.units.findRefs).not.toHaveBeenCalled()
    })
  }
})

describe('R6: receta inexistente o ajena da sin importe', () => {
  it('findExecutionContentById devuelve null -> ingredientsCost null, y los catalogos se llaman solo con companyId del actor', async () => {
    const d = crearDobles()
    d.recipes.findExecutionContentById = vi.fn(async () => null) as never
    d.products.findCostingBatches = vi.fn(async () => []) as never
    d.products.findRefs = vi.fn(async () => []) as never
    d.units.findRefs = vi.fn(async () => []) as never

    const cotizar = createQuoteOrderCost(depsDe(d))
    const resultado = await cotizar(
      { recipeId: RECIPE_ID, quantity: '4.0000' },
      actorCon('pedidos.modificar'),
    )
    expect(resultado.ingredientsCost).toBeNull()
    expect(d.recipes.findExecutionContentById).toHaveBeenCalledWith(RECIPE_ID, COMPANY_ID)
    expect(d.products.findCostingBatches).toHaveBeenCalledWith([], COMPANY_ID, { excludeOrderId: undefined })
    expect(d.products.findRefs).toHaveBeenCalledWith([], COMPANY_ID)
  })
})

describe('R7: la empresa sale del actor, y una entrada con companyId de otra empresa no la cambia', () => {
  it('los tres catalogos se llaman con el companyId del actor, no con el de la entrada', async () => {
    const d = crearDobles()
    const cotizar = createQuoteOrderCost(depsDe(d))
    await cotizar(
      { recipeId: RECIPE_ID, quantity: '4.0000', companyId: OTHER_COMPANY_ID },
      actorCon('pedidos.modificar'),
    )
    expect(d.recipes.findExecutionContentById).toHaveBeenCalledWith(RECIPE_ID, COMPANY_ID)
    expect(d.products.findCostingBatches).toHaveBeenCalledWith(['p-1'], COMPANY_ID, { excludeOrderId: undefined })
    expect(d.products.findRefs).toHaveBeenCalledWith(['p-1'], COMPANY_ID)
    expect(d.units.findRefs).toHaveBeenCalledWith(['u-1'], COMPANY_ID)
  })
})

describe('R8: `orderId` opcional en la entrada llega a `findCostingBatches` como `excludeOrderId` (R65)', () => {
  const OTHER_ORDER_ID = '99999999-9999-4999-8999-999999999999'

  it('sin `orderId` en la entrada, `excludeOrderId` es `undefined` -alta, sin pedido que excluir-', async () => {
    const d = crearDobles()
    const cotizar = createQuoteOrderCost(depsDe(d))
    await cotizar({ recipeId: RECIPE_ID, quantity: '4.0000' }, actorCon('pedidos.modificar'))

    expect(d.products.findCostingBatches).toHaveBeenCalledWith(['p-1'], COMPANY_ID, { excludeOrderId: undefined })
  })

  it('con `orderId` en la entrada -edicion-, se reenvia tal cual como `excludeOrderId`, sin leer el pedido', async () => {
    const d = crearDobles()
    const cotizar = createQuoteOrderCost(depsDe(d))
    await cotizar(
      { recipeId: RECIPE_ID, quantity: '4.0000', orderId: OTHER_ORDER_ID },
      actorCon('pedidos.modificar'),
    )

    expect(d.products.findCostingBatches).toHaveBeenCalledWith(['p-1'], COMPANY_ID, { excludeOrderId: OTHER_ORDER_ID })
  })

  it('un `orderId` que no es UUID rechaza con ValidationError, como el resto de la entrada', async () => {
    const d = crearDobles()
    const cotizar = createQuoteOrderCost(depsDe(d))
    await expect(
      cotizar(
        { recipeId: RECIPE_ID, quantity: '4.0000', orderId: 'no-es-un-uuid' },
        actorCon('pedidos.modificar'),
      ),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(d.products.findCostingBatches).not.toHaveBeenCalled()
  })
})

describe('QC-195 — la cotizacion suma los envases del reparto', () => {
  const ENVASE = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'
  const LOTES = [
    { productId: ENVASE, unitCost: '0.5000', available: '100.0000' },
    { productId: ENVASE, unitCost: '0.7000', available: '50.0000' },
  ]

  it('R27, R29: con 40 envases suma 24.0000 a los ingredientes (4 x 10.0000 = 40.0000)', async () => {
    const d = crearDobles()
    const packaging = fakePackagingCatalog([], LOTES)
    const cotizar = createQuoteOrderCost({ ...depsDe(d), packaging })

    const cotizacion = await cotizar(
      { recipeId: RECIPE_ID, quantity: '4.0000', presentationLines: [{ packagingProductId: ENVASE, packages: 40 }] },
      actorCon('pedidos.modificar'),
    )

    expect(cotizacion).toEqual({ ingredientsCost: '64.0000' })
    expect(packaging.findCostingBatches).toHaveBeenCalledWith([ENVASE], COMPANY_ID, { excludeOrderId: undefined })
  })

  it('R30: en la edicion, lo apartado por el propio pedido cuenta como disponible del envase', async () => {
    const d = crearDobles()
    const packaging = fakePackagingCatalog([], LOTES)
    const cotizar = createQuoteOrderCost({ ...depsDe(d), packaging })

    await cotizar(
      {
        recipeId: RECIPE_ID,
        quantity: '4.0000',
        orderId: ORDER_ID,
        presentationLines: [{ packagingProductId: ENVASE, packages: 40 }],
      },
      actorCon('pedidos.modificar'),
    )

    expect(packaging.findCostingBatches).toHaveBeenCalledWith([ENVASE], COMPANY_ID, { excludeOrderId: ORDER_ID })
  })

  it('R28: si el disponible del envase no cubre el reparto, la cotizacion queda sin importe', async () => {
    const d = crearDobles()
    const cotizar = createQuoteOrderCost({ ...depsDe(d), packaging: fakePackagingCatalog([], LOTES) })

    const cotizacion = await cotizar(
      { recipeId: RECIPE_ID, quantity: '4.0000', presentationLines: [{ packagingProductId: ENVASE, packages: 151 }] },
      actorCon('pedidos.modificar'),
    )

    expect(cotizacion).toEqual({ ingredientsCost: null })
  })

  it('R29: las lineas antiguas, sin envase, no cuestan ni consultan el catalogo de envases', async () => {
    const d = crearDobles()
    const packaging = fakePackagingCatalog([], LOTES)
    const cotizar = createQuoteOrderCost({ ...depsDe(d), packaging })

    const cotizacion = await cotizar(
      { recipeId: RECIPE_ID, quantity: '4.0000', presentationLines: [{ presentationId: PRESENTATION_ID, packages: 3 }] },
      actorCon('pedidos.modificar'),
    )

    expect(cotizacion).toEqual({ ingredientsCost: '40.0000' })
    expect(packaging.findCostingBatches).not.toHaveBeenCalled()
  })

  it('R29: el alta guarda el mismo importe que da la cotizacion con el mismo reparto', async () => {
    const d = crearDobles()
    const packaging = fakePackagingCatalog(
      [packagingRef({ id: ENVASE, presentationId: PRESENTATION_ID, content: '0.1000', unitId: '99999999-9999-4999-8999-999999999999' })],
      LOTES,
    )
    const lineas = [{ packagingProductId: ENVASE, packages: 40 }]
    const cotizacion = await createQuoteOrderCost({ ...depsDe(d), packaging })(
      { recipeId: RECIPE_ID, quantity: '4.0000', presentationLines: lineas },
      actorCon('pedidos.modificar'),
    )

    const create = vi.fn(async () => filaExistente())
    const { unitOfWork } = fakeUnitOfWork({ orders: { create, setReservedAt: vi.fn(async () => undefined) } })
    await createCreateOrder({
      unitOfWork,
      recipes: {
        ...d.recipes,
        findRefsIncludingDeleted: vi.fn(async () => [{ id: RECIPE_ID, isDeleted: false, isUnderReview: false, original: null }]),
      } as unknown as RecipeCatalog,
      products: d.products,
      units: d.units,
      presentations: { findRefs: vi.fn(async () => []), findByNormalizedNames: vi.fn(async () => []) },
      packaging,
      now: () => new Date('2026-05-01T00:00:00.000Z'),
    })(
      { recipeId: RECIPE_ID, quantity: '4.0000', unitId: '99999999-9999-4999-8999-999999999999', presentationLines: lineas },
      actorCon('pedidos.modificar'),
    )

    const guardado = ((create.mock.calls[0] as unknown as readonly unknown[])[4] as { total: string } | null)?.total
    expect(cotizacion.ingredientsCost).toBe('64.0000')
    expect(guardado).toBe(cotizacion.ingredientsCost)
  })
})
