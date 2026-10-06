import {
  MOVEMENT_REASONS,
  REASONS_BY_DIRECTION,
  STOCK_QUANTITY_PATTERN,
  describeAdjustment,
  isReasonAllowed,
  reasonsFor,
} from '@/lib/modules/inventario';

describe('describeAdjustment', () => {
  it('R28 — un total contado mayor que la existencia vista es un aumento con diferencia positiva', () => {
    expect(describeAdjustment('10', '15')).toEqual({
      direction: 'increase',
      difference: '5.0000',
      amount: '5.0000',
    });
  });

  it('R28 — un total contado menor que la existencia vista es una disminucion con diferencia negativa', () => {
    expect(describeAdjustment('10', '7.25')).toEqual({
      direction: 'decrease',
      difference: '-2.7500',
      amount: '2.7500',
    });
  });

  it('R28 — un total contado de cero sobre una existencia positiva es una disminucion de toda ella', () => {
    expect(describeAdjustment('3.5', '0')).toEqual({
      direction: 'decrease',
      difference: '-3.5000',
      amount: '3.5000',
    });
  });

  it.each([
    ['12', '12'],
    ['12', '12.0000'],
    ['12.0000', '12'],
    ['0', '0.0'],
  ])('R28 — %s frente a %s es diferencia cero: la comparacion es decimal, no de cadenas', (seen, counted) => {
    expect(describeAdjustment(seen, counted)).toBe('zero');
  });

  it.each([
    ['vacio', ''],
    ['parcial con punto final', '12.'],
    ['con signo', '-1'],
    ['con signo mas', '+1'],
    ['con exponente', '1e3'],
    ['con once enteros', '12345678901'],
    ['con cinco decimales', '1.12345'],
    ['con espacios', ' 12'],
    ['con coma decimal', '12,5'],
  ])('R28 — un total contado %s es invalid', (_caso, counted) => {
    expect(describeAdjustment('10', counted)).toBe('invalid');
  });

  it.each([
    ['vacia', ''],
    ['con signo', '-1'],
    ['con exponente', '1e3'],
  ])('R28 — una existencia vista %s tambien es invalid', (_caso, seen) => {
    expect(describeAdjustment(seen, '10')).toBe('invalid');
  });

  it('R28 — acepta los extremos de la escala: diez enteros y cuatro decimales', () => {
    expect(describeAdjustment('0', '9999999999.9999')).toEqual({
      direction: 'increase',
      difference: '9999999999.9999',
      amount: '9999999999.9999',
    });
  });
});

describe('STOCK_QUANTITY_PATTERN', () => {
  it.each(['0', '12', '12.5', '1234567890.1234'])('R28 — acepta %s', (value) => {
    expect(STOCK_QUANTITY_PATTERN.test(value)).toBe(true);
  });

  it.each(['', '12.', '.5', '-1', '1e3', '12345678901', '1.12345'])('R28 — rechaza %s', (value) => {
    expect(STOCK_QUANTITY_PATTERN.test(value)).toBe(false);
  });
});

describe('motivos por sentido', () => {
  it('R4 — un aumento solo admite conteo fisico y error de carga', () => {
    expect([...reasonsFor('increase')].sort()).toEqual(['conteo_fisico', 'error_de_carga']);
    expect(isReasonAllowed('increase', 'conteo_fisico')).toBe(true);
    expect(isReasonAllowed('increase', 'error_de_carga')).toBe(true);
    expect(isReasonAllowed('increase', 'merma')).toBe(false);
    expect(isReasonAllowed('increase', 'rotura')).toBe(false);
  });

  it('R4 — una disminucion admite los cuatro motivos', () => {
    expect(reasonsFor('decrease')).toEqual(MOVEMENT_REASONS);
    for (const reason of MOVEMENT_REASONS) {
      expect(isReasonAllowed('decrease', reason)).toBe(true);
    }
  });

  it('R4 R28 — reasonsFor devuelve la misma lista que publica REASONS_BY_DIRECTION', () => {
    expect(reasonsFor('increase')).toBe(REASONS_BY_DIRECTION.increase);
    expect(reasonsFor('decrease')).toBe(REASONS_BY_DIRECTION.decrease);
  });
});
