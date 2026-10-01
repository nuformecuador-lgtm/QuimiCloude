// lib/modules/pedidos/domain/transition-order.ts
//
// Implementa `OrderCatalog['transitionAliveById']` (`order-catalog.ts`) sobre la unidad de
// trabajo compartida con `inventario`: mueve el estado del pedido y, si el destino es
// `POR_EMPACAR`, consume el material apartado -en la MISMA transaccion-. `EN_EMPAQUE` y
// `ENTREGADO` no son destino de este metodo: solo los alcanzan los dos metodos de empaque, que
// conocen a quien empaca. `asignaciones` solo conoce la firma del puerto, nunca este archivo.
//
// Finalizar (`EN_CURSO -> POR_EMPACAR`) YA NO da de alta ningun lote de
// producto terminado -eso se traslada a Terminar el empaque, una vez por linea del reparto- ni
// exige presentacion ni receta viva: solo consume el material apartado, exactamente como antes
// de que Finalizar diera de alta el lote de producto terminado.

import { InsufficientMaterialError, InvalidTransitionError, RecipeWithoutLinesError } from './errors';
import { buildRequirement } from './order-requirement';
import { assertTransition } from './order-transitions';

import type { OrderStatus } from './order-classification';
import type { OrderCatalog } from './order-catalog';

import type { OrderUnitOfWork } from '../ports/order-unit-of-work';

export type TransitionOrderDeps = {
  readonly unitOfWork: OrderUnitOfWork;
};

/** Se lanza dentro de la unidad de trabajo cuando `setStatus` ya consumio material pero no pudo
 *  mover el estado: deshace la transaccion y lleva el resultado real hacia fuera. */
class StatusChangeAfterConsumptionFailedError extends Error {
  constructor(readonly outcome: 'not_found' | 'stale') {
    super(`setStatus devolvio '${outcome}' tras consumir material`);
  }
}

/** Firma exacta de `OrderCatalog['transitionAliveById']`: es lo que `asignaciones` invoca sin
 *  saber que, por dentro, hay una transaccion con tres modulos. */
export function createTransitionOrder(deps: TransitionOrderDeps): OrderCatalog['transitionAliveById'] {
  return async function transitionAliveById(
    id: string,
    companyId: string,
    from: OrderStatus,
    to: OrderStatus,
    actorId: string,
    now: Date,
  ) {
    // Falla rapido, sin abrir transaccion, si el destino no es alcanzable desde el estado actual.
    assertTransition(from, to);
    // `EN_EMPAQUE` y `ENTREGADO` SI son destinos legales de la matriz (los usan Comenzar y
    // Terminar), pero este metodo no conoce a quien empaca: los rechaza igual que un destino
    // fuera de la matriz.
    if (to === 'EN_EMPAQUE' || to === 'ENTREGADO') {
      throw new InvalidTransitionError(`de ${from} a ${to}`);
    }

    try {
      return await deps.unitOfWork.run(async (scope) => {
        const locked = await scope.orders.lockAliveById(id, { companyId });
        if (locked === null) return 'not_found';
        // La fila sigue viva pero ya no esta en `from`: otra operacion la movio entre la
        // lectura de quien llama y este bloqueo.
        if (locked.status !== from) return 'stale';

        // Consume ANTES de mover el estado: si falta material o la receta no tiene lineas, la
        // excepcion deshace la transaccion entera y ni el estado ni `finishedAt` quedan escritos
        // -`finishedAt` no lo escribe este destino de todos modos, solo Terminar-. Ya
        // no hay presentacion, receta viva ni coste de lote que resolver aqui -eso es
        // de Terminar (T14)-, solo el consumo de siempre.
        if (to === 'POR_EMPACAR') {
          // Con el cliente de ESTA transaccion (`scope.recipes`), no con el lector global: pedir
          // una segunda conexion mientras esta retiene la suya es espera o error bajo carga.
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
          if (result !== 'ok') throw new StatusChangeAfterConsumptionFailedError(result);

          // El ciclo de reserva no cambia -el material ya se consumio arriba-,
          // solo se retira lo que colgaba aqui del alta de producto terminado.
          await scope.orders.setReservedAt(id, null, { companyId });
          return 'ok' as const;
        }

        return await scope.orders.setStatus(id, from, to, actorId, now, { companyId });
      });
    } catch (err) {
      if (err instanceof InsufficientMaterialError) return 'insufficient_material';
      if (err instanceof RecipeWithoutLinesError) return 'recipe_without_lines';
      if (err instanceof StatusChangeAfterConsumptionFailedError) return err.outcome;
      throw err;
    }
  };
}
