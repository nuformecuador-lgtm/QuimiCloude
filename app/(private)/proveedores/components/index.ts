// Barrel de los componentes de la ruta de proveedores (R42,
// `docs/architecture.md > Componentes > Regla: componentes de ruta en components/ con barrel index.ts`).
//
// Sin `'use client'`: la frontera cliente/servidor se declara en CADA archivo de componente,
// nunca aqui. Asi `page.tsx` sigue siendo Server Component aunque importe desde el barrel.
export {
  EMPTY_CELL,
  SUPPLIER_COLUMNS,
  type SupplierColumn,
  type SupplierColumnKey,
} from './supplier-columns';
export { SupplierListEmpty } from './supplier-list-empty';
export { SupplierListError } from './supplier-list-error';
export {
  PAGE_PARAM,
  PAGE_SIZE_OPTIONS,
  PAGE_SIZE_PARAM,
  buildSupplierListQuery,
  parseSupplierListParams,
  type SupplierListParams,
  type SupplierListSearchParams,
  type SupplierPageSize,
} from './supplier-list-params';
export { SupplierListSection } from './supplier-list-section';
export { SupplierListToolbar } from './supplier-list-toolbar';
export { SupplierTable } from './supplier-table';
export { SupplierTableSkeleton } from './supplier-table-skeleton';
