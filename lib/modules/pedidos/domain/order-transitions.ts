import { InvalidTransitionError } from './errors';
import type { OrderStatus } from './order-classification';

/**
 * Lo unico que permite, escrito UNA SOLA VEZ. Cancelar NO esta aqui: es `cancelOrder` y solo
 * el, asi que `CANCELADO` no es destino de ningun par. Quedarse en el mismo estado SI es legal
 * mientras el pedido no sea final o de empaque: editar la cantidad de un pedido sin moverlo de
 * `PENDIENTE` no es una transicion.
 *
 * `PENDIENTE` ya NO llega a `ENTREGADO`: abrir la pantalla del pedido ya lo deja `EN_CURSO`, asi
 * que el unico origen del Finalizar es `EN_CURSO`. `EN_CURSO` pasa a `POR_EMPACAR`, no a
 * `ENTREGADO`: el material se consume ahi.
 *
 * Los pares del empaque y del acondicionamiento SI estan en esta tabla -son transiciones legales
 * del pedido-, pero `transitionAliveById` (el puerto que usa `asignaciones` para el Finalizar)
 * rechaza esos destinos igual: solo se alcanzan por sus acciones propias, que usan su propio
 * puerto. Ninguno de esos estados admite «quedarse igual»: sin esa entrada, no son editables
 * desde Pedidos.
 *
 * `ENTREGADO` y `CANCELADO` tienen la lista VACIA porque un pedido final no admite NINGUNA
 * edicion, ni siquiera la que solo cambia la prioridad.
 *
 * `BLOQUEADO` -el pedido cuyo material no alcanza- conecta con `PENDIENTE` en las dos
 * direcciones y admite «quedarse igual», porque el ciclo es de ida y vuelta: se bloquea al
 * crearlo o al editarlo, y se desbloquea al editarlo con material o al entrar lotes, sin que
 * eso sea un paso del flujo sino una consecuencia de la disponibilidad. NO conecta con
 * `EN_CURSO` ni con `ENTREGADO` por ninguna via, ni con `POR_EMPACAR` ni con `EN_EMPAQUE` en
 * ninguna direccion: `BLOQUEADO` no aparta material, asi que no puede estar a mitad del empaque;
 * y un pedido que ya esta en `EN_CURSO` no puede quedarse sin material, porque arrancar
 * implicaba que habia con que producirlo.
 *
 * ESTO NO BAJA A LA BASE: un `CHECK` evalua la fila RESULTANTE y no sabe de donde venia el
 * pedido; un trigger si podria, pero seria el primero del repositorio y no distinguiria
 * `updateOrder` de `cancelOrder` ni de las acciones de empaque. Coste asumido y escrito: un
 * `UPDATE` por consola puede retroceder un pedido. Lo caro de deshacer -que un entregado o un
 * cancelado no se borre, que un cancelado tenga motivo, y que solo `EN_EMPAQUE` pueda llevar
 * quien empaca- si lo garantiza la base.
 */
const ALLOWED: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  PENDIENTE: ['PENDIENTE', 'EN_CURSO', 'BLOQUEADO'],
  EN_CURSO: ['EN_CURSO', 'POR_EMPACAR'],
  POR_EMPACAR: ['EN_EMPAQUE'],
  EN_EMPAQUE: ['POR_ACONDICIONAR'],
  POR_ACONDICIONAR: ['EN_ACONDICIONAMIENTO'],
  EN_ACONDICIONAMIENTO: ['TERMINADO'],
  TERMINADO: ['ENTREGADO'],
  ENTREGADO: [], // final: ni siquiera 'ENTREGADO', porque un ENTREGADO no admite EDICION
  CANCELADO: [], // final, por el mismo motivo
  BLOQUEADO: ['BLOQUEADO', 'PENDIENTE'],
};

/** ¿Es legal pasar de `from` a `to` en una EDICION? Predicado puro, para poder probar todos los
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
    // QC-70 (R7, R28): el mensaje sale del catalogo -«El pedido no admite ese cambio de
    // estado.»- y los dos estados concretos viajan como DIAGNOSTICO, que va al registro del
    // servidor y nunca al navegador. Antes se incrustaban en el texto, y eso obligaba a que
    // la frase viviera aqui en vez de en el catalogo.
    throw new InvalidTransitionError(`de ${from} a ${to}`);
  }
}
