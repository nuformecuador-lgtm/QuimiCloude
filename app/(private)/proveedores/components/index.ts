// Barrel de los componentes de la ruta de proveedores (R42,
// `docs/architecture.md > Componentes > Regla: componentes de ruta en components/ con barrel index.ts`).
//
// Sin `'use client'`: la frontera cliente/servidor se declara en CADA archivo de componente,
// nunca aqui. Asi `page.tsx` sigue siendo Server Component aunque importe desde el barrel.
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
