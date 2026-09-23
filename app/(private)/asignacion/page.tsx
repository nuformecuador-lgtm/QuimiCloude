import type { Metadata } from 'next';
import { Suspense } from 'react';

import { identity } from '@/lib/composition';
import { resolveAssignmentView, resolveAssignmentViews } from '@/lib/modules/asignaciones';
import { requirePagePermission } from '@/lib/modules/identity/adapters/driving/require-page-permission';
import { ASSIGNED_ORDERS_LABEL, BRAND_LABEL } from '@/lib/shared/navigation/private-nav';
import { DELIVERED_ORDER_PARAM } from '@/lib/shared/routes';

import {
  AssignedOrderDeliveredNotice,
  AssignedOrdersListSection,
  AssignedOrdersSkeleton,
  AssignmentViewTabs,
  CompanyOrdersListSection,
  FinishedOrdersListSection,
  VIEW_PARAM,
  parseAssignedOrdersListParams,
  parseAssignmentListParams,
  parseStatusFilter,
  type AssignedOrdersSearchParams,
} from './components';

/** El App Router entrega un array cuando el parametro viene repetido: la primera basta aqui. */
function firstSearchParamValue(raw: string | readonly string[] | undefined): string | undefined {
  if (raw === undefined) return undefined;
  return typeof raw === 'string' ? raw : raw[0];
}

export const metadata: Metadata = {
  title: `${ASSIGNED_ORDERS_LABEL} · ${BRAND_LABEL}`,
};

export default async function AsignacionPage({
  searchParams,
}: {
  searchParams: Promise<AssignedOrdersSearchParams>;
}) {
  // El corte por permiso va antes de resolver `searchParams`: sin permiso no se procesa ni la
  // entrada.
  await requirePagePermission('asignaciones.consultar');

  const resolvedSearchParams = await searchParams;

  // Misma lectura de sesion de la peticion que `requirePagePermission`: `getSessionUser` esta
  // memoizado por peticion, asi que esto no es una segunda consulta a la base.
  const sessionUser = await identity.getSessionUser();
  const views = resolveAssignmentViews(sessionUser);
  const vista = resolveAssignmentView(firstSearchParamValue(resolvedSearchParams[VIEW_PARAM]), views);

  const deliveredOrderNumber = firstSearchParamValue(
    resolvedSearchParams[DELIVERED_ORDER_PARAM],
  );

  const assignedOrdersParams = parseAssignedOrdersListParams(resolvedSearchParams);
  const genericListParams = parseAssignmentListParams(resolvedSearchParams);
  const statuses = parseStatusFilter(resolvedSearchParams);

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 data-testid="asignacion-title" className="text-2xl font-semibold">
          {ASSIGNED_ORDERS_LABEL}
        </h1>
      </div>
      {deliveredOrderNumber !== undefined ? (
        <AssignedOrderDeliveredNotice orderNumber={deliveredOrderNumber} />
      ) : null}
      {views.length > 1 ? <AssignmentViewTabs current={vista} views={views} /> : null}
      {vista === 'asignados' ? (
        <Suspense fallback={<AssignedOrdersSkeleton rows={assignedOrdersParams.pageSize} />}>
          <AssignedOrdersListSection params={assignedOrdersParams} vista={vista} />
        </Suspense>
      ) : null}
      {vista === 'terminados' ? (
        <Suspense fallback={<AssignedOrdersSkeleton rows={genericListParams.pageSize} />}>
          <FinishedOrdersListSection params={genericListParams} />
        </Suspense>
      ) : null}
      {vista === 'todos' ? (
        <Suspense fallback={<AssignedOrdersSkeleton rows={genericListParams.pageSize} />}>
          <CompanyOrdersListSection params={genericListParams} statuses={statuses} />
        </Suspense>
      ) : null}
    </div>
  );
}
