'use client';

import { useRouter } from 'next/navigation';

import { withFilter, type DataTableParams } from '@/components/shared/data-table';
import { ORDER_CUSTOMER_PRESENCE_NONE } from '@/lib/modules/pedidos';

import type { OrderCustomerChoice } from './order-customer-label';
import { OrderCustomerPicker } from './order-customer-picker';
import {
  CUSTOMER_COLUMN_ID,
  CUSTOMER_PRESENCE_COLUMN_ID,
  FIRST_PAGE,
  orderListHref,
} from './order-list-params';

export const ORDER_CUSTOMER_FILTER_TESTID = 'order-customer-filter';

const LABELS = {
  field: 'Filtrar por cliente',
  placeholder: 'Filtrar por cliente',
  empty: 'Ningún cliente coincide con la búsqueda.',
} as const;

/** Los parametros con el filtro de cliente sustituido: nunca quedan los dos campos a la vez. */
export function withOrderCustomerFilter(
  params: DataTableParams,
  choice: OrderCustomerChoice | null,
): DataTableParams {
  const cleared = withFilter(
    withFilter({ ...params, page: FIRST_PAGE }, CUSTOMER_COLUMN_ID, null),
    CUSTOMER_PRESENCE_COLUMN_ID,
    null,
  );
  if (choice === null) return cleared;
  if (choice.kind === 'none') {
    return withFilter(cleared, CUSTOMER_PRESENCE_COLUMN_ID, {
      kind: 'select',
      values: [ORDER_CUSTOMER_PRESENCE_NONE],
    });
  }
  return withFilter(cleared, CUSTOMER_COLUMN_ID, { kind: 'select', values: [choice.customer.id] });
}

function choiceKey(choice: OrderCustomerChoice | null): string {
  if (choice === null) return '';
  return choice.kind === 'none' ? 'none' : choice.customer.id;
}

export type OrderCustomerFilterProps = {
  /** Los parametros vigentes de la lista. */
  readonly params: DataTableParams;
  /** El valor que resolvio el servidor a partir de la direccion. */
  readonly value: OrderCustomerChoice | null;
};

export function OrderCustomerFilter({ params, value }: OrderCustomerFilterProps) {
  const router = useRouter();

  function handleChange(choice: OrderCustomerChoice | null) {
    // Vaciar un campo que ya estaba vacio no cambia el filtro: no se navega.
    if (choice === null && value === null) return;
    router.push(orderListHref(withOrderCustomerFilter(params, choice)));
  }

  return (
    <div className="w-full sm:w-64" data-testid={ORDER_CUSTOMER_FILTER_TESTID}>
      <OrderCustomerPicker
        // Remonta el campo cuando la direccion trae otro valor (Atras, otro enlace).
        key={choiceKey(value)}
        purpose="filter"
        keepChoiceWhileTyping
        value={value}
        onChange={handleChange}
        placeholder={LABELS.placeholder}
        emptyMessage={LABELS.empty}
        aria-label={LABELS.field}
      />
    </div>
  );
}
