import { requirePermission, type Actor } from './actor';
import { NotCancellableError, OrderNotFoundError, ValidationError } from './errors';
import { cancelInsideTransaction, isCancellableStatus } from './order-cancellation';
import { cancelOrderSchema } from './order-input';
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
 * Cancelacion. CASO DE USO PROPIO y UNICO camino capaz de escribir el estado `CANCELADO` y
 * el motivo: la edicion normal no puede cancelar, ni siquiera expresarlo, porque
 * `NewOrder.status` es `EditableOrderStatus` y `cancelAlive` es el unico metodo del puerto
 * con `reason`.
 *
 * Es el UNICO caso de uso que recibe y escribe un motivo. Y una vez escrito no se vuelve a
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

    // `not_cancellable` lleva `code` propio para que quien lo muestre lo distinga sin leer el
    // mensaje.
    if (!isCancellableStatus(row.status)) throw new NotCancellableError();

    const instant = now();

    const result = await deps.unitOfWork.run((transaction) =>
      cancelInsideTransaction(transaction, {
        id,
        reason,
        actorId: actor.id,
        now: instant,
        companyId: actor.companyId,
      }),
    );

    if (result === 'not_found') throw new OrderNotFoundError();
    if (result === 'not_cancellable') throw new NotCancellableError();
  };
}
