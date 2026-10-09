import type { Metadata } from 'next';
import { Suspense } from 'react';

import { identity } from '@/lib/composition';
import {
  canExecuteAssignedOrders,
  resolveAssignmentView,
  resolveAssignmentViews,
} from '@/lib/modules/asignaciones';
import { requirePagePermission } from '@/lib/modules/identity/adapters/driving/require-page-permission';
import { ASSIGNED_ORDERS_LABEL, BRAND_LABEL } from '@/lib/shared/navigation/private-nav';
import {
  CANCELLED_ORDER_PARAM,
  CONDITIONED_ORDER_PARAM,
  DELIVERED_ORDER_PACKAGES_PARAM,
  DELIVERED_ORDER_PARAM,
  DELIVERED_ORDER_PRODUCT_PARAM,
  PACKED_ORDER_PARAM,
} from '@/lib/shared/routes';

import {
  AssignedOrderCancelledNotice,
  AssignedOrderDeliveredNotice,
  AssignedOrdersListSection,
  AssignedOrdersSkeleton,
  AssignmentViewTabs,
  CompanyOrdersListSection,
  CompanyOrdersSkeleton,
  ConditionedOrderNotice,
  ConditionedOrdersListSection,
  ConditioningOrdersListSection,
  ConditioningOrdersSkeleton,
  DeliveredConditionedOrdersListSection,
  FinishedOrdersListSection,
  FinishedOrdersSkeleton,
  PackedOrderNotice,
  PackingOrdersListSection,
  PackingOrdersSkeleton,
  VIEW_PARAM,
  isExactlyDelivered,
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
  const canExecute = canExecuteAssignedOrders(sessionUser);
  const vista = resolveAssignmentView(firstSearchParamValue(resolvedSearchParams[VIEW_PARAM]), views);

  const deliveredOrderNumber = firstSearchParamValue(
    resolvedSearchParams[DELIVERED_ORDER_PARAM],
  );
  const deliveredOrderPackages = firstSearchParamValue(
    resolvedSearchParams[DELIVERED_ORDER_PACKAGES_PARAM],
  );
  const deliveredOrderProductName = firstSearchParamValue(
    resolvedSearchParams[DELIVERED_ORDER_PRODUCT_PARAM],
  );
  const packedOrderNumber = firstSearchParamValue(resolvedSearchParams[PACKED_ORDER_PARAM]);
  const conditionedOrderNumber = firstSearchParamValue(resolvedSearchParams[CONDITIONED_ORDER_PARAM]);
  const cancelledOrderNumber = firstSearchParamValue(resolvedSearchParams[CANCELLED_ORDER_PARAM]);

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
        <AssignedOrderDeliveredNotice
          orderNumber={deliveredOrderNumber}
          packages={deliveredOrderPackages}
          productName={deliveredOrderProductName}
        />
      ) : null}
      {cancelledOrderNumber !== undefined ? (
        <AssignedOrderCancelledNotice orderNumber={cancelledOrderNumber} />
      ) : null}
      {vista === 'por_empacar' && packedOrderNumber !== undefined ? (
        <PackedOrderNotice orderNumber={packedOrderNumber} />
      ) : null}
      {vista === 'por_acondicionar' && conditionedOrderNumber !== undefined ? (
        <ConditionedOrderNotice orderNumber={conditionedOrderNumber} />
      ) : null}
      {views.length > 1 ? <AssignmentViewTabs current={vista} views={views} /> : null}
      {vista === 'asignados' ? (
        <Suspense
          fallback={
            <AssignedOrdersSkeleton rows={assignedOrdersParams.pageSize} canExecute={canExecute} />
          }
        >
          <AssignedOrdersListSection
            params={assignedOrdersParams}
            vista={vista}
            canExecute={canExecute}
          />
        </Suspense>
      ) : null}
      {vista === 'terminados' ? (
        <Suspense fallback={<FinishedOrdersSkeleton rows={genericListParams.pageSize} />}>
          <FinishedOrdersListSection params={genericListParams} />
        </Suspense>
      ) : null}
      {vista === 'todos' ? (
        <Suspense
          fallback={
            <CompanyOrdersSkeleton
              rows={genericListParams.pageSize}
              showFinishedAt={isExactlyDelivered(statuses)}
            />
          }
        >
          <CompanyOrdersListSection params={genericListParams} statuses={statuses} />
        </Suspense>
      ) : null}
      {vista === 'por_empacar' ? (
        <Suspense fallback={<PackingOrdersSkeleton rows={genericListParams.pageSize} />}>
          <PackingOrdersListSection params={genericListParams} />
        </Suspense>
      ) : null}
      {vista === 'por_acondicionar' ? (
        <Suspense
          fallback={
            <ConditioningOrdersSkeleton rows={genericListParams.pageSize} list="por_acondicionar" />
          }
        >
          <ConditioningOrdersListSection params={genericListParams} />
        </Suspense>
      ) : null}
      {vista === 'acondicionados' ? (
        <Suspense
          fallback={
            <ConditioningOrdersSkeleton rows={genericListParams.pageSize} list="acondicionados" />
          }
        >
          <ConditionedOrdersListSection params={genericListParams} />
        </Suspense>
      ) : null}
      {vista === 'acondicionados_entregados' ? (
        <Suspense
          fallback={
            <ConditioningOrdersSkeleton
              rows={genericListParams.pageSize}
              list="acondicionados_entregados"
            />
          }
        >
          <DeliveredConditionedOrdersListSection params={genericListParams} />
        </Suspense>
      ) : null}
    </div>
  );
}
