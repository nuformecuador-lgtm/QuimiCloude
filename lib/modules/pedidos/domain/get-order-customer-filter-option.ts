import { requirePermission, type Actor } from './actor';
import { isCustomerIdShape, toOrderCustomer, type OrderCustomer } from './order-customer';

import type { CustomerCatalog } from '@/lib/modules/clientes';

export type GetOrderCustomerFilterOptionDeps = {
  readonly customerCatalog: Pick<CustomerCatalog, 'findRefsIncludingDeleted'>;
};

/**
 * El cliente que trae la direccion del listado, para pintarlo en el filtro. `null` = la pantalla
 * descarta el filtro. Incluye los dados de baja, igual que las opciones del filtro.
 */
export function createGetOrderCustomerFilterOption(
  deps: GetOrderCustomerFilterOptionDeps,
): (id: string, actor: Actor | null | undefined) => Promise<OrderCustomer | null> {
  return async function getOrderCustomerFilterOption(id, actor) {
    requirePermission(actor, 'pedidos.consultar');

    if (!isCustomerIdShape(id)) return null;

    const refs = await deps.customerCatalog.findRefsIncludingDeleted([id], actor.companyId);
    const ref = refs.find((candidate) => candidate.id === id);
    return ref === undefined ? null : toOrderCustomer(ref);
  };
}
