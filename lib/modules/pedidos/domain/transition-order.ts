// lib/modules/pedidos/domain/transition-order.ts
//
// Implementa `OrderCatalog['transitionAliveById']` (`order-catalog.ts`) sobre la unidad de
// trabajo compartida con `inventario`: mueve el estado del pedido y, si el destino es
// `ENTREGADO`, consume el material apartado y da de alta el lote de producto terminado de su
// combinacion (QC-150), todo en la MISMA transaccion. `asignaciones` solo conoce la firma del
// puerto, nunca este archivo.

import { InsufficientMaterialError, NoWholePackageError, PresentationWithoutContentError, RecipeWithoutLinesError } from './errors';
import { buildRequirement } from './order-requirement';
import { assertTransition } from './order-transitions';
import { resolveLotIngredientsCost } from './resolve-ingredients-cost';

import type { OrderStatus } from './order-classification';
import type { OrderCatalog } from './order-catalog';

import type { OrderUnitOfWork } from '../ports/order-unit-of-work';

import type { ProductCatalog } from '@/lib/modules/inventario';
import type { RecipeCatalog } from '@/lib/modules/recetas';
import type { UnitCatalog } from '@/lib/modules/unidades';

export type TransitionOrderDeps = {
  readonly unitOfWork: OrderUnitOfWork;
  /** Nombre de la receta (R11) y coste del lote cuando el pedido no tiene importe guardado
   *  (R42): las dos lecturas van por los catalogos publicos, sobre el cliente global -la misma
   *  foto que veria una edicion en ese instante-, nunca sobre `scope.recipes`, que solo sirve
   *  el contenido de ejecucion dentro de la transaccion. */
  readonly recipes: RecipeCatalog;
  readonly products: ProductCatalog;
  readonly units: UnitCatalog;
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
          // Sin presentacion no hay combinacion que dar de alta (R18): se rechaza antes de
          // tocar el apartado. Un pedido CON presentacion pero sin contenido -ni copiado ni
          // vigente- lo rechaza mas abajo `finishedGoods.receiveFromOrder` (D20, R44).
          if (locked.presentationId === null) throw new PresentationWithoutContentError();

          // Coste del lote (R42, D21), ANTES de consumir: el importe guardado se usa tal cual,
          // y solo se recalcula si es nulo. Despues de consumir, los lotes ya habrian bajado.
          const lotCost =
            locked.ingredientsCost !== null
              ? locked.ingredientsCost
              : await resolveLotIngredientsCost(
                  deps.recipes,
                  deps.products,
                  deps.units,
                  locked.recipeId,
                  locked.quantity,
                  companyId,
                  { orderId: id },
                );

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

          const [recipeRef] = await deps.recipes.findRefsIncludingDeleted([locked.recipeId], companyId);
          const finishedGoodsOutcome = await scope.finishedGoods.receiveFromOrder({
            orderId: id,
            companyId,
            recipeId: locked.recipeId,
            recipeName: recipeRef?.name ?? '',
            presentationId: locked.presentationId,
            orderQuantity: locked.quantity,
            orderContent: locked.presentationContent,
            lotCost,
            actorId,
            now,
          });

          if (finishedGoodsOutcome.kind === 'presentation_without_content') {
            throw new PresentationWithoutContentError();
          }
          if (finishedGoodsOutcome.kind === 'no_whole_package') {
            throw new NoWholePackageError();
          }

          await scope.orders.setReservedAt(id, null, { companyId });
          return {
            kind: 'ok' as const,
            finishedGoods: {
              productName: finishedGoodsOutcome.productName,
              packages: finishedGoodsOutcome.packages,
            },
          };
        }

        return await scope.orders.setStatus(id, from, to, actorId, now, { companyId });
      });
    } catch (err) {
      if (err instanceof InsufficientMaterialError) return 'insufficient_material';
      if (err instanceof RecipeWithoutLinesError) return 'recipe_without_lines';
      if (err instanceof PresentationWithoutContentError) return 'presentation_without_content';
      if (err instanceof NoWholePackageError) return 'no_whole_package';
      if (err instanceof StatusChangeAfterConsumptionFailedError) return err.outcome;
      throw err;
    }
  };
}
