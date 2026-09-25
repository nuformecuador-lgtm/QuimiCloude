// lib/modules/asignaciones/domain/get-packing-order.ts
/**
 * La misma fila de `list-packing-orders.ts` para un unico pedido: la pantalla de empaque abre con
 * esto. `null` o cualquier estado distinto de `POR_EMPACAR`/`EN_EMPAQUE` es `order_not_found`,
 * igual que un pedido inexistente (D2): esta consulta no revela que el pedido existe en otro
 * estado.
 */
import { z } from 'zod';

import { requirePermission, type Actor } from './actor';
import { OrderNotFoundError, ValidationError } from './errors';
import { composePackingOrderRows, type PackingOrderRow, type PackingOrderViewDeps } from './packing-order-view';

import type { OrderCatalog } from '@/lib/modules/pedidos';

const PACKING_STATUSES = ['POR_EMPACAR', 'EN_EMPAQUE'] as const;

const getPackingOrderSchema = z.strictObject({
  orderId: z.string().uuid(),
});

export type GetPackingOrderDeps = PackingOrderViewDeps & {
  readonly orders: OrderCatalog;
};

export function createGetPackingOrder(
  deps: GetPackingOrderDeps,
): (actor: Actor | null | undefined, input: unknown) => Promise<PackingOrderRow> {
  return async function getPackingOrder(
    actor: Actor | null | undefined,
    input: unknown,
  ): Promise<PackingOrderRow> {
    // R13: autorizar va antes de validar la entrada y antes de tocar ningun puerto.
    requirePermission(actor, 'empaque.modificar');

    const parsed = getPackingOrderSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const { orderId } = parsed.data;

    const summaryPage = await deps.orders.listAliveSummariesByIds(
      actor.companyId,
      [orderId],
      PACKING_STATUSES,
      1,
      1,
    );
    const summary = summaryPage.items[0];
    if (summary === undefined) throw new OrderNotFoundError();

    const [row] = await composePackingOrderRows(deps, actor.companyId, [summary]);
    if (row === undefined) throw new OrderNotFoundError();
    return row;
  };
}
