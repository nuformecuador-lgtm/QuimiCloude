'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useTransition } from 'react';

import { DataTable, type DataTableParams, type DataTableTexts } from '@/components/shared/data-table';
import type { FinishedOrderView } from '@/lib/modules/asignaciones';
import { ASSIGNED_ORDERS_ROUTE } from '@/lib/shared/routes';

import { PAGE_PARAM, PAGE_SIZE_PARAM, VIEW_PARAM } from './assignment-view-params';
import {
  FINISHED_ORDERS_DEFAULT_PINNED_COLUMNS,
  buildFinishedOrdersColumns,
} from './finished-orders-columns';

export const FINISHED_ORDERS_TABLE_ID = 'asignacion-terminados';

/** `search` es obligatorio en el contrato de textos aunque `searchable={false}` no lo pinte. */
export const FINISHED_ORDERS_TABLE_TEXTS: DataTableTexts = {
  empty: 'No hay pedidos terminados que mostrar.',
  loading: 'Cargando pedidos terminados…',
  error: 'No se pudo cargar la lista de pedidos terminados.',
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

/** Pagina «Terminados» sin perder la vista vigente (`?vista=terminados`). No hay filtro que llevar. */
export function finishedOrdersHref(params: Pick<DataTableParams, 'page' | 'pageSize'>): string {
  const query = new URLSearchParams();
  query.set(PAGE_PARAM, String(params.page));
  query.set(PAGE_SIZE_PARAM, String(params.pageSize));
  query.set(VIEW_PARAM, 'terminados');
  return `${ASSIGNED_ORDERS_ROUTE}?${query.toString()}`;
}

export type FinishedOrdersTableProps = {
  readonly rows: readonly FinishedOrderView[];
  readonly params: DataTableParams;
  readonly totalPages: number;
};

export function FinishedOrdersTable({ rows, params, totalPages }: FinishedOrdersTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const columns = useMemo(() => buildFinishedOrdersColumns(), []);

  const navigate = (href: string) => {
    startTransition(() => {
      router.push(href);
    });
  };

  return (
    <div
      data-testid="finished-orders-table"
      aria-busy={isPending}
      className={isPending ? 'opacity-60 transition-opacity' : 'transition-opacity'}
    >
      {isPending ? (
        <p className="text-xs text-muted-foreground">{FINISHED_ORDERS_TABLE_TEXTS.loading}</p>
      ) : null}
      <DataTable
        tableId={FINISHED_ORDERS_TABLE_ID}
        columns={columns}
        rows={rows}
        getRowId={(order) => order.id}
        params={params}
        totalPages={totalPages}
        onParamsChange={(next) => navigate(finishedOrdersHref(next))}
        status="idle"
        texts={FINISHED_ORDERS_TABLE_TEXTS}
        searchable={false}
        defaultPinnedColumns={FINISHED_ORDERS_DEFAULT_PINNED_COLUMNS}
      />
    </div>
  );
}
