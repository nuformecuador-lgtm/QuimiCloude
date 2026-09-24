// lib/modules/inventario/domain/batch-order.ts
//
// Dominio PURO: el orden en que se recorren los lotes de un producto para apartar o para costear.
// Fecha de compra ascendente, desempatando por numero de lote -numerico si los dos son solo
// digitos, como texto en otro caso-, porque el correlativo que genera el backend no rellena con
// ceros y comparar como texto pondria '10' antes que '9'.

const DIGITS_ONLY_PATTERN = /^\d+$/;

/** Lo minimo que hace falta de un lote para ordenarlo: su fecha de compra y su numero. */
export type OrderableBatch = {
  readonly purchaseDate: string;
  readonly lot: string;
};

function compareLots(a: string, b: string): number {
  if (DIGITS_ONLY_PATTERN.test(a) && DIGITS_ONLY_PATTERN.test(b)) {
    const numericA = BigInt(a);
    const numericB = BigInt(b);
    if (numericA === numericB) return 0;
    return numericA < numericB ? -1 : 1;
  }
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Fecha de compra ascendente, desempatando por numero de lote. */
export function compareBatchesOldestFirst<T extends OrderableBatch>(a: T, b: T): number {
  if (a.purchaseDate !== b.purchaseDate) {
    return a.purchaseDate < b.purchaseDate ? -1 : 1;
  }
  return compareLots(a.lot, b.lot);
}
