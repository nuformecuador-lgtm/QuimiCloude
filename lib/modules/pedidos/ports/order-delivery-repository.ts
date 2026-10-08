import type { OrderScope } from '../domain/order-scope';

export type NewOrderDelivery = {
  readonly deliveryKey: string;
  readonly orderId: string;
  readonly customerId: string;
  readonly actorId: string;
  readonly now: Date;
};

/** Lo minimo de una entrega ya registrada para responder a un reintento con su clave (R29). */
export type RegisteredOrderDelivery = {
  readonly id: string;
  readonly orderId: string;
};

export type NewOrderDeliveryLine = {
  readonly presentationLineId: string;
  readonly batchId: string;
  readonly packages: number;
  readonly quantity: string;
};

/** Las entregas de un pedido y sus lineas. Solo se insertan: ni se editan ni se borran. */
export interface OrderDeliveryRepository {
  /** La entrega de la empresa con esa clave, o `null`. Una clave de otra empresa no se ve (R29, R31). */
  findByKey(deliveryKey: string, scope: OrderScope): Promise<RegisteredOrderDelivery | null>;
  /** `duplicate_key` si la empresa ya tiene una entrega con esa clave. */
  create(
    delivery: NewOrderDelivery,
    scope: OrderScope,
  ): Promise<{ readonly kind: 'created'; readonly id: string } | { readonly kind: 'duplicate_key' }>;
  addLines(deliveryId: string, lines: readonly NewOrderDeliveryLine[], scope: OrderScope): Promise<void>;
  /** Envases entregados por linea del reparto; las lineas sin entregas no aparecen. */
  sumDeliveredPackages(orderId: string, scope: OrderScope): Promise<ReadonlyMap<string, number>>;
}
