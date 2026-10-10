import Link from 'next/link';

import type { DataTableColumn } from '@/components/shared/data-table';
import type { PackingOrderRow } from '@/lib/modules/asignaciones';
import { packingOrderRoute } from '@/lib/shared/routes';
import { touchTarget } from '@/lib/shared/ui/touch-target';

import { MissingValue, presentationColumn, recipeColumn } from './assignment-list-parts';
import { COMPANY_ORDER_STATUS_LABELS } from './company-orders-columns';

/**
 * Las seis columnas de «Por empacar»: número -que abre la pantalla del pedido-, receta,
 * presentación, envases enteros, estado y quién empaca -vacío en `POR_EMPACAR`-. Sin `'use
 * client'`: nada de aquí usa un hook, y `packing-orders-list-section.tsx` las consume directamente
 * desde un componente de servidor.
 */

const MISSING_TEST_ID_PREFIX = 'packing-order';

export const PACKING_ORDER_NUMBER_COLUMN_ID = 'orderNumber';
export const PACKING_ORDER_RECIPE_NAME_COLUMN_ID = 'recipeName';
export const PACKING_ORDER_PRESENTATION_COLUMN_ID = 'presentationName';
export const PACKING_ORDER_PACKAGES_COLUMN_ID = 'packages';
export const PACKING_ORDER_STATUS_COLUMN_ID = 'status';
export const PACKING_ORDER_PACKER_COLUMN_ID = 'packedByName';

/** Copia a mano el numero de columnas de `buildPackingOrdersColumns()`; un test ata las dos. */
export const PACKING_ORDERS_COLUMN_COUNT = 6;

export function buildPackingOrdersColumns(): readonly DataTableColumn<PackingOrderRow>[] {
  return [
    {
      id: PACKING_ORDER_NUMBER_COLUMN_ID,
      label: 'Nº de pedido',
      align: 'start',
      cell: (order) => (
        <Link
          href={packingOrderRoute(order.id)}
          data-testid="packing-order-link"
          className={`flex ${touchTarget} items-center underline-offset-4 hover:underline focus-visible:underline`}
        >
          {order.numberText}
        </Link>
      ),
    },
    recipeColumn(PACKING_ORDER_RECIPE_NAME_COLUMN_ID, MISSING_TEST_ID_PREFIX),
    presentationColumn(PACKING_ORDER_PRESENTATION_COLUMN_ID),
    {
      id: PACKING_ORDER_PACKAGES_COLUMN_ID,
      label: 'Envases',
      align: 'end',
      cell: (order) =>
        order.packages ?? (
          <MissingValue testIdPrefix={MISSING_TEST_ID_PREFIX} field={PACKING_ORDER_PACKAGES_COLUMN_ID} />
        ),
    },
    {
      id: PACKING_ORDER_STATUS_COLUMN_ID,
      label: 'Estado',
      align: 'start',
      cell: (order) => (
        <span data-testid="packing-order-status" data-status={order.status}>
          {COMPANY_ORDER_STATUS_LABELS[order.status]}
        </span>
      ),
    },
    {
      id: PACKING_ORDER_PACKER_COLUMN_ID,
      label: 'Quién empaca',
      align: 'start',
      cell: (order) =>
        order.packedByName ?? (
          <MissingValue testIdPrefix={MISSING_TEST_ID_PREFIX} field={PACKING_ORDER_PACKER_COLUMN_ID} />
        ),
    },
  ];
}
