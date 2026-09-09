import { requirePermission, type Actor } from './actor';
import { ProductNotFoundError } from './errors';

import type { ProductRepository } from '../ports/product-repository';

export type DeleteProductDeps = {
  readonly products: ProductRepository;
  /** Ver el comentario identico en `create-product.ts` sobre el origen de este reloj. */
  readonly now?: () => Date;
};

/**
 * Borrado de producto (R6, R14, R15, R16). Logico y sin restaurar (D5): usa
 * `softDeleteAlive`, nunca un borrado fisico. El actor queda registrado como autor de
 * la ultima modificacion, sin tocar el autor de creacion (R6) -misma nota que en
 * `update-product.ts` sobre el alcance real de esa garantia-.
 */
export function createDeleteProduct(
  deps: DeleteProductDeps,
): (id: string, actor: Actor | null | undefined) => Promise<void> {
  const now = deps.now ?? (() => new Date());

  return async function deleteProduct(
    id: string,
    actor: Actor | null | undefined,
  ): Promise<void> {
    requirePermission(actor, 'inventario.modificar');

    // R14: `false` significa que el producto no existe o ya estaba borrado
    // (`softDeleteAlive` tambien filtra `deleted_at IS NULL`, R16).
    const deleted = await deps.products.softDeleteAlive(id, actor.id, now());
    if (!deleted) throw new ProductNotFoundError();
  };
}
