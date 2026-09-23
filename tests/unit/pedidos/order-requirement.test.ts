import { buildRequirement, type RequirementSourceLine } from '@/lib/modules/pedidos/domain/order-requirement';

function line(productId: string, quantity: string, unitId: string): RequirementSourceLine {
  return { productId, quantity, unitId };
}

describe('buildRequirement', () => {
  it('R7: multiplica cada linea por la cantidad del pedido, en la unidad de la linea', () => {
    const result = buildRequirement([line('p1', '2.5000', 'kg')], '3.0000');
    expect(result).toEqual([{ productId: 'p1', unitId: 'kg', quantity: '7.50000000' }]);
  });

  it('R11: no trunca ni redondea aunque el resultado tenga mas de cuatro decimales', () => {
    const result = buildRequirement([line('p1', '0.1234', 'kg')], '1.5678');
    expect(result[0]?.quantity).toBe('0.19346652');
  });

  it('multiplica exacto sin dejar el resultado atado a una escala interna fija', () => {
    const result = buildRequirement([line('p1', '1', 'kg')], '1');
    expect(result[0]?.quantity).toBe('1');
  });

  it('receta vacia produce una necesidad vacia', () => {
    expect(buildRequirement([], '2.0000')).toEqual([]);
  });

  it('conserva el orden y el producto y la unidad de cada linea', () => {
    const result = buildRequirement(
      [line('p1', '1.0000', 'kg'), line('p2', '2.0000', 'l')],
      '2.0000',
    );
    expect(result).toEqual([
      { productId: 'p1', unitId: 'kg', quantity: '2.00000000' },
      { productId: 'p2', unitId: 'l', quantity: '4.00000000' },
    ]);
  });
});
