// lib/modules/asignaciones/domain/finish-packing.ts
/**
 * Terminar: `EN_EMPAQUE -> POR_ACONDICIONAR`, sin `finished_at`, solo si el actor es quien tiene
 * el pedido en empaque. Sin comprobacion de asignacion:
 * cualquier actor con `empaque.modificar` puede terminar cualquier pedido vivo de su empresa, y
 * sin ningun puerto de inventario: los envases los consume `pedidos` dentro de Terminar.
 *
 * Devuelve el numero visible del pedido, leido ANTES de la transicion: una vez `POR_ACONDICIONAR`, el
 * filtro de estado con el que se leyo ya no lo encontraria (mismo motivo que
 * `finish-assigned-order.ts`).
 */
import { z } from 'zod';

import { requirePermission, type Actor } from './actor';
import {
  IncompatibleUnitsError,
  MaterialShortageError,
  OrderNotFoundError,
  OrderNotPackableError,
  OrderPackingTakenError,
  OrderWithoutUnitError,
  PresentationWithoutContentError,
  RecipeNotFoundError,
  ValidationError,
  type AsignacionesError,
} from './errors';
import { ExecutionAbortedError, isExecutionSuccess, type ExecutionWriteOutcome } from './execution-entry';

import type { ExecutionLogRepository } from '../ports/execution-log-repository';
import type { ExecutionTransaction } from '../ports/execution-transaction';
import { formatOrderNumber, type OrderAssignmentTarget, type OrderCatalog } from '@/lib/modules/pedidos';

const finishPackingSchema = z.strictObject({
  orderId: z.string().uuid(),
});

export type FinishPackingDeps = {
  readonly orders: OrderCatalog;
  readonly log: ExecutionLogRepository;
  readonly transaction: ExecutionTransaction;
  readonly now?: () => Date;
};

export type FinishPackingResult = {
  readonly numberText: string;
};

export function createFinishPacking(
  deps: FinishPackingDeps,
): (actor: Actor | null | undefined, input: unknown) => Promise<FinishPackingResult> {
  return async function finishPacking(
    actor: Actor | null | undefined,
    input: unknown,
  ): Promise<FinishPackingResult> {
    // Autorizar va antes de validar la entrada y antes de tocar ningun puerto.
    requirePermission(actor, 'empaque.modificar');

    const parsed = finishPackingSchema.safeParse(input);
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

    const now = deps.now?.() ?? new Date();
    try {
      await deps.transaction.run(async ({ packing, log }) => {
        // El exito de Terminar es un objeto con los lotes dados de alta, no el literal `'ok'`.
        const result = await packing.finishPackingAliveById(orderId, actor.companyId, actor.id, now);
        if (!isExecutionSuccess(result)) throw new ExecutionAbortedError(result);
        await log.append({
          companyId: actor.companyId,
          orderId,
          userId: actor.id,
          occurredAt: now,
          action: 'pack_finish',
          stepPosition: null,
        });
      });
    } catch (error) {
      if (error instanceof ExecutionAbortedError) throw finishPackingError(error.outcome);
      throw error;
    }
    return { numberText };
  };
}

function finishPackingError(outcome: ExecutionWriteOutcome): AsignacionesError {
  if (outcome === 'not_packer') return new OrderPackingTakenError();
  if (outcome === 'not_packable') return new OrderNotPackableError();
  if (outcome === 'recipe_not_found') return new RecipeNotFoundError();
  if (outcome === 'presentation_without_content') return new PresentationWithoutContentError();
  if (outcome === 'incompatible_units') return new IncompatibleUnitsError();
  if (outcome === 'order_without_unit') return new OrderWithoutUnitError();
  if (outcome === 'insufficient_material') return new MaterialShortageError();
  return new OrderNotFoundError();
}
