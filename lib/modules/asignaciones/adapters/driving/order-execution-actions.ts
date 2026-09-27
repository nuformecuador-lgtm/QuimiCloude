'use server';

/**
 * Las DOS Server Actions de la pantalla de ejecucion. Esta capa NO DECIDE NADA: resuelve el
 * actor de las dos caras de la sesion, traduce la entrada y traduce el error por su `code`,
 * calcada de `order-assignment-actions.ts`.
 *
 * Archivo nuevo, importado por su RUTA EXACTA: no se reexporta desde el barrel del modulo
 * porque un `'use server'` en su cierre de imports lo volveria inimportable desde un
 * componente de cliente.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { asignaciones, identity, observabilidad } from '@/lib/composition';
import { createErrorStateTranslator, type ErrorState } from '@/lib/modules/errores';
import { AsignacionesError, type Actor, type AssignedOrderExecutionView } from '@/lib/modules/asignaciones';
import { ASSIGNED_ORDERS_ROUTE, DELIVERED_ORDER_PARAM } from '@/lib/shared/routes';
import { runInRequestScope } from '@/lib/shared/request-scope';

const toErrorState = createErrorStateTranslator(
  AsignacionesError,
  observabilidad.readRequestIdHeader,
);

/** El actor, de las DOS caras de la sesion, compartiendo UNA sola lectura por peticion. */
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

export type StartAssignedOrderResult =
  | { status: 'success'; data: AssignedOrderExecutionView }
  | ErrorState;

/** Lee la ejecucion del pedido y lo abre —`PENDIENTE` a `EN_CURSO`— en una sola llamada. */
export async function startAssignedOrderAction(orderId: string): Promise<StartAssignedOrderResult> {
  const actor = await currentActor();

  try {
    const data = await asignaciones.startAssignedOrder(actor, { orderId });
    return { status: 'success', data };
  } catch (error) {
    return toErrorState(error);
  }
}

export type FinishAssignedOrderResult = { status: 'success' } | ErrorState;

function finishFromFormData(formData: FormData): unknown {
  return { orderId: formData.get('orderId') };
}

/**
 * Deja el pedido `POR_EMPACAR` y vuelve a la lista de pedidos asignados.
 *
 * R15, R16: Finalizar ya no da de alta ningun lote, asi que la confirmacion ya no
 * lleva envases ni producto -esa notificacion pasa a Terminar el empaque-.
 */
export async function finishAssignedOrderAction(
  _prevState: FinishAssignedOrderResult,
  formData: FormData,
): Promise<FinishAssignedOrderResult> {
  const actor = await currentActor();

  let numberText: string;
  try {
    ({ numberText } = await asignaciones.finishAssignedOrder(actor, finishFromFormData(formData)));
  } catch (error) {
    return toErrorState(error);
  }

  revalidatePath(ASSIGNED_ORDERS_ROUTE);
  const query = new URLSearchParams({ [DELIVERED_ORDER_PARAM]: numberText });
  redirect(`${ASSIGNED_ORDERS_ROUTE}?${query.toString()}`);
}
