// Contrato publico del modulo. Lo importa un componente de cliente, asi que no puede arrastrar
// servidor.
export { requirePermission, canAdjustBatchStock, type Actor } from './domain/actor';
// Lo piden las firmas de los puertos: quien escriba un adaptador o un doble de test lo toma de aqui.
export type { InventoryScope } from './domain/inventory-scope';
export {
  InventarioError,
  UnauthorizedError,
  ProductNotFoundError,
  PresentationNotFoundError,
  PresentationDuplicateNameError,
  PresentationInUseError,
  PresentationUnitLockedError,
  ValidationError,
  BatchDuplicateLotError,
  BatchNotFoundError,
  BatchStockNegativeError,
  ActionNotAllowedError,
} from './domain/errors';
export { type Page, type PageQuery, pageQuerySchema } from './domain/page';
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
export { PRESENTATION_QUERYABLE } from './domain/presentation-queryable';
export {
  PRODUCT_QUERYABLE,
  PRODUCT_TYPE_VALUES,
  MANUAL_PRODUCT_TYPE_VALUES,
} from './domain/product-queryable';
export { PRODUCT_TYPES, type ProductType } from './domain/product-type';
export { normalizePresentationName } from './domain/presentation-name';
export { normalizeProductName } from './domain/product-name';
export {
  createPresentationSchema,
  updatePresentationSchema,
  type CreatePresentationInput,
  type UpdatePresentationInput,
} from './domain/presentation-input';
export {
  createProductSchema,
  updateProductSchema,
  type CreateProductInput,
  type UpdateProductInput,
} from './domain/product-input';
export {
  PRODUCT_BATCH_LOT_MAX_LENGTH,
  createProductWithFirstBatchSchema,
  type CreateProductWithFirstBatchInput,
} from './domain/product-batch-input';
export { type NewProductBatch } from './domain/product-batch';
export { type NewProduct, type ProductView } from './domain/product-view';
export { type ProductStockByUnit, sumStockByUnit, singleUnitStock } from './domain/product-stock';
export { type CostingBatch } from './domain/costing-batch';
export { productDisplayName } from './domain/product-display-name';
export { type PresentationView } from './domain/presentation-view';
export { type ProductBatchView } from './domain/product-batch-view';
export { type InventoryMovementView, type NewInventoryMovement } from './domain/inventory-movement';
export { MOVEMENT_REASONS, type MovementReason } from './domain/movement-reason';

export { createCreateProduct, type CreateProductDeps } from './domain/create-product';
export { createUpdateProduct, type UpdateProductDeps } from './domain/update-product';
export { createDeleteProduct, type DeleteProductDeps } from './domain/delete-product';
export { createGetProduct, type GetProductDeps } from './domain/get-product';
export { createListProducts, type ListProductsDeps } from './domain/list-products';
export { createCreatePresentation, type CreatePresentationDeps } from './domain/create-presentation';
export { createUpdatePresentation, type UpdatePresentationDeps } from './domain/update-presentation';
export { createDeletePresentation, type DeletePresentationDeps } from './domain/delete-presentation';
export { createListPresentations, type ListPresentationsDeps } from './domain/list-presentations';
export {
  createAdjustBatchStock,
  type AdjustBatchStockDeps,
  type AdjustBatchStockInput,
} from './domain/adjust-batch-stock';
export {
  createListProductBatches,
  type ListProductBatchesDeps,
} from './domain/list-product-batches';
export {
  createListBatchMovements,
  type ListBatchMovementsDeps,
} from './domain/list-batch-movements';

export {
  addQuantities,
  subtractQuantities,
  compareQuantities,
  minQuantity,
  ceilToScale4,
} from './domain/decimal-quantity';
export { compareBatchesOldestFirst, type OrderableBatch } from './domain/batch-order';
export { planFinishedGoods, type FinishedGoodsPlan } from './domain/finished-goods';

// Solo tipos: por aqui otros modulos apuntan a un producto sin tocar la tabla ni Prisma. La
// implementacion se cablea en `lib/composition`.
export type { ProductCatalog, ProductId, ProductRef } from './domain/product-catalog';
export type { PresentationCatalog, PresentationId, PresentationRef } from './domain/presentation-catalog';

// La reserva de material: tipos y las dos interfaces que consume o implementa quien llama
// desde fuera de `inventario`. La implementacion (Prisma, la transaccion) vive en los
// adaptadores driven de este modulo y se cablea en `lib/composition`.
export type {
  ReservationRequirementLine,
  ReservationOutcome,
  ConsumptionOutcome,
  OrderCoverage,
  MaterialReservations,
  ReservationQueries,
  OrderNumberDirectory,
  BatchHistoryEntry,
} from './domain/reservation';
export { planReservation } from './domain/plan-reservation';
export type {
  ReservationCandidateBatch,
  PlanReservationInput,
  ReservationAllocation,
  ReservationPlan,
} from './domain/plan-reservation';
