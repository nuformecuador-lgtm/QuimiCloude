import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  CREATED_AT_COLUMN_ID,
  CREATED_FROM_PARAM,
  CREATED_TO_PARAM,
  FIRST_PAGE,
  PAGE_PARAM,
  PAGE_SIZE_OPTIONS,
  PAGE_SIZE_PARAM,
  SEARCH_PARAM,
  SHARED_PAGE_SIZES,
  SORT_PARAM,
  SORT_SEPARATOR,
  buildRecipeListQuery,
  clearSearchAndFilters,
  hasActiveSearchOrFilter,
  parseRecipeListParams,
  recipeListHref,
} from '@/app/(private)/produccion/formulas/components';
import type { DataTableParams } from '@/components/shared/data-table';
import { RECIPE_QUERYABLE } from '@/lib/modules/recetas';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/shared/pagination';
import { FORMULAS_ROUTE } from '@/lib/shared/routes';

const PARSER = join(
  __dirname,
  '..',
  '..',
  '..',
  'app',
  '(private)',
  'produccion',
  'formulas',
  'components',
  'recipe-list-params.ts',
);

const POR_DEFECTO: DataTableParams = {
  page: FIRST_PAGE,
  pageSize: DEFAULT_PAGE_SIZE,
  sort: null,
  filters: {},
  search: '',
};

const ORDENABLE = RECIPE_QUERYABLE.sortable[0] as string;
const NO_ORDENABLE = 'createdBy';

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
  { caso: 'pagina fuera de entero seguro', entrada: { [PAGE_PARAM]: '9'.repeat(30) }, esperado: POR_DEFECTO },
  { caso: 'tamano tope', entrada: { [PAGE_SIZE_PARAM]: String(MAX_PAGE_SIZE) }, esperado: { ...POR_DEFECTO, pageSize: MAX_PAGE_SIZE } },
  { caso: 'tamano fuera de las opciones', entrada: { [PAGE_SIZE_PARAM]: String(MAX_PAGE_SIZE + 1) }, esperado: POR_DEFECTO },
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
  { caso: 'orden sobre campo no ordenable', entrada: { [SORT_PARAM]: `${NO_ORDENABLE}${SORT_SEPARATOR}asc` }, esperado: POR_DEFECTO },
  { caso: 'orden con direccion desconocida', entrada: { [SORT_PARAM]: `${ORDENABLE}${SORT_SEPARATOR}arriba` }, esperado: POR_DEFECTO },
  { caso: 'orden sin separador', entrada: { [SORT_PARAM]: ORDENABLE }, esperado: POR_DEFECTO },
  { caso: 'orden sin campo', entrada: { [SORT_PARAM]: `${SORT_SEPARATOR}asc` }, esperado: POR_DEFECTO },
  { caso: 'busqueda recortada', entrada: { [SEARCH_PARAM]: '  acido  ' }, esperado: { ...POR_DEFECTO, search: 'acido' } },
  { caso: 'busqueda de solo espacios', entrada: { [SEARCH_PARAM]: '   ' }, esperado: POR_DEFECTO },
  {
    caso: 'rango completo de fechas existentes',
    entrada: { [CREATED_FROM_PARAM]: '2026-01-31', [CREATED_TO_PARAM]: '2026-02-28' },
    esperado: {
      ...POR_DEFECTO,
      filters: { [CREATED_AT_COLUMN_ID]: { kind: 'dateRange', from: '2026-01-31', to: '2026-02-28' } },
    },
  },
  {
    caso: 'solo el extremo inicial',
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
  { caso: 'los dos extremos invalidos', entrada: { [CREATED_FROM_PARAM]: '2026-13-01', [CREATED_TO_PARAM]: 'ayer' }, esperado: POR_DEFECTO },
  { caso: 'fecha con hora', entrada: { [CREATED_FROM_PARAM]: '2026-01-01T10:00:00Z' }, esperado: POR_DEFECTO },
  { caso: 'dia 29 de un año no bisiesto', entrada: { [CREATED_TO_PARAM]: '2026-02-29' }, esperado: POR_DEFECTO },
  {
    caso: 'parametro repetido gana el primero',
    entrada: { [PAGE_PARAM]: ['2', '9'], [PAGE_SIZE_PARAM]: [String(MAX_PAGE_SIZE), '999'], [SEARCH_PARAM]: ['uno', 'dos'] },
    esperado: { ...POR_DEFECTO, page: 2, pageSize: MAX_PAGE_SIZE, search: 'uno' },
  },
  { caso: 'parametro repetido vacio', entrada: { [PAGE_PARAM]: [] }, esperado: POR_DEFECTO },
];

describe('parametros de lista de recetas', () => {
  it('R12: sin parametros devuelve la primera pagina, el tamano por defecto y nada acotado', () => {
    expect(parseRecipeListParams({})).toEqual(POR_DEFECTO);
    expect(parseRecipeListParams(undefined)).toEqual(POR_DEFECTO);
  });

  it.each(CONTRATO)('R12, R13: $caso', ({ entrada, esperado }) => {
    expect(parseRecipeListParams(entrada)).toEqual(esperado);
  });

  it('R22: las dos opciones de tamano son el defecto y el tope, y coinciden con las del selector', () => {
    expect([...PAGE_SIZE_OPTIONS]).toEqual([DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE]);
    expect([...SHARED_PAGE_SIZES].sort()).toEqual([...PAGE_SIZE_OPTIONS].sort());
  });

  it('R12: la consulta construida se vuelve a leer igual, con y sin todos los campos', () => {
    const completos: DataTableParams = {
      page: 3,
      pageSize: MAX_PAGE_SIZE,
      sort: { columnId: ORDENABLE, direction: 'desc' },
      filters: { [CREATED_AT_COLUMN_ID]: { kind: 'dateRange', from: '2026-01-01', to: null } },
      search: 'acido citrico',
    };

    for (const params of [POR_DEFECTO, completos]) {
      const consulta = new URLSearchParams(buildRecipeListQuery(params));
      expect(parseRecipeListParams(Object.fromEntries(consulta))).toEqual(params);
    }
  });

  it('R12: la consulta no escribe busqueda, orden ni fechas cuando estan vacios', () => {
    const consulta = new URLSearchParams(buildRecipeListQuery(POR_DEFECTO));

    for (const clave of [SEARCH_PARAM, SORT_PARAM, CREATED_FROM_PARAM, CREATED_TO_PARAM]) {
      expect(consulta.has(clave), clave).toBe(false);
    }
  });

  it('R12: el destino se deriva de la constante de ruta de formulas', () => {
    expect(recipeListHref(POR_DEFECTO)).toBe(`${FORMULAS_ROUTE}?${buildRecipeListQuery(POR_DEFECTO)}`);
  });

  it('R11: el filtro de fecha solo existe porque la lista blanca declara createdAt como rango de fechas', () => {
    expect(RECIPE_QUERYABLE.filterable[CREATED_AT_COLUMN_ID]).toBe('dateRange');
    expect(RECIPE_QUERYABLE.sortable).not.toContain(NO_ORDENABLE);
  });

  it('R11: el parser toma la lista blanca del contrato del modulo y no mantiene una copia', () => {
    const fuente = readFileSync(PARSER, 'utf8');

    expect(fuente).toMatch(/import \{ RECIPE_QUERYABLE \} from '@\/lib\/modules\/recetas';/);
    expect(fuente).not.toMatch(/@\/lib\/modules\/recetas\//);
    expect(fuente).not.toMatch(/sortable:\s*\[/);
  });
});

describe('busqueda o filtro activos y limpiar', () => {
  it('R32: solo orden o tamano no cuentan como busqueda ni filtro', () => {
    expect(hasActiveSearchOrFilter(POR_DEFECTO)).toBe(false);
    expect(
      hasActiveSearchOrFilter({
        ...POR_DEFECTO,
        pageSize: MAX_PAGE_SIZE,
        sort: { columnId: ORDENABLE, direction: 'asc' },
      }),
    ).toBe(false);
  });

  it('R32: un termino de busqueda cuenta como activo', () => {
    expect(hasActiveSearchOrFilter({ ...POR_DEFECTO, search: 'acido' })).toBe(true);
  });

  it('R32: un rango de fecha de creacion cuenta como activo', () => {
    expect(
      hasActiveSearchOrFilter({
        ...POR_DEFECTO,
        filters: { [CREATED_AT_COLUMN_ID]: { kind: 'dateRange', from: null, to: '2026-01-01' } },
      }),
    ).toBe(true);
  });

  it('R33: limpiar vacia busqueda y filtros, vuelve a la primera pagina y conserva orden y tamano', () => {
    const vigentes: DataTableParams = {
      page: 3,
      pageSize: MAX_PAGE_SIZE,
      sort: { columnId: ORDENABLE, direction: 'desc' },
      filters: { [CREATED_AT_COLUMN_ID]: { kind: 'dateRange', from: '2026-01-01', to: '2026-02-01' } },
      search: 'acido',
    };

    const limpios = clearSearchAndFilters(vigentes);

    expect(limpios).toEqual({
      page: FIRST_PAGE,
      pageSize: MAX_PAGE_SIZE,
      sort: vigentes.sort,
      filters: {},
      search: '',
    });
    expect(hasActiveSearchOrFilter(limpios)).toBe(false);
  });
});
