// lib/modules/asignaciones/domain/cancel-assigned-order.ts
import { z } from 'zod';

import { requirePermission, type Actor } from './actor';
import { NotCancellableError, OrderNotFoundError, ValidationError } from './errors';
import { ExecutionAbortedError, isExecutionSuccess } from './execution-entry';

import type { ExecutionTransaction } from '../ports/execution-transaction';
import type { OrderAssignmentRepository } from '../ports/order-assignment-repository';

import { cancelOrderSchema, formatOrderNumber, type OrderCatalog } from '@/lib/modules/pedidos';

const cancelAssignedOrderSchema = z.strictObject({
  orderId: z.string().uuid(),
  stepPosition: z.number().int().min(1).nullable(),
  reason: cancelOrderSchema.shape.reason,
});

export type CancelAssignedOrderDeps = {
  readonly assignments: OrderAssignmentRepository;
  readonly orders: OrderCatalog;
  readonly transaction: ExecutionTransaction;
  readonly now?: () => Date;
};

export type CancelAssignedOrderResult = {
  readonly numberText: string;
};

/**
 * Cancela el pedido por el camino unico de `pedidos` -motivo, liberacion de lo apartado- y anota
 * la cancelacion con el mismo motivo, todo en una transaccion: o quedan las dos cosas o ninguna.
 *
 * Que el estado sea cancelable lo decide `pedidos` bajo el candado de la fila, no esta funcion:
 * por eso no hay reintento por carrera, y `POR_EMPACAR`, `EN_EMPAQUE`, `ENTREGADO` y `CANCELADO`
 * salen todos por `not_cancellable`.
 *
 * El numero visible se lee antes de escribir, para que la lista pueda confirmar que pedido se
 * cancelo.
 */
export function createCancelAssignedOrder(
  deps: CancelAssignedOrderDeps,
): (actor: Actor | null | undefined, input: unknown) => Promise<CancelAssignedOrderResult> {
  return async function cancelAssignedOrder(
    actor: Actor | null | undefined,
    input: unknown,
  ): Promise<CancelAssignedOrderResult> {
    requirePermission(actor, 'asignaciones.ejecutar');

    const parsed = cancelAssignedOrderSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const { orderId, stepPosition, reason } = parsed.data;

    const ids = await deps.assignments.listOrderIdsByUserInCompany(actor.companyId, actor.id);
    if (!ids.includes(orderId)) throw new OrderNotFoundError();

    const order = await deps.orders.findAliveById(orderId, actor.companyId);
    if (order === null) throw new OrderNotFoundError();

    const summaryPage = await deps.orders.listAliveSummariesByIds(
      actor.companyId,
      [orderId],
      [order.status],
      1,
      1,
    );
    const summary = summaryPage.items[0];
    if (summary === undefined) throw new OrderNotFoundError();
    const numberText = formatOrderNumber(summary.number);

    const now = deps.now?.() ?? new Date();
    try {
      await deps.transaction.run(async ({ orders, log }) => {
        const outcome = await orders.cancelAliveById(orderId, actor.companyId, reason, actor.id, now);
        if (!isExecutionSuccess(outcome)) throw new ExecutionAbortedError(outcome);
        await log.append({
          action: 'cancel',
          companyId: actor.companyId,
          orderId,
          userId: actor.id,
          stepPosition,
          reason,
          occurredAt: now,
        });
      });
    } catch (error) {
      if (!(error instanceof ExecutionAbortedError)) throw error;
      if (error.outcome === 'not_cancellable') throw new NotCancellableError();
      if (error.outcome === 'not_found') throw new OrderNotFoundError();
      throw error;
    }

    return { numberText };
  };
}
