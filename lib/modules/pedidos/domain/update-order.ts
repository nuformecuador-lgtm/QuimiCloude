import { requirePermission, type Actor } from './actor';
import {
  InsufficientMaterialError,
  OrderNotFoundError,
  PresentationNotFoundError,
  RecipeNotFoundError,
  RecipeWithoutLinesError,
  ValidationError,
} from './errors';
import { updateOrderSchema } from './order-input';
import { buildRequirement } from './order-requirement';
import type { OrderScope } from './order-scope';
import { assertTransition } from './order-transitions';
import { resolveIngredientsCost } from './resolve-ingredients-cost';

import type { PresentationCatalog, ProductCatalog } from '@/lib/modules/inventario';
import type { RecipeCatalog } from '@/lib/modules/recetas';
import type { UnitCatalog } from '@/lib/modules/unidades';

import type { OrderUnitOfWork } from '../ports/order-unit-of-work';
import type { OrderRepository } from '../ports/order-repository';

/** Recupera `products` y `units` porque cada escritura recalcula el coste de los ingredientes:
 *  hace falta leer los lotes disponibles y convertir entre la unidad de la receta y la del
 *  lote. `orders` sigue siendo `OrderRepository`: solo lee la fila previa. La escritura y el
 *  apartado viven en `unitOfWork`. */
export type UpdateOrderDeps = {
  readonly orders: OrderRepository;
  readonly recipes: RecipeCatalog;
  readonly products: ProductCatalog;
  readonly units: UnitCatalog;
  /** Ver el comentario identico de `create-order.ts` sobre por que no se le pasa al coste. */
  readonly presentations: PresentationCatalog;
  readonly unitOfWork: OrderUnitOfWork;
  /** Ver el comentario identico de `create-order.ts` sobre el origen de este reloj. */
  readonly now?: () => Date;
};

/**
 * Edicion de pedido.
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
 *
 * La transicion se comprueba DOS VECES: aqui, sobre la lectura previa, para fallar rapido sin
 * abrir la transaccion; y otra vez dentro de `unitOfWork.run`, sobre la fila que acaba de
 * bloquear `lockAliveById`, porque otra operacion pudo moverla entre las dos lecturas.
 *
 * Si el destino es `ENTREGADO`, la misma operacion recalcula lo apartado con los datos nuevos
 * y consume el resultado: `insufficient` se traduce a `InsufficientMaterialError` y
 * `nothing_to_consume` a `RecipeWithoutLinesError`. Cualquiera de las dos deshace la
 * transaccion entera -el pedido y su reserva quedan como estaban- porque `unitOfWork.run`
 * propaga la excepcion.
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

    // La empresa sale del ACTOR y jamas de la entrada: nadie puede elegir consultar otra.
    const scope: OrderScope = { companyId: actor.companyId };

    const parsed = updateOrderSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const data = parsed.data;

    // R33: no existe y ya esta borrado son el mismo caso. La comprobacion de estado se hace
    // sobre la fila que se acaba de leer y NO en el `where` del `UPDATE` (`design.md > 7.4`):
    // si viviera en el `where`, «no existe» y «esta entregado» devolverian lo mismo y el
    // usuario recibiria `not_found` ante un pedido que esta viendo en pantalla.
    const row = await deps.orders.findAliveById(id, scope);
    if (row === null) throw new OrderNotFoundError();

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
      const [recipe] = await deps.recipes.findRefsIncludingDeleted([data.recipeId], actor.companyId);
      if (recipe === undefined || recipe.isDeleted) throw new RecipeNotFoundError();
    }

    // La presentacion se comprueba SIEMPRE, cambie o no -es una consulta de un id y evita una
    // rama «si cambio» que habria que probar aparte. Con un pedido viejo sin presentacion,
    // `row.presentationId` es `null` y la entrada trae una: la comprobacion es la misma.
    const [presentation] = await deps.presentations.findRefs([data.presentationId], actor.companyId);
    if (presentation === undefined) throw new PresentationNotFoundError();

    // El coste se recalcula con la receta del DATO ENTRANTE, no con la de la fila vieja: una
    // edicion que solo cambia la cantidad o la prioridad tambien reescribe el importe con los
    // lotes de HOY.
    const ingredientsCost = await resolveIngredientsCost(
      deps.recipes,
      deps.products,
      deps.units,
      data.recipeId,
      data.quantity,
      actor.companyId,
    );

    const instant = now();

    // La necesidad se calcula con la receta del DATO ENTRANTE y NUNCA modifica lo apartado por
    // otro pedido que use la misma receta -`buildRequirement` es dominio puro sobre las lineas
    // de ESTA receta, y `syncForOrder` solo toca el libro de ESTE pedido.
    const content = await deps.recipes.findExecutionContentById(data.recipeId, actor.companyId);
    const requirement = buildRequirement(content?.lines ?? [], data.quantity);

    await deps.unitOfWork.run(async (transaction) => {
      const locked = await transaction.orders.lockAliveById(id, scope);
      if (locked === null) throw new OrderNotFoundError();

      // Repetida sobre la fila BLOQUEADA: otra operacion pudo moverla entre la lectura de
      // arriba y este bloqueo.
      assertTransition(locked.status, data.status);

      const result = await transaction.orders.updateAlive(id, data, actor.id, instant, ingredientsCost, scope);
      if (result === 'not_found') throw new OrderNotFoundError();

      if (data.status === 'ENTREGADO') {
        // Recalcula primero lo apartado con los datos nuevos y consume el resultado.
        await transaction.reservations.syncForOrder({
          orderId: id,
          companyId: actor.companyId,
          requirement,
          actorId: actor.id,
          now: instant,
        });

        const outcome = await transaction.reservations.consumeForOrder({
          orderId: id,
          companyId: actor.companyId,
          fallbackRequirement: requirement,
          actorId: actor.id,
          now: instant,
        });

        if (outcome.kind === 'insufficient') throw new InsufficientMaterialError();
        if (outcome.kind === 'nothing_to_consume') throw new RecipeWithoutLinesError();

        await transaction.orders.setReservedAt(id, null, scope);
      } else {
        const outcome = await transaction.reservations.syncForOrder({
          orderId: id,
          companyId: actor.companyId,
          requirement,
          actorId: actor.id,
          now: instant,
        });

        await transaction.orders.setReservedAt(
          id,
          outcome.kind === 'reserved' ? instant : null,
          scope,
        );
      }
    });
  };
}
