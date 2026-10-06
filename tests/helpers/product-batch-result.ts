// `addBatchToAlive` gano un resultado-sentinela ('finished_product') y `adjustBatchStock` devuelve
// un resultado con `kind`. Los tests de otras fichas que ya sabian que su fixture no es un producto
// terminado siguen leyendo `.batchId`/`.stock` sin volver a comprobarlo caso por caso: estas dos
// funciones estrechan el tipo y fallan alto si alguna vez llegara otra cosa.

import type { AdjustBatchStockOutcome } from '@/lib/modules/inventario/domain/stock-adjustment';

export function batchWritten<T extends { readonly batchId: string; readonly lot: string }>(
  result: T | null | 'finished_product',
): T {
  if (result === null || result === 'finished_product') {
    throw new Error(`se esperaba un lote escrito y llego ${String(result)}`);
  }
  return result;
}

export function stockAdjusted(
  result: AdjustBatchStockOutcome,
): Extract<AdjustBatchStockOutcome, { kind: 'adjusted' }> {
  if (result.kind !== 'adjusted') {
    throw new Error(`se esperaba un ajuste aplicado y llego ${result.kind}`);
  }
  return result;
}
