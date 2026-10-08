// lib/modules/asignaciones/domain/start-packing.ts
/**
 * Comenzar: `POR_EMPACAR -> EN_EMPAQUE` con el actor como quien empaca. Sin comprobacion de
 * asignacion: cualquier actor con `empaque.modificar` puede tomar cualquier pedido vivo de su
 * empresa que este `POR_EMPACAR`.
 *
 * No consume, aparta ni libera material, ni da de alta ningun lote, ni escribe ningun asiento de
 * inventario: escribe la transicion y su anotacion en el registro, en la misma transaccion.
 */
import { z } from 'zod';

import { requirePermission, type Actor } from './actor';
import {
  OrderNotFoundError,
  OrderNotPackableError,
  OrderPackingTakenError,
  OrderWithoutDistributionError,
  ValidationError,
  type AsignacionesError,
} from './errors';
import { ExecutionAbortedError, isExecutionSuccess, type ExecutionWriteOutcome } from './execution-entry';

import type { ExecutionLogRepository } from '../ports/execution-log-repository';
import type { ExecutionTransaction } from '../ports/execution-transaction';
import type { OrderCatalog } from '@/lib/modules/pedidos';

const startPackingSchema = z.strictObject({
  orderId: z.string().uuid(),
});

export type StartPackingDeps = {
  readonly orders: OrderCatalog;
  readonly log: ExecutionLogRepository;
  readonly transaction: ExecutionTransaction;
  readonly now?: () => Date;
};

function startPackingError(outcome: ExecutionWriteOutcome): AsignacionesError {
  if (outcome === 'taken') return new OrderPackingTakenError();
  if (outcome === 'without_distribution') return new OrderWithoutDistributionError();
  if (outcome === 'not_packable') return new OrderNotPackableError();
  return new OrderNotFoundError();
}

export function createStartPacking(
  deps: StartPackingDeps,
): (actor: Actor | null | undefined, input: unknown) => Promise<void> {
  return async function startPacking(actor: Actor | null | undefined, input: unknown): Promise<void> {
    // Autorizar va antes de validar la entrada y antes de tocar ningun puerto.
    requirePermission(actor, 'empaque.modificar');

    const parsed = startPackingSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const { orderId } = parsed.data;

    const now = deps.now?.() ?? new Date();
    try {
      await deps.transaction.run(async ({ packing, log }) => {
        const result = await packing.startPackingAliveById(orderId, actor.companyId, actor.id, now);
        // Repetir Comenzar sobre el propio `EN_EMPAQUE` es exito: no escribio nada, asi que no se anota.
        if (result === 'already_mine') return;
        if (!isExecutionSuccess(result)) throw new ExecutionAbortedError(result);
        await log.append({
          companyId: actor.companyId,
          orderId,
          userId: actor.id,
          occurredAt: now,
          action: 'pack_start',
          stepPosition: null,
        });
      });
    } catch (error) {
      if (error instanceof ExecutionAbortedError) throw startPackingError(error.outcome);
      throw error;
    }
  };
}
