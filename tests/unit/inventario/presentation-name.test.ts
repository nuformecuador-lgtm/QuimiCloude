import { normalizePresentationName } from '@/lib/modules/inventario/domain/presentation-name';

// Normalizacion pura del nombre de presentacion (R19; `design.md > 2.2`, T3 de tasks.md).
describe('normalizePresentationName', () => {
  it('normaliza «Bidon 20 L», «bidon 20 l» y «BIDON-20L» al mismo valor', () => {
    // R19
    expect(normalizePresentationName('Bidón 20 L')).toBe('bidon20l');
    expect(normalizePresentationName('bidon 20 l')).toBe('bidon20l');
    expect(normalizePresentationName('BIDON-20L')).toBe('bidon20l');
  });

  it.each([
    ['  Caja   Grande  ', 'cajagrande'],
    ['Envase, 1/2 Litro', 'envase12litro'],
    ['Ñandú', 'nandu'],
    ['---', ''],
    ['   ', ''],
  ])('normaliza «%s» a «%s»', (entrada, esperado) => {
    // R19, R37 (caso de nombre que normaliza a vacio)
    expect(normalizePresentationName(entrada)).toBe(esperado);
  });
});
