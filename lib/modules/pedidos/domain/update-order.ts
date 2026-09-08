import { requirePermission, type Actor } from './actor';
import { NotFoundError, RecipeNotFoundError, ValidationError } from './errors';
import { updateOrderSchema } from './order-input';
import { assertTransition } from './order-transitions';

import type { RecipeCatalog } from '@/lib/modules/recetas';

import type { OrderRepository } from '../ports/order-repository';

/** QC-35bis (2026-09-07): sin unidad en el pedido, `units` deja de ser dependencia. */
export type UpdateOrderDeps = {
  readonly orders: OrderRepository;
  readonly recipes: RecipeCatalog;
  /** Ver el comentario identico de `create-order.ts` sobre el origen de este reloj. */
  readonly now?: () => Date;
};

/**
 * Edicion de pedido (R20, R21, R22, R24, R25, R33).
 *
 * REEMPLAZO COMPLETO del conjunto de datos de negocio (R20), como QC-25 y QC-43: no hay
 * edicion parcial campo a campo. Es la pregunta abierta 5 del spec, con su posicion por
 * defecto escrita y su coste (subir la prioridad obliga a reenviar todo el pedido).
 *
 * `status: 'CANCELADO'` y cualquier motivo mueren ANTES, en `updateOrderSchema` (R24): la
 * edicion no puede ni EXPRESAR una cancelacion, porque `NewOrder.status` es
 * `EditableOrderStatus` (`design.md > 8`, capas 1 y 2).
 *
 * R6: el actor queda como autor de la ULTIMA MODIFICACION y el de creacion NO se toca. Esa
 * mitad la cierra el adaptador -`data` no lleva `createdBy` y el `UPDATE` tampoco-, y su
 * prueba real es la de integracion.
 */
export function createUpdateOrder(
  deps: UpdateOrderDeps,
): (id: string, input: unknown, actor: Actor | null | undefined) => Promise<void> {
  const now = deps.now ?? (() => new Date());

  return async function updateOrder(
    id: string,
    input: unknown,
    actor: Actor | null | undefined,
  ): Promise<void> {
    requirePermission(actor, 'pedidos.modificar');

    const parsed = updateOrderSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const data = parsed.data;

    // R33: no existe y ya esta borrado son el mismo caso. La comprobacion de estado se hace
    // sobre la fila que se acaba de leer y NO en el `where` del `UPDATE` (`design.md > 7.4`):
    // si viviera en el `where`, «no existe» y «esta entregado» devolverian lo mismo y el
    // usuario recibiria `not_found` ante un pedido que esta viendo en pantalla.
    const row = await deps.orders.findAliveById(id);
    if (row === null) throw new NotFoundError();

    // R21 y R22 caen sobre la MISMA tabla y no hay dos verdades: `ENTREGADO` y `CANCELADO`
    // tienen la lista de destinos VACIA, asi que un pedido final no admite NINGUNA edicion,
    // ni siquiera la que solo cambia la prioridad. Va antes de preguntar a los catalogos:
    // una edicion rechazada no lee nada mas y no modifica ninguna fila.
    assertTransition(row.status, data.status);

    // R25 -la sutileza de esta ficha-. Si la receta NO cambia se acepta aunque este dada de
    // baja: corregir la cantidad de un pedido viejo no puede obligar a cambiarle la formula.
    // Si CAMBIA, se exige viva igual que en el alta (R15), asi que sigue siendo imposible
    // PONER una receta inexistente o dada de baja.
    if (data.recipeId !== row.recipeId) {
      const [recipe] = await deps.recipes.findRefsIncludingDeleted([data.recipeId]);
      if (recipe === undefined || recipe.isDeleted) throw new RecipeNotFoundError();
    }

    const result = await deps.orders.updateAlive(id, data, actor.id, now());

    // La fila pudo borrarse entre el `SELECT` y el `UPDATE`: el puerto vuelve a filtrar por
    // vivos y el caso de uso responde lo mismo que arriba (R33).
    if (result === 'not_found') throw new NotFoundError();
  };
}
