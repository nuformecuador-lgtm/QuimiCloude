// lib/modules/asignaciones/domain/finish-packing.ts
/**
 * Terminar: `EN_EMPAQUE -> ENTREGADO`, con `finished_at` en la misma escritura que el cambio de
 * estado, solo si el actor es quien tiene el pedido en empaque. Sin comprobacion de asignacion:
 * cualquier actor con `empaque.modificar` puede terminar cualquier pedido vivo de su empresa, y
 * sin ningun puerto de inventario: el material ya se consumio al iniciar la produccion.
 *
 * Devuelve el numero visible del pedido, leido ANTES de la transicion: una vez `ENTREGADO`, el
 * filtro de estado con el que se leyo ya no lo encontraria (mismo motivo que
 * `finish-assigned-order.ts`).
 */
import { z } from 'zod';

import { requirePermission, type Actor } from './actor';
import {
  OrderNotFoundError,
  OrderNotPackableError,
  OrderPackingTakenError,
  PresentationWithoutContentError,
  RecipeNotFoundError,
  ValidationError,
} from './errors';

import { formatOrderNumber, type OrderAssignmentTarget, type OrderCatalog } from '@/lib/modules/pedidos';

const finishPackingSchema = z.strictObject({
  orderId: z.string().uuid(),
});

export type FinishPackingDeps = {
  readonly orders: OrderCatalog;
  readonly now?: () => Date;
};

export type FinishPackingResult = {
  readonly numberText: string;
};

export function createFinishPacking(
  deps: FinishPackingDeps,
): (actor: Actor | null | undefined, input: unknown) => Promise<FinishPackingResult> {
  return async function finishPacking(
    actor: Actor | null | undefined,
    input: unknown,
  ): Promise<FinishPackingResult> {
    // Autorizar va antes de validar la entrada y antes de tocar ningun puerto.
    requirePermission(actor, 'empaque.modificar');

    const parsed = finishPackingSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const { orderId } = parsed.data;

    const target: OrderAssignmentTarget | null = await deps.orders.findAliveById(orderId, actor.companyId);
    if (target === null) throw new OrderNotFoundError();

    const summaryPage = await deps.orders.listAliveSummariesByIds(
      actor.companyId,
      [orderId],
      [target.status],
      1,
      1,
    );
    const summary = summaryPage.items[0];
    if (summary === undefined) throw new OrderNotFoundError();
    const numberText = formatOrderNumber(summary.number);

    const now = deps.now?.() ?? new Date();
    const result = await deps.orders.finishPackingAliveById(orderId, actor.companyId, actor.id, now);

    // R17-R21: el `'ok'` de Terminar trae el lote por linea del reparto; esta pantalla solo
    // confirma el numero del pedido, asi que no hace falta devolverlo mas alla de este metodo.
    if (typeof result === 'object') return { numberText };
    if (result === 'not_packer') throw new OrderPackingTakenError();
    if (result === 'not_packable') throw new OrderNotPackableError();
    if (result === 'recipe_not_found') throw new RecipeNotFoundError();
    if (result === 'presentation_without_content') throw new PresentationWithoutContentError();
    throw new OrderNotFoundError(); // 'not_found'
  };
}
