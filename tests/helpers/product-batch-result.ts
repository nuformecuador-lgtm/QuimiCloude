// QC-150 T10: `addBatchToAlive` y `adjustBatchStock` ganaron un resultado-sentinela
// ('finished_product' / 'increase_not_allowed', R28/R31). Los tests de otras fichas que ya
// sabian que su fixture no es un producto terminado siguen leyendo `.batchId`/`.stock` sin
// volver a comprobarlo caso por caso: estas dos funciones estrechan el tipo y fallan alto si
// alguna vez llegara el sentinela donde no se espera.

export function batchWritten<T extends { readonly batchId: string; readonly lot: string }>(
  result: T | null | 'finished_product',
): T {
  if (result === null || result === 'finished_product') {
    throw new Error(`se esperaba un lote escrito y llego ${String(result)}`);
  }
  return result;
}

export function stockAdjusted<
  T extends { readonly stock: string; readonly reserved: string; readonly overReserved: boolean },
>(result: T | null | 'increase_not_allowed'): T {
  if (result === null || result === 'increase_not_allowed') {
    throw new Error(`se esperaba un ajuste aplicado y llego ${String(result)}`);
  }
  return result;
}
