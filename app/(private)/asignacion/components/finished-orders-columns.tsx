'use client';

import type { DataTableColumn } from '@/components/shared/data-table';
import { OrderDistributionLabel } from '@/components/shared/order-distribution-label';
import { ResponsibleAvatars } from '@/components/shared/responsible-avatars';
import type { FinishedOrderView } from '@/lib/modules/asignaciones';
import { formatDecimalDisplay } from '@/lib/shared/ui/decimal-display';

/**
 * Las SEIS columnas de «Terminados»: número, receta, cantidad,
 * presentación, fecha de terminado y responsables. **Sin columna «Entrar» ni acciones**: esta
 * vista es de solo lectura para toda la empresa, incluido el propio actor.
 */

/** Mismo glifo que el marcador de `/pedidos`, pero declarado aqui: son rutas distintas. */
export const MISSING_VALUE_MARK = '—';

function MissingValue({ field }: { readonly field: string }) {
  return (
    <span aria-label="Sin dato" data-testid={`finished-order-missing-${field}`}>
      {MISSING_VALUE_MARK}
    </span>
  );
}

export const FINISHED_ORDER_NUMBER_COLUMN_ID = 'orderNumber';
export const FINISHED_ORDER_RECIPE_NAME_COLUMN_ID = 'recipeName';
export const FINISHED_ORDER_QUANTITY_COLUMN_ID = 'quantity';
export const FINISHED_ORDER_PRESENTATION_COLUMN_ID = 'presentationName';
export const FINISHED_ORDER_DATE_COLUMN_ID = 'finishedAt';
export const FINISHED_ORDER_RESPONSIBLES_COLUMN_ID = 'responsibles';

export const FINISHED_ORDERS_DEFAULT_PINNED_COLUMNS: readonly string[] = [
  FINISHED_ORDER_NUMBER_COLUMN_ID,
];

/**
 * `YYYY-MM-DD` en UTC, nunca `toLocaleDateString`: el Server Component y el
 * navegador tienen husos y locales distintos.
 */
function formatFinishedAt(value: Date): string {
  return value.toISOString().slice(0, 10);
}

const MISSING_DATE_TEXT = 'Sin fecha';

function FinishedAtCell({ finishedAt }: { readonly finishedAt: Date | null }) {
  const isMissing = finishedAt === null;

  return (
    <span
      data-testid="finished-order-date"
      data-missing={isMissing ? 'true' : undefined}
    >
      {isMissing ? MISSING_DATE_TEXT : formatFinishedAt(finishedAt)}
    </span>
  );
}

export function buildFinishedOrdersColumns(): readonly DataTableColumn<FinishedOrderView>[] {
  return [
    {
      id: FINISHED_ORDER_NUMBER_COLUMN_ID,
      label: 'Nº de pedido',
      align: 'start',
      cell: (order) => order.numberText,
    },
    {
      id: FINISHED_ORDER_RECIPE_NAME_COLUMN_ID,
      label: 'Receta',
      align: 'start',
      cell: (order) =>
        order.recipeName ?? <MissingValue field={FINISHED_ORDER_RECIPE_NAME_COLUMN_ID} />,
    },
    {
      id: FINISHED_ORDER_QUANTITY_COLUMN_ID,
      label: 'Cantidad',
      align: 'end',
      cell: (order) =>
        order.unitLabel === null
          ? formatDecimalDisplay(order.quantity)
          : `${formatDecimalDisplay(order.quantity)} ${order.unitLabel}`,
    },
    {
      id: FINISHED_ORDER_PRESENTATION_COLUMN_ID,
      label: 'Presentación',
      align: 'start',
      cell: (order) => <OrderDistributionLabel lines={order.presentationLines} />,
    },
    {
      id: FINISHED_ORDER_DATE_COLUMN_ID,
      label: 'Fecha de terminado',
      align: 'start',
      cell: (order) => <FinishedAtCell finishedAt={order.finishedAt} />,
    },
    {
      id: FINISHED_ORDER_RESPONSIBLES_COLUMN_ID,
      label: 'Responsables',
      align: 'start',
      // Sin `onShowAll`: esta pantalla no tiene panel de edicion donde desplegar el resto.
      cell: (order) => <ResponsibleAvatars responsibles={order.responsibles} />,
    },
  ];
}
