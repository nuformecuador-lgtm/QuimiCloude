import { requirePermission, type Actor } from './actor';
import { ActionNotAllowedError } from './errors';

import type { OrderDeliveryVoidRepository } from '../ports/order-delivery-void-repository';
import type { OrderDeliveryVoidUnitOfWork } from '../ports/order-delivery-void-unit-of-work';
import type { OrderRepository } from '../ports/order-repository';

export type VoidDeliveryResult = {
  readonly status: 'voided' | 'already_registered';
  readonly orderStatus: 'TERMINADO' | 'ENTREGADO';
};

export type VoidDeliveryDeps = {
  readonly unitOfWork: OrderDeliveryVoidUnitOfWork;
  /** Sobre el cliente global, fuera de la transaccion. */
  readonly voids: Pick<OrderDeliveryVoidRepository, 'findByKey' | 'findDelivery'>;
  /** Solo para responder con el estado actual cuando la clave de anulacion ya estaba registrada. */
  readonly orders: OrderRepository;
  readonly now?: () => Date;
};

/** Anula presentaciones enteras de una entrega y devuelve sus envases a los lotes de origen. */
export function createVoidDelivery(
  deps: VoidDeliveryDeps,
): (input: unknown, actor: Actor | null | undefined) => Promise<VoidDeliveryResult> {
  void deps;
  return async function voidDelivery(input, actor) {
    requirePermission(actor, 'entregas.anular');
    void input;
    throw new ActionNotAllowedError('voidDelivery: sin implementar');
  };
}
