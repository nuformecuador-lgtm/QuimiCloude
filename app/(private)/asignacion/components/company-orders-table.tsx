'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useTransition } from 'react';

import {
  DataTable,
  type DataTableFilterValue,
  type DataTableParams,
  type DataTableTexts,
} from '@/components/shared/data-table';
import type { CompanyOrderView } from '@/lib/modules/asignaciones';
import { ASSIGNED_ORDERS_ROUTE } from '@/lib/shared/routes';

import {
  PAGE_PARAM,
  PAGE_SIZE_PARAM,
  STATUS_PARAM,
  VIEW_PARAM,
  ROUTE_ORDER_STATUS_VALUES,
  isExactlyDelivered,
  type RouteOrderStatus,
} from './assignment-view-params';
import {
  COMPANY_ORDERS_DEFAULT_PINNED_COLUMNS,
  COMPANY_ORDER_STATUS_COLUMN_ID,
  buildCompanyOrdersColumns,
} from './company-orders-columns';

export const COMPANY_ORDERS_TABLE_ID = 'asignacion-todos';

/** `search` es obligatorio en el contrato de textos aunque `searchable={false}` no lo pinte. */
export const COMPANY_ORDERS_TABLE_TEXTS: DataTableTexts = {
  empty: 'No hay pedidos que mostrar.',
  loading: 'Cargando pedidos…',
  error: 'No se pudo cargar la lista de pedidos.',
  search: 'Buscar',
  filters: 'Filtros',
  columnMenu: 'opciones de la columna',
  previousPage: 'Página anterior',
  nextPage: 'Página siguiente',
  pageIndicator: (page, totalPages) => `Página ${page} de ${totalPages}`,
  pageSize: 'Pedidos por página',
  sortAscending: 'Orden ascendente',
  sortDescending: 'Orden descendente',
  pinColumn: 'Fijar columna',
  unpinColumn: 'Soltar columna',
  filterColumn: 'Filtrar columna',
  clearFilter: 'Limpiar filtro',
  lastWeek: 'Última semana',
  lastMonth: 'Último mes',
  lastYear: 'Último año',
};

/** Solo los valores reconocidos por la ruta llegan a la URL; cualquier otra cosa se descarta. */
function toRouteStatuses(value: DataTableFilterValue | undefined): readonly RouteOrderStatus[] {
  if (value === undefined || value.kind !== 'select') return [];
  return value.values.filter((candidate): candidate is RouteOrderStatus =>
    (ROUTE_ORDER_STATUS_VALUES as readonly string[]).includes(candidate),
  );
}

/** Pagina «Todos» conservando la vista y el filtro de estado. Sin filtro, sin `status`. */
export function companyOrdersHref(
  params: Pick<DataTableParams, 'page' | 'pageSize'>,
  statuses: readonly RouteOrderStatus[],
): string {
  const query = new URLSearchParams();
  query.set(PAGE_PARAM, String(params.page));
  query.set(PAGE_SIZE_PARAM, String(params.pageSize));
  query.set(VIEW_PARAM, 'todos');
  if (statuses.length > 0) query.set(STATUS_PARAM, statuses.join(','));
  return `${ASSIGNED_ORDERS_ROUTE}?${query.toString()}`;
}

export type CompanyOrdersTableProps = {
  readonly rows: readonly CompanyOrderView[];
  readonly params: DataTableParams;
  readonly totalPages: number;
  /** Ya acotado por `parseStatusFilter`: vacio significa «sin filtro», los cuatro estados. */
  readonly statuses: readonly RouteOrderStatus[];
};

export function CompanyOrdersTable({ rows, params, totalPages, statuses }: CompanyOrdersTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const showFinishedAt = isExactlyDelivered(statuses);
  const columns = useMemo(() => buildCompanyOrdersColumns({ showFinishedAt }), [showFinishedAt]);

  // El filtro «Estado» de la barra refleja el `status` de la URL: es la unica columna cuyo valor
  // no viaja en `params` (T12 lo deja fuera del esquema compartido de pagina/tamano).
  const tableParams: DataTableParams = useMemo(() => {
    const filters: Record<string, DataTableFilterValue> = {};
    if (statuses.length > 0) {
      filters[COMPANY_ORDER_STATUS_COLUMN_ID] = { kind: 'select', values: [...statuses] };
    }
    return { ...params, filters };
  }, [params, statuses]);

  const navigate = (href: string) => {
    startTransition(() => {
      router.push(href);
    });
  };

  return (
    <div
      data-testid="company-orders-table"
      aria-busy={isPending}
      className={isPending ? 'opacity-60 transition-opacity' : 'transition-opacity'}
    >
      {isPending ? (
        <p className="text-xs text-muted-foreground">{COMPANY_ORDERS_TABLE_TEXTS.loading}</p>
      ) : null}
      <DataTable
        tableId={COMPANY_ORDERS_TABLE_ID}
        columns={columns}
        rows={rows}
        getRowId={(order) => order.id}
        params={tableParams}
        totalPages={totalPages}
        onParamsChange={(next) =>
          navigate(
            companyOrdersHref(
              { page: next.page, pageSize: next.pageSize },
              toRouteStatuses(next.filters[COMPANY_ORDER_STATUS_COLUMN_ID]),
            ),
          )
        }
        status="idle"
        texts={COMPANY_ORDERS_TABLE_TEXTS}
        searchable={false}
        defaultPinnedColumns={COMPANY_ORDERS_DEFAULT_PINNED_COLUMNS}
      />
    </div>
  );
}
