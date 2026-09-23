// lib/modules/pedidos/domain/expire-stale-orders.ts
/**
 * El proceso diario que cancela los pedidos `PENDIENTE` cuya reserva caduco. Recorre las
 * EMPRESAS una por una y, dentro de cada una, sus candidatos por lotes: ninguna consulta lee
 * pedidos de mas de una empresa a la vez.
 *
 * Cada pedido se cancela en su PROPIA transaccion: un fallo no arrastra a los demas, y la misma
 * transaccion que abre `pedidos` ya bloquea la fila y sirve para recomprobar bajo el candado
 * antes de tocar nada -otra ejecucion, solapada o repetida, encuentra el pedido ya `CANCELADO`
 * y no hace nada-.
 *
 * Sin actor: es una operacion del sistema, sin permiso que comprobar, y la unica puerta es el
 * secreto del handler.
 */
import { EXPIRED_ORDER_REASON, ORDER_RESERVATION_TTL_DAYS } from './order-expiry';

import type { OrderUnitOfWork } from '../ports/order-unit-of-work';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

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
  /** Las empresas a recorrer, una vuelta por cada una. */
  readonly listCompanyIds: () => Promise<readonly string[]>;
  /** Los candidatos de UNA empresa: `PENDIENTE`, vivos y con la reserva vencida. */
  readonly findExpirable: (
    companyId: string,
    threshold: Date,
    limit: number,
  ) => Promise<readonly string[]>;
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
 * CUANDO un pedido caducado falla, se anota y se sigue con los demas: ni un fallo de
 * `unitOfWork.run` detiene el lote, ni una empresa que falla detiene a las siguientes.
 * `findExpirable` ya trae solo `PENDIENTE`, sin borrar y con la reserva vencida; bajo el
 * candado se repite la comprobacion de estado por si la fila cambio entre el lote y el
 * bloqueo.
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

    const companyIds = await deps.listCompanyIds();

    for (const companyId of companyIds) {
      if (Date.now() >= deadline) break;

      while (Date.now() < deadline) {
        const batch = await deps.findExpirable(companyId, threshold, BATCH_LIMIT);
        if (batch.length === 0) break;

        for (const id of batch) {
          try {
            const cancelled = await expireOne(deps.unitOfWork, id, companyId, instant, threshold);
            if (cancelled) expired += 1;
          } catch {
            failed.push({ id, companyId });
          }
        }

        if (batch.length < BATCH_LIMIT) break;
      }
    }

    return { expired, failed };
  };
}

/** Una transaccion por pedido: bloquea, recomprueba plazo y estado, y si sigue vencido cancela y
 *  libera. */
async function expireOne(
  unitOfWork: OrderUnitOfWork,
  id: string,
  companyId: string,
  instant: Date,
  threshold: Date,
): Promise<boolean> {
  const scope = { companyId };

  return unitOfWork.run(async (transaction) => {
    const locked = await transaction.orders.lockAliveById(id, scope);
    // Idempotencia: otra ejecucion ya lo canceló, dejó de estar vivo, o una edicion intercalada
    // reinicio el plazo o dejo el pedido sin material apartado entre el lote y el candado.
    if (
      locked === null ||
      locked.status !== 'PENDIENTE' ||
      locked.reservedAt === null ||
      locked.reservedAt > threshold
    ) {
      return false;
    }

    const cancelled = await transaction.orders.cancelAlive(
      id,
      EXPIRED_ORDER_REASON,
      null,
      instant,
      scope,
    );
    if (cancelled === 'not_found') return false;

    await transaction.reservations.releaseForOrder({
      orderId: id,
      companyId,
      reason: 'expire',
      actorId: null,
      now: instant,
    });
    await transaction.orders.setReservedAt(id, null, scope);
    return true;
  });
}
