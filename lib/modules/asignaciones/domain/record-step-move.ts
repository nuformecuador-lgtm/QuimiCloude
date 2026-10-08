// lib/modules/asignaciones/domain/record-step-move.ts
import { z } from 'zod';

import { requirePermission, type Actor } from './actor';
import { OrderBlockedError, OrderNotFoundError, ValidationError } from './errors';
import { assertOrderAcceptsWrites } from './order-state';

import type { ExecutionLogRepository } from '../ports/execution-log-repository';
import type { OrderAssignmentRepository } from '../ports/order-assignment-repository';
import type { OrderCatalog } from '@/lib/modules/pedidos';

const recordStepMoveSchema = z.strictObject({
  orderId: z.string().uuid(),
  direction: z.enum(['advance', 'go_back']),
  stepPosition: z.number().int().min(1).nullable(),
});

export type RecordStepMoveDeps = {
  readonly assignments: OrderAssignmentRepository;
  readonly orders: OrderCatalog;
  readonly log: ExecutionLogRepository;
  readonly now?: () => Date;
};

/**
 * Anota un paso adelante o atras, con la posicion del paso al que se llega. Solo sobre un
 * `EN_CURSO`: cualquier otro estado lanza sin escribir.
 *
 * `BLOQUEADO` se rechaza aqui y antes que nada porque `assertOrderAcceptsWrites` lo deja pasar:
 * esa tabla admite asignar responsables a un pedido sin material, no recorrer su receta.
 * `PENDIENTE`, que esa tabla tambien admite, sale como `OrderNotFoundError`: no hay ejecucion
 * abierta que anotar.
 *
 * Es una sola sentencia, sin transaccion: entre la lectura del estado y la escritura no hay
 * candado, y perder o colar una anotacion de paso no deja ningun pedido incoherente.
 */
export function createRecordStepMove(
  deps: RecordStepMoveDeps,
): (actor: Actor | null | undefined, input: unknown) => Promise<void> {
  return async function recordStepMove(
    actor: Actor | null | undefined,
    input: unknown,
  ): Promise<void> {
    requirePermission(actor, 'asignaciones.ejecutar');

    const parsed = recordStepMoveSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const { orderId, direction, stepPosition } = parsed.data;

    const ids = await deps.assignments.listOrderIdsByUserInCompany(actor.companyId, actor.id);
    if (!ids.includes(orderId)) throw new OrderNotFoundError();

    const order = await deps.orders.findAliveById(orderId, actor.companyId);
    if (order === null) throw new OrderNotFoundError();

    if (order.status !== 'EN_CURSO') {
      if (order.status === 'BLOQUEADO') throw new OrderBlockedError();
      assertOrderAcceptsWrites(order);
      throw new OrderNotFoundError();
    }

    await deps.log.append({
      action: direction,
      companyId: actor.companyId,
      orderId,
      userId: actor.id,
      stepPosition,
      occurredAt: deps.now?.() ?? new Date(),
    });
  };
}
