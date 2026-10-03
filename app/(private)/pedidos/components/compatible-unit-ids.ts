import type { UnitRef } from '@/lib/modules/unidades';

type UnitLink = Pick<UnitRef, 'id' | 'baseUnitId'>;

/**
 * Ids de las unidades convertibles con `unitId`, ella incluida: las que comparten base efectiva
 * (`baseUnitId ?? id`), el mismo criterio que `convertQuantity`. Si la unidad no esta en el
 * catalogo no hay base que comparar y solo vale ella misma.
 */
export function compatibleUnitIds(
  units: readonly UnitLink[],
  unitId: string,
): readonly string[] {
  const unit = units.find((candidate) => candidate.id === unitId);
  if (unit === undefined) return [unitId];
  const base = unit.baseUnitId ?? unit.id;
  return units
    .filter((candidate) => (candidate.baseUnitId ?? candidate.id) === base)
    .map((candidate) => candidate.id);
}
