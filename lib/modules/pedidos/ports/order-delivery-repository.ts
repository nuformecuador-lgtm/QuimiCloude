import type { OrderScope } from '../domain/order-scope';

export type NewOrderDelivery = {
  readonly deliveryKey: string;
  readonly orderId: string;
  readonly customerId: string;
  readonly actorId: string;
  readonly now: Date;
};

export type NewOrderDeliveryLine = {
  readonly presentationLineId: string;
  readonly batchId: string;
  readonly packages: number;
  readonly quantity: string;
};

/** Las entregas de un pedido y sus lineas. Solo se insertan: ni se editan ni se borran. */
export interface OrderDeliveryRepository {
  /** `duplicate_key` si la empresa ya tiene una entrega con esa clave. */
  create(
    delivery: NewOrderDelivery,
    scope: OrderScope,
  ): Promise<{ readonly kind: 'created'; readonly id: string } | { readonly kind: 'duplicate_key' }>;
  addLines(deliveryId: string, lines: readonly NewOrderDeliveryLine[], scope: OrderScope): Promise<void>;
  /** Envases entregados por linea del reparto; las lineas sin entregas no aparecen. */
  sumDeliveredPackages(orderId: string, scope: OrderScope): Promise<ReadonlyMap<string, number>>;
}
