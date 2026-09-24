import { singleUnitStock, sumStockByUnit } from '@/lib/modules/inventario/domain/product-stock';

describe('sumStockByUnit', () => {
  it('R5: suma dos lotes de la misma unidad con presentaciones distintas', () => {
    const result = sumStockByUnit([
      { stock: '5', unitId: 'u-kg' },
      { stock: '25', unitId: 'u-kg' },
    ]);

    expect(result).toEqual([{ unitId: 'u-kg', quantity: '30.0000' }]);
  });

  it('R5: separa unidades distintas', () => {
    const result = sumStockByUnit([
      { stock: '10', unitId: 'u-kg' },
      { stock: '20', unitId: 'u-l' },
    ]);

    expect(result).toEqual([
      { unitId: 'u-l', quantity: '20.0000' },
      { unitId: 'u-kg', quantity: '10.0000' },
    ]);
  });

  it('R7: array vacio cuando no hay filas', () => {
    expect(sumStockByUnit([])).toEqual([]);
  });

  it('R5: orden determinista, cantidad descendente y unitId ascendente como desempate', () => {
    const result = sumStockByUnit([
      { stock: '10', unitId: 'u-z' },
      { stock: '10', unitId: 'u-a' },
      { stock: '30', unitId: 'u-m' },
    ]);

    expect(result).toEqual([
      { unitId: 'u-m', quantity: '30.0000' },
      { unitId: 'u-a', quantity: '10.0000' },
      { unitId: 'u-z', quantity: '10.0000' },
    ]);
  });

  it('R3: suma con decimales exactos, sin coma flotante', () => {
    const result = sumStockByUnit([
      { stock: '1.5', unitId: 'u-kg' },
      { stock: '0.0001', unitId: 'u-kg' },
    ]);

    expect(result).toEqual([{ unitId: 'u-kg', quantity: '1.5001' }]);
  });
});

describe('singleUnitStock', () => {
  it('R8: sin lotes devuelve "0.0000"', () => {
    expect(singleUnitStock([])).toBe('0.0000');
  });

  it('R8: tres lotes de 5 en la misma unidad dan 15', () => {
    const result = singleUnitStock([
      { stock: '5', unitId: 'u-kg' },
      { stock: '5', unitId: 'u-kg' },
      { stock: '5', unitId: 'u-kg' },
    ]);

    expect(result).toBe('15.0000');
  });

  it('R13: lotes en dos unidades lanza', () => {
    expect(() =>
      singleUnitStock([
        { stock: '10', unitId: 'u-kg' },
        { stock: '20', unitId: 'u-l' },
      ]),
    ).toThrow();
  });
});
