// lib/modules/pedidos/domain/order-queryable.ts
/**
 * Lista blanca del listado de PEDIDOS (R4, `design.md > 5`). Lo que no este aqui se omite sin
 * romper la consulta (R5).
 *
 * Es la UNICA de las siete con `searchable: false` (R17): `orders` no tiene columna `name`, asi
 * que la busqueda se omite y se registra como cualquier otro campo no declarado.
 *
 * `deletedAt` no esta y no puede estar (R7).
 */

import type { ListQueryable } from './list-query';

export const ORDER_QUERYABLE: ListQueryable = {
  /**
   * `orderNumber` es el par `(orderYear, orderSequence)` presentado como UN solo campo: el numero
   * visible no esta guardado, lo compone `formatOrderNumber`. El adaptador lo traduce a
   * `orderBy: [{ orderYear: dir }, { orderSequence: dir }]`. Es la unica traduccion uno-a-dos del
   * contrato (`design.md > 5`).
   *
   * `priority` y `status` son enums de Postgres: ordenan por ORDEN DE DECLARACION del enum -que
   * es el orden de la prioridad, no el alfabetico- y filtran como `select` contra su conjunto
   * cerrado de valores.
   *
   * `quantity` es `Decimal(14,4)`; el rango llega como `number` y lo convierte el adaptador.
   *
   * QC-35bis (2026-09-07): `unitPrice` SALIO de esta lista al salir de la tabla. Al no estar
   * declarado, pedir ese orden ya no es un error: se omite y se anota (R5), como cualquier campo
   * desconocido. El indice parcial `orders_unit_price_idx` cayo en la misma migracion.
   */
  sortable: ['orderNumber', 'priority', 'status', 'createdAt', 'quantity'],
  filterable: {
    status: 'select',
    priority: 'select',
    createdAt: 'dateRange',
  },
  searchable: false,
};
