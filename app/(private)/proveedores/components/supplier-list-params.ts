import {
  PAGE_SIZE_OPTIONS as SHARED_PAGE_SIZE_OPTIONS,
  type DataTableFilterValue,
  type DataTableParams,
  type DataTableSort,
} from '@/components/shared/data-table';
import { SUPPLIER_QUERYABLE } from '@/lib/modules/proveedores';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/shared/pagination';
import { SUPPLIERS_ROUTE } from '@/lib/shared/routes';

// Sin React ni `next/*`: la pagina lo lee en el servidor antes de que exista nada de cliente.
// Se acota en vez de validar porque el caso de uso rechaza `page: 0` y la pantalla mostraria un
// error donde el usuario solo esperaba la primera pagina.

export const PAGE_PARAM = 'page';
export const PAGE_SIZE_PARAM = 'pageSize';
export const SORT_PARAM = 'sort';
export const SEARCH_PARAM = 'q';
export const CREATED_FROM_PARAM = 'createdFrom';
export const CREATED_TO_PARAM = 'createdTo';

export const CREATED_AT_COLUMN_ID = 'createdAt';

export const SORT_SEPARATOR = ':';

export const FIRST_PAGE = 1;

export const PAGE_SIZE_OPTIONS = [DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE] as const;

// Lo que pinta el selector de la tabla compartida; un test lo ata a lo que acota este parser.
export const SHARED_PAGE_SIZES: readonly number[] = SHARED_PAGE_SIZE_OPTIONS;

type SupplierListSearchParams = Readonly<Record<string, string | readonly string[] | undefined>>;

// Mismo criterio que `URLSearchParams.get`: gana el primero.
function firstValue(raw: string | readonly string[] | undefined): string | undefined {
  if (raw === undefined) return undefined;
  return typeof raw === 'string' ? raw : raw[0];
}

// Se comprueba el texto y no el numero: `Number` acepta `'1.5'`, `'1e3'` y `' 2 '`.
function parsePositiveInt(raw: string | undefined): number | undefined {
  if (raw === undefined || !/^\d+$/.test(raw)) return undefined;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : undefined;
}

function isPageSize(value: number): boolean {
  return PAGE_SIZE_OPTIONS.some((option) => option === value);
}

function parseSort(raw: string | undefined): DataTableSort | null {
  if (raw === undefined) return null;
  const separator = raw.indexOf(SORT_SEPARATOR);
  if (separator <= 0) return null;

  const columnId = raw.slice(0, separator);
  const direction = raw.slice(separator + SORT_SEPARATOR.length);
  if (!SUPPLIER_QUERYABLE.sortable.includes(columnId)) return null;
  if (direction !== 'asc' && direction !== 'desc') return null;

  return { columnId, direction };
}

// `Date.parse` da por buena `2026-02-30` en V8, asi que la existencia se comprueba componente a
// componente. `setUTCFullYear` evita que los años 0-99 se lean como 1900-1999.
function parseIsoDate(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const value = raw.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return null;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(0);
  date.setUTCFullYear(year, month, day);
  const exists =
    date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day;
  return exists ? value : null;
}

export function parseSupplierListParams(
  searchParams: SupplierListSearchParams | undefined,
): DataTableParams {
  const rawPage = parsePositiveInt(firstValue(searchParams?.[PAGE_PARAM]));
  const rawPageSize = parsePositiveInt(firstValue(searchParams?.[PAGE_SIZE_PARAM]));

  const filters: Record<string, DataTableFilterValue> = {};
  if (SUPPLIER_QUERYABLE.filterable[CREATED_AT_COLUMN_ID] === 'dateRange') {
    const from = parseIsoDate(firstValue(searchParams?.[CREATED_FROM_PARAM]));
    const to = parseIsoDate(firstValue(searchParams?.[CREATED_TO_PARAM]));
    if (from !== null || to !== null) {
      filters[CREATED_AT_COLUMN_ID] = { kind: 'dateRange', from, to };
    }
  }

  const search = SUPPLIER_QUERYABLE.searchable
    ? (firstValue(searchParams?.[SEARCH_PARAM]) ?? '').trim()
    : '';

  return {
    page: rawPage === undefined || rawPage < FIRST_PAGE ? FIRST_PAGE : rawPage,
    pageSize: rawPageSize !== undefined && isPageSize(rawPageSize) ? rawPageSize : DEFAULT_PAGE_SIZE,
    sort: parseSort(firstValue(searchParams?.[SORT_PARAM])),
    filters,
    search,
  };
}

// Sin claves vacias: `?q=` haria creer que la lista esta filtrada.
export function buildSupplierListQuery(params: DataTableParams): string {
  const query = new URLSearchParams();
  query.set(PAGE_PARAM, String(params.page));
  query.set(PAGE_SIZE_PARAM, String(params.pageSize));

  if (params.sort !== null) {
    query.set(SORT_PARAM, `${params.sort.columnId}${SORT_SEPARATOR}${params.sort.direction}`);
  }

  const search = params.search.trim();
  if (search !== '') query.set(SEARCH_PARAM, search);

  const createdAt = params.filters[CREATED_AT_COLUMN_ID];
  if (createdAt?.kind === 'dateRange') {
    if (createdAt.from !== null) query.set(CREATED_FROM_PARAM, createdAt.from);
    if (createdAt.to !== null) query.set(CREATED_TO_PARAM, createdAt.to);
  }

  return query.toString();
}

export function supplierListHref(params: DataTableParams): string {
  return `${SUPPLIERS_ROUTE}?${buildSupplierListQuery(params)}`;
}

// El orden y el tamaño de pagina no cuentan: decide entre el vacio y «sin resultados».
export function hasActiveSearchOrFilter(params: DataTableParams): boolean {
  return params.search !== '' || Object.keys(params.filters).length > 0;
}

// Vuelve a la primera pagina porque, limpiando desde la tercera, podria caer en otro vacio.
export function clearSearchAndFilters(params: DataTableParams): DataTableParams {
  return { ...params, search: '', filters: {}, page: FIRST_PAGE };
}
