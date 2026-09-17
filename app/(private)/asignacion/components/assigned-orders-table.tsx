'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useTransition } from 'react';

import { DataTable, type DataTableParams, type DataTableTexts } from '@/components/shared/data-table';
import type { AssignedOrderView } from '@/lib/modules/asignaciones';

import {
  ASSIGNED_ORDERS_DEFAULT_PINNED_COLUMNS,
  buildAssignedOrdersColumns,
} from './assigned-orders-columns';
import { assignedOrdersListHref } from './assigned-orders-list-params';

/**
 * La tabla de la lista de pedidos asignados (R26, R31, `design.md > 8.1`).
 *
 * **Monta la tabla compartida de QC-55**, por su barrel publico, con `status="idle"` SIEMPRE y
 * `searchable={false}` SIEMPRE: esta lista no busca (`design.md > 9.1`).
 *
 * **Solo emite; el servidor recalcula**: `onParamsChange` entrega el `DataTableParams` completo,
 * y aqui se traduce a una navegacion (`router.push`) con la cadena de consulta canonica derivada
 * de `ASSIGNED_ORDERS_ROUTE` (via `assignedOrdersListHref`). La navegacion va DENTRO de una
 * transicion, y su `isPending` es la senal de «algo esta en vuelo» -mismo patron que
 * `OrderTable`, sin usar la `key` del `<Suspense>` para eso, que remontaria el subarbol y borraria
 * el foco-.
 */

/** Clave de persistencia del fijado de columnas. Una sola tabla en la pantalla, un solo id. */
export const ASSIGNED_ORDERS_TABLE_ID = 'asignacion';

/**
 * Textos del componente compartido. `search` es obligatorio en el contrato de textos aunque
 * `searchable={false}` no lo pinte en ningun sitio.
 */
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
};

export function AssignedOrdersTable({ rows, params, totalPages }: AssignedOrdersTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const columns = useMemo(() => buildAssignedOrdersColumns(), []);

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
        onParamsChange={(next) => navigate(assignedOrdersListHref(next))}
        status="idle"
        texts={ASSIGNED_ORDERS_TABLE_TEXTS}
        searchable={false}
        defaultPinnedColumns={ASSIGNED_ORDERS_DEFAULT_PINNED_COLUMNS}
      />
    </div>
  );
}
