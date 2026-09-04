import type { CatalogLineFields, CatalogLineView, NewCatalogLine } from '../domain/catalog-line-view';
import type { Page, PageQuery } from '../domain/page';

/**
 * Puerto de acceso a datos del catalogo del proveedor (`design.md > 6`, `> 7`).
 *
 * NO hay ningun metodo de busqueda por nombre, ni por la terna que identifica una linea, y
 * es deliberado (R15, `design.md > 10.4`): la unicidad la garantiza SOLO el indice unico
 * parcial de la base. Un `SELECT` previo al `INSERT` es una carrera -entre la lectura y la
 * escritura cabe otra transaccion- y no aporta ningun mensaje que el `'duplicate'` no de
 * ya; sin metodo de busqueda, esa comprobacion previa ni siquiera es expresable.
 *
 * Tampoco hay ninguna operacion de restaurar ni ningun listado de lineas dadas de baja
 * (R22): lo que no se puede expresar no se puede hacer por descuido.
 *
 * Este puerto no sabe nada de productos, ni de presentaciones, ni de unidades: devuelve
 * `presentationId` y `unitId` en crudo (`design.md > 6.2`). QC-52 corto esa dependencia
 * entera (R18).
 */
export interface SupplierCatalogRepository {
  /**
   * `'duplicate'` = ya hay una linea VIVA de ese proveedor con el mismo nombre normalizado
   * y la misma presentacion (R15);
   * `'supplier_not_found'` = no hay ningun proveedor VIVO con ese id (R23): ni porque no
   * exista -la FK a `suppliers` rechaza la escritura- ni porque este dado de baja. Los dos
   * casos son el mismo para el dominio, que los traduce a «no encontrado».
   *
   * Una presentacion o una unidad inexistentes NO son un resultado de este union: los
   * rechaza la FK y el adaptador los traduce a `ValidationError` (`design.md > 6.2`).
   */
  create(
    data: NewCatalogLine,
    actorId: string,
    now: Date,
  ): Promise<{ id: string } | 'duplicate' | 'supplier_not_found'>;

  /**
   * Edicion = REEMPLAZO COMPLETO de los siete campos de negocio (R24, P6), nombre y
   * presentacion incluidos. El sufijo `Alive` no es adorno: la linea tiene que estar viva Y
   * su proveedor tambien.
   *
   * `'not_found'` cubre los tres casos que R23 trata igual: linea inexistente, linea ya
   * dada de baja y linea de un proveedor dado de baja. `'duplicate'` es el mismo choque
   * contra el indice unico parcial que en el alta: renombrar hacia una combinacion ya
   * ocupada por otra linea viva del mismo proveedor.
   *
   * El nombre `replaceAlive` -y no `updateTerms`- es del cambio de QC-52: ya no son solo
   * «terminos» comerciales. Se alinea con `SupplierRepository.updateAlive` y
   * `RecipeRepository.replaceAlive`.
   */
  replaceAlive(
    id: string,
    data: CatalogLineFields,
    actorId: string,
    now: Date,
  ): Promise<'ok' | 'not_found' | 'duplicate'>;

  /**
   * Baja LOGICA de la linea (R21): marca `deleted_at` -y sella `updated_at`/`updated_by`-,
   * y JAMAS borra la fila. Sustituye al `deleteById` fisico de QC-43 (su R34 queda
   * derogada por la decision cerrada 5 de QC-52).
   *
   * `false` = no hay ninguna linea viva con ese id, o su proveedor esta dado de baja: los
   * tres son «no encontrado» (R23). **QC-43 R48 queda derogada entera** (P5): la baja de
   * una linea de un proveedor dado de baja tambien responde «no encontrado». El argumento
   * que sostenia aquella excepcion -«rechazarlo dejaria esas filas atrapadas sin ninguna
   * operacion capaz de eliminarlas»- desaparecio con la decision cerrada 5: esas filas ya
   * estan dadas de baja, arrastradas por la baja de su proveedor.
   *
   * Como el indice unico es PARCIAL sobre las vivas, dar de baja una linea LIBERA su
   * combinacion de nombre y presentacion para otra linea del mismo proveedor (R17).
   */
  softDeleteAlive(id: string, actorId: string, now: Date): Promise<boolean>;

  /**
   * Listado paginado de las lineas VIVAS de un proveedor VIVO (R22). Las dos condiciones
   * viven en el `where` del adaptador, no en un `if` del dominio, y por eso ningun caso de
   * uso puede olvidarlas.
   */
  listBySupplierAlive(
    supplierId: string,
    query: PageQuery,
  ): Promise<Page<CatalogLineView> | 'supplier_not_found'>;
}
