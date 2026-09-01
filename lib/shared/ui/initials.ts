/**
 * Deriva las iniciales del nombre visible (R15). Formateo de presentacion puro: sin
 * React, sin efectos, sin estado — por eso vive en `lib/utils/` y es testeable sin DOM.
 *
 * Contrato:
 * - nombre vacio o solo espacios → cadena vacia;
 * - una sola palabra → su primera letra;
 * - varias palabras → primera letra de la primera y de la ultima (los nombres
 *   intermedios se ignoran);
 * - siempre en mayusculas y con **maximo 2 caracteres**;
 * - tolerante a espacios multiples, iniciales o finales.
 */
export function getInitials(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return '';
  }

  const first = words[0] ?? '';
  const last = words[words.length - 1] ?? '';

  const initials = words.length === 1 ? first.slice(0, 1) : first.slice(0, 1) + last.slice(0, 1);

  return initials.toUpperCase();
}
