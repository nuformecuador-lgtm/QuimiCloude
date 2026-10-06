// lib/modules/asignaciones/domain/get-packing-order.ts
/**
 * La misma fila de `list-packing-orders.ts` para un unico pedido: la pantalla de empaque abre con
 * esto. `null` o cualquier estado distinto de `POR_EMPACAR`/`EN_EMPAQUE` es `order_not_found`,
 * igual que un pedido inexistente: esta consulta no revela que el pedido existe en otro estado.
 */
import { z } from 'zod';

import { requirePermission, type Actor } from './actor';
import { OrderNotFoundError, ValidationError } from './errors';
import { composePackingOrderRows, type PackingOrderDetail, type PackingOrderViewDeps } from './packing-order-view';

import type { OrderCatalog } from '@/lib/modules/pedidos';
import type { RecipePackingStepsReader } from '@/lib/modules/recetas';

const PACKING_STATUSES = ['POR_EMPACAR', 'EN_EMPAQUE'] as const;

const getPackingOrderSchema = z.strictObject({
  orderId: z.string().uuid(),
});

export type GetPackingOrderDeps = PackingOrderViewDeps & {
  readonly orders: OrderCatalog;
  readonly packingSteps: RecipePackingStepsReader;
};

export function createGetPackingOrder(
  deps: GetPackingOrderDeps,
): (actor: Actor | null | undefined, input: unknown) => Promise<PackingOrderDetail> {
  return async function getPackingOrder(
    actor: Actor | null | undefined,
    input: unknown,
  ): Promise<PackingOrderDetail> {
    // Autorizar va antes de validar la entrada y antes de tocar ningun puerto.
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

    // Antes de Comenzar, o si empaca otro, los pasos no salen ni en la respuesta.
    const packingSteps =
      summary.status === 'EN_EMPAQUE' && summary.packedBy === actor.id
        ? ((await deps.packingSteps.findPackingStepsById(summary.recipeId, actor.companyId)) ?? [])
        : [];

    return { ...row, packingSteps };
  };
}
