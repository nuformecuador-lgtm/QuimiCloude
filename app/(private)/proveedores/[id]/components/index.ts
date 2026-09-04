// Barrel de los componentes de la ruta de detalle del proveedor (R42,
// `docs/architecture.md > Componentes > Regla: componentes de ruta en components/ con barrel index.ts`).
//
// Sin `'use client'`: la frontera cliente/servidor se declara en CADA archivo de componente, nunca
// aqui. Asi `page.tsx` sigue siendo Server Component aunque importe desde el barrel.
export {
  CATALOG_COLUMNS,
  EMPTY_CELL,
  UNRESOLVED_CELL,
  type CatalogColumn,
  type CatalogColumnKey,
} from './catalog-columns';
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
  CATALOG_PAGE_PARAM,
  CATALOG_PAGE_SIZE_OPTIONS,
  CATALOG_PAGE_SIZE_PARAM,
  buildCatalogListQuery,
  parseCatalogListParams,
  type CatalogListParams,
  type CatalogListSearchParams,
  type CatalogPageSize,
} from './catalog-list-params';
export { CatalogListSection } from './catalog-list-section';
export { CatalogListToolbar } from './catalog-list-toolbar';
export { CATALOG_ACTIONS_COLUMN_LABEL, CatalogTable } from './catalog-table';
export { CatalogTableSkeleton } from './catalog-table-skeleton';
export { DeleteCatalogLineDialog } from './delete-catalog-line-dialog';
export { SupplierDetailHeader } from './supplier-detail-header';
export { SupplierNotFound } from './supplier-not-found';
export { NO_UNIT_LABEL, NO_UNIT_VALUE, UNIT_FIELD, UnitSelect } from './unit-select';
