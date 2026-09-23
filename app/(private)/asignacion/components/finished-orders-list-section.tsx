import type { DataTableParams } from '@/components/shared/data-table';
import { listFinishedOrdersAction } from '@/lib/modules/asignaciones/adapters/driving/order-assignment-actions';

import { AssignedOrdersError } from './assigned-orders-error';
import { FIRST_PAGE } from './assignment-view-params';
import { FinishedOrdersEmpty } from './finished-orders-empty';
import { FinishedOrdersTable, finishedOrdersHref } from './finished-orders-table';

export const FINISHED_ORDERS_SECTION_TESTID = 'finished-orders-list-section';

type FinishedOrdersListSectionProps = {
  /** Ya acotados por `parseAssignmentListParams`. */
  readonly params: DataTableParams;
};

/**
 * `/asignacion?vista=terminados` (R17, R19, R21, R26, R27): pide la pagina y reparte error, vacio
 * o tabla. La accion se importa por su ruta exacta: el barrel del modulo no la reexporta a
 * proposito.
 */
export async function FinishedOrdersListSection({ params }: FinishedOrdersListSectionProps) {
  const result = await listFinishedOrdersAction({ page: params.page, pageSize: params.pageSize });

  if (result.status === 'error') {
    return <AssignedOrdersError error={result} />;
  }

  const { items, page: currentPage, totalPages } = result.data;

  if (items.length === 0) {
    return (
      <FinishedOrdersEmpty
        firstPageHref={
          currentPage > FIRST_PAGE
            ? finishedOrdersHref({ ...params, page: FIRST_PAGE })
            : undefined
        }
      />
    );
  }

  return <FinishedOrdersTable rows={items} params={params} totalPages={totalPages} />;
}
