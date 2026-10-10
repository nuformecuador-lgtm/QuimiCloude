import type { ReactNode } from 'react';

import type { DataTableColumn } from './data-table-types';

const ACTIONS_COLUMN_ID = 'actions';

const ACTIONS_COLUMN_LABEL = 'Acciones';

export type ActionsColumnOptions<T> = {
  readonly id?: string;
  readonly label?: string;
  readonly align?: 'end';
  /** Sin valor, la columna no se puede fijar: asi no tapa las columnas de datos. */
  readonly defaultPinned?: 'right';
  readonly cell: (row: T) => ReactNode;
};

/** Columna de acciones por fila: no ordena ni filtra. */
export function actionsColumn<T>(opts: ActionsColumnOptions<T>): DataTableColumn<T> {
  const base = {
    id: opts.id ?? ACTIONS_COLUMN_ID,
    label: opts.label ?? ACTIONS_COLUMN_LABEL,
    align: opts.align ?? 'end',
    cell: opts.cell,
  } as const;

  return opts.defaultPinned === undefined
    ? { ...base, pinnable: false }
    : { ...base, defaultPinned: opts.defaultPinned };
}
