'use server';

/**
 * El BORDE de la revision de una importacion de formula: dos Server Actions y nada mas.
 *
 * Las dos rechazan la entrada invalida SIN resolver el actor -mismo criterio que
 * `catalog-import-actions.ts`: como ninguna de las dos lee ni escribe nada con una entrada rota,
 * rechazar en el borde no adelanta ningun veredicto de autorizacion.
 *
 * Como se traduce el error de `confirmFormulaImport` (puede venir de tres modulos distintos):
 * `formula-import-error-translator.ts`.
 *
 * Este archivo NO se reexporta desde el contrato del modulo: un `'use server'` en su cierre
 * transitivo lo volveria inimportable desde un componente de cliente.
 */

import { revalidatePath } from 'next/cache';

import { documentos, identity, observabilidad } from '@/lib/composition';
import {
  confirmFormulaImportInputSchema,
  previewFormulaImportInputSchema,
  type Actor,
  type FormulaImportPreview,
  type FormulaImportSummary,
} from '@/lib/modules/documentos';
import { errorMessage, type ErrorCode, type ErrorState } from '@/lib/modules/errores';
import { FORMULAS_ROUTE, recipeEditRoute } from '@/lib/shared/routes';
import { runInRequestScope } from '@/lib/shared/request-scope';

import { createFormulaImportErrorTranslator } from './formula-import-error-translator';

export type PreviewFormulaImportResult = { status: 'success'; data: FormulaImportPreview } | ErrorState;

export type ConfirmFormulaImportResult = { status: 'success'; data: FormulaImportSummary } | ErrorState;

const INVALID_INPUT_CODE = 'invalid_input' satisfies ErrorCode;
const INVALID_INPUT_MESSAGE = errorMessage(INVALID_INPUT_CODE);

const translateError = createFormulaImportErrorTranslator(observabilidad.readRequestIdHeader);

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

/** La vista previa: interpreta, preselecciona y comprueba el choque de nombre, sin escribir nada.
 *  Rechaza la entrada invalida SIN llamar a `documentos.previewFormulaImport`. */
export async function previewFormulaImportAction(input: unknown): Promise<PreviewFormulaImportResult> {
  const parsed = previewFormulaImportInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: 'error', code: INVALID_INPUT_CODE, message: INVALID_INPUT_MESSAGE };
  }

  const actor = await currentActor();

  try {
    const data = await documentos.previewFormulaImport(actor, parsed.data);
    return { status: 'success', data };
  } catch (error) {
    return translateError(error);
  }
}

/** La confirmacion: escribe la receta -y, si hace falta, alguna materia prima- y revalida el
 *  listado de formulas y la ficha de la receta resultante. */
export async function confirmFormulaImportAction(input: unknown): Promise<ConfirmFormulaImportResult> {
  const parsed = confirmFormulaImportInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: 'error', code: INVALID_INPUT_CODE, message: INVALID_INPUT_MESSAGE };
  }

  const actor = await currentActor();

  try {
    const data = await documentos.confirmFormulaImport(actor, parsed.data);
    revalidatePath(FORMULAS_ROUTE);
    revalidatePath(recipeEditRoute(data.recipeId));
    return { status: 'success', data };
  } catch (error) {
    return translateError(error);
  }
}
