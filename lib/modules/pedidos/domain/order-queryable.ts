// lib/modules/pedidos/domain/order-queryable.ts
/**
 * Lista blanca del listado de PEDIDOS. Lo que no este aqui se omite sin romper la consulta.
 *
 * `orders` no tiene columna de nombre propia: la busqueda casa por el nombre de la RECETA del
 * pedido, resuelto en otro modulo y traducido a una lista de ids antes de llegar al `where`.
 *
 * `deletedAt` no esta y no puede estar.
 */

import type { ListQueryable } from './list-query';
import { ORDER_CUSTOMER_FILTER_FIELD, ORDER_CUSTOMER_PRESENCE_FILTER_FIELD } from './order-customer';

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
  /**
   * El cliente filtra pero no ordena: su nombre vive en otro modulo y la columna solo guarda el
   * id, igual que la receta. `customerId` admite solo uuids; «sin cliente» va en un campo aparte,
   * `customerPresence`, con un conjunto cerrado de un unico valor. Los dos juntos son la union.
   */
  filterable: {
    status: 'select',
    priority: 'select',
    createdAt: 'dateRange',
    [ORDER_CUSTOMER_FILTER_FIELD]: 'select',
    [ORDER_CUSTOMER_PRESENCE_FILTER_FIELD]: 'select',
  },
  searchable: true,
};
