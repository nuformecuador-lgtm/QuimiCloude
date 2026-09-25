import { receiveFinishedGoods } from './product-prisma';

import type { Prisma } from '@prisma/client';

import type { FinishedGoodsIntake, FinishedGoodsOutcome } from '../../../domain/finished-goods';
import type { InventoryScope } from '../../../domain/inventory-scope';

/**
 * `FinishedGoodsIntake` sobre el cliente transaccional de quien llama: `pedidos` cablea esta
 * fabrica dentro de su unidad de trabajo compartida, igual que `createMaterialReservations`.
 */
export function createFinishedGoodsIntake(tx: Prisma.TransactionClient): FinishedGoodsIntake {
  return {
    async receiveFromOrder(input): Promise<FinishedGoodsOutcome> {
      const scope: InventoryScope = { companyId: input.companyId };

      return receiveFinishedGoods(
        tx,
        {
          orderId: input.orderId,
          recipeId: input.recipeId,
          recipeName: input.recipeName,
          presentationId: input.presentationId,
          orderQuantity: input.orderQuantity,
          orderContent: input.orderContent,
          lotCost: input.lotCost,
          actorId: input.actorId,
          now: input.now,
        },
        scope,
      );
    },
  };
}
