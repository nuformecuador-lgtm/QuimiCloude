import { requirePermission, type Actor } from './actor';

import type { ProductBatchView } from './product-batch-view';
import type { ProductRepository } from '../ports/product-repository';

export type ListProductBatchesDeps = {
  readonly products: ProductRepository;
};

/**
 * Los lotes de un producto, para el panel que permite elegir cual corregir.
 *
 * Consultar exige su propio permiso: quien solo puede modificar no lee. El producto inexistente, el
 * borrado y el de otra empresa vuelven los tres como lista vacia -lo resuelve el puerto-, asi que
 * desde aqui no hay forma de averiguar cual de los tres era.
 */
export function createListProductBatches(
  deps: ListProductBatchesDeps,
): (productId: string, actor: Actor | null | undefined) => Promise<readonly ProductBatchView[]> {
  return async function listProductBatches(
    productId: string,
    actor: Actor | null | undefined,
  ): Promise<readonly ProductBatchView[]> {
    requirePermission(actor, 'inventario.consultar');

    return deps.products.findBatchesOfAliveProduct(productId, { companyId: actor.companyId });
  };
}
