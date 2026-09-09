import { requirePermission, type Actor } from './actor';
import { NotFoundError } from './errors';

import type { ProductRepository } from '../ports/product-repository';

export type DeleteProductDeps = {
  readonly products: ProductRepository;
  /** Ver el comentario identico en `create-product.ts` sobre el origen de este reloj. */
  readonly now?: () => Date;
};

/**
 * Borrado de producto (R14, R15, R16). Logico y sin restaurar (D5): usa
 * `softDeleteAlive`, nunca un borrado fisico. La autoria ya no se registra aqui: se mudo al
 * lote (`ProductBatch`) el 2026-09-09, asi que el actor solo sirve para el permiso.
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
    const deleted = await deps.products.softDeleteAlive(id, now());
    if (!deleted) throw new NotFoundError();
  };
}
