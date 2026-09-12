'use server';

/**
 * QC-84 T9 — Las SIETE Server Actions de los grupos de trabajo (R42, `design.md > 8`).
 *
 * **Esta capa NO DECIDE NADA.** Hace exactamente tres cosas, y ninguna mas:
 *
 *   1. Resuelve el ACTOR de las **dos caras** de la sesion via `@/lib/composition` (R6). Si falta
 *      CUALQUIERA de las dos, el actor es ausente (`null`) y la operacion la rechaza el caso de
 *      uso por R2 —**sin tocar el puerto**—. Aqui no se comprueba ningun permiso: una segunda
 *      comprobacion seria una segunda definicion de la autorizacion, y la frontera es el service.
 *   2. Traduce la forma de entrada: **`FormData`** en las cinco mutaciones —vienen de un `<form>`—
 *      y argumentos **ya tipados** en las dos consultas, que nadie invoca desde un formulario.
 *      Los valores viajan CRUDOS al esquema `zod` del dominio: no se convierten a `String(...)`
 *      ni se rellenan defectos, para que un campo ausente FALLE el `parse` en vez de colarse como
 *      cadena vacia.
 *   3. Traduce el error por su **`code`** con el traductor unico de QC-70 (R43).
 *
 * **Sin `revalidatePath`**: no hay ninguna ruta que revalidar todavia (R48), y adivinar la de
 * QC-85 seria inventarla. **Ningun route handler y ningun `fetch` a ruta propia.**
 *
 * Estas acciones NO se reexportan desde `lib/modules/identity/index.ts` (R44): QC-85 las importa
 * por su ruta exacta, igual que QC-67 con las de QC-66 y QC-94.
 */

import { identity, observabilidad } from '@/lib/composition';
import { createErrorStateTranslator, type ErrorState } from '@/lib/modules/errores';
import {
  IdentityError,
  type Actor,
  type Page,
  type WorkGroupMemberRow,
  type WorkGroupRow,
} from '@/lib/modules/identity';

export type CreateWorkGroupFormState =
  | { status: 'idle' }
  | { status: 'success'; id: string }
  | ErrorState;

export type WorkGroupMutationFormState =
  | { status: 'idle' }
  | { status: 'success' }
  | ErrorState;

export type WorkGroupListResult = { status: 'success'; data: Page<WorkGroupRow> } | ErrorState;

export type WorkGroupMemberListResult =
  | { status: 'success'; data: Page<WorkGroupMemberRow> }
  | ErrorState;

// NO se exporta ninguna constante `INITIAL_STATE`: un archivo con `'use server'` solo puede
// exportar funciones async (restriccion real de Next.js), asi que quien las consuma (QC-85)
// construye el literal `{ status: 'idle' }` con los tipos de arriba. Mismo criterio que
// `user-actions.ts`.

const toErrorState = createErrorStateTranslator(IdentityError, observabilidad.readRequestIdHeader);

/**
 * El actor, de las DOS caras de la sesion (R6): de `getSessionUser()` salen el identificador y el
 * CONJUNTO DE PERMISOS; de `getSessionContext()`, la EMPRESA. Si falta cualquiera de las dos el
 * actor es `null` y el caso de uso rechaza por R2 antes de tocar el puerto.
 *
 * El `roleName` de la sesion NO viaja: es display, y autorizar por rol seria justo lo que QC-74
 * saco del camino.
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

/** Los campos se leen CRUDOS del `FormData` y se entregan tal cual al esquema del dominio: la
 *  validacion es una sola, la de `work-group-input.ts`, y esta capa no la repite ni la adelanta. */
function workGroupNameFromFormData(formData: FormData): unknown {
  return { name: formData.get('name') };
}

function renameFromFormData(formData: FormData): unknown {
  return { workGroupId: formData.get('workGroupId'), name: formData.get('name') };
}

function memberFromFormData(formData: FormData): unknown {
  return { workGroupId: formData.get('workGroupId'), userId: formData.get('userId') };
}

function workGroupIdFromFormData(formData: FormData): unknown {
  return { workGroupId: formData.get('workGroupId') };
}

// ---------------------------------------------------------------------------------------------
// Las CINCO mutaciones: `FormData` (R42)
// ---------------------------------------------------------------------------------------------

export async function createWorkGroupAction(
  _prevState: CreateWorkGroupFormState,
  formData: FormData,
): Promise<CreateWorkGroupFormState> {
  const actor = await currentActor();

  try {
    const { id } = await identity.createWorkGroup(actor, workGroupNameFromFormData(formData));
    return { status: 'success', id };
  } catch (error) {
    return toErrorState(error);
  }
}

export async function renameWorkGroupAction(
  _prevState: WorkGroupMutationFormState,
  formData: FormData,
): Promise<WorkGroupMutationFormState> {
  const actor = await currentActor();

  try {
    await identity.renameWorkGroup(actor, renameFromFormData(formData));
    return { status: 'success' };
  } catch (error) {
    return toErrorState(error);
  }
}

export async function deleteWorkGroupAction(
  _prevState: WorkGroupMutationFormState,
  formData: FormData,
): Promise<WorkGroupMutationFormState> {
  const actor = await currentActor();

  try {
    await identity.deleteWorkGroup(actor, workGroupIdFromFormData(formData));
    return { status: 'success' };
  } catch (error) {
    return toErrorState(error);
  }
}

export async function addWorkGroupMemberAction(
  _prevState: WorkGroupMutationFormState,
  formData: FormData,
): Promise<WorkGroupMutationFormState> {
  const actor = await currentActor();

  try {
    await identity.addWorkGroupMember(actor, memberFromFormData(formData));
    return { status: 'success' };
  } catch (error) {
    return toErrorState(error);
  }
}

export async function removeWorkGroupMemberAction(
  _prevState: WorkGroupMutationFormState,
  formData: FormData,
): Promise<WorkGroupMutationFormState> {
  const actor = await currentActor();

  try {
    await identity.removeWorkGroupMember(actor, memberFromFormData(formData));
    return { status: 'success' };
  } catch (error) {
    return toErrorState(error);
  }
}

// ---------------------------------------------------------------------------------------------
// Las DOS consultas: argumentos YA TIPADOS, ningun `FormData` (R42)
// ---------------------------------------------------------------------------------------------

export async function listWorkGroupsAction(query: unknown): Promise<WorkGroupListResult> {
  const actor = await currentActor();

  try {
    const data = await identity.listWorkGroups(actor, query);
    return { status: 'success', data };
  } catch (error) {
    return toErrorState(error);
  }
}

/**
 * La lista de miembros (R19, R51-R54). El `now` lo pone ESTA capa —`new Date()`— y entra por
 * parametro al caso de uso: el dominio no tiene reloj propio, y es lo que hace que una cuenta
 * bloqueada vuelva sola a la lista al vencer su plazo **sin ninguna escritura** (R21).
 */
export async function listWorkGroupMembersAction(
  workGroupId: string,
  query: unknown,
): Promise<WorkGroupMemberListResult> {
  const actor = await currentActor();

  try {
    const data = await identity.listWorkGroupMembers(actor, workGroupId, query, new Date());
    return { status: 'success', data };
  } catch (error) {
    return toErrorState(error);
  }
}
