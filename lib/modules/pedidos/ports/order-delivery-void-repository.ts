import type { OrderScope } from '../domain/order-scope';

export type DeliveryForVoid = { readonly id: string; readonly orderId: string };

export type DeliveryLineForVoid = {
  readonly id: string;
  readonly presentationLineId: string;
  readonly batchId: string;
  readonly packages: number;
  /** decimal(14,4), positiva. */
  readonly quantity: string;
  readonly voided: boolean;
};

export type NewDeliveryVoid = {
  readonly voidKey: string;
  readonly deliveryId: string;
  /** Ya recortado. */
  readonly reason: string;
  readonly actorId: string;
  readonly now: Date;
};

export type RegisteredDeliveryVoid = { readonly id: string; readonly orderId: string };

/** Las anulaciones de entregas y sus lineas. Solo se insertan: ni se editan ni se borran. */
export interface OrderDeliveryVoidRepository {
  /** La anulacion de la empresa con esa clave, con el pedido de su entrega; la de otra empresa no se ve. */
  findByKey(voidKey: string, scope: OrderScope): Promise<RegisteredDeliveryVoid | null>;
  /** La entrega de la empresa; la de otra empresa sale como `null`. */
  findDelivery(deliveryId: string, scope: OrderScope): Promise<DeliveryForVoid | null>;
  /** Todas las lineas de la entrega, con su marca de anulada. Se llama con el pedido ya bloqueado. */
  findDeliveryLines(deliveryId: string, scope: OrderScope): Promise<readonly DeliveryLineForVoid[]>;
  /** `duplicate_key` si la empresa ya tiene una anulacion con esa clave. */
  create(
    entry: NewDeliveryVoid,
    scope: OrderScope,
  ): Promise<{ readonly kind: 'created'; readonly id: string } | { readonly kind: 'duplicate_key' }>;
  /** `already_voided` si alguna linea de entrega ya tenia su linea de anulacion: lo decide el unico de la base. */
  addLines(
    voidId: string,
    deliveryId: string,
    deliveryLineIds: readonly string[],
    scope: OrderScope,
  ): Promise<'ok' | 'already_voided'>;
}

export type DeliveryHistoryRow = {
  readonly id: string;
  readonly customerId: string;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly lines: readonly {
    readonly presentationLineId: string;
    readonly batchId: string;
    readonly packages: number;
    readonly void: { readonly reason: string; readonly createdBy: string; readonly createdAt: Date } | null;
  }[];
};

/** Lectura de la lista de entregas de un pedido, sobre el cliente global. */
export interface OrderDeliveryHistoryReader {
  /** Por `createdAt` descendente y luego `id`. Solo las del pedido y la empresa. */
  listByOrder(orderId: string, scope: OrderScope): Promise<readonly DeliveryHistoryRow[]>;
}
