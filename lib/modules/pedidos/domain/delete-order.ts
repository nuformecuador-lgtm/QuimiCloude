import { requirePermission, type Actor } from './actor';
import { NotDeletableError, OrderNotFoundError } from './errors';
import type { OrderStatus } from './order-classification';
import type { OrderScope } from './order-scope';

import type { OrderUnitOfWork } from '../ports/order-unit-of-work';
import type { OrderRepository } from '../ports/order-repository';

export type DeleteOrderDeps = {
  readonly orders: OrderRepository;
  /** Borrar tambien solo libera: mismo motivo que `CancelOrderDeps` para no recibir la receta. */
  readonly unitOfWork: OrderUnitOfWork;
  /** Ver el comentario identico de `create-order.ts` sobre el origen de este reloj. */
  readonly now?: () => Date;
};

/**
 * Los estados que NO se borran: se cancela, se termina o se entrega para dejar constancia, asi
 * que borrar despues los borraria de las consultas. Desde `POR_EMPACAR` el material ya se
 * consumio -borrarlos ocultaria ese consumo y el producto terminado ya dado de alta-. Esta lista
 * es la mitad de APLICACION; la otra mitad es el `CHECK orders_delivered_not_deleted`, que
 * nombra los mismos estados.
 */
const NO_BORRABLES: readonly OrderStatus[] = [
  'ENTREGADO',
  'CANCELADO',
  'POR_EMPACAR',
  'EN_EMPAQUE',
  'POR_ACONDICIONAR',
  'EN_ACONDICIONAMIENTO',
  'TERMINADO',
];

/**
 * Borrado de pedido. Borrado LOGICO y sin restaurar: `softDeleteAlive`, jamas un borrado
 * fisico. El pedido conserva su fila entera y su numero correlativo -que no se libera ni se
 * reutiliza- y solo gana `deleted_at`.
 *
 * No existe ninguna operacion de restaurar ni ningun listado de borrados, y no por olvido:
 * el puerto no las declara, asi que no se pueden hacer por descuido.
 *
 * Un pedido vivo que se borra tambien libera su material, igual que cancelar, en la MISMA
 * operacion, sin persona autora en la reserva mas alla del actor que borro.
 */
export function createDeleteOrder(
  deps: DeleteOrderDeps,
): (id: string, actor: Actor | null | undefined) => Promise<void> {
  const now = deps.now ?? (() => new Date());

  return async function deleteOrder(
    id: string,
    actor: Actor | null | undefined,
  ): Promise<void> {
    requirePermission(actor, 'pedidos.modificar');

    // La empresa sale del ACTOR y jamas de la entrada: nadie puede elegir consultar otra.
    const scope: OrderScope = { companyId: actor.companyId };

    // R33: no existe y ya esta borrado son el mismo caso, y el filtro `deleted_at IS NULL`
    // es del puerto (R40).
    const row = await deps.orders.findAliveById(id, scope);
    if (row === null) throw new OrderNotFoundError();

    // R32, con `code` PROPIO (`not_deletable`), distinto del de la edicion rechazada. Se lee
    // la fila ANTES de escribir precisamente para poder distinguir «no existe» de «no se
    // puede borrar» (`design.md > 7.4`).
    if (NO_BORRABLES.includes(row.status)) throw new NotDeletableError();

    const instant = now();

    const result = await deps.unitOfWork.run(async (transaction) => {
      const locked = await transaction.orders.lockAliveById(id, scope);
      if (locked === null) return 'not_found' as const;
      if (NO_BORRABLES.includes(locked.status)) throw new NotDeletableError();

      // Libera y limpia `reserved_at` ANTES de marcar `deleted_at`: `setReservedAt` solo
      // escribe sobre una fila viva (`WHERE deleted_at IS NULL`), asi que hacerlo despues del
      // borrado no tocaria nada.
      await transaction.reservations.releaseForOrder({
        orderId: id,
        companyId: actor.companyId,
        reason: 'release',
        actorId: actor.id,
        now: instant,
      });
      await transaction.orders.setReservedAt(id, null, scope);

      // El borrado tambien registra al actor como autor de la ultima modificacion.
      const deleted = await transaction.orders.softDeleteAlive(id, actor.id, instant, scope);
      if (deleted === 'not_found') return 'not_found' as const;
      return 'ok' as const;
    });

    if (result === 'not_found') throw new OrderNotFoundError();
  };
}
