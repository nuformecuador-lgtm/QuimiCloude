import { PAGE_SIZE_OPTIONS, type DataTableParams } from '@/components/shared/data-table';
import type { AssignmentViewKind } from '@/lib/modules/asignaciones';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';
import { ASSIGNED_ORDERS_ROUTE } from '@/lib/shared/routes';

import { VIEW_PARAM } from './assignment-view-params';

// Reexportado para que `assigned-orders-list-section.tsx` no necesite importar el barrel del
// modulo: ese archivo solo puede llegar a la accion por su ruta exacta (guardia de contrato).
export type { AssignmentViewKind };

export const PAGE_PARAM = 'page';
export const PAGE_SIZE_PARAM = 'pageSize';

export const FIRST_PAGE = 1;

/** El App Router entrega un array cuando el parametro viene repetido (`?page=1&page=2`). */
export type AssignedOrdersSearchParams = Readonly<
  Record<string, string | readonly string[] | undefined>
>;

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
 * Ninguna entrada produce un error: toda URL acaba en una lista. `sort`, `filters` y `search` van
 * fijos en su valor «sin efecto» porque `<DataTable>` los exige y esta pantalla no los usa.
 */
export function parseAssignedOrdersListParams(
  searchParams: AssignedOrdersSearchParams | undefined,
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
 * No escribe `sort`, `filters` ni `search` ni siquiera vacios: hacerlo invitaria a creer que la
 * lista los usa.
 */
export function buildAssignedOrdersListQuery(params: DataTableParams): string {
  const query = new URLSearchParams();
  query.set(PAGE_PARAM, String(params.page));
  query.set(PAGE_SIZE_PARAM, String(params.pageSize));
  return query.toString();
}

/**
 * `vista` es OPCIONAL a proposito (`design.md > 6.2`): cuando esta pantalla solo tiene una vista no
 * hay pestañas ni parametro que conservar, y las pruebas existentes de esta lista siguen fijando un
 * `href` con solo `page` y `pageSize`. Cuando la pantalla ofrece mas de una vista, quien construye
 * el `href` pasa la vigente para que paginar «Mis asignados» no vuelva a la vista por defecto.
 */
export function assignedOrdersListHref(params: DataTableParams, vista?: AssignmentViewKind): string {
  const query = new URLSearchParams(buildAssignedOrdersListQuery(params));
  if (vista !== undefined) query.set(VIEW_PARAM, vista);
  return `${ASSIGNED_ORDERS_ROUTE}?${query.toString()}`;
}

/** Solo `page` y `pageSize`: el esquema del dominio es estricto y rechazaria una clave de mas. */
export function toAssignedOrdersQuery(params: DataTableParams): { page: number; pageSize: number } {
  return { page: params.page, pageSize: params.pageSize };
}
