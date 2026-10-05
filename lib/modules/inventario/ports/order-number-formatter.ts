import type { FinishedOrderNumber } from '../domain/finished-stock';

/** El formato visible del numero de pedido es de `pedidos`; aqui solo se pide. */
export interface OrderNumberFormatter {
  format(number: FinishedOrderNumber): string;
}
