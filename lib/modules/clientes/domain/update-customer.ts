import { requirePermission, type Actor } from './actor';
import { isCustomerId } from './customer-id';
import { updateCustomerSchema } from './customer-input';
import { normalizeCustomerText } from './customer-text';
import type { CustomerScope } from './customer-scope';
import { CustomerNotFoundError, ValidationError } from './errors';

import type { CustomerRepository } from '../ports/customer-repository';

export type UpdateCustomerDeps = {
  readonly customers: CustomerRepository;
  readonly now?: () => Date;
};

/**
 * Edicion de cliente (R20, R21, R23, R42): reemplazo completo de los seis datos de negocio, no
 * parche campo a campo. Un id sin forma de uuid se rechaza como no encontrado (P5) sin llegar
 * al puerto.
 */
export function createUpdateCustomer(
  deps: UpdateCustomerDeps,
): (id: string, input: unknown, actor: Actor | null | undefined) => Promise<void> {
  const now = deps.now ?? (() => new Date());

  return async function updateCustomer(
    id: string,
    input: unknown,
    actor: Actor | null | undefined,
  ): Promise<void> {
    requirePermission(actor, 'clientes.modificar');

    const scope: CustomerScope = { companyId: actor.companyId };

    if (!isCustomerId(id)) throw new CustomerNotFoundError();

    const parsed = updateCustomerSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    const result = await deps.customers.updateAlive(
      id,
      {
        ...parsed.data,
        firstNamesNormalized: normalizeCustomerText(parsed.data.firstNames),
        lastNamesNormalized: normalizeCustomerText(parsed.data.lastNames),
        cityNormalized: normalizeCustomerText(parsed.data.city),
      },
      actor.id,
      now(),
      scope,
    );

    // R10, R23: inexistente, dado de baja o de otra empresa son el mismo caso para el dominio.
    if (result === 'not_found') throw new CustomerNotFoundError();
  };
}
