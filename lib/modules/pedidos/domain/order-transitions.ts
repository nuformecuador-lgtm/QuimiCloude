import { InvalidTransitionError } from './errors';
import type { OrderStatus } from './order-classification';

/**
 * Lo que la decision cerrada 5 permite, escrito UNA SOLA VEZ (`design.md > 5`). Cancelar NO
 * esta aqui: es `cancelOrder` y solo el (decision cerrada 7, R24, R26), asi que `CANCELADO`
 * no es destino de ningun par. Quedarse en el mismo estado SI es legal mientras el pedido no
 * sea final: editar la cantidad de un pedido sin moverlo de `PENDIENTE` no es una transicion.
 *
 * Los dos estados finales tienen la lista VACIA a proposito: R21 dice que un pedido
 * `ENTREGADO` o `CANCELADO` no admite NINGUNA edicion, ni siquiera la que solo cambia la
 * prioridad, asi que ni siquiera «quedarse igual» es legal. La comprobacion de R21 y la de R22
 * caen sobre esta misma tabla y no hay dos verdades.
 *
 * ESTO NO BAJA A LA BASE, y el resto de la ficha hace lo contrario (`design.md > 5`): un
 * `CHECK` evalua la fila RESULTANTE y no sabe de donde venia el pedido; un trigger si podria,
 * pero QC-33 R19 fijo que la base no restringe las transiciones, no distinguiria `updateOrder`
 * de `cancelOrder`, y seria el primer trigger del repositorio. Coste asumido y escrito: un
 * `UPDATE` por consola puede retroceder un pedido. Lo caro de deshacer -que un entregado o un
 * cancelado no se borre, y que un cancelado tenga motivo- si lo garantiza la base.
 */
const ALLOWED: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  PENDIENTE: ['PENDIENTE', 'EN_CURSO', 'ENTREGADO'],
  EN_CURSO: ['EN_CURSO', 'ENTREGADO'],
  ENTREGADO: [], // final: ni siquiera 'ENTREGADO', porque un ENTREGADO no admite EDICION (R21)
  CANCELADO: [], // final, por el mismo motivo
};

/** ¿Es legal pasar de `from` a `to` en una EDICION? Predicado puro, para poder probar los 16
 *  pares de la matriz sin capturar excepciones. */
export function isAllowedTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED[from].includes(to);
}

/**
 * Guardia de la edicion (R21, R22). Lanza `InvalidTransitionError` -`code`
 * `invalid_transition`- si el cambio pedido no esta permitido: un retroceso, un salto que la
 * decision 5 no lista, o cualquier edicion de un pedido final.
 *
 * `CANCELADO` no puede llegar aqui como destino desde la edicion: `updateOrderSchema` lo
 * rechaza antes, en el borde (R24). Que ademas no este en ninguna lista de `ALLOWED` es la
 * tercera de las cuatro capas de `design.md > 8`, no una redundancia.
 */
export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!isAllowedTransition(from, to)) {
    throw new InvalidTransitionError(
      `Un pedido en estado ${from} no puede pasar a ${to}.`,
    );
  }
}
