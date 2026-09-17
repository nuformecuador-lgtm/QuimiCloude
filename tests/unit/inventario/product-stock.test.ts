import { sumStockByUnit } from '@/lib/modules/inventario/domain/product-stock';

describe('sumStockByUnit', () => {
  it('R5: suma dos lotes de la misma unidad con presentaciones distintas', () => {
    const result = sumStockByUnit([
      { stock: 5, unitId: 'u-kg' },
      { stock: 25, unitId: 'u-kg' },
    ]);

    expect(result).toEqual([{ unitId: 'u-kg', quantity: 30 }]);
  });

  it('R5: separa unidades distintas', () => {
    const result = sumStockByUnit([
      { stock: 10, unitId: 'u-kg' },
      { stock: 20, unitId: 'u-l' },
    ]);

    expect(result).toEqual([
      { unitId: 'u-l', quantity: 20 },
      { unitId: 'u-kg', quantity: 10 },
    ]);
  });

  it('R7: array vacio cuando no hay filas', () => {
    expect(sumStockByUnit([])).toEqual([]);
  });

  it('R5: orden determinista, cantidad descendente y unitId ascendente como desempate', () => {
    const result = sumStockByUnit([
      { stock: 10, unitId: 'u-z' },
      { stock: 10, unitId: 'u-a' },
      { stock: 30, unitId: 'u-m' },
    ]);

    expect(result).toEqual([
      { unitId: 'u-m', quantity: 30 },
      { unitId: 'u-a', quantity: 10 },
      { unitId: 'u-z', quantity: 10 },
    ]);
  });
});
