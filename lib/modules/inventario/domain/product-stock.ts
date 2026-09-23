import { addQuantities, compareQuantities } from './decimal-quantity';

import type { UnitId } from '@/lib/modules/unidades';

export type ProductStockByUnit = {
  readonly unitId: UnitId;
  readonly quantity: string;
};

const NO_STOCK = '0';

export function sumStockByUnit(
  rows: readonly { readonly stock: string; readonly unitId: UnitId }[],
): readonly ProductStockByUnit[] {
  const totals = new Map<UnitId, string>();

  for (const row of rows) {
    totals.set(row.unitId, addQuantities(totals.get(row.unitId) ?? NO_STOCK, row.stock));
  }

  return Array.from(totals, ([unitId, quantity]) => ({ unitId, quantity })).sort((a, b) => {
    const cmp = compareQuantities(a.quantity, b.quantity);
    if (cmp !== 0) return -cmp;
    return a.unitId < b.unitId ? -1 : a.unitId > b.unitId ? 1 : 0;
  });
}

export function singleUnitStock(
  rows: readonly { readonly stock: string; readonly unitId: UnitId }[],
): string {
  const totals = sumStockByUnit(rows);

  if (totals.length === 0) return '0.0000';
  if (totals.length === 1) return totals[0].quantity;

  throw new Error(`singleUnitStock: los lotes mezclan ${totals.length} unidades`);
}
