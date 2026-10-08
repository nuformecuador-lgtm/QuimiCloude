import { UnexpectedErrorNotice } from '@/components/shared/unexpected-error-notice';
import { listExecutionTracesAction } from '@/lib/modules/asignaciones/adapters/driving/execution-trace-actions';
import { UNEXPECTED_ERROR_CODE, type ErrorState } from '@/lib/modules/errores';

import {
  toExecutionTraceListInput,
  type ExecutionTraceListParams,
} from './execution-trace-list-params';
import { ExecutionTraceTable } from './execution-trace-table';

export const EXECUTION_TRACE_SECTION_TESTID = 'execution-trace-list-section';
export const EXECUTION_TRACE_SECTION_TITLE = 'Recorridos de ejecución';

function ExecutionTraceListError({ error }: { readonly error: ErrorState }) {
  return (
    <div
      role="alert"
      data-testid="execution-trace-error"
      className="flex flex-col items-start gap-2 rounded-lg border border-destructive/40 p-4"
    >
      <p className="text-sm font-medium">No se pudo cargar la lista de pedidos ejecutados.</p>
      {error.code === UNEXPECTED_ERROR_CODE ? (
        <UnexpectedErrorNotice state={error} />
      ) : (
        <p className="text-sm text-muted-foreground" data-testid="execution-trace-error-message">
          {error.message}
        </p>
      )}
    </div>
  );
}

/** El fallo se queda dentro del area: el resto del dashboard sigue en pie. */
export async function ExecutionTraceListSection({
  params,
}: {
  readonly params: ExecutionTraceListParams;
}) {
  const result = await listExecutionTracesAction(toExecutionTraceListInput(params));

  return (
    <div data-testid={EXECUTION_TRACE_SECTION_TESTID} className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{EXECUTION_TRACE_SECTION_TITLE}</h2>
      {result.status === 'error' ? (
        <ExecutionTraceListError error={result} />
      ) : (
        <ExecutionTraceTable
          rows={result.data.page.items}
          personOptions={result.data.personOptions}
          params={params}
          totalPages={result.data.page.totalPages}
        />
      )}
    </div>
  );
}
