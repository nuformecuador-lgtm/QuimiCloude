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
  ORDER_STATUS_FLOW,
  DEFAULT_ORDER_PRIORITY,
  DEFAULT_ORDER_STATUS,
} from './domain/order-classification';
export type { OrderPriority, OrderStatus } from './domain/order-classification';
export type { OrderContents } from './domain/order-contents';

/** QC-87 (T2, R45): el servicio que `pedidos` ofrece a otros modulos para saber el ESTADO de
 *  un pedido sin tocar `prisma.order`. Solo el TIPO y la INTERFAZ: el adaptador que los
 *  implementa NO se exporta desde aqui -arrastraria `@prisma/client` al cierre de imports del
 *  barrel-, lo instancia `lib/composition` (R47), igual que con `RecipeCatalog`. */
export type {
  OrderAssignmentTarget,
  OrderCatalog,
  AssignedOrderSummary,
  AssignedOrderPresentationLine,
  OrderSummaryOrdering,
  FinishedGoodsReceipt,
} from './domain/order-catalog';

// ---------------------------------------------------------------------------------------
// QC-34 (T14). Lo que el modulo publica para poder ser USADO: el actor, los esquemas del
// borde, los tipos de salida, los errores y las SEIS factories de caso de uso.
//
// Las factories -y no las funciones ya cableadas- porque quien ata puerto e implementacion es
// `lib/composition` y solo el (R52): este barrel no puede instanciar nada, porque instanciar
// obligaria a importar el adaptador driven y con el `@prisma/client`, que es justo lo que la
// primera linea de este archivo promete que no pasa.
// ---------------------------------------------------------------------------------------

/** El actor entra por PARAMETRO en los seis casos de uso (R1). `requirePermission` se publica
 *  porque es la definicion unica de como este modulo exige un permiso, no para que la repita
 *  nadie: la Server Action NO la llama (R5), ya es la primera linea de los seis. */
export { requirePermission } from './domain/actor';
export type { Actor } from './domain/actor';

/** El AMBITO por empresa. Solo el TIPO -no hay valor que exportar-, asi que el barrel sigue
 *  siendo importable desde un componente de cliente. `lib/composition` necesita nombrarlo para
 *  tipar el repositorio, igual que con `OrderRow`. */
export type { OrderScope } from './domain/order-scope';

/** Los errores, con su `code` ESTABLE. El adaptador driving traduce por el `code`, nunca por
 *  el texto (R56), y para eso necesita la clase base y el `instanceof`.
 *
 *  QC-70: el `code` sale del catalogo unico (`@/lib/modules/errores`) y `NotFoundError` paso a
 *  llamarse `OrderNotFoundError` con codigo `order_not_found` (R17): `not_found` significaba
 *  cinco cosas distintas y un codigo con UN mensaje no puede decir a la vez «el pedido» y «la
 *  receta». */
export {
  PedidosError,
  UnauthorizedError,
  OrderNotFoundError,
  RecipeNotFoundError,
  PresentationNotFoundError,
  ProductNotFoundError,
  InvalidTransitionError,
  NotCancellableError,
  NotDeletableError,
  DuplicateOrderNumberError,
  ValidationError,
  InsufficientMaterialError,
  RecipeWithoutLinesError,
  OrderWouldBlockError,
  PresentationWithoutContentError,
  UnitNotFoundError,
  IncompatibleUnitsError,
  OrderWithoutUnitError,
  OrderDistributionExceedsQuantityError,
  OrderWithoutDistributionError,
  OrderPresentationLineNotEditableError,
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
  quoteOrderCostSchema,
  presentationLinesSchema,
  ORDER_DISTRIBUTION_PRESENTATION_FIELD,
  ORDER_DISTRIBUTION_PACKAGES_FIELD,
  ORDER_DISTRIBUTION_PACKAGING_FIELD,
  orderPresentationAvailabilitySchema,
  updateOrderDistributionSchema,
  EDITABLE_STATUS_VALUES,
} from './domain/order-input';
export type {
  CreateOrderInput,
  UpdateOrderInput,
  CancelOrderInput,
  QuoteOrderCostInput,
  OrderPresentationAvailabilityInput,
  UpdateOrderDistributionInput,
  EditableOrderStatus,
} from './domain/order-input';

/** La guardia de transiciones (R22). Se publica para que QC-35 pueda saber que estados ofrecer
 *  sin escribir una segunda tabla; la tabla sigue viviendo en un solo archivo. */
export { assertTransition, isAllowedTransition } from './domain/order-transitions';

/** Los tipos de entrada y de salida (R42, R43, R46). `OrderRow` es lo que devuelve el PUERTO
 *  y se publica porque `lib/composition` tiene que poder nombrar el tipo del repositorio.
 *  `OrderEdit` es lo que acepta `updateAlive`, sin `status`. */
export type {
  NewOrder,
  OrderEdit,
  OrderPresentationLineRow,
  OrderPresentationLineView,
  OrderPresentationLineWrite,
  OrderRow,
  OrderView,
  OrderSummary,
} from './domain/order-view';

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

/** Implementa `OrderCatalog['transitionAliveById']`: mueve el pedido de estado y, si el
 *  destino es `ENTREGADO`, consume el material en la misma transaccion. `lib/composition`
 *  la cablea en el lugar de la funcion cruda del driven. */
export { createTransitionOrder } from './domain/transition-order';
export type { TransitionOrderDeps } from './domain/transition-order';

/** Implementan `OrderCatalog['startPackingAliveById']` y `['finishPackingAliveById']`: Comenzar
 *  y Terminar el empaque, cada uno un `UPDATE` condicional sin abrir la unidad de trabajo de
 *  `inventario`. `lib/composition` las cablea sobre el adaptador driven de `pedidos`. */
export { createStartPacking, createFinishPacking } from './domain/order-packing';
export type { StartPackingDeps, FinishPackingDeps } from './domain/order-packing';

/** Implementan los dos listados de resumen de `OrderCatalog`, con el nombre del envase de cada
 *  linea ya resuelto. */
export { createListAliveSummariesByIds, createListAliveSummariesInCompany } from './domain/list-order-summaries';
export type { ListOrderSummariesDeps } from './domain/list-order-summaries';

/** La cobertura de varios pedidos a la vez, una consulta por pagina, para pintar «sin
 *  cobertura completa» sin N+1. */
export { createFindCoverage, MAX_ORDERS_PER_COVERAGE_BATCH } from './domain/find-coverage';
export type { FindCoverageDeps } from './domain/find-coverage';

/** El proceso diario que caduca la reserva de los pedidos `PENDIENTE`. */
export { createExpireStaleOrders } from './domain/expire-stale-orders';
export type {
  ExpiredOrderFailure,
  ExpireStaleOrdersDeps,
  ExpireStaleOrdersResult,
} from './domain/expire-stale-orders';
export { EXPIRED_ORDER_REASON, ORDER_RESERVATION_TTL_DAYS } from './domain/order-expiry';

export { createQuoteOrderCost } from './domain/quote-order-cost';
export type { QuoteOrderCostDeps, OrderCostQuote } from './domain/quote-order-cost';

/** La revision de bloqueados que dispara una entrada de material en `inventario`. Sin actor:
 *  `lib/composition` la ata al aviso de inventario y no la publica a las Server Actions. */
export { createReviewBlockedOrders } from './domain/review-blocked-orders';
export type {
  BlockedOrderReviewFailure,
  ReviewBlockedOrdersDeps,
  ReviewBlockedOrdersInput,
  ReviewBlockedOrdersResult,
} from './domain/review-blocked-orders';
/** La edicion ACOTADA del reparto y la unidad, aparte de `updateOrder`. */
export {
  createUpdateOrderPresentationLines,
  REPARTO_EDITABLE_STATUSES,
} from './domain/update-order-presentation-lines';
export type {
  UpdateOrderPresentationLinesDeps,
  UpdateOrderPresentationLinesInput,
  UpdateOrderPresentationLinesResult,
} from './domain/update-order-presentation-lines';

/** «Cuanto queda disponible», de solo lectura -no persiste, no rechaza-.
 *  `quoteOrderPresentationAvailabilityAction` la llama en cada cambio de cantidad, unidad o reparto. */
export { createQuoteOrderPresentationAvailability } from './domain/order-presentation-availability';
export type {
  OrderPresentationAvailability,
  OrderPresentationAvailabilityDeps,
  OrderPresentationAvailabilityNext,
} from './domain/order-presentation-availability';
export type { DistributionLineInput, PresentationLineInput } from './domain/resolve-distribution';
