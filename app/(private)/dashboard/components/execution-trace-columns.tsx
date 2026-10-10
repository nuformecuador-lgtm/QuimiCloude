'use client';

import Link from 'next/link';

import type { DataTableColumn } from '@/components/shared/data-table';
import { ResponsibleAvatars } from '@/components/shared/responsible-avatars';
import type { ExecutionTracePerson, ExecutionTraceRow } from '@/lib/modules/asignaciones';
import { touchTarget } from '@/lib/shared/ui/touch-target';

import {
  ACTIVE_ORDER_MARK,
  DELETED_ORDER_MARK,
  TRACE_ORDER_STATUS_LABELS,
  formatTraceDuration,
  formatTraceInstant,
} from './execution-trace-format';
import {
  LAST_AT_COLUMN_ID,
  PERSON_COLUMN_ID,
  executionTraceDetailHref,
  type ExecutionTraceListParams,
} from './execution-trace-list-params';

export const TRACE_NUMBER_COLUMN_ID = 'orderNumber';
export const TRACE_STATUS_COLUMN_ID = 'status';
export const TRACE_FIRST_AT_COLUMN_ID = 'firstAt';
export const TRACE_DURATION_COLUMN_ID = 'duration';
export const TRACE_GO_BACK_COLUMN_ID = 'goBackCount';
export const TRACE_LINK_COLUMN_ID = 'trace';

export const TRACE_LINK_TEXT = 'Ver recorrido';

export function DeletedOrderMark() {
  return (
    <span
      data-testid="execution-trace-deleted"
      className="rounded-md border px-1.5 py-0.5 text-xs font-medium text-muted-foreground"
    >
      {DELETED_ORDER_MARK}
    </span>
  );
}

/** Marca de actividad: solo la lleva un pedido cuya duracion sigue abierta, nunca uno dado de baja. */
export function ActiveOrderMark() {
  return (
    <span
      data-testid="execution-trace-active"
      className="rounded-md border border-primary/40 px-1.5 py-0.5 text-xs font-medium"
    >
      {ACTIVE_ORDER_MARK}
    </span>
  );
}

export type ExecutionTraceColumnsDeps = {
  readonly personOptions: readonly ExecutionTracePerson[];
  readonly params: ExecutionTraceListParams;
};

export function buildExecutionTraceColumns({
  personOptions,
  params,
}: ExecutionTraceColumnsDeps): readonly DataTableColumn<ExecutionTraceRow>[] {
  return [
    {
      id: TRACE_NUMBER_COLUMN_ID,
      label: 'Nº de pedido',
      align: 'start',
      defaultPinned: 'left',
      cell: (row) => (
        <span className="flex items-center gap-2">
          <span data-testid="execution-trace-number">{row.numberText}</span>
          {row.deleted ? <DeletedOrderMark /> : null}
          {row.duration.kind === 'open' ? <ActiveOrderMark /> : null}
        </span>
      ),
    },
    {
      id: TRACE_STATUS_COLUMN_ID,
      label: 'Estado',
      align: 'start',
      cell: (row) => (
        <span data-testid="execution-trace-status" data-status={row.status}>
          {TRACE_ORDER_STATUS_LABELS[row.status]}
        </span>
      ),
    },
    {
      id: PERSON_COLUMN_ID,
      label: 'Personas',
      align: 'start',
      filter: {
        kind: 'select',
        options: personOptions.map((person) => ({ value: person.userId, label: person.displayName })),
      },
      cell: (row) => <ResponsibleAvatars responsibles={row.people} />,
    },
    {
      id: TRACE_FIRST_AT_COLUMN_ID,
      label: 'Primera anotación',
      tabular: true,
      align: 'start',
      cell: (row) => formatTraceInstant(row.firstAt),
    },
    {
      id: LAST_AT_COLUMN_ID,
      label: 'Última anotación',
      tabular: true,
      align: 'start',
      filter: { kind: 'dateRange' },
      cell: (row) => formatTraceInstant(row.lastAt),
    },
    {
      id: TRACE_DURATION_COLUMN_ID,
      label: 'Duración',
      align: 'end',
      cell: (row) => (
        <span data-testid="execution-trace-duration" data-kind={row.duration.kind}>
          {formatTraceDuration(row.duration)}
        </span>
      ),
    },
    {
      id: TRACE_GO_BACK_COLUMN_ID,
      label: 'Vueltas atrás',
      align: 'end',
      cell: (row) => <span data-testid="execution-trace-go-backs">{row.goBackCount}</span>,
    },
    {
      id: TRACE_LINK_COLUMN_ID,
      label: 'Recorrido',
      align: 'start',
      cell: (row) => (
        <Link
          href={executionTraceDetailHref(row.orderId, params)}
          data-testid="execution-trace-link"
          className={`inline-flex ${touchTarget} items-center rounded-md px-2 text-sm font-medium underline underline-offset-4 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none`}
        >
          {TRACE_LINK_TEXT}
          <span className="sr-only"> del pedido {row.numberText}</span>
        </Link>
      ),
    },
  ];
}
