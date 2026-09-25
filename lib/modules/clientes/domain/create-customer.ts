import { requirePermission, type Actor } from './actor';
import { createCustomerSchema } from './customer-input';
import { normalizeCustomerText } from './customer-text';
import type { CustomerScope } from './customer-scope';
import { ValidationError } from './errors';

import type { CustomerRepository } from '../ports/customer-repository';

export type CreateCustomerDeps = {
  readonly customers: CustomerRepository;
  /** Reloj inyectable, `() => new Date()` por defecto: el dominio no lee ningun reloj global. */
  readonly now?: () => Date;
};

/**
 * Alta de cliente (R9, R13, R42). `requirePermission` es la primera linea, antes de `zod` y
 * antes de tocar el puerto (R2, R3, R5).
 */
export function createCreateCustomer(
  deps: CreateCustomerDeps,
): (input: unknown, actor: Actor | null | undefined) => Promise<{ id: string }> {
  const now = deps.now ?? (() => new Date());

  return async function createCustomer(
    input: unknown,
    actor: Actor | null | undefined,
  ): Promise<{ id: string }> {
    requirePermission(actor, 'clientes.modificar');

    // La empresa sale del ACTOR y jamas de la entrada (R9).
    const scope: CustomerScope = { companyId: actor.companyId };

    const parsed = createCustomerSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    // R42: las tres formas normalizadas se calculan aqui, con la unica funcion del modulo, y
    // viajan emparejadas con su dato.
    return deps.customers.create(
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
  };
}
