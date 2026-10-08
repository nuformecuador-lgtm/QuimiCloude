// QC-156 B3 — Cuando una edicion general «solo cambia el cliente»: la tabla de igualdad de
// `design.md > 4.1.1`, dato por dato, sobre la funcion pura.

import { describe, expect, it } from 'vitest'

import { sameDecimal } from '@/lib/modules/pedidos/domain/order-distribution'
import { isCustomerOnlyEdit, type ComparableEdit } from '@/lib/modules/pedidos/domain/order-edit-change'

import type { OrderRow } from '@/lib/modules/pedidos/domain/order-view'

const RECETA = '22222222-2222-4222-8222-222222222222'
const VERSION = '55555555-5555-4555-8555-555555555555'
const UNIDAD = '66666666-6666-4666-8666-666666666666'
const OTRA_UNIDAD = '67676767-6767-4767-8767-676767676767'
const ENVASE_A = 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1'
const ENVASE_B = 'e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2'
const PRES_A = '77777777-7777-4777-8777-777777777777'
const PRES_B = '78787878-7878-4878-8878-787878787878'
const PRES_ANTIGUA = '79797979-7979-4979-8979-797979797979'

function fila(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    number: { year: 2026, sequence: 1 },
    recipeId: RECETA,
    quantity: '10.0000',
    priority: 'MEDIA',
    status: 'PENDIENTE',
    cancellationReason: null,
    ingredientsCost: null,
    createdAt: new Date('2026-01-02T03:04:05.000Z'),
    updatedAt: new Date('2026-01-02T03:04:05.000Z'),
    createdBy: 'admin-0',
    updatedBy: 'admin-0',
    presentationLines: [
      { presentationId: PRES_A, packages: 4, packagingProductId: ENVASE_A },
      { presentationId: PRES_B, packages: 2, packagingProductId: ENVASE_B },
      { presentationId: PRES_ANTIGUA, packages: 1, packagingProductId: null },
    ],
    unitId: UNIDAD,
    customerId: null,
    ...overrides,
  }
}

function edicion(overrides: Partial<ComparableEdit> = {}): ComparableEdit {
  return {
    recipeId: RECETA,
    quantity: '10',
    priority: 'MEDIA',
    unitId: UNIDAD,
    presentationLines: [
      { packagingProductId: ENVASE_A, packages: 4 },
      { packagingProductId: ENVASE_B, packages: 2 },
      { presentationId: PRES_ANTIGUA, packages: 1 },
    ],
    ...overrides,
  }
}

describe('isCustomerOnlyEdit — la tabla de «igual al guardado» (R13)', () => {
  it('R13: la cantidad "10" es igual a la guardada "10.0000"', () => {
    expect(isCustomerOnlyEdit(fila(), edicion({ quantity: '10' }))).toBe(true)
    expect(isCustomerOnlyEdit(fila(), edicion({ quantity: '10.0000' }))).toBe(true)
  })

  it('R13: otra cantidad, aunque difiera en la cuarta cifra decimal, no es igual', () => {
    expect(isCustomerOnlyEdit(fila(), edicion({ quantity: '10.0001' }))).toBe(false)
    expect(isCustomerOnlyEdit(fila(), edicion({ quantity: '100' }))).toBe(false)
  })

  it('R13: el reparto en otro orden es igual', () => {
    const desordenado = edicion({
      presentationLines: [
        { presentationId: PRES_ANTIGUA, packages: 1 },
        { packagingProductId: ENVASE_B, packages: 2 },
        { packagingProductId: ENVASE_A, packages: 4 },
      ],
    })
    expect(isCustomerOnlyEdit(fila(), desordenado)).toBe(true)
  })

  it('R13: la linea con envase compara envase y envases; la antigua, presentacion y envases', () => {
    // Mismo envase, otro numero de envases.
    expect(
      isCustomerOnlyEdit(
        fila(),
        edicion({
          presentationLines: [
            { packagingProductId: ENVASE_A, packages: 5 },
            { packagingProductId: ENVASE_B, packages: 2 },
            { presentationId: PRES_ANTIGUA, packages: 1 },
          ],
        }),
      ),
    ).toBe(false)
    // Otro envase.
    expect(
      isCustomerOnlyEdit(
        fila(),
        edicion({
          presentationLines: [
            { packagingProductId: ENVASE_A, packages: 4 },
            { packagingProductId: ENVASE_A, packages: 2 },
            { presentationId: PRES_ANTIGUA, packages: 1 },
          ],
        }),
      ),
    ).toBe(false)
    // La linea antigua con otros envases.
    expect(
      isCustomerOnlyEdit(
        fila(),
        edicion({
          presentationLines: [
            { packagingProductId: ENVASE_A, packages: 4 },
            { packagingProductId: ENVASE_B, packages: 2 },
            { presentationId: PRES_ANTIGUA, packages: 3 },
          ],
        }),
      ),
    ).toBe(false)
    // Una linea antigua que nombra la presentacion de una linea CON envase no casa con ella.
    expect(
      isCustomerOnlyEdit(
        fila(),
        edicion({
          presentationLines: [
            { presentationId: PRES_A, packages: 4 },
            { packagingProductId: ENVASE_B, packages: 2 },
            { presentationId: PRES_ANTIGUA, packages: 1 },
          ],
        }),
      ),
    ).toBe(false)
  })

  it('R13: una linea de mas o de menos no es igual', () => {
    const base = edicion().presentationLines
    expect(isCustomerOnlyEdit(fila(), edicion({ presentationLines: base.slice(0, 2) }))).toBe(false)
    expect(
      isCustomerOnlyEdit(
        fila(),
        edicion({ presentationLines: [...base, { packagingProductId: ENVASE_B, packages: 2 }] }),
      ),
    ).toBe(false)
  })

  it('R13: sin reparto guardado ni entrante es igual', () => {
    expect(isCustomerOnlyEdit(fila({ presentationLines: [] }), edicion({ presentationLines: [] }))).toBe(true)
  })

  it('R13: un pedido guardado sin unidad nunca es igual', () => {
    expect(isCustomerOnlyEdit(fila({ unitId: null }), edicion())).toBe(false)
  })

  it('R13: otra unidad no es igual', () => {
    expect(isCustomerOnlyEdit(fila(), edicion({ unitId: OTRA_UNIDAD }))).toBe(false)
  })

  it('R13: la receta compara la efectiva; elegir una version frente a la original no es igual', () => {
    expect(isCustomerOnlyEdit(fila(), edicion({ recipeId: VERSION }))).toBe(false)
    expect(isCustomerOnlyEdit(fila({ recipeId: VERSION }), edicion({ recipeId: VERSION }))).toBe(true)
  })

  it('R13: otra prioridad no es igual', () => {
    expect(isCustomerOnlyEdit(fila(), edicion({ priority: 'ALTA' }))).toBe(false)
  })

  it('R13: no mira el cliente', () => {
    const conCliente = fila({ customerId: '99999999-9999-4999-8999-999999999999' })
    expect(isCustomerOnlyEdit(conCliente, edicion())).toBe(true)
  })
})

describe('sameDecimal — igualdad numerica exacta', () => {
  it('R13: ignora los ceros de la parte decimal y no pasa por coma flotante', () => {
    expect(sameDecimal('10', '10.0000')).toBe(true)
    expect(sameDecimal('0.1', '0.10')).toBe(true)
    expect(sameDecimal('9999999999.9999', '9999999999.9998')).toBe(false)
    expect(sameDecimal('1.5', '1.05')).toBe(false)
  })
})
