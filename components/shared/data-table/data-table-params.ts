import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/shared/pagination';

import type { DataTableFilterValue, DataTableParams, DataTableSort } from './data-table-types';

/**
 * Forma canonica de `DataTableParams` y sus transiciones puras (`design.md > 2`, T4).
 *
 * **Sin React ni DOM a proposito**: es lo que permite probar R6, R7, R8 y R16 sin montar nada,
 * igual que hace hoy `product-list-params.ts` (`app/(private)/inventario/components`).
 *
 * **Una funcion por transicion**, cada una devuelve un `DataTableParams` NUEVO y completo: un
 * delta obligaria a cada consumidor a reconstruir el estado, que es donde nacen las
 * desincronizaciones (`design.md > 3.1`).
 */

/** Primera pagina: destino seguro al cambiar el tamano de pagina (R8). */
const FIRST_PAGE = 1;

/**
 * Las DOS unicas opciones de tamano de pagina (R11), derivadas de las constantes compartidas de
 * `lib/shared/pagination`. Ningun archivo de esta feature escribe el defecto ni el tope como
 * literal numerico.
 */
export const PAGE_SIZE_OPTIONS = [DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE] as const;

/**
 * Retardo del rebote del campo de busqueda de texto (`design.md > 6`), constante exportada para
 * que el test la controle con temporizadores falsos en vez de esperar de verdad.
 */
export const SEARCH_DEBOUNCE_MS = 300;

/**
 * Forma canonica de los parametros de lista antes de que el usuario interactue: primera pagina,
 * el tamano por defecto, sin orden, sin filtros y sin busqueda.
 */
export function createDefaultParams(): DataTableParams {
  return {
    page: FIRST_PAGE,
    pageSize: DEFAULT_PAGE_SIZE,
    sort: null,
    filters: {},
    search: '',
  };
}

/** Cambia de pagina. No toca ningun otro campo (`design.md > 13`, pregunta abierta 3). */
export function withPage(params: DataTableParams, page: number): DataTableParams {
  return { ...params, page };
}

/**
 * Cambia el tamano de pagina y lleva la pagina a la primera (R8): con un tamano nuevo, la pagina
 * vigente puede no existir.
 */
export function withPageSize(params: DataTableParams, pageSize: number): DataTableParams {
  return { ...params, pageSize, page: FIRST_PAGE };
}

/**
 * Cambia el orden vigente. Acepta `DataTableSort | null` porque hoy se ordena por una sola
 * columna (pregunta abierta 5); no toca la pagina (salida conservadora de la pregunta abierta 3).
 */
export function withSort(params: DataTableParams, sort: DataTableSort | null): DataTableParams {
  return { ...params, sort };
}

/**
 * Aplica o limpia el filtro de una columna. `value` en `null`/`undefined` SACA la clave del
 * objeto `filters` en vez de emitirla vacia (R16): asi el consumidor no distingue «sin filtro» de
 * «filtro vacio». No toca la pagina.
 */
export function withFilter(
  params: DataTableParams,
  columnId: string,
  value: DataTableFilterValue | null | undefined,
): DataTableParams {
  const nextFilters = { ...params.filters };

  if (value === null || value === undefined) {
    delete nextFilters[columnId];
  } else {
    nextFilters[columnId] = value;
  }

  return { ...params, filters: nextFilters };
}

/** Cambia la busqueda por texto global. No toca la pagina. */
export function withSearch(params: DataTableParams, search: string): DataTableParams {
  return { ...params, search };
}
