import { describe, expect, it } from 'vitest';

import {
  FIRST_PAGE,
  PAGE_PARAM,
  PAGE_SIZE_PARAM,
  assignedOrdersListHref,
  buildAssignedOrdersListQuery,
  parseAssignedOrdersListParams,
  toAssignedOrdersQuery,
} from '@/app/(private)/asignacion/components';
import { PAGE_SIZE_OPTIONS, type DataTableParams } from '@/components/shared/data-table';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/shared/pagination';
import { ASSIGNED_ORDERS_ROUTE } from '@/lib/shared/routes';

describe('parseAssignedOrdersListParams acota, nunca falla (R31)', () => {
  it('sin ningun parametro entrega la forma canonica: primera pagina, tamano por defecto, sin orden ni filtros ni busqueda', () => {
    expect(parseAssignedOrdersListParams(undefined)).toEqual({
      page: FIRST_PAGE,
      pageSize: DEFAULT_PAGE_SIZE,
      sort: null,
      filters: {},
      search: '',
    });
    expect(parseAssignedOrdersListParams({})).toEqual(parseAssignedOrdersListParams(undefined));
  });

  it('una pagina invalida, negativa, decimal o fuera de rango cae a la primera y NO lanza', () => {
    for (const crudo of ['0', '-3', '1.5', '1e3', '0x2', ' 2 ', 'abc', '', 'NaN']) {
      expect(
        () => parseAssignedOrdersListParams({ [PAGE_PARAM]: crudo }),
        `«${crudo}» no puede hacer fallar el parser`,
      ).not.toThrow();
      expect(parseAssignedOrdersListParams({ [PAGE_PARAM]: crudo }).page).toBe(FIRST_PAGE);
    }

    expect(parseAssignedOrdersListParams({ [PAGE_PARAM]: '7' }).page).toBe(7);
  });

  it('un tamano de pagina fuera de las dos opciones -incluido POR ENCIMA del tope- cae al defecto', () => {
    for (const crudo of ['0', '1', '11', '24', '26', '1000', 'muchos', '']) {
      expect(parseAssignedOrdersListParams({ [PAGE_SIZE_PARAM]: crudo }).pageSize).toBe(
        DEFAULT_PAGE_SIZE,
      );
    }

    for (const opcion of PAGE_SIZE_OPTIONS) {
      expect(parseAssignedOrdersListParams({ [PAGE_SIZE_PARAM]: String(opcion) }).pageSize).toBe(
        opcion,
      );
    }
    expect([...PAGE_SIZE_OPTIONS]).toEqual([DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE]);
  });

  it('de un parametro repetido se toma el primer valor y no se rompe', () => {
    expect(parseAssignedOrdersListParams({ [PAGE_PARAM]: ['3', '9'] }).page).toBe(3);
  });

  it('el resultado SIEMPRE trae sort: null, filters: {} y search: "" (esta lista no los usa)', () => {
    const params = parseAssignedOrdersListParams({ [PAGE_PARAM]: '2', [PAGE_SIZE_PARAM]: '25' });

    expect(params.sort).toBeNull();
    expect(params.filters).toEqual({});
    expect(params.search).toBe('');
  });
});

describe('assignedOrdersListHref deriva SIEMPRE de ASSIGNED_ORDERS_ROUTE (R1, R31)', () => {
  const params: DataTableParams = {
    page: 3,
    pageSize: MAX_PAGE_SIZE,
    sort: null,
    filters: {},
    search: '',
  };

  it('el destino se deriva de la constante, nunca de un literal', () => {
    expect(assignedOrdersListHref(params)).toBe(
      `${ASSIGNED_ORDERS_ROUTE}?${buildAssignedOrdersListQuery(params)}`,
    );
    expect(assignedOrdersListHref(params).startsWith(ASSIGNED_ORDERS_ROUTE)).toBe(true);
  });

  it('parse(build(params)) devuelve params', () => {
    const url = new URLSearchParams(buildAssignedOrdersListQuery(params));
    const entrada = Object.fromEntries(url.entries());

    expect(parseAssignedOrdersListParams(entrada)).toEqual(params);
  });

  it('la cadena de consulta NUNCA escribe sort, filters ni search', () => {
    const query = buildAssignedOrdersListQuery(params);

    expect(query).not.toContain('sort');
    expect(query).not.toContain('filters');
    expect(query).not.toContain('search');

    const url = new URLSearchParams(query);
    expect(url.has('sort')).toBe(false);
    expect(url.has('search')).toBe(false);
  });

  it('la cadena de consulta SOLO lleva page y pageSize', () => {
    const url = new URLSearchParams(buildAssignedOrdersListQuery(params));
    expect([...url.keys()].sort()).toEqual([PAGE_PARAM, PAGE_SIZE_PARAM].sort());
  });
});

describe('toAssignedOrdersQuery traduce SOLO page y pageSize (design.md > 9.1)', () => {
  it('descarta sort, filters y search: el esquema del dominio es strictObject', () => {
    const params: DataTableParams = {
      page: 2,
      pageSize: 25,
      sort: null,
      filters: {},
      search: '',
    };

    expect(toAssignedOrdersQuery(params)).toEqual({ page: 2, pageSize: 25 });
    expect(Object.keys(toAssignedOrdersQuery(params)).sort()).toEqual(['page', 'pageSize']);
  });
});

describe('assignedOrdersListHref conserva `vista` cuando se le pasa (design.md > 6.2, QC-145)', () => {
  const params: DataTableParams = {
    page: 2,
    pageSize: MAX_PAGE_SIZE,
    sort: null,
    filters: {},
    search: '',
  };

  it('sin `vista`, el comportamiento de siempre: solo page y pageSize', () => {
    const url = new URLSearchParams(assignedOrdersListHref(params).split('?')[1]);
    expect([...url.keys()].sort()).toEqual([PAGE_PARAM, PAGE_SIZE_PARAM].sort());
  });

  it('con `vista`, el href la lleva ademas de page y pageSize', () => {
    const url = new URLSearchParams(assignedOrdersListHref(params, 'terminados').split('?')[1]);
    expect(url.get('vista')).toBe('terminados');
    expect(url.get(PAGE_PARAM)).toBe('2');
    expect(url.get(PAGE_SIZE_PARAM)).toBe(String(MAX_PAGE_SIZE));
  });
});
