// Los dos esquemas de entrada de la vista de catalogo visual.
import { describe, expect, it } from 'vitest';

import { showcaseLinesQuerySchema, showcaseQuerySchema } from '@/lib/modules/proveedores/domain/supplier-showcase';

describe('showcaseQuerySchema — valores por defecto', () => {
  it('sin ningun campo, page es 1 y los dos terminos son cadena vacia', () => {
    const parsed = showcaseQuerySchema.parse({});

    expect(parsed).toEqual({ page: 1, supplierSearch: '', productSearch: '' });
  });
});

describe('showcaseQuerySchema — tope de 120 (R24)', () => {
  it('un termino de 120 caracteres pasa', () => {
    const termino = 'a'.repeat(120);

    expect(() => showcaseQuerySchema.parse({ supplierSearch: termino })).not.toThrow();
  });

  it('un termino de 121 caracteres se rechaza', () => {
    const termino = 'a'.repeat(121);

    expect(showcaseQuerySchema.safeParse({ supplierSearch: termino }).success).toBe(false);
    expect(showcaseQuerySchema.safeParse({ productSearch: termino }).success).toBe(false);
  });
});

describe('showcaseQuerySchema — page < 1 se rechaza', () => {
  it('page 0 no pasa', () => {
    expect(showcaseQuerySchema.safeParse({ page: 0 }).success).toBe(false);
  });

  it('page negativo no pasa', () => {
    expect(showcaseQuerySchema.safeParse({ page: -1 }).success).toBe(false);
  });
});

describe('showcaseQuerySchema — un termino de solo espacios cuenta como vacio (R24)', () => {
  it('supplierSearch y productSearch de solo espacios se recortan a cadena vacia', () => {
    const parsed = showcaseQuerySchema.parse({ supplierSearch: '   ', productSearch: '\t\t' });

    expect(parsed.supplierSearch).toBe('');
    expect(parsed.productSearch).toBe('');
  });
});

describe('showcaseLinesQuerySchema — valores por defecto', () => {
  it('sin productSearch, el termino es cadena vacia', () => {
    const parsed = showcaseLinesQuerySchema.parse({ page: 2 });

    expect(parsed).toEqual({ page: 2, productSearch: '' });
  });
});

describe('showcaseLinesQuerySchema — el minimo de pagina es 2, no 1', () => {
  it('page 1 se rechaza: la primera pagina la trae siempre la tanda de proveedores', () => {
    expect(showcaseLinesQuerySchema.safeParse({ page: 1 }).success).toBe(false);
  });

  it('page 0 se rechaza', () => {
    expect(showcaseLinesQuerySchema.safeParse({ page: 0 }).success).toBe(false);
  });

  it('page 2 pasa', () => {
    expect(showcaseLinesQuerySchema.safeParse({ page: 2 }).success).toBe(true);
  });
});

describe('showcaseLinesQuerySchema — tope de 120', () => {
  it('un termino de 121 caracteres se rechaza', () => {
    const termino = 'a'.repeat(121);

    expect(
      showcaseLinesQuerySchema.safeParse({ page: 2, productSearch: termino }).success,
    ).toBe(false);
  });
});

describe('showcaseLinesQuerySchema — un termino de solo espacios cuenta como vacio (R24)', () => {
  it('productSearch de solo espacios se recorta a cadena vacia', () => {
    const parsed = showcaseLinesQuerySchema.parse({ page: 2, productSearch: '   ' });

    expect(parsed.productSearch).toBe('');
  });
});
