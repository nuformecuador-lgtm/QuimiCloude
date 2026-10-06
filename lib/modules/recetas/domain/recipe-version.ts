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

type ByProduct = { readonly productId: string };

function byProduct<T extends ByProduct>(items: readonly T[]): Map<string, T> {
  return new Map(items.map((item) => [item.productId, item]));
}

function samePercentage(left: RecipeLineData, right: RecipeLineData): boolean {
  return percentageKey(left.percentage) === percentageKey(right.percentage);
}

/**
 * Lo que la version deja igual que la original de antes sigue a la original de despues (incluido
 * desaparecer); lo que la version cambio, quito o anadio se queda como esta. `same` dice que es
 * «igual» para cada tipo de fila.
 */
export function propagateByProduct<T extends ByProduct>(
  before: readonly T[],
  after: readonly T[],
  version: readonly T[],
  same: (left: T, right: T) => boolean,
): readonly T[] {
  const beforeByProduct = byProduct(before);
  const afterByProduct = byProduct(after);
  const versionByProduct = byProduct(version);

  const unchanged = (own: T | undefined, previous: T | undefined): boolean =>
    own === undefined || previous === undefined ? own === previous : same(own, previous);

  const resolve = (productId: string): T | undefined => {
    const own = versionByProduct.get(productId);
    return unchanged(own, beforeByProduct.get(productId)) ? afterByProduct.get(productId) : own;
  };

  const result: T[] = [];
  for (const item of after) {
    const resolved = resolve(item.productId);
    if (resolved !== undefined) result.push(resolved);
  }
  for (const item of version) {
    if (afterByProduct.has(item.productId)) continue;
    const resolved = resolve(item.productId);
    if (resolved !== undefined) result.push(resolved);
  }
  return result;
}

/** Por producto y porcentaje. El resultado puede no sumar 100 o quedar vacio. */
export function propagateLines(
  before: readonly RecipeLineData[],
  after: readonly RecipeLineData[],
  version: readonly RecipeLineData[],
): readonly RecipeLineData[] {
  return propagateByProduct(before, after, version, samePercentage);
}

/** Por producto y cantidad. */
export function propagateTools<T extends ByProduct & { readonly quantity: number }>(
  before: readonly T[],
  after: readonly T[],
  version: readonly T[],
): readonly T[] {
  return propagateByProduct(before, after, version, (left, right) => left.quantity === right.quantity);
}
