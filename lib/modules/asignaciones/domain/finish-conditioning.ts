// lib/modules/asignaciones/domain/finish-conditioning.ts
/**
 * Terminar el acondicionamiento: `EN_ACONDICIONAMIENTO -> TERMINADO`, con `finished_at`, solo si el
 * actor es quien acondiciona el pedido y todas las lineas del reparto tienen sus datos de lote. No
 * toca inventario.
 *
 * Devuelve el numero visible del pedido, leido ANTES de la transicion: una vez `TERMINADO`, el
 * filtro de estado con el que se leyo ya no lo encontraria.
 *
 * Los datos de lote se comprueban fuera de la transicion: no se pueden borrar y el reparto no se
 * edita en este estado, asi que una vez completos siguen completos.
 */
import { z } from 'zod';

import { requirePermission, type Actor } from './actor';
import { missingBatchDataLines } from './conditioning-batch-data';
import {
  ConditioningBatchDataMissingError,
  OrderConditioningTakenError,
  OrderNotConditionableError,
  OrderNotFoundError,
  ValidationError,
} from './errors';

import type { FinishedBatchLabels } from '@/lib/modules/inventario';
import { formatOrderNumber, type OrderAssignmentTarget, type OrderCatalog } from '@/lib/modules/pedidos';

const finishConditioningSchema = z.strictObject({
  orderId: z.string().uuid(),
});

export type FinishConditioningDeps = {
  readonly orders: OrderCatalog;
  readonly batches: Pick<FinishedBatchLabels, 'listOfOrder'>;
  readonly now?: () => Date;
};

export type FinishConditioningResult = {
  readonly numberText: string;
};

export function createFinishConditioning(
  deps: FinishConditioningDeps,
): (actor: Actor | null | undefined, input: unknown) => Promise<FinishConditioningResult> {
  return async function finishConditioning(
    actor: Actor | null | undefined,
    input: unknown,
  ): Promise<FinishConditioningResult> {
    // Autorizar va antes de validar la entrada y antes de tocar ningun puerto.
    requirePermission(actor, 'acondicionamiento.modificar');

    const parsed = finishConditioningSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const { orderId } = parsed.data;

    const target: OrderAssignmentTarget | null = await deps.orders.findAliveById(orderId, actor.companyId);
    if (target === null) throw new OrderNotFoundError();

    const summaryPage = await deps.orders.listAliveSummariesByIds(
      actor.companyId,
      [orderId],
      [target.status],
      1,
      1,
    );
    const summary = summaryPage.items[0];
    if (summary === undefined) throw new OrderNotFoundError();
    const numberText = formatOrderNumber(summary.number);

    // Quien no acondiciona el pedido recibe su error aunque falten datos: no le toca saberlo.
    if (target.status !== 'EN_ACONDICIONAMIENTO') throw new OrderNotConditionableError();
    if (summary.conditionedBy !== actor.id) throw new OrderConditioningTakenError();

    const batches = await deps.batches.listOfOrder(actor.companyId, orderId);
    if (missingBatchDataLines(summary.presentationLines, batches) > 0) throw new ConditioningBatchDataMissingError();

    const now = deps.now?.() ?? new Date();
    const result = await deps.orders.finishConditioningAliveById(orderId, actor.companyId, actor.id, now);
    if (result === 'ok') return { numberText };
    if (result === 'not_conditioner') throw new OrderConditioningTakenError();
    if (result === 'not_conditionable') throw new OrderNotConditionableError();
    throw new OrderNotFoundError();
  };
}
