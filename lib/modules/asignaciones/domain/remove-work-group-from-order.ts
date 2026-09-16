/**
 * QC-87 T8 — Caso de uso `removeWorkGroupFromOrder` (`design.md > 5`).
 *
 * Camino:
 *   permiso (R1, PRIMERA linea) -> `zod` (R42) -> lectura del pedido y tabla de estados (R8-R12)
 *   -> `deleteByWorkGroup` (R32) -> `{ removed }` (R34).
 *
 * **La pregunta abierta 3 del spec esta CERRADA a favor de esta mitad**: «quitar un grupo del
 * pedido» es de QC-87 y **no** de QC-102 (decision del humano, 2026-09-13). R32-R34 se implementan
 * aqui tal cual estan escritos. Lo que sigue siendo cierto de `design.md > 0` (hallazgo 5) es que
 * el caso de uso vive en **su propio archivo** y tendra **su propia Server Action**, no que tenga
 * que reescribir la tabla de estados: esa se comparte con las otras dos escrituras en
 * `./order-state`, porque tres copias de la misma tabla divergen —en silencio— el dia que QC-34
 * anada un estado.
 *
 * **NO comprueba que el grupo exista, y eso es el requisito** (R32): se borra por el
 * `work_group_id` **CONGELADO EN LA FILA**, no por la tabla de grupos. Quitar del pedido un grupo
 * que se **renombro o se dio de baja DESPUES** de aplicarse **FUNCIONA** — que es justo lo que
 * pasaria en produccion si no estuviera escrito aqui. Pedirle a `identity` que el grupo siga vivo
 * dejaria filas imposibles de quitar por pantalla, y es exactamente el «arreglo» que este parrafo
 * existe para impedir.
 *
 * **Sin filas de ese grupo en ese pedido, TERMINA CON EXITO** con `{ removed: 0 }` y **sin lanzar**
 * (R33): «no habia nada que quitar» deja el pedido en el estado que se pedia, y convertirlo en
 * error obligaria a la pantalla a tratar como fallo un desenlace correcto. Es la diferencia
 * deliberada con R30, donde desasignar a quien no es responsable SI es un error: alli se nombra a
 * UNA persona concreta y equivocarse de persona es informacion util.
 */
import { requirePermission, type Actor } from './actor';
import { removeWorkGroupFromOrderSchema } from './assignment-input';
import { ValidationError } from './errors';
import { assertOrderAcceptsWrites } from './order-state';

import type { OrderAssignmentRepository } from '../ports/order-assignment-repository';

import type { OrderCatalog } from '@/lib/modules/pedidos';

export type RemoveWorkGroupFromOrderDeps = {
  /** El CONTRATO de `pedidos` (`design.md > 2.1`). **No hay `WorkGroupDirectory` en estas deps**, y
   *  su ausencia es R32: este caso de uso NO pregunta por el grupo a `identity`. */
  readonly orders: OrderCatalog;
  readonly assignments: OrderAssignmentRepository;
};

export function createRemoveWorkGroupFromOrder(
  deps: RemoveWorkGroupFromOrderDeps,
): (actor: Actor | null | undefined, input: unknown) => Promise<{ readonly removed: number }> {
  return async function removeWorkGroupFromOrder(
    actor: Actor | null | undefined,
    input: unknown,
  ): Promise<{ readonly removed: number }> {
    // R1, R2: primera linea, antes de `zod` y de cualquier puerto.
    requirePermission(actor, 'asignaciones.modificar');

    const parsed = removeWorkGroupFromOrderSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const { orderId, workGroupId } = parsed.data;

    // R12: sobre la LECTURA, nunca en el `WHERE` del borrado.
    const order = await deps.orders.findAliveById(orderId, actor.companyId);
    assertOrderAcceptsWrites(order);

    // R5: la empresa, del actor. R32: solo las filas de ESE pedido con ESE origen; las sueltas y
    // las de otro grupo no las alcanza esta llamada. R34: el numero lo devuelve la base, no un
    // conteo a mano. R33: cero es un desenlace con exito.
    const removed = await deps.assignments.deleteByWorkGroup(actor.companyId, orderId, workGroupId);

    return { removed };
  };
}
