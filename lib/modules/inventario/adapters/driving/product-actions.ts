'use server';

import { identity, inventario } from '@/lib/composition';
import { InventarioError, type Actor, type Page, type ProductView } from '@/lib/modules/inventario';

/**
 * Server Actions del catalogo de producto (T12, R29, `design.md > 5`, `> 6.4`).
 *
 * FORMA DE ENTRADA, decidida por operacion:
 * - `create`/`update` son mutaciones que salen de un formulario (QC-22): reciben
 *   `FormData`. El esquema (`createProductSchema`/`updateProductSchema`) vive en el CASO
 *   DE USO -no aqui- y valida con `z.number()` los campos numericos; `FormData` solo
 *   entrega cadenas, asi que esta action convierte ANTES de llamar al caso de uso
 *   (`buildProductCandidate`). Una cadena no numerica en `stock`, `minPurchase`,
 *   `deliveryTime` o `qtyAlert` se rechaza AQUI -sin llamar al caso de uso- en vez de
 *   colarse como `NaN`: `NaN` pasaria `z.number().int()` como un numero valido y el
 *   rechazo de R28 no ocurriria nunca.
 * - `delete` tambien es una mutacion de formulario (un boton con un campo oculto `id`):
 *   mismo tratamiento de `FormData` que create/update, sin campos numericos que convertir.
 * - `get`/`list` son consultas que invoca un Server/Client Component con datos que YA
 *   tiene tipados (un `id` de la URL, o `{ page, pageSize }` ya parseados a numero por
 *   quien llama): no hay formulario del que leer, asi que reciben argumentos tipados en
 *   vez de `FormData`. `listProductsAction` recibe `query: unknown` porque quien valida su
 *   forma sigue siendo `pageQuerySchema`, dentro del caso de uso (R28); esta action no
 *   repite esa validacion, solo traduce el resultado.
 *
 * EL ACTOR sale de `identity.getSessionUser()` via `@/lib/composition` (`design.md > 5`,
 * D17): ningun caso de uso lee sesion, cookie ni cabecera por su cuenta. Hoy
 * `getSessionUser` esta cableado a la sesion REAL (`session-cookie.ts` +
 * `session-user-prisma.ts`, QC-8, que ya esta `done` en este arbol): sin cookie de sesion
 * valida devuelve `null`, y entonces el actor que llega a los nueve casos de uso es
 * `null` -R3 lo rechaza igual que un rol desconocido, falla cerrado-. (El `design.md` de
 * esta ficha documenta el estado ANTERIOR a QC-8, cuando `getSessionUser` era el stub de
 * QC-7 con `id: 'placeholder-user'` y una mutacion pasaba la autorizacion pero moria en la
 * FK de R7; QC-8 ya sustituyo ese cableado en `lib/composition`, sin que `inventario`
 * tuviera que cambiar una linea, tal como preveia D17.)
 *
 * LA ACTION NO DECIDE NADA (R31): no repite `requireAdmin` -ya es la primera linea de cada
 * caso de uso- ni ninguna regla de negocio. Solo traduce `FormData`/argumentos a la
 * entrada del caso de uso, y el resultado o el error del caso de uso a un estado
 * serializable.
 *
 * ERRORES (`design.md > 6.4`): las clases de `InventarioError` se traducen a
 * `{ status: 'error', code, message }` con el `code` ESTABLE de la clase -nunca el texto-,
 * mismo patron que `LoginFormState` de `identity`. Cualquier error que NO sea de dominio
 * se relanza: nada de `catch` vacios (`docs/conventions.md`).
 */

/** Estado del alta: unico caso que devuelve datos ademas de exito/fracaso (el id creado). */
export type CreateProductFormState =
  | { status: 'idle' }
  | { status: 'success'; id: string }
  | { status: 'error'; code: string; message: string };

/** Estado compartido por edicion y borrado: ninguna de las dos devuelve datos. */
export type ProductMutationFormState =
  | { status: 'idle' }
  | { status: 'success' }
  | { status: 'error'; code: string; message: string };

export type ProductQueryResult =
  | { status: 'success'; data: ProductView }
  | { status: 'error'; code: string; message: string };

export type ProductListResult =
  | { status: 'success'; data: Page<ProductView> }
  | { status: 'error'; code: string; message: string };

// NO se exporta ninguna constante `INITIAL_STATE`: un archivo con `'use server'` solo
// puede exportar funciones async (restriccion real de Next.js sobre las Server Actions).
// `login-form-state.ts` resuelve esto en `identity` con un archivo SIN `'use server'`
// aparte; aqui no hay ese archivo -design.md > 1 solo lista `product-actions.ts` y
// `presentation-actions.ts` en `adapters/driving/`-, asi que quien consuma esta action
// (QC-22) construye el literal `{ status: 'idle' }` con el tipo exportado arriba.

/** Copy provisional (mismo criterio que S4 de `identity`), constante para que ningun test dependa del literal. */
const NUMERIC_FIELD_ERROR = 'Uno o mas campos numericos no son un numero valido.';
const MISSING_ID_ERROR = 'Falta el identificador del producto.';

/** Sentinela de conversion fallida: distinto de `undefined` (campo ausente, valido) y de cualquier numero real. */
const INVALID_NUMBER = Symbol('invalid-number');

function readFormString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

function readOptionalFormString(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  return value;
}

/**
 * `FormData` solo entrega cadenas. Una cadena vacia o ausente es "campo omitido" (R5 de
 * QC-14: la ausencia, no un valor); una cadena presente que NO es un entero se marca con
 * `INVALID_NUMBER` para que la action rechace ANTES de llamar al caso de uso, en vez de
 * dejar pasar un `Number('abc')` (`NaN`) que `z.number().int()` trataria como valido.
 */
function readOptionalFormInt(
  formData: FormData,
  name: string,
): number | undefined | typeof INVALID_NUMBER {
  const value = formData.get(name);
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) return INVALID_NUMBER;
  return Number(trimmed);
}

/** Traduce un error de dominio a estado serializable; relanza cualquier otro (`docs/conventions.md`). */
function toErrorState(error: unknown): { status: 'error'; code: string; message: string } {
  if (error instanceof InventarioError) {
    return { status: 'error', code: error.code, message: error.message };
  }
  throw error;
}

/** El actor que exige R1/D17: se resuelve UNA vez por invocacion, nunca dentro del dominio. */
async function currentActor(): Promise<Actor | null> {
  const sessionUser = await identity.getSessionUser();
  if (sessionUser === null) return null;
  return { id: sessionUser.id, roleName: sessionUser.roleName };
}

/**
 * Construye la entrada `unknown` que espera `createProductSchema`/`updateProductSchema`
 * a partir de un `FormData`. Devuelve `INVALID_NUMBER` si algun campo numerico no es un
 * entero -es la senal para que la action rechace sin tocar el caso de uso-.
 */
function buildProductCandidate(formData: FormData): unknown | typeof INVALID_NUMBER {
  const stock = readOptionalFormInt(formData, 'stock');
  const minPurchase = readOptionalFormInt(formData, 'minPurchase');
  const deliveryTime = readOptionalFormInt(formData, 'deliveryTime');
  const qtyAlert = readOptionalFormInt(formData, 'qtyAlert');

  if (
    stock === INVALID_NUMBER ||
    minPurchase === INVALID_NUMBER ||
    deliveryTime === INVALID_NUMBER ||
    qtyAlert === INVALID_NUMBER
  ) {
    return INVALID_NUMBER;
  }

  return {
    name: readFormString(formData, 'name'),
    presentationId: readFormString(formData, 'presentationId'),
    stock,
    cost: readOptionalFormString(formData, 'cost'),
    minPurchase,
    deliveryTime,
    qtyAlert,
    unit: readOptionalFormString(formData, 'unit'),
  };
}

/** Alta de producto (R5, R6, R9-R12, R28). */
export async function createProductAction(
  prevState: CreateProductFormState,
  formData: FormData,
): Promise<CreateProductFormState> {
  void prevState;

  const candidate = buildProductCandidate(formData);
  if (candidate === INVALID_NUMBER) {
    return { status: 'error', code: 'invalid_input', message: NUMERIC_FIELD_ERROR };
  }

  const actor = await currentActor();

  try {
    const { id } = await inventario.createProduct(candidate, actor);
    return { status: 'success', id };
  } catch (error) {
    return toErrorState(error);
  }
}

/** Edicion de producto: reemplazo completo (D3, R13, R14, R28). */
export async function updateProductAction(
  id: string,
  prevState: ProductMutationFormState,
  formData: FormData,
): Promise<ProductMutationFormState> {
  void prevState;

  const candidate = buildProductCandidate(formData);
  if (candidate === INVALID_NUMBER) {
    return { status: 'error', code: 'invalid_input', message: NUMERIC_FIELD_ERROR };
  }

  const actor = await currentActor();

  try {
    await inventario.updateProduct(id, candidate, actor);
    return { status: 'success' };
  } catch (error) {
    return toErrorState(error);
  }
}

/** Borrado logico de producto (R14, R15, R16). El `id` viaja como campo oculto del formulario. */
export async function deleteProductAction(
  prevState: ProductMutationFormState,
  formData: FormData,
): Promise<ProductMutationFormState> {
  void prevState;

  const id = readFormString(formData, 'id');
  if (id === '') {
    return { status: 'error', code: 'invalid_input', message: MISSING_ID_ERROR };
  }

  const actor = await currentActor();

  try {
    await inventario.deleteProduct(id, actor);
    return { status: 'success' };
  } catch (error) {
    return toErrorState(error);
  }
}

/** Ficha de producto (R14, R16). Consulta: argumento tipado, no `FormData`. */
export async function getProductAction(id: string): Promise<ProductQueryResult> {
  const actor = await currentActor();

  try {
    const data = await inventario.getProduct(id, actor);
    return { status: 'success', data };
  } catch (error) {
    return toErrorState(error);
  }
}

/**
 * Lista paginada de productos (R23-R26, R35, R36). Consulta: argumento tipado -quien
 * llama ya tiene `{ page, pageSize }` como numeros, p. ej. parseados de la URL-. La
 * validacion del minimo y la integridad la hace `pageQuerySchema` DENTRO del caso de uso
 * (R28); esta action no la repite.
 */
export async function listProductsAction(query: unknown): Promise<ProductListResult> {
  const actor = await currentActor();

  try {
    const data = await inventario.listProducts(query, actor);
    return { status: 'success', data };
  } catch (error) {
    return toErrorState(error);
  }
}
