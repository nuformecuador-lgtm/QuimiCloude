// tests/unit/pedidos/order-distribution.test.ts — R5-R8, R35, R36, R42.
//
// `validateDistribution` es dominio puro: sin base, sin framework, sin reloj. Cubre el
// disponible exacto, el orden de los fallos y que ninguna cifra pasa por `number`.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { validateDistribution, type DistributionLine } from '@/lib/modules/pedidos/domain/order-distribution';

import type { UnitConversion } from '@/lib/modules/unidades';

const LITRO: UnitConversion = { id: 'litro', baseUnitId: null, factor: null };
const MILILITRO: UnitConversion = { id: 'mililitro', baseUnitId: 'litro', factor: '0.001' };
const KILO: UnitConversion = { id: 'kilo', baseUnitId: null, factor: null };

function linea(overrides: Partial<DistributionLine> = {}): DistributionLine {
  return {
    presentationId: 'presentacion-1',
    packages: 5,
    content: '1.0000',
    unit: LITRO,
    ...overrides,
  };
}

describe('validateDistribution', () => {
  it('R42: sin unidad del pedido, rechaza with without_unit sin mirar las lineas', () => {
    const resultado = validateDistribution('100', null, [linea()]);
    expect(resultado).toEqual({ kind: 'without_unit' });
  });

  it('R6, R8: reparto menor que el total, disponible exacto en la unidad del pedido', () => {
    const resultado = validateDistribution('100', LITRO, [linea({ packages: 5, content: '1' })]);
    expect(resultado).toEqual({ kind: 'ok', available: '95' });
  });

  it('R8: reparto exactamente igual al total, disponible 0, se acepta', () => {
    const resultado = validateDistribution('5', LITRO, [linea({ packages: 5, content: '1' })]);
    expect(resultado).toEqual({ kind: 'ok', available: '0' });
  });

  it('R36: el reparto pasa del total por 0.0001, rechaza con exceeds_quantity', () => {
    const resultado = validateDistribution('4.9999', LITRO, [linea({ packages: 5, content: '1' })]);
    expect(resultado).toEqual({ kind: 'exceeds_quantity', available: '-0.0001' });
  });

  it('R7: unidad de la presentacion sin base comun con la del pedido, rechaza con incompatible_units', () => {
    const resultado = validateDistribution('100', KILO, [linea({ unit: LITRO })]);
    expect(resultado).toEqual({ kind: 'incompatible_units', presentationId: 'presentacion-1' });
  });

  it('R35: linea sin contenido, rechaza con presentation_without_content, sin convertir nada', () => {
    const resultado = validateDistribution('100', LITRO, [linea({ content: null })]);
    expect(resultado).toEqual({ kind: 'presentation_without_content', presentationId: 'presentacion-1' });
  });

  it('conversion L <-> ml: dos lineas en unidades distintas se suman convertidas a la del pedido', () => {
    const resultado = validateDistribution('1', LITRO, [
      linea({ presentationId: 'p-1', packages: 2, content: '100', unit: MILILITRO }),
      linea({ presentationId: 'p-2', packages: 1, content: '0.5', unit: LITRO }),
    ]);
    // 2 x 100 ml = 200 ml = 0.2 L; + 1 x 0.5 L = 0.5 L; total 0.7 L; disponible 1 - 0.7 = 0.3.
    expect(resultado).toEqual({ kind: 'ok', available: '0.3' });
  });

  it('el primer fallo detiene la validacion: una segunda linea incompatible no se evalua si la primera ya sin contenido', () => {
    const resultado = validateDistribution('100', LITRO, [
      linea({ presentationId: 'p-1', content: null }),
      linea({ presentationId: 'p-2', unit: KILO }),
    ]);
    expect(resultado).toEqual({ kind: 'presentation_without_content', presentationId: 'p-1' });
  });

  it('sin ninguna linea, el disponible es la cantidad entera del pedido', () => {
    const resultado = validateDistribution('42.5000', LITRO, []);
    expect(resultado).toEqual({ kind: 'ok', available: '42.5000' });
  });

  it('no convierte ninguna cantidad a numero de coma flotante en el codigo fuente', () => {
    const fuente = readFileSync(
      join(__dirname, '..', '..', '..', 'lib', 'modules', 'pedidos', 'domain', 'order-distribution.ts'),
      'utf8',
    );
    for (const prohibido of ['Number(', 'parseFloat', 'parseInt']) {
      expect(fuente.includes(prohibido), `order-distribution.ts no puede usar ${prohibido}`).toBe(false);
    }
    expect(fuente).toContain('BigInt');
  });
});
