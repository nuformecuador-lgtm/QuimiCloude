'use server';

/**
 * El BORDE de la revision de una importacion de catalogo: dos Server Actions y nada mas.
 *
 * `previewCatalogImportAction` valida su entrada con el esquema del contrato y, si no encaja,
 * responde `invalid_input` SIN resolver actor ni llamar a `documentos.previewCatalogImport` -mismo
 * criterio que `recipe-actions.ts`: la vista previa no escribe nada, asi que rechazar en el borde
 * no adelanta ningun veredicto de autorizacion que le importe a nadie. `confirmCatalogImportAction`
 * hace lo mismo con su propio esquema y, si la confirmacion termina en exito, revalida la pagina
 * del detalle del proveedor -la unica ruta que muestra el catalogo que acaba de cambiar- y devuelve
 * el resumen.
 *
 * El ACTOR sale de las DOS caras de la sesion, en un solo `runInRequestScope` por invocacion, mismo
 * patron que `document-batch-actions.ts`. El error se traduce por su `code` con el traductor unico:
 * ninguna de las dos mira el texto del mensaje.
 *
 * Este archivo NO se reexporta desde el contrato del modulo: un `'use server'` en su cierre
 * transitivo lo volveria inimportable desde un componente de cliente.
 */

import { revalidatePath } from 'next/cache';

import { documentos, identity, observabilidad } from '@/lib/composition';
import {
  confirmCatalogImportInputSchema,
  DocumentosError,
  previewCatalogImportInputSchema,
  type Actor,
  type CatalogImportPreview,
  type CatalogImportSummary,
} from '@/lib/modules/documentos';
import { createErrorStateTranslator, errorMessage, type ErrorCode, type ErrorState } from '@/lib/modules/errores';
import { supplierDetailRoute } from '@/lib/shared/routes';
import { runInRequestScope } from '@/lib/shared/request-scope';

export type PreviewCatalogImportResult = { status: 'success'; data: CatalogImportPreview } | ErrorState;

export type ConfirmCatalogImportResult = { status: 'success'; data: CatalogImportSummary } | ErrorState;

const INVALID_INPUT_CODE = 'invalid_input' satisfies ErrorCode;
const INVALID_INPUT_MESSAGE = errorMessage(INVALID_INPUT_CODE);

const toErrorState = createErrorStateTranslator(DocumentosError, observabilidad.readRequestIdHeader);

/** El actor, de las DOS caras de la sesion, compartiendo UNA sola lectura por invocacion. */
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

/** La vista previa: interpreta o reclasifica, sin escribir nada. Rechaza la entrada invalida SIN
 *  llamar a `documentos.previewCatalogImport`. */
export async function previewCatalogImportAction(input: unknown): Promise<PreviewCatalogImportResult> {
  const parsed = previewCatalogImportInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: 'error', code: INVALID_INPUT_CODE, message: INVALID_INPUT_MESSAGE };
  }

  const actor = await currentActor();

  try {
    const data = await documentos.previewCatalogImport(actor, parsed.data);
    return { status: 'success', data };
  } catch (error) {
    return toErrorState(error);
  }
}

/** La confirmacion: escribe el catalogo revisado y revalida la pagina de detalle del proveedor. */
export async function confirmCatalogImportAction(input: unknown): Promise<ConfirmCatalogImportResult> {
  const parsed = confirmCatalogImportInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: 'error', code: INVALID_INPUT_CODE, message: INVALID_INPUT_MESSAGE };
  }

  const actor = await currentActor();

  try {
    const data = await documentos.confirmCatalogImport(actor, parsed.data);
    revalidatePath(supplierDetailRoute(parsed.data.supplierId));
    return { status: 'success', data };
  } catch (error) {
    return toErrorState(error);
  }
}
