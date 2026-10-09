export type DeliveryLineState = {
  readonly presentationLineId: string;
  /** Entero >= 1. */
  readonly orderedPackages: number;
  /** Entero >= 0. */
  readonly deliveredPackages: number;
};

export type DeliveryBatchState = {
  readonly batchId: string;
  readonly presentationLineId: string;
  /** Entero >= 0. */
  readonly availablePackages: number;
};

export type DeliveryAllocation = {
  readonly presentationLineId: string;
  readonly batchId: string;
  /** Entero >= 1. */
  readonly packages: number;
};

export type DeliveryCheck =
  | { readonly kind: 'ok'; readonly completesOrder: boolean }
  | { readonly kind: 'empty' }
  | { readonly kind: 'exceeds_remaining'; readonly presentationLineIds: readonly string[] }
  | { readonly kind: 'exceeds_batch'; readonly batchIds: readonly string[] };

export const DELIVERY_MAX_ALLOCATIONS = 200;

export function remainingPackages(line: DeliveryLineState): number {
  return Math.max(0, line.orderedPackages - line.deliveredPackages);
}

function sumBy(allocations: readonly DeliveryAllocation[], key: (a: DeliveryAllocation) => string): Map<string, number> {
  const totals = new Map<string, number>();
  for (const allocation of allocations) {
    if (allocation.packages <= 0) continue;
    const id = key(allocation);
    totals.set(id, (totals.get(id) ?? 0) + allocation.packages);
  }
  return totals;
}

/**
 * Comprueba una entrega en este orden: `empty`, `exceeds_remaining` y `exceeds_batch`. Con
 * `batches` en `null` no se comprueba el tope por lote: lo hace quien tiene el lote bloqueado.
 * `completesOrder` es true si, sumando las asignaciones, no le falta ningun envase a ninguna linea.
 * Una asignacion a una linea que no esta en `lines` cuenta como exceso de esa linea.
 */
export function checkDelivery(
  lines: readonly DeliveryLineState[],
  batches: readonly DeliveryBatchState[] | null,
  allocations: readonly DeliveryAllocation[],
): DeliveryCheck {
  const byLine = sumBy(allocations, (a) => a.presentationLineId);
  if (byLine.size === 0) return { kind: 'empty' };

  const remainingByLine = new Map(lines.map((line) => [line.presentationLineId, remainingPackages(line)]));
  const exceededLines = [...byLine]
    .filter(([lineId, packages]) => packages > (remainingByLine.get(lineId) ?? 0))
    .map(([lineId]) => lineId);
  if (exceededLines.length > 0) return { kind: 'exceeds_remaining', presentationLineIds: exceededLines };

  if (batches !== null) {
    const availableByBatch = new Map(batches.map((batch) => [batch.batchId, batch.availablePackages]));
    const exceededBatches = [...sumBy(allocations, (a) => a.batchId)]
      .filter(([batchId, packages]) => packages > (availableByBatch.get(batchId) ?? 0))
      .map(([batchId]) => batchId);
    if (exceededBatches.length > 0) return { kind: 'exceeds_batch', batchIds: exceededBatches };
  }

  const completesOrder = lines.every((line) => (byLine.get(line.presentationLineId) ?? 0) >= remainingPackages(line));
  return { kind: 'ok', completesOrder };
}
