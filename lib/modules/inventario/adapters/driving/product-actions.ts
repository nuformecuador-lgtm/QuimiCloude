'use server';

import { identity, inventario } from '@/lib/composition';
import { createErrorStateTranslator, type ErrorCode, type ErrorState } from '@/lib/modules/errores';
import { InventarioError, type Actor, type Page, type ProductView } from '@/lib/modules/inventario';

/**
 * Server Actions del catalogo de producto (T12, R29, `design.md > 5`, `> 6.4`).
 *
 * FORMA DE ENTRADA, decidida por operacion:
 * - `create`/`update` son mutaciones que salen de un formulario (QC-22): reciben
 *   `FormData`. El esquema (`createProductSchema`/`updateProductSchema`) vive en el CASO
 *   DE USO -no aqui- y valida con `z.number()` los campos numericos; `FormData` solo
 *   entrega cadenas, asi que esta action convierte ANTES de llamar al caso de uso
 *   (`buildCreateProductCandidate`/`buildUpdateProductCandidate`). Una cadena no numerica en
 *   `stock` o `qtyAlert` se rechaza AQUI -sin llamar al caso de uso- en vez de
 *   colarse como `NaN`: `NaN` pasaria `z.number().int()` como un numero valido y el
 *   rechazo de R28 no ocurriria nunca.
 * - `delete` tambien es una mutacion de formulario (un boton con un campo oculto `id`):
 *   mismo tratamiento de `FormData` que create/update, sin campos numericos que convertir.
 * - `get`/`list` son consultas que invoca un Server/Client Component con datos que YA
 *   tiene tipados (un `id` de la URL, o una consulta de lista -`page`, `pageSize`, `sort`,
 *   `filters`, `search`- que quien llama ya construyo desde la URL): no hay formulario del
 *   que leer, asi que reciben argumentos tipados en vez de `FormData`. `listProductsAction`
 *   recibe `query: unknown` porque quien valida su forma es `createListQuerySchema()`,
 *   dentro del caso de uso (QC-57 R30); esta action no repite esa validacion, solo traduce
 *   el resultado.
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
 * LA ACTION NO DECIDE NADA (R31): no repite `requirePermission` -ya es la primera linea de cada
 * caso de uso- ni ninguna regla de negocio. Solo traduce `FormData`/argumentos a la
 * entrada del caso de uso, y el resultado o el error del caso de uso a un estado
 * serializable.
 *
 * ERRORES (`design.md > 6.4`, y QC-70 `design.md > 4.2`): las clases de `InventarioError`
 * se traducen a `{ status: 'error', code, message }` con el `code` ESTABLE de la clase
 * -nunca el texto- y el mensaje del CATALOGO. La traduccion ya no se escribe aqui: la hace
 * el traductor unico de `@/lib/modules/errores` (R10). Cualquier error que NO sea de dominio
 * deja de relanzarse y pasa a devolverse como `unexpected` con mensaje neutro (R12): el
 * detalle real -traza, SQL, nombres de tabla- va al log del servidor y nunca al navegador
 * (R13, R14). Nada de `catch` vacios (`docs/conventions.md`).
 */

/** Estado del alta: unico caso que devuelve datos ademas de exito/fracaso (el id creado). */
export type CreateProductFormState =
  | { status: 'idle' }
  | { status: 'success'; id: string }
  | ErrorState;

/** Estado compartido por edicion y borrado: ninguna de las dos devuelve datos. */
export type ProductMutationFormState =
  | { status: 'idle' }
  | { status: 'success' }
  | ErrorState;

export type ProductQueryResult =
  | { status: 'success'; data: ProductView }
  | ErrorState;

export type ProductListResult =
  | { status: 'success'; data: Page<ProductView> }
  | ErrorState;

// NO se exporta ninguna constante `INITIAL_STATE`: un archivo con `'use server'` solo
// puede exportar funciones async (restriccion real de Next.js sobre las Server Actions).
// `login-form-state.ts` resuelve esto en `identity` con un archivo SIN `'use server'`
// aparte; aqui no hay ese archivo -design.md > 1 solo lista `product-actions.ts` y
// `presentation-actions.ts` en `adapters/driving/`-, asi que quien consuma esta action
// (QC-22) construye el literal `{ status: 'idle' }` con el tipo exportado arriba.

/** Copy provisional (mismo criterio que S4 de `identity`), constante para que ningun test dependa del literal. */
const NUMERIC_FIELD_ERROR = 'Uno o mas campos numericos no son un numero valido.';
const MISSING_ID_ERROR = 'Falta el identificador del producto.';

/**
 * QC-70 (R21): el codigo que fabrican los tres rechazos DE ESTA ACTION -los que no vienen de una
 * clase de error de dominio- sale del CATALOGO y se tipa con `ErrorCode`, en vez de repetirse como
 * literal suelto en tres sitios. Era el unico de los siete adaptadores driving que quedaba sin
 * hacerlo; el valor no cambia. Con `ErrorState` en los tipos de retorno el compilador ya cazaba un
 * codigo mal escrito, asi que esto no tapa un agujero: unifica el idioma con los otros seis.
 */
const INVALID_INPUT_CODE: ErrorCode = 'invalid_input';

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

/**
 * QC-70 (R10, R12): la copia local de `toErrorState` desaparecio. Queda UNA implementacion,
 * en `@/lib/modules/errores`, parametrizada por la clase base de este modulo -mismo patron
 * con el que QC-54 parametriza `requirePermission` por el `UnauthorizedError` de cada modulo-.
 */
const toErrorState = createErrorStateTranslator(InventarioError);

/** El actor que exige R1/D17: se resuelve UNA vez por invocacion, nunca dentro del dominio. */
async function currentActor(): Promise<Actor | null> {
  const sessionUser = await identity.getSessionUser();
  if (sessionUser === null) return null;
  return { id: sessionUser.id, permissions: sessionUser.permissions };
}

/**
 * Los TRES campos del producto, leidos del `FormData` -eran cuatro hasta QC-80-. Devuelve
 * `INVALID_NUMBER` si algun campo numerico no es un entero -es la senal para que la action
 * rechace sin tocar el caso de uso-.
 *
 * QC-52 (R1, R5): NO se lee `cost`, `minPurchase` ni `deliveryTime` del `FormData`. Y si
 * alguien los enviara de todos modos, no llegarian aqui como campo del candidato: el
 * esquema es `strictObject` y el caso de uso los rechaza con `invalid_input`.
 *
 * QC-80 (R21): TAMPOCO se lee `unitId`, y por el mismo motivo elevado a la enesima: ya no
 * existe la columna. Que el formulario no lo pinte no bastaba -bastaba con que alguien lo
 * colara en el `FormData`-; que la action no lo LEA lo hace estructuralmente imposible, y si
 * llegara de todos modos el `strictObject` del esquema lo rechaza con `invalid_input` en vez
 * de ignorarlo en silencio.
 */
function buildProductFields(formData: FormData): Record<string, unknown> | typeof INVALID_NUMBER {
  const stock = readOptionalFormInt(formData, 'stock');
  const qtyAlert = readOptionalFormInt(formData, 'qtyAlert');

  if (stock === INVALID_NUMBER || qtyAlert === INVALID_NUMBER) {
    return INVALID_NUMBER;
  }

  return {
    name: readFormString(formData, 'name'),
    stock,
    qtyAlert,
  };
}

/**
 * Candidato del ALTA: los campos del producto MAS los cinco del primer lote (QC-90, R25).
 *
 * POR QUE HAY DOS CONSTRUCTORES Y NO UNO COMPARTIDO (R26). Hasta QC-90 el alta y la edicion
 * usaban el MISMO `buildProductCandidate`, porque enviaban lo mismo. Ya no: el alta valida
 * con `createProductWithFirstBatchSchema` -que conoce el lote- y la edicion con
 * `updateProductSchema`, que es `strictObject` y NO tiene ninguno de los cinco campos. Si el
 * candidato de la edicion ganara esos campos, cada edicion moriria con `invalid_input` por
 * campo desconocido. Ademas R26 lo pide de frente: en modo edicion el sistema no debe pedir
 * NI ENVIAR ningun campo de lote. Separar los dos constructores hace que eso sea
 * estructuralmente cierto -no hay rama que pueda equivocarse- en vez de depender de que
 * nadie toque un parametro.
 *
 * LOS IMPORTES VIAJAN COMO CADENA (R4). `unitCost` y `totalCost` se leen con
 * `readOptionalFormString` y se pasan TAL CUAL: ningun importe se convierte a numero de coma
 * flotante en ningun punto de este archivo. Quien valida su forma -`decimal(14,4)`- es el
 * esquema, dentro del caso de uso, y quien la convierte a `Prisma.Decimal` es el adaptador
 * driven. Aqui no se interpreta nada.
 *
 * UN CAMPO VACIO LLEGA AUSENTE, NO COMO CADENA VACIA. Los cuatro campos opcionales del lote
 * son `nullish()` en el esquema, asi que `undefined` es valido y `''` seria `invalid_input`.
 * `readOptionalFormString` ya devuelve `undefined` cuando el campo falta o queda vacio al
 * recortar, que es exactamente la traduccion que hace falta (R12).
 */
function buildCreateProductCandidate(formData: FormData): unknown | typeof INVALID_NUMBER {
  const fields = buildProductFields(formData);
  if (fields === INVALID_NUMBER) return INVALID_NUMBER;

  return {
    ...fields,
    presentationId: readOptionalFormString(formData, 'presentationId'),
    unitCost: readOptionalFormString(formData, 'unitCost'),
    totalCost: readOptionalFormString(formData, 'totalCost'),
    lot: readOptionalFormString(formData, 'lot'),
    expiryDate: readOptionalFormString(formData, 'expiryDate'),
  };
}

/**
 * Candidato de la EDICION: solo los campos del producto (R26). Aunque el `FormData` traiga
 * campos de lote -un formulario viejo cacheado, un `curl`-, no se leen: la edicion no crea
 * ni modifica ningun lote.
 */
function buildUpdateProductCandidate(formData: FormData): unknown | typeof INVALID_NUMBER {
  return buildProductFields(formData);
}

/**
 * Alta de producto (R5, R6, R9-R12, R28). Desde QC-90 (R1, R25) el alta crea TAMBIEN el
 * primer lote, asi que el candidato lleva los cinco campos del lote y el caso de uso lo
 * valida con `createProductWithFirstBatchSchema`. La action sigue sin decidir nada.
 */
export async function createProductAction(
  prevState: CreateProductFormState,
  formData: FormData,
): Promise<CreateProductFormState> {
  void prevState;

  const candidate = buildCreateProductCandidate(formData);
  if (candidate === INVALID_NUMBER) {
    return { status: 'error', code: INVALID_INPUT_CODE, message: NUMERIC_FIELD_ERROR };
  }

  const actor = await currentActor();

  try {
    // QC-90 (R17): el `id` que devuelve el caso de uso es el del producto resultante, que
    // cuando el nombre ya existia es el del producto QUE YA ESTABA. `CreateProductFormState`
    // no cambia de forma por eso.
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

  const candidate = buildUpdateProductCandidate(formData);
  if (candidate === INVALID_NUMBER) {
    return { status: 'error', code: INVALID_INPUT_CODE, message: NUMERIC_FIELD_ERROR };
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
    return { status: 'error', code: INVALID_INPUT_CODE, message: MISSING_ID_ERROR };
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
 * llama ya tiene la consulta de lista construida, p. ej. desde la URL-. La cadena entera
 * vive DENTRO del caso de uso (QC-57 R30) y esta action no repite ni un paso:
 * `createListQuerySchema()` valida la FORMA, `sanitizeListQuery` poda contra
 * `PRODUCT_QUERYABLE` -lo no declarado se omite y NO hace fallar la consulta (R5)-, el
 * caso de uso registra los campos omitidos por el puerto `ListQueryLog` (R6) y el
 * repositorio recibe la consulta YA SANEADA (R13).
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
