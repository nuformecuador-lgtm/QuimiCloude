import type { ListQuery } from '../domain/list-query';
import type { Page } from '../domain/page';
import type { OrderScope } from '../domain/order-scope';
import type { OrderRow } from '../domain/order-view';

/**
 * Puerto de LECTURA del pedido (`design.md > 7.4`, `> 5.3`). La escritura vive en
 * `OrderWriteRepository` (`ports/order-write-repository.ts`), dentro de la transaccion
 * compartida con `inventario`: crear, editar, cancelar y borrar leen aqui la fila previa y
 * escriben alli. Este puerto ya NO declara `create`, `updateAlive`, `cancelAlive` ni
 * `softDeleteAlive` -QC-141 T9 movio a sus llamantes a la unidad de trabajo-, para no dejar dos
 * caminos de escritura del mismo pedido.
 *
 * El sufijo `Alive` NO es adorno: el filtro `deleted_at IS NULL` es responsabilidad de ESTE
 * puerto y de su adaptador, no del dominio (R40), asi que ningun caso de uso puede olvidarlo.
 * No hay ninguna operacion de restaurar ni ningun listado de borrados (R31): lo que no se
 * puede expresar no se puede hacer por descuido.
 *
 * Los dos metodos exigen `scope: OrderScope` al final de la firma: una llamada que lo omita no
 * compila. Una IMPLEMENTACION que lo omita si compila (TypeScript acepta una funcion de menor
 * aridad), y eso lo vigila `tests/guards/guard-ambito-empresa-pedidos.test.ts`.
 *
 * «De otra empresa» vuelve como `null`, igual que «no existe»: distinguirlos seria un oraculo de
 * existencia sobre datos ajenos.
 */
export interface OrderRepository {
  /** `null` = no existe, ya esta borrado, o es de OTRA empresa: para el dominio son el mismo
   *  caso. */
  findAliveById(id: string, scope: OrderScope): Promise<OrderRow | null>;

  /**
   * Listado paginado (R34, R38, R41) con el CONTRATO GENERICO de consulta (QC-57 R13, R25).
   *
   * El estado y la prioridad no son parametros propios del listado: son filtros `select`
   * DENTRO de la consulta (R25), como en las otras seis listas. `OrderFilters` desaparecio con
   * QC-57. La consulta llega YA SANEADA -lo que no esta en `ORDER_QUERYABLE` no llega aqui
   * (R5)- y con los valores de los dos `select` ya acotados a su conjunto cerrado.
   *
   * Devuelve una `Page` armada: `toOffsetLimit`/`buildPage` viven en `lib/shared/pagination`,
   * que `domain/` NO puede importar (`docs/architecture.md > La regla de dependencias`), asi
   * que quien pagina es el adaptador driven (R37, `design.md > 10`) — igual que en
   * `lib/modules/proveedores/ports/supplier-repository.ts`. Si la firma entregase `offset` y
   * `limit`, el caso de uso tendria que calcular el `offset` a mano, que es justo la
   * reimplementacion que R37 prohibe.
   *
   * Sin `sort`, el orden es el de HOY (R11): `priority DESC, created_at ASC, order_year ASC,
   * order_sequence ASC`, total y por tanto estable. El orden, los filtros y la paginacion se
   * aplican sobre el conjunto completo y ANTES de paginar (R13), y el `total` describe ese
   * conjunto ya filtrado (R14), no el catalogo entero.
   *
   * `recipeIds` es la busqueda ya resuelta a identificadores por otro modulo: `orders` no tiene
   * columna de nombre, asi que no puede traducir un termino de texto por si sola. `null` = sin
   * busqueda, no filtra nada; una lista (incluida la vacia) se compone en el `where` junto al
   * ambito y al borrado, nunca fundida con los filtros. Parametro obligatorio: el dominio no
   * puede olvidarlo.
   */
  listAlive(
    query: ListQuery,
    recipeIds: readonly string[] | null,
    scope: OrderScope,
  ): Promise<Page<OrderRow>>;
}
