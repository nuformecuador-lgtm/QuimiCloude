import {
  addQuantities,
  ceilToScale4,
  compareQuantities,
  minQuantity,
  subtractQuantities,
} from '@/lib/modules/inventario/domain/decimal-quantity';

describe('addQuantities', () => {
  it('R1: suma dos cantidades decimales sin convertir a coma flotante binaria', () => {
    expect(addQuantities('1.5000', '2.5000')).toBe('4.0000');
    expect(addQuantities('0.1', '0.2')).toBe('0.3000');
    expect(addQuantities('10', '0.0001')).toBe('10.0001');
  });

  it('suma con un operando negativo', () => {
    expect(addQuantities('5.0000', '-2.0000')).toBe('3.0000');
    expect(addQuantities('-5.0000', '-2.0000')).toBe('-7.0000');
  });
});

describe('subtractQuantities', () => {
  it('resta exacta, incluido un resultado negativo', () => {
    expect(subtractQuantities('5.0000', '2.0000')).toBe('3.0000');
    expect(subtractQuantities('2.0000', '5.0000')).toBe('-3.0000');
    expect(subtractQuantities('1500.0000', '1500.0000')).toBe('0.0000');
  });
});

describe('compareQuantities', () => {
  it('compara dos cantidades con precision exacta de cuatro decimales', () => {
    expect(compareQuantities('1.0001', '1.0000')).toBe(1);
    expect(compareQuantities('1.0000', '1.0001')).toBe(-1);
    expect(compareQuantities('2.5000', '2.5')).toBe(0);
    expect(compareQuantities('-1', '0')).toBe(-1);
  });
});

describe('minQuantity', () => {
  it('devuelve el menor de los dos, normalizado a cuatro decimales', () => {
    expect(minQuantity('5', '3')).toBe('3.0000');
    expect(minQuantity('3', '5')).toBe('3.0000');
    expect(minQuantity('4.0000', '4')).toBe('4.0000');
  });
});

describe('ceilToScale4', () => {
  it('R11: no cambia nada cuando la cantidad ya cabe en cuatro decimales', () => {
    expect(ceilToScale4('1.5')).toBe('1.5000');
    expect(ceilToScale4('0')).toBe('0.0000');
    expect(ceilToScale4('12.3400')).toBe('12.3400');
  });

  it('R11: redondea hacia arriba al cuarto decimal cuando hay mas de cuatro', () => {
    expect(ceilToScale4('0.19346652')).toBe('0.1935');
    expect(ceilToScale4('1.00001')).toBe('1.0001');
    expect(ceilToScale4('1.00009')).toBe('1.0001');
  });

  it('R11: una cantidad exacta a mas de cuatro decimales no sube de mas', () => {
    expect(ceilToScale4('1.20000')).toBe('1.2000');
  });
});
