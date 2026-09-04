// lib/modules/pedidos/domain/order-classification.ts
/** Los tres estados, EN SU ORDEN DE DECLARACION del esquema. El dominio NO puede importar
 *  `@prisma/client` (`docs/architecture.md > La regla de dependencias`), asi que estos valores
 *  son un DUPLICADO del `enum OrderStatus` de `db/schema.prisma`. Es el punto fragil del
 *  modulo, y por eso R35 existe: `module-contract.test.ts` lee el esquema y compara las dos
 *  listas, valor a valor y en orden. */
export const ORDER_STATUS_VALUES = ['PENDIENTE', 'EN_CURSO', 'ENTREGADO'] as const;
export type OrderStatus = (typeof ORDER_STATUS_VALUES)[number];

/** Las cuatro prioridades, DE MENOR A MAYOR. El orden es el dato: es lo que fijo la decision
 *  cerrada 4 y lo que ordena Postgres al comparar dos valores del enum. */
export const ORDER_PRIORITY_VALUES = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'] as const;
export type OrderPriority = (typeof ORDER_PRIORITY_VALUES)[number];

/** Los dos defectos, tambien duplicados del esquema (`@default`) y tambien vigilados por R35. */
export const DEFAULT_ORDER_STATUS: OrderStatus = 'PENDIENTE';
export const DEFAULT_ORDER_PRIORITY: OrderPriority = 'BAJA';
