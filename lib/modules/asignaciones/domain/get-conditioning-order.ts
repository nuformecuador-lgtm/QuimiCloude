// lib/modules/asignaciones/domain/get-conditioning-order.ts
/**
 * El detalle del acondicionador: la misma fila de «Por acondicionar» para un unico pedido. Abre un
 * `POR_ACONDICIONAR` o `EN_ACONDICIONAMIENTO` de la empresa, lo acondicione quien lo acondicione, y
 * un `TERMINADO` solo si lo acondiciono el actor. Todo lo demas es `order_not_found`, el mismo error
 * que un pedido inexistente, para no revelar que existe en otro estado o de otra persona.
 */
import { z } from 'zod';

import { requirePermission, type Actor } from './actor';
import { composeConditioningOrderRows, type ConditioningOrderRow } from './conditioning-order-view';
import { OrderNotFoundError, ValidationError } from './errors';

import type { ComposeOrderRowsDeps } from './compose-order-rows';

import type { OrderCatalog } from '@/lib/modules/pedidos';

const DETAIL_STATUSES = ['POR_ACONDICIONAR', 'EN_ACONDICIONAMIENTO', 'TERMINADO'] as const;

const getConditioningOrderSchema = z.strictObject({
  orderId: z.string().uuid(),
});

export type GetConditioningOrderDeps = ComposeOrderRowsDeps & {
  readonly orders: OrderCatalog;
};

export function createGetConditioningOrder(
  deps: GetConditioningOrderDeps,
): (actor: Actor | null | undefined, input: unknown) => Promise<ConditioningOrderRow> {
  return async function getConditioningOrder(
    actor: Actor | null | undefined,
    input: unknown,
  ): Promise<ConditioningOrderRow> {
    // Autorizar va antes de validar la entrada y antes de tocar ningun puerto.
    requirePermission(actor, 'acondicionamiento.modificar');

    const parsed = getConditioningOrderSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const { orderId } = parsed.data;

    const summaryPage = await deps.orders.listAliveSummariesByIds(actor.companyId, [orderId], DETAIL_STATUSES, 1, 1);
    const summary = summaryPage.items[0];
    if (summary === undefined) throw new OrderNotFoundError();
    if (summary.status === 'TERMINADO' && summary.conditionedBy !== actor.id) throw new OrderNotFoundError();

    const [row] = await composeConditioningOrderRows(deps, actor.companyId, [summary]);
    if (row === undefined) throw new OrderNotFoundError();
    return row;
  };
}
