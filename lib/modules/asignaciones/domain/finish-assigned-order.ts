// lib/modules/asignaciones/domain/finish-assigned-order.ts
import { z } from 'zod';

import { requirePermission, type Actor } from './actor';
import {
  MaterialShortageError,
  NoWholePackageError,
  OrderNotFoundError,
  PresentationWithoutContentError,
  RecipeWithoutLinesError,
  ValidationError,
} from './errors';
import { assertOrderAcceptsWrites } from './order-state';

import type { OrderAssignmentRepository } from '../ports/order-assignment-repository';

import { formatOrderNumber, type OrderAssignmentTarget, type OrderCatalog } from '@/lib/modules/pedidos';

const finishAssignedOrderSchema = z.strictObject({
  orderId: z.string().uuid(),
});

export type FinishAssignedOrderDeps = {
  readonly assignments: OrderAssignmentRepository;
  readonly orders: OrderCatalog;
  readonly now?: () => Date;
};

export type FinishAssignedOrderResult = {
  readonly numberText: string;
  readonly packages: string;
  readonly productName: string;
};

/**
 * Deja el pedido en `ENTREGADO`. No recibe ni admite ningun dato de lo marcado: la entrada es
 * solo el identificador del pedido, y nada de lo recorrido en pantalla se persiste.
 *
 * Devuelve el numero visible del pedido para que la lista, al volver, pueda confirmar la
 * entrega, junto con los envases y el producto terminado que recibio el lote. Se lee
 * ANTES de transicionar: una vez `ENTREGADO`, el pedido ya no aparece entre los estados de
 * trabajo que consulta `listAliveSummariesByIds`.
 *
 * `transitionAliveById` consume el material y da de alta el lote de producto terminado por
 * dentro: `'insufficient_material'` se traduce a `MaterialShortageError`,
 * `'recipe_without_lines'` a `RecipeWithoutLinesError`, `'presentation_without_content'` a
 * `PresentationWithoutContentError` y `'no_whole_package'` a `NoWholePackageError`, las cuatro
 * propias de este modulo para que el adaptador driving las traduzca con su propio
 * `instanceof`.
 */
export function createFinishAssignedOrder(
  deps: FinishAssignedOrderDeps,
): (actor: Actor | null | undefined, input: unknown) => Promise<FinishAssignedOrderResult> {
  return async function finishAssignedOrder(
    actor: Actor | null | undefined,
    input: unknown,
  ): Promise<FinishAssignedOrderResult> {
    requirePermission(actor, 'asignaciones.consultar');

    const parsed = finishAssignedOrderSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const { orderId } = parsed.data;

    const ids = await deps.assignments.listOrderIdsByUserInCompany(actor.companyId, actor.id);
    if (!ids.includes(orderId)) throw new OrderNotFoundError();

    let order: OrderAssignmentTarget | null = await deps.orders.findAliveById(
      orderId,
      actor.companyId,
    );
    if (order === null) throw new OrderNotFoundError();
    if (order.status === 'ENTREGADO' || order.status === 'CANCELADO') {
      assertOrderAcceptsWrites(order);
    }

    const summaryPage = await deps.orders.listAliveSummariesByIds(
      actor.companyId,
      [orderId],
      [order.status],
      1,
      1,
    );
    const summary = summaryPage.items[0];
    if (summary === undefined) throw new OrderNotFoundError();
    const numberText = formatOrderNumber(summary.number);

    const now = deps.now?.() ?? new Date();
    for (;;) {
      const result = await deps.orders.transitionAliveById(
        orderId,
        actor.companyId,
        order.status,
        'ENTREGADO',
        actor.id,
        now,
      );
      if (typeof result === 'object') {
        const { productName, packages } = result.finishedGoods;
        return { numberText, productName, packages };
      }
      if (result === 'not_found') throw new OrderNotFoundError();
      if (result === 'insufficient_material') throw new MaterialShortageError();
      if (result === 'recipe_without_lines') throw new RecipeWithoutLinesError();
      if (result === 'presentation_without_content') throw new PresentationWithoutContentError();
      if (result === 'no_whole_package') throw new NoWholePackageError();
      // 'stale': alguien lo movio entre la lectura y esta llamada. Se relee y se reintenta
      // contra el estado real. ('ok' en cadena no ocurre aqui: el destino siempre es
      // `ENTREGADO`, que solo devuelve el `'ok'` con `finishedGoods`.)
      order = await deps.orders.findAliveById(orderId, actor.companyId);
      if (order === null) throw new OrderNotFoundError();
      if (order.status === 'ENTREGADO' || order.status === 'CANCELADO') {
        assertOrderAcceptsWrites(order);
      }
    }
  };
}
