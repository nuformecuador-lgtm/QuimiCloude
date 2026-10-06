import type { Actor } from './actor';
import type { OrderCustomer, OrderCustomerSearchPurpose } from './order-customer';
import type { Page } from './page';

import type { CustomerCatalog } from '@/lib/modules/clientes';

export type SearchOrderCustomersDeps = {
  readonly customerCatalog: Pick<CustomerCatalog, 'searchRefs'>;
};

export function createSearchOrderCustomers(
  deps: SearchOrderCustomersDeps,
): (
  input: unknown,
  purpose: OrderCustomerSearchPurpose,
  actor: Actor | null | undefined,
) => Promise<Page<OrderCustomer>> {
  return async function searchOrderCustomers(input, purpose, actor) {
    void deps;
    void input;
    void purpose;
    void actor;
    throw new Error('searchOrderCustomers: sin implementar');
  };
}
