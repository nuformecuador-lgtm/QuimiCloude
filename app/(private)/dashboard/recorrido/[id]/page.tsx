import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import {
  executionTraceListHref,
  parseExecutionTraceListParams,
  type ExecutionTraceListSearchParams,
} from '@/app/(private)/dashboard/components';
import { getExecutionTraceAction } from '@/lib/modules/asignaciones/adapters/driving/execution-trace-actions';
import { requirePagePermission } from '@/lib/modules/identity/adapters/driving/require-page-permission';
import { BRAND_LABEL } from '@/lib/shared/navigation/private-nav';

import { ExecutionTraceDetail, ExecutionTraceDetailError } from './components';

export const metadata: Metadata = {
  title: `Recorrido de ejecución · ${BRAND_LABEL}`,
};

/**
 * La direccion sale de `executionTraceRoute`. La consulta de la URL no cambia el recorrido: solo
 * guarda la lista de la que se vino, para que «volver» la recupere.
 */
export default async function ExecutionTracePage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<ExecutionTraceListSearchParams>;
}) {
  await requirePagePermission('dashboard.consultar');

  const [{ id }, query] = await Promise.all([params, searchParams]);
  const backHref = executionTraceListHref(parseExecutionTraceListParams(query));
  const result = await getExecutionTraceAction(id);

  if (result.status === 'error') {
    if (result.code === 'order_not_found') notFound();
    return <ExecutionTraceDetailError error={result} backHref={backHref} />;
  }

  return <ExecutionTraceDetail trace={result.data} backHref={backHref} />;
}
