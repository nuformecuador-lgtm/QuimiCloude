// QC-195 TC — contrato front-back de `inventario` (`design.md > 11.2`) como test de tipos.
//
// Lo que afirma lo comprueba `tsc` (`pnpm run typecheck` incluye `tests/**/*.ts`): si una forma
// cambia, `toEqualTypeOf` deja de compilar. El `it` solo existe para que vitest lo cuente.

import { describe, expect, expectTypeOf, it } from 'vitest'

import { PRODUCT_PRESENTATION_UNIT_FILTER, type ProductView } from '@/lib/modules/inventario'

describe('QC-195 contrato de inventario — ProductView', () => {
  it('R8, R9, R10: ProductView expone la presentacion fija como cuatro campos opcionales y anulables', () => {
    type Presentacion = Pick<
      ProductView,
      'presentationId' | 'presentationName' | 'presentationContent' | 'presentationUnitId'
    >
    expectTypeOf<Presentacion>().toEqualTypeOf<{
      readonly presentationId?: string | null
      readonly presentationName?: string | null
      readonly presentationContent?: string | null
      readonly presentationUnitId?: string | null
    }>()
    expectTypeOf<ProductView['available']>().toEqualTypeOf<string | undefined>()
  })
})

describe('QC-195 contrato de inventario — filtro del selector', () => {
  it('R8, R9: el nombre del filtro por unidad de la presentacion es una constante literal', () => {
    expectTypeOf<typeof PRODUCT_PRESENTATION_UNIT_FILTER>().toEqualTypeOf<'presentationUnitId'>()
    expect(PRODUCT_PRESENTATION_UNIT_FILTER).toBe('presentationUnitId')
  })
})
