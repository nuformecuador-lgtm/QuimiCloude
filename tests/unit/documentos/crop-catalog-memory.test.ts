// El doble en memoria de `CropCatalog` que usa el E2E: sin red, sin bucket real.

import { describe, expect, it } from 'vitest';

import { cropCatalogMemory } from '@/lib/modules/documentos/adapters/driven/storage/crop-catalog-memory';

describe('documentos — CropCatalog en memoria (doble del E2E)', () => {
  it('R22 — publicUrl compone el mismo origen y formato que hoy usaba la lectura firmada', () => {
    const ruta = 'empresa-1/archivo-1/1-1.png';

    expect(cropCatalogMemory.publicUrl(ruta)).toBe(`https://documentos-e2e.invalid/crops/${ruta}`);
  });

  it('R22 — publicUrl es sincrona: no devuelve una promesa', () => {
    const resultado = cropCatalogMemory.publicUrl('empresa-1/archivo-1/1-1.png');

    expect(resultado).not.toBeInstanceOf(Promise);
    expect(typeof resultado).toBe('string');
  });
});
