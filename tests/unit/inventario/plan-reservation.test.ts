import {
  planReservation,
  type ReservationCandidateBatch,
} from '@/lib/modules/inventario/domain/plan-reservation';
import type { ReservationRequirementLine } from '@/lib/modules/inventario/domain/reservation';

import type { UnitId } from '@/lib/modules/unidades';

function line(productId: string, quantity: string): ReservationRequirementLine {
  return { productId, quantity };
}

function batch(
  id: string,
  productId: string,
  purchaseDate: string,
  lot: string,
  available: string,
): ReservationCandidateBatch {
  return { id, productId, purchaseDate, lot, available };
}

describe('planReservation', () => {
  it('R8: reparte por fecha de compra ascendente, tomando de cada lote lo menor entre disponible y lo que falte', () => {
    const plan = planReservation({
      requirement: [line('p1', '15.0000')],
      products: new Map([['p1', 'kg' as UnitId]]),
      batches: [
        batch('b1', 'p1', '2026-02-01', '1', '10.0000'),
        batch('b2', 'p1', '2026-01-01', '2', '10.0000'),
      ],
    });

    expect(plan).toEqual({
      kind: 'reserved',
      allocations: [
        { batchId: 'b2', quantity: '10.0000' },
        { batchId: 'b1', quantity: '5.0000' },
      ],
    });
  });

  it("R8: con la misma fecha, desempata por numero de lote NUMERICO ('9' antes que '10')", () => {
    const plan = planReservation({
      requirement: [line('p1', '15.0000')],
      products: new Map([['p1', 'kg' as UnitId]]),
      batches: [
        batch('b10', 'p1', '2026-01-01', '10', '10.0000'),
        batch('b9', 'p1', '2026-01-01', '9', '10.0000'),
      ],
    });

    expect(plan).toEqual({
      kind: 'reserved',
      allocations: [
        { batchId: 'b9', quantity: '10.0000' },
        { batchId: 'b10', quantity: '5.0000' },
      ],
    });
  });

  it('R9: un producto sin unidad no se cubre y arrastra a todo el pedido', () => {
    const plan = planReservation({
      requirement: [line('p1', '5.0000'), line('p2', '2.0000')],
      products: new Map([
        ['p1', 'kg' as UnitId],
        ['p2', null],
      ]),
      batches: [batch('b1', 'p1', '2026-01-01', '1', '5.0000')],
    });

    expect(plan).toEqual({ kind: 'insufficient', productIds: ['p2'] });
  });

  it('R10: si un ingrediente no alcanza, no aparta nada del pedido, ni siquiera lo que si cubria', () => {
    const plan = planReservation({
      requirement: [line('p1', '5.0000'), line('p2', '100.0000')],
      products: new Map([
        ['p1', 'kg' as UnitId],
        ['p2', 'kg' as UnitId],
      ]),
      batches: [
        batch('b1', 'p1', '2026-01-01', '1', '5.0000'),
        batch('b2', 'p2', '2026-01-01', '1', '3.0000'),
      ],
    });

    expect(plan).toEqual({ kind: 'insufficient', productIds: ['p2'] });
  });

  it('R11: un pedido de 0.0001 con un ingrediente al 0.01 % aparta exactamente 0.0001', () => {
    // consumedQuantity('0.0001', '0.01') = '0.00000001': redondea hacia arriba al cuarto decimal.
    const plan = planReservation({
      requirement: [line('p1', '0.00000001')],
      products: new Map([['p1', 'kg' as UnitId]]),
      batches: [batch('b1', 'p1', '2026-01-01', '1', '1.0000')],
    });

    expect(plan).toEqual({ kind: 'reserved', allocations: [{ batchId: 'b1', quantity: '0.0001' }] });
  });

  it('R11: 200 por 10 % aparta 20 exacto, sin redondear', () => {
    const plan = planReservation({
      requirement: [line('p1', '20.0000')],
      products: new Map([['p1', 'kg' as UnitId]]),
      batches: [batch('b1', 'p1', '2026-01-01', '1', '20.0000')],
    });

    expect(plan).toEqual({ kind: 'reserved', allocations: [{ batchId: 'b1', quantity: '20.0000' }] });
  });

  it('R11: una necesidad con mas de cuatro decimales redondea hacia arriba, no al mas cercano', () => {
    const plan = planReservation({
      requirement: [line('p1', '0.02830100')],
      products: new Map([['p1', 'kg' as UnitId]]),
      batches: [batch('b1', 'p1', '2026-01-01', '1', '1.0000')],
    });

    expect(plan).toEqual({ kind: 'reserved', allocations: [{ batchId: 'b1', quantity: '0.0284' }] });
  });

  it('R49: una necesidad vacia (receta sin lineas) da reservado con cero asignaciones', () => {
    const plan = planReservation({
      requirement: [],
      products: new Map(),
      batches: [],
    });

    expect(plan).toEqual({ kind: 'reserved', allocations: [] });
  });
});
