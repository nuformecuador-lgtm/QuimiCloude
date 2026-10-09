'use client';

import { useRouter } from 'next/navigation';
import { useId, useMemo, useTransition } from 'react';

import {
  DataTable,
  type DataTableParams,
  type DataTableStates,
  type DataTableTexts,
} from '@/components/shared/data-table';
import { Checkbox } from '@/components/ui/checkbox';
import type { ExecutionTracePerson, ExecutionTraceRow } from '@/lib/modules/asignaciones';
import type { ErrorState } from '@/lib/modules/errores';
import { touchTarget } from '@/lib/shared/ui/touch-target';
import { cn } from '@/lib/utils';

import { buildExecutionTraceColumns } from './execution-trace-columns';
import {
  executionTraceListHref,
  fromDataTableParams,
  toDataTableParams,
  withFiltersResetPage,
  type ExecutionTraceListParams,
} from './execution-trace-list-params';

export const EXECUTION_TRACE_TABLE_ID = 'dashboard-recorridos';
export const CANCELLED_ONLY_LABEL = 'Solo cancelados';

export const EXECUTION_TRACE_TABLE_TEXTS: DataTableTexts = {
  empty: 'No hay pedidos ejecutados que mostrar.',
  loading: 'Cargando pedidos ejecutados…',
  error: 'No se pudo cargar la lista de pedidos ejecutados.',
  search: 'Buscar por número de pedido',
  filters: 'Filtros',
  columnMenu: 'opciones de la columna',
  previousPage: 'Página anterior',
  nextPage: 'Página siguiente',
  pageIndicator: (page, totalPages) => `Página ${page} de ${totalPages}`,
  pageSize: 'Pedidos por página',
  sortAscending: 'Orden ascendente',
  sortDescending: 'Orden descendente',
  pinColumn: 'Fijar columna',
  unpinColumn: 'Soltar columna',
  filterColumn: 'Filtrar columna',
  clearFilter: 'Limpiar filtro',
  lastWeek: 'Última semana',
  lastMonth: 'Último mes',
  lastYear: 'Último año',
};

const EXECUTION_TRACE_ERROR_TESTID = 'execution-trace-error';
const EXECUTION_TRACE_ERROR_MESSAGE_TESTID = 'execution-trace-error-message';

type ExecutionTraceTableStatusProps =
  | { readonly status?: 'idle'; readonly error?: undefined }
  | { readonly status: 'error'; readonly error: ErrorState };

export type ExecutionTraceTableProps = ExecutionTraceTableStatusProps & {
  readonly rows: readonly ExecutionTraceRow[];
  readonly personOptions: readonly ExecutionTracePerson[];
  readonly params: ExecutionTraceListParams;
  readonly totalPages: number;
};

function buildStates(error: ErrorState | undefined): DataTableStates | undefined {
  if (error === undefined) {
    return undefined;
  }
  return {
    error: {
      error,
      title: EXECUTION_TRACE_TABLE_TEXTS.error,
      testId: EXECUTION_TRACE_ERROR_TESTID,
      messageTestId: EXECUTION_TRACE_ERROR_MESSAGE_TESTID,
      withCode: false,
      className: 'flex flex-col items-start gap-2 rounded-lg border border-destructive/40 p-4',
    },
  };
}

/** Con error devuelve solo la tabla, que pinta el estado sin el envoltorio de la lista. */
export function ExecutionTraceTable({
  rows,
  personOptions,
  params,
  totalPages,
  status = 'idle',
  error,
}: ExecutionTraceTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const cancelledLabelId = useId();
  const columns = useMemo(
    () => buildExecutionTraceColumns({ personOptions, params }),
    [personOptions, params],
  );
  const tableParams = useMemo(() => toDataTableParams(params), [params]);

  const navigate = (next: ExecutionTraceListParams) => {
    startTransition(() => {
      router.push(executionTraceListHref(next));
    });
  };

  const cancelledToggle = (
    <div className="flex items-center gap-2">
      <Checkbox
        className={cn(touchTarget, 'shrink-0')}
        aria-labelledby={cancelledLabelId}
        checked={params.cancelledOnly}
        onCheckedChange={(checked: boolean) =>
          navigate(withFiltersResetPage(params, { ...params, cancelledOnly: checked }))
        }
        data-testid="execution-trace-cancelled-only"
      />
      <span id={cancelledLabelId} className="text-sm">
        {CANCELLED_ONLY_LABEL}
      </span>
    </div>
  );

  const states = buildStates(error);
  const onParamsChange = (next: DataTableParams) =>
    navigate(fromDataTableParams(params, next));

  if (status === 'error') {
    return (
      <DataTable
        tableId={EXECUTION_TRACE_TABLE_ID}
        columns={columns}
        rows={rows}
        getRowId={(row) => row.orderId}
        params={tableParams}
        totalPages={totalPages}
        onParamsChange={onParamsChange}
        status="error"
        texts={EXECUTION_TRACE_TABLE_TEXTS}
        states={states}
      />
    );
  }

  return (
    <div
      data-testid="execution-trace-table"
      aria-busy={isPending}
      className={isPending ? 'opacity-60 transition-opacity' : 'transition-opacity'}
    >
      {isPending ? (
        <p className="text-xs text-muted-foreground">{EXECUTION_TRACE_TABLE_TEXTS.loading}</p>
      ) : null}
      <DataTable
        tableId={EXECUTION_TRACE_TABLE_ID}
        columns={columns}
        rows={rows}
        getRowId={(row) => row.orderId}
        params={tableParams}
        totalPages={totalPages}
        onParamsChange={onParamsChange}
        status="idle"
        texts={EXECUTION_TRACE_TABLE_TEXTS}
        toolbarActions={cancelledToggle}
      />
    </div>
  );
}
