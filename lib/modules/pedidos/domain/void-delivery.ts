import { z } from 'zod';

import { requirePermission, type Actor } from './actor';
import {
  ActionNotAllowedError,
  DeliveryAlreadyVoidedError,
  DeliveryNotFoundError,
  OrderNotFoundError,
  ValidationError,
} from './errors';
import { DELIVERY_MAX_ALLOCATIONS } from './order-delivery';
import type { OrderScope } from './order-scope';

import type {
  DeliveryForVoid,
  DeliveryLineForVoid,
  OrderDeliveryVoidRepository,
} from '../ports/order-delivery-void-repository';
import type {
  OrderDeliveryVoidTransactionScope,
  OrderDeliveryVoidUnitOfWork,
} from '../ports/order-delivery-void-unit-of-work';
import type { OrderRepository } from '../ports/order-repository';

export type VoidDeliveryResult = {
  readonly status: 'voided' | 'already_registered';
  readonly orderStatus: 'TERMINADO' | 'ENTREGADO';
};

export type VoidDeliveryDeps = {
  readonly unitOfWork: OrderDeliveryVoidUnitOfWork;
  /** Sobre el cliente global, fuera de la transaccion. */
  readonly voids: Pick<OrderDeliveryVoidRepository, 'findByKey' | 'findDelivery'>;
  /** Solo para responder con el estado actual cuando la clave de anulacion ya estaba registrada. */
  readonly orders: OrderRepository;
  readonly now?: () => Date;
};

const voidDeliverySchema = z
  .strictObject({
    deliveryId: z.string().uuid(),
    voidKey: z.string().uuid(),
    presentationLineIds: z.array(z.string().uuid()).min(1).max(DELIVERY_MAX_ALLOCATIONS),
    reason: z.string().trim().min(1).max(500),
  })
  .refine(({ presentationLineIds }) => new Set(presentationLineIds).size === presentationLineIds.length);

type VoidDeliveryInput = z.infer<typeof voidDeliverySchema>;

/** Deshace la transaccion cuando otra peticion registro la misma clave despues de la lectura previa
 *  (se ve ya con el pedido bloqueado o choca en el `INSERT`); fuera se vuelve a leer la anulacion ya
 *  confirmada. */
class VoidAlreadyRegisteredSignal extends Error {
  constructor() {
    super('la clave de anulacion ya estaba registrada');
  }
}

/** Todas las lineas de entrega de las presentaciones pedidas, en todos sus lotes. Una presentacion
 *  se anula entera o no se anula: basta una linea ya anulada para rechazar la peticion completa. */
function linesToVoid(
  deliveryLines: readonly DeliveryLineForVoid[],
  presentationLineIds: readonly string[],
): readonly DeliveryLineForVoid[] {
  const requested = new Set(presentationLineIds);
  const selected = deliveryLines.filter((line) => requested.has(line.presentationLineId));
  const present = new Set(selected.map((line) => line.presentationLineId));
  if (presentationLineIds.some((id) => !present.has(id))) throw new ValidationError();
  if (selected.some((line) => line.voided)) throw new DeliveryAlreadyVoidedError();
  return selected;
}

async function voidInTransaction(
  tx: OrderDeliveryVoidTransactionScope,
  input: VoidDeliveryInput,
  delivery: DeliveryForVoid,
  actorId: string,
  now: Date,
  scope: OrderScope,
): Promise<VoidDeliveryResult> {
  const order = await tx.orders.lockAliveById(delivery.orderId, scope);
  if (order === null) throw new OrderNotFoundError();
  // La clave antes que el estado: si otra peticion con la misma clave confirmo mientras esta
  // esperaba el bloqueo, tiene que responder que ya estaba registrada.
  if ((await tx.voids.findByKey(input.voidKey, scope)) !== null) throw new VoidAlreadyRegisteredSignal();
  if (order.status !== 'TERMINADO' && order.status !== 'ENTREGADO') throw new ActionNotAllowedError();

  const lines = linesToVoid(await tx.voids.findDeliveryLines(delivery.id, scope), input.presentationLineIds);

  const created = await tx.voids.create(
    { voidKey: input.voidKey, deliveryId: delivery.id, reason: input.reason, actorId, now },
    scope,
  );
  if (created.kind === 'duplicate_key') throw new VoidAlreadyRegisteredSignal();

  const added = await tx.voids.addLines(
    created.id,
    delivery.id,
    lines.map((line) => line.id),
    scope,
  );
  if (added === 'already_voided') throw new DeliveryAlreadyVoidedError();

  const returned = await tx.finishedGoods.returnForDeliveryVoid({
    companyId: scope.companyId,
    orderId: delivery.orderId,
    orderDeliveryVoidId: created.id,
    lines: lines.map((line) => ({ batchId: line.batchId, quantity: line.quantity })),
    actorId,
    now,
  });
  if (returned.kind === 'batch_not_found') {
    throw new Error(`voidDelivery: el lote ${returned.batchId} de una linea de entrega no aparece`);
  }

  if (order.status === 'ENTREGADO') {
    const moved = await tx.orders.setStatus(delivery.orderId, 'ENTREGADO', 'TERMINADO', actorId, now, scope);
    if (moved !== 'ok') throw new Error(`voidDelivery: setStatus devolvio '${moved}' con el pedido bloqueado`);
  }
  return { status: 'voided', orderStatus: 'TERMINADO' };
}

/** Responde con el estado actual del pedido de la anulacion registrada: la clave es unica por
 *  empresa, no por entrega. */
async function alreadyRegistered(
  orders: OrderRepository,
  orderId: string,
  scope: OrderScope,
): Promise<VoidDeliveryResult> {
  const order = await orders.findAliveById(orderId, scope);
  if (order === null) throw new OrderNotFoundError();
  if (order.status !== 'TERMINADO' && order.status !== 'ENTREGADO') throw new ActionNotAllowedError();
  return { status: 'already_registered', orderStatus: order.status };
}

/** Anula presentaciones enteras de una entrega y devuelve sus envases a los lotes de origen. */
export function createVoidDelivery(
  deps: VoidDeliveryDeps,
): (input: unknown, actor: Actor | null | undefined) => Promise<VoidDeliveryResult> {
  const now = deps.now ?? (() => new Date());

  return async function voidDelivery(input, actor) {
    requirePermission(actor, 'entregas.anular');

    const parsed = voidDeliverySchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const data = parsed.data;
    const scope: OrderScope = { companyId: actor.companyId };

    // La clave antes que la entrega y el estado: un reintento sobre un pedido que la primera ya
    // devolvio a TERMINADO, o que despues se volvio a entregar, responde que ya estaba registrada.
    const registered = await deps.voids.findByKey(data.voidKey, scope);
    if (registered !== null) return alreadyRegistered(deps.orders, registered.orderId, scope);

    const delivery = await deps.voids.findDelivery(data.deliveryId, scope);
    if (delivery === null) throw new DeliveryNotFoundError();

    try {
      return await deps.unitOfWork.run((tx) => voidInTransaction(tx, data, delivery, actor.id, now(), scope));
    } catch (error) {
      if (!(error instanceof VoidAlreadyRegisteredSignal)) throw error;
      const raced = await deps.voids.findByKey(data.voidKey, scope);
      if (raced === null) throw new Error('voidDelivery: duplicate_key sin anulacion con esa clave');
      return alreadyRegistered(deps.orders, raced.orderId, scope);
    }
  };
}
