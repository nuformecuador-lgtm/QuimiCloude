import type { OrderExecutionAction, Prisma, PrismaClient } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';

import type { ExecutionAction, NewExecutionEntry } from '../../../domain/execution-entry';
import type { ExecutionLogRepository } from '../../../ports/execution-log-repository';

type PrismaLike = PrismaClient | Prisma.TransactionClient;

export const EXECUTION_ACTION_TO_PRISMA = {
  start: 'START',
  resume: 'RESUME',
  advance: 'ADVANCE',
  go_back: 'GO_BACK',
  cancel: 'CANCEL',
  finish: 'FINISH',
  pack_start: 'PACK_START',
  pack_finish: 'PACK_FINISH',
} as const satisfies Record<ExecutionAction, OrderExecutionAction>;

/** Fabrica y no objeto ya construido: dentro de una transaccion tiene que escribir por su `tx`. */
export function createExecutionLogRepository(db: PrismaLike = prisma): ExecutionLogRepository {
  return {
    async append(entry: NewExecutionEntry): Promise<void> {
      await db.orderExecutionEntry.create({
        data: {
          companyId: entry.companyId,
          orderId: entry.orderId,
          userId: entry.userId,
          action: EXECUTION_ACTION_TO_PRISMA[entry.action],
          stepPosition: entry.stepPosition,
          reason: entry.action === 'cancel' ? entry.reason : null,
          // Explicito: la anotacion lleva el mismo instante que el resto de la operacion.
          occurredAt: entry.occurredAt,
        },
      });
    },

    async findLastStepPosition(companyId: string, orderId: string): Promise<number | null> {
      const row = await db.orderExecutionEntry.findFirst({
        where: { companyId, orderId, stepPosition: { not: null } },
        // `id` desempata dos anotaciones con el mismo instante.
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        select: { stepPosition: true },
      });
      return row?.stepPosition ?? null;
    },
  };
}
