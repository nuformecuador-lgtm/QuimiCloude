// lib/modules/pedidos/domain/update-order-presentation-lines.ts
//
// Edicion ACOTADA del reparto y la unidad del pedido, aparte de `updateOrder`:
// se permite tocar reparto y unidad hasta Comenzar empaque, `POR_EMPACAR` incluido,
// donde `updateOrder` no deja tocar nada (`ALLOWED.POR_EMPACAR` sin «quedarse
// igual»). Por eso este caso de uso NO pasa por `assertTransition`: `REPARTO_EDITABLE_STATUSES`
// es su propia ventana de estados, deliberadamente distinta de la matriz de transiciones.
//
// La AUTORIZACION (`pedidos.modificar`) la comprueba QUIEN LLAMA
// (`updateOrderDistributionAction`), no este caso de uso —mismo criterio que
// `finishAssignedOrder` con `startAssignedOrder`—: solo hay un llamador.
//
// Corre en la unidad de trabajo compartida con `inventario`: el reparto nombra envases y lo
// apartado tiene que seguirlo. Nunca toca `quantity` ni la receta, pero si el importe, que
// incluye los envases.

import type { Actor } from './actor';
import { InsufficientMaterialError, OrderNotFoundError, OrderWouldBlockError } from './errors';
import { ingredientsPartOf, storedOrderCost, type PackagingCostLine, type StoredOrderCost } from './order-cost';
import { validateDistribution } from './order-distribution';
import type { OrderStatus } from './order-classification';
import { buildOrderRequirement, packagingLinesOf } from './order-requirement';
import type { OrderScope } from './order-scope';
import { resolvePackagingCost, resolveStoredOrderCost, type OrderCostCatalogs } from './resolve-ingredients-cost';
import {
  resolveDistributionLines,
  type DistributionCatalogs,
  type DistributionLineInput,
} from './resolve-distribution';

import type { OrderUnitOfWork } from '../ports/order-unit-of-work';
import type { LockedOrderRow, OrderWriteRepository } from '../ports/order-write-repository';

/**
 * El reparto y la unidad se pueden editar hasta Comenzar empaque. `'BLOQUEADO'` entra porque el
 * bloqueo es por material y editar el reparto puede resolverlo.
 */
export const REPARTO_EDITABLE_STATUSES: readonly OrderStatus[] = [
  'PENDIENTE',
  'EN_CURSO',
  'POR_EMPACAR',
  'BLOQUEADO',
];

export type UpdateOrderPresentationLinesInput = {
  readonly unitId: string;
  readonly lines: readonly DistributionLineInput[];
  /** Permiso explicito para dejar el pedido bloqueado si un envase o material no alcanza. */
  readonly confirmBlocked?: boolean;
};

/**
 * Discriminado, NO lanzado: a diferencia de `createOrder`/`updateOrder`, que
 * dejan subir los errores de `resolveDistribution`, este caso de uso devuelve el resultado para
 * que quien llama lo traduzca a su codigo. El primer fallo aborta SIN escribir nada, ni la
 * unidad ni las lineas ni lo apartado. `invalid_lines`: dos lineas con la misma presentacion, o
 * una linea antigua que el pedido no tenia tal cual. `would_block`: falta disponible en un
 * pedido que se puede bloquear y no llego la confirmacion; `insufficient_material`: falta en uno
 * que no se puede bloquear.
 */
export type UpdateOrderPresentationLinesResult =
  | 'ok'
  | 'not_found'
  | 'not_editable'
  | 'unit_not_found'
  | 'without_unit'
  | 'presentation_not_found'
  | 'packaging_not_found'
  | 'invalid_lines'
  | 'presentation_without_content'
  | 'incompatible_units'
  | 'exceeds_quantity'
  | 'would_block'
  | 'insufficient_material';

export type UpdateOrderPresentationLinesDeps = DistributionCatalogs &
  Pick<OrderCostCatalogs, 'recipes' | 'products'> & {
  readonly unitOfWork: OrderUnitOfWork;
  /** Ver el comentario identico de `create-order.ts` sobre el origen de este reloj. */
  readonly now?: () => Date;
};

/** Con la receta ya consumida no hay aviso posible: no existe `POR_EMPACAR -> BLOQUEADO`. */
const BLOCKABLE_STATUSES: readonly OrderStatus[] = ['PENDIENTE', 'BLOQUEADO'];

export function createUpdateOrderPresentationLines(
  deps: UpdateOrderPresentationLinesDeps,
): (
  orderId: string,
  actor: Actor,
  input: UpdateOrderPresentationLinesInput,
) => Promise<UpdateOrderPresentationLinesResult> {
  const now = deps.now ?? (() => new Date());

  return async function updateOrderPresentationLines(orderId, actor, input) {
    const companyId = actor.companyId;
    const actorId = actor.id;
    const scope: OrderScope = { companyId };
    const instant = now();

    try {
      return await deps.unitOfWork.run(async (transaction): Promise<UpdateOrderPresentationLinesResult> => {
        // La fila se bloquea ANTES de leer o escribir nada mas, asi que Comenzar y este
        // guardado se serializan sobre la MISMA fila.
        const locked = await transaction.orders.lockAliveById(orderId, scope);
        if (locked === null) return 'not_found';

        if (!REPARTO_EDITABLE_STATUSES.includes(locked.status)) return 'not_editable';

        // Una linea antigua solo se conserva si llega igual que una de las que el pedido ya tiene.
        const resolution = await resolveDistributionLines(deps, companyId, input.unitId, input.lines, {
          savedLines: locked.presentationLines,
        });
        if (resolution.kind !== 'resolved') return resolution.kind;

        // El disponible o el primer fallo, con la CANTIDAD del pedido
        // ya bloqueado -este caso de uso no la cambia-.
        const result = validateDistribution(
          locked.quantity,
          resolution.orderUnit,
          resolution.lines.map((line) => line.distribution),
        );
        switch (result.kind) {
          case 'without_unit':
            return 'without_unit';
          case 'presentation_without_content':
            return 'presentation_without_content';
          case 'incompatible_units':
            return 'incompatible_units';
          case 'exceeds_quantity':
            return 'exceeds_quantity';
          case 'ok':
            break;
        }

        const writeLines = resolution.lines.map((line) => line.write);
        const outcome = await transaction.orders.updatePresentationLinesAlive(
          orderId,
          input.unitId,
          writeLines,
          actorId,
          instant,
          scope,
        );
        // La fila esta bloqueada desde `lockAliveById` en esta misma transaccion.
        if (outcome !== 'ok') return 'not_found';

        // En POR_EMPACAR la receta ya se consumio: solo quedan por apartar los envases.
        const materialsConsumed = locked.status === 'POR_EMPACAR';
        const content = materialsConsumed
          ? null
          : await transaction.recipes.findExecutionContentById(locked.recipeId, companyId);
        const packagingLines = packagingLinesOf(writeLines);
        const requirement = buildOrderRequirement({
          recipeLines: content?.lines ?? [],
          quantity: locked.quantity,
          packagingLines,
          phase: materialsConsumed ? 'materials_consumed' : 'before_consumption',
          units: { orderUnitId: null, orderUnit: null, bridge: null, productUnits: new Map() },
        });
        if (requirement.kind !== 'ok') throw new Error('updateOrderPresentationLines: necesidad no convertible sin tratar');

        const reservation = await transaction.reservations.syncForOrder({
          orderId,
          companyId,
          requirement: requirement.lines,
          actorId,
          now: instant,
        });

        if (reservation.kind === 'insufficient') {
          // Lanzar deshace las lineas, la unidad y lo apartado.
          if (!BLOCKABLE_STATUSES.includes(locked.status)) throw new InsufficientMaterialError();
          if (input.confirmBlocked !== true) throw new OrderWouldBlockError();
          if (locked.status !== 'BLOQUEADO') {
            await moveStatus(transaction.orders, orderId, locked.status, 'BLOQUEADO', actorId, instant, scope);
          }
          if (locked.ingredientsCost !== null) {
            await transaction.orders.setIngredientsCost(orderId, null, actorId, instant, scope);
          }
        } else {
          if (locked.status === 'BLOQUEADO') {
            await moveStatus(transaction.orders, orderId, 'BLOQUEADO', 'PENDIENTE', actorId, instant, scope);
          }
          // La receta y la cantidad salen de la fila bloqueada, asi que el importe se calcula aqui
          // y no antes de abrir la transaccion. Los catalogos leen lo ya confirmado, igual que la
          // cotizacion, y `orderId` cuenta lo apartado por este pedido como suyo.
          const cost = materialsConsumed
            ? await packedOrderCost(deps, locked, packagingLines, companyId, orderId)
            : await resolveStoredOrderCost(
                deps,
                locked.recipeId,
                locked.quantity,
                input.unitId,
                packagingLines,
                companyId,
                { orderId },
              );
          await transaction.orders.setIngredientsCost(orderId, cost, actorId, instant, scope);
        }

        await transaction.orders.setReservedAt(orderId, reservation.kind === 'reserved' ? instant : null, scope);
        return 'ok';
      });
    } catch (error) {
      if (error instanceof OrderWouldBlockError) return 'would_block';
      if (error instanceof InsufficientMaterialError) return 'insufficient_material';
      if (error instanceof OrderNotFoundError) return 'not_found';
      throw error;
    }
  };
}

/** Con la receta ya consumida sus ingredientes no tienen disponible que costear: se conserva la
 *  parte de ingredientes guardada y solo se recalculan los envases. Sin importe guardado, sin
 *  importe. */
async function packedOrderCost(
  deps: UpdateOrderPresentationLinesDeps,
  locked: LockedOrderRow,
  packagingLines: readonly PackagingCostLine[],
  companyId: string,
  orderId: string,
): Promise<StoredOrderCost | null> {
  if (locked.ingredientsCost === null || locked.packagingCost === null) return null;
  const ingredients = ingredientsPartOf({ total: locked.ingredientsCost, packaging: locked.packagingCost });
  if (ingredients === null) return null;
  const packaging = await resolvePackagingCost(deps.packaging, packagingLines, companyId, { orderId });
  return storedOrderCost(ingredients, packaging);
}

/** La fila ya esta bloqueada por `lockAliveById`: cualquier resultado distinto de `ok` es que el
 *  pedido dejo de existir para esta empresa. */
async function moveStatus(
  orders: OrderWriteRepository,
  id: string,
  from: OrderStatus,
  to: OrderStatus,
  actorId: string,
  now: Date,
  scope: OrderScope,
): Promise<void> {
  const result = await orders.setStatus(id, from, to, actorId, now, scope);
  if (result !== 'ok') throw new OrderNotFoundError();
}
