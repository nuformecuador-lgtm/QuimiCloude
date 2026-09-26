/**
 * Tipo de salida del listado paginado de clientes. `pageSize` es siempre el efectivo, ya
 * acotado por `lib/shared/pagination` en el adaptador driven, nunca el pedido.
 */
export type Page<T> = {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
};
