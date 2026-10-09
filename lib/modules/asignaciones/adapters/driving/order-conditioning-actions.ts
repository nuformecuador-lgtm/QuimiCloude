'use server';

/**
 * Las dos Server Actions del detalle del acondicionador. No deciden nada: resuelven el actor,
 * traducen el `FormData` y traducen el error por su `code`.
 *
 * Se importa por su ruta exacta: un `'use server'` reexportado desde el barrel del modulo lo
 * volveria inimportable desde un componente de cliente.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { asignaciones, identity, observabilidad } from '@/lib/composition';
import { createErrorStateTranslator, type ErrorState } from '@/lib/modules/errores';
import { AsignacionesError, type Actor } from '@/lib/modules/asignaciones';
import { ASSIGNED_ORDERS_ROUTE, CONDITIONED_ORDER_PARAM, conditioningOrderRoute } from '@/lib/shared/routes';
import { runInRequestScope } from '@/lib/shared/request-scope';

const toErrorState = createErrorStateTranslator(
  AsignacionesError,
  observabilidad.readRequestIdHeader,
);

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

export type StartConditioningResult = { status: 'success' } | ErrorState;

/** Comienza con el equipo marcado y se queda en el detalle, que ya ofrece «Terminar». */
export async function startConditioningAction(
  _prevState: StartConditioningResult,
  formData: FormData,
): Promise<StartConditioningResult> {
  const actor = await currentActor();

  try {
    await asignaciones.startConditioning(actor, {
      orderId: formData.get('orderId'),
      userIds: formData.getAll('userIds'),
      workGroupIds: formData.getAll('workGroupIds'),
    });
  } catch (error) {
    return toErrorState(error);
  }

  const orderId = formData.get('orderId');
  if (typeof orderId === 'string') revalidatePath(conditioningOrderRoute(orderId));
  return { status: 'success' };
}

export type FinishConditioningResult = { status: 'success' } | ErrorState;

/** Deja el pedido `TERMINADO` y vuelve a «Por acondicionar» con el aviso. */
export async function finishConditioningAction(
  _prevState: FinishConditioningResult,
  formData: FormData,
): Promise<FinishConditioningResult> {
  const actor = await currentActor();

  let numberText: string;
  try {
    ({ numberText } = await asignaciones.finishConditioning(actor, { orderId: formData.get('orderId') }));
  } catch (error) {
    return toErrorState(error);
  }

  revalidatePath(ASSIGNED_ORDERS_ROUTE);
  const query = new URLSearchParams({ vista: 'por_acondicionar', [CONDITIONED_ORDER_PARAM]: numberText });
  redirect(`${ASSIGNED_ORDERS_ROUTE}?${query.toString()}`);
}
