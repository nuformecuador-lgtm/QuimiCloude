import { PAGE_SIZE_OPTIONS, type DataTableParams } from '@/components/shared/data-table';
import { resolveAssignmentView, type AssignmentViewKind } from '@/lib/modules/asignaciones';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';
import { ASSIGNED_ORDERS_ROUTE } from '@/lib/shared/routes';

export const VIEW_PARAM = 'vista';
export const PAGE_PARAM = 'page';
export const PAGE_SIZE_PARAM = 'pageSize';
export const STATUS_PARAM = 'status';

export const FIRST_PAGE = 1;

/** El mismo formato que `/pedidos`, duplicado a proposito: esta ruta no importa el dominio de
 *  `pedidos` solo para reconocer siete palabras en una cadena de consulta. Orden de `ORDER_STATUS_FLOW`. */
export const ROUTE_ORDER_STATUS_VALUES = [
  'PENDIENTE',
  'EN_CURSO',
  'POR_EMPACAR',
  'EN_EMPAQUE',
  'ENTREGADO',
  'CANCELADO',
  'BLOQUEADO',
] as const;
export type RouteOrderStatus = (typeof ROUTE_ORDER_STATUS_VALUES)[number];

/** El App Router entrega un array cuando el parametro viene repetido: la primera basta aqui. */
export type AssignmentSearchParams = Readonly<Record<string, string | readonly string[] | undefined>>;

function firstValue(raw: string | readonly string[] | undefined): string | undefined {
  if (raw === undefined) return undefined;
  return typeof raw === 'string' ? raw : raw[0];
}

/**
 * Se comprueba el TEXTO y no el resultado de convertir: `Number` acepta `'1.5'`, `'1e3'`, `'0x2'`
 * y `' 2 '`, que no son lo que nadie escribio en una URL de paginacion.
 */
function parsePositiveInt(raw: string | undefined): number | undefined {
  if (raw === undefined || !/^\d+$/.test(raw)) return undefined;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : undefined;
}

function isPageSize(value: number): boolean {
  return PAGE_SIZE_OPTIONS.some((option) => option === value);
}

/**
 * La vista pedida por la direccion, resuelta contra las permitidas para este usuario:
 * si no viene o no esta en `allowed`, cae a la primera sin lanzar y sin revelar que otra vista
 * existe.
 */
export function parseAssignmentViewParam(
  searchParams: AssignmentSearchParams | undefined,
  allowed: readonly AssignmentViewKind[],
): AssignmentViewKind {
  return resolveAssignmentView(firstValue(searchParams?.[VIEW_PARAM]), allowed);
}

/**
 * `page` y `pageSize`, tolerantes: ninguna entrada produce un error. Compartido por «Terminados» y
 * «Todos», que todavia no traen columnas propias de orden ni de busqueda.
 */
export function parseAssignmentListParams(
  searchParams: AssignmentSearchParams | undefined,
): DataTableParams {
  const rawPage = parsePositiveInt(firstValue(searchParams?.[PAGE_PARAM]));
  const rawPageSize = parsePositiveInt(firstValue(searchParams?.[PAGE_SIZE_PARAM]));

  return {
    page: rawPage === undefined || rawPage < FIRST_PAGE ? FIRST_PAGE : rawPage,
    pageSize: rawPageSize !== undefined && isPageSize(rawPageSize) ? rawPageSize : DEFAULT_PAGE_SIZE,
    sort: null,
    filters: {},
    search: '',
  };
}

/**
 * El filtro de estado de «Todos»: separado por comas, mismo formato que `/pedidos`. Los
 * valores que no estan en `ROUTE_ORDER_STATUS_VALUES` se descartan en silencio y los repetidos se
 * deduplican, en vez de fallar.
 */
export function parseStatusFilter(
  searchParams: AssignmentSearchParams | undefined,
): readonly RouteOrderStatus[] {
  const raw = firstValue(searchParams?.[STATUS_PARAM]);
  if (raw === undefined || raw.trim() === '') return [];

  const result: RouteOrderStatus[] = [];
  for (const piece of raw.split(',')) {
    const trimmed = piece.trim();
    const isValid = (ROUTE_ORDER_STATUS_VALUES as readonly string[]).includes(trimmed);
    if (isValid && !result.includes(trimmed as RouteOrderStatus)) {
      result.push(trimmed as RouteOrderStatus);
    }
  }
  return result;
}

/** El enlace de una pestana: cambia de vista sin arrastrar la pagina ni el filtro de la vista de
 *  origen, que no tendrian sentido en la otra lista. */
export function assignmentViewHref(vista: AssignmentViewKind): string {
  const query = new URLSearchParams();
  query.set(VIEW_PARAM, vista);
  return `${ASSIGNED_ORDERS_ROUTE}?${query.toString()}`;
}

/**
 * El filtro exacto que activa el orden y la columna de terminados: la lista de
 * estados aplicada tiene que ser, sin mas, `['ENTREGADO']`. Vacio significa «sin filtro» (los
 * cuatro estados) y nunca cuenta como exacto.
 *
 * Vive junto a los demas parseos de la URL, no en `company-orders-columns.tsx`: ese modulo es
 * `'use client'` y tanto `page.tsx` como `CompanyOrdersSkeleton` (Server Components) necesitan
 * invocarla directamente, no solo pintarla como JSX.
 */
export function isExactlyDelivered(statuses: readonly RouteOrderStatus[]): boolean {
  return statuses.length === 1 && statuses[0] === 'ENTREGADO';
}
