import type { RecipeLineData } from '../ports/recipe-repository';

import { percentageToHundredths, sumPercentages } from './recipe-percentage';

// El mismo separador que el nombre del producto terminado: asi el de una version sale compuesto
// sin que `inventario` sepa nada de versiones.
export const VERSION_NAME_SEPARATOR = ' · ';

export function recipeDisplayName(name: string, originalName: string | null): string {
  return originalName === null ? name : `${originalName}${VERSION_NAME_SEPARATOR}${name}`;
}

// Solo versiones: hay originales sin lineas en datos reales y hoy se pueden usar en un pedido.
export function isVersionUnderReview(isVersion: boolean, percentages: readonly string[]): boolean {
  return isVersion && !sumPercentages(percentages).isComplete;
}

// Por centesimas, para que "5" y "5.00" sean el mismo porcentaje. Un valor fuera de patron solo
// es igual a si mismo.
function percentageKey(percentage: string): bigint | string {
  return percentageToHundredths(percentage) ?? percentage;
}

function byProduct(lines: readonly RecipeLineData[]): Map<string, RecipeLineData> {
  return new Map(lines.map((line) => [line.productId, line]));
}

function sameLine(left: RecipeLineData | undefined, right: RecipeLineData | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return percentageKey(left.percentage) === percentageKey(right.percentage);
}

/**
 * Un ingrediente que la version deja igual que la original de antes sigue a la original de
 * despues (incluido desaparecer); uno que la version cambio, quito o anadio se queda como esta.
 * El resultado puede no sumar 100 o quedar vacio.
 */
export function propagateLines(
  before: readonly RecipeLineData[],
  after: readonly RecipeLineData[],
  version: readonly RecipeLineData[],
): readonly RecipeLineData[] {
  const beforeByProduct = byProduct(before);
  const afterByProduct = byProduct(after);
  const versionByProduct = byProduct(version);

  const resolve = (productId: string): RecipeLineData | undefined => {
    const own = versionByProduct.get(productId);
    return sameLine(own, beforeByProduct.get(productId)) ? afterByProduct.get(productId) : own;
  };

  const result: RecipeLineData[] = [];
  for (const line of after) {
    const resolved = resolve(line.productId);
    if (resolved !== undefined) result.push(resolved);
  }
  for (const line of version) {
    if (afterByProduct.has(line.productId)) continue;
    const resolved = resolve(line.productId);
    if (resolved !== undefined) result.push(resolved);
  }
  return result;
}
