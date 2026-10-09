'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useTransition } from 'react';

import { DataTable, type DataTableParams, type DataTableTexts } from '@/components/shared/data-table';
import type { ConditioningOrderRow } from '@/lib/modules/asignaciones';

import { buildConditioningOrdersColumns } from './conditioning-orders-columns';
import { conditioningOrdersHref } from './conditioning-orders-href';

export const CONDITIONING_ORDERS_TABLE_ID = 'asignacion-por-acondicionar';

/** `search` es obligatorio en el contrato de textos aunque `searchable={false}` no lo pinte. */
export const CONDITIONING_ORDERS_TABLE_TEXTS: DataTableTexts = {
  empty: 'No hay pedidos por acondicionar que mostrar.',
  loading: 'Cargando pedidos por acondicionar…',
  error: 'No se pudo cargar la lista de pedidos por acondicionar.',
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

export type ConditioningOrdersTableProps = {
  readonly rows: readonly ConditioningOrderRow[];
  readonly params: DataTableParams;
  readonly totalPages: number;
};

export function ConditioningOrdersTable({ rows, params, totalPages }: ConditioningOrdersTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const columns = useMemo(() => buildConditioningOrdersColumns(), []);

  const navigate = (href: string) => {
    startTransition(() => {
      router.push(href);
    });
  };

  return (
    <div
      data-testid="conditioning-orders-table"
      aria-busy={isPending}
      className={isPending ? 'opacity-60 transition-opacity' : 'transition-opacity'}
    >
      {isPending ? (
        <p className="text-xs text-muted-foreground">{CONDITIONING_ORDERS_TABLE_TEXTS.loading}</p>
      ) : null}
      <DataTable
        tableId={CONDITIONING_ORDERS_TABLE_ID}
        columns={columns}
        rows={rows}
        getRowId={(order) => order.id}
        params={params}
        totalPages={totalPages}
        onParamsChange={(next) => navigate(conditioningOrdersHref(next))}
        status="idle"
        texts={CONDITIONING_ORDERS_TABLE_TEXTS}
        searchable={false}
      />
    </div>
  );
}
