import type { DataTableParams } from '@/components/shared/data-table';
import { SupplierSheet } from '@/components/shared/supplier';
import { listSuppliersAction } from '@/lib/modules/proveedores/adapters/driving/supplier-actions';

import {
  FIRST_PAGE,
  clearSearchAndFilters,
  hasActiveSearchOrFilter,
  supplierListHref,
} from './supplier-list-params';
import { SupplierListEmpty } from './supplier-list-empty';
import { SupplierListError } from './supplier-list-error';
import { SupplierTable } from './supplier-table';

type SupplierListSectionProps = {
  readonly params: DataTableParams;
};

export async function SupplierListSection({ params }: SupplierListSectionProps) {
  const result = await listSuppliersAction(params);

  if (result.status === 'error') {
    return <SupplierListError error={result} />;
  }

  const { items, page: currentPage, totalPages } = result.data;
  const firstPageHref =
    currentPage > FIRST_PAGE ? supplierListHref({ ...params, page: FIRST_PAGE }) : undefined;

  if (items.length === 0 && !hasActiveSearchOrFilter(params)) {
    return (
      <SupplierListEmpty firstPageHref={firstPageHref}>
        <SupplierSheet />
      </SupplierListEmpty>
    );
  }

  // Mismo árbol con filas y sin resultados: si cambiara, React remontaría la tabla y la búsqueda
  // perdería el foco al volver la navegación.
  return (
    <div className="flex flex-col gap-4" data-testid="supplier-list">
      <SupplierTable
        suppliers={items}
        params={{ ...params, page: currentPage }}
        totalPages={totalPages}
        noResults={
          items.length === 0
            ? { clearHref: supplierListHref(clearSearchAndFilters(params)), firstPageHref }
            : undefined
        }
      />
    </div>
  );
}
