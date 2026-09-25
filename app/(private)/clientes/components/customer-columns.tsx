'use client';

import type { ReactNode } from 'react';

import type { DataTableColumn } from '@/components/shared/data-table';
import { CUSTOMER_QUERYABLE, type CustomerView } from '@/lib/modules/clientes';

import { CITY_COLUMN_ID, CREATED_AT_COLUMN_ID } from './customer-list-params';

/**
 * Las nueve columnas de la lista de clientes, declaradas como datos (`design.md > 5.4`).
 *
 * **Factoria y no un array del modulo**: la columna de acciones es un componente de cliente que
 * llega por parametro (mismo patron que `order-columns.tsx` y `recipe-columns.tsx`), porque en
 * este archivo aun no existe `customer-row-actions.tsx`.
 *
 * `sortable` y `filter` se leen de `CUSTOMER_QUERYABLE` en vez de escribirse a mano: si la lista
 * blanca cambia, esta declaracion no queda desincronizada en silencio.
 */

export const MISSING_VALUE_MARK = '—';

export const LAST_NAMES_COLUMN_ID = 'lastNames';
export const FIRST_NAMES_COLUMN_ID = 'firstNames';
export const PHONE_COLUMN_ID = 'phone';
export const EMAIL_COLUMN_ID = 'email';
export const ADDRESS_COLUMN_ID = 'address';
export const UPDATED_AT_COLUMN_ID = 'updatedAt';
export const ACTIONS_COLUMN_ID = 'actions';

type HiddenCustomerField = 'id' | 'createdBy' | 'updatedBy';

export type CustomerColumnId = Exclude<keyof CustomerView, HiddenCustomerField> | typeof ACTIONS_COLUMN_ID;

export type CustomerColumn = DataTableColumn<CustomerView> & { readonly id: CustomerColumnId };

export type CustomerColumnsDeps = {
  /** Slot: quien monta la tabla enchufa las acciones de fila, ya acotadas por `canModify`. */
  readonly rowActions: (customer: CustomerView) => ReactNode;
};

function MissingValue({ field }: { readonly field: string }) {
  return (
    <span aria-label="Sin dato" data-testid={`customer-missing-${field}`}>
      {MISSING_VALUE_MARK}
    </span>
  );
}

// UTC y no `toLocaleDateString`: servidor y navegador tienen husos distintos y la fecha local
// provoca un desajuste de hidratacion.
function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function isSortable(id: string): boolean {
  return CUSTOMER_QUERYABLE.sortable.includes(id);
}

export function buildCustomerColumns({ rowActions }: CustomerColumnsDeps): readonly CustomerColumn[] {
  return [
    {
      id: LAST_NAMES_COLUMN_ID,
      label: 'Apellidos',
      align: 'start',
      sortable: isSortable(LAST_NAMES_COLUMN_ID),
      cell: (customer) => customer.lastNames,
    },
    {
      id: FIRST_NAMES_COLUMN_ID,
      label: 'Nombres',
      align: 'start',
      sortable: isSortable(FIRST_NAMES_COLUMN_ID),
      cell: (customer) => customer.firstNames,
    },
    {
      id: CITY_COLUMN_ID,
      label: 'Ciudad',
      align: 'start',
      sortable: isSortable(CITY_COLUMN_ID),
      filter: CUSTOMER_QUERYABLE.filterable[CITY_COLUMN_ID] === 'text' ? { kind: 'text' } : undefined,
      cell: (customer) => customer.city,
    },
    {
      id: PHONE_COLUMN_ID,
      label: 'Teléfono',
      align: 'start',
      cell: (customer) => customer.phone ?? <MissingValue field={PHONE_COLUMN_ID} />,
    },
    {
      id: EMAIL_COLUMN_ID,
      label: 'Correo',
      align: 'start',
      cell: (customer) => customer.email ?? <MissingValue field={EMAIL_COLUMN_ID} />,
    },
    {
      id: ADDRESS_COLUMN_ID,
      label: 'Dirección',
      align: 'start',
      cell: (customer) => customer.address ?? <MissingValue field={ADDRESS_COLUMN_ID} />,
    },
    {
      id: CREATED_AT_COLUMN_ID,
      label: 'Fecha de alta',
      align: 'start',
      sortable: isSortable(CREATED_AT_COLUMN_ID),
      filter:
        CUSTOMER_QUERYABLE.filterable[CREATED_AT_COLUMN_ID] === 'dateRange'
          ? { kind: 'dateRange' }
          : undefined,
      cell: (customer) => formatDate(customer.createdAt),
    },
    {
      id: UPDATED_AT_COLUMN_ID,
      label: 'Última modificación',
      align: 'start',
      sortable: isSortable(UPDATED_AT_COLUMN_ID),
      cell: (customer) => formatDate(customer.updatedAt),
    },
    {
      id: ACTIONS_COLUMN_ID,
      label: 'Acciones',
      align: 'end',
      pinnable: false,
      cell: (customer) => rowActions(customer),
    },
  ];
}
