'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useTransition } from 'react';

import { DataTable, type DataTableParams, type DataTableTexts } from '@/components/shared/data-table';
import type { AssignedOrderView, AssignmentViewKind } from '@/lib/modules/asignaciones';

import {
  ASSIGNED_ORDERS_DEFAULT_PINNED_COLUMNS,
  buildAssignedOrdersColumns,
} from './assigned-orders-columns';
import { assignedOrdersListHref } from './assigned-orders-list-params';

export const ASSIGNED_ORDERS_TABLE_ID = 'asignacion';

/** `search` es obligatorio en el contrato de textos aunque `searchable={false}` no lo pinte. */
export const ASSIGNED_ORDERS_TABLE_TEXTS: DataTableTexts = {
  empty: 'No hay pedidos asignados que mostrar.',
  loading: 'Cargando pedidos asignados…',
  error: 'No se pudo cargar la lista de pedidos asignados.',
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

export type AssignedOrdersTableProps = {
  readonly rows: readonly AssignedOrderView[];
  readonly params: DataTableParams;
  readonly totalPages: number;
  /** La vista vigente: viaja a cada `href` de paginacion para que no se pierda al navegar. */
  readonly vista: AssignmentViewKind;
};

export function AssignedOrdersTable({ rows, params, totalPages, vista }: AssignedOrdersTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const columns = useMemo(() => buildAssignedOrdersColumns(), []);

  // El «en vuelo» sale del `isPending` de la transicion y no de una `key` en el `<Suspense>`:
  // remontar ese limite borraria el foco.
  const navigate = (href: string) => {
    startTransition(() => {
      router.push(href);
    });
  };

  return (
    <div
      data-testid="assigned-orders-table"
      aria-busy={isPending}
      className={isPending ? 'opacity-60 transition-opacity' : 'transition-opacity'}
    >
      {isPending ? (
        <p className="text-xs text-muted-foreground">{ASSIGNED_ORDERS_TABLE_TEXTS.loading}</p>
      ) : null}
      <DataTable
        tableId={ASSIGNED_ORDERS_TABLE_ID}
        columns={columns}
        rows={rows}
        getRowId={(order) => order.id}
        params={params}
        totalPages={totalPages}
        onParamsChange={(next) => navigate(assignedOrdersListHref(next, vista))}
        status="idle"
        texts={ASSIGNED_ORDERS_TABLE_TEXTS}
        searchable={false}
        defaultPinnedColumns={ASSIGNED_ORDERS_DEFAULT_PINNED_COLUMNS}
      />
    </div>
  );
}
