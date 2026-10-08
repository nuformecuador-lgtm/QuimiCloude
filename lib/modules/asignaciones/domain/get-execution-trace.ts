import { z } from 'zod';

import { requirePermission, type Actor } from './actor';
import { OrderNotFoundError } from './errors';
import { buildExecutionTrace, type TraceDuration, type TraceStep } from './execution-trace';
import { findPeopleByIds, type ListExecutionTracesDeps } from './list-execution-traces';

import { formatOrderNumber, ORDER_STATUS_VALUES, type OrderStatus } from '@/lib/modules/pedidos';

const getExecutionTraceSchema = z.strictObject({ orderId: z.string().uuid() });

export type ExecutionTraceDetailStep = TraceStep & {
  /** `null` si el directorio ya no devuelve a esa persona. */
  readonly userDisplayName: string | null;
};

export type ExecutionTraceDetail = {
  readonly orderId: string;
  readonly numberText: string;
  readonly status: OrderStatus;
  readonly deleted: boolean;
  readonly steps: readonly ExecutionTraceDetailStep[];
  readonly firstAt: Date;
  readonly lastAt: Date;
  readonly duration: TraceDuration;
  readonly goBackCount: number;
};

export type GetExecutionTraceDeps = ListExecutionTracesDeps;

export function createGetExecutionTrace(
  deps: GetExecutionTraceDeps,
): (actor: Actor | null | undefined, input: unknown, now: Date) => Promise<ExecutionTraceDetail> {
  return async function getExecutionTrace(
    actor: Actor | null | undefined,
    input: unknown,
    now: Date,
  ): Promise<ExecutionTraceDetail> {
    // Autorizar va antes de validar la entrada y antes de tocar ningun puerto.
    requirePermission(actor, 'dashboard.consultar');

    // Un id mal formado, uno que no existe, uno de otra empresa y uno sin anotaciones dan el mismo
    // error: la pantalla no puede distinguirlos.
    const parsed = getExecutionTraceSchema.safeParse(input);
    if (!parsed.success) throw new OrderNotFoundError();
    const { orderId } = parsed.data;
    const companyId = actor.companyId;

    const summaries = await deps.orders.listSummariesByIdsIncludingDeleted(
      companyId,
      [orderId],
      ORDER_STATUS_VALUES,
      1,
      1,
    );
    const order = summaries.items.find((item) => item.id === orderId);
    if (order === undefined) throw new OrderNotFoundError();

    const entries = await deps.log.listEntriesForOrders(companyId, [orderId]);
    if (entries.length === 0) throw new OrderNotFoundError();

    const trace = buildExecutionTrace(entries, order, now);
    const refs = await findPeopleByIds(deps.people, companyId, trace.userIds, now);

    return {
      orderId: order.id,
      numberText: formatOrderNumber(order.number),
      status: order.status,
      deleted: order.deleted,
      steps: trace.steps.map((step) => ({
        ...step,
        userDisplayName: refs.get(step.userId)?.displayName ?? null,
      })),
      firstAt: trace.firstAt,
      lastAt: trace.lastAt,
      duration: trace.duration,
      goBackCount: trace.goBackCount,
    };
  };
}
