import type { CatalogLineTerms, CatalogLineView, NewCatalogLine } from '../domain/catalog-line-view';
import type { Page, PageQuery } from '../domain/page';

/**
 * Puerto de acceso a datos del catalogo del proveedor (`design.md > 7`).
 *
 * Igual que en `SupplierRepository`, NO hay ningun metodo de busqueda por la pareja
 * proveedor-producto (R27): la unicidad viene del indice unico de la base y la
 * comprobacion previa no es expresable.
 *
 * `listBySupplierAlive` es lo que hace verdadera la decision cerrada 7 (R36): comprueba
 * que el PROVEEDOR este vivo antes de devolver nada, aunque la linea no tenga borrado
 * logico propio. El `productName` de la pagina NO lo resuelve este puerto -no sabe nada de
 * productos, y preguntarlo seria cruzar la frontera de `inventario`-: sale `null` y lo
 * completa el caso de uso con una sola llamada a `ProductCatalog.findRefs`
 * (`design.md > 5.3`).
 */
export interface SupplierCatalogRepository {
  /**
   * `'duplicate'` = la pareja (proveedor, producto) ya tiene linea (R27);
   * `'supplier_not_found'` = la FK a `suppliers` rechazo la escritura (R25).
   */
  create(
    data: NewCatalogLine,
    actorId: string,
    now: Date,
  ): Promise<{ id: string } | 'duplicate' | 'supplier_not_found'>;

  /** Solo las condiciones comerciales (R33): ni proveedor ni producto son cambiables. */
  updateTerms(
    id: string,
    data: CatalogLineTerms,
    actorId: string,
    now: Date,
  ): Promise<'ok' | 'not_found'>;

  /**
   * Borrado FISICO (R34), no logico, y no contradice `docs/architecture.md >
   * Anti-patrones`: la linea del catalogo no es una tabla transaccional -no mueve
   * existencias ni dinero- y QC-42 la dejo a proposito sin `deleted_at` (su decision 11),
   * asi que no hay donde marcar una baja. Mismo caso que `presentations` en QC-20 (D6).
   */
  deleteById(id: string): Promise<'deleted' | 'not_found'>;

  listBySupplierAlive(
    supplierId: string,
    query: PageQuery,
  ): Promise<Page<CatalogLineView> | 'supplier_not_found'>;
}
