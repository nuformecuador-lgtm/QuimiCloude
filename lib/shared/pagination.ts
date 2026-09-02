/**
 * Util de paginacion reutilizable por todo CRUD futuro (D16, R27; `design.md > 8`).
 * `lib/shared/` es HOJA del grafo: no importa modulos ni `lib/composition`
 * (`docs/architecture.md > La regla de dependencias`). El tipo de pagina se produce
 * de forma estructural, sin importar `lib/modules/inventario/domain/page` desde aqui
 * (lo prohibe la guardia de arquitectura, bloque 9).
 */

/** Tamano de pagina por defecto cuando la consulta no indica ninguno (D15, R24). */
export const DEFAULT_PAGE_SIZE = 10;

/**
 * Tope superior del tamano de pagina (D21, R36). Un `pageSize` mayor se ACOTA, no se
 * rechaza: rechazar el minimo y la integridad es trabajo de zod en el dominio (R25);
 * acotar aqui es la defensa contra una consulta sin limite superior.
 */
export const MAX_PAGE_SIZE = 25;

/** Pagina generica, declarada aqui de forma estructural (no importada de ningun modulo). */
type PageResult<T> = {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
};

/**
 * Traduce numero de pagina y tamano solicitado a `offset`/`limit` para el repositorio.
 * Aplica el defecto de R24 y acota al maximo de R36; NO valida minimo ni integridad,
 * eso ya lo rechazo zod antes de llegar aqui (R25).
 */
export function toOffsetLimit(
  page: number,
  pageSize?: number,
): { offset: number; limit: number } {
  const effectiveSize = Math.min(pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  return {
    offset: (page - 1) * effectiveSize,
    limit: effectiveSize,
  };
}

/**
 * Construye la pagina de salida. El `pageSize` devuelto es SIEMPRE el efectivo ya
 * acotado (el mismo que calculo `toOffsetLimit`), nunca el que pidio el llamante: si
 * pidiera 500 y devolviera 25 elementos, `totalPages` mentiria si se calculara con 500.
 * `totalPages` es 1 cuando no hay ningun elemento: una lista vacia es una pagina vacia,
 * no cero paginas.
 */
export function buildPage<T>(
  items: readonly T[],
  total: number,
  page: number,
  pageSize: number,
): PageResult<T> {
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: total === 0 ? 1 : Math.ceil(total / pageSize),
  };
}
