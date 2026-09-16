import { requirePermission, type Actor } from './actor';
import { NotDeletableError, OrderNotFoundError } from './errors';
import type { OrderStatus } from './order-classification';
import type { OrderScope } from './order-scope';

import type { OrderRepository } from '../ports/order-repository';

export type DeleteOrderDeps = {
  readonly orders: OrderRepository;
  /** Ver el comentario identico de `create-order.ts` sobre el origen de este reloj. */
  readonly now?: () => Date;
};

/**
 * Los dos estados que NO se borran (R32, decision cerrada 9): se cancela para dejar
 * constancia, asi que borrar despues la borraria de las consultas. Esta lista es la mitad de
 * APLICACION; la otra mitad es el `CHECK orders_delivered_not_deleted`, ampliado en la base
 * por la migracion de esta ficha.
 */
const NO_BORRABLES: readonly OrderStatus[] = ['ENTREGADO', 'CANCELADO'];

/**
 * Borrado de pedido (R31, R32, R33). Borrado LOGICO y sin restaurar (decision cerrada 9):
 * `softDeleteAlive`, jamas un borrado fisico. El pedido conserva su fila entera y su numero
 * correlativo -que no se libera ni se reutiliza (R13)- y solo gana `deleted_at`.
 *
 * No existe ninguna operacion de restaurar ni ningun listado de borrados, y no por olvido:
 * el puerto no las declara (R31), asi que no se pueden hacer por descuido.
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

    // QC-60 (R16): la empresa sale del ACTOR y jamas de la entrada, para que nadie pueda
    // consultar ni escribir en otra. Se construye aqui, DESPUES del permiso -que sigue siendo
    // la primera linea (R28)- y antes de tocar el puerto. Esto no es una condicion SQL: el
    // `where` lo escribe el UNICO punto de consulta del adaptador driven (`design.md > 5`).
    const scope: OrderScope = { companyId: actor.companyId };

    // R33: no existe y ya esta borrado son el mismo caso, y el filtro `deleted_at IS NULL`
    // es del puerto (R40).
    const row = await deps.orders.findAliveById(id, scope);
    if (row === null) throw new OrderNotFoundError();

    // R32, con `code` PROPIO (`not_deletable`), distinto del de la edicion rechazada. Se lee
    // la fila ANTES de escribir precisamente para poder distinguir «no existe» de «no se
    // puede borrar» (`design.md > 7.4`).
    if (NO_BORRABLES.includes(row.status)) throw new NotDeletableError();

    // R6: el borrado tambien registra al actor como autor de la ultima modificacion.
    const result = await deps.orders.softDeleteAlive(id, actor.id, now(), scope);
    if (result === 'not_found') throw new OrderNotFoundError();
  };
}
