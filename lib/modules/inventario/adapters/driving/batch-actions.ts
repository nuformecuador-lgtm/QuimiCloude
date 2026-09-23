'use server';

import { identity, inventario, observabilidad } from '@/lib/composition';
import { createErrorStateTranslator, type ErrorCode, type ErrorState } from '@/lib/modules/errores';
import {
  InventarioError,
  type Actor,
  type InventoryMovementView,
  type ProductBatchView,
} from '@/lib/modules/inventario';
import { runInRequestScope } from '@/lib/shared/request-scope';

// Aqui no se repite `requirePermission`: es la primera linea de cada caso de uso.

export type AdjustBatchStockFormState =
  | { status: 'idle' }
  | { status: 'success'; stock: string }
  | ErrorState;

export type ProductBatchesResult =
  | { status: 'success'; data: readonly ProductBatchView[] }
  | ErrorState;

export type BatchMovementsResult =
  | { status: 'success'; data: readonly InventoryMovementView[] }
  | ErrorState;

// Sin constante `INITIAL_STATE`: un archivo con `'use server'` solo puede exportar funciones async.

const NUMERIC_FIELD_ERROR = 'La cantidad del ajuste no es un numero decimal valido.';

const INVALID_INPUT_CODE = 'invalid_input' satisfies ErrorCode;

/** Distinto de `undefined`, que significa campo ausente y lo rechaza el esquema del caso de uso. */
const INVALID_NUMBER = Symbol('invalid-number');

function readOptionalFormString(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  return value;
}

/**
 * El signo se conserva: el ajuste que resta llega negativo. El patron va antes de pasar el
 * valor al caso de uso, porque sin el `'1e3'` pasaria como decimal valido.
 */
function readOptionalFormDecimal(
  formData: FormData,
  name: string,
): string | undefined | typeof INVALID_NUMBER {
  const value = formData.get(name);
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const trimmed = value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return INVALID_NUMBER;
  return trimmed;
}

const toErrorState = createErrorStateTranslator(InventarioError, observabilidad.readRequestIdHeader);

/**
 * La empresa sale de la sesion del servidor y nunca de la entrada: si viajara en el `FormData`,
 * quien invoca la action podria elegirla. Si falta el usuario o el contexto, el actor es `null` y
 * el caso de uso rechaza antes de tocar el repositorio.
 */
async function currentActor(): Promise<Actor | null> {
  // El ambito envuelve EXACTAMENTE este `Promise.all`, para que las dos caras compartan UNA sola
  // lectura de la ficha de sesion en esta invocacion.
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

/** El candidato viaja tal cual: su forma la valida zod dentro del caso de uso, no esta action. */
export async function adjustBatchStockAction(
  prevState: AdjustBatchStockFormState,
  formData: FormData,
): Promise<AdjustBatchStockFormState> {
  void prevState;

  const delta = readOptionalFormDecimal(formData, 'delta');
  if (delta === INVALID_NUMBER) {
    return { status: 'error', code: INVALID_INPUT_CODE, message: NUMERIC_FIELD_ERROR };
  }

  const candidate = {
    batchId: readOptionalFormString(formData, 'batchId'),
    delta,
    reason: readOptionalFormString(formData, 'reason'),
  };

  const actor = await currentActor();

  try {
    const { stock } = await inventario.adjustBatchStock(candidate, actor);
    return { status: 'success', stock };
  } catch (error) {
    return toErrorState(error);
  }
}

export async function listProductBatchesAction(productId: string): Promise<ProductBatchesResult> {
  const actor = await currentActor();

  try {
    const data = await inventario.listProductBatches(productId, actor);
    return { status: 'success', data };
  } catch (error) {
    return toErrorState(error);
  }
}

export async function listBatchMovementsAction(batchId: string): Promise<BatchMovementsResult> {
  const actor = await currentActor();

  try {
    const data = await inventario.listBatchMovements(batchId, actor);
    return { status: 'success', data };
  } catch (error) {
    return toErrorState(error);
  }
}
