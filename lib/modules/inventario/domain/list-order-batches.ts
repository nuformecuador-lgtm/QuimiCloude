import { z } from 'zod';

import { requirePermission, type Actor } from './actor';
import { ValidationError } from './errors';

import type { ProductBatchView } from './product-batch-view';
import type { FinishedOrderRepository } from '../ports/finished-order-repository';

export type ListOrderBatchesDeps = {
  readonly finishedOrders: FinishedOrderRepository;
};

const orderIdSchema = z.string().uuid().nullable();
const productIdSchema = z.string().uuid().nullable();

/**
 * Los lotes de producto terminado que entraron por un pedido, para el panel de lotes de la fila
 * de ese pedido. Mismo permiso que los lotes de un producto; el pedido ajeno y el inexistente
 * vuelven los dos como lista vacia. Con `productId`, solo los de ese producto; con `orderId`
 * `null`, los lotes sin pedido de `productId`, que entonces es obligatorio.
 */
export function createListOrderBatches(
  deps: ListOrderBatchesDeps,
): (
  orderId: unknown,
  actor: Actor | null | undefined,
  productId?: unknown,
) => Promise<readonly ProductBatchView[]> {
  return async function listOrderBatches(
    orderId: unknown,
    actor: Actor | null | undefined,
    productId: unknown = null,
  ): Promise<readonly ProductBatchView[]> {
    requirePermission(actor, 'inventario.consultar');

    const parsedOrder = orderIdSchema.safeParse(orderId);
    const parsedProduct = productIdSchema.safeParse(productId);
    if (!parsedOrder.success || !parsedProduct.success) throw new ValidationError();
    if (parsedOrder.data === null && parsedProduct.data === null) throw new ValidationError();

    return deps.finishedOrders.findBatchesOfOrder(
      parsedOrder.data,
      { companyId: actor.companyId },
      parsedProduct.data,
    );
  };
}
