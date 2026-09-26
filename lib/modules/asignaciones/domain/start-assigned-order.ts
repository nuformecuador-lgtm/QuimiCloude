// lib/modules/asignaciones/domain/start-assigned-order.ts
import { z } from 'zod';

import { requirePermission, type Actor } from './actor';
import { OrderNotFoundError, ValidationError } from './errors';
import { createGetAssignedOrderExecution, type GetAssignedOrderExecutionDeps } from './get-assigned-order-execution';
import { assertOrderAcceptsWrites } from './order-state';

import type { AssignedOrderExecutionView } from './assigned-order-execution-view';

import type { OrderAssignmentTarget } from '@/lib/modules/pedidos';

const startAssignedOrderSchema = z.strictObject({
  orderId: z.string().uuid(),
});

export type StartAssignedOrderDeps = GetAssignedOrderExecutionDeps & {
  readonly now?: () => Date;
};

/**
 * `PENDIENTE` transiciona a `EN_CURSO`; `EN_CURSO` no escribe nada y sigue; cualquier otro estado
 * -`POR_EMPACAR`, `EN_EMPAQUE`, `ENTREGADO`, `CANCELADO`- rechaza con el error de `order-state.ts`.
 * La legalidad de la escritura la decide `pedidos` dentro de `transitionAliveById`, nunca esta
 * funcion.
 */
export function createStartAssignedOrder(
  deps: StartAssignedOrderDeps,
): (actor: Actor | null | undefined, input: unknown) => Promise<AssignedOrderExecutionView> {
  const getAssignedOrderExecution = createGetAssignedOrderExecution(deps);

  return async function startAssignedOrder(
    actor: Actor | null | undefined,
    input: unknown,
  ): Promise<AssignedOrderExecutionView> {
    requirePermission(actor, 'asignaciones.consultar');

    const parsed = startAssignedOrderSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const { orderId } = parsed.data;

    const ids = await deps.assignments.listOrderIdsByUserInCompany(actor.companyId, actor.id);
    if (!ids.includes(orderId)) throw new OrderNotFoundError();

    let order: OrderAssignmentTarget | null = await deps.orders.findAliveById(
      orderId,
      actor.companyId,
    );
    if (order === null) throw new OrderNotFoundError();

    if (order.status === 'PENDIENTE') {
      const now = deps.now?.() ?? new Date();
      while (order !== null && order.status === 'PENDIENTE') {
        const result = await deps.orders.transitionAliveById(
          orderId,
          actor.companyId,
          'PENDIENTE',
          'EN_CURSO',
          actor.id,
          now,
        );
        if (result === 'ok') break;
        if (result === 'not_found') throw new OrderNotFoundError();
        // El resto solo puede ser 'stale': `insufficient_material` y `recipe_without_lines`
        // vienen del consumo que `transitionAliveById` hace hacia `ENTREGADO`, y este destino
        // es siempre `EN_CURSO`. Alguien movio el pedido entre la lectura y esta llamada; se
        // relee y se sigue -dos responsables entrando a la vez es un caso esperado, no un error
        // visible-.
        order = await deps.orders.findAliveById(orderId, actor.companyId);
        if (order === null) throw new OrderNotFoundError();
      }
    }
    if (order === null) throw new OrderNotFoundError();

    if (order.status !== 'EN_CURSO') {
      assertOrderAcceptsWrites(order);
    }

    return getAssignedOrderExecution(actor, { orderId });
  };
}
