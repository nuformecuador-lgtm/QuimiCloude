'use client';

import type { ReactNode } from 'react';

import { actionsColumn, type DataTableColumn } from '@/components/shared/data-table';
import { CUSTOMER_QUERYABLE, type CustomerView } from '@/lib/modules/clientes';
import { formatCivilDate } from '@/lib/shared/ui/date-civil';
import { EMPTY_MARK } from '@/lib/shared/ui/empty-mark';

import { CITY_COLUMN_ID, CREATED_AT_COLUMN_ID } from './customer-list-params';

/**
 * Las nueve columnas de la lista de clientes, declaradas como datos.
 *
 * **Factoria y no un array del modulo**: la columna de acciones es un componente de cliente que
 * llega por parametro (mismo patron que `order-columns.tsx` y `recipe-columns.tsx`).
 *
 * `sortable` y `filter` se leen de `CUSTOMER_QUERYABLE` en vez de escribirse a mano: si la lista
 * blanca cambia, esta declaracion no queda desincronizada en silencio.
 */

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
      {EMPTY_MARK}
    </span>
  );
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
      tabular: true,
      align: 'start',
      sortable: isSortable(CREATED_AT_COLUMN_ID),
      filter:
        CUSTOMER_QUERYABLE.filterable[CREATED_AT_COLUMN_ID] === 'dateRange'
          ? { kind: 'dateRange' }
          : undefined,
      cell: (customer) => formatCivilDate(customer.createdAt),
    },
    {
      id: UPDATED_AT_COLUMN_ID,
      label: 'Última modificación',
      tabular: true,
      align: 'start',
      sortable: isSortable(UPDATED_AT_COLUMN_ID),
      cell: (customer) => formatCivilDate(customer.updatedAt),
    },
    {
      ...actionsColumn<CustomerView>({
        id: ACTIONS_COLUMN_ID,
        label: 'Acciones',
        cell: (customer) => rowActions(customer),
      }),
      id: ACTIONS_COLUMN_ID,
    },
  ];
}
