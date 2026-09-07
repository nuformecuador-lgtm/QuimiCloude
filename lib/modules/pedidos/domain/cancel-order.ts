import { requirePermission, type Actor } from './actor';
import { NotCancellableError, NotFoundError, ValidationError } from './errors';
import { cancelOrderSchema } from './order-input';
import type { OrderStatus } from './order-classification';

import type { OrderRepository } from '../ports/order-repository';

export type CancelOrderDeps = {
  readonly orders: OrderRepository;
  /** Ver el comentario identico de `create-order.ts` sobre el origen de este reloj. */
  readonly now?: () => Date;
};

/**
 * Los DOS estados desde los que se cancela (decision cerrada 6, R28). Desde `ENTREGADO` no
 * se cancela -eso seria una devolucion, que no existe (pregunta abierta 1)- y desde
 * `CANCELADO` tampoco, porque es final. Escrito como lista para que anadir un quinto estado
 * obligue a decidir explicitamente si es cancelable.
 */
const CANCELABLES: readonly OrderStatus[] = ['PENDIENTE', 'EN_CURSO'];

/**
 * Cancelacion (R26, R27, R28, R29, R33). CASO DE USO PROPIO y UNICO camino capaz de escribir
 * el estado `CANCELADO` y el motivo (decision cerrada 7): la edicion normal no puede
 * cancelar, ni siquiera expresarlo, porque `NewOrder.status` es `EditableOrderStatus` y
 * `cancelAlive` es el unico metodo del puerto con `reason` (`design.md > 8`).
 *
 * Es el UNICO de los seis que recibe y escribe un motivo. Y una vez escrito no se vuelve a
 * tocar: de `CANCELADO` no se sale -R21 lo deja sin edicion y su lista de transiciones esta
 * vacia- y `cancelAlive` solo acepta pedidos no cancelados. Eso es R29 sin necesidad de
 * ninguna columna inmutable.
 *
 * El orden es el pseudocodigo literal de `design.md > 8`.
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

    // R27: sin motivo, vacio, de solo espacios o de mas de 500 caracteres una vez recortado,
    // se rechaza AQUI, en la validacion de aplicacion, y no modifica ninguna fila. El tope
    // vive en el esquema y no en el tipo de la columna (decision cerrada 4).
    const parsed = cancelOrderSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const { reason } = parsed.data;

    const row = await deps.orders.findAliveById(id);
    if (row === null) throw new NotFoundError();

    // R28, con `code` PROPIO: `not_cancellable` no es `invalid_transition` ni `not_deletable`,
    // porque QC-35 tiene que poder decir tres frases distintas sin leer el mensaje (R56).
    if (!CANCELABLES.includes(row.status)) throw new NotCancellableError();

    // R6: el actor queda como autor de la ultima modificacion, sin tocar el de creacion.
    const result = await deps.orders.cancelAlive(id, reason, actor.id, now());
    if (result === 'not_found') throw new NotFoundError();
  };
}
