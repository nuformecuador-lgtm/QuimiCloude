// QC-172 T9 — La ficha del pedido con una version de receta: nombre mostrado y `recipeVersion`.
// Los dobles filtran por los ids pedidos, como los catalogos de verdad.

import { describe, expect, it, vi } from 'vitest'

import { OrderNotFoundError } from '@/lib/modules/pedidos/domain/errors'
import { createGetOrder, toOrderView } from '@/lib/modules/pedidos/domain/get-order'

import type { Actor } from '@/lib/modules/pedidos/domain/actor'
import type { OrderRow } from '@/lib/modules/pedidos/domain/order-view'
import type { OrderRepository } from '@/lib/modules/pedidos/ports/order-repository'
import type { PresentationCatalog } from '@/lib/modules/inventario'
import type { RecipeCatalog, RecipeRef } from '@/lib/modules/recetas'
import type { UnitCatalog } from '@/lib/modules/unidades'
import { fakePackagingCatalog, packagingRef } from '../../helpers/packaging-catalog-double'

const COMPANY = '33333333-3333-4333-8333-333333333333'
const ADMIN: Actor = { id: 'admin-1', companyId: COMPANY, permissions: ['pedidos.consultar'] }

const ORDER_ID = '11111111-1111-4111-8111-111111111111'
const ORIGINAL = '22222222-2222-4222-8222-222222222222'
const VERSION = '55555555-5555-4555-8555-555555555555'

const REF_ORIGINAL: RecipeRef = {
  id: ORIGINAL,
  name: 'Crema base',
  ownName: 'Crema base',
  isDeleted: false,
  isUnderReview: false,
  original: null,
}
const REF_VERSION: RecipeRef = {
  id: VERSION,
  name: 'Crema base · Sin perfume',
  ownName: 'Sin perfume',
  isDeleted: false,
  isUnderReview: false,
  original: { id: ORIGINAL, name: 'Crema base' },
}

function fila(recipeId: string): OrderRow {
  return {
    id: ORDER_ID,
    number: { year: 2026, sequence: 7 },
    recipeId,
    quantity: '10.0000',
    priority: 'BAJA',
    status: 'PENDIENTE',
    cancellationReason: null,
    ingredientsCost: null,
    createdAt: new Date('2026-01-02T03:04:05.000Z'),
    updatedAt: new Date('2026-01-02T03:04:05.000Z'),
    createdBy: 'admin-0',
    updatedBy: 'admin-0',
    presentationLines: [],
    unitId: null,
  }
}

function dobles(row: OrderRow | null, refs: readonly RecipeRef[] = [REF_ORIGINAL, REF_VERSION]) {
  const findRefsIncludingDeleted = vi.fn(async (ids: readonly string[], companyId: string) => {
    void companyId
    return refs.filter((ref) => ids.includes(ref.id))
  })
  const findRefs = vi.fn(async () => [])
  return {
    orders: { findAliveById: vi.fn(async () => row) } as unknown as OrderRepository,
    recipes: { findRefsIncludingDeleted } as unknown as RecipeCatalog,
    presentations: { findRefs } as unknown as PresentationCatalog,
    packaging: fakePackagingCatalog(),
    units: { findRefs: vi.fn(async () => []) } as unknown as UnitCatalog,
    findRefsIncludingDeleted,
  }
}

describe('getOrder — pedido con version de receta', () => {
  it('R11: la ficha de un pedido con version da el nombre compuesto y recipeVersion con original y version', async () => {
    const d = dobles(fila(VERSION))

    const vista = await createGetOrder(d)(ORDER_ID, ADMIN)

    expect(vista.recipeId).toBe(VERSION)
    expect(vista.recipeName).toBe('Crema base · Sin perfume')
    expect(vista.recipeVersion).toEqual({
      originalId: ORIGINAL,
      originalName: 'Crema base',
      versionName: 'Sin perfume',
    })
    expect(d.findRefsIncludingDeleted).toHaveBeenCalledTimes(1)
    expect(d.findRefsIncludingDeleted).toHaveBeenCalledWith([VERSION], COMPANY)
  })

  it('R11: la ficha de un pedido con original sigue dando su nombre y recipeVersion null', async () => {
    const vista = await createGetOrder(dobles(fila(ORIGINAL)))(ORDER_ID, ADMIN)

    expect(vista.recipeName).toBe('Crema base')
    expect(vista.recipeVersion).toBeNull()
  })

  it('R25: una version dada de baja sigue saliendo con su nombre compuesto', async () => {
    const vista = await createGetOrder(dobles(fila(VERSION), [{ ...REF_VERSION, isDeleted: true }]))(
      ORDER_ID,
      ADMIN,
    )

    expect(vista.recipeName).toBe('Crema base · Sin perfume')
    expect(vista.recipeVersion?.versionName).toBe('Sin perfume')
  })

  it('si el id no vuelve del catalogo, nombre y recipeVersion son null', async () => {
    const vista = await createGetOrder(dobles(fila(VERSION), []))(ORDER_ID, ADMIN)

    expect(vista.recipeName).toBeNull()
    expect(vista.recipeVersion).toBeNull()
  })

  it('un pedido que no existe sigue respondiendo no encontrado sin preguntar al catalogo', async () => {
    const d = dobles(null)

    await expect(createGetOrder(d)(ORDER_ID, ADMIN)).rejects.toBeInstanceOf(OrderNotFoundError)
    expect(d.findRefsIncludingDeleted).not.toHaveBeenCalled()
  })
})

describe('toOrderView — recibe el Map de RecipeRef', () => {
  it('R11: compone recipeVersion desde la referencia y no desde la fila', () => {
    const vista = toOrderView(fila(VERSION), new Map([[VERSION, REF_VERSION]]))

    expect(vista.recipeName).toBe('Crema base · Sin perfume')
    expect(vista.recipeVersion).toEqual({
      originalId: ORIGINAL,
      originalName: 'Crema base',
      versionName: 'Sin perfume',
    })
  })
})

describe('QC-195 R33 — la ficha y el listado nombran el envase de cada linea', () => {
  const PRESENTACION_ANTIGUA = '66666666-6666-4666-8666-666666666666'
  const PRESENTACION_ENVASE = '77777777-7777-4777-8777-777777777777'
  const ENVASE = 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1'
  const ENVASE_DE_BAJA = 'e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2'

  function filaConReparto(): OrderRow {
    return {
      ...fila(ORIGINAL),
      presentationLines: [
        { presentationId: PRESENTACION_ANTIGUA, packages: 3, packagingProductId: null },
        { presentationId: PRESENTACION_ENVASE, packages: 40, packagingProductId: ENVASE },
        { presentationId: '88888888-8888-4888-8888-888888888888', packages: 1, packagingProductId: ENVASE_DE_BAJA },
      ],
    }
  }

  it('R33: la linea antigua sale con su presentacion y envase null; la de envase, con su id y su nombre', async () => {
    const packaging = fakePackagingCatalog([packagingRef({ id: ENVASE, name: 'Botella PET 500 ml' })])
    const d = { ...dobles(filaConReparto()), packaging }

    const vista = await createGetOrder(d)(ORDER_ID, ADMIN)

    expect(vista.presentationLines.map((line) => [line.packagingProductId, line.packagingName])).toEqual([
      [null, null],
      [ENVASE, 'Botella PET 500 ml'],
      // Un envase que ya no vuelve del catalogo conserva su id y se queda sin nombre.
      [ENVASE_DE_BAJA, null],
    ])
    expect(vista.presentationLines[0]?.presentationId).toBe(PRESENTACION_ANTIGUA)
    expect(packaging.findRefs).toHaveBeenCalledTimes(1)
    expect(packaging.findRefs).toHaveBeenCalledWith([ENVASE, ENVASE_DE_BAJA], COMPANY)
  })

  it('R33: un pedido solo con lineas antiguas no consulta el catalogo de envases', async () => {
    const packaging = fakePackagingCatalog()
    const d = {
      ...dobles({
        ...fila(ORIGINAL),
        presentationLines: [{ presentationId: PRESENTACION_ANTIGUA, packages: 3, packagingProductId: null }],
      }),
      packaging,
    }

    const vista = await createGetOrder(d)(ORDER_ID, ADMIN)

    expect(vista.presentationLines).toHaveLength(1)
    expect(packaging.findRefs).not.toHaveBeenCalled()
  })

  it('R33: toOrderView sin nombres de envase deja packagingName en null y conserva el id', () => {
    const vista = toOrderView(filaConReparto(), new Map([[ORIGINAL, REF_ORIGINAL]]))

    expect(vista.presentationLines[1]).toMatchObject({ packagingProductId: ENVASE, packagingName: null })
  })
})
