import { requireAdmin, type Actor } from './actor';
import type { CatalogLineView } from './catalog-line-view';
import { NotFoundError, ValidationError } from './errors';
import { pageQuerySchema, type Page } from './page';

import type { SupplierCatalogRepository } from '../ports/supplier-catalog-repository';

export type ListCatalogLinesDeps = {
  readonly catalog: SupplierCatalogRepository;
};

/**
 * Listado paginado del catalogo de UN proveedor (R22, R23, R25, R31).
 *
 * QC-52 lo deja en un caso de uso de tres lineas, y ese adelgazamiento ES el requisito
 * (R18, decision cerrada 3): desaparecen la dependencia hacia el catalogo de articulos de
 * `inventario`, la consulta que resolvia sus referencias y el `map` que pegaba sus nombres
 * a cada linea. La pagina se devuelve TAL CUAL la da el puerto.
 *
 * Consecuencia aceptada (`design.md > 6.2`): las lineas salen con `presentationId` y
 * `unitId` en crudo, sin nombre. Resolverlos es de la pantalla del catalogo (QC-44), que
 * tendra que pedir esos contratos a quien es dueno de cada concepto.
 *
 * Dos filtros que NO estan aqui, y es deliberado: «el proveedor tiene que estar vivo» y «la
 * linea tiene que estar viva» son del PUERTO (`listBySupplierAlive`), no de un `if` de este
 * archivo (R22), y por eso ningun caso de uso puede olvidarlos.
 *
 * El orden sigue siendo `created_at ASC, id ASC` y no cambia a `name ASC` aunque ahora la
 * linea tenga nombre propio: seria alcance de mas y el listado no tiene pantalla hasta
 * QC-44 (`design.md > 6.5`).
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

    return page;
  };
}
