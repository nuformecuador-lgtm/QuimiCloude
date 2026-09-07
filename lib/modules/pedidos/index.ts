// lib/modules/pedidos/index.ts — CONTRATO PUBLICO del modulo `pedidos`.
// Solo reexporta simbolos de ./domain. Debe poder importarse desde un componente de cliente sin
// arrastrar servidor: nada de 'use server', @prisma/client ni ningun import de `next` en su
// cierre de imports. (El comodin no se escribe con la barra y el asterisco a proposito: este
// archivo ya tiene comentarios de bloque, y esa pareja abriria uno falso para cualquier
// barrido que quite comentarios antes de leer el codigo.)
// Los adaptadores driving de QC-34 NO pasan por aqui: QC-35 importara `order-actions.ts` por su
// ruta exacta (`docs/architecture.md`, excepcion de los driving; `design.md > 9`).
export { formatOrderNumber } from './domain/order-number';
export type { OrderId, OrderNumber } from './domain/order-number';
export {
  ORDER_PRIORITY_VALUES,
  ORDER_STATUS_VALUES,
  DEFAULT_ORDER_PRIORITY,
  DEFAULT_ORDER_STATUS,
} from './domain/order-classification';
export type { OrderPriority, OrderStatus } from './domain/order-classification';
export type { OrderContents } from './domain/order-contents';

// ---------------------------------------------------------------------------------------
// QC-34 (T14). Lo que el modulo publica para poder ser USADO: el actor, los esquemas del
// borde, los tipos de salida, los errores y las SEIS factories de caso de uso.
//
// Las factories -y no las funciones ya cableadas- porque quien ata puerto e implementacion es
// `lib/composition` y solo el (R52): este barrel no puede instanciar nada, porque instanciar
// obligaria a importar el adaptador driven y con el `@prisma/client`, que es justo lo que la
// primera linea de este archivo promete que no pasa.
// ---------------------------------------------------------------------------------------

/** El actor entra por PARAMETRO en los seis casos de uso (R1). `requireAdmin` se publica
 *  porque es la definicion unica del permiso de este modulo, no para que la repita nadie: la
 *  Server Action NO la llama (R5), ya es la primera linea de los seis. */
export { requireAdmin } from './domain/actor';
export type { Actor } from './domain/actor';

/** Los errores, con su `code` ESTABLE. El adaptador driving traduce por el `code`, nunca por
 *  el texto (R56), y para eso necesita la clase base y el `instanceof`. */
export {
  PedidosError,
  UnauthorizedError,
  NotFoundError,
  RecipeNotFoundError,
  InvalidTransitionError,
  NotCancellableError,
  NotDeletableError,
  DuplicateOrderNumberError,
  ValidationError,
} from './domain/errors';

/** La pagina y su esquema (R34, R36). El defecto de 10 y el tope de 25 NO viven aqui: los
 *  aplica `lib/shared/pagination` en el adaptador driven (R35, R37). */
export { pageQuerySchema } from './domain/page';
export type { Page, PageQuery } from './domain/page';

/** Los esquemas `zod` del borde (R55). Se publican para que la Server Action y -manana- el
 *  formulario de QC-35 validen con el MISMO esquema, no con dos copias. */
export {
  createOrderSchema,
  updateOrderSchema,
  cancelOrderSchema,
  EDITABLE_STATUS_VALUES,
} from './domain/order-input';
export type {
  CreateOrderInput,
  UpdateOrderInput,
  CancelOrderInput,
  EditableOrderStatus,
} from './domain/order-input';

/** La guardia de transiciones (R22). Se publica para que QC-35 pueda saber que estados ofrecer
 *  sin escribir una segunda tabla; la tabla sigue viviendo en un solo archivo. */
export { assertTransition, isAllowedTransition } from './domain/order-transitions';

/** Los tipos de entrada y de salida (R42, R43, R46). `OrderRow` es lo que devuelve el PUERTO
 *  y se publica porque `lib/composition` tiene que poder nombrar el tipo del repositorio. */
export type { NewOrder, OrderRow, OrderView, OrderSummary } from './domain/order-view';

/** QC-57 (R25, R31): el contrato generico de consulta de lista y la lista blanca de pedidos.
 *  `listOrdersSchema`, `ListOrdersInput` y `OrderFilters` se fueron con el: el listado de
 *  pedidos ya no tiene parametros propios de estado y prioridad. */
export {
  type ListFilterKind,
  type ListFilterValue,
  type ListQuery,
  type ListQueryable,
  type ListSort,
  type SanitizedListQuery,
  type SortDirection,
  createListQuerySchema,
  sanitizeListQuery,
} from './domain/list-query';
export { ORDER_QUERYABLE } from './domain/order-queryable';

/** Las SEIS factories de caso de uso (R52) y sus tipos de dependencias, que es lo que
 *  `lib/composition` necesita para cablearlas. */
export { createCreateOrder } from './domain/create-order';
export type { CreateOrderDeps, CreatedOrder } from './domain/create-order';
export { createGetOrder, toOrderView } from './domain/get-order';
export type { GetOrderDeps } from './domain/get-order';
export { createListOrders } from './domain/list-orders';
export type { ListOrdersDeps } from './domain/list-orders';
export { createUpdateOrder } from './domain/update-order';
export type { UpdateOrderDeps } from './domain/update-order';
export { createCancelOrder } from './domain/cancel-order';
export type { CancelOrderDeps } from './domain/cancel-order';
export { createDeleteOrder } from './domain/delete-order';
export type { DeleteOrderDeps } from './domain/delete-order';
