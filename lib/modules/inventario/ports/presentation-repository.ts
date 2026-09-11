import type { ListQuery } from '../domain/list-query';
import type { Page } from '../domain/page';
import type { PresentationView } from '../domain/presentation-view';

/**
 * Lo que se escribe de una presentacion, con nombre y no por posicion (QC-80 § 4.2). El
 * nombre, su forma normalizada y su unidad viajan JUNTOS porque se escriben juntos (R11):
 * no existe ninguna firma de este puerto que permita guardar uno sin los otros.
 */
export type PresentationData = {
  readonly name: string;
  readonly nameNormalized: string;
  readonly unitId: string;
};

/**
 * Puerto de acceso a datos de presentacion (`design.md > 7`). `presentations` no lleva
 * `deleted_at` (D6): el borrado es fisico y por eso no hay ningun `…Alive` aqui, a
 * diferencia de `ProductRepository`.
 *
 * Resultados discriminados, no excepciones de Prisma: el adaptador driven traduce el
 * SQLSTATE `23505` (indice unico) a `'duplicate'` y el `23503` (violacion de FK) a
 * `'in_use'` o a `'invalid_unit'` SEGUN LA OPERACION -ver abajo-. La garantia de unicidad
 * de R20 la da **solo** el indice unico `presentations_name_normalized_key`: este puerto no
 * expone ningun metodo de busqueda (ni `findBy`, ni `search`, ni `exists`) y
 * deliberadamente no hay comprobacion previa por `nameNormalized` -- entre un `SELECT`
 * previo y el `INSERT` cabe otra transaccion, asi que no cerraria la carrera
 * (`design.md > 11.4`). El mensaje al usuario sale de traducir el `'duplicate'` que
 * devuelve el adaptador cuando Postgres rechaza la escritura (el `INSERT` de `create` o el
 * `UPDATE` de `replace`) por chocar contra el indice unico.
 *
 * QC-80 (R13): **la existencia de la unidad tampoco se comprueba antes**, y por el mismo
 * motivo exacto. `'invalid_unit'` es el resultado de que la FK
 * `presentations_unit_id_fkey` rechace la escritura, no el de un `SELECT` previo que no
 * cerraria ninguna carrera.
 */
export interface PresentationRepository {
  create(data: PresentationData): Promise<{ id: string } | 'duplicate' | 'invalid_unit'>;
  /**
   * QC-80 (R12): se llamaba `rename` y ahora escribe ademas la unidad. Un metodo llamado
   * `rename` que escribe la unidad es un nombre que miente, y el unico sitio donde se nota
   * que miente es dentro del adaptador. La edicion ya era reemplazo completo desde QC-20:
   * el nombre se pone al dia con lo que hace.
   */
  replace(
    id: string,
    data: PresentationData,
  ): Promise<'ok' | 'not_found' | 'duplicate' | 'invalid_unit'>;
  deleteById(id: string): Promise<'deleted' | 'not_found' | 'in_use'>;
  /** QC-57: el CONTRATO GENERICO ya saneado por el caso de uso (mismo criterio que
   *  `ProductRepository.listAlive`). */
  list(query: ListQuery): Promise<Page<PresentationView>>;
}
