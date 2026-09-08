import type { ListQuery } from '../domain/list-query';
import type { Page } from '../domain/page';
import type { UnitRef } from '../domain/unit-catalog';
import type { UnitScope } from '../domain/unit-scope';

/**
 * Puerto de lectura del catalogo de unidades (`design.md > 9` de QC-32, R40; QC-57 R27-R29). A
 * diferencia de `UnitCatalog['findRefs']` -que resuelve ids conocidos para otros modulos-, este
 * puerto LISTA para el adaptador driving de `unidades`.
 *
 * **Dos metodos aqui, UN solo caso de uso fuera.** La union discriminada de `listUnits` es del
 * CONTRATO que consumen las pantallas (`design.md > 7`): quien elige entre catalogo y pagina es
 * el caso de uso, mirando si la entrada trae `page`/`pageSize`, y nunca el llamante. Que la
 * traduccion a SQL sean dos consultas distintas -una con `take` fijo y sin `count`, otra con
 * ventana y `count`- es detalle de persistencia, y por eso vive aqui y no alli.
 */
export interface UnitRepository {
  /**
   * Catalogo ENTERO acotado (R40 de QC-32, R28 de QC-57): `limit` no es negociable -ninguna
   * consulta sin cota-, y `query` trae el orden, los filtros y la busqueda ya saneados, que se
   * aplican tambien en este modo. `query.page`/`query.pageSize` se IGNORAN aqui: no hay ventana
   * que abrir, y por eso este metodo no devuelve `total`.
   *
   * `scope` (QC-76 R17, R18) es OBLIGATORIO: ninguna lectura del listado se ejecuta sin la
   * empresa en cuyo nombre se pregunta. Que este en la firma —y no dentro del adaptador— es lo
   * que hace que una implementacion o una llamada que se olvide del ambito NO COMPILE.
   */
  listAll(limit: number, query: ListQuery, scope: UnitScope): Promise<readonly UnitRef[]>;
  /**
   * Una PAGINA del catalogo (R29): el defecto 10 y el tope 25 los aplica el adaptador con
   * `lib/shared/pagination`, acotando en vez de rechazar. `total` y `totalPages` describen el
   * conjunto YA FILTRADO (R14) y, desde QC-76, tambien YA ACOTADO AL AMBITO: el recuento cuenta
   * solo lo visible para esa empresa (R17).
   */
  listPage(query: ListQuery, scope: UnitScope): Promise<Page<UnitRef>>;
}
