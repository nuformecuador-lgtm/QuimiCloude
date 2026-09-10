'use server';

import { identity, unidades } from '@/lib/composition';
import { createErrorStateTranslator, type ErrorCode } from '@/lib/modules/errores';
import {
  UnidadesError,
  type Actor,
  type Page,
  type UnitView,
} from '@/lib/modules/unidades';

/**
 * Server Action de lectura del catalogo de unidades (`design.md > 9`, R40-R42). Es el
 * unico adaptador driving de `unidades`; consumira QC-26 en el selector de unidad.
 *
 * EL ACTOR sale de `identity.getSessionUser()` via `@/lib/composition`, exactamente
 * igual que `recipe-actions.ts` de `recetas`: esta action no lee sesion, cookie ni
 * cabecera por su cuenta.
 *
 * ESTA ACTION NO REPITE `requirePermission` NI DECIDE NADA (R41): solo resuelve el actor,
 * invoca el caso de uso y traduce su error de dominio. El corte real vive en
 * `domain/list-units.ts`.
 *
 * ERRORES: las clases de `UnidadesError` se traducen a `{ status: 'error', code,
 * message }` con el `code` ESTABLE de la clase, nunca el texto.
 *
 * QC-70 (R10, R12): la traduccion ya NO se escribe aqui —era una de las siete copias byte a
 * byte— sino que la fabrica el traductor unico del modulo `errores`. Y un error que NO es de
 * dominio ya no se RELANZA: se devuelve como `unexpected` con su mensaje neutro, y el detalle
 * real (traza, SQL, nombres de tabla) va al registro del servidor y solo ahi (R13, R14).
 */

/**
 * Lo que devuelve la lectura del CATALOGO ENTERO. Conserva su nombre porque es el tipo con el
 * que ya hablan las pantallas de recetas, proveedores y pedidos (R4). Lo que cambia con QC-39
 * es lo que trae cada unidad —`UnitView` en vez de `UnitRef`: la equivalencia y `isSystem`—, y
 * como `UnitView` EXTIENDE `UnitRef`, quien solo lee `id`, `name` y `symbol` no se entera.
 */
export type UnitListResult =
  | { status: 'success'; data: readonly UnitView[] }
  | { status: 'error'; code: ErrorCode; message: string };

/** Lo que devuelve la lectura PAGINADA (QC-39 R5): la misma union, con una `Page` dentro. */
export type UnitPageResult =
  | { status: 'success'; data: Page<UnitView> }
  | { status: 'error'; code: ErrorCode; message: string };

/**
 * Traduce un error de dominio a estado serializable y cualquier otro a `unexpected`. Es la
 * UNICA implementacion, parametrizada por la clase base de este modulo (R10): la guardia del
 * catalogo da rojo si alguien vuelve a declarar aqui una `function toErrorState`.
 */
const toErrorState = createErrorStateTranslator(UnidadesError);

/**
 * El actor se resuelve UNA vez por invocacion, nunca dentro del dominio, y con LAS DOS CARAS
 * de la sesion del servidor (QC-76 R19): `getSessionUser()` da el id y el conjunto de permisos,
 * `getSessionContext()` da la EMPRESA. La empresa sale del contexto de sesion y NUNCA de la
 * entrada del llamante: esta action no lee cookie ni cabecera, igual que hoy.
 *
 * **Falla cerrado**: si falta CUALQUIERA de las dos, el actor es `null`, y con actor `null`
 * `requirePermission` rechaza en la primera linea del caso de uso, antes de tocar el
 * repositorio. Sin contexto no hay actor, y sin actor no hay consulta.
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

/**
 * Lectura del catalogo de unidades (R40, R41 de QC-32; QC-39 R5).
 *
 * **La consulta viaja TAL CUAL al caso de uso** y esta action no la interpreta: quien decide si
 * la salida es el catalogo entero o una pagina es `listUnits`, mirando si la entrada trae
 * `page`/`pageSize` (`list-units.ts`). Aqui no hay validacion, ni saneado, ni traduccion de
 * parametros: eso ya existe en el dominio (`sanitizeListQuery`, `UNIT_QUERYABLE`) y R5 prohibe
 * escribir una segunda copia.
 *
 * **Las dos sobrecargas son lo que protege a los llamantes de hoy** (R4): el formulario de
 * recetas, el detalle de proveedor y la pantalla de pedidos invocan `listUnitsAction()` sin
 * argumentos y siguen recibiendo `readonly UnitView[]` —un array, no una union que estrechar—.
 * Es el mismo mecanismo que `ListUnits` ya usa en el dominio.
 *
 * ESTA ACTION SIGUE SIN DECIDIR NADA (R41): resuelve el actor, deja pasar la consulta y traduce
 * el error de dominio. El permiso lo exige `list-units.ts` en su primera linea.
 */
export async function listUnitsAction(): Promise<UnitListResult>;
export async function listUnitsAction(query: unknown): Promise<UnitPageResult>;
// La firma de IMPLEMENTACION -que ningun llamante ve- declara `data` como la union entera, y no
// como `UnitListResult | UnitPageResult`. Es a proposito: la forma de `data` la eligio el caso
// de uso segun la consulta, y aqui no hay nada que decidir ni que estrechar. Si el retorno fuera
// la union de los dos ESTADOS, `{ status: 'success', data }` no compilaria -un `data` que puede
// ser array o pagina no encaja en ninguna de las dos ramas por separado-, y la salida seria un
// `as` o un condicional con las dos ramas identicas. Las SOBRECARGAS de arriba son las que
// mandan de puertas afuera (R4): sin argumentos se sigue devolviendo `UnitListResult`, con
// consulta `UnitPageResult`, y quien llama no ve union alguna que estrechar.
export async function listUnitsAction(
  query?: unknown,
): Promise<
  | { status: 'success'; data: readonly UnitView[] | Page<UnitView> }
  | { status: 'error'; code: ErrorCode; message: string }
> {
  const actor = await currentActor();

  try {
    const data = await unidades.listUnits(query, actor);
    return { status: 'success', data };
  } catch (error) {
    return toErrorState(error);
  }
}

// ---------------------------------------------------------------------------------------
// QC-38 (T9, `design.md > 8`, R27, R29, R30, R31, R36). Tres Server Actions NUEVAS, alta,
// edicion y borrado. `listUnitsAction`, `currentActor` y `toErrorState` de arriba NO se
// reescriben: las tres nuevas los reutilizan tal cual.
//
// NINGUNA de las tres se reexporta desde `index.ts` (R31): el barrel tiene que poder
// importarse desde un componente de cliente, y un 'use server' en su cierre de imports lo
// romperia (cabecera de `index.ts`).
// ---------------------------------------------------------------------------------------

export type CreateUnitFormState =
  | { status: 'idle' }
  | { status: 'success'; id: string }
  | { status: 'error'; code: ErrorCode; message: string };

export type UnitMutationFormState =
  | { status: 'idle' }
  | { status: 'success' }
  | { status: 'error'; code: ErrorCode; message: string };

/**
 * COMO SE LEE `FormData` SIN QUE R36 SE COMA A R10. Un campo que el formulario no envia y uno
 * que envia vacio llegan igual a `FormData.get`: cadena vacia. Como el simbolo vacio SE
 * RECHAZA (R36) pero el simbolo AUSENTE es legal (R10), la distincion se hace con
 * `formData.has(key)`, NUNCA con el valor:
 *   - si la clave NO esta -> el candidato lleva `undefined` ("no lo declaro"), y el esquema lo
 *     acepta;
 *   - si la clave SI esta -> va TAL CUAL llego, sin recortar ni convertir, y el esquema decide
 *     (vacio -> `invalid_input`).
 * Lo mismo para `baseUnitId` y `factor`, donde "ausente" significa unidad base (R17) y NO
 * entrada invalida. Si en vez de `formData.has(...)` se mirara el valor, un simbolo que el
 * formulario no manda y uno que manda vacio serian indistinguibles y R36 se comeria a R10.
 */
function candidateFromFormData(formData: FormData): unknown {
  return {
    name: formData.get('name'),
    symbol: formData.has('symbol') ? formData.get('symbol') : undefined,
    baseUnitId: formData.has('baseUnitId') ? formData.get('baseUnitId') : undefined,
    factor: formData.has('factor') ? formData.get('factor') : undefined,
  };
}

/**
 * Alta de unidad (R27, R28, R36). El actor lo resuelve esta action con `currentActor()`, igual
 * que `listUnitsAction`; el dominio no lee sesion, cookie ni cabecera (R29).
 */
export async function createUnitAction(
  _prevState: CreateUnitFormState,
  formData: FormData,
): Promise<CreateUnitFormState> {
  const actor = await currentActor();

  try {
    const { id } = await unidades.createUnit(candidateFromFormData(formData), actor);
    return { status: 'success', id };
  } catch (error) {
    return toErrorState(error);
  }
}

/** Edicion de unidad (R27, R28, R36): `id` llega por PARAMETRO -no por `FormData`-, tal como
 *  exige `design.md > 8`; el actor y la lectura de `FormData` son los mismos que en el alta. */
export async function updateUnitAction(
  id: string,
  _prevState: UnitMutationFormState,
  formData: FormData,
): Promise<UnitMutationFormState> {
  const actor = await currentActor();

  try {
    await unidades.updateUnit(id, candidateFromFormData(formData), actor);
    return { status: 'success' };
  } catch (error) {
    return toErrorState(error);
  }
}

/** Borrado de unidad (R27): `id` viaja como campo OCULTO de `FormData` (`design.md > 8`), no
 *  hay entrada que validar con zod -el dominio no espera forma alguna, solo un identificador-. */
export async function deleteUnitAction(
  _prevState: UnitMutationFormState,
  formData: FormData,
): Promise<UnitMutationFormState> {
  const actor = await currentActor();
  const id = String(formData.get('id') ?? '');

  try {
    await unidades.deleteUnit(id, actor);
    return { status: 'success' };
  } catch (error) {
    return toErrorState(error);
  }
}
