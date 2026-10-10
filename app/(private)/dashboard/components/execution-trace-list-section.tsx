import { listExecutionTracesAction } from '@/lib/modules/asignaciones/adapters/driving/execution-trace-actions';

import {
  toExecutionTraceListInput,
  type ExecutionTraceListParams,
} from './execution-trace-list-params';
import { ExecutionTraceTable } from './execution-trace-table';

export const EXECUTION_TRACE_SECTION_TESTID = 'execution-trace-list-section';
export const EXECUTION_TRACE_SECTION_TITLE = 'Recorridos de ejecución';

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
        <ExecutionTraceTable
          status="error"
          error={result}
          rows={[]}
          personOptions={[]}
          params={params}
          totalPages={0}
        />
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
