// Barrel de los componentes de la ruta de inventario (R27,
// `docs/architecture.md > Componentes > Regla: componentes de ruta en components/ con barrel index.ts`).
//
// Sin `'use client'`: la frontera cliente/servidor se declara en CADA archivo de componente,
// nunca aqui. Asi `page.tsx` sigue siendo Server Component aunque importe desde el barrel.
export { AdjustBatchDialog, type AdjustBatchDialogProps } from './adjust-batch-dialog';
export { BatchHistory, movementReasonLabel } from './batch-history';
export { DeleteProductDialog } from './delete-product-dialog';
// `PresentationSelect` ya no es propio de esta ruta: QC-44 lo promovio a
// `components/shared/` porque la pantalla de proveedores lo necesita con la MISMA API
// (`docs/architecture.md > Regla: sin sobre-ingenieria`). Se reexporta aqui para que la
// ruta lo siga consumiendo por su barrel, sin cambiar ni un consumidor.
export { PRESENTATION_FIELD, PresentationSelect } from '@/components/shared/presentation-select';
export {
  ACTIONS_COLUMN_ID,
  ACTIONS_COLUMN_LABEL,
  EMPTY_CELL,
  IMAGE_COLUMN_ID,
  IMAGE_COLUMN_LABEL,
  PRODUCT_DEFAULT_PINNED_COLUMNS,
  buildProductColumns,
  type ProductColumn,
  type ProductColumnId,
  type ProductColumnsDeps,
} from './product-columns';
export { PRODUCT_SKELETON_COLUMN_COUNT } from './product-columns-skeleton';
export { ProductField } from './product-field';
export { ProductForm } from './product-form';
export {
  PURCHASE_DATE_FIELD,
  ProductBatchDateField,
} from './product-batch-date-field';
export {
  ProductBatchesPanel,
  type ProductBatchesPanelProps,
} from './product-batches-panel';
export {
  PRODUCT_NAME_FIELD,
  ProductNamePicker,
  type ProductNameOption,
} from './product-name-picker';
export { ProductListEmpty } from './product-list-empty';
export { ProductListError } from './product-list-error';
export {
  FIRST_PAGE,
  PAGE_PARAM,
  PAGE_SIZE_OPTIONS,
  PAGE_SIZE_PARAM,
  QTY_ALERT_COLUMN_ID,
  QTY_ALERT_MAX_PARAM,
  QTY_ALERT_MIN_PARAM,
  SEARCH_PARAM,
  SHARED_PAGE_SIZES,
  SORT_PARAM,
  SORT_SEPARATOR,
  buildProductListQuery,
  parseProductListParams,
  productListHref,
  type ProductListSearchParams,
  type ProductPageSize,
} from './product-list-params';
export { ProductListSection } from './product-list-section';
export { ProductSheet } from './product-sheet';
export {
  PRODUCT_TABLE_ID,
  PRODUCT_TABLE_TEXTS,
  ProductTable,
  type ProductTableProps,
} from './product-table';
export { ProductTableSkeleton } from './product-table-skeleton';
