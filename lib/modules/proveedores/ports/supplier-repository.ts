import type { Page, PageQuery } from '../domain/page';
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
 */
export interface SupplierRepository {
  /** `'duplicate'` = el indice unico parcial rechazo el nombre normalizado (R15, R17). */
  create(data: NewSupplier, actorId: string, now: Date): Promise<{ id: string } | 'duplicate'>;

  /** `null` = no existe o esta dado de baja: para el dominio son el mismo caso (R24). */
  findAliveById(id: string): Promise<SupplierView | null>;

  updateAlive(
    id: string,
    data: NewSupplier,
    actorId: string,
    now: Date,
  ): Promise<'ok' | 'not_found' | 'duplicate'>;

  /**
   * Baja LOGICA del proveedor: marca `deleted_at`, jamas borra la fila. `false` = no habia
   * ningun proveedor vivo con ese id (R23).
   *
   * QC-52 le anade una obligacion que la firma no puede expresar y por eso se escribe aqui
   * (R20, decision cerrada 5): la baja arrastra TODAS las lineas vivas del catalogo de ese
   * proveedor, en la MISMA operacion atomica y con la MISMA marca de tiempo. Dos `now()`
   * distintos harian imposible saber despues que lineas cayeron con que baja. Y si no hay
   * proveedor vivo que dar de baja, la transaccion NO escribe nada: ni en `suppliers` ni en
   * `supplier_catalog_lines`.
   */
  softDeleteAlive(id: string, actorId: string, now: Date): Promise<boolean>;

  listAlive(query: PageQuery): Promise<Page<SupplierView>>;
}
