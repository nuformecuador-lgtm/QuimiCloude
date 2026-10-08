import { z } from 'zod';

import { CustomerNotFoundError } from './errors';

import type { CustomerCatalog, CustomerRef } from '@/lib/modules/clientes';

/** El cliente de un pedido tal como lo ven la ficha y el listado. */
export type OrderCustomer = { readonly id: string; readonly name: string; readonly isDeleted: boolean };

/** `'assign'` busca para asignar (solo vivos); `'filter'`, para filtrar el listado (tambien los
 *  dados de baja). */
export type OrderCustomerSearchPurpose = 'assign' | 'filter';

export const ORDER_CUSTOMER_FILTER_FIELD = 'customerId';

/** Filtro «sin cliente»: un `select` de valores cerrados con un unico valor posible. Va en un
 *  campo aparte para que `customerId` siga admitiendo solo uuids. */
export const ORDER_CUSTOMER_PRESENCE_FILTER_FIELD = 'customerPresence';
export const ORDER_CUSTOMER_PRESENCE_NONE = 'none';
export const ORDER_CUSTOMER_PRESENCE_VALUES = [ORDER_CUSTOMER_PRESENCE_NONE] as const;

const customerIdSchema = z.string().uuid();

/** Unica definicion del nombre del cliente en `pedidos`: «Nombres Apellidos». */
export function formatOrderCustomerName(ref: Pick<CustomerRef, 'firstNames' | 'lastNames'>): string {
  return `${ref.firstNames} ${ref.lastNames}`;
}

export function toOrderCustomer(ref: CustomerRef): OrderCustomer {
  return { id: ref.id, name: formatOrderCustomerName(ref), isDeleted: ref.isDeleted };
}

/** Un id sin forma de uuid no puede existir en la base: se rechaza sin consultar. */
export function isCustomerIdShape(id: string): boolean {
  return customerIdSchema.safeParse(id).success;
}

/**
 * El cliente vivo de la empresa, o `CustomerNotFoundError`. Unico sitio que decide ese error en
 * el alta, la edicion y el cambio de cliente: un id sin forma, inexistente, dado de baja o de
 * otra empresa son el mismo caso para quien escribe.
 */
export async function requireAliveCustomer(
  customerCatalog: Pick<CustomerCatalog, 'findAliveRefById'>,
  id: string,
  companyId: string,
): Promise<CustomerRef> {
  if (!isCustomerIdShape(id)) throw new CustomerNotFoundError();
  const ref = await customerCatalog.findAliveRefById(id, companyId);
  if (ref === null) throw new CustomerNotFoundError();
  return ref;
}
