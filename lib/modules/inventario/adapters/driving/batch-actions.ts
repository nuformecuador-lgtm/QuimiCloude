'use server';

import { identity, inventario, observabilidad } from '@/lib/composition';
import { createErrorStateTranslator, type ErrorState } from '@/lib/modules/errores';
import {
  BatchStockChangedError,
  InventarioError,
  type Actor,
  type BatchHistoryEntry,
  type ProductBatchView,
} from '@/lib/modules/inventario';
import { runInRequestScope } from '@/lib/shared/request-scope';

// Aqui no se repite `requirePermission`: es la primera linea de cada caso de uso.

export type AdjustBatchStockFormState =
  | { status: 'idle' }
  | { status: 'success'; stock: string; reserved: string; overReserved: boolean }
  | {
      status: 'stock_changed';
      code: 'batch_stock_changed';
      message: string;
      currentStock: string;
    }
  | ErrorState;

export type ProductBatchesResult =
  | { status: 'success'; data: readonly ProductBatchView[] }
  | ErrorState;

export type BatchMovementsResult =
  | { status: 'success'; data: readonly BatchHistoryEntry[] }
  | ErrorState;

// Sin constante `INITIAL_STATE`: un archivo con `'use server'` solo puede exportar funciones async.

function readOptionalFormString(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  return value;
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

  const candidate = {
    batchId: readOptionalFormString(formData, 'batchId'),
    countedStock: readOptionalFormString(formData, 'countedStock'),
    seenStock: readOptionalFormString(formData, 'seenStock'),
    reason: readOptionalFormString(formData, 'reason'),
  };

  const actor = await currentActor();

  try {
    const { stock, reserved, overReserved } = await inventario.adjustBatchStock(candidate, actor);
    return { status: 'success', stock, reserved, overReserved };
  } catch (error) {
    // `toErrorState` arma el estado campo a campo y perderia `currentStock`.
    if (error instanceof BatchStockChangedError) {
      return {
        status: 'stock_changed',
        code: error.code,
        message: error.message,
        currentStock: error.currentStock,
      };
    }
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

/** `orderId` `null` pide los lotes sin pedido de `productId`, el de la fila «Sin pedido». */
export async function listOrderBatchesAction(
  orderId: string | null,
  productId: string | null = null,
): Promise<ProductBatchesResult> {
  const actor = await currentActor();

  try {
    const data = await inventario.listOrderBatches(orderId, actor, productId);
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
