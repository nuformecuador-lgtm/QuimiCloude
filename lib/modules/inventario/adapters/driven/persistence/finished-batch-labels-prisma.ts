import { prisma } from '@/lib/shared/db/prisma';

import { batchCompanyScope, movementCompanyScope } from './company-scope';
import { isDuplicateBatchLot, writeFinishedBatchLabels } from './product-prisma';

import type {
  FinishedBatchLabels,
  FinishedBatchLabelsOutcome,
  FinishedBatchOfOrderLine,
} from '../../../domain/finished-batch-labels';
import type { InventoryScope } from '../../../domain/inventory-scope';

/** Fecha civil de una columna `@db.Date`: el instante llega a medianoche UTC. */
function toCivilDate(date: Date | null): string | null {
  return date === null ? null : date.toISOString().slice(0, 10);
}

/** El ambito va en el asiento y en el lote, como en `findBatchesOfOrder`. */
async function findFinishedBatchesOfOrder(
  orderId: string,
  scope: InventoryScope,
): Promise<readonly FinishedBatchOfOrderLine[]> {
  const rows = await prisma.inventoryMovement.findMany({
    where: {
      AND: [movementCompanyScope(scope), { orderId, kind: 'production', batch: batchCompanyScope(scope) }],
    },
    select: {
      orderPresentationLineId: true,
      batch: {
        select: { id: true, presentationId: true, lot: true, expiryDate: true, productionDate: true },
      },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  return rows.flatMap((row) =>
    row.orderPresentationLineId === null || row.batch.presentationId === null
      ? []
      : [
          {
            batchId: row.batch.id,
            orderPresentationLineId: row.orderPresentationLineId,
            presentationId: row.batch.presentationId,
            lot: row.batch.lot,
            expiryDate: toCivilDate(row.batch.expiryDate),
            productionDate: toCivilDate(row.batch.productionDate),
          },
        ],
  );
}

/** `FinishedBatchLabels` sobre el cliente global: cada escritura abre su propia transaccion. */
export function createFinishedBatchLabels(): FinishedBatchLabels {
  return {
    listOfOrder(companyId, orderId): Promise<readonly FinishedBatchOfOrderLine[]> {
      return findFinishedBatchesOfOrder(orderId, { companyId });
    },

    async writeForOrder(input): Promise<FinishedBatchLabelsOutcome> {
      const scope: InventoryScope = { companyId: input.companyId };
      try {
        return await prisma.$transaction((tx) =>
          writeFinishedBatchLabels(
            tx,
            { orderId: input.orderId, labels: input.labels, actorId: input.actorId, now: input.now },
            scope,
          ),
        );
      } catch (error) {
        if (isDuplicateBatchLot(error)) return { kind: 'duplicate_lot', batchId: null };
        throw error;
      }
    },
  };
}
