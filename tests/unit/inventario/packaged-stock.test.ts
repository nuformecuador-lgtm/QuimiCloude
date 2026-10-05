// `summarizePackagedStock` es dominio puro: la existencia de un producto terminado contada en los
// envases que dijo su pedido.

import { summarizePackagedStock, type PackagedStockBatch } from '@/lib/modules/inventario/domain/packaged-stock';

const LITRO = 'unidad-l';
const MILILITRO = 'unidad-ml';

function lote(overrides: Partial<PackagedStockBatch>): PackagedStockBatch {
  return {
    stock: '5.0000',
    packageContent: '0.5000',
    orderedPackages: 10,
    presentationName: 'Botella 500 ml',
    presentationUnitId: LITRO,
    ...overrides,
  };
}

describe('summarizePackagedStock', () => {
  it('cuenta envases enteros sin resto cuando el lote esta intacto', () => {
    expect(summarizePackagedStock([lote({})])).toEqual([
      { name: 'Botella 500 ml', packages: '10', remainder: null, unitId: LITRO },
    ]);
  });

  it('tras un consumo parcial deja los envases que caben y el resto en la unidad de la presentacion', () => {
    expect(summarizePackagedStock([lote({ stock: '4.2000' })])).toEqual([
      { name: 'Botella 500 ml', packages: '8', remainder: '0.2', unitId: LITRO },
    ]);
  });

  it('el resto sale sin ceros sobrantes y entero cuando lo es', () => {
    const resultado = summarizePackagedStock([
      lote({ stock: '1450.0000', packageContent: '250.0000', orderedPackages: 6, presentationName: 'Botella 250 ml', presentationUnitId: MILILITRO }),
    ]);
    expect(resultado).toEqual([{ name: 'Botella 250 ml', packages: '5', remainder: '200', unitId: MILILITRO }]);
  });

  it('nunca da mas envases que los pedidos: el exceso va al resto', () => {
    expect(summarizePackagedStock([lote({ stock: '6.0000', orderedPackages: 10 })])).toEqual([
      { name: 'Botella 500 ml', packages: '10', remainder: '1', unitId: LITRO },
    ]);
  });

  it('con menos de un envase devuelve cero envases y todo como resto', () => {
    expect(summarizePackagedStock([lote({ stock: '0.3000' })])).toEqual([
      { name: 'Botella 500 ml', packages: '0', remainder: '0.3', unitId: LITRO },
    ]);
  });

  it('suma varias lineas o pedidos del mismo envase', () => {
    const resultado = summarizePackagedStock([
      lote({ stock: '5.0000', orderedPackages: 10 }),
      lote({ stock: '1.7500', orderedPackages: 4 }),
    ]);
    expect(resultado).toEqual([{ name: 'Botella 500 ml', packages: '13', remainder: '0.25', unitId: LITRO }]);
  });

  it('separa envases distintos y los ordena por nombre', () => {
    const resultado = summarizePackagedStock([
      lote({ stock: '1.0000', packageContent: '1.0000', orderedPackages: 1, presentationName: 'Garrafa 1 L' }),
      lote({ stock: '1500.0000', packageContent: '250.0000', orderedPackages: 6, presentationName: 'Botella 250 ml', presentationUnitId: MILILITRO }),
    ]);
    expect(resultado).toEqual([
      { name: 'Botella 250 ml', packages: '6', remainder: null, unitId: MILILITRO },
      { name: 'Garrafa 1 L', packages: '1', remainder: null, unitId: LITRO },
    ]);
  });

  it('mismo nombre en unidades distintas son entradas distintas', () => {
    const resultado = summarizePackagedStock([
      lote({ presentationUnitId: MILILITRO, stock: '1000.0000', packageContent: '500.0000', orderedPackages: 2 }),
      lote({}),
    ]);
    expect(resultado).toHaveLength(2);
  });

  it('legacy: sin ningun lote con datos de pedido devuelve undefined', () => {
    expect(summarizePackagedStock([lote({ orderedPackages: null })])).toBeUndefined();
    expect(summarizePackagedStock([lote({ packageContent: null })])).toBeUndefined();
    expect(summarizePackagedStock([lote({ packageContent: '0.0000' })])).toBeUndefined();
  });

  it('legacy mezclado: el stock del lote sin pedido entra entero como resto de su presentacion', () => {
    const resultado = summarizePackagedStock([lote({}), lote({ stock: '0.7000', orderedPackages: null })]);
    expect(resultado).toEqual([{ name: 'Botella 500 ml', packages: '10', remainder: '0.7', unitId: LITRO }]);
  });

  it('un lote vivo sin presentacion deja el producto sin desglose', () => {
    expect(summarizePackagedStock([lote({}), lote({ orderedPackages: null, presentationName: null, presentationUnitId: null })])).toBeUndefined();
  });

  it('los lotes con stock cero no aportan', () => {
    expect(summarizePackagedStock([lote({ stock: '0.0000' })])).toBeUndefined();
    expect(summarizePackagedStock([lote({}), lote({ stock: '0.0000', presentationName: 'Otro' })])).toEqual([
      { name: 'Botella 500 ml', packages: '10', remainder: null, unitId: LITRO },
    ]);
  });

  it('sin lotes devuelve undefined', () => {
    expect(summarizePackagedStock([])).toBeUndefined();
  });

  it('aritmetica exacta con cantidades grandes', () => {
    const resultado = summarizePackagedStock([
      lote({ stock: '9999999999.9999', packageContent: '0.0001', orderedPackages: 2_000_000_000 }),
    ]);
    expect(resultado).toEqual([{ name: 'Botella 500 ml', packages: '2000000000', remainder: '9999799999.9999', unitId: LITRO }]);
  });
});
