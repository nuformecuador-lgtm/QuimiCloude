// Dominio PURO: reduce filas ya leidas de `reservation_movements` a la suma con signo que define
// el apartado por lote (reserve suma, los otros tres restan).
// Vive en dominio y no en un adaptador driven porque tanto `product-prisma.ts` (para
// `overReserved`) como `reservation-prisma.ts` (para repartir y para `ReservationQueries`)
// necesitan la MISMA regla, y los dos son driven del mismo modulo: ponerla en cualquiera de los
// dos crearia un import driven-a-driven cruzado e innecesario cuando el calculo no toca la base.

import { addQuantities, subtractQuantities } from './decimal-quantity';

export type ReservationMovementKind = 'reserve' | 'release' | 'expire' | 'consume';

export type ReservationLedgerRow = {
  readonly kind: ReservationMovementKind;
  readonly quantity: string;
};

const ZERO_QUANTITY = '0.0000';

/** La suma con signo de un conjunto de asientos: lo que queda apartado tras aplicarlos todos. */
export function netReservedQuantity(rows: readonly ReservationLedgerRow[]): string {
  let total = ZERO_QUANTITY;
  for (const row of rows) {
    total = row.kind === 'reserve' ? addQuantities(total, row.quantity) : subtractQuantities(total, row.quantity);
  }
  return total;
}

/** La misma suma, agrupada por lote: lo que hace falta para repartir o para leer el apartado de
 *  cada lote de una tacada. */
export function netReservedByBatch(
  rows: readonly (ReservationLedgerRow & { readonly batchId: string })[],
): ReadonlyMap<string, string> {
  const totals = new Map<string, string>();
  for (const row of rows) {
    const previous = totals.get(row.batchId) ?? ZERO_QUANTITY;
    totals.set(row.batchId, row.kind === 'reserve' ? addQuantities(previous, row.quantity) : subtractQuantities(previous, row.quantity));
  }
  return totals;
}
