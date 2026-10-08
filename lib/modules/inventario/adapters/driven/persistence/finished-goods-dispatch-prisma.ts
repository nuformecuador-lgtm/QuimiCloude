import { dispatchFinishedGoods } from './product-prisma';

import type { Prisma } from '@prisma/client';

import type { FinishedGoodsDispatch, FinishedGoodsDispatchOutcome } from '../../../domain/finished-goods-dispatch';
import type { InventoryScope } from '../../../domain/inventory-scope';

/**
 * `FinishedGoodsDispatch` sobre el cliente transaccional de quien llama, con el mismo molde que
 * `createFinishedGoodsIntake`: `pedidos` cablea esta fabrica dentro de su unidad de trabajo
 * compartida, asi que la salida, la entrega y el estado del pedido confirman o se deshacen juntos.
 */
export function createFinishedGoodsDispatch(tx: Prisma.TransactionClient): FinishedGoodsDispatch {
  return {
    async dispatchForDelivery(input): Promise<FinishedGoodsDispatchOutcome> {
      const scope: InventoryScope = { companyId: input.companyId };

      return dispatchFinishedGoods(
        tx,
        {
          orderId: input.orderId,
          orderDeliveryId: input.orderDeliveryId,
          recipeId: input.recipeId,
          presentationId: input.presentationId,
          allocations: input.allocations,
          actorId: input.actorId,
          now: input.now,
        },
        scope,
      );
    },
  };
}
