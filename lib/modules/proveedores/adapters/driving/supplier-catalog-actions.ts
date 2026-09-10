'use server';

import { identity, proveedores } from '@/lib/composition';
import { createErrorStateTranslator, type ErrorCode } from '@/lib/modules/errores';
import { ProveedoresError, type Actor, type CatalogLineView, type Page } from '@/lib/modules/proveedores';

/**
 * Server Actions del catalogo del proveedor (T14, R5, R42, R43, `design.md > 9`). Mismas
 * cuatro reglas que `supplier-actions.ts` -entrada por operacion, actor de
 * `identity.getSessionUser()`, la action no decide nada, errores por `code` estable- con
 * una diferencia propia: aqui SI hay conversiones que hacer.
 *
 * `FormData` solo entrega cadenas, y el esquema de la linea espera dos formas distintas:
 * - `cost` y `minPurchase` viajan como CADENA hasta el adaptador driven (R11): el importe no
 *   pasa por coma flotante en ningun punto, asi que aqui NO se convierten. Se entregan tal
 *   cual y `zod` los mide con el patron de `DECIMAL(14,4)`.
 * - `deliveryTime` es `z.number().int()`: hay que convertirlo. Una cadena no entera se
 *   rechaza AQUI -sin llamar al caso de uso- en vez de colarse como `NaN`, que
 *   `z.number().int()` trataria como un numero valido y el rechazo no ocurriria nunca.
 *   Mismo criterio y mismo sentinela que `inventario` (QC-20 T12).
 *
 * Un campo opcional que llega VACIO del formulario se trata como ausencia (`undefined`),
 * no como cadena vacia, tambien igual que `inventario`: `unitId`, `imagePath`, `minPurchase`
 * y `deliveryTime` son opcionales (R10) y un `<input>` sin rellenar envia `''`. Esto es
 * traduccion de la forma del borde, no una regla de negocio: los OBLIGATORIOS -`name`,
 * `presentationId` y `cost`- se entregan tal cual y su vacio lo rechaza `zod`.
 *
 * QC-52 cambia lo que se lee del formulario (R31): entra `name`, `presentationId`, `unitId`
 * e `imagePath`, y sale el identificador de articulo del inventario que QC-43 leia. Ningun
 * route handler nuevo y ningun `fetch` a una ruta propia: siguen siendo Server Actions.
 */

export type CreateCatalogLineFormState =
  | { status: 'idle' }
  | { status: 'success'; id: string }
  | { status: 'error'; code: ErrorCode; message: string };

export type CatalogLineMutationFormState =
  | { status: 'idle' }
  | { status: 'success' }
  | { status: 'error'; code: ErrorCode; message: string };

export type CatalogLineListResult =
  | { status: 'success'; data: Page<CatalogLineView> }
  | { status: 'error'; code: ErrorCode; message: string };

const NUMERIC_FIELD_ERROR = 'El tiempo de entrega no es un numero entero valido.';
const MISSING_ID_ERROR = 'Falta el identificador de la linea del catalogo.';

/** Sentinela de conversion fallida: distinto de `undefined` (campo omitido) y de todo numero. */
const INVALID_NUMBER = Symbol('invalid-number');

/**
 * El traductor UNICO (R10), el mismo que usa `supplier-actions.ts`. QC-70 borra la copia
 * que vivia aqui: un error ajeno a la familia ya no se relanza, vuelve como `unexpected`
 * con mensaje neutro y su detalle se queda en el registro del servidor (R12, R13, R14).
 */
const toErrorState = createErrorStateTranslator(ProveedoresError);

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

/** Alta de linea (R10, R14, R15, R23, R25, R31). */
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
    name: readFormString(formData, 'name'),
    presentationId: readFormString(formData, 'presentationId'),
    unitId: readOptionalFormString(formData, 'unitId'),
    imagePath: readOptionalFormString(formData, 'imagePath'),
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
 * Edicion de la linea: REEMPLAZO COMPLETO de los siete campos de negocio (R24, P6). El
 * candidato NO lleva `supplierId` -y `updateCatalogLineSchema` es `strictObject`, asi que
 * colarlo daria `invalid_input` en vez de ignorarse en silencio-: el proveedor de una linea
 * es lo unico que la edicion no puede cambiar.
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
    name: readFormString(formData, 'name'),
    presentationId: readFormString(formData, 'presentationId'),
    unitId: readOptionalFormString(formData, 'unitId'),
    imagePath: readOptionalFormString(formData, 'imagePath'),
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

/**
 * Baja LOGICA de la linea (R21). El `id` viaja como campo oculto del formulario. QC-52
 * cambia lo que ocurre por debajo -la fila se marca en vez de borrarse- sin cambiar ni la
 * firma de la action ni el estado que devuelve.
 */
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
 * Listado paginado del catalogo de UN proveedor (R22, R23). Consulta: argumentos ya
 * tipados -el `supplierId` sale de la URL y la consulta de lista la construye quien llama-.
 * `query` es `unknown` porque la cadena entera vive dentro del caso de uso (QC-57 R30):
 * `createListQuerySchema()` valida la forma, `sanitizeListQuery` poda contra
 * `SUPPLIER_CATALOG_LINE_QUERYABLE`, el caso de uso registra lo omitido por el puerto
 * `ListQueryLog` y el puerto recibe la consulta ya saneada.
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
