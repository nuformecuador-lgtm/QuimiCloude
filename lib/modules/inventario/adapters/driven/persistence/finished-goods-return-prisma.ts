import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';

import { batchCompanyScope } from './company-scope';
import { returnFinishedGoods } from './product-prisma';

import type {
  BatchLotDirectory,
  FinishedGoodsReturn,
  FinishedGoodsReturnOutcome,
} from '../../../domain/finished-goods-return';
import type { InventoryScope } from '../../../domain/inventory-scope';

/**
 * `FinishedGoodsReturn` sobre el cliente transaccional de quien llama, con el mismo molde que
 * `createFinishedGoodsDispatch`: la devolucion confirma o se deshace junto con la anulacion.
 */
export function createFinishedGoodsReturn(tx: Prisma.TransactionClient): FinishedGoodsReturn {
  return {
    async returnForDeliveryVoid(input): Promise<FinishedGoodsReturnOutcome> {
      const scope: InventoryScope = { companyId: input.companyId };

      return returnFinishedGoods(
        tx,
        {
          orderId: input.orderId,
          orderDeliveryVoidId: input.orderDeliveryVoidId,
          lines: input.lines,
          actorId: input.actorId,
          now: input.now,
        },
        scope,
      );
    },
  };
}

/** Sin filtrar por producto vivo: un lote entregado de un producto dado de baja tambien se muestra. */
export const batchLotDirectoryPrisma: BatchLotDirectory = {
  async findLots(batchIds, companyId): Promise<ReadonlyMap<string, string>> {
    if (batchIds.length === 0) return new Map();

    const rows = await prisma.productBatch.findMany({
      where: { AND: [batchCompanyScope({ companyId }), { id: { in: [...batchIds] } }] },
      select: { id: true, lot: true },
    });
    return new Map(rows.map((row) => [row.id, row.lot]));
  },
};
