// QC-195 TC — contrato front-back de `pedidos` (`design.md > 11.3` a `> 11.7`) como test de tipos.
//
// Lo que afirma lo comprueba `tsc` (`pnpm run typecheck` incluye `tests/**/*.ts`): si una forma
// cambia, `toEqualTypeOf` deja de compilar. Las aserciones de valor cubren las constantes.

import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  ORDER_DISTRIBUTION_PACKAGES_FIELD,
  ORDER_DISTRIBUTION_PACKAGING_FIELD,
  ORDER_DISTRIBUTION_PRESENTATION_FIELD,
  type DistributionLineInput,
  type OrderPresentationAvailability,
  type OrderPresentationAvailabilityNext,
  type OrderPresentationLineView,
  type PresentationLineInput,
  type QuoteOrderCostInput,
  type UpdateOrderDistributionInput,
} from '@/lib/modules/pedidos'

describe('QC-195 contrato de pedidos — 11.3 lineas del reparto', () => {
  it('R11: el campo repetido del envase es una constante literal distinta de las otras dos', () => {
    expectTypeOf<typeof ORDER_DISTRIBUTION_PACKAGING_FIELD>().toEqualTypeOf<'presentationLines.packagingProductId'>()
    expect(
      new Set([
        ORDER_DISTRIBUTION_PACKAGING_FIELD,
        ORDER_DISTRIBUTION_PRESENTATION_FIELD,
        ORDER_DISTRIBUTION_PACKAGES_FIELD,
      ]).size,
    ).toBe(3)
  })

  it('R11, R35: una linea nombra su envase o, si es antigua sin cambios, su presentacion', () => {
    expectTypeOf<DistributionLineInput>().toEqualTypeOf<
      | { readonly packagingProductId: string; readonly packages: number }
      | { readonly presentationId: string; readonly packages: number }
    >()
    expectTypeOf<PresentationLineInput>().toExtend<DistributionLineInput>()
  })
})

describe('QC-195 contrato de pedidos — 11.4 Reparto y unidad', () => {
  it('R17, R37: la entrada lleva lineas de envase y la confirmacion de bloqueo opcional', () => {
    expectTypeOf<UpdateOrderDistributionInput['unitId']>().toEqualTypeOf<string>()
    expectTypeOf<UpdateOrderDistributionInput['presentationLines']>().toEqualTypeOf<
      readonly DistributionLineInput[]
    >()
    expectTypeOf<UpdateOrderDistributionInput['confirmBlocked']>().toEqualTypeOf<boolean | undefined>()
    expectTypeOf<{
      unitId: string
      presentationLines: readonly DistributionLineInput[]
    }>().toExtend<UpdateOrderDistributionInput>()
  })
})

describe('QC-195 contrato de pedidos — 11.5 disponible del reparto', () => {
  it('R11: el resultado nuevo anade el envase no encontrado sin abrir el tipo actual', () => {
    expectTypeOf<
      Exclude<OrderPresentationAvailabilityNext, OrderPresentationAvailability>
    >().toEqualTypeOf<{ readonly kind: 'packaging_not_found'; readonly packagingProductId: string }>()
    expectTypeOf<OrderPresentationAvailability>().toExtend<OrderPresentationAvailabilityNext>()
    expectTypeOf<Extract<OrderPresentationAvailability, { kind: 'packaging_not_found' }>>().toBeNever()
  })
})

describe('QC-195 contrato de pedidos — 11.6 cotizacion', () => {
  it('R29: la cotizacion acepta el reparto como opcional', () => {
    expectTypeOf<QuoteOrderCostInput['presentationLines']>().toEqualTypeOf<
      readonly DistributionLineInput[] | undefined
    >()
    expectTypeOf<{ recipeId: string; quantity: string }>().toExtend<QuoteOrderCostInput>()
    expectTypeOf<QuoteOrderCostInput['orderId']>().toEqualTypeOf<string | undefined>()
  })
})

describe('QC-195 contrato de pedidos — 11.7 vista de la linea', () => {
  it('R33: la linea expone su envase; null es una linea antigua', () => {
    type Envase = Pick<OrderPresentationLineView, 'packagingProductId' | 'packagingName'>
    expectTypeOf<Envase>().toEqualTypeOf<{
      readonly packagingProductId: string | null
      readonly packagingName: string | null
    }>()
    expectTypeOf<OrderPresentationLineView['presentationId']>().toEqualTypeOf<string>()
    expectTypeOf<OrderPresentationLineView['packages']>().toEqualTypeOf<number>()
  })
})
