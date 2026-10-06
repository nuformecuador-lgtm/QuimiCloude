import type { CustomerRef, CustomerRefSearch } from '../../../domain/customer-catalog';
import type { CustomerScope } from '../../../domain/customer-scope';
import type { Page } from '../../../domain/page';

export async function findCustomerRefsIncludingDeleted(
  ids: readonly string[],
  scope: CustomerScope,
): Promise<readonly CustomerRef[]> {
  void ids;
  void scope;
  throw new Error('findCustomerRefsIncludingDeleted: sin implementar');
}

export async function findAliveCustomerRefById(id: string, scope: CustomerScope): Promise<CustomerRef | null> {
  void id;
  void scope;
  throw new Error('findAliveCustomerRefById: sin implementar');
}

export async function searchCustomerRefs(
  query: CustomerRefSearch,
  scope: CustomerScope,
): Promise<Page<CustomerRef>> {
  void query;
  void scope;
  throw new Error('searchCustomerRefs: sin implementar');
}
