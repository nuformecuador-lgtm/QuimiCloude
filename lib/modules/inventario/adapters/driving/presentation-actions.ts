'use server';

import { identity, inventario, observabilidad } from '@/lib/composition';
import { createErrorStateTranslator, type ErrorState } from '@/lib/modules/errores';
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
 *   Los campos de negocio son `name` y -desde QC-80 (R10, R11, R12)- `unitId`, las dos
 *   cadenas: no hace falta ninguna conversion numerica como en producto, asi que no hay
 *   ningun camino de `NaN` que vigilar aqui. `delete` recibe el `id` como campo oculto del
 *   formulario, igual que en producto.
 * - La action NO decide nada sobre la unidad: lee `unitId` del `FormData` y lo pasa TAL
 *   CUAL. Quien lo valida es `create/updatePresentationSchema` dentro del caso de uso, y
 *   quien comprueba que existe es la FK. Una cadena vacia baja tal cual y vuelve como
 *   `invalid_input`; la action no la traduce ni la sustituye por ningun defecto.
 * - `list` recibe `query: unknown` como argumento tipado: es una consulta, no un
 *   formulario, y `createListQuerySchema()` valida su forma DENTRO del caso de uso
 *   (QC-57 R30).
 *
 * QC-70 (R10, R12): la copia de `toErrorState` que este archivo llevaba -identica byte a
 * byte a la de `product-actions.ts`- desaparecio; ver alli el razonamiento completo.
 */

export type CreatePresentationFormState =
  | { status: 'idle' }
  | { status: 'success'; id: string }
  | ErrorState;

export type PresentationMutationFormState =
  | { status: 'idle' }
  | { status: 'success' }
  | ErrorState;

export type PresentationListResult =
  | { status: 'success'; data: Page<PresentationView> }
  | ErrorState;

const MISSING_ID_ERROR = 'Falta el identificador de la presentacion.';

function readFormString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

/** El traductor UNICO (R10), parametrizado por la base de este modulo. Ver `product-actions.ts`. */
const toErrorState = createErrorStateTranslator(InventarioError, observabilidad.readRequestIdHeader);

/**
 * El actor que exige R1/D17: se resuelve UNA vez por invocacion y, desde QC-49 (R12), con LAS
 * DOS CARAS de la sesion del servidor —`getSessionUser()` para id y permisos,
 * `getSessionContext()` para la EMPRESA—, pedidas en paralelo. Falla cerrado: sin cualquiera de
 * las dos el actor es `null` y el caso de uso rechaza antes de tocar el repositorio. La empresa
 * nunca sale del `FormData`. El razonamiento completo esta en `product-actions.ts`.
 */
async function currentActor(): Promise<Actor | null> {
  const [sessionUser, sessionContext] = await Promise.all([
    identity.getSessionUser(),
    identity.getSessionContext(),
  ]);
  if (sessionUser === null || sessionContext === null) return null;
  return {
    id: sessionUser.id,
    companyId: sessionContext.companyId,
    permissions: sessionUser.permissions,
  };
}

/** Alta de presentacion (R9, R11, R17-R20, R37). */
export async function createPresentationAction(
  prevState: CreatePresentationFormState,
  formData: FormData,
): Promise<CreatePresentationFormState> {
  void prevState;

  const candidate = {
    name: readFormString(formData, 'name'),
    unitId: readFormString(formData, 'unitId'),
  };
  const actor = await currentActor();

  try {
    const { id } = await inventario.createPresentation(candidate, actor);
    return { status: 'success', id };
  } catch (error) {
    return toErrorState(error);
  }
}

/** Edicion de presentacion: reemplazo completo de nombre Y unidad (R9, R11, R14,
 *  R17-R20, R37; QC-80 R12). */
export async function updatePresentationAction(
  id: string,
  prevState: PresentationMutationFormState,
  formData: FormData,
): Promise<PresentationMutationFormState> {
  void prevState;

  const candidate = {
    name: readFormString(formData, 'name'),
    unitId: readFormString(formData, 'unitId'),
  };
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
 * Lista paginada de presentaciones (R23-R26, R35, R36). Consulta: argumento tipado, y la
 * cadena entera vive dentro del caso de uso (QC-57 R30): `createListQuerySchema()` valida
 * la forma, `sanitizeListQuery` poda contra `PRESENTATION_QUERYABLE`, el caso de uso
 * registra los campos omitidos por el puerto `ListQueryLog` y el repositorio recibe la
 * consulta ya saneada.
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
