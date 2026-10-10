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
  PRODUCT_PRESENTATION_UNIT_FILTER,
} from './domain/product-queryable';
export { isIngredientType, PRODUCT_TYPES, type ProductType } from './domain/product-type';
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
  productNameSchema,
  PRODUCT_NAME_MAX_LENGTH,
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
export type { StockIncreaseListener } from './domain/stock-increase-listener';
export {
  createCreateRawMaterial,
  type CreateRawMaterialDeps,
} from './domain/create-raw-material';
export { createUpdateProduct, type UpdateProductDeps } from './domain/update-product';
export { createDeleteProduct, type DeleteProductDeps } from './domain/delete-product';
export { createGetProduct, type GetProductDeps } from './domain/get-product';
export { createListProducts, type ListProductsDeps } from './domain/list-products';
export { createCreatePresentation, type CreatePresentationDeps } from './domain/create-presentation';
export { createUpdatePresentation, type UpdatePresentationDeps } from './domain/update-presentation';
export { createDeletePresentation, type DeletePresentationDeps } from './domain/delete-presentation';
export { createListPresentations, type ListPresentationsDeps } from './domain/list-presentations';
export {
  createListProductFormUnits,
  type ListProductFormUnits,
  type ListProductFormUnitsDeps,
  type ProductFormUnits,
} from './domain/list-product-form-units';
export {
  createAdjustBatchStock,
  type AdjustBatchStockDeps,
  type AdjustBatchStockInput,
} from './domain/adjust-batch-stock';
export {
  STOCK_QUANTITY_PATTERN,
  REASONS_BY_DIRECTION,
  describeAdjustment,
  reasonsFor,
  isReasonAllowed,
  type AdjustmentDirection,
  type StockAdjustment,
  type StockAdjustmentReading,
  type AdjustBatchStockResult,
  type BatchStockAdjustment,
  type AdjustBatchStockOutcome,
} from './domain/stock-adjustment';
export { BatchStockChangedError, AdjustmentReasonNotAllowedError } from './domain/errors';
export {
  createListProductBatches,
  type ListProductBatchesDeps,
} from './domain/list-product-batches';
export { createListOrderBatches, type ListOrderBatchesDeps } from './domain/list-order-batches';
export { createListFinishedStock, type ListFinishedStockDeps } from './domain/list-finished-stock';
export { FINISHED_STOCK_QUERYABLE } from './domain/finished-stock-queryable';
export type {
  FinishedOrderNumber,
  FinishedOrderStockRow,
  FinishedStockBatch,
  FinishedStockGroup,
  FinishedStockProductLine,
  FinishedStockRow,
  FinishedWithoutOrderStockRow,
} from './domain/finished-stock';
export type { PackagedStockEntry } from './domain/packaged-stock';
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
export {
  planFinishedGoodsLine,
  type FinishedGoodsLinePlan,
  type FinishedGoodsOutcome,
  type FinishedGoodsIntake,
} from './domain/finished-goods';
export {
  wholePackagesIn,
  type DeliverableBatch,
  type FinishedBatchCatalog,
  type FinishedGoodsDispatch,
  type FinishedGoodsDispatchInput,
  type FinishedGoodsDispatchOutcome,
} from './domain/finished-goods-dispatch';
export type {
  BatchLotDirectory,
  FinishedGoodsReturn,
  FinishedGoodsReturnInput,
  FinishedGoodsReturnOutcome,
} from './domain/finished-goods-return';
// `pedidos` deriva el coste unitario unico del pedido con la MISMA division que ya usa
// este modulo para un lote sin costo de compra -mismo criterio de redondeo, misma escala-.
export { deriveUnitCost } from './domain/unit-cost';

// Solo tipos: por aqui otros modulos apuntan a un producto sin tocar la tabla ni Prisma. La
// implementacion se cablea en `lib/composition`.
export type { ProductCatalog, ProductId, ProductRef } from './domain/product-catalog';
export type { PackagingCatalog, PackagingCostingBatch, PackagingRef } from './domain/packaging-catalog';
// Resolver ingredientes POR NOMBRE: interfaz nueva, no un metodo mas de ProductCatalog, para no
// pisarse con otro cambio en paralelo sobre este ultimo.
export type { ProductNameLookup, ProductNameMatch } from './domain/product-name-lookup';
export type {
  PresentationByName,
  PresentationCatalog,
  PresentationId,
  PresentationRef,
} from './domain/presentation-catalog';

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
export {
  INVENTORY_IMPORT_MAX_ROWS,
  INVENTORY_IMPORT_MAX_FILE_BYTES,
  INVENTORY_IMPORT_ACCEPT,
  IMPORT_TYPE_LABELS,
  INVENTORY_IMPORT_COLUMNS,
  IMPORT_ROW_ISSUE_CODES,
  type InventoryImportFormat,
  type ImportRowType,
  type ImportColumnRule,
  type ImportColumnKey,
  type ImportCells,
  type ImportRowIssueCode,
  type ImportRowIssue,
  type ImportBatchTarget,
  type ImportPreviewRow,
  type ImportPreviewStatus,
  type ImportMissingEntry,
  type ImportPreviewTotals,
  type InventoryImportPreview,
  type ImportFileRejection,
  type ImportFileRejected,
  type InventoryImportPreviewOutcome,
  type ImportResultRow,
  type ImportResultTotals,
  type InventoryImportResult,
  type ImportAlreadyDone,
  type ImportNothingImported,
  type InventoryImportConfirmOutcome,
  type InventoryImportFile,
  type PreviewInventoryImport,
  type ConfirmInventoryImport,
} from './domain/inventory-import-contract';
export {
  IMPORT_EXAMPLE_ROW,
  buildInventoryImportTemplate,
  buildInventoryImportErrorFile,
  type ImportDownload,
} from './domain/inventory-import-downloads';
export {
  createPreviewInventoryImport,
  type PreviewInventoryImportDeps,
} from './domain/preview-inventory-import';
export {
  createConfirmInventoryImport,
  type ConfirmInventoryImportDeps,
} from './domain/confirm-inventory-import';
export type {
  ReservationCandidateBatch,
  PlanReservationInput,
  ReservationAllocation,
  ReservationPlan,
} from './domain/plan-reservation';
// Los datos de lote del producto terminado que escribe el acondicionamiento: el contrato y la
// regla del lote tecleado y de la fecha civil, para que quien los valida use la misma definicion.
export { typedLotSchema, civilDateSchema } from './domain/product-batch-input';
export type {
  FinishedBatchLabel,
  FinishedBatchLabels,
  FinishedBatchLabelsOutcome,
  FinishedBatchOfOrderLine,
} from './domain/finished-batch-labels';
