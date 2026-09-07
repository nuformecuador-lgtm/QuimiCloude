'use server';

import { identity, proveedores } from '@/lib/composition';
import { ProveedoresError, type Actor, type Page, type SupplierView } from '@/lib/modules/proveedores';

/**
 * Server Actions del proveedor (T14, R5, R42, R43, `design.md > 9`).
 *
 * FORMA DE ENTRADA, decidida por operacion (decision cerrada 10, patron de `inventario`):
 * - `create`/`update`/`delete` son mutaciones que salen de un formulario (QC-44): reciben
 *   `FormData`. El esquema (`createSupplierSchema`/`updateSupplierSchema`) vive en el CASO
 *   DE USO, no aqui, y esta action NO lo repite: solo extrae los campos del formulario.
 *   El proveedor no tiene ningun campo numerico -`phone` y `email` son texto libre y los
 *   largos los mide `zod`-, asi que aqui no hay ninguna conversion que hacer: lo que
 *   `FormData` entrega (cadenas) es exactamente lo que el esquema espera. La conversion de
 *   `''` a ausencia tampoco se hace aqui: la hace `blankToNull` DENTRO del esquema (R13),
 *   y adelantarla seria repetir una regla de negocio en el borde.
 * - `get`/`list` son consultas que invoca un Server Component con datos que YA tiene
 *   tipados (un `id` de la URL, o una consulta de lista que quien llama ya construyo): no
 *   hay formulario del que leer. `listSuppliersAction` recibe `query: unknown` porque quien
 *   valida su forma es `createListQuerySchema()`, dentro del caso de uso (QC-57 R30).
 *
 * EL ACTOR sale de `identity.getSessionUser()` via `@/lib/composition` (R5, decision
 * cerrada 11): ningun caso de uso lee sesion, cookie ni cabecera por su cuenta. Sin cookie
 * de sesion valida `getSessionUser` devuelve `null`, y entonces el actor que llega al caso
 * de uso es `null`: falla cerrado, igual que un actor sin el permiso exigido (QC-74 R14).
 * El actor viaja como `{ id, permissions }` —sin nombre de rol (QC-74 R18)—.
 *
 * LA ACTION NO DECIDE NADA (R5): no repite la comprobacion de permiso -ya es la primera
 * linea de los nueve casos de uso- ni ninguna regla de negocio. Solo traduce `FormData`/argumentos a la
 * entrada del caso de uso, y el resultado o el error a un estado serializable.
 *
 * ERRORES (`design.md > 6.4`, R43): las clases de `ProveedoresError` se traducen a
 * `{ status: 'error', code, message }` con el `code` ESTABLE de la clase -nunca el texto-.
 * Cualquier error que NO sea de dominio se RELANZA: nada de `catch` vacios
 * (`docs/conventions.md`).
 *
 * SIN `revalidatePath` (`design.md > 9`): esta ficha no crea ninguna pantalla (R47) y
 * adivinar la ruta de QC-44 seria inventarla. QC-44 decide que revalida.
 */

/** Estado del alta: unico caso que devuelve datos ademas de exito/fracaso (el id creado). */
export type CreateSupplierFormState =
  | { status: 'idle' }
  | { status: 'success'; id: string }
  | { status: 'error'; code: string; message: string };

/** Estado compartido por edicion y baja: ninguna de las dos devuelve datos. */
export type SupplierMutationFormState =
  | { status: 'idle' }
  | { status: 'success' }
  | { status: 'error'; code: string; message: string };

export type SupplierQueryResult =
  | { status: 'success'; data: SupplierView }
  | { status: 'error'; code: string; message: string };

export type SupplierListResult =
  | { status: 'success'; data: Page<SupplierView> }
  | { status: 'error'; code: string; message: string };

// NO se exporta ninguna constante `INITIAL_STATE`: un archivo con `'use server'` solo puede
// exportar funciones async (restriccion real de Next.js). Quien consuma estas actions
// (QC-44) construye el literal `{ status: 'idle' }` con el tipo exportado arriba.

/** Copy provisional, en una constante para que ningun test dependa del literal. */
const MISSING_ID_ERROR = 'Falta el identificador del proveedor.';

/** Traduce un error de dominio a estado serializable; relanza cualquier otro. */
function toErrorState(error: unknown): { status: 'error'; code: string; message: string } {
  if (error instanceof ProveedoresError) {
    return { status: 'error', code: error.code, message: error.message };
  }
  throw error;
}

/** El actor que exige R5: se resuelve UNA vez por invocacion, nunca dentro del dominio. */
async function currentActor(): Promise<Actor | null> {
  const sessionUser = await identity.getSessionUser();
  if (sessionUser === null) return null;
  return { id: sessionUser.id, permissions: sessionUser.permissions };
}

function readFormString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

/**
 * Un campo de texto ausente en el `FormData` es AUSENCIA (`undefined`), no cadena vacia:
 * `phone` y `email` son opcionales y el formulario de QC-44 puede no enviarlos. Lo que si
 * llega vacio o en blanco lo convierte en ausencia `blankToNull`, dentro del esquema (R13);
 * aqui no se recorta ni se anula nada.
 */
function readOptionalFormString(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === 'string' ? value : undefined;
}

/** El candidato `unknown` que espera `createSupplierSchema`/`updateSupplierSchema`. */
function buildSupplierCandidate(formData: FormData): unknown {
  return {
    name: readFormString(formData, 'name'),
    phone: readOptionalFormString(formData, 'phone'),
    email: readOptionalFormString(formData, 'email'),
  };
}

/** Alta de proveedor (R7, R8, R9, R10, R11, R15, R16). */
export async function createSupplierAction(
  prevState: CreateSupplierFormState,
  formData: FormData,
): Promise<CreateSupplierFormState> {
  void prevState;

  const actor = await currentActor();

  try {
    const { id } = await proveedores.createSupplier(buildSupplierCandidate(formData), actor);
    return { status: 'success', id };
  } catch (error) {
    return toErrorState(error);
  }
}

/** Edicion de proveedor: reemplazo completo del conjunto de campos (R13, R14). */
export async function updateSupplierAction(
  id: string,
  prevState: SupplierMutationFormState,
  formData: FormData,
): Promise<SupplierMutationFormState> {
  void prevState;

  const actor = await currentActor();

  try {
    await proveedores.updateSupplier(id, buildSupplierCandidate(formData), actor);
    return { status: 'success' };
  } catch (error) {
    return toErrorState(error);
  }
}

/** Baja LOGICA del proveedor (R22, R23, R24). El `id` viaja como campo oculto del formulario. */
export async function deleteSupplierAction(
  prevState: SupplierMutationFormState,
  formData: FormData,
): Promise<SupplierMutationFormState> {
  void prevState;

  const id = readFormString(formData, 'id');
  if (id === '') {
    return { status: 'error', code: 'invalid_input', message: MISSING_ID_ERROR };
  }

  const actor = await currentActor();

  try {
    await proveedores.deleteSupplier(id, actor);
    return { status: 'success' };
  } catch (error) {
    return toErrorState(error);
  }
}

/** Ficha del proveedor (R24, R35). Consulta: argumento tipado, no `FormData`. */
export async function getSupplierAction(id: string): Promise<SupplierQueryResult> {
  const actor = await currentActor();

  try {
    const data = await proveedores.getSupplier(id, actor);
    return { status: 'success', data };
  } catch (error) {
    return toErrorState(error);
  }
}

/**
 * Lista paginada de proveedores (R18-R22, R35). Consulta: argumento tipado -quien llama ya
 * tiene la consulta de lista construida-. `query` es `unknown` porque la cadena entera vive
 * dentro del caso de uso (QC-57 R30): `createListQuerySchema()` valida la forma,
 * `sanitizeListQuery` poda contra `SUPPLIER_QUERYABLE`, el caso de uso registra lo omitido
 * por el puerto `ListQueryLog` y el puerto recibe la consulta ya saneada. Esta action no
 * repite ninguno de esos pasos.
 */
export async function listSuppliersAction(query: unknown): Promise<SupplierListResult> {
  const actor = await currentActor();

  try {
    const data = await proveedores.listSuppliers(query, actor);
    return { status: 'success', data };
  } catch (error) {
    return toErrorState(error);
  }
}
