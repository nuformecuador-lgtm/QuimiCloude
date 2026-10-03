// Lo que cubre una linea del reparto, en la unidad del pedido y como porcentaje de su cantidad.

import { describe, expect, it } from 'vitest';

import { lineCoverage, type LineCoverageInput } from '@/app/(private)/pedidos/components';

const LITRO = { id: 'l', baseUnitId: null, factor: null };
const MILILITRO = { id: 'ml', baseUnitId: 'l', factor: '0.001' };
const KILO = { id: 'kg', baseUnitId: null, factor: null };
const UNITS = [LITRO, MILILITRO, KILO];

function input(overrides: Partial<LineCoverageInput> = {}): LineCoverageInput {
  return {
    packages: '2',
    presentation: { content: '5.0000', unitId: 'l' },
    unitId: 'l',
    quantity: '20',
    units: UNITS,
    ...overrides,
  };
}

describe('lineCoverage', () => {
  it('misma unidad: envases por contenido y su porcentaje del pedido', () => {
    expect(lineCoverage(input())).toEqual({ amount: '10', percent: '50' });
  });

  it('convierte a la unidad del pedido: 4 × 500 ml en un pedido de 4 L cubre 2 L, el 50%', () => {
    expect(
      lineCoverage(
        input({ packages: '4', presentation: { content: '500', unitId: 'ml' }, quantity: '4' }),
      ),
    ).toEqual({ amount: '2', percent: '50' });
  });

  it('aritmetica exacta: 3 × 0.1 L es 0.3 L', () => {
    expect(
      lineCoverage(input({ packages: '3', presentation: { content: '0.1', unitId: 'l' } }))
        ?.amount,
    ).toBe('0.3');
  });

  it('sin cantidad valida del pedido da la cantidad sin porcentaje', () => {
    expect(lineCoverage(input({ quantity: '' }))).toEqual({ amount: '10', percent: null });
    expect(lineCoverage(input({ quantity: '0' }))).toEqual({ amount: '10', percent: null });
  });

  it.each(['', '0', '-1', '1.5', 'abc'])('envases no validos (%j) no cubren nada', (packages) => {
    expect(lineCoverage(input({ packages }))).toBeNull();
  });

  it('sin presentacion resuelta o sin contenido no cubre nada', () => {
    expect(lineCoverage(input({ presentation: undefined }))).toBeNull();
    expect(lineCoverage(input({ presentation: { content: null, unitId: 'l' } }))).toBeNull();
  });

  it('unidades no convertibles o fuera del catalogo no cubren nada', () => {
    expect(lineCoverage(input({ unitId: 'kg' }))).toBeNull();
    expect(lineCoverage(input({ unitId: 'desconocida' }))).toBeNull();
    expect(lineCoverage(input({ units: [] }))).toBeNull();
  });
});
