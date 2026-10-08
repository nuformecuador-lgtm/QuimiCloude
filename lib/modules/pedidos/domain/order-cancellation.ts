import type { OrderStatus } from './order-classification';

import type { OrderTransactionScope, OrderUnitOfWork } from '../ports/order-unit-of-work';

/**
 * Desde `ENTREGADO` no se cancela -eso seria una devolucion, que no existe- y desde `CANCELADO`
 * tampoco, porque es final. `POR_EMPACAR` y `EN_EMPAQUE` tampoco: el material ya se consumio al
 * dejar el pedido `POR_EMPACAR`, asi que cancelar dejaria un consumo sin pedido que lo explique;
 * un problema en esos dos estados se corrige con un ajuste de inventario. Es un mapa total para
 * que un estado nuevo no compile hasta decidir si es cancelable.
 *
 * `BLOQUEADO` si se cancela, con las mismas reglas que un `PENDIENTE` y su motivo: es la unica
 * salida manual de un pedido sin material -no se fabrico nada, y esperar lotes no es cancelar-.
 * No tiene nada apartado, asi que `releaseForOrder` no encuentra filas y no falla por eso.
 */
const CANCELLABLE = {
  PENDIENTE: true,
  EN_CURSO: true,
  BLOQUEADO: true,
  POR_EMPACAR: false,
  EN_EMPAQUE: false,
  ENTREGADO: false,
  CANCELADO: false,
} as const satisfies Record<OrderStatus, boolean>;

export function isCancellableStatus(status: OrderStatus): boolean {
  return CANCELLABLE[status];
}

export type OrderCancellationOutcome = 'ok' | 'not_found' | 'not_cancellable';

export type OrderCancellationInput = {
  readonly id: string;
  readonly reason: string;
  readonly actorId: string;
  readonly now: Date;
  readonly companyId: string;
};

/**
 * Cancela dentro de una transaccion ya abierta: bloquea la fila, vuelve a comprobar el estado
 * bajo el candado -otra operacion pudo moverlo desde la lectura de quien llama-, escribe el
 * motivo y libera todo lo apartado con quien cancela como autor. No abre ni cierra nada: quien
 * llama decide si la transaccion es propia o compartida.
 */
export async function cancelInsideTransaction(
  scope: OrderTransactionScope,
  input: OrderCancellationInput,
): Promise<OrderCancellationOutcome> {
  const { id, reason, actorId, now, companyId } = input;

  const locked = await scope.orders.lockAliveById(id, { companyId });
  if (locked === null) return 'not_found';
  if (!isCancellableStatus(locked.status)) return 'not_cancellable';

  // El actor queda como autor de la ultima modificacion, sin tocar el de creacion.
  const cancelled = await scope.orders.cancelAlive(id, reason, actorId, now, { companyId });
  if (cancelled === 'not_found') return 'not_found';

  await scope.reservations.releaseForOrder({
    orderId: id,
    companyId,
    reason: 'release',
    actorId,
    now,
  });
  await scope.orders.setReservedAt(id, null, { companyId });
  return 'ok';
}

/** Cancelar un pedido vivo de una empresa, por encargo de otro modulo: no exige permiso ni
 *  valida el motivo, eso es de quien llama. */
export type OrderCancellation = {
  cancelAliveById(
    id: string,
    companyId: string,
    reason: string,
    actorId: string,
    now: Date,
  ): Promise<OrderCancellationOutcome>;
};

export type CancelAliveOrderDeps = {
  readonly unitOfWork: OrderUnitOfWork;
};

export function createCancelAliveOrder(deps: CancelAliveOrderDeps): OrderCancellation['cancelAliveById'] {
  return async function cancelAliveById(id, companyId, reason, actorId, now) {
    return deps.unitOfWork.run((scope) => cancelInsideTransaction(scope, { id, reason, actorId, now, companyId }));
  };
}
