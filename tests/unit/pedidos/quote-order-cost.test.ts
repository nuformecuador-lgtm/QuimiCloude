// QC-151 T1 — `createQuoteOrderCost` (R1, R2, R3, R5, R6, R7).

import { describe, expect, it, vi } from 'vitest'

import { createCreateOrder } from '@/lib/modules/pedidos/domain/create-order'
import { UnauthorizedError, ValidationError } from '@/lib/modules/pedidos/domain/errors'
import { createQuoteOrderCost, type QuoteOrderCostDeps } from '@/lib/modules/pedidos/domain/quote-order-cost'
import { createUpdateOrder } from '@/lib/modules/pedidos/domain/update-order'

import type { Actor } from '@/lib/modules/pedidos/domain/actor'
import type { PresentationCatalog, ProductCatalog } from '@/lib/modules/inventario'
import type { RecipeCatalog } from '@/lib/modules/recetas'
import type { UnitCatalog } from '@/lib/modules/unidades'

const RECIPE_ID = '22222222-2222-4222-8222-222222222222'
const PRESENTATION_ID = '66666666-6666-4666-8666-666666666666'
const COMPANY_ID = '33333333-3333-4333-8333-333333333333'
const OTHER_COMPANY_ID = '44444444-4444-4444-8444-444444444444'

const CONTENT = { lines: [{ productId: 'p-1', percentage: '100.00' }] }
const BATCH = {
  productId: 'p-1',
  unitId: 'u-1',
  lot: '1',
  stock: 100,
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

  const units = {
    findRefs: vi.fn(async () => [UNIT_REF]),
    findRefsSharingBaseInCompany: vi.fn(),
  } as unknown as UnitCatalog

  return { recipes, products, units }
}

function depsDe(dobles: ReturnType<typeof crearDobles>): QuoteOrderCostDeps {
  return { recipes: dobles.recipes, products: dobles.products, units: dobles.units }
}

function crearDobles() {
  return dobles()
}

describe('R1: el mismo resultado que recibirian orders.create y orders.updateAlive', () => {
  it('con importe: la cotizacion coincide con el ingredientsCost del alta y de la edicion', async () => {
    const orders = {
      create: vi.fn(async (...args: unknown[]) => {
        void args
        return { id: 'o-1', number: { year: 2026, sequence: 1 } }
      }),
      updateAlive: vi.fn(async (...args: unknown[]) => {
        void args
      }),
      findAliveById: vi.fn(),
      listAlive: vi.fn(),
      cancelAlive: vi.fn(),
      softDeleteAlive: vi.fn(),
    }

    const d = crearDobles()
    const presentations: PresentationCatalog = {
      findRefs: vi.fn(async () => [{ id: PRESENTATION_ID, name: 'Presentacion de prueba' }]),
    }
    const recipesConVigencia = {
      ...d.recipes,
      findRefsIncludingDeleted: vi.fn(async () => [{ id: RECIPE_ID, isDeleted: false }]),
    } as unknown as RecipeCatalog

    const alta = createCreateOrder({
      orders: orders as never,
      recipes: recipesConVigencia,
      products: d.products,
      units: d.units,
      presentations,
      now: () => new Date('2026-05-01T00:00:00.000Z'),
    })
    await alta(
      { recipeId: RECIPE_ID, quantity: '4.0000', presentationId: PRESENTATION_ID },
      actorCon('pedidos.modificar'),
    )
    const ingredientsCostDelAlta = orders.create.mock.calls[0]?.[4] as string | null

    const edicion = createUpdateOrder({
      orders: orders as never,
      recipes: recipesConVigencia,
      products: d.products,
      units: d.units,
      presentations,
      now: () => new Date('2026-05-01T00:00:00.000Z'),
    })
    orders.findAliveById.mockResolvedValue({ id: 'o-1', status: 'PENDIENTE' })
    await edicion(
      'o-1',
      {
        recipeId: RECIPE_ID,
        quantity: '4.0000',
        presentationId: PRESENTATION_ID,
        status: 'PENDIENTE',
      },
      actorCon('pedidos.modificar'),
    )
    const ingredientsCostDeLaEdicion = orders.updateAlive.mock.calls[0]?.[4] as string | null

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
    const deps: QuoteOrderCostDeps = { recipes: {} as never, products: {} as never, units: {} as never }
    // @ts-expect-error `orders` no pertenece a QuoteOrderCostDeps: es solo-lectura por construccion.
    void deps.orders
    expect(Object.keys(deps).sort()).toEqual(['products', 'recipes', 'units'])
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
    expect(d.products.findCostingBatches).toHaveBeenCalledWith([], COMPANY_ID)
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
    expect(d.products.findCostingBatches).toHaveBeenCalledWith(['p-1'], COMPANY_ID)
    expect(d.products.findRefs).toHaveBeenCalledWith(['p-1'], COMPANY_ID)
    expect(d.units.findRefs).toHaveBeenCalledWith(['u-1'], COMPANY_ID)
  })
})
