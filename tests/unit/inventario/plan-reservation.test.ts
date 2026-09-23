import {
  planReservation,
  type ReservationCandidateBatch,
} from '@/lib/modules/inventario/domain/plan-reservation';
import type { ReservationRequirementLine } from '@/lib/modules/inventario/domain/reservation';

import type { UnitConversion, UnitId } from '@/lib/modules/unidades';

const KILOGRAMO: UnitConversion = { id: 'kg', baseUnitId: null, factor: null };
const GRAMO: UnitConversion = { id: 'g', baseUnitId: 'kg', factor: '0.0010' };
const LITRO: UnitConversion = { id: 'l', baseUnitId: null, factor: null };
const PIEZA: UnitConversion = { id: 'pieza', baseUnitId: null, factor: null };
const ONZA: UnitConversion = { id: 'oz', baseUnitId: 'kg', factor: '0.0283010' };

function unitsMap(...units: readonly UnitConversion[]): ReadonlyMap<UnitId, UnitConversion> {
  return new Map(units.map((unit) => [unit.id, unit]));
}

function line(productId: string, quantity: string, unitId: string): ReservationRequirementLine {
  return { productId, quantity, unitId };
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
      requirement: [line('p1', '15.0000', 'kg')],
      products: new Map([['p1', 'kg' as UnitId]]),
      batches: [
        batch('b1', 'p1', '2026-02-01', '1', '10.0000'),
        batch('b2', 'p1', '2026-01-01', '2', '10.0000'),
      ],
      units: unitsMap(KILOGRAMO),
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
      requirement: [line('p1', '15.0000', 'kg')],
      products: new Map([['p1', 'kg' as UnitId]]),
      batches: [
        batch('b10', 'p1', '2026-01-01', '10', '10.0000'),
        batch('b9', 'p1', '2026-01-01', '9', '10.0000'),
      ],
      units: unitsMap(KILOGRAMO),
    });

    expect(plan).toEqual({
      kind: 'reserved',
      allocations: [
        { batchId: 'b9', quantity: '10.0000' },
        { batchId: 'b10', quantity: '5.0000' },
      ],
    });
  });

  it('R10: si un ingrediente no alcanza, no aparta nada del pedido, ni siquiera lo que si cubria', () => {
    const plan = planReservation({
      requirement: [line('p1', '5.0000', 'kg'), line('p2', '100.0000', 'kg')],
      products: new Map([
        ['p1', 'kg' as UnitId],
        ['p2', 'kg' as UnitId],
      ]),
      batches: [
        batch('b1', 'p1', '2026-01-01', '1', '5.0000'),
        batch('b2', 'p2', '2026-01-01', '1', '3.0000'),
      ],
      units: unitsMap(KILOGRAMO),
    });

    expect(plan).toEqual({ kind: 'insufficient', productIds: ['p2'] });
  });

  it('R9: el producto sin unidad se salta y no impide apartar los demas', () => {
    const plan = planReservation({
      requirement: [line('p1', '5.0000', 'kg'), line('p2', '2.0000', 'l')],
      products: new Map([
        ['p1', 'kg' as UnitId],
        ['p2', null],
      ]),
      batches: [batch('b1', 'p1', '2026-01-01', '1', '5.0000')],
      units: unitsMap(KILOGRAMO, LITRO),
    });

    expect(plan).toEqual({ kind: 'reserved', allocations: [{ batchId: 'b1', quantity: '5.0000' }] });
  });

  it('R9: la unidad de la linea sin base comun con la del producto se salta y no impide apartar los demas', () => {
    const plan = planReservation({
      requirement: [line('p1', '5.0000', 'kg'), line('p2', '3.0000', 'pieza')],
      products: new Map([
        ['p1', 'kg' as UnitId],
        ['p2', 'l' as UnitId],
      ]),
      batches: [
        batch('b1', 'p1', '2026-01-01', '1', '5.0000'),
        batch('b2', 'p2', '2026-01-01', '1', '10.0000'),
      ],
      units: unitsMap(KILOGRAMO, LITRO, PIEZA),
    });

    expect(plan).toEqual({ kind: 'reserved', allocations: [{ batchId: 'b1', quantity: '5.0000' }] });
  });

  it('convierte la necesidad de la unidad de la linea a la unidad del producto antes de repartir', () => {
    const plan = planReservation({
      requirement: [line('p1', '1500.0000', 'g')],
      products: new Map([['p1', 'kg' as UnitId]]),
      batches: [batch('b1', 'p1', '2026-01-01', '1', '2.0000')],
      units: unitsMap(KILOGRAMO, GRAMO),
    });

    expect(plan).toEqual({ kind: 'reserved', allocations: [{ batchId: 'b1', quantity: '1.5000' }] });
  });

  it('R11: redondea hacia arriba al cuarto decimal solo cuando la conversion da mas de cuatro decimales', () => {
    const plan = planReservation({
      requirement: [line('p1', '1.0000', 'g')],
      products: new Map([['p1', 'kg' as UnitId]]),
      batches: [batch('b1', 'p1', '2026-01-01', '1', '1.0000')],
      units: unitsMap(KILOGRAMO, GRAMO),
    });

    // 1 g = 0.0010000000... kg exacto, cabe en cuatro decimales: no se redondea.
    expect(plan).toEqual({ kind: 'reserved', allocations: [{ batchId: 'b1', quantity: '0.0010' }] });
  });

  it('R11: redondea hacia arriba y no al mas cercano: 0.028301 sube a 0.0284, no a 0.0283', () => {
    const plan = planReservation({
      requirement: [line('p1', '1.0000', 'oz')],
      products: new Map([['p1', 'kg' as UnitId]]),
      batches: [batch('b1', 'p1', '2026-01-01', '1', '1.0000')],
      units: unitsMap(KILOGRAMO, ONZA),
    });

    expect(plan).toEqual({ kind: 'reserved', allocations: [{ batchId: 'b1', quantity: '0.0284' }] });
  });

  it('R11: no redondea cuando la cantidad necesaria ya cabe en cuatro decimales', () => {
    const plan = planReservation({
      requirement: [line('p1', '2.5000', 'kg')],
      products: new Map([['p1', 'kg' as UnitId]]),
      batches: [batch('b1', 'p1', '2026-01-01', '1', '2.5000')],
      units: unitsMap(KILOGRAMO),
    });

    expect(plan).toEqual({ kind: 'reserved', allocations: [{ batchId: 'b1', quantity: '2.5000' }] });
  });

  it('receta vacia da reservado con cero asignaciones', () => {
    const plan = planReservation({
      requirement: [],
      products: new Map(),
      batches: [],
      units: unitsMap(),
    });

    expect(plan).toEqual({ kind: 'reserved', allocations: [] });
  });

  it('una necesidad que redondea a cero se salta y no cuenta como insuficiente', () => {
    const plan = planReservation({
      requirement: [line('p1', '0.0000', 'kg')],
      products: new Map([['p1', 'kg' as UnitId]]),
      batches: [],
      units: unitsMap(KILOGRAMO),
    });

    expect(plan).toEqual({ kind: 'reserved', allocations: [] });
  });
});
