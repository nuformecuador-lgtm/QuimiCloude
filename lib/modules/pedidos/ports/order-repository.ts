import type { Page, PageQuery } from '../domain/page';
import type { NewOrder, OrderFilters, OrderRow } from '../domain/order-view';

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
  ): Promise<OrderRow | 'duplicate_number'>;

  /** `null` = no existe o ya esta borrado: para el dominio son el mismo caso (R33, R40). */
  findAliveById(id: string): Promise<OrderRow | null>;

  /**
   * Listado paginado (R34, R38, R41). Recibe la `PageQuery` YA VALIDADA y devuelve una `Page`
   * armada: `toOffsetLimit`/`buildPage` viven en `lib/shared/pagination`, que `domain/` NO
   * puede importar (`docs/architecture.md > La regla de dependencias`), asi que quien pagina
   * es el adaptador driven (R37, `design.md > 10`) — igual que en
   * `lib/modules/proveedores/ports/supplier-repository.ts`. Si la firma entregase `offset` y
   * `limit`, el caso de uso tendria que calcular el `offset` a mano, que es justo la
   * reimplementacion que R37 prohibe.
   *
   * El orden es `priority DESC, created_at ASC, order_year ASC, order_sequence ASC`, total y
   * por tanto estable. El `total` de la `Page` es el numero de pedidos que cumplen los
   * filtros, no el de la pagina.
   *
   * (Firma corregida el 2026-09-04, aprobada por el leader; ver la nota al final de
   * `design.md > 7.4`.)
   */
  listAlive(filters: OrderFilters, query: PageQuery): Promise<Page<OrderRow>>;

  /** Edicion como REEMPLAZO COMPLETO (R20). No puede escribir `CANCELADO` ni motivo. */
  updateAlive(id: string, data: NewOrder, actorId: string, now: Date): Promise<'ok' | 'not_found'>;

  /** UNICO camino hacia `CANCELADO` y hacia el motivo (R26, R28, R29). */
  cancelAlive(id: string, reason: string, actorId: string, now: Date): Promise<'ok' | 'not_found'>;

  /** Borrado LOGICO (R31): marca `deleted_at`, jamas borra la fila ni libera el correlativo. */
  softDeleteAlive(id: string, actorId: string, now: Date): Promise<'ok' | 'not_found'>;
}
