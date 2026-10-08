import { requirePermission, type Actor } from './actor';
import { ActionNotAllowedError } from './errors';

import type { OrderCustomer } from './order-customer';

import type { OrderDeliveryRepository } from '../ports/order-delivery-repository';
import type { OrderRepository } from '../ports/order-repository';
import type { OrderWriteRepository } from '../ports/order-write-repository';

import type { CustomerCatalog } from '@/lib/modules/clientes';
import type { DeliverableBatch, FinishedBatchCatalog, PresentationCatalog } from '@/lib/modules/inventario';

export type OrderDeliveryLineView = {
  readonly presentationLineId: string;
  readonly presentationName: string;
  readonly orderedPackages: number;
  readonly deliveredPackages: number;
  readonly remainingPackages: number;
  /** Vacio cuando a la linea ya no le falta ningun envase. */
  readonly batches: readonly DeliverableBatch[];
};

export type OrderDeliveryView = {
  readonly orderId: string;
  readonly numberText: string;
  /** El cliente del pedido si sigue vivo; si no tiene o esta dado de baja, `null`. */
  readonly customer: OrderCustomer | null;
  readonly lines: readonly OrderDeliveryLineView[];
};

export type GetOrderDeliveryDeps = {
  readonly orders: OrderRepository;
  readonly deliveries: Pick<OrderDeliveryRepository, 'sumDeliveredPackages'>;
  readonly lines: Pick<OrderWriteRepository, 'findPresentationLinesForFinish'>;
  readonly presentations: Pick<PresentationCatalog, 'findRefs'>;
  readonly finishedBatches: FinishedBatchCatalog;
  readonly customerCatalog: Pick<CustomerCatalog, 'findAliveRefById'>;
};

/** Lo que el sheet de entrega necesita de un pedido `TERMINADO`. */
export function createGetOrderDelivery(
  deps: GetOrderDeliveryDeps,
): (orderId: string, actor: Actor | null | undefined) => Promise<OrderDeliveryView> {
  void deps;
  return async function getOrderDelivery(orderId, actor) {
    requirePermission(actor, 'entregas.modificar');
    void orderId;
    throw new ActionNotAllowedError('getOrderDelivery: sin implementar');
  };
}
