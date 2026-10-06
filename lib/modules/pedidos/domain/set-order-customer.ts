import type { Actor } from './actor';

import type { CustomerCatalog } from '@/lib/modules/clientes';

import type { OrderRepository } from '../ports/order-repository';
import type { OrderUnitOfWork } from '../ports/order-unit-of-work';

/** Sin catalogos de recetas, inventario ni unidades: cambiar el cliente no puede tocar el coste
 *  ni lo apartado. */
export type SetOrderCustomerDeps = {
  readonly orders: OrderRepository;
  readonly customerCatalog: Pick<CustomerCatalog, 'findAliveRefById'>;
  readonly unitOfWork: OrderUnitOfWork;
  readonly now?: () => Date;
};

export function createSetOrderCustomer(
  deps: SetOrderCustomerDeps,
): (id: string, input: unknown, actor: Actor | null | undefined) => Promise<void> {
  return async function setOrderCustomer(id, input, actor) {
    void deps;
    void id;
    void input;
    void actor;
    throw new Error('setOrderCustomer: sin implementar');
  };
}
