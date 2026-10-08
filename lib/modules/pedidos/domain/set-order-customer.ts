import { z } from 'zod';

import { requirePermission, type Actor } from './actor';
import { OrderNotFoundError, ValidationError } from './errors';
import { requireAliveCustomer } from './order-customer';
import type { OrderScope } from './order-scope';

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

/** `z.object` descarta las claves de mas: aparte del cliente, la entrada no puede cambiar nada.
 *  La clave es obligatoria; `null` o vacio quitan el cliente. */
const setOrderCustomerSchema = z.object({
  customerId: z
    .string()
    .nullable()
    .transform((value) => (value === null || value.trim() === '' ? null : value)),
});

/**
 * Elige, cambia o quita el cliente de un pedido en cualquier estado. No pasa por la regla de
 * transiciones: el cliente no es un dato de la produccion, y la escritura toca solo el cliente y
 * la ultima modificacion. Indicar el cliente que ya tiene no escribe nada, aunque este dado de
 * baja.
 */
export function createSetOrderCustomer(
  deps: SetOrderCustomerDeps,
): (id: string, input: unknown, actor: Actor | null | undefined) => Promise<void> {
  const now = deps.now ?? (() => new Date());

  return async function setOrderCustomer(id, input, actor) {
    requirePermission(actor, 'pedidos.modificar');

    const scope: OrderScope = { companyId: actor.companyId };

    const parsed = setOrderCustomerSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const { customerId } = parsed.data;

    const row = await deps.orders.findAliveById(id, scope);
    if (row === null) throw new OrderNotFoundError();

    if (customerId === row.customerId) return;

    if (customerId !== null) {
      await requireAliveCustomer(deps.customerCatalog, customerId, actor.companyId);
    }

    await deps.unitOfWork.run(async (transaction) => {
      const result = await transaction.orders.setCustomerAlive(id, customerId, actor.id, now(), scope);
      if (result === 'not_found') throw new OrderNotFoundError();
    });
  };
}
