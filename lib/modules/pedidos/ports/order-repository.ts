import type { ListQuery } from '../domain/list-query';
import type { Page } from '../domain/page';
import type { OrderScope } from '../domain/order-scope';
import type { NewOrder, OrderRow } from '../domain/order-view';

/**
 * Puerto de acceso a datos del pedido (`design.md > 7.4`). Seis metodos, uno por caso de uso.
 *
 * El sufijo `Alive` NO es adorno: el filtro `deleted_at IS NULL` es responsabilidad de ESTE
 * puerto y de su adaptador, no del dominio (R40), asi que ningun caso de uso puede olvidarlo.
 * No hay ninguna operacion de restaurar ni ningun listado de borrados (R31): lo que no se
 * puede expresar no se puede hacer por descuido.
 *
 * `NewOrder` no tiene `cancellationReason` y su `status` es `EditableOrderStatus`, asi que
 * `create` y `updateAlive` no pueden ni siquiera EXPRESAR una cancelacion. `cancelAlive` es el
 * UNICO metodo con `reason` y por tanto el unico capaz de escribir el estado cancelado: la
 * prohibicion de R24 llega hasta el tipo (`design.md > 8`).
 *
 * Los resultados son DISCRIMINADOS, nunca excepciones de Prisma: el adaptador traduce el
 * `23505` del indice del correlativo a `'duplicate_number'`, el `23503` a un error de
 * referencia y el `23514` segun el nombre de la restriccion. El dominio no ve jamas un
 * SQLSTATE.
 *
 * La comprobacion de ESTADO (R21, R22, R28, R32) NO vive aqui ni en el `where` del `UPDATE`,
 * sino en el caso de uso, sobre el `OrderRow` que acaba de leer con `findAliveById`: si viviera
 * en el `where`, «no existe» y «esta entregado» devolverian lo mismo y el usuario recibiria
 * `not_found` ante un pedido que esta viendo en pantalla.
 *
 * QC-60 (R18): **los SEIS metodos exigen `scope: OrderScope`**, la empresa en cuyo nombre se
 * consulta o se escribe, y va AL FINAL de cada firma para que ninguna llamada existente cambie
 * de orden de argumentos. Esta en la FIRMA y no escondido dentro del adaptador a proposito: el
 * ambito es parte del contrato, asi que una llamada que lo omita NO COMPILA, y no hay forma de
 * pedirle una fila a este puerto sin decir de quien es. Si en cambio viviera dentro del
 * adaptador -leido de un contexto global, de una variable de modulo o de un `$extends`-, el
 * archivo que escribe la consulta no diria por que filtra, y la consulta numero siete la
 * escribiria alguien que no sabe que tiene que filtrar.
 *
 * Lo que la firma NO cierra: TypeScript admite asignar una funcion de MENOR aridad donde se
 * espera una de mayor, asi que una IMPLEMENTACION que se olvide del `scope` se cablea en
 * `lib/composition` sin que `tsc` proteste. Esa mitad la cierra la guardia estatica por funcion
 * `tests/guards/guard-ambito-empresa-pedidos.test.ts`, que comprueba que cada implementacion
 * declara el ambito y que ese valor llega hasta una envoltura de `./company-scope`
 * (`design.md > 4.2` y `> 8`; verificado por el reviewer de QC-49 contra el `tsc` de este repo).
 *
 * Los resultados discriminados **no crecen**: «de otra empresa» vuelve como `null` o como
 * `'not_found'`, o sea por el mismo camino que «no existe» (R20, R21). El dominio no necesita
 * distinguirlos porque no DEBE distinguirlos: hacerlo seria un oraculo de existencia sobre
 * datos ajenos. La empresa tampoco viaja en `NewOrder` ni en `createOrderSchema` (R22): lo que
 * no esta en el tipo no se puede escribir por accidente.
 */
export interface OrderRepository {
  /**
   * Alta (R8, R10, R11). El ano y `created_at` salen del MISMO instante `now`, y la POSICION
   * la entrega la secuencia de la base dentro del propio `INSERT` (`design.md > 4.2`): asi el
   * `CHECK orders_order_year_matches_created_at` de QC-33 R41 nunca puede rechazar un alta
   * legitima. `actorId` es el de la sesion y se escribe en los DOS autores (R6).
   *
   * `'duplicate_number'` = el indice unico del correlativo rechazo la pareja (ano, posicion).
   * En operacion normal no ocurre; existe para que un duplicado insertado por otra via no
   * llegue como excepcion sin traducir.
   */
  create(
    data: NewOrder,
    year: number,
    actorId: string,
    now: Date,
    scope: OrderScope,
  ): Promise<OrderRow | 'duplicate_number'>;

  /** `null` = no existe, ya esta borrado, o es de OTRA empresa: para el dominio son el mismo
   *  caso (R33, R40, QC-60 R20). */
  findAliveById(id: string, scope: OrderScope): Promise<OrderRow | null>;

  /**
   * Listado paginado (R34, R38, R41) con el CONTRATO GENERICO de consulta (QC-57 R13, R25).
   *
   * **Un solo parametro.** `OrderFilters` desaparecio con QC-57: el estado y la prioridad ya no
   * son parametros propios del listado, son filtros `select` DENTRO de la consulta (R25), como
   * en las otras seis listas. La consulta llega YA SANEADA -lo que no esta en `ORDER_QUERYABLE`
   * no llega aqui (R5)- y con los valores de los dos `select` ya acotados a su conjunto cerrado.
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
   * (Firma corregida el 2026-09-04, aprobada por el leader; ver la nota al final de
   * `design.md > 7.4`. QC-57 le quita el primer parametro.)
   */
  listAlive(query: ListQuery, scope: OrderScope): Promise<Page<OrderRow>>;

  /** Edicion como REEMPLAZO COMPLETO (R20). No puede escribir `CANCELADO` ni motivo. */
  updateAlive(
    id: string,
    data: NewOrder,
    actorId: string,
    now: Date,
    scope: OrderScope,
  ): Promise<'ok' | 'not_found'>;

  /** UNICO camino hacia `CANCELADO` y hacia el motivo (R26, R28, R29). */
  cancelAlive(
    id: string,
    reason: string,
    actorId: string,
    now: Date,
    scope: OrderScope,
  ): Promise<'ok' | 'not_found'>;

  /** Borrado LOGICO (R31): marca `deleted_at`, jamas borra la fila ni libera el correlativo. */
  softDeleteAlive(
    id: string,
    actorId: string,
    now: Date,
    scope: OrderScope,
  ): Promise<'ok' | 'not_found'>;
}
