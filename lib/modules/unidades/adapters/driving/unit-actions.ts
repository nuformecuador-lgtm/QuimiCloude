'use server';

import { identity, unidades } from '@/lib/composition';
import { createErrorStateTranslator, type ErrorCode } from '@/lib/modules/errores';
import { UnidadesError, type Actor, type UnitRef } from '@/lib/modules/unidades';

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

export type UnitListResult =
  | { status: 'success'; data: readonly UnitRef[] }
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
 * Catalogo completo de unidades (R40, R41 de QC-32).
 *
 * QC-57: el caso de uso pasa a `listUnits(input, actor)` con la consulta OPCIONAL
 * (`design.md > 7`). Esta action sigue pidiendo el CATALOGO ENTERO -pasa `undefined`- y por eso
 * su firma no cambia: las tres pantallas que la llaman sin argumentos (el formulario de recetas
 * y el detalle de proveedor) siguen recibiendo `readonly UnitRef[]`, que es la primera
 * sobrecarga de `ListUnits`. **Quien abra la puerta al contrato aqui es QC-39**, la ficha de la
 * pantalla de unidades: mientras no haya pantalla que emita orden, filtro o pagina, exponerlo
 * seria un parametro que nadie manda.
 */
export async function listUnitsAction(): Promise<UnitListResult> {
  const actor = await currentActor();

  try {
    const data = await unidades.listUnits(undefined, actor);
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
