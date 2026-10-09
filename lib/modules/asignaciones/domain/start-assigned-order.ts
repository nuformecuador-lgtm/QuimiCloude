// lib/modules/asignaciones/domain/start-assigned-order.ts
import { z } from 'zod';

import { requirePermission, type Actor } from './actor';
import { OrderBlockedError, OrderNotFoundError, ValidationError } from './errors';
import { ExecutionAbortedError, isExecutionSuccess } from './execution-entry';
import { createGetAssignedOrderExecution, type GetAssignedOrderExecutionDeps } from './get-assigned-order-execution';
import { assertOrderAcceptsWrites } from './order-state';

import type { AssignedOrderExecutionView, StartedOrderExecution } from './assigned-order-execution-view';
import type { ExecutionLogRepository } from '../ports/execution-log-repository';
import type { ExecutionTransaction } from '../ports/execution-transaction';

import type { OrderAssignmentTarget } from '@/lib/modules/pedidos';

const startAssignedOrderSchema = z.strictObject({
  orderId: z.string().uuid(),
});

export type StartAssignedOrderDeps = GetAssignedOrderExecutionDeps & {
  readonly log: ExecutionLogRepository;
  readonly transaction: ExecutionTransaction;
  readonly now?: () => Date;
};

/**
 * `PENDIENTE` transiciona a `EN_CURSO` y anota el arranque en la misma transaccion; `EN_CURSO`
 * anota el retomar en la ultima posicion anotada; `BLOQUEADO` rechaza con `order_blocked` sin
 * anotar, tambien si una edicion lo bloqueo entre la lectura y la transicion; cualquier otro
 * estado rechaza con el error de `order-state.ts`. Si otro responsable arranca mientras se lee la
 * vista, se relee una vez y se sigue por la rama del estado nuevo.
 * La legalidad de la escritura la decide `pedidos` dentro de `transitionAliveById`, nunca esta
 * funcion.
 */
export function createStartAssignedOrder(
  deps: StartAssignedOrderDeps,
): (actor: Actor | null | undefined, input: unknown) => Promise<StartedOrderExecution> {
  const getAssignedOrderExecution = createGetAssignedOrderExecution(deps);

  return async function startAssignedOrder(
    actor: Actor | null | undefined,
    input: unknown,
  ): Promise<StartedOrderExecution> {
    requirePermission(actor, 'asignaciones.ejecutar');

    const parsed = startAssignedOrderSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const { orderId } = parsed.data;

    const ids = await deps.assignments.listOrderIdsByUserInCompany(actor.companyId, actor.id);
    if (!ids.includes(orderId)) throw new OrderNotFoundError();

    let order: OrderAssignmentTarget | null = await deps.orders.findAliveById(
      orderId,
      actor.companyId,
    );
    // Los pasos no cambian al transicionar: tras un `stale` se reutiliza la vista ya leida.
    let view: AssignedOrderExecutionView | null = null;
    let viewRaceRetried = false;

    for (;;) {
      if (order === null) throw new OrderNotFoundError();
      if (order.status === 'BLOQUEADO') throw new OrderBlockedError();

      if (order.status === 'EN_CURSO') {
        view ??= await getAssignedOrderExecution(actor, { orderId });
        const last = await deps.log.findLastStepPosition(actor.companyId, orderId);
        const position = view.steps.length === 0 ? null : last ?? 1;
        await deps.log.append({
          action: 'resume',
          companyId: actor.companyId,
          orderId,
          userId: actor.id,
          stepPosition: position,
          occurredAt: deps.now?.() ?? new Date(),
        });
        return { ...view, status: 'EN_CURSO', resumeStepPosition: position };
      }

      if (order.status !== 'PENDIENTE') {
        assertOrderAcceptsWrites(order);
        throw new OrderNotFoundError();
      }

      if (view === null) {
        try {
          view = await getAssignedOrderExecution(actor, { orderId });
        } catch (error) {
          if (!(error instanceof OrderNotFoundError) || viewRaceRetried) throw error;
          // La vista lee el estado y luego el resumen filtrado por ese estado: si otro responsable
          // arranca entre las dos lecturas, el resumen sale vacio aunque el pedido siga asignado.
          viewRaceRetried = true;
          const reread = await deps.orders.findAliveById(orderId, actor.companyId);
          if (reread === null || reread.status === 'PENDIENTE') throw error;
          const stillAssigned = await deps.assignments.listOrderIdsByUserInCompany(actor.companyId, actor.id);
          if (!stillAssigned.includes(orderId)) throw error;
          order = reread;
          continue;
        }
      }
      const position = view.steps.length === 0 ? null : 1;
      const now = deps.now?.() ?? new Date();
      try {
        await deps.transaction.run(async ({ orders, log }) => {
          const outcome = await orders.transitionAliveById(
            orderId,
            actor.companyId,
            'PENDIENTE',
            'EN_CURSO',
            actor.id,
            now,
          );
          if (!isExecutionSuccess(outcome)) throw new ExecutionAbortedError(outcome);
          await log.append({
            action: 'start',
            companyId: actor.companyId,
            orderId,
            userId: actor.id,
            stepPosition: position,
            occurredAt: now,
          });
        });
        return { ...view, status: 'EN_CURSO', resumeStepPosition: position };
      } catch (error) {
        if (!(error instanceof ExecutionAbortedError)) throw error;
        if (error.outcome === 'not_found') throw new OrderNotFoundError();
        if (error.outcome !== 'stale') throw error;
        // Dos responsables entrando a la vez es un caso esperado: se relee y se sigue.
        order = await deps.orders.findAliveById(orderId, actor.companyId);
      }
    }
  };
}
