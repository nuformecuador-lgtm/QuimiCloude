import type { UnitId } from '@/lib/modules/unidades';

export type ProductStockByUnit = {
  readonly unitId: UnitId | null;
  readonly quantity: number;
};

export function sumStockByUnit(
  rows: readonly { readonly stock: number; readonly unitId: UnitId | null }[],
): readonly ProductStockByUnit[] {
  const totals = new Map<UnitId | null, number>();

  for (const row of rows) {
    totals.set(row.unitId, (totals.get(row.unitId) ?? 0) + row.stock);
  }

  return Array.from(totals, ([unitId, quantity]) => ({ unitId, quantity })).sort((a, b) => {
    if (a.quantity !== b.quantity) return b.quantity - a.quantity;
    const aId = a.unitId ?? '';
    const bId = b.unitId ?? '';
    return aId < bId ? -1 : aId > bId ? 1 : 0;
  });
}

export function singleUnitStock(
  rows: readonly { readonly stock: number; readonly unitId: UnitId | null }[],
): number {
  const totals = sumStockByUnit(rows);

  if (totals.length === 0) return 0;
  if (totals.length === 1) return totals[0].quantity;

  throw new Error(`singleUnitStock: los lotes mezclan ${totals.length} unidades`);
}
