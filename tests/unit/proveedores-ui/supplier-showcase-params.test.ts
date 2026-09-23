import { describe, expect, it } from 'vitest';

import {
  EMPTY_SHOWCASE_FILTERS,
  PRODUCT_SEARCH_PARAM,
  SUPPLIER_SEARCH_PARAM,
  buildShowcaseQuery,
  parseShowcaseParams,
  showcaseHref,
  type ShowcaseFilters,
} from '@/app/(private)/proveedores/components/supplier-showcase-params';
import { SUPPLIERS_ROUTE } from '@/lib/shared/routes';

describe('parametros del catalogo visual de proveedores', () => {
  it('R24: sin parametros los dos filtros quedan ausentes', () => {
    expect(parseShowcaseParams({})).toEqual(EMPTY_SHOWCASE_FILTERS);
    expect(parseShowcaseParams(undefined)).toEqual(EMPTY_SHOWCASE_FILTERS);
  });

  it('R24: un termino con espacios alrededor se recorta', () => {
    expect(
      parseShowcaseParams({
        [SUPPLIER_SEARCH_PARAM]: '  quimicos  ',
        [PRODUCT_SEARCH_PARAM]: '  acido  ',
      }),
    ).toEqual({ supplierSearch: 'quimicos', productSearch: 'acido' });
  });

  it('R24: un termino de solo espacios cuenta como ausente', () => {
    expect(
      parseShowcaseParams({ [SUPPLIER_SEARCH_PARAM]: '   ', [PRODUCT_SEARCH_PARAM]: '\t\t' }),
    ).toEqual(EMPTY_SHOWCASE_FILTERS);
  });

  it('R24: un parametro repetido gana el primero', () => {
    expect(
      parseShowcaseParams({ [SUPPLIER_SEARCH_PARAM]: ['uno', 'dos'] }),
    ).toEqual({ ...EMPTY_SHOWCASE_FILTERS, supplierSearch: 'uno' });
  });

  it('R24: la consulta construida no escribe ninguna clave cuando los dos filtros estan vacios', () => {
    const consulta = new URLSearchParams(buildShowcaseQuery(EMPTY_SHOWCASE_FILTERS));

    expect(consulta.has(SUPPLIER_SEARCH_PARAM)).toBe(false);
    expect(consulta.has(PRODUCT_SEARCH_PARAM)).toBe(false);
  });

  it('la consulta construida se vuelve a leer igual', () => {
    const filtros: ShowcaseFilters = { supplierSearch: 'del pacifico', productSearch: 'sosa' };
    const consulta = new URLSearchParams(buildShowcaseQuery(filtros));

    expect(parseShowcaseParams(Object.fromEntries(consulta))).toEqual(filtros);
  });

  it('R25: el destino se deriva de la constante de ruta de proveedores, sin filtros activos', () => {
    expect(showcaseHref(EMPTY_SHOWCASE_FILTERS)).toBe(SUPPLIERS_ROUTE);
  });

  it('R25: el destino con filtros activos cuelga de la misma ruta y lleva los dos terminos', () => {
    const filtros: ShowcaseFilters = { supplierSearch: 'del pacifico', productSearch: 'sosa' };

    expect(showcaseHref(filtros)).toBe(`${SUPPLIERS_ROUTE}?${buildShowcaseQuery(filtros)}`);
    expect(showcaseHref(filtros).startsWith(SUPPLIERS_ROUTE)).toBe(true);
  });
});
