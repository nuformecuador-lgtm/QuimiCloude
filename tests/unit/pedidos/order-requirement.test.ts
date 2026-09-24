import { buildRequirement, type RequirementSourceLine } from '@/lib/modules/pedidos/domain/order-requirement';

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
