// «Cantidad requerida» (2026-09-09): el producto de dos decimales en texto que escala la
// linea de receta por la cantidad del pedido. Es aritmetica EXACTA con enteros escalados,
// nunca coma flotante (R39): la columna se calcula con esta funcion y el test la vigila.
//
// Los casos «incalculables» —operando vacio, no decimal— devuelven `'0'`: es la senal de
// «aun no hay cantidad que escalar», y quien la pinta la muestra como cero.

import { describe, expect, it } from 'vitest';

import { multiplyDecimal, subtractDecimal } from '@/app/(private)/pedidos/components';

describe('multiplyDecimal — producto exacto de dos decimales en texto', () => {
  it('multiplica y devuelve el resultado sin ceros de relleno', () => {
    expect(multiplyDecimal('2.0000', '0.1005')).toBe('0.201');
    expect(multiplyDecimal('0.1005', '2.0000')).toBe('0.201');
  });

  it('trata enteros sin punto decimal', () => {
    expect(multiplyDecimal('10', '2.5')).toBe('25');
    expect(multiplyDecimal('3', '4')).toBe('12');
  });

  it('el cero devuelve cero', () => {
    expect(multiplyDecimal('0', '5')).toBe('0');
    expect(multiplyDecimal('0.0000', '2.5')).toBe('0');
  });

  it('conserva el signo de los operandos', () => {
    expect(multiplyDecimal('-2', '3')).toBe('-6');
    expect(multiplyDecimal('1.5', '-2')).toBe('-3');
    expect(multiplyDecimal('-1', '-1')).toBe('1');
  });

  it('no redondea: todas las cifras del producto, sin coma flotante', () => {
    // 9999.9999 * 9999.9999 = 99999998.00000001 — un `number` no lo da entero.
    expect(multiplyDecimal('9999.9999', '9999.9999')).toBe('99999998.00000001');
  });

  it('recorta los ceros finales de la escala', () => {
    expect(multiplyDecimal('2.0000', '0.1000')).toBe('0.2');
  });

  it('un operando vacio o no decimal devuelve 0, no lanza', () => {
    expect(multiplyDecimal('', '2')).toBe('0');
    expect(multiplyDecimal('abc', '2')).toBe('0');
    expect(multiplyDecimal('2', '12,5')).toBe('0');
  });
});

describe('subtractDecimal — resta exacta de dos decimales en texto', () => {
  it('resta y conserva el signo', () => {
    expect(subtractDecimal('40', '0.201')).toBe('39.799');
    expect(subtractDecimal('0.2', '0.201')).toBe('-0.001');
    expect(subtractDecimal('5', '3')).toBe('2');
    expect(subtractDecimal('3', '5')).toBe('-2');
  });

  it('alinea escalas distintas', () => {
    expect(subtractDecimal('1.5', '0.25')).toBe('1.25');
    expect(subtractDecimal('0.25', '1.5')).toBe('-1.25');
    expect(subtractDecimal('10', '0.0001')).toBe('9.9999');
  });

  it('el resultado exactamente cero devuelve 0, sin signo', () => {
    expect(subtractDecimal('2', '2')).toBe('0');
    expect(subtractDecimal('2.0000', '2')).toBe('0');
    expect(subtractDecimal('-2', '-2')).toBe('0');
  });

  it('recorta los ceros finales de la escala', () => {
    expect(subtractDecimal('40.0000', '0.1000')).toBe('39.9');
    expect(subtractDecimal('1.000', '0.500')).toBe('0.5');
  });

  it('un operando vacio o no decimal devuelve 0, no lanza', () => {
    expect(subtractDecimal('', '2')).toBe('0');
    expect(subtractDecimal('abc', '2')).toBe('0');
    expect(subtractDecimal('2', '12,5')).toBe('0');
  });

  it('resta de cantidades grandes sin perder cifras', () => {
    expect(subtractDecimal('99999999.12345678', '0.00000001')).toBe('99999999.12345677');
  });
});