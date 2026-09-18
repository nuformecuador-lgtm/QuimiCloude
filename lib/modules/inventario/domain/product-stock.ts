import type { UnitId } from '@/lib/modules/unidades';

export type ProductStockByUnit = {
  readonly unitId: UnitId;
  readonly quantity: number;
};

export function sumStockByUnit(
  rows: readonly { readonly stock: number; readonly unitId: UnitId }[],
): readonly ProductStockByUnit[] {
  const totals = new Map<UnitId, number>();

  for (const row of rows) {
    totals.set(row.unitId, (totals.get(row.unitId) ?? 0) + row.stock);
  }

  return Array.from(totals, ([unitId, quantity]) => ({ unitId, quantity })).sort((a, b) => {
    if (a.quantity !== b.quantity) return b.quantity - a.quantity;
    return a.unitId < b.unitId ? -1 : a.unitId > b.unitId ? 1 : 0;
  });
}
