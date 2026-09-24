'use server';

/**
 * El BORDE de encolar una tanda y de consultar su estado: dos Server Actions y nada mas.
 *
 * Mismo patron exacto que `document-upload-actions.ts`: el actor sale de las DOS caras de la
 * sesion dentro de UN SOLO `runInRequestScope`, la entrada de encolar se valida con el MISMO
 * objeto de esquema que publica el contrato del modulo, y el error se traduce por su `code` con el
 * traductor unico. Ninguna de las dos comprueba permiso por su cuenta: eso es la primera linea de
 * cada caso de uso.
 *
 * **Por que la entrada que no pasa el esquema viaja igual al caso de uso, cruda.** Mismo motivo que
 * la accion de subida: el veredicto de autorizacion tiene que ganar SIEMPRE, y entregar el valor
 * crudo deja que el dominio decida el orden -primero el permiso, despues el esquema-.
 *
 * La consulta no valida con zod: `batchId` es un argumento tipado que quien la invoca ya tiene
 * -una URL, un identificador que la propia tanda devolvio al encolar-, mismo criterio que
 * `getSupplierAction`.
 *
 * Este archivo NO se reexporta desde el contrato del modulo: un `'use server'` en su cierre
 * transitivo lo volveria inimportable desde un componente de cliente.
 */

import { documentos, identity, observabilidad } from '@/lib/composition';
import {
  DocumentosError,
  enqueueBatchSchema,
  type Actor,
  type BatchStatus,
  type EnqueuedBatch,
} from '@/lib/modules/documentos';
import { createErrorStateTranslator, type ErrorState } from '@/lib/modules/errores';
import { runInRequestScope } from '@/lib/shared/request-scope';

export type EnqueueBatchResult = { status: 'success'; data: EnqueuedBatch } | ErrorState;

export type GetBatchStatusResult = { status: 'success'; data: BatchStatus | null } | ErrorState;

const toErrorState = createErrorStateTranslator(
  DocumentosError,
  observabilidad.readRequestIdHeader,
);

/**
 * El actor, de las DOS caras de la sesion. Sin nombre de rol: aqui no se autoriza por rol.
 */
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

/** Encola una tanda: valida su entrada y publica un mensaje por archivo. */
export async function enqueueBatchAction(input: unknown): Promise<EnqueueBatchResult> {
  const actor = await currentActor();
  const parsed = enqueueBatchSchema.safeParse(input);

  try {
    const data = await documentos.enqueueBatch(actor, parsed.success ? parsed.data : input);
    return { status: 'success', data };
  } catch (error) {
    return toErrorState(error);
  }
}

/** El estado de una tanda: `data: null` si no existe o pertenece a otra empresa, sin distinguirlo. */
export async function getBatchStatusAction(batchId: string): Promise<GetBatchStatusResult> {
  const actor = await currentActor();

  try {
    const data = await documentos.getBatchStatus(actor, batchId);
    return { status: 'success', data };
  } catch (error) {
    return toErrorState(error);
  }
}
