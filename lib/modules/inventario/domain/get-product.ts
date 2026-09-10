import { requirePermission, type Actor } from './actor';
import { ProductNotFoundError } from './errors';
import type { ProductView } from './product-view';

import type { ProductRepository } from '../ports/product-repository';

export type GetProductDeps = {
  readonly products: ProductRepository;
};

/**
 * Ficha de un producto (D2: consultar tambien exige permiso, con su propio codigo
 * `inventario.consultar` (QC-74 R16); quien solo puede modificar ni
 * siquiera lee). El filtro de borrados es del puerto (`findAliveById`), no de aqui
 * (R16): un `id` de un producto borrado se traduce igual que uno inexistente.
 */
export function createGetProduct(
  deps: GetProductDeps,
): (id: string, actor: Actor | null | undefined) => Promise<ProductView> {
  return async function getProduct(
    id: string,
    actor: Actor | null | undefined,
  ): Promise<ProductView> {
    requirePermission(actor, 'inventario.consultar');

    const product = await deps.products.findAliveById(id);
    if (product === null) throw new ProductNotFoundError();

    return product;
  };
}
