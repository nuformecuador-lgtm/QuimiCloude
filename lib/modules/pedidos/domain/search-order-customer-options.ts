import { z } from 'zod';

import { requirePermission, type Actor } from './actor';
import { ValidationError } from './errors';
import { toOrderCustomer, type OrderCustomer, type OrderCustomerSearchPurpose } from './order-customer';
import type { Page } from './page';

import type { CustomerCatalog } from '@/lib/modules/clientes';
import type { PermissionCode } from '@/lib/modules/identity';

export type SearchOrderCustomersDeps = {
  readonly customerCatalog: Pick<CustomerCatalog, 'searchRefs'>;
};

/** El mismo tope que la caja de busqueda de los listados. */
const SEARCH_MAX_LENGTH = 120;

const searchOrderCustomersSchema = z.strictObject({
  search: z.string().trim().max(SEARCH_MAX_LENGTH).default(''),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).optional(),
});

const purposeSchema = z.enum(['assign', 'filter', 'deliver']);

function permissionFor(purpose: OrderCustomerSearchPurpose): PermissionCode {
  if (purpose === 'filter') return 'pedidos.consultar';
  if (purpose === 'deliver') return 'entregas.modificar';
  return 'pedidos.modificar';
}

/**
 * Opciones del autocompletado de cliente. Asignar pide `pedidos.modificar` y entregar
 * `entregas.modificar`, y los dos solo ofrecen clientes vivos; filtrar pide `pedidos.consultar` y
 * ofrece tambien los dados de baja, porque un pedido puede seguir apuntando a uno. Un `purpose`
 * desconocido exige `pedidos.modificar` antes de rechazarse.
 */
export function createSearchOrderCustomers(
  deps: SearchOrderCustomersDeps,
): (
  input: unknown,
  purpose: OrderCustomerSearchPurpose,
  actor: Actor | null | undefined,
) => Promise<Page<OrderCustomer>> {
  return async function searchOrderCustomers(input, purpose, actor) {
    requirePermission(actor, permissionFor(purpose));

    const parsedPurpose = purposeSchema.safeParse(purpose);
    const parsed = searchOrderCustomersSchema.safeParse(input);
    if (!parsedPurpose.success || !parsed.success) throw new ValidationError();

    const page = await deps.customerCatalog.searchRefs(
      {
        search: parsed.data.search,
        includeDeleted: parsedPurpose.data === 'filter',
        page: parsed.data.page,
        pageSize: parsed.data.pageSize,
      },
      actor.companyId,
    );

    return {
      items: page.items.map(toOrderCustomer),
      total: page.total,
      page: page.page,
      pageSize: page.pageSize,
      totalPages: page.totalPages,
    };
  };
}
