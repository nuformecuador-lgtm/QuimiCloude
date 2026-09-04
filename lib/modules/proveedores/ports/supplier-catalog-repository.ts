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
   * `'supplier_not_found'` = **no hay ningun proveedor VIVO con ese id** (R25, R48): ni
   * porque no exista -la FK a `suppliers` rechaza la escritura- ni porque este dado de
   * baja. Los dos casos son el mismo para el dominio, que los traduce a «no encontrado»
   * igual que R24 hace con el proveedor. Un proveedor dado de baja **no admite lineas
   * nuevas**: la fila sigue en la base tras la baja logica, asi que sin esta comprobacion
   * el alta se aceptaria y crearia una linea que R36 no deja ver nunca.
   */
  create(
    data: NewCatalogLine,
    actorId: string,
    now: Date,
  ): Promise<{ id: string } | 'duplicate' | 'supplier_not_found'>;

  /**
   * Solo las condiciones comerciales (R33): ni proveedor ni producto son cambiables.
   *
   * `'not_found'` cubre tanto la linea inexistente como la de un proveedor DADO DE BAJA
   * (R48): editar el precio de un proveedor que ya no opera es la misma escritura sin
   * efecto visible que crearlo. El BORRADO de la linea si sigue permitido -quita una fila
   * en vez de escribir uno que nadie vera-, y por eso `deleteById` no lo comprueba.
   */
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
