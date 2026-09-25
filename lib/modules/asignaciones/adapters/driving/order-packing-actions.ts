'use server';

/**
 * Las DOS Server Actions de la pantalla del pedido de empaque. Esta capa NO DECIDE NADA: resuelve
 * el actor de las dos caras de la sesion, traduce el `FormData` y traduce el error por su `code`,
 * calcada de `order-execution-actions.ts`.
 *
 * Archivo nuevo, importado por su RUTA EXACTA: no se reexporta desde el barrel del modulo porque
 * un `'use server'` en su cierre de imports lo volveria inimportable desde un componente de
 * cliente.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { asignaciones, identity, observabilidad } from '@/lib/composition';
import { createErrorStateTranslator, type ErrorState } from '@/lib/modules/errores';
import { AsignacionesError, type Actor } from '@/lib/modules/asignaciones';
import { ASSIGNED_ORDERS_ROUTE, PACKED_ORDER_PARAM, packingOrderRoute } from '@/lib/shared/routes';
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

function orderIdFromFormData(formData: FormData): unknown {
  return { orderId: formData.get('orderId') };
}

export type StartPackingResult = { status: 'success' } | ErrorState;

/** Comienza el empaque —`POR_EMPACAR` a `EN_EMPAQUE`— y vuelve a la MISMA pantalla del pedido. */
export async function startPackingAction(
  _prevState: StartPackingResult,
  formData: FormData,
): Promise<StartPackingResult> {
  const actor = await currentActor();

  try {
    await asignaciones.startPacking(actor, orderIdFromFormData(formData));
  } catch (error) {
    return toErrorState(error);
  }

  const orderId = formData.get('orderId');
  if (typeof orderId === 'string') revalidatePath(packingOrderRoute(orderId));
  return { status: 'success' };
}

export type FinishPackingResult = { status: 'success' } | ErrorState;

/** Deja el pedido `ENTREGADO` y vuelve a la pestaña «Por empacar» con la confirmacion. */
export async function finishPackingAction(
  _prevState: FinishPackingResult,
  formData: FormData,
): Promise<FinishPackingResult> {
  const actor = await currentActor();

  let numberText: string;
  try {
    ({ numberText } = await asignaciones.finishPacking(actor, orderIdFromFormData(formData)));
  } catch (error) {
    return toErrorState(error);
  }

  revalidatePath(ASSIGNED_ORDERS_ROUTE);
  const query = new URLSearchParams({ vista: 'por_empacar', [PACKED_ORDER_PARAM]: numberText });
  redirect(`${ASSIGNED_ORDERS_ROUTE}?${query.toString()}`);
}
