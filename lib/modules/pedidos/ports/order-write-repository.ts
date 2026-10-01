import type { OrderStatus } from '../domain/order-classification';
import type { OrderScope } from '../domain/order-scope';
import type { NewOrder, OrderEdit, OrderRow } from '../domain/order-view';

/** La fila que bloquea `lockAliveById`, con `reservedAt`: quien vuelve a comprobar el plazo bajo
 *  el candado -el proceso diario- lo necesita sin pedir una segunda lectura. */
export type LockedOrderRow = OrderRow & { readonly reservedAt: Date | null };

/**
 * Puerto de escritura del pedido DENTRO de una transaccion compartida con `inventario`
 * (`OrderUnitOfWork`, `ports/order-unit-of-work.ts`). No reemplaza a `OrderRepository`: ese
 * sigue siendo quien lee y lista; este solo escribe, y lo hace sobre el cliente -global o
 * transaccional- que le dio la fabrica que lo construyo.
 *
 * Mismo criterio de ambito que `OrderRepository`: `scope: OrderScope` es SIEMPRE el ultimo
 * parametro (`tests/guards/guard-ambito-empresa-pedidos.test.ts`), y «de otra empresa» vuelve
 * como `null` o `'not_found'`, igual que «no existe».
 */
export interface OrderWriteRepository {
  /** `SELECT ... FOR UPDATE` del pedido vivo: `null` si no existe, esta borrado o es de otra
   *  empresa. El dominio repite su comprobacion de transicion sobre la fila que esto devuelve,
   *  nunca sobre la que leyo antes de abrir la transaccion. */
  lockAliveById(id: string, scope: OrderScope): Promise<LockedOrderRow | null>;

  /** Alta dentro de la transaccion ya abierta. El choque del correlativo (indice unico
   *  `orders_company_year_sequence_key`) se deja SUBIR: la transaccion entera ya quedo
   *  abortada, y quien reintenta con una transaccion nueva es `OrderUnitOfWork`. */
  create(
    data: NewOrder,
    year: number,
    actorId: string,
    now: Date,
    ingredientsCost: string | null,
    scope: OrderScope,
  ): Promise<OrderRow>;

  /** Edicion como reemplazo completo. No puede escribir `CANCELADO` ni motivo. */
  updateAlive(
    id: string,
    data: OrderEdit,
    actorId: string,
    now: Date,
    ingredientsCost: string | null,
    scope: OrderScope,
  ): Promise<'ok' | 'not_found'>;

  /** `actorId` admite `null`: la caducidad automatica cancela sin que nadie la haya pedido. */
  cancelAlive(
    id: string,
    reason: string,
    actorId: string | null,
    now: Date,
    scope: OrderScope,
  ): Promise<'ok' | 'not_found'>;

  /** Borrado logico: marca `deleted_at`, jamas borra la fila ni libera el correlativo. */
  softDeleteAlive(id: string, actorId: string, now: Date, scope: OrderScope): Promise<'ok' | 'not_found'>;

  /** `UPDATE` condicional `WHERE status = from`: `'stale'` si la fila sigue viva pero ya no
   *  esta en `from` -otra operacion la movio entre el bloqueo y esta escritura-. `actorId`
   *  admite `null` para los cambios que hace el sistema, como el desbloqueo al entrar material. */
  setStatus(
    id: string,
    from: OrderStatus,
    to: OrderStatus,
    actorId: string | null,
    now: Date,
    scope: OrderScope,
  ): Promise<'ok' | 'not_found' | 'stale'>;

  /** Sustituye el importe, tambien por `null`, y sella `updated_at`/`updated_by` sin tocar los
   *  datos de negocio ni el estado. */
  setIngredientsCost(
    id: string,
    ingredientsCost: string | null,
    actorId: string | null,
    now: Date,
    scope: OrderScope,
  ): Promise<'ok' | 'not_found'>;

  /** Escribe `reserved_at` SIN mover `updated_at`: apartar o liberar material no es una edicion
   *  que el usuario deba ver en esa columna. */
  setReservedAt(id: string, reservedAt: Date | null, scope: OrderScope): Promise<void>;
}
