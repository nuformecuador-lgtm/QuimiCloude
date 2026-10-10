'use client';

import type { DataTableColumn } from '@/components/shared/data-table';
import type { AssignedOrderView } from '@/lib/modules/asignaciones';
import type { OrderPriority } from '@/lib/modules/pedidos';

import { AssignedOrderEnterTrigger } from './assigned-order-enter-trigger';
import {
  orderNumberColumn,
  presentationColumn,
  quantityColumn,
  recipeColumn,
  responsiblesColumn,
} from './assignment-list-parts';

// El barrel de la ruta sigue exportando este nombre.
export { EMPTY_MARK as MISSING_VALUE_MARK } from '@/lib/shared/ui/empty-mark';

export const ASSIGNED_ORDER_STATUS_LABELS: Readonly<Record<AssignedOrderView['status'], string>> =
  {
    PENDIENTE: 'Pendiente',
    EN_CURSO: 'En curso',
    BLOQUEADO: 'Bloqueado',
  };

export const ASSIGNED_ORDER_PRIORITY_LABELS: Readonly<Record<OrderPriority, string>> = {
  BAJA: 'Baja',
  MEDIA: 'Media',
  ALTA: 'Alta',
  CRITICA: 'Crítica',
};

export const ASSIGNED_ORDER_NUMBER_COLUMN_ID = 'orderNumber';
export const ASSIGNED_ORDER_RECIPE_NAME_COLUMN_ID = 'recipeName';
export const ASSIGNED_ORDER_QUANTITY_COLUMN_ID = 'quantity';
export const ASSIGNED_ORDER_PRESENTATION_COLUMN_ID = 'presentationName';
export const ASSIGNED_ORDER_PRIORITY_COLUMN_ID = 'priority';
export const ASSIGNED_ORDER_STATUS_COLUMN_ID = 'status';
export const ASSIGNED_ORDER_RESPONSIBLES_COLUMN_ID = 'responsibles';
export const ASSIGNED_ORDER_ENTER_COLUMN_ID = 'enter';

export type AssignedOrdersColumnsOptions = {
  /** Decidido en servidor; sin el, la columna «Entrar» no se emite. */
  readonly canExecute: boolean;
};

export function buildAssignedOrdersColumns({
  canExecute,
}: AssignedOrdersColumnsOptions): readonly DataTableColumn<AssignedOrderView>[] {
  const columns: DataTableColumn<AssignedOrderView>[] = [
    orderNumberColumn(ASSIGNED_ORDER_NUMBER_COLUMN_ID),
    recipeColumn(ASSIGNED_ORDER_RECIPE_NAME_COLUMN_ID, 'assigned-order'),
    quantityColumn(ASSIGNED_ORDER_QUANTITY_COLUMN_ID, (quantity) => quantity),
    presentationColumn(ASSIGNED_ORDER_PRESENTATION_COLUMN_ID),
    {
      id: ASSIGNED_ORDER_PRIORITY_COLUMN_ID,
      label: 'Prioridad',
      align: 'start',
      cell: (order) => (
        <span data-testid="assigned-order-priority" data-priority={order.priority}>
          {ASSIGNED_ORDER_PRIORITY_LABELS[order.priority]}
        </span>
      ),
    },
    {
      id: ASSIGNED_ORDER_STATUS_COLUMN_ID,
      label: 'Estado',
      align: 'start',
      cell: (order) => (
        <span data-testid="assigned-order-status" data-status={order.status}>
          {ASSIGNED_ORDER_STATUS_LABELS[order.status]}
        </span>
      ),
    },
    responsiblesColumn(ASSIGNED_ORDER_RESPONSIBLES_COLUMN_ID, (order) => order.otherResponsibles),
  ];

  if (canExecute) {
    columns.push({
      id: ASSIGNED_ORDER_ENTER_COLUMN_ID,
      label: 'Entrar',
      align: 'end',
      pinnable: false,
      cell: (order) => <AssignedOrderEnterTrigger order={order} />,
    });
  }

  return columns;
}
