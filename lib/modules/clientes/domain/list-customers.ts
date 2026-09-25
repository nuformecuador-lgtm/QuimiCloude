import { requirePermission, type Actor } from './actor';
import { CUSTOMER_QUERYABLE } from './customer-queryable';
import type { CustomerView } from './customer-view';
import { ValidationError } from './errors';
import { createListQuerySchema, sanitizeListQuery } from './list-query';
import type { Page } from './page';
import type { CustomerScope } from './customer-scope';

import type { CustomerRepository } from '../ports/customer-repository';
import type { ListQueryLog } from '../ports/list-query-log';

export type ListCustomersDeps = {
  readonly customers: CustomerRepository;
  readonly log: ListQueryLog;
};

/** Nombre con el que este listado se identifica en el log de campos omitidos. */
const LIST_NAME = 'customers';

const listQuerySchema = createListQuerySchema();

/**
 * Listado paginado de clientes con el contrato generico de consulta. Orden: permiso, forma,
 * saneado, log de lo podado, puerto.
 */
export function createListCustomers(
  deps: ListCustomersDeps,
): (input: unknown, actor: Actor | null | undefined) => Promise<Page<CustomerView>> {
  return async function listCustomers(
    input: unknown,
    actor: Actor | null | undefined,
  ): Promise<Page<CustomerView>> {
    requirePermission(actor, 'clientes.consultar');

    const scope: CustomerScope = { companyId: actor.companyId };

    const parsed = listQuerySchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    const { query, ignored } = sanitizeListQuery(parsed.data, CUSTOMER_QUERYABLE);
    deps.log.ignoredFields(LIST_NAME, ignored);

    return deps.customers.listAlive(query, scope);
  };
}
