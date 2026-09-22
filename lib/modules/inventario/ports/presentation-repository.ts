import type { InventoryScope } from '../domain/inventory-scope';
import type { ListQuery } from '../domain/list-query';
import type { Page } from '../domain/page';
import type { PresentationView } from '../domain/presentation-view';

/**
 * Lo que se escribe de una presentacion, con nombre y no por posicion (QC-80 § 4.2). El
 * nombre, su forma normalizada y su unidad viajan JUNTOS porque se escriben juntos (R11):
 * no existe ninguna firma de este puerto que permita guardar uno sin los otros.
 *
 * QC-49 (R17): la EMPRESA no esta aqui y no va a estarlo. Viaja por el `scope` de la firma, que
 * lo construye el caso de uso desde el actor de la sesion: lo que no esta en este tipo no se
 * puede escribir por accidente ni elegir desde la entrada del llamante.
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
 * de R20 la da **solo** el indice unico `presentations_company_name_unique`: este puerto no
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
 *
 * QC-49 (R13): **las cuatro firmas exigen `scope: InventoryScope`**, la empresa en cuyo nombre
 * se lee o se escribe. Que el ambito este EN LA FIRMA -y no resuelto dentro del adaptador, ni
 * inyectado por una extension global del cliente Prisma- es lo que hace que una LLAMADA que se
 * olvide de el NO COMPILE. Es el mismo argumento que escribio `UnitRepository` en QC-76.
 *
 * PRECISION DEL 2026-09-11 (correccion de la revision F2.2, no relajacion): el compilador cubre
 * la llamada, NO la implementacion. TypeScript admite asignar una funcion de MENOR aridad donde
 * se espera una de mayor, asi que una implementacion sin `scope` se cablea sin protestar
 * -verificado con `tsc`-. Lo que cierra esa mitad es mecanico igualmente, pero no es el
 * compilador: `tests/guards/guard-ambito-empresa-inventario.test.ts` comprueba METODO A METODO
 * que la implementacion declara el ambito y lo lleva hasta `./company-scope`, y los tests de
 * integracion prueban el rechazo cruzado de cada operacion contra la base.
 *
 * El ambito va **al final** de cada firma para que ninguna llamada existente cambie el orden de
 * sus argumentos. Y las uniones discriminadas **no crecen**: «de otra empresa» se devuelve como
 * `'not_found'`, por el mismo camino que «no existe» (R16). El dominio no necesita
 * distinguirlos porque no debe distinguirlos -seria un oraculo de existencia sobre el catalogo
 * ajeno, la misma fuga que el indice unico por empresa cierra por el otro lado-.
 *
 * QC-49 (R20): la unicidad del nombre normalizado pasa a ser **por empresa**
 * (`presentations_company_name_unique`, indice compuesto y no parcial). `'duplicate'` sigue
 * siendo la traduccion del `23505`, pero ahora solo choca con presentaciones de la MISMA
 * empresa: dos empresas pueden tener cada una su «Garrafa 20 L».
 */
export interface PresentationRepository {
  create(
    data: PresentationData,
    scope: InventoryScope,
  ): Promise<{ id: string } | 'duplicate' | 'invalid_unit'>;
  /**
   * QC-80 (R12): se llamaba `rename` y ahora escribe ademas la unidad. Un metodo llamado
   * `rename` que escribe la unidad es un nombre que miente, y el unico sitio donde se nota
   * que miente es dentro del adaptador. La edicion ya era reemplazo completo desde QC-20:
   * el nombre se pone al dia con lo que hace.
   */
  /**
   * `'unit_locked'`: la unidad enviada no coincide con la anterior y la presentacion ya
   * tiene algun lote. Lo detecta la base, nunca una lectura previa de este puerto.
   */
  replace(
    id: string,
    data: PresentationData,
    scope: InventoryScope,
  ): Promise<'ok' | 'not_found' | 'duplicate' | 'invalid_unit' | 'unit_locked'>;
  deleteById(id: string, scope: InventoryScope): Promise<'deleted' | 'not_found' | 'in_use'>;
  /** QC-57: el CONTRATO GENERICO ya saneado por el caso de uso (mismo criterio que
   *  `ProductRepository.listAlive`). */
  list(query: ListQuery, scope: InventoryScope): Promise<Page<PresentationView>>;
}
