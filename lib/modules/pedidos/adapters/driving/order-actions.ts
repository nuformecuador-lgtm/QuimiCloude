'use server';

import { identity, observabilidad, pedidos } from '@/lib/composition';
import {
  createErrorStateTranslator,
  type ErrorCode,
  type ErrorState,
} from '@/lib/modules/errores';
import {
  PedidosError,
  type Actor,
  type OrderSummary,
  type OrderView,
  type Page,
} from '@/lib/modules/pedidos';
import { runInRequestScope } from '@/lib/shared/request-scope';

// Solo el TIPO, del contrato publico de `inventario`: la arista `pedidos -> inventario` ya
// existe (`design.md > 5.1`).
import type { OrderCoverage } from '@/lib/modules/inventario';

/**
 * Server Actions del pedido (T15, R5, R54, R56, `design.md > 9`). Copia en forma de
 * `lib/modules/proveedores/adapters/driving/supplier-actions.ts`, que a su vez copia la de
 * `inventario`: la action se prueba contra dobles y nunca contra la sesion real.
 *
 * FORMA DE ENTRADA, decidida por operacion (decision cerrada 19, R54):
 * - `create`/`update`/`cancel`/`delete` son mutaciones que salen de un formulario (QC-35):
 *   reciben `FormData`. Los esquemas (`createOrderSchema`, `updateOrderSchema`,
 *   `cancelOrderSchema`) viven en el CASO DE USO y esta action NO los repite: solo extrae
 *   los campos del formulario y los entrega como candidato `unknown`.
 * - `get`/`list` son consultas que invoca un Server Component con datos que YA tiene tipados
 *   (un `id` de la URL, o una consulta de lista que quien llama ya construyo): no hay
 *   formulario del que leer. `listOrdersAction` recibe `query: unknown` porque quien valida
 *   su forma es `createListQuerySchema()`, dentro del caso de uso (QC-57 R30).
 *   `listOrdersSchema` YA NO EXISTE: el estado y la prioridad dejaron de ser parametros
 *   propios y entran como filtros `select` del contrato generico (QC-57 R25).
 *
 * LA CANTIDAD NO SE CONVIERTE AQUI: `quantity` viaja como CADENA decimal
 * hasta el adaptador driven (`design.md > 7.1`). Pasarlos por `Number` seria el redondeo
 * binario que `docs/architecture.md > Anti-patrones` prohibe, y ademas destruiria la
 * validacion de forma que hace `zod` sobre el texto.
 *
 * EL ACTOR sale de `identity.getSessionUser()` via `@/lib/composition` (R5, decision cerrada
 * 18): ningun caso de uso lee sesion, cookie ni cabecera por su cuenta. Sin cookie de sesion
 * valida `getSessionUser` devuelve `null`, y entonces el actor que llega al caso de uso es
 * `null`: el caso de uso lo rechaza igual que un actor sin el permiso, falla cerrado.
 *
 * LA ACTION NO DECIDE NADA (R5): no repite `requirePermission` -ya es la primera linea de los seis
 * casos de uso-, no comprueba estados, no evalua transiciones y no aplica ninguna otra regla.
 * Solo traduce `FormData`/argumentos a la entrada del caso de uso, y el resultado o el error
 * a un estado serializable.
 *
 * ERRORES (R56, y QC-70 R10-R14): las clases de `PedidosError` se traducen a
 * `{ status: 'error', code, message }` con el `code` ESTABLE de la clase -NUNCA el texto del
 * mensaje-, y el mensaje sale del CATALOGO. La traduccion no se escribe aqui: es
 * `createErrorStateTranslator`, la unica implementacion del repositorio.
 *
 * QC-70 CAMBIA el trato del error AJENO: antes se RELANZABA -y reventaba la pantalla con la
 * pagina de error del framework, a veces con un mensaje de Prisma dentro-. Ahora se devuelve
 * como `unexpected` con mensaje neutro y el error original se entrega al registro del servidor,
 * que es el unico sitio donde ese detalle aparece (R12, R13, R14). Sigue sin haber ningun
 * `catch` vacio (`docs/conventions.md`): el error no se traga, se registra.
 *
 * SIN `revalidatePath` y SIN ningun route handler (`design.md > 9`, R54): esta ficha no crea
 * ninguna pantalla (R57), asi que no hay ruta que revalidar y adivinar la de QC-35 seria
 * inventarla. QC-35 decide que revalida. Tampoco hay `fetch` a ninguna ruta propia.
 */

/** Estado del alta: unico caso que devuelve datos ademas de exito/fracaso (el pedido creado
 *  con su correlativo, R8). */
export type CreateOrderFormState =
  | { status: 'idle' }
  | { status: 'success'; id: string; numberText: string }
  | ErrorState;

/** Estado compartido por edicion, cancelacion y borrado: ninguna de las tres devuelve datos. */
export type OrderMutationFormState =
  | { status: 'idle' }
  | { status: 'success' }
  | ErrorState;

export type OrderQueryResult =
  | { status: 'success'; data: OrderView }
  | ErrorState;

export type OrderListResult =
  | { status: 'success'; data: Page<OrderSummary> }
  | ErrorState;

// NO se exporta ninguna constante `INITIAL_STATE`: un archivo con `'use server'` solo puede
// exportar funciones async (restriccion real de Next.js). Quien consuma estas actions (QC-35)
// construye el literal `{ status: 'idle' }` con el tipo exportado arriba.

/** Copy provisional, en una constante para que ningun test dependa del literal. */
const MISSING_ID_ERROR = 'Falta el identificador del pedido.';

/**
 * `code` de la entrada que ni siquiera llega a formarse. Es el MISMO codigo que publica
 * `ValidationError` del dominio, y no una segunda taxonomia: quien consuma estas actions
 * decide por el `code` y no puede tener que conocer dos para el mismo caso.
 *
 * QC-70 (R21): sale del CATALOGO -tipado `ErrorCode`- en vez de ser un literal escrito aqui,
 * asi que renombrarlo en el catalogo rompe el typecheck en vez de dejar esta linea mintiendo.
 * El MENSAJE que lo acompana (`MISSING_ID_ERROR`) es de esta action, no del catalogo: es su
 * propia comprobacion de entrada, y R31 no la migra.
 */
const INVALID_INPUT_CODE = 'invalid_input' satisfies ErrorCode;

/**
 * QC-70 (R10): la UNICA implementacion del traductor vive en `@/lib/modules/errores`. Aqui
 * solo se ata a la clase base de ESTE modulo, igual que QC-54 parametriza `requireAdmin` por
 * el `UnauthorizedError` de cada modulo. La copia que este archivo llevaba -una de siete
 * identicas, byte a byte- desaparecio con esta ficha.
 */
const toErrorState = createErrorStateTranslator(PedidosError, observabilidad.readRequestIdHeader);

/**
 * El actor: se resuelve UNA vez por invocacion, nunca dentro del dominio.
 *
 * Usuario y contexto de empresa salen de la sesion del servidor, en paralelo; si falta cualquiera
 * de los dos devuelve `null` y el caso de uso rechaza antes de tocar ningun puerto. La empresa
 * jamas sale de la entrada del llamante: si no, elegirla seria escribir otro uuid en el formulario.
 */
async function currentActor(): Promise<Actor | null> {
  // El ambito envuelve solo este `Promise.all`: las dos caras comparten una lectura de sesion.
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

function readFormString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

/**
 * Un campo AUSENTE del formulario es ausencia (`undefined`), no cadena vacia. Lo usa solo la
 * prioridad, que es el unico campo opcional del alta (R9): si el formulario no la envia, el
 * esquema aplica `BAJA` por defecto. Si la envia vacia, el esquema la rechaza como valor
 * fuera del conjunto cerrado (R19) — y eso es correcto: convertir el blanco en ausencia aqui
 * seria una regla de negocio en el borde, y el borde no decide (R5).
 */
function readOptionalFormString(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === 'string' ? value : undefined;
}

/** El candidato `unknown` que espera `createOrderSchema`. No lleva `status`, ni motivo, ni
 *  correlativo, ni autores: lo que el esquema no declara no puede llegar (R6, R9). */
function buildCreateCandidate(formData: FormData): unknown {
  return {
    recipeId: readFormString(formData, 'recipeId'),
    quantity: readFormString(formData, 'quantity'),
    priority: readOptionalFormString(formData, 'priority'),
    presentationId: readFormString(formData, 'presentationId'),
  };
}

/**
 * El candidato de la edicion: los mismos campos del alta MAS el estado, porque la edicion es
 * un REEMPLAZO COMPLETO (R20). No lleva `reason`, y un `status` de cancelacion lo rechaza
 * `updateOrderSchema` en el borde sin llegar al repositorio (R24).
 */
function buildUpdateCandidate(formData: FormData): unknown {
  return {
    ...(buildCreateCandidate(formData) as object),
    status: readFormString(formData, 'status'),
  };
}

/** Alta de pedido (R8, R9, R15, R16). Devuelve el id y el numero visible ya compuesto. */
export async function createOrderAction(
  prevState: CreateOrderFormState,
  formData: FormData,
): Promise<CreateOrderFormState> {
  void prevState;

  const actor = await currentActor();

  try {
    const created = await pedidos.createOrder(buildCreateCandidate(formData), actor);
    return { status: 'success', id: created.id, numberText: created.numberText };
  } catch (error) {
    return toErrorState(error);
  }
}

/** Edicion de pedido: reemplazo completo del conjunto de datos de negocio (R20, R21, R22).
 *  El `id` es ARGUMENTO y no campo del formulario, como en `proveedores`. */
export async function updateOrderAction(
  id: string,
  prevState: OrderMutationFormState,
  formData: FormData,
): Promise<OrderMutationFormState> {
  void prevState;

  const actor = await currentActor();

  try {
    await pedidos.updateOrder(id, buildUpdateCandidate(formData), actor);
    return { status: 'success' };
  } catch (error) {
    return toErrorState(error);
  }
}

/**
 * Cancelacion de pedido (R26, R27, R28). El `id` viaja como campo oculto del formulario,
 * igual que en el borrado, porque quien cancela lo hace desde un boton de la fila.
 *
 * El motivo se entrega TAL CUAL: el recorte, el minimo y el tope de 500 son de
 * `cancelOrderSchema`, dentro del caso de uso (R27). Aqui no se recorta ni se mide nada.
 */
export async function cancelOrderAction(
  prevState: OrderMutationFormState,
  formData: FormData,
): Promise<OrderMutationFormState> {
  void prevState;

  const id = readFormString(formData, 'id');
  if (id === '') {
    return { status: 'error', code: INVALID_INPUT_CODE, message: MISSING_ID_ERROR };
  }

  const actor = await currentActor();

  try {
    await pedidos.cancelOrder(id, { reason: readFormString(formData, 'reason') }, actor);
    return { status: 'success' };
  } catch (error) {
    return toErrorState(error);
  }
}

/** Borrado LOGICO del pedido (R31, R32, R33). El `id` viaja como campo oculto del formulario. */
export async function deleteOrderAction(
  prevState: OrderMutationFormState,
  formData: FormData,
): Promise<OrderMutationFormState> {
  void prevState;

  const id = readFormString(formData, 'id');
  if (id === '') {
    return { status: 'error', code: INVALID_INPUT_CODE, message: MISSING_ID_ERROR };
  }

  const actor = await currentActor();

  try {
    await pedidos.deleteOrder(id, actor);
    return { status: 'success' };
  } catch (error) {
    return toErrorState(error);
  }
}

/** Ficha del pedido (R42, R43). Consulta: argumento tipado, no `FormData`. */
export async function getOrderAction(id: string): Promise<OrderQueryResult> {
  const actor = await currentActor();

  try {
    const data = await pedidos.getOrder(id, actor);
    return { status: 'success', data };
  } catch (error) {
    return toErrorState(error);
  }
}

/**
 * Lista paginada de pedidos (R34-R41, R45). Consulta: argumento tipado -quien llama ya tiene
 * la consulta de lista, con el estado y la prioridad como filtros `select` (QC-57 R25)-.
 * `query` es `unknown` porque la cadena entera vive dentro del caso de uso (QC-57 R30):
 * `createListQuerySchema()` valida la forma, `sanitizeListQuery` poda contra
 * `ORDER_QUERYABLE` -y `list-orders.ts` poda ademas los valores de los dos `select`
 * cerrados-, el caso de uso registra lo omitido por el puerto `ListQueryLog` y el
 * repositorio recibe la consulta ya saneada. Esta action no repite nada de eso ni conoce el
 * defecto de 10 ni el tope de 25.
 */
export async function listOrdersAction(query: unknown): Promise<OrderListResult> {
  const actor = await currentActor();

  try {
    const data = await pedidos.listOrders(query, actor);
    return { status: 'success', data };
  } catch (error) {
    return toErrorState(error);
  }
}

// ---------------------------------------------------------------------------------------------
// QC-141 T14 (`design.md > 5.1`, `> 10`) — La cobertura de VARIOS pedidos a la vez, UNA consulta
// por pagina (R35). Bloque nuevo al final: no reordena ni reformatea nada de arriba.
// ---------------------------------------------------------------------------------------------

/** Una entrada del array plano: un `Map` no cruza el borde de una Server Action tan bien como un
 *  array serializable, mismo criterio que `OrderResponsiblesEntry` de `asignaciones`. */
export type OrderCoverageEntry = { readonly orderId: string; readonly coverage: OrderCoverage };

export type OrderCoverageBatchResult =
  | { status: 'success'; data: readonly OrderCoverageEntry[] }
  | ErrorState;

/**
 * La cobertura de la pagina entera (R35): argumento ya tipado, no `FormData` -no viene de un
 * `<form>`-. Ningun permiso se comprueba aqui: la frontera es `requirePermission(actor,
 * 'pedidos.consultar')` en la primera linea del caso de uso.
 */
export async function listOrderCoverageAction(
  orderIds: readonly string[],
): Promise<OrderCoverageBatchResult> {
  const actor = await currentActor();

  try {
    const coverage = await pedidos.findCoverage(orderIds, actor);
    return { status: 'success', data: [...coverage].map(([orderId, value]) => ({ orderId, coverage: value })) };
  } catch (error) {
    return toErrorState(error);
  }
}
