// Barrel de los componentes de la ruta de inventario (R27,
// `docs/architecture.md > Componentes > Regla: componentes de ruta en components/ con barrel index.ts`).
//
// Sin `'use client'`: la frontera cliente/servidor se declara en CADA archivo de componente,
// nunca aqui. Asi `page.tsx` sigue siendo Server Component aunque importe desde el barrel.
export { DeleteProductDialog } from './delete-product-dialog';
// `PresentationSelect` ya no es propio de esta ruta: QC-44 lo promovio a
// `components/shared/` porque la pantalla de proveedores lo necesita con la MISMA API
// (`docs/architecture.md > Regla: sin sobre-ingenieria`). Se reexporta aqui para que la
// ruta lo siga consumiendo por su barrel, sin cambiar ni un consumidor.
export { PRESENTATION_FIELD, PresentationSelect } from '@/components/shared/presentation-select';
export {
  EMPTY_CELL,
  PRODUCT_COLUMNS,
  type ProductColumn,
  type ProductColumnKey,
} from './product-columns';
export { ProductField } from './product-field';
export { ProductForm } from './product-form';
export { ProductListEmpty } from './product-list-empty';
export { ProductListError } from './product-list-error';
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
export { ProductListSection } from './product-list-section';
export { ProductListToolbar } from './product-list-toolbar';
export { ProductSheet } from './product-sheet';
export { ACTIONS_COLUMN_LABEL, ProductTable } from './product-table';
export { ProductTableSkeleton } from './product-table-skeleton';
