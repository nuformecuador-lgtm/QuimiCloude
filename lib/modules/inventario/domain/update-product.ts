import { requirePermission, type Actor } from './actor';
import { ProductNotFoundError, ValidationError } from './errors';
import { updateProductSchema } from './product-input';

import type { ProductRepository } from '../ports/product-repository';

export type UpdateProductDeps = {
  readonly products: ProductRepository;
  /** Ver el comentario identico en `create-product.ts` sobre el origen de este reloj. */
  readonly now?: () => Date;
};

/**
 * Edicion de producto. Reemplazo completo de lo que queda editable, y se guarda TAL
 * CUAL, sin derivarlo ni recalcularlo. La existencia no se lee ni se escribe aqui: es
 * del lote. La autoria ya no se registra aqui: se mudo al lote (`ProductBatch`) el
 * 2026-09-09, asi que el actor solo sirve para el permiso y para la EMPRESA en cuyo
 * nombre se edita.
 *
 * QC-49 (R16): el ambito viaja al puerto y entra en el `where` del `UPDATE`, no en un `if`
 * posterior sobre una fila ya leida. Un `id` de otra empresa devuelve `false` -el mismo camino
 * que «no existe» y que «ya borrado»- y se traduce a `ProductNotFoundError`, nunca a un error
 * de autorizacion; y no se modifica ninguna fila, ni de la empresa de quien pide ni de la otra.
 */
export function createUpdateProduct(
  deps: UpdateProductDeps,
): (id: string, input: unknown, actor: Actor | null | undefined) => Promise<void> {
  const now = deps.now ?? (() => new Date());

  return async function updateProduct(
    id: string,
    input: unknown,
    actor: Actor | null | undefined,
  ): Promise<void> {
    requirePermission(actor, 'inventario.modificar');

    const parsed = updateProductSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    // R14: `updateAlive` devuelve `false` cuando el producto no existe o ya esta
    // borrado (`findAliveById`/`updateAlive` filtran `deleted_at IS NULL` en el
    // puerto, R16). El dominio nunca ve un SQLSTATE: solo traduce el booleano.
    // Misma reconciliacion que en `delete-product.ts`: la firma es la de `dev` -sin `actor.id`,
    // porque la autoria vive ahora en el lote- y el error es el de QC-70, `ProductNotFoundError`
    // con su codigo propio del catalogo unico (R17).
    const updated = await deps.products.updateAlive(id, parsed.data, now(), {
      companyId: actor.companyId,
    });
    if (!updated) throw new ProductNotFoundError();
  };
}
