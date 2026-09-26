import { requirePermission, type Actor } from './actor';
import { NotCancellableError, OrderNotFoundError, ValidationError } from './errors';
import { cancelOrderSchema } from './order-input';
import type { OrderStatus } from './order-classification';
import type { OrderScope } from './order-scope';

import type { OrderUnitOfWork } from '../ports/order-unit-of-work';
import type { OrderRepository } from '../ports/order-repository';

export type CancelOrderDeps = {
  readonly orders: OrderRepository;
  /** Cancelar solo libera: no toca la receta, asi que no recibe `recipes`, `products` ni
   *  `units`. */
  readonly unitOfWork: OrderUnitOfWork;
  /** Ver el comentario identico de `create-order.ts` sobre el origen de este reloj. */
  readonly now?: () => Date;
};

/**
 * Los DOS estados desde los que se cancela. Desde `ENTREGADO` no se cancela -eso seria una
 * devolucion, que no existe- y desde `CANCELADO` tampoco, porque es final. `POR_EMPACAR` y
 * `EN_EMPAQUE` tampoco: el material ya se consumio al dejar el pedido `POR_EMPACAR`, asi que
 * cancelar dejaria un consumo sin pedido que lo explique; un problema en esos dos estados se
 * corrige con un ajuste de inventario, no con esta lista. Escrita como lista para que anadir un
 * septimo estado obligue a decidir explicitamente si es cancelable.
 */
const CANCELABLES: readonly OrderStatus[] = ['PENDIENTE', 'EN_CURSO'];

/**
 * Cancelacion. CASO DE USO PROPIO y UNICO camino capaz de escribir el estado `CANCELADO` y
 * el motivo: la edicion normal no puede cancelar, ni siquiera expresarlo, porque
 * `NewOrder.status` es `EditableOrderStatus` y `cancelAlive` es el unico metodo del puerto
 * con `reason`.
 *
 * Es el UNICO de los seis que recibe y escribe un motivo. Y una vez escrito no se vuelve a
 * tocar: de `CANCELADO` no se sale -R21 lo deja sin edicion y su lista de transiciones esta
 * vacia- y `cancelAlive` solo acepta pedidos no cancelados. Eso es R29 sin necesidad de
 * ninguna columna inmutable.
 *
 * Libera todo lo apartado en la MISMA operacion, con quien cancelo como autor, y fija
 * `reserved_at` a `null`.
 */
export function createCancelOrder(
  deps: CancelOrderDeps,
): (id: string, input: unknown, actor: Actor | null | undefined) => Promise<void> {
  const now = deps.now ?? (() => new Date());

  return async function cancelOrder(
    id: string,
    input: unknown,
    actor: Actor | null | undefined,
  ): Promise<void> {
    requirePermission(actor, 'pedidos.modificar');

    // La empresa sale del ACTOR y jamas de la entrada: nadie puede elegir consultar otra.
    const scope: OrderScope = { companyId: actor.companyId };

    // R27: sin motivo, vacio, de solo espacios o de mas de 500 caracteres una vez recortado,
    // se rechaza AQUI, en la validacion de aplicacion, y no modifica ninguna fila. El tope
    // vive en el esquema y no en el tipo de la columna (decision cerrada 4).
    const parsed = cancelOrderSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const { reason } = parsed.data;

    const row = await deps.orders.findAliveById(id, scope);
    if (row === null) throw new OrderNotFoundError();

    // R28, con `code` PROPIO: `not_cancellable` no es `invalid_transition` ni `not_deletable`,
    // porque QC-35 tiene que poder decir tres frases distintas sin leer el mensaje (R56).
    if (!CANCELABLES.includes(row.status)) throw new NotCancellableError();

    const instant = now();

    const result = await deps.unitOfWork.run(async (transaction) => {
      const locked = await transaction.orders.lockAliveById(id, scope);
      if (locked === null) return 'not_found' as const;
      if (!CANCELABLES.includes(locked.status)) throw new NotCancellableError();

      // El actor queda como autor de la ultima modificacion, sin tocar el de creacion.
      const cancelled = await transaction.orders.cancelAlive(id, reason, actor.id, instant, scope);
      if (cancelled === 'not_found') return 'not_found' as const;

      await transaction.reservations.releaseForOrder({
        orderId: id,
        companyId: actor.companyId,
        reason: 'release',
        actorId: actor.id,
        now: instant,
      });
      await transaction.orders.setReservedAt(id, null, scope);
      return 'ok' as const;
    });

    if (result === 'not_found') throw new OrderNotFoundError();
  };
}
