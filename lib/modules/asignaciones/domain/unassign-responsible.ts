/**
 * QC-87 T8 — Caso de uso `unassignResponsible` (`design.md > 5`).
 *
 * Camino, en este orden y sin ninguna variacion:
 *   permiso (R1, PRIMERA linea) -> `zod` (R42) -> lectura del pedido y tabla de estados (R8-R12)
 *   -> `deleteOne` (R29) -> `'not_found'` es `order_assignment_not_found` (R30).
 *
 * **Borra UNA fila y NINGUNA otra** (R29): ni las demas filas del mismo grupo en ese pedido, ni las
 * sueltas, ni las de otros pedidos. Eso no es una promesa de este archivo sino del PUERTO, que no
 * tiene ningun borrado masivo por pedido (`ports/order-assignment-repository.ts`, propiedad 3): lo
 * que no se puede expresar no se hace por descuido.
 *
 * **La entrada opera sobre EXACTAMENTE una persona** (R31) y no puede expresar otra cosa: el
 * `strictObject` de `unassignResponsibleSchema` tiene `userId` en singular, asi que mandar `userIds`
 * FALLA en vez de ignorarse en silencio. El esquema es de T6 y aqui no se toca.
 *
 * El borrado es FISICO (R29, QC-86 R15 y su decision cerrada 5): excepcion explicita y ya decidida
 * al borrado logico de QC-4. No hay `deleted_at` que poner.
 *
 * **La tabla de estados es LA MISMA que la de asignar**, y por eso se importa de `./order-state` en
 * vez de reescribirse aqui (R8-R12, `design.md > 4`): tres copias de la misma tabla divergen el dia
 * que QC-34 anada un estado, y divergirian en silencio. Un pedido `ENTREGADO` congela —tampoco SALE
 * nadie (R10)— y un `CANCELADO` tampoco admite desasignar (**R11**, tal como quedo escrito: la
 * pregunta abierta 2 del spec se cerro a favor de tratarlo igual que el entregado, con `code`
 * DISTINTO porque son dos frases distintas para quien las lee).
 */
import { requirePermission, type Actor } from './actor';
import { unassignResponsibleSchema } from './assignment-input';
import { OrderAssignmentNotFoundError, ValidationError } from './errors';
import { assertOrderAcceptsWrites } from './order-state';

import type { OrderAssignmentRepository } from '../ports/order-assignment-repository';

import type { OrderCatalog } from '@/lib/modules/pedidos';

export type UnassignResponsibleDeps = {
  /** El CONTRATO de `pedidos` (`design.md > 2.1`), no su repositorio interno: este modulo no
   *  puede tocar `prisma.order` y la guardia de modulos lo vigila. */
  readonly orders: OrderCatalog;
  readonly assignments: OrderAssignmentRepository;
};

export function createUnassignResponsible(
  deps: UnassignResponsibleDeps,
): (actor: Actor | null | undefined, input: unknown) => Promise<void> {
  return async function unassignResponsible(
    actor: Actor | null | undefined,
    input: unknown,
  ): Promise<void> {
    // R1, R2: antes de `zod` y antes de tocar NINGUN puerto. Un actor sin permiso no llega a
    // enterarse de si el pedido existe.
    requirePermission(actor, 'asignaciones.modificar');

    const parsed = unassignResponsibleSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const { orderId, userId } = parsed.data;

    // R12: la decision de estado va sobre ESTA lectura y NUNCA en el `WHERE` del borrado. Si
    // viviera alli, «el pedido no existe» y «el pedido esta entregado» serian el mismo error.
    const order = await deps.orders.findAliveById(orderId);
    assertOrderAcceptsWrites(order);

    // R5: la empresa sale del ACTOR y de ningun otro sitio; el esquema ni siquiera la admite.
    const result = await deps.assignments.deleteOne(actor.companyId, orderId, userId);

    // R30: la persona existe, pero no es responsable de ESTE pedido. Codigo propio: no es
    // `user_not_found` —eso diria que la persona no existe— y la operacion no tuvo efecto.
    if (result === 'not_found') throw new OrderAssignmentNotFoundError();
  };
}
