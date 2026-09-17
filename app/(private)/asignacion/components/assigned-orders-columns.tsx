'use client';

import type { DataTableColumn } from '@/components/shared/data-table';
import { ResponsibleAvatars } from '@/components/shared/responsible-avatars';
import type { AssignedOrderView } from '@/lib/modules/asignaciones';
import type { OrderPriority } from '@/lib/modules/pedidos';

import { AssignedOrderEnterTrigger } from './assigned-order-enter-trigger';

/**
 * Las SIETE columnas de la lista de pedidos asignados (R16-R22, `design.md > 8.2`).
 *
 * **Numero · Receta · Cantidad · Prioridad · Estado · Responsables · Entrar**, en ese orden.
 * **Ninguna ordena y ninguna filtra** (`design.md > 10`, alternativa D descartada): no hay backend
 * que lo soporte para esta lista.
 *
 * **Factoria, no un array del modulo**, mismo patron que `buildOrderColumns`: aunque hoy ninguna
 * columna necesita dependencias externas, se mantiene la forma factoria para no divergir del
 * precedente y dejar sitio a que una futura columna las necesite sin cambiar la firma que
 * consume `assigned-orders-table.tsx`.
 *
 * **Marcador de ausencia LOCAL a este archivo** (R17): mismo glifo que `MISSING_VALUE_MARK` de
 * `order-columns.tsx`, pero declarado aqui porque son rutas distintas y esta no importa por ruta
 * profunda desde `/pedidos`.
 *
 * **Etiquetas de estado y prioridad LOCALES**: no se reutilizan `OrderStatusBadge` ni
 * `OrderPriorityBadge` de `/pedidos` (son de otra ruta, y promoverlos no esta decidido en el
 * diseno de esta ficha). El estado de esta lista solo admite dos valores (`PENDIENTE`,
 * `EN_CURSO`); la prioridad admite los cuatro del contrato de `pedidos`.
 *
 * **Cantidad pintada TAL CUAL**: cadena decimal del contrato, nunca `Number()` ni `toFixed`.
 *
 * **Responsables**: `<ResponsibleAvatars>` SIN `onShowAll` -esta pantalla no tiene panel de
 * edicion (asignar/desasignar es QC-87, fuera de alcance)-. El nombre de grupo congelado (R19) ya
 * lo satisface el componente promovido sin pintar una segunda presentacion (`design.md > 8.3`,
 * H6).
 */

/** Glifo del marcador de ausencia. Atado por test al de `order-columns.tsx` (mismo caracter). */
export const MISSING_VALUE_MARK = '—';

function MissingValue({ field }: { readonly field: string }) {
  return (
    <span aria-label="Sin dato" data-testid={`assigned-order-missing-${field}`}>
      {MISSING_VALUE_MARK}
    </span>
  );
}

/** Como se lee cada estado de ESTA lista. Exhaustivo por tipo: falta una clave -> no compila. */
export const ASSIGNED_ORDER_STATUS_LABELS: Readonly<Record<'PENDIENTE' | 'EN_CURSO', string>> = {
  PENDIENTE: 'Pendiente',
  EN_CURSO: 'En curso',
};

/** Como se lee cada prioridad del contrato de `pedidos`. Exhaustivo por tipo, mismo motivo. */
export const ASSIGNED_ORDER_PRIORITY_LABELS: Readonly<Record<OrderPriority, string>> = {
  BAJA: 'Baja',
  MEDIA: 'Media',
  ALTA: 'Alta',
  CRITICA: 'Crítica',
};

/** Id de la columna del correlativo. Se exporta porque la tabla la fija por defecto. */
export const ASSIGNED_ORDER_NUMBER_COLUMN_ID = 'orderNumber';
export const ASSIGNED_ORDER_RECIPE_NAME_COLUMN_ID = 'recipeName';
export const ASSIGNED_ORDER_QUANTITY_COLUMN_ID = 'quantity';
export const ASSIGNED_ORDER_PRIORITY_COLUMN_ID = 'priority';
export const ASSIGNED_ORDER_STATUS_COLUMN_ID = 'status';
export const ASSIGNED_ORDER_RESPONSIBLES_COLUMN_ID = 'responsibles';
export const ASSIGNED_ORDER_ENTER_COLUMN_ID = 'enter';

/** Columna que nace fijada al borde izquierdo (`design.md > 8.1`), como en `/pedidos`. */
export const ASSIGNED_ORDERS_DEFAULT_PINNED_COLUMNS: readonly string[] = [
  ASSIGNED_ORDER_NUMBER_COLUMN_ID,
];

export function buildAssignedOrdersColumns(): readonly DataTableColumn<AssignedOrderView>[] {
  return [
    {
      id: ASSIGNED_ORDER_NUMBER_COLUMN_ID,
      label: 'Nº de pedido',
      align: 'start',
      // R16: `numberText` ya viene compuesto por `formatOrderNumber`; se pinta TAL CUAL.
      cell: (order) => order.numberText,
    },
    {
      id: ASSIGNED_ORDER_RECIPE_NAME_COLUMN_ID,
      label: 'Receta',
      align: 'start',
      // R17: si no se puede resolver, marcador de ausencia -nunca el identificador tecnico-.
      cell: (order) =>
        order.recipeName ?? <MissingValue field={ASSIGNED_ORDER_RECIPE_NAME_COLUMN_ID} />,
    },
    {
      id: ASSIGNED_ORDER_QUANTITY_COLUMN_ID,
      label: 'Cantidad',
      align: 'end',
      // La cadena decimal, tal cual la entrega la consulta.
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
      // R18, R19, R20: `otherResponsibles` YA excluye al actor y ya trae el nombre de grupo
      // congelado. Sin `onShowAll`: esta pantalla no tiene panel de edicion.
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
