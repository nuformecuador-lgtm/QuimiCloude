import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  CITY_COLUMN_ID,
  CITY_PARAM,
  CREATED_AT_COLUMN_ID,
  CREATED_FROM_PARAM,
  CREATED_TO_PARAM,
  FIRST_PAGE,
  PAGE_PARAM,
  PAGE_SIZE_PARAM,
  SEARCH_PARAM,
  SORT_PARAM,
  SORT_SEPARATOR,
  buildCustomerListQuery,
  clearSearchAndFilters,
  customerListHref,
  hasActiveSearchOrFilter,
  parseCustomerListParams,
  withSearchResetsPage,
} from '@/app/(private)/clientes/components';
import { PAGE_SIZE_OPTIONS, type DataTableParams } from '@/components/shared/data-table';
import { CUSTOMER_QUERYABLE } from '@/lib/modules/clientes';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';
import { CUSTOMERS_ROUTE } from '@/lib/shared/routes';

const PARSER = join(
  __dirname,
  '..',
  '..',
  '..',
  'app',
  '(private)',
  'clientes',
  'components',
  'customer-list-params.ts',
);

const POR_DEFECTO: DataTableParams = {
  page: FIRST_PAGE,
  pageSize: DEFAULT_PAGE_SIZE,
  sort: null,
  filters: {},
  search: '',
};

const ORDENABLE = CUSTOMER_QUERYABLE.sortable[0] as string;
const NO_ORDENABLE = 'createdBy';
const TOPE_PAGE_SIZE = PAGE_SIZE_OPTIONS[PAGE_SIZE_OPTIONS.length - 1] as number;

type Caso = {
  readonly caso: string;
  readonly entrada: Readonly<Record<string, string | readonly string[] | undefined>>;
  readonly esperado: DataTableParams;
};

const CONTRATO: readonly Caso[] = [
  { caso: 'pagina entera valida', entrada: { [PAGE_PARAM]: '7' }, esperado: { ...POR_DEFECTO, page: 7 } },
  { caso: 'pagina cero', entrada: { [PAGE_PARAM]: '0' }, esperado: POR_DEFECTO },
  { caso: 'pagina negativa', entrada: { [PAGE_PARAM]: '-3' }, esperado: POR_DEFECTO },
  { caso: 'pagina decimal', entrada: { [PAGE_PARAM]: '1.5' }, esperado: POR_DEFECTO },
  { caso: 'pagina con espacios', entrada: { [PAGE_PARAM]: ' 2 ' }, esperado: POR_DEFECTO },
  { caso: 'pagina no numerica', entrada: { [PAGE_PARAM]: 'abc' }, esperado: POR_DEFECTO },
  {
    caso: 'pagina fuera de entero seguro',
    entrada: { [PAGE_PARAM]: '9'.repeat(30) },
    esperado: POR_DEFECTO,
  },
  {
    caso: 'tamano dentro de las opciones',
    entrada: { [PAGE_SIZE_PARAM]: String(TOPE_PAGE_SIZE) },
    esperado: { ...POR_DEFECTO, pageSize: TOPE_PAGE_SIZE },
  },
  {
    caso: 'tamano fuera de las opciones',
    entrada: { [PAGE_SIZE_PARAM]: String(TOPE_PAGE_SIZE + 1) },
    esperado: POR_DEFECTO,
  },
  { caso: 'tamano no numerico', entrada: { [PAGE_SIZE_PARAM]: 'muchos' }, esperado: POR_DEFECTO },
  {
    caso: 'orden ascendente sobre campo ordenable',
    entrada: { [SORT_PARAM]: `${ORDENABLE}${SORT_SEPARATOR}asc` },
    esperado: { ...POR_DEFECTO, sort: { columnId: ORDENABLE, direction: 'asc' } },
  },
  {
    caso: 'orden descendente sobre campo ordenable',
    entrada: { [SORT_PARAM]: `${ORDENABLE}${SORT_SEPARATOR}desc` },
    esperado: { ...POR_DEFECTO, sort: { columnId: ORDENABLE, direction: 'desc' } },
  },
  {
    caso: 'orden sobre campo no ordenable',
    entrada: { [SORT_PARAM]: `${NO_ORDENABLE}${SORT_SEPARATOR}asc` },
    esperado: POR_DEFECTO,
  },
  {
    caso: 'orden con direccion desconocida',
    entrada: { [SORT_PARAM]: `${ORDENABLE}${SORT_SEPARATOR}arriba` },
    esperado: POR_DEFECTO,
  },
  { caso: 'orden sin separador', entrada: { [SORT_PARAM]: ORDENABLE }, esperado: POR_DEFECTO },
  { caso: 'orden sin campo', entrada: { [SORT_PARAM]: `${SORT_SEPARATOR}asc` }, esperado: POR_DEFECTO },
  {
    caso: 'busqueda recortada y sin normalizar',
    entrada: { [SEARCH_PARAM]: '  Muñoz  ' },
    esperado: { ...POR_DEFECTO, search: 'Muñoz' },
  },
  { caso: 'busqueda de solo espacios', entrada: { [SEARCH_PARAM]: '   ' }, esperado: POR_DEFECTO },
  {
    caso: 'filtro de ciudad recortado',
    entrada: { [CITY_PARAM]: '  Bogotá  ' },
    esperado: { ...POR_DEFECTO, filters: { [CITY_COLUMN_ID]: { kind: 'text', value: 'Bogotá' } } },
  },
  { caso: 'filtro de ciudad vacio no filtra', entrada: { [CITY_PARAM]: '   ' }, esperado: POR_DEFECTO },
  {
    caso: 'rango completo de fechas de alta existentes',
    entrada: { [CREATED_FROM_PARAM]: '2026-01-31', [CREATED_TO_PARAM]: '2026-02-28' },
    esperado: {
      ...POR_DEFECTO,
      filters: { [CREATED_AT_COLUMN_ID]: { kind: 'dateRange', from: '2026-01-31', to: '2026-02-28' } },
    },
  },
  {
    caso: 'solo el extremo inicial de la fecha de alta',
    entrada: { [CREATED_FROM_PARAM]: '2024-02-29' },
    esperado: {
      ...POR_DEFECTO,
      filters: { [CREATED_AT_COLUMN_ID]: { kind: 'dateRange', from: '2024-02-29', to: null } },
    },
  },
  {
    caso: 'extremo final inexistente se descarta solo el',
    entrada: { [CREATED_FROM_PARAM]: '2026-03-01', [CREATED_TO_PARAM]: '2026-02-30' },
    esperado: {
      ...POR_DEFECTO,
      filters: { [CREATED_AT_COLUMN_ID]: { kind: 'dateRange', from: '2026-03-01', to: null } },
    },
  },
  {
    caso: 'los dos extremos de fecha de alta invalidos',
    entrada: { [CREATED_FROM_PARAM]: '2026-13-01', [CREATED_TO_PARAM]: 'ayer' },
    esperado: POR_DEFECTO,
  },
  {
    caso: 'fecha de alta con hora',
    entrada: { [CREATED_FROM_PARAM]: '2026-01-01T10:00:00Z' },
    esperado: POR_DEFECTO,
  },
  { caso: 'dia 29 de un año no bisiesto', entrada: { [CREATED_TO_PARAM]: '2026-02-29' }, esperado: POR_DEFECTO },
  {
    caso: 'parametro repetido gana el primero',
    entrada: { [PAGE_PARAM]: ['2', '9'], [SEARCH_PARAM]: ['uno', 'dos'] },
    esperado: { ...POR_DEFECTO, page: 2, search: 'uno' },
  },
  { caso: 'parametro repetido vacio', entrada: { [PAGE_PARAM]: [] }, esperado: POR_DEFECTO },
];

describe('parseCustomerListParams acota, nunca falla (R16)', () => {
  it('R16: sin parametros devuelve la primera pagina, el tamano por defecto y nada acotado', () => {
    expect(parseCustomerListParams({})).toEqual(POR_DEFECTO);
    expect(parseCustomerListParams(undefined)).toEqual(POR_DEFECTO);
  });

  it.each(CONTRATO)('R16, R12, R13: $caso', ({ entrada, esperado }) => {
    expect(parseCustomerListParams(entrada)).toEqual(esperado);
  });

  it('R14: el orden solo acepta columnas de la lista blanca del contrato', () => {
    expect(CUSTOMER_QUERYABLE.sortable).not.toContain(NO_ORDENABLE);
    expect(CUSTOMER_QUERYABLE.sortable).toContain(ORDENABLE);
  });

  it('R13: el filtro de ciudad y el de fecha de alta solo existen porque la lista blanca los declara', () => {
    expect(CUSTOMER_QUERYABLE.filterable[CITY_COLUMN_ID]).toBe('text');
    expect(CUSTOMER_QUERYABLE.filterable[CREATED_AT_COLUMN_ID]).toBe('dateRange');
  });

  it('R14: el parser toma la lista blanca del contrato y no mantiene una copia', () => {
    const fuente = readFileSync(PARSER, 'utf8');

    expect(fuente).toMatch(/import \{ CUSTOMER_QUERYABLE \} from '@\/lib\/modules\/clientes';/);
    expect(fuente).not.toMatch(/@\/lib\/modules\/clientes\//);
    expect(fuente).not.toMatch(/sortable:\s*\[/);
  });

  it('R12, R13, R17: la consulta construida se vuelve a leer igual, con y sin todos los campos', () => {
    const completos: DataTableParams = {
      page: 3,
      pageSize: TOPE_PAGE_SIZE,
      sort: { columnId: ORDENABLE, direction: 'desc' },
      filters: {
        [CITY_COLUMN_ID]: { kind: 'text', value: 'Medellín' },
        [CREATED_AT_COLUMN_ID]: { kind: 'dateRange', from: '2026-01-01', to: null },
      },
      search: 'García',
    };

    for (const params of [POR_DEFECTO, completos]) {
      const consulta = new URLSearchParams(buildCustomerListQuery(params));
      expect(parseCustomerListParams(Object.fromEntries(consulta))).toEqual(params);
    }
  });

  it('R17: la consulta no escribe busqueda, orden, ciudad ni fechas cuando estan vacios', () => {
    const consulta = new URLSearchParams(buildCustomerListQuery(POR_DEFECTO));

    for (const clave of [SEARCH_PARAM, SORT_PARAM, CITY_PARAM, CREATED_FROM_PARAM, CREATED_TO_PARAM]) {
      expect(consulta.has(clave), clave).toBe(false);
    }
  });

  it('R1: el destino se deriva de la constante de ruta de clientes', () => {
    expect(customerListHref(POR_DEFECTO)).toBe(`${CUSTOMERS_ROUTE}?${buildCustomerListQuery(POR_DEFECTO)}`);
  });
});

describe('busqueda o filtro activos y limpiar (R20)', () => {
  it('solo orden o tamano no cuentan como busqueda ni filtro', () => {
    expect(hasActiveSearchOrFilter(POR_DEFECTO)).toBe(false);
    expect(
      hasActiveSearchOrFilter({
        ...POR_DEFECTO,
        pageSize: TOPE_PAGE_SIZE,
        sort: { columnId: ORDENABLE, direction: 'asc' },
      }),
    ).toBe(false);
  });

  it('un termino de busqueda cuenta como activo', () => {
    expect(hasActiveSearchOrFilter({ ...POR_DEFECTO, search: 'García' })).toBe(true);
  });

  it('un filtro de ciudad o de fecha de alta cuenta como activo', () => {
    expect(
      hasActiveSearchOrFilter({
        ...POR_DEFECTO,
        filters: { [CITY_COLUMN_ID]: { kind: 'text', value: 'Cali' } },
      }),
    ).toBe(true);
    expect(
      hasActiveSearchOrFilter({
        ...POR_DEFECTO,
        filters: { [CREATED_AT_COLUMN_ID]: { kind: 'dateRange', from: null, to: '2026-01-01' } },
      }),
    ).toBe(true);
  });

  it('limpiar vacia busqueda y filtros, vuelve a la primera pagina y conserva orden y tamano', () => {
    const vigentes: DataTableParams = {
      page: 3,
      pageSize: TOPE_PAGE_SIZE,
      sort: { columnId: ORDENABLE, direction: 'desc' },
      filters: { [CITY_COLUMN_ID]: { kind: 'text', value: 'Cali' } },
      search: 'García',
    };

    const limpios = clearSearchAndFilters(vigentes);

    expect(limpios).toEqual({
      page: FIRST_PAGE,
      pageSize: TOPE_PAGE_SIZE,
      sort: vigentes.sort,
      filters: {},
      search: '',
    });
    expect(hasActiveSearchOrFilter(limpios)).toBe(false);
  });
});

describe('withSearchResetsPage reinicia la pagina si cambia el termino o un filtro (R13)', () => {
  const base: DataTableParams = {
    page: 3,
    pageSize: DEFAULT_PAGE_SIZE,
    sort: null,
    filters: { [CITY_COLUMN_ID]: { kind: 'text', value: 'Cali' } },
    search: 'García',
  };

  it('un termino distinto vuelve a la primera pagina', () => {
    const siguiente: DataTableParams = { ...base, search: 'López' };

    expect(withSearchResetsPage(base, siguiente)).toEqual({ ...siguiente, page: FIRST_PAGE });
  });

  it('un filtro distinto tambien vuelve a la primera pagina', () => {
    const siguiente: DataTableParams = {
      ...base,
      filters: { [CITY_COLUMN_ID]: { kind: 'text', value: 'Bogotá' } },
    };

    expect(withSearchResetsPage(base, siguiente)).toEqual({ ...siguiente, page: FIRST_PAGE });
  });

  it('el mismo termino y los mismos filtros no tocan la pagina que ya trae el cambio', () => {
    const siguiente: DataTableParams = {
      ...base,
      page: 5,
      sort: { columnId: ORDENABLE, direction: 'asc' },
    };

    expect(withSearchResetsPage(base, siguiente)).toEqual(siguiente);
  });
});
