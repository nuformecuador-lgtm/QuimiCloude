// lib/modules/pedidos/domain/transition-order.ts
//
// Implementa `OrderCatalog['transitionAliveById']` (`order-catalog.ts`) sobre la unidad de
// trabajo compartida con `inventario`: mueve el estado del pedido y, si el destino es
// `ENTREGADO`, consume el material apartado en la MISMA transaccion. `asignaciones` solo
// conoce la firma del puerto, nunca este archivo.

import { InsufficientMaterialError, RecipeWithoutLinesError } from './errors';
import { buildRequirement } from './order-requirement';
import { assertTransition } from './order-transitions';

import type { OrderStatus } from './order-classification';
import type { OrderCatalog } from './order-catalog';

import type { OrderUnitOfWork } from '../ports/order-unit-of-work';

export type TransitionOrderDeps = {
  readonly unitOfWork: OrderUnitOfWork;
};

/** Firma exacta de `OrderCatalog['transitionAliveById']`: es lo que `asignaciones` invoca sin
 *  saber que, por dentro, hay una transaccion con dos modulos. */
export function createTransitionOrder(deps: TransitionOrderDeps): OrderCatalog['transitionAliveById'] {
  return async function transitionAliveById(
    id: string,
    companyId: string,
    from: OrderStatus,
    to: OrderStatus,
    actorId: string,
    now: Date,
  ) {
    // Falla rapido, sin abrir transaccion, igual que hacia `transitionAliveOrder`.
    assertTransition(from, to);

    try {
      return await deps.unitOfWork.run(async (scope) => {
        const locked = await scope.orders.lockAliveById(id, { companyId });
        if (locked === null) return 'not_found';
        // La fila sigue viva pero ya no esta en `from`: otra operacion la movio entre la
        // lectura de quien llama y este bloqueo.
        if (locked.status !== from) return 'stale';

        // Consume ANTES de mover el estado: si falta material o la receta no tiene lineas, la
        // excepcion deshace la transaccion entera y ni el estado ni `finishedAt` quedan escritos.
        if (to === 'ENTREGADO') {
          // Con el cliente de ESTA transaccion (`scope.recipes`), no con el lector global: una
          // segunda conexion mientras esta retiene la suya es lo que `design.md > 5.2.2` evita.
          const content = await scope.recipes.findExecutionContentById(locked.recipeId, companyId);
          const requirement = buildRequirement(content?.lines ?? [], locked.quantity);

          const outcome = await scope.reservations.consumeForOrder({
            orderId: id,
            companyId,
            fallbackRequirement: requirement,
            actorId,
            now,
          });

          if (outcome.kind === 'insufficient') throw new InsufficientMaterialError();
          if (outcome.kind === 'nothing_to_consume') throw new RecipeWithoutLinesError();

          const result = await scope.orders.setStatus(id, from, to, actorId, now, { companyId });
          if (result !== 'ok') return result;

          await scope.orders.setReservedAt(id, null, { companyId });
          return 'ok';
        }

        return await scope.orders.setStatus(id, from, to, actorId, now, { companyId });
      });
    } catch (err) {
      if (err instanceof InsufficientMaterialError) return 'insufficient_material';
      if (err instanceof RecipeWithoutLinesError) return 'recipe_without_lines';
      throw err;
    }
  };
}
