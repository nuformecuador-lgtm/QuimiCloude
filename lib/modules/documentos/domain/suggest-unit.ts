/**
 * Sugiere la unidad de una presentacion nueva a partir de la unidad que leyo la IA, comparando con
 * nombre y simbolo normalizados de las unidades visibles para la empresa.
 *
 * Sin coincidencia, o con mas de una, no hay sugerencia: el revisor elige. Dominio puro.
 */

import { normalizeUnitName, type UnitRef } from '@/lib/modules/unidades';

/** El identificador de la unica unidad cuyo nombre o simbolo normalizado casa con `readUnit`, o
 *  `null` si no hay ninguna coincidencia o hay mas de una. */
export function suggestUnitId(readUnit: string | null, units: readonly UnitRef[]): string | null {
  if (readUnit === null) return null;

  const normalizedRead = normalizeUnitName(readUnit);
  if (normalizedRead === '') return null;

  const matches = units.filter((unit) => {
    const nameMatches = normalizeUnitName(unit.name) === normalizedRead;
    const symbolMatches = unit.symbol !== null && normalizeUnitName(unit.symbol) === normalizedRead;
    return nameMatches || symbolMatches;
  });

  return matches.length === 1 ? matches[0].id : null;
}
