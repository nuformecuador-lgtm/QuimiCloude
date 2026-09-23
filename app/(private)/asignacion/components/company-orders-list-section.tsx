import type { DataTableParams } from '@/components/shared/data-table';
import { listCompanyOrdersAction } from '@/lib/modules/asignaciones/adapters/driving/order-assignment-actions';

import { AssignedOrdersError } from './assigned-orders-error';
import type { RouteOrderStatus } from './assignment-view-params';

export const COMPANY_ORDERS_SECTION_TESTID = 'company-orders-list-section';

type CompanyOrdersListSectionProps = {
  /** Ya acotados por `parseAssignmentListParams`. */
  readonly params: DataTableParams;
  /** Ya acotado por `parseStatusFilter`: vacio significa «sin filtro», los cuatro estados. */
  readonly statuses: readonly RouteOrderStatus[];
};

/**
 * Punto de montaje de la vista «Todos», conectado a su Server Action. Es un ESQUELETO MINIMO: el
 * filtro de estado, la columna de fecha y el resto de columnas propias los completa la task
 * siguiente.
 */
export async function CompanyOrdersListSection({ params, statuses }: CompanyOrdersListSectionProps) {
  const result = await listCompanyOrdersAction({
    page: params.page,
    pageSize: params.pageSize,
    ...(statuses.length > 0 ? { statuses } : {}),
  });

  if (result.status === 'error') {
    return <AssignedOrdersError error={result} />;
  }

  return (
    <div data-testid={COMPANY_ORDERS_SECTION_TESTID}>{result.data.items.length} pedido(s).</div>
  );
}
