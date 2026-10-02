'use client';

import type { DataTableColumn } from '@/components/shared/data-table';
import { OrderPresentationLabel } from '@/components/shared/order-presentation-label';
import { ResponsibleAvatars } from '@/components/shared/responsible-avatars';
import type { CompanyOrderView } from '@/lib/modules/asignaciones';
import type { OrderPriority, OrderStatus } from '@/lib/modules/pedidos';
import { formatDecimalDisplay } from '@/lib/shared/ui/decimal-display';

import { ROUTE_ORDER_STATUS_VALUES } from './assignment-view-params';

/**
 * Las columnas de «Todos»: número, receta, cantidad,
 * presentación, prioridad, estado (con filtro `select` de todos los estados) y responsables.
 * **Sin columna «Entrar» ni acciones**, tampoco para los pedidos asignados al propio actor.
 *
 * La columna de **fecha de terminado** solo aparece cuando el filtro vigente es EXACTAMENTE
 * `['ENTREGADO']`: `showFinishedAt` la decide quien construye las columnas a partir de
 * los parametros ya parseados en el servidor, nunca esta declaracion por su cuenta.
 */

/** Mismo glifo que el marcador de `/pedidos`, pero declarado aqui: son rutas distintas. */
export const MISSING_VALUE_MARK = '—';

function MissingValue({ field }: { readonly field: string }) {
  return (
    <span aria-label="Sin dato" data-testid={`company-order-missing-${field}`}>
      {MISSING_VALUE_MARK}
    </span>
  );
}

export const COMPANY_ORDER_NUMBER_COLUMN_ID = 'orderNumber';
export const COMPANY_ORDER_RECIPE_NAME_COLUMN_ID = 'recipeName';
export const COMPANY_ORDER_QUANTITY_COLUMN_ID = 'quantity';
export const COMPANY_ORDER_PRESENTATION_COLUMN_ID = 'presentationName';
export const COMPANY_ORDER_PRIORITY_COLUMN_ID = 'priority';
export const COMPANY_ORDER_STATUS_COLUMN_ID = 'status';
export const COMPANY_ORDER_DATE_COLUMN_ID = 'finishedAt';
export const COMPANY_ORDER_RESPONSIBLES_COLUMN_ID = 'responsibles';

export const COMPANY_ORDER_STATUS_LABELS: Readonly<Record<OrderStatus, string>> = {
  PENDIENTE: 'Pendiente',
  EN_CURSO: 'En curso',
  POR_EMPACAR: 'Por empacar',
  EN_EMPAQUE: 'En empaque',
  ENTREGADO: 'Entregado',
  CANCELADO: 'Cancelado',
  BLOQUEADO: 'Bloqueado',
};

export const COMPANY_ORDER_PRIORITY_LABELS: Readonly<Record<OrderPriority, string>> = {
  BAJA: 'Baja',
  MEDIA: 'Media',
  ALTA: 'Alta',
  CRITICA: 'Crítica',
};

/** Las opciones del filtro «Estado», derivadas del mismo conjunto que la URL reconoce. */
export const COMPANY_ORDER_STATUS_FILTER_OPTIONS: readonly { value: string; label: string }[] =
  ROUTE_ORDER_STATUS_VALUES.map((value) => ({ value, label: COMPANY_ORDER_STATUS_LABELS[value] }));

/**
 * `YYYY-MM-DD` en UTC, nunca `toLocaleDateString`.
 */
function formatFinishedAt(value: Date): string {
  return value.toISOString().slice(0, 10);
}

const MISSING_DATE_TEXT = 'Sin fecha';

function FinishedAtCell({ finishedAt }: { readonly finishedAt: Date | null }) {
  const isMissing = finishedAt === null;

  return (
    <span data-testid="company-order-date" data-missing={isMissing ? 'true' : undefined}>
      {isMissing ? MISSING_DATE_TEXT : formatFinishedAt(finishedAt)}
    </span>
  );
}

export type CompanyOrdersColumnsDeps = {
  /** Decidido en el servidor a partir del filtro de estado ya parseado. */
  readonly showFinishedAt: boolean;
};

export function buildCompanyOrdersColumns({
  showFinishedAt,
}: CompanyOrdersColumnsDeps): readonly DataTableColumn<CompanyOrderView>[] {
  const columns: DataTableColumn<CompanyOrderView>[] = [
    {
      id: COMPANY_ORDER_NUMBER_COLUMN_ID,
      label: 'Nº de pedido',
      align: 'start',
      // Nace fijada: es un defecto, con preferencia guardada gana la del usuario.
      defaultPinned: 'left',
      cell: (order) => order.numberText,
    },
    {
      id: COMPANY_ORDER_RECIPE_NAME_COLUMN_ID,
      label: 'Receta',
      align: 'start',
      cell: (order) =>
        order.recipeName ?? <MissingValue field={COMPANY_ORDER_RECIPE_NAME_COLUMN_ID} />,
    },
    {
      id: COMPANY_ORDER_QUANTITY_COLUMN_ID,
      label: 'Cantidad',
      align: 'end',
      cell: (order) => formatDecimalDisplay(order.quantity),
    },
    {
      id: COMPANY_ORDER_PRESENTATION_COLUMN_ID,
      label: 'Presentación',
      align: 'start',
      cell: (order) => <OrderPresentationLabel name={order.presentationName} />,
    },
    {
      id: COMPANY_ORDER_PRIORITY_COLUMN_ID,
      label: 'Prioridad',
      align: 'start',
      cell: (order) => (
        <span data-testid="company-order-priority" data-priority={order.priority}>
          {COMPANY_ORDER_PRIORITY_LABELS[order.priority]}
        </span>
      ),
    },
    {
      id: COMPANY_ORDER_STATUS_COLUMN_ID,
      label: 'Estado',
      align: 'start',
      filter: { kind: 'select', options: COMPANY_ORDER_STATUS_FILTER_OPTIONS },
      cell: (order) => (
        <span data-testid="company-order-status" data-status={order.status}>
          {COMPANY_ORDER_STATUS_LABELS[order.status]}
        </span>
      ),
    },
  ];

  if (showFinishedAt) {
    columns.push({
      id: COMPANY_ORDER_DATE_COLUMN_ID,
      label: 'Fecha de terminado',
      align: 'start',
      cell: (order) => <FinishedAtCell finishedAt={order.finishedAt} />,
    });
  }

  columns.push({
    id: COMPANY_ORDER_RESPONSIBLES_COLUMN_ID,
    label: 'Responsables',
    align: 'start',
    // Sin `onShowAll`: esta pantalla no tiene panel de edicion donde desplegar el resto.
    cell: (order) => <ResponsibleAvatars responsibles={order.responsibles} />,
  });

  return columns;
}
