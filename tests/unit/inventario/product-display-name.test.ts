import { productDisplayName } from '@/lib/modules/inventario/domain/product-display-name';

describe('productDisplayName', () => {
  it('R18: nombre y unidad se unen con el separador', () => {
    expect(productDisplayName('Hipoclorito', 'kg')).toBe('Hipoclorito · kg');
  });

  it('R18: sin etiqueta de unidad devuelve solo el nombre', () => {
    expect(productDisplayName('Hipoclorito', null)).toBe('Hipoclorito');
  });

  it('R18: con etiqueta vacia devuelve solo el nombre', () => {
    expect(productDisplayName('Hipoclorito', '')).toBe('Hipoclorito');
  });
});
