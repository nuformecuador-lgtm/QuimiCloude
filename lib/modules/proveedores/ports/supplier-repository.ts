import type { ListQuery } from '../domain/list-query';
import type { Page } from '../domain/page';
import type { SupplierScope } from '../domain/supplier-scope';
import type { ShowcasePage, ShowcaseQuery } from '../domain/supplier-showcase';
import type { NewSupplier, SupplierView } from '../domain/supplier-view';

/**
 * Puerto de acceso a datos del proveedor (`design.md > 7`).
 *
 * El sufijo `Alive` NO es adorno: el filtro `deleted_at IS NULL` es responsabilidad de
 * ESTE puerto y de su adaptador, no del dominio (R22), y asi ningun caso de uso puede
 * olvidarlo. No hay ninguna operacion de restaurar ni de listar dados de baja (decision
 * cerrada 6, R22): lo que no se puede expresar no se puede hacer por descuido.
 *
 * NO hay ningun metodo de busqueda por nombre, y es deliberado (R17, `design.md > 7`): la
 * unicidad la garantiza SOLO el indice unico parcial de la base. Un `SELECT` previo al
 * `INSERT` es una carrera y no aporta ningun mensaje que el `'duplicate'` no de ya; sin
 * metodo de busqueda, esa comprobacion previa ni siquiera es expresable.
 *
 * Los resultados son discriminados, nunca excepciones de Prisma: el dominio no ve jamas un
 * SQLSTATE. Traducirlos es del adaptador driven.
 *
 * Los cinco metodos exigen `scope: SupplierScope` al FINAL de la firma. Ponerlo en la firma
 * -y no como campo opcional ni con valor por defecto- es lo que hace que una llamada que lo
 * omita no compile: es el compilador, no un test, quien atrapa al llamante nuevo que se
 * olvide de acotar por empresa.
 */
export interface SupplierRepository {
  /** `'duplicate'` = el indice unico parcial rechazo el nombre normalizado (R15, R17). */
  create(
    data: NewSupplier,
    actorId: string,
    now: Date,
    scope: SupplierScope,
  ): Promise<{ id: string } | 'duplicate'>;

  /** `null` = no existe, esta dado de baja o es de otra empresa: para el dominio son el
   *  mismo caso (R24). */
  findAliveById(id: string, scope: SupplierScope): Promise<SupplierView | null>;

  updateAlive(
    id: string,
    data: NewSupplier,
    actorId: string,
    now: Date,
    scope: SupplierScope,
  ): Promise<'ok' | 'not_found' | 'duplicate'>;

  /**
   * Baja LOGICA del proveedor: marca `deleted_at`, jamas borra la fila. `false` = no habia
   * ningun proveedor vivo con ese id **dentro de esa empresa** (R23).
   *
   * QC-52 le anade una obligacion que la firma no puede expresar y por eso se escribe aqui
   * (R20, decision cerrada 5): la baja arrastra TODAS las lineas vivas del catalogo de ese
   * proveedor, en la MISMA operacion atomica y con la MISMA marca de tiempo. Dos `now()`
   * distintos harian imposible saber despues que lineas cayeron con que baja. Y si no hay
   * proveedor vivo que dar de baja -ni siquiera de otra empresa-, la transaccion NO escribe
   * nada: ni en `suppliers` ni en `supplier_catalog_lines`.
   */
  softDeleteAlive(id: string, actorId: string, now: Date, scope: SupplierScope): Promise<boolean>;

  /**
   * Listado paginado de los proveedores VIVOS de esa empresa, con el CONTRATO GENERICO de
   * consulta (QC-57 R13). Recibe la consulta YA SANEADA por el caso de uso -lo que no esta en
   * `SUPPLIER_QUERYABLE` no llega aqui (R5)- y devuelve una `Page` ya armada:
   * `toOffsetLimit`/`buildPage` viven en `lib/shared/pagination`, que `domain/` NO puede
   * importar, asi que quien pagina es el adaptador driven.
   *
   * El orden, el filtro y la busqueda los aplica el MOTOR sobre el conjunto ya acotado a la
   * empresa y antes de paginar (R13), nunca sobre la pagina ya traida; el `total`
   * describe ese conjunto ya filtrado (R14).
   */
  listAlive(query: ListQuery, scope: SupplierScope): Promise<Page<SupplierView>>;

  /**
   * Tanda de proveedores VIVOS de esa empresa para la vista de catalogo visual. A diferencia de
   * `listAlive`, no es el contrato generico de listas: el tamano de tanda y el orden son
   * constantes del dominio (`supplier-showcase.ts`), no entrada, y cada fila trae ademas su
   * primera tanda de lineas del catalogo.
   */
  listShowcaseAlive(query: ShowcaseQuery, scope: SupplierScope): Promise<ShowcasePage>;
}
