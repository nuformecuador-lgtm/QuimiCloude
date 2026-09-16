'use server';

import { identity, observabilidad } from '@/lib/composition';
import { createErrorStateTranslator, type ErrorState } from '@/lib/modules/errores';
import {
  CredentialPolicyRejectedError,
  IdentityError,
  type Actor,
  type CreateUserMailOutcome,
  type CredentialRule,
  type Page,
  type UserDetail,
  type UserRow,
} from '@/lib/modules/identity';
import { runInRequestScope } from '@/lib/shared/request-scope';

/**
 * QC-66 T14 — Las SEIS Server Actions de la administracion de usuarios
 * (`design.md > 10`, R6, R40, R41, R16).
 *
 * FORMA DE ENTRADA, decidida por operacion (`design.md > 10`, R40):
 * - **Las cuatro MUTACIONES** (`create`, `update`, `delete`, `setAccountStatus`) reciben
 *   `FormData`, porque salen de un formulario. El esquema `zod` vive en el CASO DE USO
 *   (`domain/user-input.ts`) y esta action NO lo repite: solo extrae los campos del
 *   formulario **tal cual llegan** y deja que el dominio decida. Ni un `trim`, ni una
 *   conversion, ni un valor por defecto: cada uno de ellos seria una regla de negocio
 *   escrita por segunda vez en el borde.
 * - **Las dos CONSULTAS** (`get`, `list`) reciben argumentos ya tipados, porque nadie las
 *   llama desde un `<form>`: el `id` sale de la URL y la consulta de lista la construye
 *   quien llama. `query` es `unknown` porque la cadena entera —`listQuerySchema`,
 *   `sanitizeListQuery` contra `USER_QUERYABLE`, el registro de lo omitido— vive dentro de
 *   `list-users.ts` (QC-57), y repetirla aqui seria una segunda copia.
 *
 * EL ACTOR sale de las DOS CARAS de la sesion del servidor via `@/lib/composition`
 * (`design.md > 5.2`, R6): `identity.getSessionUser()` da el identificador y el conjunto de
 * permisos, `identity.getSessionContext()` da la EMPRESA. Ver `currentActor()` abajo.
 *
 * ESTA ACTION NO DECIDE NADA (R6): no repite `requirePermission` —ya es la primera linea de
 * los seis casos de uso (R1)— ni ninguna otra regla de negocio. Ni una guarda del
 * administrador, ni un recorte de pagina, ni una comprobacion de «soy yo»: todo eso esta en
 * `domain/`, y un `if` sobre datos del dominio escrito aqui estaria en el sitio equivocado.
 *
 * ERRORES (`design.md > 6.4`, R41): las clases de `IdentityError` se traducen a
 * `{ status: 'error', code, message }` con el `code` ESTABLE de la clase, **nunca** el texto
 * del mensaje —el mensaje puede cambiar de redaccion o de idioma sin romper a QC-67—.
 *
 * QC-70 (R10, R12), aplicado aqui el 2026-09-10: la traduccion ya NO se escribe en este archivo
 * —era una septima copia byte a byte— sino que la fabrica el traductor UNICO del modulo `errores`.
 * Y un error que NO es de dominio ya no se RELANZA: se devuelve como `unexpected` con su mensaje
 * neutro, y el detalle real (traza, SQL, nombres de tabla) va al registro del servidor y solo ahi
 * (R13, R14). Nada de `catch` que descarte un error
 * (`docs/conventions.md > Manejo de errores`).
 *
 * R16 — LA CREDENCIAL NO SALE POR AQUI TAMPOCO. El estado que devuelve el alta es
 * `{ status: 'success'; id }` y nada mas: la contraseña generada no la ve esta action (el
 * caso de uso solo recibe su hash del puerto), no viaja en ningun mensaje de error —los
 * mensajes son los textos fijos del catalogo unico de QC-70— y no se escribe en ninguna traza:
 * **este archivo no tiene ningun `console.*`**.
 *
 * SIN `revalidatePath` (`design.md > 10`): esta ficha no crea ninguna pantalla, pagina ni
 * ruta (R46) —eso es QC-67—, asi que hoy NO HAY NINGUNA RUTA QUE REVALIDAR, y escribir la de
 * QC-67 seria inventarla (regla 6 de `CLAUDE.md`). Quien decida que revalida es QC-67.
 *
 * Estas seis actions NO se reexportan desde `index.ts` (R42): el contrato del modulo solo
 * reexporta de `./domain`, y un `'use server'` en su cierre transitivo romperia a cualquier
 * componente de cliente que importe el barrel. QC-67 las importara por su RUTA EXACTA.
 */

/**
 * Estado serializable del ALTA: el unico que devuelve un dato ademas de exito/fracaso.
 *
 * QC-79 T18 (`design.md > 5.3`) — pasa de TRES variantes a CINCO, y las dos nuevas son requisitos:
 *
 * - **`mail` dentro de `success`** es lo que hace cierta la decision 7 (R30): `'sent'`, `'failed'`
 *   —el usuario queda creado igual, en `pending`, con su enlace vivo, y la pantalla de QC-67 puede
 *   ofrecer el reenvio de R14— o `'not_needed'` cuando el administrador escribio la contrasena y
 *   no hubo ningun enlace que enviar (R3). Un fallo de correo **no** es un fallo del alta.
 * - **`invalid_credential`** lleva las REGLAS INCUMPLIDAS (R2) y **no es un `ErrorState`, que es
 *   una decision** (`design.md > 11.3`): son datos que la persona necesita para corregir, y el
 *   unico hueco de `ErrorState` para datos variables es el `diagnostic`, que QC-70 R29 manda al
 *   registro del servidor y prohibe serializar al navegador. Los codigos de `CredentialRule` son
 *   estables e independientes del idioma (QC-19 R23) y la UI compone el texto con ellos.
 *
 * **Sigue sin haber ningun hueco para una credencial** (R16, QC-79 R5): ni la que escribio el
 * administrador, ni ningun hash, ni el secreto del enlace. `unmet` son codigos de regla, nunca la
 * candidata ni un fragmento suyo.
 */
export type CreateUserFormState =
  | { status: 'idle' }
  | { status: 'success'; id: string; mail: CreateUserMailOutcome }
  | { status: 'invalid_credential'; unmet: readonly CredentialRule[] }
  | ErrorState;

/** Estado compartido por edicion, borrado y movimiento de estado: ninguno devuelve datos. */
export type UserMutationFormState =
  | { status: 'idle' }
  | { status: 'success' }
  | ErrorState;

/** Lo que devuelve la FICHA individual (R32): `UserDetail` no lleva credencial por TIPO. */
export type UserDetailResult =
  | { status: 'success'; data: UserDetail }
  | ErrorState;

/** Lo que devuelve el LISTADO (R27, R31): una `Page` de filas sin ningun dato de credencial. */
export type UserListResult =
  | { status: 'success'; data: Page<UserRow> }
  | ErrorState;

// NO se exporta ninguna constante `INITIAL_STATE`: un archivo con `'use server'` solo puede
// exportar funciones async (restriccion real de Next.js), asi que quien las consuma (QC-67)
// construye el literal `{ status: 'idle' }` con los tipos de arriba.

/**
 * Traduce un error de dominio a estado serializable POR SU `code`, y cualquier otro a
 * `unexpected`. Es la UNICA implementacion, parametrizada por la clase base de este modulo
 * (QC-70 R10): la guardia del catalogo da rojo si alguien vuelve a declarar aqui una
 * `function toErrorState`.
 */
const toErrorState = createErrorStateTranslator(IdentityError, observabilidad.readRequestIdHeader);

/**
 * El actor se resuelve UNA vez por invocacion, nunca dentro del dominio (R5), y con LAS DOS
 * CARAS de la sesion del servidor (R6, `design.md > 5.2`), igual que
 * `unidades/adapters/driving/unit-actions.ts`: `getSessionUser()` da el id y el conjunto de
 * permisos, `getSessionContext()` da la EMPRESA. La empresa sale del contexto de sesion y
 * **NUNCA** de la entrada del llamante (R14): esta action no lee cookie ni cabecera.
 *
 * **Falla cerrado**: si falta CUALQUIERA de las dos, el actor es `null` —no se adivina, no se
 * rellena y no se lanza un error distinto desde aqui—, y con actor `null`
 * `requirePermission` rechaza en la primera linea del caso de uso (R2), antes de validar la
 * entrada y antes de tocar ningun puerto. Sin contexto no hay actor, y sin actor no hay ni
 * lectura ni escritura.
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

/**
 * Los campos del formulario viajan **TAL CUAL** los entrega `FormData`: si la clave falta,
 * `get` devuelve `null` y el candidato lleva `null`; si llega con espacios, llegan los
 * espacios. Quien rechaza un `null`, un `File` o una cadena en blanco es `createUserSchema`
 * (R18), que ya hace `trim().min(1)`. Por eso el candidato es `unknown`: aqui no hay nada
 * tipado todavia, y fingir que lo hay es lo que acaba en una segunda validacion en el borde.
 *
 * Los NUEVE campos son los de `design.md > 6.1`/`> 6.2`, y **no hay ninguno mas a proposito**:
 * `companyId` (R14), cualquier campo de contraseña (R15, R16), `accountStatus` (R13) y los
 * contadores de QC-19 (R45) no se leen del formulario porque `strictObject` los RECHAZA. Si
 * alguien los añade aqui, la mutacion falla con `invalid_input`, que es exactamente lo que
 * R14 y R20 piden poder demostrar.
 */
function userCandidateFromFormData(formData: FormData): unknown {
  return {
    firstNames: formData.get('firstNames'),
    lastNames: formData.get('lastNames'),
    birthDate: formData.get('birthDate'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    documentTypeCode: formData.get('documentTypeCode'),
    documentNumber: formData.get('documentNumber'),
    username: formData.get('username'),
    roleId: formData.get('roleId'),
  };
}

/**
 * El identificador del usuario objetivo cuando viaja como campo OCULTO del formulario, igual
 * que en `deleteUnitAction`. Un `id` ausente llega como cadena vacia y se pasa al caso de uso
 * **sin juzgarlo**: el dominio responde `user_not_found` porque ninguna fila viva de la empresa lo
 * tiene. Devolver aqui un error distinto seria decidir en el borde.
 */
function readTargetId(formData: FormData): string {
  return String(formData.get('id') ?? '');
}

/**
 * ALTA de usuario (R40). Devuelve el identificador creado y **como acabo el correo**: ninguna
 * credencial y ningun hash salen en este estado (R16, QC-79 R5). La empresa, el estado `pending`,
 * la marca de cambio de credencial y —cuando toca— el enlace los pone el caso de uso (R13; QC-79
 * R4, R7); esta action no los nombra.
 *
 * **QC-79 T18: el DECIMO campo del formulario es la contrasena OPCIONAL** (R1). Va aqui y no en
 * `userCandidateFromFormData` porque ese helper lo comparte la EDICION, y `updateUserSchema` omite
 * `credential` a proposito: anadirlo alli haria fallar toda edicion con `invalid_input`.
 *
 * Se pasa **TAL CUAL**, sin normalizar: un `<input>` vacio llega como `''` y **el dominio ya trata
 * `''` como «el administrador no la escribio»** (`create-user.ts`, R1). Repetir esa normalizacion
 * aqui seria escribir la misma regla por segunda vez en el borde, y dos sitios donde acordarse es
 * como nacen dos comportamientos para la misma entrada. Lo unico que se hace es que una clave
 * AUSENTE —`get` devuelve `null`— llegue como la cadena vacia, que es lo que R1 exige tratar
 * IGUAL que la ausencia; mismo criterio que `readTargetId` aqui abajo.
 */
export async function createUserAction(
  _prevState: CreateUserFormState,
  formData: FormData,
): Promise<CreateUserFormState> {
  const actor = await currentActor();

  try {
    const { id, mail } = await identity.createUser(actor, {
      ...(userCandidateFromFormData(formData) as Record<string, unknown>),
      credential: formData.get('credential') ?? '',
    });
    return { status: 'success', id, mail };
  } catch (error) {
    // QC-79 R2 — el rechazo por politica es una VARIANTE PROPIA y no un `ErrorState`, por la razon
    // que explica `design.md > 11.3`. Todo lo demas va al traductor UNICO de QC-70: ningun error
    // se descarta y no hay ninguna segunda traduccion escrita aqui.
    if (error instanceof CredentialPolicyRejectedError) {
      return { status: 'invalid_credential', unmet: error.unmet };
    }
    return toErrorState(error);
  }
}

/**
 * EDICION de usuario (R40): REEMPLAZO COMPLETO de los nueve campos (R19). El `id` llega por
 * PARAMETRO —lo ata el formulario de la ficha, como en `updateUnitAction`— y el resto por
 * `FormData`. Que editar la propia fila se rechace con `self_operation` (R21) lo decide
 * `update-user.ts`, no esta action.
 */
export async function updateUserAction(
  id: string,
  _prevState: UserMutationFormState,
  formData: FormData,
): Promise<UserMutationFormState> {
  const actor = await currentActor();

  try {
    await identity.updateUser(actor, id, userCandidateFromFormData(formData));
    return { status: 'success' };
  } catch (error) {
    return toErrorState(error);
  }
}

/**
 * BORRADO LOGICO (R37, R40): el `id` viaja como campo oculto del formulario de la fila, igual
 * que en `deleteUnitAction`. No hay entrada que validar —el dominio solo espera un
 * identificador—, y las dos guardas del administrador (R21, R22) viven en `delete-user.ts`.
 */
export async function deleteUserAction(
  _prevState: UserMutationFormState,
  formData: FormData,
): Promise<UserMutationFormState> {
  const actor = await currentActor();
  const id = readTargetId(formData);

  try {
    await identity.deleteUser(actor, id);
    return { status: 'success' };
  } catch (error) {
    return toErrorState(error);
  }
}

/**
 * MOVER EL ESTADO DE CUENTA (R25, R26, R40): el `id` como campo oculto y el estado destino
 * como campo del formulario, los dos **tal cual llegan**. Quien comprueba que el destino es
 * uno de los cuatro valores cerrados de QC-65 es `setAccountStatusSchema` (R26), y el autor y
 * el instante del cambio los escribe el caso de uso con el actor y el reloj (R25): aqui no se
 * construye ninguno de los dos.
 */
export async function setUserAccountStatusAction(
  _prevState: UserMutationFormState,
  formData: FormData,
): Promise<UserMutationFormState> {
  const actor = await currentActor();
  const id = readTargetId(formData);

  try {
    await identity.setUserAccountStatus(actor, id, {
      accountStatus: formData.get('accountStatus'),
    });
    return { status: 'success' };
  } catch (error) {
    return toErrorState(error);
  }
}

/**
 * FICHA individual por identificador (R32, R40). Consulta: argumento ya tipado, no `FormData`.
 * Que un usuario de otra empresa, uno borrado o el propio actor respondan `user_not_found` (R33,
 * R34, R35) lo decide `get-user.ts`: esta action solo traduce.
 */
export async function getUserAction(id: string): Promise<UserDetailResult> {
  const actor = await currentActor();

  try {
    const data = await identity.getUser(actor, id);
    return { status: 'success', data };
  } catch (error) {
    return toErrorState(error);
  }
}

/**
 * LISTADO paginado de usuarios (R27–R31, R36, R40). Consulta: argumento ya tipado. `query` es
 * `unknown` porque su forma la valida `listQuerySchema` y la poda `sanitizeListQuery` contra
 * `USER_QUERYABLE`, **dentro** del caso de uso; el tamaño de pagina por defecto y el tope de
 * 25 (R27) tambien son suyos. Esta action no repite ninguno de esos pasos ni interpreta la
 * consulta: la deja pasar.
 */
export async function listUsersAction(query: unknown): Promise<UserListResult> {
  const actor = await currentActor();

  try {
    const data = await identity.listUsers(actor, query);
    return { status: 'success', data };
  } catch (error) {
    return toErrorState(error);
  }
}
