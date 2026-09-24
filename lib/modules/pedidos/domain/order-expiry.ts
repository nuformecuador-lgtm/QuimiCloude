// lib/modules/pedidos/domain/order-expiry.ts
/**
 * Las dos constantes de la caducidad de la reserva, en un solo sitio: el motivo exacto que
 * escribe `cancelAlive` y el plazo que usa `expire-stale-orders.ts` para calcular el umbral.
 * Dominio puro: no importa nada.
 */

/** Motivo exacto de la cancelacion automatica. Sin persona autora: la escribe el proceso diario. */
export const EXPIRED_ORDER_REASON = 'pedido caducado';

/** Dias desde que un pedido apartó, o desde su ultima edicion, hasta que su reserva caduca. */
export const ORDER_RESERVATION_TTL_DAYS = 15;
