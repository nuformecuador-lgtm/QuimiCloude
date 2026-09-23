// lib/modules/inventario/domain/plan-reservation.ts
//
// Dominio PURO: sin base de datos, sin framework, sin reloj. Reparte una necesidad ya calculada
// entre los lotes disponibles de cada producto. Quien llama resuelve el `available` de cada lote
// -descontando lo que ya aparten otros pedidos- y quien recibe el resultado decide que escribir.

import { ceilToScale4, compareQuantities, minQuantity, subtractQuantities, addQuantities } from './decimal-quantity';
import { compareBatchesOldestFirst } from './batch-order';
import type { ProductId } from './product-catalog';
import type { ReservationRequirementLine } from './reservation';
import type { UnitId } from '@/lib/modules/unidades';

const ZERO_QUANTITY = '0';

/** Un lote con lo minimo para repartir: su disponible ya calculado por quien llama. */
export type ReservationCandidateBatch = {
  readonly id: string;
  readonly productId: ProductId;
  readonly lot: string;
  readonly purchaseDate: string;
  readonly available: string;
};

export type PlanReservationInput = {
  readonly requirement: readonly ReservationRequirementLine[];
  /** Unidad del producto, o `null` si el producto no tiene una. */
  readonly products: ReadonlyMap<ProductId, UnitId | null>;
  readonly batches: readonly ReservationCandidateBatch[];
};

export type ReservationAllocation = {
  readonly batchId: string;
  readonly quantity: string;
};

export type ReservationPlan =
  | { readonly kind: 'reserved'; readonly allocations: readonly ReservationAllocation[] }
  | { readonly kind: 'insufficient'; readonly productIds: readonly ProductId[] };

function isPositive(quantity: string): boolean {
  return compareQuantities(quantity, ZERO_QUANTITY) > 0;
}

export function planReservation(input: PlanReservationInput): ReservationPlan {
  const remainingByBatch = new Map<string, string>();
  for (const batch of input.batches) remainingByBatch.set(batch.id, batch.available);

  const allocationTotals = new Map<string, string>();
  const insufficientProductIds = new Set<ProductId>();

  for (const line of input.requirement) {
    const productUnitId = input.products.get(line.productId);
    if (productUnitId === null || productUnitId === undefined) {
      insufficientProductIds.add(line.productId);
      continue;
    }

    const need = ceilToScale4(line.quantity);

    const productBatches = input.batches
      .filter((batch) => batch.productId === line.productId)
      .slice()
      .sort(compareBatchesOldestFirst);

    let pending = need;
    for (const batch of productBatches) {
      if (!isPositive(pending)) break;
      const available = remainingByBatch.get(batch.id) ?? ZERO_QUANTITY;
      if (!isPositive(available)) continue;

      const taken = minQuantity(available, pending);
      remainingByBatch.set(batch.id, subtractQuantities(available, taken));
      pending = subtractQuantities(pending, taken);
      allocationTotals.set(batch.id, addQuantities(allocationTotals.get(batch.id) ?? ZERO_QUANTITY, taken));
    }

    if (isPositive(pending)) {
      insufficientProductIds.add(line.productId);
    }
  }

  if (insufficientProductIds.size > 0) {
    return { kind: 'insufficient', productIds: [...insufficientProductIds] };
  }

  const allocations = [...allocationTotals].map(([batchId, quantity]) => ({ batchId, quantity }));
  return { kind: 'reserved', allocations };
}
