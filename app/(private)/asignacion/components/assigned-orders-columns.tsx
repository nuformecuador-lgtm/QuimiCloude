'use client';

import type { DataTableColumn } from '@/components/shared/data-table';
import { ResponsibleAvatars } from '@/components/shared/responsible-avatars';
import type { AssignedOrderView } from '@/lib/modules/asignaciones';
import type { OrderPriority } from '@/lib/modules/pedidos';

import { AssignedOrderEnterTrigger } from './assigned-order-enter-trigger';

/**
 * Mismo glifo que el marcador de `/pedidos`, pero declarado aqui: son rutas distintas y esta no
 * importa por ruta profunda desde la otra.
 */
export const MISSING_VALUE_MARK = '—';

function MissingValue({ field }: { readonly field: string }) {
  return (
    <span aria-label="Sin dato" data-testid={`assigned-order-missing-${field}`}>
      {MISSING_VALUE_MARK}
    </span>
  );
}

export const ASSIGNED_ORDER_STATUS_LABELS: Readonly<Record<'PENDIENTE' | 'EN_CURSO', string>> = {
  PENDIENTE: 'Pendiente',
  EN_CURSO: 'En curso',
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
export const ASSIGNED_ORDER_PRIORITY_COLUMN_ID = 'priority';
export const ASSIGNED_ORDER_STATUS_COLUMN_ID = 'status';
export const ASSIGNED_ORDER_RESPONSIBLES_COLUMN_ID = 'responsibles';
export const ASSIGNED_ORDER_ENTER_COLUMN_ID = 'enter';

export const ASSIGNED_ORDERS_DEFAULT_PINNED_COLUMNS: readonly string[] = [
  ASSIGNED_ORDER_NUMBER_COLUMN_ID,
];

export function buildAssignedOrdersColumns(): readonly DataTableColumn<AssignedOrderView>[] {
  return [
    {
      id: ASSIGNED_ORDER_NUMBER_COLUMN_ID,
      label: 'Nº de pedido',
      align: 'start',
      cell: (order) => order.numberText,
    },
    {
      id: ASSIGNED_ORDER_RECIPE_NAME_COLUMN_ID,
      label: 'Receta',
      align: 'start',
      cell: (order) =>
        order.recipeName ?? <MissingValue field={ASSIGNED_ORDER_RECIPE_NAME_COLUMN_ID} />,
    },
    {
      id: ASSIGNED_ORDER_QUANTITY_COLUMN_ID,
      label: 'Cantidad',
      align: 'end',
      cell: (order) => order.quantity,
    },
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
    {
      id: ASSIGNED_ORDER_RESPONSIBLES_COLUMN_ID,
      label: 'Responsables',
      align: 'start',
      // Sin `onShowAll`: esta pantalla no tiene panel de edicion donde desplegar el resto.
      cell: (order) => <ResponsibleAvatars responsibles={order.otherResponsibles} />,
    },
    {
      id: ASSIGNED_ORDER_ENTER_COLUMN_ID,
      label: 'Entrar',
      align: 'end',
      pinnable: false,
      cell: (order) => <AssignedOrderEnterTrigger order={order} />,
    },
  ];
}
