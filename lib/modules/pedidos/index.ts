// lib/modules/pedidos/index.ts — CONTRATO PUBLICO del modulo `pedidos`.
// Solo reexporta simbolos de ./domain. Debe poder importarse desde un componente de cliente sin
// arrastrar servidor: nada de 'use server', @prisma/client ni next/* en su cierre de imports.
// Los adaptadores driving que traiga QC-34 NO pasan por aqui.
export { formatOrderNumber } from './domain/order-number';
export type { OrderId, OrderNumber } from './domain/order-number';
export {
  ORDER_PRIORITY_VALUES,
  ORDER_STATUS_VALUES,
  DEFAULT_ORDER_PRIORITY,
  DEFAULT_ORDER_STATUS,
} from './domain/order-classification';
export type { OrderPriority, OrderStatus } from './domain/order-classification';
export type { OrderContents } from './domain/order-contents';
