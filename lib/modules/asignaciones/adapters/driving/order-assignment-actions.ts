'use server';

/**
 * QC-87 T12 — Las TRES Server Actions de las asignaciones y la consulta tipada
 * (`design.md > 7`; R41, R43, R44).
 *
 * **Esta capa NO DECIDE NADA.** Hace exactamente tres cosas, y ninguna mas, calcada de
 * `lib/modules/identity/adapters/driving/work-group-actions.ts` (QC-84 T9):
 *
 *   1. Resuelve el ACTOR de las **dos caras** de la sesion via `@/lib/composition` (R2, R43). Si
 *      falta CUALQUIERA de las dos, el actor es ausente (`null`) y la operacion la rechaza el CASO
 *      DE USO por R2 —**sin tocar ningun puerto**—. Aqui no se comprueba ningun permiso: una
 *      segunda comprobacion seria una segunda definicion de la autorizacion, y la frontera es el
 *      caso de uso, donde `requirePermission` ya es la primera linea de los cuatro.
 *   2. Traduce la forma de entrada: **`FormData`** en las tres mutaciones —vienen de un `<form>`—
 *      y argumentos **ya tipados** en la consulta, que nadie invoca desde un formulario (R41). Los
 *      valores viajan CRUDOS al esquema `zod` del dominio: no se convierten a `String(...)` ni se
 *      rellenan defectos, para que un campo ausente FALLE el `parse` (`invalid_input`) en vez de
 *      colarse como cadena vacia. Campos en INGLES (R44): `orderId`, `userIds`, `workGroupIds`,
 *      `userId`, `workGroupId`.
 *   3. Traduce el error por su **`code`** con el traductor unico de QC-70 (R43), que reconoce el
 *      caso con un solo `instanceof AsignacionesError` y nunca mira el texto del mensaje.
 *
 * **Sin `revalidatePath`**: no hay ninguna ruta que revalidar todavia (R50), y adivinar la de
 * QC-102 seria inventarla — el mismo criterio, y el mismo parrafo, que QC-84 escribio para QC-85.
 * **Ningun route handler y ningun `fetch` a ruta propia.**
 *
 * Estas acciones NO se reexportan desde `lib/modules/asignaciones/index.ts` (R46): un `'use
 * server'` en el cierre transitivo del contrato lo volveria inimportable desde un componente de
 * cliente. QC-102 las importara por su RUTA EXACTA, igual que QC-85 con las de QC-84.
 */

import { asignaciones, identity, observabilidad } from '@/lib/composition';
import { createErrorStateTranslator, type ErrorState } from '@/lib/modules/errores';
import {
  AsignacionesError,
  type Actor,
  type AssignedOrderView,
  type OrderResponsible,
  type OrderResponsiblesEntry,
} from '@/lib/modules/asignaciones';
import { runInRequestScope } from '@/lib/shared/request-scope';

import type { Page } from '@/lib/modules/pedidos';

export type AssignResponsiblesFormState =
  | { status: 'idle' }
  | { status: 'success'; added: number }
  | ErrorState;

export type RemoveWorkGroupFromOrderFormState =
  | { status: 'idle' }
  | { status: 'success'; removed: number }
  | ErrorState;

export type UnassignResponsibleFormState = { status: 'idle' } | { status: 'success' } | ErrorState;

export type OrderResponsiblesResult =
  | { status: 'success'; data: readonly OrderResponsible[] }
  | ErrorState;

// NO se exporta ninguna constante `INITIAL_STATE`: un archivo con `'use server'` solo puede
// exportar funciones async (restriccion real de Next.js), asi que quien las consuma (QC-102)
// construye el literal `{ status: 'idle' }` con los tipos de arriba. Mismo criterio que
// `work-group-actions.ts`.

const toErrorState = createErrorStateTranslator(
  AsignacionesError,
  observabilidad.readRequestIdHeader,
);

/**
 * El actor, de las DOS caras de la sesion (R2, R43): de `getSessionUser()` salen el identificador y
 * el CONJUNTO DE PERMISOS; de `getSessionContext()`, la EMPRESA (R5). Si falta cualquiera de las
 * dos el actor es `null` y el caso de uso rechaza por R2 antes de tocar ningun puerto.
 *
 * El `roleName` de la sesion NO viaja: es display, y autorizar por rol seria justo lo que QC-74
 * saco del camino.
 */
async function currentActor(): Promise<Actor | null> {
  // QC-104 R3: el ambito envuelve EXACTAMENTE este `Promise.all`, para que las dos caras
  // compartan UNA sola lectura de la ficha de sesion en esta invocacion (`design.md > 2.6`).
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

/** Los campos se leen CRUDOS del `FormData` y se entregan tal cual al esquema del dominio: la
 *  validacion es una sola, la de `assignment-input.ts`, y esta capa no la repite ni la adelanta.
 *  `getAll` es lo que produce un `<form>` con varias casillas del mismo nombre, y devuelve `[]`
 *  cuando no se marco ninguna —que el esquema admite mientras la otra lista traiga algo—. */
function assignFromFormData(formData: FormData): unknown {
  return {
    orderId: formData.get('orderId'),
    userIds: formData.getAll('userIds'),
    workGroupIds: formData.getAll('workGroupIds'),
  };
}

function removeWorkGroupFromFormData(formData: FormData): unknown {
  return { orderId: formData.get('orderId'), workGroupId: formData.get('workGroupId') };
}

function unassignFromFormData(formData: FormData): unknown {
  return { orderId: formData.get('orderId'), userId: formData.get('userId') };
}

// ---------------------------------------------------------------------------------------------
// Las TRES mutaciones: `FormData` (R41)
// ---------------------------------------------------------------------------------------------

/**
 * Asignar responsables: personas sueltas y grupos en UNA sola operacion (R14, R16).
 *
 * El `now` lo pone ESTA capa —`new Date()`— y entra por parametro al caso de uso: el dominio no
 * tiene reloj propio, y es el instante con el que `identity` decide que miembros del grupo estan
 * `active` de forma EFECTIVA (R21).
 */
export async function assignResponsiblesAction(
  _prevState: AssignResponsiblesFormState,
  formData: FormData,
): Promise<AssignResponsiblesFormState> {
  const actor = await currentActor();

  try {
    const { added } = await asignaciones.assignResponsibles(
      actor,
      assignFromFormData(formData),
      new Date(),
    );
    return { status: 'success', added };
  } catch (error) {
    return toErrorState(error);
  }
}

/** Quitar un grupo del pedido: se lleva a las personas que ese grupo trajo, y devuelve cuantas
 *  (R32, R34). */
export async function removeWorkGroupFromOrderAction(
  _prevState: RemoveWorkGroupFromOrderFormState,
  formData: FormData,
): Promise<RemoveWorkGroupFromOrderFormState> {
  const actor = await currentActor();

  try {
    const { removed } = await asignaciones.removeWorkGroupFromOrder(
      actor,
      removeWorkGroupFromFormData(formData),
    );
    return { status: 'success', removed };
  } catch (error) {
    return toErrorState(error);
  }
}

/** Desasignar a UNA persona (R29, R31). La entrada no admite lista, y eso lo fija el esquema. */
export async function unassignResponsibleAction(
  _prevState: UnassignResponsibleFormState,
  formData: FormData,
): Promise<UnassignResponsibleFormState> {
  const actor = await currentActor();

  try {
    await asignaciones.unassignResponsible(actor, unassignFromFormData(formData));
    return { status: 'success' };
  } catch (error) {
    return toErrorState(error);
  }
}

// ---------------------------------------------------------------------------------------------
// La CONSULTA: argumento YA TIPADO, ningun `FormData` (R41)
// ---------------------------------------------------------------------------------------------

/**
 * Los responsables de un pedido (R35, R38, R40). No viene de un `<form>`, asi que recibe el
 * identificador ya tipado y no un `FormData`. La lista vacia es un exito, no un error (R40).
 */
export async function listOrderResponsiblesAction(
  orderId: string,
): Promise<OrderResponsiblesResult> {
  const actor = await currentActor();

  try {
    const data = await asignaciones.listOrderResponsibles(actor, orderId);
    return { status: 'success', data };
  } catch (error) {
    return toErrorState(error);
  }
}

// ---------------------------------------------------------------------------------------------
// QC-102 T6 - La consulta EN LOTE: argumento YA TIPADO, ningun `FormData` (R13). Bloque NUEVO al
// final del archivo: no reordena ni reformatea ninguna de las cuatro funciones de arriba.
// ---------------------------------------------------------------------------------------------

/** Lo que devuelve la consulta en lote: un ARRAY -no un `Map`- plano, ordenado y serializable sin
 *  depender de que estructuras admita el serializador de RSC. */
export type OrderResponsiblesBatchResult =
  | { status: 'success'; data: readonly OrderResponsiblesEntry[] }
  | ErrorState;

/**
 * Los responsables de VARIOS pedidos (QC-102 R1, R13): lo que el listado pide UNA vez por pagina.
 *
 * Misma capa tonta que las otras cuatro: resuelve el actor de las DOS caras de la sesion, llama al
 * caso de uso y traduce el error por su `code`. **Ningun permiso se comprueba aqui** -la frontera
 * es `requirePermission(actor, 'pedidos.consultar')` en la primera linea del caso de uso (R2)- y
 * **ninguna validacion se adelanta**: los identificadores viajan CRUDOS al esquema del dominio,
 * que es quien decide que son uuid y cuantos caben (R9).
 */
export async function listResponsiblesForOrdersAction(
  orderIds: readonly string[],
): Promise<OrderResponsiblesBatchResult> {
  const actor = await currentActor();

  try {
    const data = await asignaciones.listResponsiblesForOrders(actor, orderIds);
    return { status: 'success', data };
  } catch (error) {
    return toErrorState(error);
  }
}

export type AssignedOrdersListResult =
  | { status: 'success'; data: Page<AssignedOrderView> }
  | ErrorState;

/**
 * Ningun permiso se comprueba aqui: la frontera es la primera linea del caso de uso. Esta funcion
 * no se reexporta desde el barrel del modulo, `app/**` la importa por su ruta exacta.
 */
export async function listAssignedOrdersAction(
  query: unknown,
): Promise<AssignedOrdersListResult> {
  const actor = await currentActor();

  try {
    const data = await asignaciones.listAssignedOrders(actor, query);
    return { status: 'success', data };
  } catch (error) {
    return toErrorState(error);
  }
}
