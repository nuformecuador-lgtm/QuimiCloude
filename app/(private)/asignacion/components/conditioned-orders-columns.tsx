'use client';

import type { DataTableColumn } from '@/components/shared/data-table';
import type { FinishedOrderView } from '@/lib/modules/asignaciones';

import { ConditioningOrderLink } from './conditioning-orders-columns';
import {
  FINISHED_ORDER_NUMBER_COLUMN_ID,
  buildFinishedOrdersColumns,
} from './finished-orders-columns';

/**
 * Las columnas de «Terminados» del acondicionador se derivan de las del Empacador y solo cambia la
 * celda del número, que abre el detalle. Así, si cambian las del Empacador, cambian estas.
 */
export function buildConditionedOrdersColumns(): readonly DataTableColumn<FinishedOrderView>[] {
  return buildFinishedOrdersColumns().map((column) =>
    column.id === FINISHED_ORDER_NUMBER_COLUMN_ID
      ? {
          ...column,
          cell: (order: FinishedOrderView) => (
            <ConditioningOrderLink id={order.id} numberText={order.numberText} />
          ),
        }
      : column,
  );
}
