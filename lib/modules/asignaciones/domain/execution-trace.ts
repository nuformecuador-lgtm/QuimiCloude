import type { OrderStatus } from '@/lib/modules/pedidos';

import type { ExecutionAction, ExecutionEntryRecord } from './execution-entry';

/**
 * Los estados sin ninguna transicion de salida en la tabla de `pedidos`
 * (`order-transitions.ts`). Esa tabla no es publica, por eso se repiten aqui.
 */
export const FINAL_STATUSES: readonly OrderStatus[] = ['ENTREGADO', 'CANCELADO'];

const CLOSING_ACTIONS: readonly ExecutionAction[] = ['cancel', 'pack_finish'];

export type TraceDuration =
  | { readonly kind: 'closed'; readonly ms: number }
  | { readonly kind: 'open'; readonly ms: number }
  | { readonly kind: 'unclosed'; readonly ms: number };

export type TraceStep = ExecutionEntryRecord & {
  readonly gapToNextMs: number | null;
  readonly isGoBack: boolean;
};

export type ExecutionTrace = {
  readonly steps: readonly TraceStep[];
  readonly firstAt: Date;
  readonly lastAt: Date;
  readonly duration: TraceDuration;
  readonly goBackCount: number;
  readonly userIds: readonly string[];
};

export type TraceOrderState = { readonly status: OrderStatus; readonly deleted: boolean };

/**
 * Recorrido de UN pedido a partir de sus anotaciones ya ordenadas (al menos una). La duracion es de
 * reloj, de la primera a la ultima anotacion: pausas y huecos quedan dentro. `now` entra por
 * parametro porque el dominio no tiene reloj.
 */
export function buildExecutionTrace(
  entries: readonly ExecutionEntryRecord[],
  order: TraceOrderState,
  now: Date,
): ExecutionTrace {
  const first = entries[0];
  const last = entries[entries.length - 1];
  if (first === undefined || last === undefined) {
    throw new Error('buildExecutionTrace necesita al menos una anotacion');
  }

  const steps: TraceStep[] = entries.map((entry, index) => {
    const next = entries[index + 1];
    return {
      ...entry,
      gapToNextMs: next === undefined ? null : next.occurredAt.getTime() - entry.occurredAt.getTime(),
      isGoBack: entry.action === 'go_back',
    };
  });

  const firstAt = first.occurredAt;
  const lastAt = last.occurredAt;
  const active = !order.deleted && !FINAL_STATUSES.includes(order.status);

  let duration: TraceDuration;
  if (active) {
    duration = { kind: 'open', ms: now.getTime() - firstAt.getTime() };
  } else {
    const ms = lastAt.getTime() - firstAt.getTime();
    duration = CLOSING_ACTIONS.includes(last.action) ? { kind: 'closed', ms } : { kind: 'unclosed', ms };
  }

  const userIds: string[] = [];
  for (const entry of entries) {
    if (!userIds.includes(entry.userId)) userIds.push(entry.userId);
  }

  return {
    steps,
    firstAt,
    lastAt,
    duration,
    goBackCount: steps.filter((step) => step.isGoBack).length,
    userIds,
  };
}
