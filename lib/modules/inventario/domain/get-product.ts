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
 *
 * QC-49 (R15): el ambito -la empresa DEL ACTOR, nunca una que llegue en la entrada- se pasa al
 * puerto, y un `id` de OTRA empresa vuelve como `null`, igual que uno borrado y que uno
 * inexistente. Se responde `ProductNotFoundError` y **nunca** `UnauthorizedError`: distinguir
 * «no puedes» de «no existe» sobre datos ajenos convertiria este caso de uso en un oraculo de
 * existencia del inventario de las demas empresas. Aqui no hay ninguna condicion de consulta:
 * este archivo solo traduce actor -> ambito.
 */
export function createGetProduct(
  deps: GetProductDeps,
): (id: string, actor: Actor | null | undefined) => Promise<ProductView> {
  return async function getProduct(
    id: string,
    actor: Actor | null | undefined,
  ): Promise<ProductView> {
    requirePermission(actor, 'inventario.consultar');

    const product = await deps.products.findAliveById(id, { companyId: actor.companyId });
    if (product === null) throw new ProductNotFoundError();

    return product;
  };
}
