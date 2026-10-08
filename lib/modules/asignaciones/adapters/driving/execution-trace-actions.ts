'use server';

/**
 * Las dos lecturas del recorrido de ejecucion. Esta capa no decide nada: resuelve el actor, pone
 * el instante de la consulta y traduce el error por su `code`. Ningun permiso se comprueba aqui.
 *
 * No se reexporta desde el barril del modulo: un `'use server'` en su cierre de imports lo
 * volveria inimportable desde un componente de cliente.
 */

import { asignaciones, identity, observabilidad } from '@/lib/composition';
import { createErrorStateTranslator, type ErrorState } from '@/lib/modules/errores';
import {
  AsignacionesError,
  type Actor,
  type ExecutionTraceDetail,
  type ExecutionTraceList,
  type ExecutionTraceListInput,
} from '@/lib/modules/asignaciones';
import { runInRequestScope } from '@/lib/shared/request-scope';

const toErrorState = createErrorStateTranslator(
  AsignacionesError,
  observabilidad.readRequestIdHeader,
);

/** El actor, de las dos caras de la sesion, compartiendo una sola lectura por peticion. */
async function currentActor(): Promise<Actor | null> {
  const [sessionUser, sessionContext] = await runInRequestScope(() =>
    Promise.all([identity.getSessionUser(), identity.getSessionContext()]),
  );
  if (sessionUser === null || sessionContext === null) return null;
  return {
    id: sessionUser.id,
    companyId: sessionContext.companyId,
    permissions: sessionUser.permissions,
  };
}

export type ExecutionTraceListResult =
  | { status: 'success'; data: ExecutionTraceList }
  | ErrorState;

export async function listExecutionTracesAction(
  input: ExecutionTraceListInput,
): Promise<ExecutionTraceListResult> {
  const actor = await currentActor();

  try {
    const data = await asignaciones.listExecutionTraces(actor, input, new Date());
    return { status: 'success', data };
  } catch (error) {
    return toErrorState(error);
  }
}

export type ExecutionTraceResult = { status: 'success'; data: ExecutionTraceDetail } | ErrorState;

/** Un pedido inexistente, de otra empresa o sin anotaciones vuelve como `order_not_found`. */
export async function getExecutionTraceAction(orderId: string): Promise<ExecutionTraceResult> {
  const actor = await currentActor();

  try {
    const data = await asignaciones.getExecutionTrace(actor, { orderId }, new Date());
    return { status: 'success', data };
  } catch (error) {
    return toErrorState(error);
  }
}
