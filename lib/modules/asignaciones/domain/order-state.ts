// lib/modules/asignaciones/domain/order-state.ts
/**
 * QC-87 T7 — La tabla de estados de `design.md > 4`, en UN solo sitio (R8-R12).
 *
 * Las TRES escrituras del modulo -asignar, quitar un grupo y desasignar- comparten exactamente la
 * misma tabla, y por eso vive aqui y no dentro de un caso de uso: tres copias de la misma tabla
 * divergen el dia que QC-34 anada un estado, y divergirian **en silencio**.
 *
 * | Estado del pedido   | las TRES escrituras                       |
 * | ------------------- | ----------------------------------------- |
 * | `PENDIENTE`         | admitida (R9)                             |
 * | `EN_CURSO`          | admitida (R9)                             |
 * | `POR_EMPACAR`       | `order_produced_frozen`                   |
 * | `EN_EMPAQUE`        | `order_produced_frozen`                   |
 * | `ENTREGADO`         | `order_delivered_frozen` (R10)            |
 * | `CANCELADO`         | `order_cancelled_not_assignable` (R11)    |
 * | no existe / de baja | `order_not_found` (R8)                    |
 *
 * **La consulta NO pasa por aqui** (R13): devuelve lo mismo en los cuatro estados y solo exige que
 * el pedido exista.
 *
 * DOS decisiones que son el requisito y no estilo:
 *
 *   1. **Se decide sobre la LECTURA del pedido, nunca en el `WHERE` de la escritura** (R12). Es el
 *      riesgo 4 de `design.md > 10`: metida en el `where` de un `DELETE` o de un `INSERT`, «el
 *      pedido no existe» y «el pedido esta entregado» devolverian lo mismo, y la pantalla diria
 *      `order_not_found` de un pedido que el usuario esta viendo. Por eso esta funcion recibe el
 *      pedido YA LEIDO -o `null`- y no ningun filtro.
 *   2. **El mapa es TOTAL sobre `OrderStatus`** (`satisfies Record<...>`), con el mismo criterio
 *      que `MOTIVO_POR_ESTADO` de QC-84: si manana el catalogo de estados crece, este archivo **no
 *      compila** -falta la clave- en vez de clasificar el estado nuevo como «admitida» por
 *      descuido. Un estado sin clasificar seria una escritura colada sobre un pedido cerrado.
 *
 * **No se usa `assertTransition` de `pedidos`** aunque este publicado (`design.md > 4`): esa tabla
 * dice que CAMBIOS DE ESTADO son legales al editar un pedido, y aqui no se cambia ningun estado.
 */
import type { OrderAssignmentTarget, OrderStatus } from '@/lib/modules/pedidos';

import {
  OrderCancelledNotAssignableError,
  OrderDeliveredFrozenError,
  OrderNotFoundError,
  OrderProducedFrozenError,
  type AsignacionesError,
} from './errors';

/** `null` = ese estado ADMITE las escrituras. Los que no, con su error propio y distinto:
 *  son frases distintas para quien las lee, no un matiz de redaccion.
 *
 *  `BLOQUEADO` ADMITE las escrituras -asignar, quitar grupo y desasignar-, y no por
 *  descuido: se le puede poner responsable a un pedido que todavia no tiene material, y quien
 *  lo asigne no lo va a poder arrancar hasta que el material entre. Lo que no se admite es
 *  arrancarlo, y eso lo rechazan `get-assigned-order-execution` y `start-assigned-order`, que
 *  tienen su propio error para no confundir «no se puede iniciar» con «no se le pueden poner
 *  responsables». */
const ERROR_POR_ESTADO = {
  PENDIENTE: null,
  EN_CURSO: null,
  BLOQUEADO: null,
  POR_EMPACAR: (): AsignacionesError => new OrderProducedFrozenError(),
  EN_EMPAQUE: (): AsignacionesError => new OrderProducedFrozenError(),
  ENTREGADO: (): AsignacionesError => new OrderDeliveredFrozenError(),
  CANCELADO: (): AsignacionesError => new OrderCancelledNotAssignableError(),
} satisfies Record<OrderStatus, (() => AsignacionesError) | null>;

/**
 * Deja pasar si el pedido existe y su estado admite escrituras; lanza en cualquier otro caso.
 *
 * `order` es lo que devolvio `OrderCatalog.findAliveById`: `null` significa «no existe **o** esta
 * dado de baja», que para quien pregunta son el mismo caso (R8, QC-34 R33).
 */
export function assertOrderAcceptsWrites(
  order: OrderAssignmentTarget | null,
): asserts order is OrderAssignmentTarget {
  // R8: primero la existencia. Que este error sea distinto del de R10/R11 es el requisito R12.
  if (order === null) throw new OrderNotFoundError();

  const error = ERROR_POR_ESTADO[order.status];
  if (error !== null) throw error();
}
