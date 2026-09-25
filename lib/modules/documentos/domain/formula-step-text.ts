/**
 * Convierte el texto de un paso leido por la IA en un documento de paso de receta: una cadena
 * por linea no vacia, en orden. No interpreta vinetas ni negritas -el revisor tiene el editor
 * completo para corregirlo-, solo separa parrafos por salto de linea.
 *
 * Dominio puro: sin base de datos ni framework.
 */

import type { RecipeStepDocument } from '@/lib/modules/recetas';

/** El documento del paso, o `null` si el texto no tiene ninguna linea con contenido. */
export function stepTextToDocument(text: string): RecipeStepDocument | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');

  if (lines.length === 0) return null;

  return {
    blocks: lines.map((line) => ({ kind: 'paragraph' as const, spans: [{ text: line }] })),
  };
}
