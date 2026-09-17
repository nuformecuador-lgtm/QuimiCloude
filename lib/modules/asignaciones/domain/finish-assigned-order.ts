// lib/modules/asignaciones/domain/finish-assigned-order.ts
import { z } from 'zod';

import { requirePermission, type Actor } from './actor';
import { OrderNotFoundError, ValidationError } from './errors';
import { assertOrderAcceptsWrites } from './order-state';

import type { OrderAssignmentRepository } from '../ports/order-assignment-repository';

import type { OrderAssignmentTarget, OrderCatalog } from '@/lib/modules/pedidos';

const finishAssignedOrderSchema = z.strictObject({
  orderId: z.string().uuid(),
});

export type FinishAssignedOrderDeps = {
  readonly assignments: OrderAssignmentRepository;
  readonly orders: OrderCatalog;
  readonly now?: () => Date;
};

/**
 * Deja el pedido en `ENTREGADO`. No recibe ni admite ningun dato de lo marcado: la entrada es
 * solo el identificador del pedido, y nada de lo recorrido en pantalla se persiste.
 */
export function createFinishAssignedOrder(
  deps: FinishAssignedOrderDeps,
): (actor: Actor | null | undefined, input: unknown) => Promise<void> {
  return async function finishAssignedOrder(
    actor: Actor | null | undefined,
    input: unknown,
  ): Promise<void> {
    requirePermission(actor, 'asignaciones.consultar');

    const parsed = finishAssignedOrderSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const { orderId } = parsed.data;

    const ids = await deps.assignments.listOrderIdsByUserInCompany(actor.companyId, actor.id);
    if (!ids.includes(orderId)) throw new OrderNotFoundError();

    let order: OrderAssignmentTarget | null = await deps.orders.findAliveById(
      orderId,
      actor.companyId,
    );
    if (order === null) throw new OrderNotFoundError();
    if (order.status === 'ENTREGADO' || order.status === 'CANCELADO') {
      assertOrderAcceptsWrites(order);
    }

    const now = deps.now?.() ?? new Date();
    for (;;) {
      const result = await deps.orders.transitionAliveById(
        orderId,
        actor.companyId,
        order.status,
        'ENTREGADO',
        actor.id,
        now,
      );
      if (result === 'ok') return;
      if (result === 'not_found') throw new OrderNotFoundError();
      // 'stale': alguien lo movio entre la lectura y esta llamada. Se relee y se reintenta
      // contra el estado real.
      order = await deps.orders.findAliveById(orderId, actor.companyId);
      if (order === null) throw new OrderNotFoundError();
      if (order.status === 'ENTREGADO' || order.status === 'CANCELADO') {
        assertOrderAcceptsWrites(order);
      }
    }
  };
}
