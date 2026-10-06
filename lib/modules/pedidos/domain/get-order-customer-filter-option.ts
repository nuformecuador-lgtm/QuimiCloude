import type { Actor } from './actor';
import type { OrderCustomer } from './order-customer';

import type { CustomerCatalog } from '@/lib/modules/clientes';

export type GetOrderCustomerFilterOptionDeps = {
  readonly customerCatalog: Pick<CustomerCatalog, 'findRefsIncludingDeleted'>;
};

export function createGetOrderCustomerFilterOption(
  deps: GetOrderCustomerFilterOptionDeps,
): (id: string, actor: Actor | null | undefined) => Promise<OrderCustomer | null> {
  return async function getOrderCustomerFilterOption(id, actor) {
    void deps;
    void id;
    void actor;
    throw new Error('getOrderCustomerFilterOption: sin implementar');
  };
}
