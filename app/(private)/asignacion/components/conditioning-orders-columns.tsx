'use client';

import Link from 'next/link';

import type { DataTableColumn } from '@/components/shared/data-table';
import type { ConditioningOrderRow } from '@/lib/modules/asignaciones';
import { conditioningOrderRoute } from '@/lib/shared/routes';

import { COMPANY_ORDER_STATUS_LABELS } from './company-orders-columns';
import { OrderDistributionFull } from './order-distribution-full';

/**
 * Las cinco columnas de «Por acondicionar»: número -que abre el detalle-, receta, envases -el
 * reparto entero, no un total-, estado y quién acondiciona, vacío mientras nadie lo ha tomado.
 */

const MISSING_VALUE_MARK = '—';

function MissingValue({ field }: { readonly field: string }) {
  return (
    <span aria-label="Sin dato" data-testid={`conditioning-order-missing-${field}`}>
      {MISSING_VALUE_MARK}
    </span>
  );
}

export const CONDITIONING_ORDER_NUMBER_COLUMN_ID = 'orderNumber';
export const CONDITIONING_ORDER_RECIPE_NAME_COLUMN_ID = 'recipeName';
export const CONDITIONING_ORDER_PACKAGES_COLUMN_ID = 'packages';
export const CONDITIONING_ORDER_STATUS_COLUMN_ID = 'status';
export const CONDITIONING_ORDER_CONDITIONER_COLUMN_ID = 'conditionedByName';

export const CONDITIONING_ORDER_LINK_TESTID = 'conditioning-order-link';

/** Objetivo tactil de 44x44 px: el número es el único control de la fila. */
export const CONDITIONING_ORDER_LINK_CLASS =
  'flex min-h-11 min-w-11 items-center underline-offset-4 hover:underline focus-visible:underline';

export function ConditioningOrderLink({
  id,
  numberText,
}: {
  readonly id: string;
  readonly numberText: string;
}) {
  return (
    <Link
      href={conditioningOrderRoute(id)}
      data-testid={CONDITIONING_ORDER_LINK_TESTID}
      className={CONDITIONING_ORDER_LINK_CLASS}
    >
      {numberText}
    </Link>
  );
}

export function buildConditioningOrdersColumns(): readonly DataTableColumn<ConditioningOrderRow>[] {
  return [
    {
      id: CONDITIONING_ORDER_NUMBER_COLUMN_ID,
      label: 'Nº de pedido',
      align: 'start',
      cell: (order) => <ConditioningOrderLink id={order.id} numberText={order.numberText} />,
    },
    {
      id: CONDITIONING_ORDER_RECIPE_NAME_COLUMN_ID,
      label: 'Receta',
      align: 'start',
      cell: (order) =>
        order.recipeName ?? <MissingValue field={CONDITIONING_ORDER_RECIPE_NAME_COLUMN_ID} />,
    },
    {
      id: CONDITIONING_ORDER_PACKAGES_COLUMN_ID,
      label: 'Envases',
      align: 'start',
      cell: (order) => <OrderDistributionFull lines={order.presentationLines} />,
    },
    {
      id: CONDITIONING_ORDER_STATUS_COLUMN_ID,
      label: 'Estado',
      align: 'start',
      cell: (order) => (
        <span data-testid="conditioning-order-status" data-status={order.status}>
          {COMPANY_ORDER_STATUS_LABELS[order.status]}
        </span>
      ),
    },
    {
      id: CONDITIONING_ORDER_CONDITIONER_COLUMN_ID,
      label: 'Quién acondiciona',
      align: 'start',
      cell: (order) =>
        order.conditionedByName ?? (
          <MissingValue field={CONDITIONING_ORDER_CONDITIONER_COLUMN_ID} />
        ),
    },
  ];
}
