// Barrel de los componentes de la ruta de inventario (R27,
// `docs/architecture.md > Componentes > Regla: componentes de ruta en components/ con barrel index.ts`).
//
// Sin `'use client'`: la frontera cliente/servidor se declara en CADA archivo de componente,
// nunca aqui. Asi `page.tsx` sigue siendo Server Component aunque importe desde el barrel.
export {
  PAGE_PARAM,
  PAGE_SIZE_OPTIONS,
  PAGE_SIZE_PARAM,
  buildProductListQuery,
  parseProductListParams,
  type ProductListParams,
  type ProductListSearchParams,
  type ProductPageSize,
} from './product-list-params';
export {
  EMPTY_CELL,
  PRODUCT_COLUMNS,
  type ProductColumn,
  type ProductColumnKey,
} from './product-columns';
export { ProductListEmpty } from './product-list-empty';
export { ProductListError } from './product-list-error';
export { ProductListToolbar } from './product-list-toolbar';
export { ProductTable } from './product-table';
export { ProductTableSkeleton } from './product-table-skeleton';
