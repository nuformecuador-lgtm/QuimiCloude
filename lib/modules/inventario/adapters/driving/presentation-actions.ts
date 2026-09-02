'use server';

import { identity, inventario } from '@/lib/composition';
import {
  InventarioError,
  type Actor,
  type Page,
  type PresentationView,
} from '@/lib/modules/inventario';

/**
 * Server Actions del catalogo de presentacion (T12, R29). Mismo patron que
 * `product-actions.ts` -leelo primero, ahi esta el razonamiento completo sobre la forma
 * de entrada, el origen del actor y la traduccion de errores-. Aqui solo lo especifico de
 * presentacion:
 *
 * - `create`/`update`/`delete` reciben `FormData`: son mutaciones de formulario (QC-22).
 *   El unico campo de negocio es `name`, una cadena -no hace falta ninguna conversion
 *   numerica como en producto-, asi que no hay ningun camino de `NaN` que vigilar aqui.
 *   `delete` recibe el `id` como campo oculto del formulario, igual que en producto.
 * - `list` recibe `query: unknown` como argumento tipado: es una consulta, no un
 *   formulario, y `pageQuerySchema` la valida DENTRO del caso de uso (R28).
 */

export type CreatePresentationFormState =
  | { status: 'idle' }
  | { status: 'success'; id: string }
  | { status: 'error'; code: string; message: string };

export type PresentationMutationFormState =
  | { status: 'idle' }
  | { status: 'success' }
  | { status: 'error'; code: string; message: string };

export type PresentationListResult =
  | { status: 'success'; data: Page<PresentationView> }
  | { status: 'error'; code: string; message: string };

const MISSING_ID_ERROR = 'Falta el identificador de la presentacion.';

function readFormString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

/** Traduce un error de dominio a estado serializable; relanza cualquier otro (`docs/conventions.md`). */
function toErrorState(error: unknown): { status: 'error'; code: string; message: string } {
  if (error instanceof InventarioError) {
    return { status: 'error', code: error.code, message: error.message };
  }
  throw error;
}

/** El actor que exige R1/D17: se resuelve UNA vez por invocacion (ver `product-actions.ts`). */
async function currentActor(): Promise<Actor | null> {
  const sessionUser = await identity.getSessionUser();
  if (sessionUser === null) return null;
  return { id: sessionUser.id, roleName: sessionUser.roleName };
}

/** Alta de presentacion (R9, R11, R17-R20, R37). */
export async function createPresentationAction(
  prevState: CreatePresentationFormState,
  formData: FormData,
): Promise<CreatePresentationFormState> {
  void prevState;

  const candidate = { name: readFormString(formData, 'name') };
  const actor = await currentActor();

  try {
    const { id } = await inventario.createPresentation(candidate, actor);
    return { status: 'success', id };
  } catch (error) {
    return toErrorState(error);
  }
}

/** Renombrado de presentacion (R9, R11, R14, R17-R20, R37). */
export async function updatePresentationAction(
  id: string,
  prevState: PresentationMutationFormState,
  formData: FormData,
): Promise<PresentationMutationFormState> {
  void prevState;

  const candidate = { name: readFormString(formData, 'name') };
  const actor = await currentActor();

  try {
    await inventario.updatePresentation(id, candidate, actor);
    return { status: 'success' };
  } catch (error) {
    return toErrorState(error);
  }
}

/** Borrado fisico de presentacion (R14, R21, R22). El `id` viaja como campo oculto del formulario. */
export async function deletePresentationAction(
  prevState: PresentationMutationFormState,
  formData: FormData,
): Promise<PresentationMutationFormState> {
  void prevState;

  const id = readFormString(formData, 'id');
  if (id === '') {
    return { status: 'error', code: 'invalid_input', message: MISSING_ID_ERROR };
  }

  const actor = await currentActor();

  try {
    await inventario.deletePresentation(id, actor);
    return { status: 'success' };
  } catch (error) {
    return toErrorState(error);
  }
}

/**
 * Lista paginada de presentaciones (R23-R26, R35, R36). Consulta: argumento tipado, la
 * validacion vive en `pageQuerySchema` dentro del caso de uso (R28).
 */
export async function listPresentationsAction(query: unknown): Promise<PresentationListResult> {
  const actor = await currentActor();

  try {
    const data = await inventario.listPresentations(query, actor);
    return { status: 'success', data };
  } catch (error) {
    return toErrorState(error);
  }
}
