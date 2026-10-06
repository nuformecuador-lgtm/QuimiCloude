import { percentageToHundredths, type RecipeLineView } from '@/lib/modules/recetas';

import type { RecipeLineFormValue } from './recipe-form-state';

export type VersionLineMark =
  | { kind: 'same' }
  | { kind: 'changed'; originalPercentage: string }
  | { kind: 'added' };

export type RemovedLine = { productId: string; productName: string | null; percentage: string };

type OriginalLine = Pick<RecipeLineView, 'productId' | 'productName' | 'percentage'>;

/**
 * Diferencia de una versión respecto de su original, solo para pintar: no decide nada que el
 * servidor acepte o rechace.
 */
export function compareWithOriginal(
  original: readonly OriginalLine[],
  lines: readonly Pick<RecipeLineFormValue, 'productId' | 'percentage'>[],
): { marks: readonly (VersionLineMark | null)[]; removed: readonly RemovedLine[] } {
  const originalByProduct = new Map<string, OriginalLine>();
  for (const line of original) {
    if (!originalByProduct.has(line.productId)) originalByProduct.set(line.productId, line);
  }

  const marks = lines.map((line): VersionLineMark | null => {
    if (line.productId === '') return null;
    const match = originalByProduct.get(line.productId);
    if (match === undefined) return { kind: 'added' };
    const hundredths = percentageToHundredths(line.percentage.replace(',', '.'));
    const originalHundredths = percentageToHundredths(match.percentage);
    // Un % aún a medio escribir no es igual a nada, aunque la original tampoco fuera válida.
    if (hundredths !== null && hundredths === originalHundredths) return { kind: 'same' };
    return { kind: 'changed', originalPercentage: match.percentage };
  });

  const usedProducts = new Set(lines.map((line) => line.productId).filter((id) => id !== ''));
  const removed = original
    .filter((line) => !usedProducts.has(line.productId))
    .map(
      (line): RemovedLine => ({
        productId: line.productId,
        productName: line.productName,
        percentage: line.percentage,
      }),
    );

  return { marks, removed };
}
