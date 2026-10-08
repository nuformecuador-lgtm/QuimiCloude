import { z } from 'zod';

import { requirePermission, type Actor } from './actor';
import { ActionNotAllowedError, OrderNotFoundError, ValidationError } from './errors';
import type { OrderStatus } from './order-classification';
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
 * QC-215 (R36, R37, D14): los estados en los que se puede cambiar el cliente, todos menos los dos
 * finales (`ENTREGADO` y `CANCELADO`). Lista blanca, como `CANCELABLES`: un estado nuevo nace
 * cerrado y obliga a decidir. En `TERMINADO` la escritura solo toca `customer_id`, `updated_by`
 * y `updated_at`, compatible con sus `CHECK`.
 */
export const CUSTOMER_EDITABLE_STATUSES: readonly OrderStatus[] = [
  'PENDIENTE',
  'EN_CURSO',
  'BLOQUEADO',
  'POR_EMPACAR',
  'EN_EMPAQUE',
  'POR_ACONDICIONAR',
  'EN_ACONDICIONAMIENTO',
  'TERMINADO',
];

/**
 * Elige, cambia o quita el cliente de un pedido en cualquier estado de
 * `CUSTOMER_EDITABLE_STATUSES`; en `ENTREGADO` y `CANCELADO` rechaza con `action_not_allowed`,
 * tambien si el cliente indicado es el que ya tiene. No pasa por la regla de transiciones: el
 * cliente no es un dato de la produccion, y la escritura toca solo el cliente y la ultima
 * modificacion. Indicar el cliente que ya tiene no escribe nada, aunque este dado de baja.
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

    // R36: antes de comparar el cliente y de leer el catalogo, para que el pedido cerrado rechace
    // aunque la entrada no cambie nada.
    if (!CUSTOMER_EDITABLE_STATUSES.includes(row.status)) throw new ActionNotAllowedError();

    if (customerId === row.customerId) return;

    if (customerId !== null) {
      await requireAliveCustomer(deps.customerCatalog, customerId, actor.companyId);
    }

    await deps.unitOfWork.run(async (transaction) => {
      // Otra operacion pudo cerrar el pedido entre las dos lecturas: se vuelve a comprobar sobre
      // la fila bloqueada, como en `update-order.ts`.
      const locked = await transaction.orders.lockAliveById(id, scope);
      if (locked === null) throw new OrderNotFoundError();
      if (!CUSTOMER_EDITABLE_STATUSES.includes(locked.status)) throw new ActionNotAllowedError();

      const result = await transaction.orders.setCustomerAlive(id, customerId, actor.id, now(), scope);
      if (result === 'not_found') throw new OrderNotFoundError();
    });
  };
}
