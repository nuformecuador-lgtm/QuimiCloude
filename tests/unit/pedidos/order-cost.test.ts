// tests/unit/pedidos/order-cost.test.ts
//
// `calculateIngredientsCost` es dominio puro: nada aqui toca la base ni el reloj. Los dobles
// son literales -sin `vi.fn()`- porque no hay nada que espiar, solo datos que construir.
//
// Cada linea trae un porcentaje, no una cantidad: la necesaria sale de
// `consumedQuantity(orderQuantity, percentage)`. La mayoria de los casos usan `percentage:
// '100.00'` y ponen la cantidad necesaria directamente en `orderQuantity` -asi el escenario
// (promedio, redondeo, conversion) queda igual de legible que con una cantidad literal-; los
// que ejercitan la multiplicacion en si usan un porcentaje real.
//
// El coste ya NO acumula lotes hasta cubrir ni promedia solo los usados: promedia TODOS los
// lotes con disponible mayor que cero, se necesiten o no para cubrir, sin ordenarlos ni
// cortar. `CostingBatch.available` es el campo que gobierna la cobertura y el promedio;
// `stock` queda solo de referencia.

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

/** Por defecto la linea consume el 100 % del pedido: la cantidad necesaria queda igual a
 *  `orderQuantity`, para que cada test ponga la necesaria donde quiera sin repetir la cuenta. */
function linea(overrides: Partial<RecipeCostLine> = {}): RecipeCostLine {
  return { productId: PRODUCT_A, percentage: '100.00', unitId: LITRO.id, ...overrides };
}

/** `available` por defecto es el mismo `stock`, como un lote sin nada apartado. Un test que
 *  quiera un lote parcial o totalmente reservado pasa `available` explicito, distinto de
 *  `stock`. */
function lote(overrides: Partial<CostingBatch> = {}): CostingBatch {
  const stock = overrides.stock ?? '1';
  return {
    productId: PRODUCT_A,
    lot: '1',
    stock,
    unitCost: '1.0000',
    unitId: LITRO.id,
    purchaseDate: '2026-01-01',
    available: stock,
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
  it('pedido 200, 10 % de un insumo en L con un lote de 50 L a 2,0000 -> 40,0000 (R59)', () => {
    const resultado = calculateIngredientsCost(
      input({
        orderQuantity: '200.0000',
        lines: [linea({ percentage: '10.00' })],
        batches: [lote({ stock: '50', unitCost: '2.0000' })],
        units: unitsMap(LITRO),
      }),
    );

    // necesaria = 200 * 10 / 100 = 20, cubierta por el lote de 50 L a 2.0000: 20 * 2 = 40.
    expect(resultado).toBe('40.0000');
  });

  it('el importe sale del coste de los lotes y no de ningun precio (R59)', () => {
    const resultado = calculateIngredientsCost(
      input({
        orderQuantity: '200.0000',
        lines: [linea({ percentage: '10.00' })],
        batches: [lote({ stock: '20', unitCost: '3.0000' })],
        units: unitsMap(LITRO),
      }),
    );

    // necesaria = 200 * 10 / 100 = 20, cubierta por un unico lote a 3.0000: 20 * 3 = 60.
    expect(resultado).toBe('60.0000');
  });

  it('el ejemplo de D22 -necesidad 30, disponibles A 20@10, B 20@12, C 50@15- da 370,0000 (R59)', () => {
    const resultado = calculateIngredientsCost(
      input({
        orderQuantity: '30.0000',
        batches: [
          lote({ lot: 'A', purchaseDate: '2026-01-01', stock: '20', unitCost: '10.0000' }),
          lote({ lot: 'B', purchaseDate: '2026-01-05', stock: '20', unitCost: '12.0000' }),
          lote({ lot: 'C', purchaseDate: '2026-01-10', stock: '50', unitCost: '15.0000' }),
        ],
        units: unitsMap(LITRO),
      }),
    );

    // promedio simple (10 + 12 + 15) / 3 = 12,333333333333; * 30 = 369,99999999999 -> 370,0000.
    expect(resultado).toBe('370.0000');
  });

  it('D22 de QC-141 deroga QC-123 D3/D4: promedia TODOS los lotes con disponible, no solo los que harian falta para cubrir (R59, R60)', () => {
    const resultado = calculateIngredientsCost(
      input({
        orderQuantity: '50.0000',
        batches: [
          // Este lote solo ya cubre la necesidad de 50: con la regla vieja, el segundo no se
          // habria tocado y el coste habria salido de 10,0000 en solitario (500,0000).
          lote({ lot: '1', purchaseDate: '2026-01-01', stock: '50', unitCost: '10.0000' }),
          lote({ lot: '2', purchaseDate: '2026-02-01', stock: '1000', unitCost: '999.0000' }),
        ],
        units: unitsMap(LITRO),
      }),
    );

    // promedio simple, sin ponderar por cantidad: (10 + 999) / 2 = 504,5; * 50 = 25225.
    expect(resultado).toBe('25225.0000');
  });

  it('D22 de QC-141 deroga QC-123 D3/D4: el orden de los lotes -y su desempate por numero de lote- ya no afecta el coste (R60)', () => {
    const batchesEnUnOrden = [
      lote({ lot: '2', purchaseDate: '2026-01-01', stock: '50', unitCost: '100.0000' }),
      lote({ lot: '1', purchaseDate: '2026-01-01', stock: '50', unitCost: '200.0000' }),
    ];
    const batchesEnElOrdenContrario = [...batchesEnUnOrden].reverse();

    const resultadoA = calculateIngredientsCost(
      input({ orderQuantity: '50.0000', batches: batchesEnUnOrden, units: unitsMap(LITRO) }),
    );
    const resultadoB = calculateIngredientsCost(
      input({ orderQuantity: '50.0000', batches: batchesEnElOrdenContrario, units: unitsMap(LITRO) }),
    );

    // Los dos lotes cubren la necesidad juntos (100 disponible >= 50): promedio (100+200)/2=150,
    // sin importar cual vaya primero en el array. Con la regla vieja el lote '1' habria cubierto
    // el solo y el resultado habria dependido del desempate.
    expect(resultadoA).toBe('7500.0000');
    expect(resultadoB).toBe('7500.0000');
  });

  it('D22 de QC-141 deroga QC-123 D3/D4: numeros de lote numericos y de texto en la misma fecha dan el mismo coste (R60)', () => {
    const resultadoNumerico = calculateIngredientsCost(
      input({
        orderQuantity: '5.0000',
        batches: [
          lote({ lot: '10', purchaseDate: '2026-01-01', stock: '100', unitCost: '999.0000' }),
          lote({ lot: '9', purchaseDate: '2026-01-01', stock: '5', unitCost: '10.0000' }),
        ],
        units: unitsMap(LITRO),
      }),
    );
    const resultadoTexto = calculateIngredientsCost(
      input({
        orderQuantity: '5.0000',
        batches: [
          lote({ lot: 'A9', purchaseDate: '2026-01-01', stock: '100', unitCost: '999.0000' }),
          lote({ lot: 'A10', purchaseDate: '2026-01-01', stock: '5', unitCost: '10.0000' }),
        ],
        units: unitsMap(LITRO),
      }),
    );

    // Con la regla vieja, '9' habria ido antes que '10' pero 'A10' antes que 'A9' (desempate por
    // texto), dando resultados distintos entre los dos casos. Sin ese desempate interviniendo:
    // el promedio de los dos (999 + 10) / 2 = 504,5 es el mismo en los dos casos; * 5 = 2522,5.
    expect(resultadoNumerico).toBe('2522.5000');
    expect(resultadoTexto).toBe('2522.5000');
  });

  it('D22 de QC-141 deroga QC-123 D3/D4: la fecha de vencimiento no altera el orden ni la seleccion (R4)', () => {
    const conVencimientoImaginarioAscendente = [
      lote({ lot: '1', purchaseDate: '2026-01-01', stock: '50', unitCost: '10.0000' }),
      lote({ lot: '2', purchaseDate: '2026-06-01', stock: '50', unitCost: '30.0000' }),
    ];
    const mismosLotesPermutados = [...conVencimientoImaginarioAscendente].reverse();

    const resultadoAscendente = calculateIngredientsCost(
      input({ orderQuantity: '50.0000', batches: conVencimientoImaginarioAscendente, units: unitsMap(LITRO) }),
    );
    const resultadoPermutado = calculateIngredientsCost(
      input({ orderQuantity: '50.0000', batches: mismosLotesPermutados, units: unitsMap(LITRO) }),
    );

    // `CostingBatch` no declara fecha de vencimiento: el mismo conjunto de lotes, con las fechas
    // permutadas como si alguien hubiera reordenado por una vencimiento imaginaria, promedia
    // igual -(10+30)/2=20; 50*20=1000- porque D22 ya no ordena ni corta por cobertura.
    expect(resultadoAscendente).toBe('1000.0000');
    expect(resultadoPermutado).toBe('1000.0000');
  });

  it('R60: no pondera el promedio por la cantidad de ningun lote', () => {
    const resultado = calculateIngredientsCost(
      input({
        orderQuantity: '50.0000',
        batches: [
          lote({ lot: '1', stock: '1', unitCost: '10.0000' }),
          lote({ lot: '2', stock: '99', unitCost: '1000.0000' }),
        ],
        units: unitsMap(LITRO),
      }),
    );

    // Promedio simple (10 + 1000) / 2 = 505; el ponderado por cantidad (1*10+99*1000)/100 = 990.1
    // seria otro numero.
    expect(resultado).toBe('25250.0000');
  });

  it('R60: no incluye en el promedio ni en la cobertura un lote con disponible cero', () => {
    const resultado = calculateIngredientsCost(
      input({
        orderQuantity: '10.0000',
        batches: [
          // Existencia alta pero apartada entera por otro pedido: disponible cero.
          lote({ lot: '1', stock: '1000', unitCost: '1.0000', available: '0.0000' }),
          lote({ lot: '2', stock: '10', unitCost: '5.0000' }),
        ],
        units: unitsMap(LITRO),
      }),
    );

    // Si el lote agotado entrara en el promedio saldria (1+5)/2=3, coste 30,0000. Al excluirlo
    // el promedio es 5,0000 en solitario: 10 * 5 = 50.
    expect(resultado).toBe('50.0000');
  });

  it('convierte la existencia disponible y el coste cuando las unidades comparten base (R59)', () => {
    const resultado = calculateIngredientsCost(
      input({
        orderQuantity: '1500.0000',
        lines: [linea({ unitId: GRAMO.id })],
        batches: [lote({ unitId: KILOGRAMO.id, stock: '2', unitCost: '5.0000' })],
        units: unitsMap(GRAMO, KILOGRAMO),
      }),
    );

    // necesaria = 1500 g; el lote trae 2 kg = 2000 g a 5.0000/kg = 0.005/g -> 1500 * 0.005
    expect(resultado).toBe('7.5000');
  });

  it('un ingrediente con unidad sin base comun no tiene coste (R61)', () => {
    const resultado = calculateIngredientsCost(
      input({
        lines: [linea({ unitId: LITRO.id })],
        batches: [lote({ unitId: PIEZA.id })],
        units: unitsMap(LITRO, PIEZA),
      }),
    );

    expect(resultado).toBeNull();
  });

  it('devuelve sin importe si el disponible no cubre por menos de lo necesario (R61)', () => {
    const resultado = calculateIngredientsCost(
      input({
        orderQuantity: '10.0000',
        // Existencia de sobra, pero casi todo apartado por otros pedidos: disponible 9,9999.
        batches: [lote({ stock: '20', available: '9.9999', unitCost: '4.0000' })],
        units: unitsMap(LITRO),
      }),
    );

    expect(resultado).toBeNull();
  });

  it('devuelve sin importe si un ingrediente no se puede convertir (R61)', () => {
    const resultado = calculateIngredientsCost(
      input({
        lines: [linea({ unitId: LITRO.id })],
        batches: [lote({ unitId: PIEZA.id })],
        units: unitsMap(LITRO, PIEZA),
      }),
    );

    expect(resultado).toBeNull();
  });

  it('devuelve sin importe si la receta no tiene lineas (R61)', () => {
    const resultado = calculateIngredientsCost(input({ lines: [] }));

    expect(resultado).toBeNull();
  });

  it('una linea con unidad desconocida (unitId null) devuelve sin importe (R61)', () => {
    const resultado = calculateIngredientsCost(
      input({
        lines: [linea({ unitId: null })],
        batches: [lote({ stock: '10', unitCost: '1.0000' })],
        units: unitsMap(LITRO),
      }),
    );

    expect(resultado).toBeNull();
  });

  it('nunca devuelve cero ni un importe parcial (R61)', () => {
    const resultado = calculateIngredientsCost(
      input({
        orderQuantity: '10.0000',
        lines: [
          linea({ productId: PRODUCT_A }),
          linea({ productId: PRODUCT_B }),
        ],
        batches: [
          // El primer ingrediente se cubre sin problema...
          lote({ productId: PRODUCT_A, stock: '10', unitCost: '100.0000' }),
          // ...pero el segundo no tiene disponible suficiente: el importe entero se pierde.
          lote({ productId: PRODUCT_B, stock: '1', unitCost: '1.0000' }),
        ],
        units: unitsMap(LITRO),
      }),
    );

    expect(resultado).toBeNull();
    expect(resultado).not.toBe('0.0000');
    expect(resultado).not.toBe('1000.0000');
  });

  it('los caminos sin importe del calculo devuelven exactamente la misma salida (R61, R63)', () => {
    const disponibleInsuficiente = calculateIngredientsCost(
      input({ orderQuantity: '10.0000', batches: [lote({ stock: '5' })], units: unitsMap(LITRO) }),
    );
    const unidadIncompatible = calculateIngredientsCost(
      input({
        lines: [linea({ unitId: LITRO.id })],
        batches: [lote({ unitId: PIEZA.id })],
        units: unitsMap(LITRO, PIEZA),
      }),
    );
    const unidadDesconocida = calculateIngredientsCost(
      input({ lines: [linea({ unitId: null })], batches: [lote({ stock: '10' })], units: unitsMap(LITRO) }),
    );
    const recetaSinLineas = calculateIngredientsCost(input({ lines: [] }));
    const desbordamiento = calculateIngredientsCost(
      input({
        orderQuantity: '1.0000',
        batches: [lote({ stock: '1', unitCost: '10000000000.0000' })],
        units: unitsMap(LITRO),
      }),
    );

    expect([disponibleInsuficiente, unidadIncompatible, unidadDesconocida, recetaSinLineas, desbordamiento]).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it('el importe viaja como cadena decimal de cuatro decimales y nunca como numero (R59, R63)', () => {
    const resultado = calculateIngredientsCost(
      input({
        orderQuantity: '3.0000',
        batches: [lote({ stock: '3', unitCost: '2.5000' })],
        units: unitsMap(LITRO),
      }),
    );

    expect(typeof resultado).toBe('string');
    expect(resultado).toMatch(/^\d+\.\d{4}$/);
    expect(resultado).toBe('7.5000');
  });

  it('un importe que no cabe en decimal(14,4) sale sin numero, indistinguible de los otros casos (R63)', () => {
    const resultado = calculateIngredientsCost(
      input({
        orderQuantity: '1.0000',
        batches: [lote({ stock: '1', unitCost: '10000000000.0000' })],
        units: unitsMap(LITRO),
      }),
    );

    expect(resultado).toBeNull();
  });

  it('convierte tambien el coste unitario a la unidad de la linea: 20.000 por bidon de 20 L son 1.000 por litro (R59)', () => {
    const resultado = calculateIngredientsCost(
      input({
        orderQuantity: '20.0000',
        lines: [linea({ unitId: LITRO.id })],
        batches: [lote({ unitId: BIDON_20L.id, stock: '1', unitCost: '20.0000' })],
        units: unitsMap(LITRO, BIDON_20L),
      }),
    );

    // 1 bidon = 20 L; 20.000/bidon = 1.000/L; necesaria 20 L * 1.000/L = 20.0000
    expect(resultado).toBe('20.0000');
  });

  it('promedia costes ya convertidos a la unidad de la linea, no los costes en bruto (R59)', () => {
    const resultado = calculateIngredientsCost(
      input({
        orderQuantity: '30.0000',
        lines: [linea({ unitId: LITRO.id })],
        batches: [
          lote({ lot: '1', purchaseDate: '2026-01-01', unitId: LITRO.id, stock: '10', unitCost: '2.0000' }),
          lote({ lot: '2', purchaseDate: '2026-02-01', unitId: BIDON_20L.id, stock: '1', unitCost: '20.0000' }),
        ],
        units: unitsMap(LITRO, BIDON_20L),
      }),
    );

    // Normalizado a litro: 2.0000 y 1.0000 (20/bidon = 1/L) -> promedio 1.5; 1.5 * 30 = 45
    // Si se promediaran los costes en bruto (2.0000 y 20.0000) saldria 330.0000.
    expect(resultado).toBe('45.0000');
  });

  it('cubre exactamente cuando la necesidad iguala el disponible, aunque la existencia sea mayor (R61)', () => {
    const resultado = calculateIngredientsCost(
      input({
        orderQuantity: '25.0000',
        // La existencia es mucho mayor que lo disponible: lo que decide la cobertura es
        // `available`, no `stock`.
        batches: [lote({ stock: '999', available: '25.0000', unitCost: '4.0000' })],
        units: unitsMap(LITRO),
      }),
    );

    expect(resultado).toBe('100.0000');
  });

  it('no cubre por una milesima de disponible y queda sin importe (R61)', () => {
    // La necesaria sale de `orderQuantity * percentage / 100`: con un porcentaje de 2 decimales,
    // la milesima extra viene de la propia cantidad del pedido.
    const resultado = calculateIngredientsCost(
      input({
        orderQuantity: '250.0010',
        lines: [linea({ percentage: '10.00' })],
        batches: [lote({ stock: '25', unitCost: '4.0000' })],
        units: unitsMap(LITRO),
      }),
    );

    expect(resultado).toBeNull();
  });

  it('un producto sin lotes deja el pedido sin importe (R61)', () => {
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
