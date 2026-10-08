import type { DataTableParams } from '@/components/shared/data-table';
import { ASSIGNED_ORDERS_ROUTE } from '@/lib/shared/routes';

import { PAGE_PARAM, PAGE_SIZE_PARAM, VIEW_PARAM } from './assignment-view-params';

/**
 * Las direcciones de las dos listas del acondicionador, siempre con su vista. Sin `'use client'`:
 * las usan la tabla de cliente al paginar y la sección de servidor para volver a la primera página.
 */

export type ConditioningListView = 'por_acondicionar' | 'acondicionados';

function listHref(
  view: ConditioningListView,
  params: Pick<DataTableParams, 'page' | 'pageSize'>,
): string {
  const query = new URLSearchParams();
  query.set(PAGE_PARAM, String(params.page));
  query.set(PAGE_SIZE_PARAM, String(params.pageSize));
  query.set(VIEW_PARAM, view);
  return `${ASSIGNED_ORDERS_ROUTE}?${query.toString()}`;
}

export function conditioningOrdersHref(params: Pick<DataTableParams, 'page' | 'pageSize'>): string {
  return listHref('por_acondicionar', params);
}

export function conditionedOrdersHref(params: Pick<DataTableParams, 'page' | 'pageSize'>): string {
  return listHref('acondicionados', params);
}
