// lib/modules/pedidos/domain/expire-stale-orders.ts
/**
 * El proceso diario que cancela los pedidos `PENDIENTE` cuya reserva caduco. Una transaccion POR
 * PEDIDO: un fallo no arrastra a los demas, y la misma transaccion que abre `pedidos` ya bloquea
 * la fila y sirve para recomprobar bajo el candado antes de tocar nada -otra ejecucion, solapada
 * o repetida, encuentra el pedido ya `CANCELADO` y no hace nada-.
 *
 * Sin actor: es una operacion del sistema, sin permiso que comprobar, y la unica puerta es el
 * secreto del handler.
 */
import { EXPIRED_ORDER_REASON, ORDER_RESERVATION_TTL_DAYS } from './order-expiry';

import type { OrderUnitOfWork } from '../ports/order-unit-of-work';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/** Un lote de candidatos: solo lo que hace falta para bloquear su fila y liberar su material. */
export type ExpirableOrderCandidate = {
  readonly id: string;
  readonly companyId: string;
};

/** Un pedido que fallo, con lo minimo para el evento del log: sin PII. */
export type ExpiredOrderFailure = {
  readonly id: string;
  readonly companyId: string;
};

export type ExpireStaleOrdersResult = {
  readonly expired: number;
  readonly failed: readonly ExpiredOrderFailure[];
};

export type ExpireStaleOrdersDeps = {
  readonly findExpirable: (
    threshold: Date,
    limit: number,
  ) => Promise<readonly ExpirableOrderCandidate[]>;
  readonly unitOfWork: OrderUnitOfWork;
  /** Mismo patron que `create-order.ts`: el reloj se inyecta y `lib/composition` lo da real. */
  readonly now?: () => Date;
  /** Cuanto puede correr esta vuelta antes de dejar el resto para la siguiente ejecucion, en
   *  milisegundos. Inyectable solo para que el test no espere 240 s de verdad. */
  readonly budgetMs?: number;
};

const BATCH_LIMIT = 100;
const DEFAULT_BUDGET_MS = 240_000;

/**
 * CUANDO un pedido caducado falla, se anota y se sigue con los demas (R26): ni un fallo de
 * `unitOfWork.run` detiene el lote. `findExpirable` ya trae solo `PENDIENTE`, sin borrar y con
 * la reserva vencida (R22); bajo el candado se repite la comprobacion de estado por si la fila
 * cambio entre el lote y el bloqueo.
 */
export function createExpireStaleOrders(
  deps: ExpireStaleOrdersDeps,
): () => Promise<ExpireStaleOrdersResult> {
  const now = deps.now ?? (() => new Date());
  const budgetMs = deps.budgetMs ?? DEFAULT_BUDGET_MS;

  return async function expireStaleOrders(): Promise<ExpireStaleOrdersResult> {
    const instant = now();
    const threshold = new Date(instant.getTime() - ORDER_RESERVATION_TTL_DAYS * MILLISECONDS_PER_DAY);
    const deadline = Date.now() + budgetMs;

    let expired = 0;
    const failed: ExpiredOrderFailure[] = [];

    while (Date.now() < deadline) {
      const batch = await deps.findExpirable(threshold, BATCH_LIMIT);
      if (batch.length === 0) break;

      for (const candidate of batch) {
        try {
          const cancelled = await expireOne(deps.unitOfWork, candidate, instant);
          if (cancelled) expired += 1;
        } catch {
          failed.push({ id: candidate.id, companyId: candidate.companyId });
        }
      }

      if (batch.length < BATCH_LIMIT) break;
    }

    return { expired, failed };
  };
}

/** Una transaccion por pedido: bloquea, recomprueba y, si sigue vivo, cancela y libera. */
async function expireOne(
  unitOfWork: OrderUnitOfWork,
  candidate: ExpirableOrderCandidate,
  instant: Date,
): Promise<boolean> {
  const scope = { companyId: candidate.companyId };

  return unitOfWork.run(async (transaction) => {
    const locked = await transaction.orders.lockAliveById(candidate.id, scope);
    // Idempotencia (R25): otra ejecucion ya lo canceló, o dejó de estar vivo entre el lote y el
    // candado.
    if (locked === null || locked.status !== 'PENDIENTE') return false;

    const cancelled = await transaction.orders.cancelAlive(
      candidate.id,
      EXPIRED_ORDER_REASON,
      null,
      instant,
      scope,
    );
    if (cancelled === 'not_found') return false;

    await transaction.reservations.releaseForOrder({
      orderId: candidate.id,
      companyId: candidate.companyId,
      reason: 'expire',
      actorId: null,
      now: instant,
    });
    await transaction.orders.setReservedAt(candidate.id, null, scope);
    return true;
  });
}
