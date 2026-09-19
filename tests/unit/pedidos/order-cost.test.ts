// tests/unit/pedidos/order-cost.test.ts
//
// `calculateIngredientsCost` es dominio puro: nada aqui toca la base ni el reloj. Los dobles
// son literales -sin `vi.fn()`- porque no hay nada que espiar, solo datos que construir.

import { describe, expect, it } from 'vitest';

import { calculateIngredientsCost, type CostInput, type RecipeCostLine } from '@/lib/modules/pedidos/domain/order-cost';

import type { CostingBatch } from '@/lib/modules/inventario';
import type { UnitConversion } from '@/lib/modules/unidades';

const PRODUCT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PRODUCT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

/** Base independiente: no comparte unidad base con gramo ni con litro. */
const PIEZA: UnitConversion = { id: 'pieza', baseUnitId: null, factor: null };

const GRAMO: UnitConversion = { id: 'g', baseUnitId: null, factor: null };
const KILOGRAMO: UnitConversion = { id: 'kg', baseUnitId: 'g', factor: '1000.0000' };

const LITRO: UnitConversion = { id: 'l', baseUnitId: null, factor: null };
/** El bidon del ejemplo de R26: veinte litros. */
const BIDON_20L: UnitConversion = { id: 'bidon', baseUnitId: 'l', factor: '20.0000' };

function unitsMap(...units: readonly UnitConversion[]): ReadonlyMap<string, UnitConversion> {
  return new Map(units.map((unit) => [unit.id, unit]));
}

function linea(overrides: Partial<RecipeCostLine> = {}): RecipeCostLine {
  return { productId: PRODUCT_A, quantity: '1.0000', unitId: LITRO.id, ...overrides };
}

function lote(overrides: Partial<CostingBatch> = {}): CostingBatch {
  return {
    productId: PRODUCT_A,
    lot: '1',
    stock: 1,
    unitCost: '1.0000',
    unitId: LITRO.id,
    purchaseDate: '2026-01-01',
    ...overrides,
  };
}

function input(overrides: Partial<CostInput> = {}): CostInput {
  return {
    orderQuantity: '1.0000',
    lines: [linea()],
    batches: [lote()],
    units: unitsMap(LITRO),
    ...overrides,
  };
}

describe('calculateIngredientsCost', () => {
  it('el importe sale del coste de los lotes y no de ningun precio (R1)', () => {
    const resultado = calculateIngredientsCost(
      input({
        orderQuantity: '10.0000',
        lines: [linea({ quantity: '2.0000' })],
        batches: [lote({ stock: 20, unitCost: '3.0000' })],
        units: unitsMap(LITRO),
      }),
    );

    // necesaria = 2 * 10 = 20, cubierta por un unico lote a 3.0000: 20 * 3 = 60
    expect(resultado).toBe('60.0000');
  });

  it('la cantidad necesaria es la de la linea por la del pedido (R2)', () => {
    const resultado = calculateIngredientsCost(
      input({
        orderQuantity: '200.0000',
        lines: [linea({ quantity: '10.0000' })],
        batches: [lote({ stock: 2000, unitCost: '1.0000' })],
        units: unitsMap(LITRO),
      }),
    );

    expect(resultado).toBe('2000.0000');
  });

  it('usa solo lotes con existencia, del mas antiguo al mas nuevo, hasta cubrir (R3)', () => {
    const resultado = calculateIngredientsCost(
      input({
        orderQuantity: '1.0000',
        lines: [linea({ quantity: '50.0000' })],
        batches: [
          lote({ lot: '1', purchaseDate: '2026-01-01', stock: 50, unitCost: '10.0000' }),
          // Mas nuevo y con existencia de sobra: no debe tocarse porque el primero ya cubre.
          lote({ lot: '2', purchaseDate: '2026-02-01', stock: 1000, unitCost: '999.0000' }),
        ],
        units: unitsMap(LITRO),
      }),
    );

    expect(resultado).toBe('500.0000');
  });

  it('desempata por numero de lote cuando la fecha de compra empata (R3)', () => {
    const resultado = calculateIngredientsCost(
      input({
        orderQuantity: '1.0000',
        lines: [linea({ quantity: '50.0000' })],
        batches: [
          lote({ lot: '2', purchaseDate: '2026-01-01', stock: 50, unitCost: '100.0000' }),
          lote({ lot: '1', purchaseDate: '2026-01-01', stock: 50, unitCost: '200.0000' }),
        ],
        units: unitsMap(LITRO),
      }),
    );

    // El lote '1' cubre la necesidad el solo: si el desempate fallara, se usaria el '2'.
    expect(resultado).toBe('10000.0000');
  });

  it('la fecha de vencimiento no altera el orden ni la seleccion (R4)', () => {
    // `CostingBatch` no declara fecha de vencimiento: el orden solo puede salir de
    // `purchaseDate` y del numero de lote. Aqui el array llega en el orden CONTRARIO al de
    // compra -como si alguien lo hubiera ordenado por una vencimiento imaginaria-, y aun asi
    // el lote mas antiguo se sigue usando primero.
    const resultado = calculateIngredientsCost(
      input({
        orderQuantity: '1.0000',
        lines: [linea({ quantity: '50.0000' })],
        batches: [
          lote({ lot: '2', purchaseDate: '2026-02-01', stock: 1000, unitCost: '999.0000' }),
          lote({ lot: '1', purchaseDate: '2026-01-01', stock: 50, unitCost: '10.0000' }),
        ],
        units: unitsMap(LITRO),
      }),
    );

    expect(resultado).toBe('500.0000');
  });

  it('promedia los costes unitarios de los lotes usados sin ponderar (R5)', () => {
    const resultado = calculateIngredientsCost(
      input({
        orderQuantity: '1.0000',
        lines: [linea({ quantity: '100.0000' })],
        batches: [
          lote({ lot: '1', purchaseDate: '2026-01-01', stock: 90, unitCost: '10.0000' }),
          lote({ lot: '2', purchaseDate: '2026-02-01', stock: 10, unitCost: '100.0000' }),
        ],
        units: unitsMap(LITRO),
      }),
    );

    // Promedio simple (10 + 100) / 2 = 55, y no el ponderado (90*10+10*100)/100 = 19.
    expect(resultado).toBe('5500.0000');
  });

  it('convierte la existencia y el coste cuando las unidades comparten base (R6)', () => {
    const resultado = calculateIngredientsCost(
      input({
        orderQuantity: '10.0000',
        lines: [linea({ quantity: '150.0000', unitId: GRAMO.id })],
        batches: [lote({ unitId: KILOGRAMO.id, stock: 2, unitCost: '5.0000' })],
        units: unitsMap(GRAMO, KILOGRAMO),
      }),
    );

    // necesaria = 1500 g; el lote trae 2 kg = 2000 g a 5.0000/kg = 0.005/g -> 1500 * 0.005
    expect(resultado).toBe('7.5000');
  });

  it('un ingrediente con unidad sin base comun no tiene coste (R7)', () => {
    const resultado = calculateIngredientsCost(
      input({
        lines: [linea({ unitId: LITRO.id })],
        batches: [lote({ unitId: PIEZA.id })],
        units: unitsMap(LITRO, PIEZA),
      }),
    );

    expect(resultado).toBeNull();
  });

  it('devuelve sin importe si la existencia no cubre (R8)', () => {
    const resultado = calculateIngredientsCost(
      input({
        lines: [linea({ quantity: '10.0000' })],
        batches: [lote({ stock: 5 })],
        units: unitsMap(LITRO),
      }),
    );

    expect(resultado).toBeNull();
  });

  it('devuelve sin importe si un ingrediente no se puede convertir (R8)', () => {
    const resultado = calculateIngredientsCost(
      input({
        lines: [linea({ unitId: LITRO.id })],
        batches: [lote({ unitId: PIEZA.id })],
        units: unitsMap(LITRO, PIEZA),
      }),
    );

    expect(resultado).toBeNull();
  });

  it('devuelve sin importe si la receta no tiene lineas (R8)', () => {
    const resultado = calculateIngredientsCost(input({ lines: [] }));

    expect(resultado).toBeNull();
  });

  it('nunca devuelve cero ni un importe parcial (R8)', () => {
    const resultado = calculateIngredientsCost(
      input({
        orderQuantity: '1.0000',
        lines: [
          linea({ productId: PRODUCT_A, quantity: '10.0000' }),
          linea({ productId: PRODUCT_B, quantity: '10.0000' }),
        ],
        batches: [
          // El primer ingrediente se cubre sin problema...
          lote({ productId: PRODUCT_A, stock: 10, unitCost: '100.0000' }),
          // ...pero el segundo no tiene existencia suficiente: el importe entero se pierde.
          lote({ productId: PRODUCT_B, stock: 1, unitCost: '1.0000' }),
        ],
        units: unitsMap(LITRO),
      }),
    );

    expect(resultado).toBeNull();
    expect(resultado).not.toBe('0.0000');
    expect(resultado).not.toBe('1000.0000');
  });

  it('los cinco casos sin importe devuelven exactamente la misma salida (R9)', () => {
    const existenciaInsuficiente = calculateIngredientsCost(
      input({ lines: [linea({ quantity: '10.0000' })], batches: [lote({ stock: 5 })], units: unitsMap(LITRO) }),
    );
    const unidadIncompatible = calculateIngredientsCost(
      input({
        lines: [linea({ unitId: LITRO.id })],
        batches: [lote({ unitId: PIEZA.id })],
        units: unitsMap(LITRO, PIEZA),
      }),
    );
    const recetaSinLineas = calculateIngredientsCost(input({ lines: [] }));
    const productoSinLotes = calculateIngredientsCost(input({ batches: [] }));
    const desbordamiento = calculateIngredientsCost(
      input({
        orderQuantity: '1.0000',
        lines: [linea({ quantity: '1.0000' })],
        batches: [lote({ stock: 1, unitCost: '10000000000.0000' })],
        units: unitsMap(LITRO),
      }),
    );

    expect([
      existenciaInsuficiente,
      unidadIncompatible,
      recetaSinLineas,
      productoSinLotes,
      desbordamiento,
    ]).toEqual([null, null, null, null, null]);
  });

  it('el importe viaja como cadena decimal de cuatro decimales y nunca como numero (R19)', () => {
    const resultado = calculateIngredientsCost(
      input({
        orderQuantity: '3.0000',
        lines: [linea({ quantity: '1.0000' })],
        batches: [lote({ stock: 3, unitCost: '2.5000' })],
        units: unitsMap(LITRO),
      }),
    );

    expect(typeof resultado).toBe('string');
    expect(resultado).toMatch(/^\d+\.\d{4}$/);
    expect(resultado).toBe('7.5000');
  });

  it('un importe que no cabe en decimal(14,4) sale sin numero y no distinguible de los otros cuatro casos (R24)', () => {
    const resultado = calculateIngredientsCost(
      input({
        orderQuantity: '1.0000',
        lines: [linea({ quantity: '1.0000' })],
        batches: [lote({ stock: 1, unitCost: '10000000000.0000' })],
        units: unitsMap(LITRO),
      }),
    );

    expect(resultado).toBeNull();
  });

  it('con la misma fecha de compra el lote 9 se usa antes que el 10 (R25)', () => {
    const resultado = calculateIngredientsCost(
      input({
        orderQuantity: '1.0000',
        lines: [linea({ quantity: '5.0000' })],
        batches: [
          lote({ lot: '10', purchaseDate: '2026-01-01', stock: 100, unitCost: '999.0000' }),
          lote({ lot: '9', purchaseDate: '2026-01-01', stock: 5, unitCost: '10.0000' }),
        ],
        units: unitsMap(LITRO),
      }),
    );

    // Si el orden fuera de texto, '10' iria antes que '9' y el resultado saldria de 999.0000.
    expect(resultado).toBe('50.0000');
  });

  it('si un numero de lote no es solo digitos el desempate es por texto (R25)', () => {
    const resultado = calculateIngredientsCost(
      input({
        orderQuantity: '1.0000',
        lines: [linea({ quantity: '5.0000' })],
        batches: [
          lote({ lot: 'A9', purchaseDate: '2026-01-01', stock: 100, unitCost: '999.0000' }),
          lote({ lot: 'A10', purchaseDate: '2026-01-01', stock: 5, unitCost: '10.0000' }),
        ],
        units: unitsMap(LITRO),
      }),
    );

    // Como texto, 'A10' precede a 'A9' ('1' < '9' en el segundo caracter).
    expect(resultado).toBe('50.0000');
  });

  it('convierte tambien el coste unitario a la unidad de la linea: 20.000 por bidon de 20 L son 1.000 por litro (R26)', () => {
    const resultado = calculateIngredientsCost(
      input({
        orderQuantity: '1.0000',
        lines: [linea({ quantity: '20.0000', unitId: LITRO.id })],
        batches: [lote({ unitId: BIDON_20L.id, stock: 1, unitCost: '20.0000' })],
        units: unitsMap(LITRO, BIDON_20L),
      }),
    );

    // 1 bidon = 20 L; 20.000/bidon = 1.000/L; necesaria 20 L * 1.000/L = 20.0000
    expect(resultado).toBe('20.0000');
  });

  it('no promedia costes unitarios de unidades distintas (R26)', () => {
    const resultado = calculateIngredientsCost(
      input({
        orderQuantity: '1.0000',
        lines: [linea({ quantity: '30.0000', unitId: LITRO.id })],
        batches: [
          lote({ lot: '1', purchaseDate: '2026-01-01', unitId: LITRO.id, stock: 10, unitCost: '2.0000' }),
          lote({ lot: '2', purchaseDate: '2026-02-01', unitId: BIDON_20L.id, stock: 1, unitCost: '20.0000' }),
        ],
        units: unitsMap(LITRO, BIDON_20L),
      }),
    );

    // Normalizado a litro: 2.0000 y 1.0000 (20/bidon = 1/L) -> promedio 1.5; 1.5 * 30 = 45
    // Si se promediaran los costes en bruto (2.0000 y 20.0000) saldria 330.0000.
    expect(resultado).toBe('45.0000');
  });

  it('cubre exactamente la existencia cuando la necesidad iguala el stock disponible', () => {
    const resultado = calculateIngredientsCost(
      input({
        orderQuantity: '1.0000',
        lines: [linea({ quantity: '25.0000' })],
        batches: [lote({ stock: 25, unitCost: '4.0000' })],
        units: unitsMap(LITRO),
      }),
    );

    expect(resultado).toBe('100.0000');
  });

  it('no cubre por una milesima y queda sin importe', () => {
    const resultado = calculateIngredientsCost(
      input({
        orderQuantity: '1.0000',
        lines: [linea({ quantity: '25.0001' })],
        batches: [lote({ stock: 25, unitCost: '4.0000' })],
        units: unitsMap(LITRO),
      }),
    );

    expect(resultado).toBeNull();
  });

  it('un producto sin lotes deja el pedido sin importe', () => {
    const resultado = calculateIngredientsCost(
      input({
        lines: [linea({ productId: PRODUCT_A })],
        batches: [lote({ productId: PRODUCT_B })],
        units: unitsMap(LITRO),
      }),
    );

    expect(resultado).toBeNull();
  });
});
