import type { ListQueryable } from './list-query';

/**
 * Lista blanca de la pestana de producto terminado agrupada por pedido. El orden es fijo -numero
 * de pedido descendente, las filas sin pedido al final- y no hay filtros: alerta, tipo y rango de
 * existencia eran columnas del producto, y la fila ahora es el pedido. `search` busca por numero
 * de pedido o por nombre de receta.
 */
export const FINISHED_STOCK_QUERYABLE: ListQueryable = {
  sortable: [],
  filterable: {},
  searchable: true,
};
