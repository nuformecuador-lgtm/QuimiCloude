import { requireAdmin, type Actor } from './actor';
import { ValidationError } from './errors';
import { productQuerySchema, type Page } from './page';
import type { ProductView } from './product-view';

import type { ProductRepository } from '../ports/product-repository';

export type ListProductsDeps = {
  readonly products: ProductRepository;
};

/**
 * Lista paginada de productos (R23, R24, R25, R26, R35, R36). El caso de uso solo valida
 * el minimo y la integridad con `productQuerySchema` -que es `pageQuerySchema` mas la
 * busqueda por nombre- y DELEGA: el defecto de 10, el tope de
 * 25 y el orden `name ASC, id ASC` los aplica el adaptador driven con
 * `lib/shared/pagination` (R27) -este archivo no puede importar `lib/shared/**`
 * (`docs/architecture.md > La regla de dependencias`)-. D2: consultar tambien exige
 * `requireAdmin`.
 */
export function createListProducts(
  deps: ListProductsDeps,
): (input: unknown, actor: Actor | null | undefined) => Promise<Page<ProductView>> {
  return async function listProducts(
    input: unknown,
    actor: Actor | null | undefined,
  ): Promise<Page<ProductView>> {
    requireAdmin(actor);

    const parsed = productQuerySchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    return deps.products.listAlive(parsed.data);
  };
}
