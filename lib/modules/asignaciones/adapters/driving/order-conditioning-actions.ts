'use server';

/**
 * Las Server Actions del detalle del acondicionador. No deciden nada: resuelven el actor,
 * traducen el `FormData` y traducen el error por su `code`.
 *
 * Se importa por su ruta exacta: un `'use server'` reexportado desde el barrel del modulo lo
 * volveria inimportable desde un componente de cliente.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { asignaciones, identity, observabilidad } from '@/lib/composition';
import { createErrorStateTranslator, type ErrorState } from '@/lib/modules/errores';
import {
  AsignacionesError,
  BatchExpiryNotFutureError,
  BatchProductionDateFutureError,
  ConditioningBatchDuplicateLotError,
  ConditioningBatchNotFoundError,
  type Actor,
} from '@/lib/modules/asignaciones';
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

export type SaveConditioningBatchDataResult = { status: 'idle' } | { status: 'success' } | (ErrorState & { batchId?: string });

function textValues(formData: FormData, key: string): string[] {
  return formData.getAll(key).map((value) => (typeof value === 'string' ? value : ''));
}

/** Las cuatro listas del formulario, emparejadas por posicion. Una linea con los tres datos vacios
 *  no se envia; una a medias viaja tal cual y la rechaza el caso de uso. */
function batchDataLines(formData: FormData) {
  const batchIds = textValues(formData, 'batchId');
  const lots = textValues(formData, 'lot');
  const expiryDates = textValues(formData, 'expiryDate');
  const productionDates = textValues(formData, 'productionDate');
  return batchIds
    .map((batchId, index) => ({
      batchId,
      lot: lots[index] ?? '',
      expiryDate: expiryDates[index] ?? '',
      productionDate: productionDates[index] ?? '',
    }))
    .filter((line) => line.lot.trim() !== '' || line.expiryDate !== '' || line.productionDate !== '');
}

function culpritBatchId(error: unknown): string | undefined {
  if (
    error instanceof BatchExpiryNotFutureError ||
    error instanceof BatchProductionDateFutureError ||
    error instanceof ConditioningBatchDuplicateLotError ||
    error instanceof ConditioningBatchNotFoundError
  ) {
    return error.batchId;
  }
  return undefined;
}

/** Guarda los datos de lote y se queda en el detalle. El error lleva la linea culpable cuando se
 *  sabe, para que el formulario la marque. */
export async function saveConditioningBatchDataAction(
  _prevState: SaveConditioningBatchDataResult,
  formData: FormData,
): Promise<SaveConditioningBatchDataResult> {
  const actor = await currentActor();
  const orderId = formData.get('orderId');

  try {
    await asignaciones.saveConditioningBatchData(actor, { orderId, lines: batchDataLines(formData) });
  } catch (error) {
    const state = await toErrorState(error);
    const batchId = culpritBatchId(error);
    return batchId === undefined ? state : { ...state, batchId };
  }

  if (typeof orderId === 'string') revalidatePath(conditioningOrderRoute(orderId));
  return { status: 'success' };
}
