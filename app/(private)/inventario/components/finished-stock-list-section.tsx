import type { DataTableParams } from '@/components/shared/data-table';
import { identity } from '@/lib/composition';
import { canAdjustBatchStock } from '@/lib/modules/inventario';
import { listFinishedStockAction } from '@/lib/modules/inventario/adapters/driving/product-actions';
import type { UnitRef } from '@/lib/modules/unidades';

import { FinishedStockTable } from './finished-stock-table';
import { TYPE_COLUMN_ID } from './product-list-params';

type FinishedStockListSectionProps = {
  readonly params: DataTableParams;
  readonly units?: readonly UnitRef[];
};

/**
 * Lista de la pestana «Producto terminado». Esta lista no ordena ni filtra: de la URL solo
 * viajan pagina, tamano y busqueda. El filtro de tipo se conserva en los parametros de la tabla
 * para que paginar o buscar no saque al usuario de la pestana.
 */
export async function FinishedStockListSection({ params, units }: FinishedStockListSectionProps) {
  const result = await listFinishedStockAction({
    page: params.page,
    pageSize: params.pageSize,
    search: params.search,
    sort: null,
    filters: {},
  });

  if (result.status === 'error') {
    return (
      <FinishedStockTable
        status="error"
        error={result}
        rows={[]}
        params={params}
        totalPages={0}
        units={units}
      />
    );
  }

  const { items, page: currentPage, totalPages } = result.data;
  // Presentacion, no autorizacion: el ajuste lo autoriza el caso de uso.
  const canAdjust = canAdjustBatchStock(await identity.getSessionUser());
  const typeFilter = params.filters[TYPE_COLUMN_ID];

  return (
    <div className="flex flex-col gap-4" data-testid="product-list">
      <FinishedStockTable
        rows={items}
        params={{
          ...params,
          page: currentPage,
          sort: null,
          filters: typeFilter === undefined ? {} : { [TYPE_COLUMN_ID]: typeFilter },
        }}
        totalPages={totalPages}
        units={units}
        canAdjust={canAdjust}
      />
    </div>
  );
}
