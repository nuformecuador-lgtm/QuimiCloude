import type { DataTableParams } from '@/components/shared/data-table';
import { listAssignedOrdersAction } from '@/lib/modules/asignaciones/adapters/driving/order-assignment-actions';

import { AssignedOrdersEmpty } from './assigned-orders-empty';
import { AssignedOrdersError } from './assigned-orders-error';
import {
  FIRST_PAGE,
  assignedOrdersListHref,
  toAssignedOrdersQuery,
  type AssignmentViewKind,
} from './assigned-orders-list-params';
import { AssignedOrdersTable } from './assigned-orders-table';

type AssignedOrdersListSectionProps = {
  /** Ya acotados por `parseAssignedOrdersListParams`. */
  readonly params: DataTableParams;
  /** La vista vigente: viaja a cada `href` de paginacion para que no se pierda al navegar. */
  readonly vista: AssignmentViewKind;
  readonly canExecute: boolean;
};

/** La accion se importa por su ruta exacta: el barrel del modulo no la reexporta a proposito. */
export async function AssignedOrdersListSection({
  params,
  vista,
  canExecute,
}: AssignedOrdersListSectionProps) {
  const result = await listAssignedOrdersAction(toAssignedOrdersQuery(params));

  if (result.status === 'error') {
    return <AssignedOrdersError error={result} />;
  }

  const { items, page: currentPage, totalPages } = result.data;

  if (items.length === 0) {
    return (
      <AssignedOrdersEmpty
        firstPageHref={
          currentPage > FIRST_PAGE
            ? assignedOrdersListHref({ ...params, page: FIRST_PAGE }, vista)
            : undefined
        }
      />
    );
  }

  return (
    <AssignedOrdersTable
      rows={items}
      params={params}
      totalPages={totalPages}
      vista={vista}
      canExecute={canExecute}
    />
  );
}
