// La resolucion pura de la receta que guarda un pedido: original sola o version de esa original.
// El catalogo ya acota a la empresa, asi que «de otra empresa» llega aqui como ausente.

import { describe, expect, it } from 'vitest'

import { RecipeNotFoundError, RecipeVersionUnderReviewError } from '@/lib/modules/pedidos/domain/errors'
import {
  orderRecipeIds,
  requireOrderRecipe,
  resolveOrderRecipe,
} from '@/lib/modules/pedidos/domain/order-recipe'

import type { RecipeRef } from '@/lib/modules/recetas'

const ORIGINAL = '11111111-1111-4111-8111-111111111111'
const OTRA_ORIGINAL = '22222222-2222-4222-8222-222222222222'
const VERSION = '33333333-3333-4333-8333-333333333333'

function original(id = ORIGINAL, overrides: Partial<RecipeRef> = {}): RecipeRef {
  return { id, name: 'Base', ownName: 'Base', isDeleted: false, isUnderReview: false, original: null, ...overrides }
}

function version(overrides: Partial<RecipeRef> = {}, padre = ORIGINAL): RecipeRef {
  return {
    id: VERSION,
    name: 'Base · Suave',
    ownName: 'Suave',
    isDeleted: false,
    isUnderReview: false,
    original: { id: padre, name: 'Base' },
    ...overrides,
  }
}

describe('resolveOrderRecipe', () => {
  it('R31: sin version, una original viva resuelve a si misma', () => {
    expect(resolveOrderRecipe([original()], ORIGINAL, null)).toEqual({ effectiveId: ORIGINAL })
  })

  it('R30: con una version viva de esa original, resuelve a la version', () => {
    expect(resolveOrderRecipe([original(), version()], ORIGINAL, VERSION)).toEqual({ effectiveId: VERSION })
  })

  it('R32: la receta no vuelve del catalogo (inexistente o de otra empresa) -> not_found', () => {
    expect(resolveOrderRecipe([], ORIGINAL, null)).toBe('not_found')
    expect(resolveOrderRecipe([version()], ORIGINAL, VERSION)).toBe('not_found')
  })

  it('R32: la receta esta dada de baja -> not_found', () => {
    expect(resolveOrderRecipe([original(ORIGINAL, { isDeleted: true })], ORIGINAL, null)).toBe('not_found')
  })

  it('R32: la receta indicada es una version, no una original -> not_found', () => {
    expect(resolveOrderRecipe([version()], VERSION, null)).toBe('not_found')
  })

  it('R32: la version no vuelve del catalogo (inexistente o de otra empresa) -> not_found', () => {
    expect(resolveOrderRecipe([original()], ORIGINAL, VERSION)).toBe('not_found')
  })

  it('R32: la version esta dada de baja -> not_found', () => {
    expect(resolveOrderRecipe([original(), version({ isDeleted: true })], ORIGINAL, VERSION)).toBe('not_found')
  })

  it('R32: la version es de otra original -> not_found', () => {
    const refs = [original(), original(OTRA_ORIGINAL), version({}, OTRA_ORIGINAL)]
    expect(resolveOrderRecipe(refs, ORIGINAL, VERSION)).toBe('not_found')
  })

  it('R32: el id de version apunta a una original -> not_found', () => {
    expect(resolveOrderRecipe([original(), original(OTRA_ORIGINAL)], ORIGINAL, OTRA_ORIGINAL)).toBe('not_found')
  })

  it('R33: una version por revisar -> under_review', () => {
    expect(resolveOrderRecipe([original(), version({ isUnderReview: true })], ORIGINAL, VERSION)).toBe(
      'under_review',
    )
  })

  it('R32: de baja pesa mas que por revisar', () => {
    const refs = [original(), version({ isDeleted: true, isUnderReview: true })]
    expect(resolveOrderRecipe(refs, ORIGINAL, VERSION)).toBe('not_found')
  })
})

describe('requireOrderRecipe y orderRecipeIds', () => {
  it('R32, R33: traduce cada resultado a su error del modulo', () => {
    expect(() => requireOrderRecipe([], ORIGINAL, null)).toThrow(RecipeNotFoundError)
    expect(() => requireOrderRecipe([original(), version({ isUnderReview: true })], ORIGINAL, VERSION)).toThrow(
      RecipeVersionUnderReviewError,
    )
    expect(requireOrderRecipe([original(), version()], ORIGINAL, VERSION)).toBe(VERSION)
  })

  it('R30, R31: pide la version al catalogo solo si la hay', () => {
    expect(orderRecipeIds(ORIGINAL, null)).toEqual([ORIGINAL])
    expect(orderRecipeIds(ORIGINAL, VERSION)).toEqual([ORIGINAL, VERSION])
  })
})
