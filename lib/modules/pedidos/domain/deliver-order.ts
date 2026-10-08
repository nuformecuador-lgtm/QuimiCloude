import { requirePermission, type Actor } from './actor';
import { ActionNotAllowedError } from './errors';

import type { OrderDeliveryUnitOfWork } from '../ports/order-delivery-unit-of-work';
import type { OrderRepository } from '../ports/order-repository';

import type { CustomerCatalog } from '@/lib/modules/clientes';

export type DeliverOrderResult = {
  readonly status: 'delivered' | 'already_registered';
  readonly orderStatus: 'TERMINADO' | 'ENTREGADO';
};

export type DeliverOrderDeps = {
  readonly customerCatalog: Pick<CustomerCatalog, 'findAliveRefById'>;
  readonly unitOfWork: OrderDeliveryUnitOfWork;
  /** Solo para responder con el estado actual cuando la clave de entrega ya estaba registrada. */
  readonly orders: OrderRepository;
  readonly now?: () => Date;
};

/** Registra una entrega de producto terminado de un pedido `TERMINADO`. */
export function createDeliverOrder(
  deps: DeliverOrderDeps,
): (input: unknown, actor: Actor | null | undefined) => Promise<DeliverOrderResult> {
  void deps;
  return async function deliverOrder(input, actor) {
    requirePermission(actor, 'entregas.modificar');
    void input;
    throw new ActionNotAllowedError('deliverOrder: sin implementar');
  };
}
