import { requirePermission, type Actor } from './actor';
import { isCustomerId } from './customer-id';
import type { CustomerScope } from './customer-scope';
import { CustomerNotFoundError } from './errors';

import type { CustomerRepository } from '../ports/customer-repository';

export type DeleteCustomerDeps = {
  readonly customers: CustomerRepository;
  readonly now?: () => Date;
};

/**
 * Baja de cliente (R21, R23, R24, R25): baja logica, sin restaurar. Un id sin forma de uuid se
 * rechaza como no encontrado (P5) sin llegar al puerto.
 */
export function createDeleteCustomer(
  deps: DeleteCustomerDeps,
): (id: string, actor: Actor | null | undefined) => Promise<void> {
  const now = deps.now ?? (() => new Date());

  return async function deleteCustomer(
    id: string,
    actor: Actor | null | undefined,
  ): Promise<void> {
    requirePermission(actor, 'clientes.modificar');

    const scope: CustomerScope = { companyId: actor.companyId };

    if (!isCustomerId(id)) throw new CustomerNotFoundError();

    const deleted = await deps.customers.softDeleteAlive(id, actor.id, now(), scope);
    if (!deleted) throw new CustomerNotFoundError();
  };
}
