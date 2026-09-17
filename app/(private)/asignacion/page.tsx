import type { Metadata } from 'next';
import { Suspense } from 'react';

import { requirePagePermission } from '@/lib/modules/identity/adapters/driving/require-page-permission';
import { ASSIGNED_ORDERS_LABEL, BRAND_LABEL } from '@/lib/shared/navigation/private-nav';

import {
  AssignedOrdersListSection,
  AssignedOrdersSkeleton,
  parseAssignedOrdersListParams,
  type AssignedOrdersSearchParams,
} from './components';

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

  const params = parseAssignedOrdersListParams(await searchParams);

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 data-testid="asignacion-title" className="text-2xl font-semibold">
          {ASSIGNED_ORDERS_LABEL}
        </h1>
      </div>
      <Suspense fallback={<AssignedOrdersSkeleton rows={params.pageSize} />}>
        <AssignedOrdersListSection params={params} />
      </Suspense>
    </div>
  );
}
