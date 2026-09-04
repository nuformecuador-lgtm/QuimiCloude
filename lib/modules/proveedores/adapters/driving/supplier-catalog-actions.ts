'use server';

import { identity, proveedores } from '@/lib/composition';
import { ProveedoresError, type Actor, type CatalogLineView, type Page } from '@/lib/modules/proveedores';

/**
 * Server Actions del catalogo del proveedor (T14, R5, R42, R43, `design.md > 9`). Mismas
 * cuatro reglas que `supplier-actions.ts` -entrada por operacion, actor de
 * `identity.getSessionUser()`, la action no decide nada, errores por `code` estable- con
 * una diferencia propia: aqui SI hay conversiones que hacer.
 *
 * `FormData` solo entrega cadenas, y el esquema de la linea espera dos formas distintas:
 * - `cost` y `minPurchase` viajan como CADENA hasta el adaptador driven (`design.md > 6.2`):
 *   el importe no pasa por coma flotante en ningun punto, asi que aqui NO se convierten. Se
 *   entregan tal cual y `zod` los mide con el patron de `DECIMAL(14,4)`.
 * - `deliveryTime` es `z.number().int()`: hay que convertirlo. Una cadena no entera se
 *   rechaza AQUI -sin llamar al caso de uso- en vez de colarse como `NaN`, que
 *   `z.number().int()` trataria como un numero valido y el rechazo no ocurriria nunca.
 *   Mismo criterio y mismo sentinela que `inventario` (QC-20 T12).
 *
 * Un campo opcional que llega VACIO del formulario se trata como ausencia (`undefined`),
 * no como cadena vacia, tambien igual que `inventario`: `minPurchase` y `deliveryTime` son
 * opcionales (R30) y un `<input>` sin rellenar envia `''`. Esto es traduccion de la forma
 * del borde, no una regla de negocio: el costo, que es OBLIGATORIO, se entrega tal cual y
 * su vacio lo rechaza `zod`.
 */

export type CreateCatalogLineFormState =
  | { status: 'idle' }
  | { status: 'success'; id: string }
  | { status: 'error'; code: string; message: string };

export type CatalogLineMutationFormState =
  | { status: 'idle' }
  | { status: 'success' }
  | { status: 'error'; code: string; message: string };

export type CatalogLineListResult =
  | { status: 'success'; data: Page<CatalogLineView> }
  | { status: 'error'; code: string; message: string };

const NUMERIC_FIELD_ERROR = 'El tiempo de entrega no es un numero entero valido.';
const MISSING_ID_ERROR = 'Falta el identificador de la linea del catalogo.';

/** Sentinela de conversion fallida: distinto de `undefined` (campo omitido) y de todo numero. */
const INVALID_NUMBER = Symbol('invalid-number');

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
  return { id: sessionUser.id, roleName: sessionUser.roleName };
}

function readFormString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

function readOptionalFormString(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  return value;
}

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

/** Alta de linea (R25, R26, R27, R28, R29, R30, R31). */
export async function createCatalogLineAction(
  prevState: CreateCatalogLineFormState,
  formData: FormData,
): Promise<CreateCatalogLineFormState> {
  void prevState;

  const deliveryTime = readOptionalFormInt(formData, 'deliveryTime');
  if (deliveryTime === INVALID_NUMBER) {
    return { status: 'error', code: 'invalid_input', message: NUMERIC_FIELD_ERROR };
  }

  const candidate = {
    supplierId: readFormString(formData, 'supplierId'),
    productId: readFormString(formData, 'productId'),
    cost: readFormString(formData, 'cost'),
    minPurchase: readOptionalFormString(formData, 'minPurchase'),
    deliveryTime,
  };

  const actor = await currentActor();

  try {
    const { id } = await proveedores.createCatalogLine(candidate, actor);
    return { status: 'success', id };
  } catch (error) {
    return toErrorState(error);
  }
}

/**
 * Edicion de la linea: SOLO condiciones comerciales (R33). El candidato NO lleva
 * `supplierId` ni `productId` -y `updateCatalogLineSchema` es `strictObject`, asi que
 * colarlos daria `invalid_input` en vez de ignorarse en silencio-.
 */
export async function updateCatalogLineAction(
  id: string,
  prevState: CatalogLineMutationFormState,
  formData: FormData,
): Promise<CatalogLineMutationFormState> {
  void prevState;

  const deliveryTime = readOptionalFormInt(formData, 'deliveryTime');
  if (deliveryTime === INVALID_NUMBER) {
    return { status: 'error', code: 'invalid_input', message: NUMERIC_FIELD_ERROR };
  }

  const candidate = {
    cost: readFormString(formData, 'cost'),
    minPurchase: readOptionalFormString(formData, 'minPurchase'),
    deliveryTime,
  };

  const actor = await currentActor();

  try {
    await proveedores.updateCatalogLine(id, candidate, actor);
    return { status: 'success' };
  } catch (error) {
    return toErrorState(error);
  }
}

/** Baja FISICA de la linea (R34). El `id` viaja como campo oculto del formulario. */
export async function deleteCatalogLineAction(
  prevState: CatalogLineMutationFormState,
  formData: FormData,
): Promise<CatalogLineMutationFormState> {
  void prevState;

  const id = readFormString(formData, 'id');
  if (id === '') {
    return { status: 'error', code: 'invalid_input', message: MISSING_ID_ERROR };
  }

  const actor = await currentActor();

  try {
    await proveedores.deleteCatalogLine(id, actor);
    return { status: 'success' };
  } catch (error) {
    return toErrorState(error);
  }
}

/**
 * Listado paginado del catalogo de UN proveedor (R35, R36, R37). Consulta: argumentos ya
 * tipados -el `supplierId` sale de la URL y `{ page, pageSize }` ya son numeros-. `query`
 * es `unknown` porque quien lo valida es `pageQuerySchema`, dentro del caso de uso.
 */
export async function listCatalogLinesAction(
  supplierId: string,
  query: unknown,
): Promise<CatalogLineListResult> {
  const actor = await currentActor();

  try {
    const data = await proveedores.listCatalogLines(supplierId, query, actor);
    return { status: 'success', data };
  } catch (error) {
    return toErrorState(error);
  }
}
