import type { CatalogImageUrl } from '../ports/catalog-image-url';

export type { CatalogImageUrl } from '../ports/catalog-image-url';

/**
 * Ruta -> URL publica, o `null` sin tocar el puerto. Misma regla que
 * `recetas/domain/list-recipes.ts:50`: una linea sin imagen no compone nada.
 */
export function toImageUrl(path: string | null, images: CatalogImageUrl): string | null {
  if (path === null || path === '') return null;
  return images.publicUrl(path);
}
