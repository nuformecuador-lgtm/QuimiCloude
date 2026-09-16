'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import type { DataTableColumn } from '@/components/shared/data-table';
import type { SupplierView } from '@/lib/modules/proveedores';
import { supplierDetailRoute } from '@/lib/shared/routes';

/** Marca de "sin dato". Constante para que ningun test dependa del glifo. */
export const EMPTY_CELL = '—';

/** Id de la columna de acciones: no es un campo de `SupplierView`, es marcado. */
export const ACTIONS_COLUMN_ID = 'actions';

export const ACTIONS_COLUMN_LABEL = 'Acciones';

/**
 * El nombre normalizado es un dato de deduplicacion, no de lectura, y los ids de autoria no se
 * resuelven a nombres. Excluirlos aqui hace que declarar su columna no compile.
 */
type HiddenSupplierField = 'id' | 'nameNormalized' | 'createdBy' | 'updatedBy';

export type SupplierColumnId =
  | Exclude<keyof SupplierView, HiddenSupplierField>
  | typeof ACTIONS_COLUMN_ID;

export type SupplierColumn = DataTableColumn<SupplierView> & { readonly id: SupplierColumnId };

/** Defecto: si el usuario ya guardo su propio fijado para esta tabla, gana el suyo. */
export const SUPPLIER_DEFAULT_PINNED_COLUMNS: readonly string[] = ['name'];

/**
 * UTC y no `toLocaleDateString`: servidor y navegador tienen husos distintos y la fecha local
 * provoca un desajuste de hidratacion.
 */
function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export type SupplierColumnsDeps = {
  /** Slot: quien monta la tabla enchufa el panel de edicion y el dialogo de baja. */
  readonly rowActions: (supplier: SupplierView) => ReactNode;
};

/**
 * Factoria y no array del modulo porque las acciones son componentes de cliente que llegan por
 * parametro. `sortable` y `filter` replican `SUPPLIER_QUERYABLE`: una cabecera ordenable que el
 * servidor ignora seria un control que miente.
 */
export function buildSupplierColumns({
  rowActions,
}: SupplierColumnsDeps): readonly SupplierColumn[] {
  return [
    {
      id: 'name',
      label: 'Nombre',
      align: 'start',
      sortable: true,
      // El propio nombre es lo que se pulsa para entrar al detalle; el area tactil llega a 44x44.
      cell: (supplier) => (
        <Link
          href={supplierDetailRoute(supplier.id)}
          className="inline-flex min-h-11 min-w-11 items-center justify-start rounded-lg font-medium underline-offset-4 hover:underline"
          aria-label={`Ver el detalle de ${supplier.name}`}
          data-testid="supplier-detail-link"
        >
          {supplier.name}
        </Link>
      ),
    },
    {
      id: 'phone',
      label: 'Teléfono',
      align: 'start',
      cell: (supplier) => supplier.phone ?? EMPTY_CELL,
    },
    {
      id: 'email',
      label: 'Correo electrónico',
      align: 'start',
      cell: (supplier) => supplier.email ?? EMPTY_CELL,
    },
    {
      id: 'createdAt',
      label: 'Creado',
      align: 'start',
      sortable: true,
      filter: { kind: 'dateRange' },
      cell: (supplier) => formatDate(supplier.createdAt),
    },
    {
      id: 'updatedAt',
      label: 'Actualizado',
      align: 'start',
      sortable: true,
      cell: (supplier) => formatDate(supplier.updatedAt),
    },
    {
      id: ACTIONS_COLUMN_ID,
      label: ACTIONS_COLUMN_LABEL,
      align: 'end',
      // Fijarla dejaria las acciones tapando las columnas de datos en pantallas angostas.
      pinnable: false,
      cell: (supplier) => <div className="flex justify-end gap-1">{rowActions(supplier)}</div>,
    },
  ];
}
