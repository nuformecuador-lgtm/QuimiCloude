import { requirePermission, type Actor } from './actor';
import { SupplierNotFoundError, ValidationError } from './errors';
import { SHOWCASE_LINE_BATCH, SHOWCASE_LINE_SORT, showcaseLinesQuerySchema } from './supplier-showcase';
import type { SupplierScope } from './supplier-scope';

import type { CatalogLineView } from './catalog-line-view';
import type { ListQuery } from './list-query';
import type { ShowcaseLine, ShowcaseLinesPage } from './supplier-showcase';

import type { SupplierCatalogRepository } from '../ports/supplier-catalog-repository';

export type ListShowcaseLinesDeps = {
  readonly catalog: SupplierCatalogRepository;
};

/** `CatalogLineView` -> `ShowcaseLine`: sin autores, sin fechas, sin importes. */
function toShowcaseLine(line: CatalogLineView): ShowcaseLine {
  return { id: line.id, name: line.name, imagePath: line.imagePath };
}

/**
 * «Cargar mas» de una fila: mismo orden y tamano de tanda que la primera pagina, para
 * que el prefijo no tenga huecos ni repetidos.
 */
export function createListShowcaseLines(
  deps: ListShowcaseLinesDeps,
): (
  supplierId: string,
  input: unknown,
  actor: Actor | null | undefined,
) => Promise<ShowcaseLinesPage> {
  return async function listShowcaseLines(
    supplierId: string,
    input: unknown,
    actor: Actor | null | undefined,
  ): Promise<ShowcaseLinesPage> {
    requirePermission(actor, 'proveedores.consultar');

    const scope: SupplierScope = { companyId: actor.companyId };

    const parsed = showcaseLinesQuerySchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    const query: ListQuery = {
      page: parsed.data.page,
      pageSize: SHOWCASE_LINE_BATCH,
      sort: SHOWCASE_LINE_SORT,
      filters: {},
      search: parsed.data.productSearch,
    };

    const page = await deps.catalog.listBySupplierAlive(supplierId, query, scope);
    if (page === 'supplier_not_found') throw new SupplierNotFoundError();

    return {
      items: page.items.map(toShowcaseLine),
      page: page.page,
      hasMore: page.page < page.totalPages,
    };
  };
}
