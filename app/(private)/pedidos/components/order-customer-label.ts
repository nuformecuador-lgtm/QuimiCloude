import type { OrderCustomer } from '@/lib/modules/pedidos';

/** Lo que se puede elegir en el campo de cliente: uno concreto o, solo al filtrar, ninguno. */
export type OrderCustomerChoice =
  | { readonly kind: 'customer'; readonly customer: OrderCustomer }
  | { readonly kind: 'none' };

export const ORDER_CUSTOMER_NONE_LABEL = 'Sin cliente';

export const ORDER_CUSTOMER_DELETED_SUFFIX = '(eliminado)';

/** Unica forma de pintar un cliente en la pantalla de pedidos: columna, selector, filtro y dialogo. */
export function orderCustomerLabel(customer: OrderCustomer): string {
  return customer.isDeleted ? `${customer.name} ${ORDER_CUSTOMER_DELETED_SUFFIX}` : customer.name;
}

export function orderCustomerChoiceLabel(choice: OrderCustomerChoice): string {
  return choice.kind === 'none' ? ORDER_CUSTOMER_NONE_LABEL : orderCustomerLabel(choice.customer);
}

/** El id que viaja en el formulario o en la direccion; vacio cuando no hay cliente. */
export function orderCustomerChoiceId(choice: OrderCustomerChoice | null): string {
  return choice?.kind === 'customer' ? choice.customer.id : '';
}
