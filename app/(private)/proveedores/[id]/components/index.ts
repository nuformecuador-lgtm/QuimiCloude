// Barrel de los componentes de la ruta de detalle del proveedor (R42,
// `docs/architecture.md > Componentes > Regla: componentes de ruta en components/ con barrel index.ts`).
//
// Sin `'use client'`: la frontera cliente/servidor se declara en CADA archivo de componente, nunca
// aqui. Asi `page.tsx` sigue siendo Server Component aunque importe desde el barrel.
export {
  ACTIONS_COLUMN_ID,
  CATALOG_ACTIONS_COLUMN_LABEL,
  CATALOG_IMAGE_COLUMN_LABEL,
  EMPTY_CELL,
  IMAGE_COLUMN_ID,
  UNRESOLVED_CELL,
  buildCatalogColumns,
  type CatalogColumn,
  type CatalogColumnId,
  type CatalogColumnsDeps,
} from './catalog-columns';
export { CATALOG_SKELETON_COLUMN_COUNT } from './catalog-columns-skeleton';
export {
  EMPTY_CATALOG_DIRECTORIES,
  MAX_PRESENTATION_PAGES,
  buildCatalogDirectories,
  resolvePresentationName,
  resolveUnitLabel,
  type CatalogDirectories,
} from './catalog-directories';
export { CatalogLineForm, SUPPLIER_FIELD } from './catalog-line-form';
export { CatalogLineSheet } from './catalog-line-sheet';
export { CATALOG_LIST_EMPTY_TESTID, CatalogListEmpty } from './catalog-list-empty';
export { CatalogListError } from './catalog-list-error';
export {
  CATALOG_COST_MAX_PARAM,
  CATALOG_COST_MIN_PARAM,
  CATALOG_DELIVERY_MAX_PARAM,
  CATALOG_DELIVERY_MIN_PARAM,
  CATALOG_PAGE_PARAM,
  CATALOG_PAGE_SIZE_OPTIONS,
  CATALOG_PAGE_SIZE_PARAM,
  CATALOG_SEARCH_PARAM,
  CATALOG_SHARED_PAGE_SIZES,
  CATALOG_SORT_PARAM,
  CATALOG_SORT_SEPARATOR,
  COST_COLUMN_ID,
  DELIVERY_TIME_COLUMN_ID,
  FIRST_PAGE,
  buildCatalogListQuery,
  catalogListHref,
  parseCatalogListParams,
  type CatalogListSearchParams,
  type CatalogPageSize,
} from './catalog-list-params';
export { CatalogListSection } from './catalog-list-section';
export { CatalogPdfUpload, type CatalogPdfUploadProps } from './catalog-pdf-upload';
export {
  CATALOG_TABLE_ID,
  CATALOG_TABLE_TEXTS,
  CatalogTable,
  type CatalogTableProps,
} from './catalog-table';
export { CatalogTableSkeleton } from './catalog-table-skeleton';
export { DeleteCatalogLineDialog } from './delete-catalog-line-dialog';
export { DeleteSupplierDialog } from './delete-supplier-dialog';
export { SupplierDetailHeader } from './supplier-detail-header';
export { SupplierNotFound } from './supplier-not-found';
export { NO_UNIT_LABEL, NO_UNIT_VALUE, UNIT_FIELD, UnitSelect } from './unit-select';
