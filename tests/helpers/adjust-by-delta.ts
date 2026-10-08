// Los tests de otras fichas ajustaban un lote por diferencia con signo; el puerto ahora pide el
// total contado y la existencia vista. Estas dos funciones leen la existencia del lote dentro del
// ambito y derivan los dos datos, para que esos tests sigan diciendo lo que median sin reescribir
// cada llamada. Leer antes no cambia lo que comprueban: ninguno compite con otro ajuste del mismo
// lote. Un lote invisible en el ambito se lee como existencia cero: el puerto lo rechaza igual.

import { adjustBatchStock } from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import { addQuantities } from '@/lib/modules/inventario/domain/decimal-quantity';
import { prisma } from '@/lib/shared/db/prisma';

import type { InventoryScope } from '@/lib/modules/inventario/domain/inventory-scope';
import type { MovementReason } from '@/lib/modules/inventario/domain/movement-reason';
import type { AdjustBatchStockOutcome } from '@/lib/modules/inventario/domain/stock-adjustment';

/** `countedStock` puede salir negativo: asi llega a la base el ajuste que su `CHECK` rechaza. */
export async function countFromDelta(
  batchId: string,
  delta: string,
  scope: InventoryScope,
): Promise<{ readonly seenStock: string; readonly countedStock: string }> {
  const lote = await prisma.productBatch.findFirst({
    where: { id: batchId, companyId: scope.companyId },
    select: { stock: true },
  });
  const seenStock = lote === null ? '0.0000' : lote.stock.toFixed(4);
  return { seenStock, countedStock: addQuantities(seenStock, delta) };
}

export async function adjustByDelta(
  batchId: string,
  delta: string,
  reason: MovementReason,
  actorId: string,
  now: Date,
  scope: InventoryScope,
): Promise<AdjustBatchStockOutcome> {
  const { seenStock, countedStock } = await countFromDelta(batchId, delta, scope);
  return adjustBatchStock({ batchId, seenStock, countedStock, reason }, actorId, now, scope);
}
