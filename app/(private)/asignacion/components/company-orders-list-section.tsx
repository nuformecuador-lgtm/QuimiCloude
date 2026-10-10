import type { DataTableParams } from '@/components/shared/data-table';
import { listCompanyOrdersAction } from '@/lib/modules/asignaciones/adapters/driving/order-assignment-actions';

import {
  AssignmentListError,
  AssignmentListSectionFrame,
  firstPageHrefWhenPast,
} from './assignment-list-parts';
import { FIRST_PAGE, type RouteOrderStatus } from './assignment-view-params';
import { CompanyOrdersEmpty } from './company-orders-empty';
import { CompanyOrdersTable, companyOrdersHref } from './company-orders-table';

export const COMPANY_ORDERS_SECTION_TESTID = 'company-orders-list-section';

type CompanyOrdersListSectionProps = {
  /** Ya acotados por `parseAssignmentListParams`. */
  readonly params: DataTableParams;
  /** Ya acotado por `parseStatusFilter`: vacio significa «sin filtro», los cuatro estados. */
  readonly statuses: readonly RouteOrderStatus[];
};

/**
 * `/asignacion?vista=todos`: pide la pagina con el filtro de
 * estado vigente y reparte error, vacio o tabla. La accion se importa por su ruta exacta: el
 * barrel del modulo no la reexporta a proposito.
 */
export async function CompanyOrdersListSection({ params, statuses }: CompanyOrdersListSectionProps) {
  const result = await listCompanyOrdersAction({
    page: params.page,
    pageSize: params.pageSize,
    ...(statuses.length > 0 ? { statuses } : {}),
  });

  if (result.status === 'error') {
    return (
      <AssignmentListSectionFrame testId={COMPANY_ORDERS_SECTION_TESTID}>
        <AssignmentListError error={result} />
      </AssignmentListSectionFrame>
    );
  }

  const { items, page: currentPage, totalPages } = result.data;

  if (items.length === 0) {
    return (
      <AssignmentListSectionFrame testId={COMPANY_ORDERS_SECTION_TESTID}>
        <CompanyOrdersEmpty
          firstPageHref={firstPageHrefWhenPast(currentPage, FIRST_PAGE, () =>
            companyOrdersHref({ page: FIRST_PAGE, pageSize: params.pageSize }, statuses),
          )}
        />
      </AssignmentListSectionFrame>
    );
  }

  return (
    <AssignmentListSectionFrame testId={COMPANY_ORDERS_SECTION_TESTID}>
      <CompanyOrdersTable rows={items} params={params} totalPages={totalPages} statuses={statuses} />
    </AssignmentListSectionFrame>
  );
}
