import type { OrderExecutionAction, Prisma, PrismaClient } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';

import type { ExecutionAction, ExecutionEntryRecord, NewExecutionEntry } from '../../../domain/execution-entry';
import type { ExecutedOrdersFilter, ExecutionLogRepository } from '../../../ports/execution-log-repository';

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

function invertActionMap(): Readonly<Record<OrderExecutionAction, ExecutionAction>> {
  const inverse: Partial<Record<OrderExecutionAction, ExecutionAction>> = {};
  for (const [action, value] of Object.entries(EXECUTION_ACTION_TO_PRISMA) as [
    ExecutionAction,
    OrderExecutionAction,
  ][]) {
    inverse[value] = action;
  }
  return inverse as Record<OrderExecutionAction, ExecutionAction>;
}

export const EXECUTION_ACTION_FROM_PRISMA = invertActionMap();

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

    async listExecutedOrderIds(companyId: string, filter: ExecutedOrdersFilter): Promise<readonly string[]> {
      const occurredAt: Prisma.DateTimeFilter = {};
      if (filter.occurredFrom !== undefined) occurredAt.gte = filter.occurredFrom;
      if (filter.occurredBefore !== undefined) occurredAt.lt = filter.occurredBefore;
      const where: Prisma.OrderExecutionEntryWhereInput = { companyId };
      if (filter.userId !== undefined) where.userId = filter.userId;
      if (Object.keys(occurredAt).length > 0) where.occurredAt = occurredAt;

      const rows = await db.orderExecutionEntry.groupBy({ by: ['orderId'], where });
      return rows.map((row) => row.orderId);
    },

    async listEntriesForOrders(
      companyId: string,
      orderIds: readonly string[],
    ): Promise<readonly ExecutionEntryRecord[]> {
      const rows = await db.orderExecutionEntry.findMany({
        where: { companyId, orderId: { in: [...orderIds] } },
        orderBy: [{ orderId: 'asc' }, { occurredAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          orderId: true,
          userId: true,
          action: true,
          stepPosition: true,
          reason: true,
          occurredAt: true,
        },
      });
      return rows.map((row) => ({ ...row, action: EXECUTION_ACTION_FROM_PRISMA[row.action] }));
    },

    async listUserIdsWithEntries(companyId: string): Promise<readonly string[]> {
      const rows = await db.orderExecutionEntry.groupBy({ by: ['userId'], where: { companyId } });
      return rows.map((row) => row.userId);
    },
  };
}
