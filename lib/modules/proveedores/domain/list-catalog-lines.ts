import { requireAdmin, type Actor } from './actor';
import { NotFoundError, ValidationError } from './errors';
import { createListQuerySchema, sanitizeListQuery } from './list-query';
import { SUPPLIER_CATALOG_LINE_QUERYABLE } from './supplier-catalog-line-queryable';

import type { CatalogLineView } from './catalog-line-view';
import type { Page } from './page';

import type { ListQueryLog } from '../ports/list-query-log';
import type { SupplierCatalogRepository } from '../ports/supplier-catalog-repository';

export type ListCatalogLinesDeps = {
  readonly catalog: SupplierCatalogRepository;
  readonly log: ListQueryLog;
};

/** Nombre con el que este listado se identifica en el log de campos omitidos (R6). */
const LIST_NAME = 'supplierCatalogLines';

/** El esquema no depende del actor ni de la consulta: se construye una vez por modulo. */
const listQuerySchema = createListQuerySchema();

/**
 * Listado paginado del catalogo de UN proveedor, con el CONTRATO GENERICO de consulta
 * (QC-57 T11, R30, R33), en el orden de `design.md > 1`: permiso, zod, saneo, log, puerto.
 *
 * QC-52 lo dejo en un caso de uso de tres lineas y ese adelgazamiento sigue vigente: la pagina
 * se devuelve TAL CUAL la da el puerto, sin resolver nada de otro modulo. `presentationId` y
 * `unitId` salen en crudo.
 *
 * DOS CONDICIONES DE VIDA, y las dos siguen donde estaban (R7): «el proveedor tiene que estar
 * vivo» y «la linea tiene que estar viva» viven en el `where` del puerto
 * (`listBySupplierAlive`), NO en un `if` de este archivo, y por eso ningun caso de uso puede
 * olvidarlas. QC-57 no las sube al dominio: el contrato generico solo anade orden, filtro y
 * busqueda ENCIMA de ese filtro que siempre va.
 *
 * `'supplier_not_found'` se conserva y se traduce a «no encontrado»: un proveedor dado de baja
 * no devuelve una pagina vacia, devuelve que no existe (R23 de QC-52).
 *
 * El orden por defecto sigue siendo `created_at ASC, id ASC` y NO cambia a `name ASC` (R11):
 * sin `sort`, la lista no se mueve. `cost` y `minPurchase` son `Decimal(14,4)` en la base y el
 * `numberRange` del contrato viaja como `number`: convertir es del ADAPTADOR, aqui no se
 * compara ni un importe.
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

    const parsed = listQuerySchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    const { query, ignored } = sanitizeListQuery(parsed.data, SUPPLIER_CATALOG_LINE_QUERYABLE);
    deps.log.ignoredFields(LIST_NAME, ignored);

    const page = await deps.catalog.listBySupplierAlive(supplierId, query);
    if (page === 'supplier_not_found') throw new NotFoundError();

    return page;
  };
}
