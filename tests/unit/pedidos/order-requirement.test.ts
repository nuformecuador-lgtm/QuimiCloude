import {
  buildOrderRequirement,
  buildRequirement,
  packagingLinesOf,
  type RequirementSourceLine,
} from '@/lib/modules/pedidos/domain/order-requirement';

function line(productId: string, percentage: string): RequirementSourceLine {
  return { productId, percentage };
}

describe('buildRequirement', () => {
  it('calcula la necesidad de cada linea como cantidad del pedido por porcentaje, sin multiplicacion propia', () => {
    const result = buildRequirement([line('p1', '25')], '3.0000');
    expect(result).toEqual([{ productId: 'p1', quantity: '0.75' }]);
  });

  it('R11: un pedido de 0.0001 con un ingrediente al 0.01 % da una necesidad exacta de 0.00000001, sin redondear', () => {
    const result = buildRequirement([line('p1', '0.01')], '0.0001');
    expect(result[0]?.quantity).toBe('0.00000001');
  });

  it('R11: 200 por 10 % da 20 exacto', () => {
    const result = buildRequirement([line('p1', '10')], '200');
    expect(result[0]?.quantity).toBe('20');
  });

  it('R49: receta vacia produce una necesidad vacia', () => {
    expect(buildRequirement([], '2.0000')).toEqual([]);
  });

  it('conserva el orden y el producto de cada linea', () => {
    const result = buildRequirement([line('p1', '50'), line('p2', '25')], '2.0000');
    expect(result).toEqual([
      { productId: 'p1', quantity: '1' },
      { productId: 'p2', quantity: '0.5' },
    ]);
  });
});

describe('QC-195 buildOrderRequirement — receta y envases en una sola necesidad', () => {
  it('R15: un reparto de 40 botellas pide 40 envases, junto a la receta, antes de consumir', () => {
    const result = buildOrderRequirement({
      recipeLines: [line('materia', '25')],
      quantity: '20',
      packagingLines: [{ productId: 'botella', packages: 40 }],
      phase: 'before_consumption',
    });
    expect(result).toEqual([
      { productId: 'materia', quantity: '5' },
      { productId: 'botella', quantity: '40' },
    ]);
  });

  it('R24: con la receta ya consumida (POR_EMPACAR) solo quedan los envases', () => {
    const result = buildOrderRequirement({
      recipeLines: [line('materia', '25')],
      quantity: '20',
      packagingLines: [{ productId: 'botella', packages: 40 }],
      phase: 'materials_consumed',
    });
    expect(result).toEqual([{ productId: 'botella', quantity: '40' }]);
  });

  it('un mismo producto en la receta y en el reparto sale una vez, con la suma exacta', () => {
    const result = buildOrderRequirement({
      recipeLines: [line('p1', '12.5')],
      quantity: '0.0001',
      packagingLines: [{ productId: 'p1', packages: 3 }],
      phase: 'before_consumption',
    });
    // 0.0001 x 12.5 % = 0.0000125: la suma no recorta a cuatro decimales.
    expect(result).toEqual([{ productId: 'p1', quantity: '3.0000125' }]);
  });

  it('R32, R35: sin envases la necesidad es la de la receta, igual que hoy', () => {
    const recipeLines = [line('p1', '25'), line('p2', '75')];
    expect(
      buildOrderRequirement({ recipeLines, quantity: '3.0000', packagingLines: [], phase: 'before_consumption' }),
    ).toEqual(buildRequirement(recipeLines, '3.0000'));
  });

  it('R32, R35: las lineas antiguas, sin envase, no aportan envases', () => {
    expect(
      packagingLinesOf([
        { packagingProductId: null, packages: 3 },
        { packagingProductId: 'botella', packages: 40 },
      ]),
    ).toEqual([{ productId: 'botella', packages: 40 }]);
  });
});
