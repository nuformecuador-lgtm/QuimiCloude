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
 * Edicion de producto (R6, R9, R10, R11, R13, R14). Reemplazo completo, `stock`
 * incluido, y se guarda TAL CUAL, sin derivarlo ni recalcularlo (D3, R13). El autor
 * queda registrado SOLO como autor de la ultima modificacion (R6): el puerto no expone
 * `createdBy` en `updateAlive`, asi que conservar el autor de creacion es cosa del
 * adaptador (T9), no de este archivo.
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
    const updated = await deps.products.updateAlive(id, parsed.data, actor.id, now());
    if (!updated) throw new ProductNotFoundError();
  };
}
