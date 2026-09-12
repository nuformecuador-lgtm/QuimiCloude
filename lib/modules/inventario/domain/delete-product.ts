import { requirePermission, type Actor } from './actor';
import { ProductNotFoundError } from './errors';

import type { ProductRepository } from '../ports/product-repository';

export type DeleteProductDeps = {
  readonly products: ProductRepository;
  /** Ver el comentario identico en `create-product.ts` sobre el origen de este reloj. */
  readonly now?: () => Date;
};

/**
 * Borrado de producto (R14, R15, R16). Logico y sin restaurar (D5): usa
 * `softDeleteAlive`, nunca un borrado fisico. La autoria ya no se registra aqui: se mudo al
 * lote (`ProductBatch`) el 2026-09-09, asi que el actor solo sirve para el permiso y para la
 * EMPRESA en cuyo nombre se borra.
 *
 * QC-49 (R16): el ambito viaja al puerto y entra en el `where`. Un `id` de otra empresa
 * devuelve `false` -igual que «no existe» y que «ya borrado»- y se traduce a
 * `ProductNotFoundError`, nunca a un error de autorizacion; y no se marca como borrada ninguna
 * fila, ni propia ni ajena.
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
    // La firma es la de `dev` (la autoria se mudo al lote el 2026-09-09, asi que ya no viaja el
    // `actor.id`) y el error es el de QC-70 (R17): `ProductNotFoundError`, con el codigo
    // `product_not_found` del catalogo unico, en vez del `NotFoundError` generico que compartian
    // cinco modulos con mensajes distintos.
    const deleted = await deps.products.softDeleteAlive(id, now(), {
      companyId: actor.companyId,
    });
    if (!deleted) throw new ProductNotFoundError();
  };
}
