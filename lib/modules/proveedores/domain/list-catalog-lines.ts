import { requireAdmin, type Actor } from './actor';
import type { CatalogLineView } from './catalog-line-view';
import { NotFoundError, ValidationError } from './errors';
import { pageQuerySchema, type Page } from './page';

import type { ProductCatalog } from '@/lib/modules/inventario';

import type { SupplierCatalogRepository } from '../ports/supplier-catalog-repository';

export type ListCatalogLinesDeps = {
  readonly catalog: SupplierCatalogRepository;
  /** El contrato publico de `inventario`, por el barrel y solo como tipo (R26). */
  readonly products: ProductCatalog;
};

/**
 * Listado paginado del catalogo de UN proveedor (R35, R36, R37).
 *
 * Tres cosas que este archivo hace y conviene no perder de vista:
 *
 * 1. **Una sola llamada a `findRefs` para toda la pagina**, con los ids de todas sus lineas
 *    (`design.md > 5.3`). Preguntar una vez por linea seria N+1 consultas cruzando la
 *    frontera de un modulo.
 * 2. **El producto dado de baja no borra la linea** (R37): `findRefs` solo devuelve vivos,
 *    asi que su nombre sale `null` y la linea SIGUE en la pagina. Perderla seria perder el
 *    precio pactado de un producto que solo esta descatalogado.
 * 3. **El proveedor dado de baja no tiene catalogo** (R36): lo comprueba el puerto
 *    (`listBySupplierAlive`), no un `if` de aqui, y sus lineas no se devuelven aunque las
 *    filas sigan existiendo.
 */
export function createListCatalogLines(
  deps: ListCatalogLinesDeps,
): (
  supplierId: string,
  input: unknown,
  actor: Actor | null | undefined,
) => Promise<Page<CatalogLineView>> {
  return async function listCatalogLines(
    supplierId: string,
    input: unknown,
    actor: Actor | null | undefined,
  ): Promise<Page<CatalogLineView>> {
    requireAdmin(actor);

    const parsed = pageQuerySchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    const page = await deps.catalog.listBySupplierAlive(supplierId, parsed.data);
    if (page === 'supplier_not_found') throw new NotFoundError();
    if (page.items.length === 0) return page;

    const refs = await deps.products.findRefs(page.items.map((line) => line.productId));
    const nombrePorId = new Map(refs.map((ref) => [ref.id, ref.name]));

    return {
      ...page,
      items: page.items.map((line) => ({
        ...line,
        productName: nombrePorId.get(line.productId) ?? null,
      })),
    };
  };
}
