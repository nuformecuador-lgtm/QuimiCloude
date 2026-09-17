'use server';

import { identity, inventario, observabilidad } from '@/lib/composition';
import { createErrorStateTranslator, type ErrorCode, type ErrorState } from '@/lib/modules/errores';
import { InventarioError, type Actor, type Page, type ProductView } from '@/lib/modules/inventario';
import { runInRequestScope } from '@/lib/shared/request-scope';

// Aqui no se repite `requirePermission`: es la primera linea de cada caso de uso.

export type CreateProductFormState =
  | { status: 'idle' }
  | { status: 'success'; id: string; lot: string }
  | ErrorState;

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

// Sin constante `INITIAL_STATE`: un archivo con `'use server'` solo puede exportar funciones async.

const NUMERIC_FIELD_ERROR = 'Uno o mas campos numericos no son un numero valido.';
const MISSING_ID_ERROR = 'Falta el identificador del producto.';

const INVALID_INPUT_CODE = 'invalid_input' satisfies ErrorCode;

/** Distinto de `undefined`, que significa campo ausente y es valido. */
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

/** El patron va antes de la conversion: sin el, `'1e3'` o `'0x10'` pasarian como enteros validos. */
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

const toErrorState = createErrorStateTranslator(InventarioError, observabilidad.readRequestIdHeader);

/**
 * La empresa sale de la sesion del servidor y nunca de la entrada: si viajara en el `FormData`,
 * quien invoca la action podria elegirla. Si falta el usuario o el contexto, el actor es `null` y
 * el caso de uso rechaza antes de tocar el repositorio.
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
 * Alta y edicion no comparten constructor: el esquema de edicion es `strictObject` sin campos de
 * lote, y cualquiera de ellos haria fallar la edicion con `invalid_input`. Importes y fechas pasan
 * como la cadena escrita; vacios llegan `undefined`, porque el esquema los acepta ausentes y `''`
 * seria invalido.
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
    purchaseDate: readOptionalFormString(formData, 'purchaseDate'),
  };
}

function buildUpdateProductCandidate(formData: FormData): unknown | typeof INVALID_NUMBER {
  return buildProductFields(formData);
}

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
    // Si el nombre ya existia, `id` es el del producto que ya estaba. `lot` es el TEXTO que
    // quedo escrito en el primer lote, generado o tecleado a mano.
    const { id, lot } = await inventario.createProduct(candidate, actor);
    return { status: 'success', id, lot };
  } catch (error) {
    return toErrorState(error);
  }
}

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

export async function getProductAction(id: string): Promise<ProductQueryResult> {
  const actor = await currentActor();

  try {
    const data = await inventario.getProduct(id, actor);
    return { status: 'success', data };
  } catch (error) {
    return toErrorState(error);
  }
}

/** `query` llega `unknown`: su forma la valida y la sanea el caso de uso, no esta action. */
export async function listProductsAction(query: unknown): Promise<ProductListResult> {
  const actor = await currentActor();

  try {
    const data = await inventario.listProducts(query, actor);
    return { status: 'success', data };
  } catch (error) {
    return toErrorState(error);
  }
}
