'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useTransition, type MouseEvent, type ReactNode } from 'react';

import {
  DataTable,
  type DataTableParams,
  type DataTableTexts,
} from '@/components/shared/data-table';
import { SupplierSheet } from '@/components/shared/supplier';
import { buttonVariants } from '@/components/ui/button';
import type { SupplierView } from '@/lib/modules/proveedores';
import { cn } from '@/lib/utils';

import { DeleteSupplierDialog } from '../[id]/components/delete-supplier-dialog';
import { SUPPLIER_DEFAULT_PINNED_COLUMNS, buildSupplierColumns } from './supplier-columns';
import { supplierListHref } from './supplier-list-params';

export const SUPPLIER_TABLE_ID = 'proveedores';

export const SUPPLIER_TABLE_TEXTS: DataTableTexts = {
  empty: 'No hay proveedores que mostrar.',
  loading: 'Cargando proveedores…',
  error: 'No se pudo cargar la lista de proveedores.',
  search: 'Buscar proveedor',
  filters: 'Filtros',
  columnMenu: 'opciones de la columna',
  previousPage: 'Página anterior',
  nextPage: 'Página siguiente',
  pageIndicator: (page, totalPages) => `Página ${page} de ${totalPages}`,
  pageSize: 'Proveedores por página',
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

export const SUPPLIER_NO_RESULTS_TEXT = 'Ningún proveedor coincide con la búsqueda o los filtros.';

const CLEAR_SEARCH_LABEL = 'Limpiar búsqueda y filtros';

const FIRST_PAGE_LABEL = 'Volver a la primera página';

const LINK_BUTTON_CLASS = cn(buttonVariants({ variant: 'outline' }), 'min-h-11 min-w-11');

export type SupplierTableProps = {
  readonly suppliers: readonly SupplierView[];
  readonly params: DataTableParams;
  readonly totalPages: number;
  /** Solo con cero filas y búsqueda o filtro activos. */
  readonly noResults?: { readonly clearHref: string; readonly firstPageHref?: string };
};

// Con modificadores o botón central se deja al navegador abrir otra pestaña.
function isPlainClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return (
    event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
  );
}

export function SupplierTable({ suppliers, params, totalPages, noResults }: SupplierTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Las acciones se montan aquí y no llegan de la sección: una función no cruza la frontera
  // servidor-cliente.
  const columns = useMemo(
    () =>
      buildSupplierColumns({
        rowActions: (supplier) => (
          <>
            <SupplierSheet supplier={supplier} />
            <DeleteSupplierDialog supplier={supplier} />
          </>
        ),
      }),
    [],
  );

  // Transición en vez de remontar la tabla: remontarla haría perder el foco y el borrador de la
  // búsqueda mientras el servidor recalcula.
  const navigate = (href: string) => {
    startTransition(() => {
      router.push(href);
    });
  };

  const navigateOnPlainClick = (href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    navigate(href);
  };

  let emptyAction: ReactNode;
  if (noResults !== undefined) {
    emptyAction = (
      <div
        data-testid="supplier-list-no-results"
        className="flex flex-wrap items-center justify-center gap-2"
      >
        <Link
          href={noResults.clearHref}
          onClick={navigateOnPlainClick(noResults.clearHref)}
          data-slot="button"
          data-testid="supplier-list-clear-search"
          className={LINK_BUTTON_CLASS}
        >
          {CLEAR_SEARCH_LABEL}
        </Link>
        {noResults.firstPageHref === undefined ? null : (
          <Link
            href={noResults.firstPageHref}
            onClick={navigateOnPlainClick(noResults.firstPageHref)}
            data-slot="button"
            data-testid="supplier-list-no-results-first-page"
            className={LINK_BUTTON_CLASS}
          >
            {FIRST_PAGE_LABEL}
          </Link>
        )}
      </div>
    );
  }

  return (
    <div
      data-testid="supplier-table"
      aria-busy={isPending}
      className={isPending ? 'opacity-60 transition-opacity' : 'transition-opacity'}
    >
      {isPending ? (
        <p className="text-xs text-muted-foreground">{SUPPLIER_TABLE_TEXTS.loading}</p>
      ) : null}
      <DataTable
        tableId={SUPPLIER_TABLE_ID}
        columns={columns}
        rows={suppliers}
        getRowId={(supplier) => supplier.id}
        params={params}
        totalPages={totalPages}
        onParamsChange={(next) => navigate(supplierListHref(next))}
        status="idle"
        texts={
          noResults === undefined
            ? SUPPLIER_TABLE_TEXTS
            : { ...SUPPLIER_TABLE_TEXTS, empty: SUPPLIER_NO_RESULTS_TEXT }
        }
        emptyAction={emptyAction}
        defaultPinnedColumns={SUPPLIER_DEFAULT_PINNED_COLUMNS}
      />
    </div>
  );
}
