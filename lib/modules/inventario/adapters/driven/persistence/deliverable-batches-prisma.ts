import { prisma } from '@/lib/shared/db/prisma';

import { wholePackagesIn } from '../../../domain/finished-goods-dispatch';
import { PRODUCT_TYPES } from '../../../domain/product-type';

import { batchCompanyScope, productCompanyScope } from './company-scope';

import type { DeliverableBatch } from '../../../domain/finished-goods-dispatch';
import type { InventoryScope } from '../../../domain/inventory-scope';

/** `YYYY-MM-DD` de una columna `DATE`: Prisma la entrega como medianoche UTC. */
function toCivilDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * La consulta real. Vive aparte de `findDeliverableBatches` por el mismo motivo que
 * `findProductionMovements`: declara el `scope` como `InventoryScope` y lo lleva hasta las
 * envolturas del punto unico, en las DOS tablas.
 */
async function findBatchesWithStock(
  recipeId: string,
  presentationIds: readonly string[],
  scope: InventoryScope,
): Promise<readonly DeliverableBatch[]> {
  const rows = await prisma.productBatch.findMany({
    where: {
      AND: [
        batchCompanyScope(scope),
        {
          stock: { gt: 0 },
          packageContent: { not: null },
          product: {
            AND: [
              productCompanyScope(scope),
              {
                type: PRODUCT_TYPES.FINISHED_PRODUCT,
                deletedAt: null,
                recipeId,
                presentationId: { in: [...presentationIds] },
              },
            ],
          },
        },
      ],
    },
    orderBy: [{ purchaseDate: 'asc' }, { lot: 'asc' }],
    select: {
      id: true,
      lot: true,
      purchaseDate: true,
      expiryDate: true,
      stock: true,
      packageContent: true,
      product: { select: { presentationId: true } },
    },
  });

  const batches: DeliverableBatch[] = [];
  for (const row of rows) {
    const presentationId = row.product.presentationId;
    if (row.packageContent === null || presentationId === null) continue;
    const packageContent = row.packageContent.toFixed(4);
    const availablePackages = wholePackagesIn(row.stock.toFixed(4), packageContent);
    if (availablePackages < 1) continue;
    batches.push({
      batchId: row.id,
      presentationId,
      lot: row.lot,
      purchaseDate: toCivilDate(row.purchaseDate),
      expiryDate: row.expiryDate === null ? null : toCivilDate(row.expiryDate),
      packageContent,
      availablePackages,
    });
  }
  return batches;
}

/**
 * Implementa `FinishedBatchCatalog['findDeliverableBatches']`: los lotes de producto terminado de
 * una receta en las presentaciones pedidas que tienen al menos un envase entero, por fecha de
 * entrada y luego por lote. Lectura fuera de transaccion; la existencia definitiva la comprueba la
 * salida con el producto bloqueado.
 *
 * No exige permiso: quien llama ya autorizo con el suyo, igual que `findFinishedGoodsReceipts`.
 */
export async function findDeliverableBatches(
  recipeId: string,
  presentationIds: readonly string[],
  companyId: string,
): Promise<readonly DeliverableBatch[]> {
  if (presentationIds.length === 0) return [];
  return findBatchesWithStock(recipeId, presentationIds, { companyId });
}
