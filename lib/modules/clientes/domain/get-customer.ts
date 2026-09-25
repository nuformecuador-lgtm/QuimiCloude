import { requirePermission, type Actor } from './actor';
import { isCustomerId } from './customer-id';
import type { CustomerScope } from './customer-scope';
import { CustomerNotFoundError } from './errors';
import type { CustomerView } from './customer-view';

import type { CustomerRepository } from '../ports/customer-repository';

export type GetCustomerDeps = {
  readonly customers: CustomerRepository;
};

/**
 * Ficha de un cliente (R22, R23). Un id sin forma de uuid se rechaza como no encontrado (P5)
 * sin llegar al puerto.
 */
export function createGetCustomer(
  deps: GetCustomerDeps,
): (id: string, actor: Actor | null | undefined) => Promise<CustomerView> {
  return async function getCustomer(
    id: string,
    actor: Actor | null | undefined,
  ): Promise<CustomerView> {
    requirePermission(actor, 'clientes.consultar');

    const scope: CustomerScope = { companyId: actor.companyId };

    if (!isCustomerId(id)) throw new CustomerNotFoundError();

    const customer = await deps.customers.findAliveById(id, scope);
    if (customer === null) throw new CustomerNotFoundError();
    return customer;
  };
}
