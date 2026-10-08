import { z } from 'zod';

import { requirePermission, type Actor } from './actor';
import {
  ActionNotAllowedError,
  DeliveryBatchInsufficientError,
  DeliveryBatchNotFoundError,
  DeliveryExceedsRemainingError,
  OrderNotFoundError,
  ValidationError,
} from './errors';
import { requireAliveCustomer } from './order-customer';
import { checkDelivery, DELIVERY_MAX_ALLOCATIONS, type DeliveryAllocation } from './order-delivery';
import type { OrderScope } from './order-scope';
import { assertTransition } from './order-transitions';

import type { NewOrderDeliveryLine } from '../ports/order-delivery-repository';
import type { OrderDeliveryTransactionScope, OrderDeliveryUnitOfWork } from '../ports/order-delivery-unit-of-work';
import type { OrderRepository } from '../ports/order-repository';
import type { FinishPackingLine } from '../ports/order-write-repository';

import type { CustomerCatalog } from '@/lib/modules/clientes';

export type DeliverOrderResult = {
  readonly status: 'delivered' | 'already_registered';
  readonly orderStatus: 'TERMINADO' | 'ENTREGADO';
};

export type DeliverOrderDeps = {
  readonly customerCatalog: Pick<CustomerCatalog, 'findAliveRefById'>;
  readonly unitOfWork: OrderDeliveryUnitOfWork;
  /** Solo para responder con el estado actual cuando la clave de entrega ya estaba registrada. */
  readonly orders: OrderRepository;
  readonly now?: () => Date;
};

const deliverOrderSchema = z
  .strictObject({
    orderId: z.string().uuid(),
    deliveryKey: z.string().uuid(),
    customerId: z.string(),
    allocations: z
      .array(
        z.strictObject({
          presentationLineId: z.string().uuid(),
          batchId: z.string().uuid(),
          packages: z.number().int().min(1),
        }),
      )
      .min(1)
      .max(DELIVERY_MAX_ALLOCATIONS),
  })
  .refine(
    ({ allocations }) =>
      new Set(allocations.map((a) => `${a.presentationLineId}:${a.batchId}`)).size === allocations.length,
  );

type DeliverOrderInput = z.infer<typeof deliverOrderSchema>;

/** Deshace la transaccion cuando la clave de entrega ya existe; fuera se responde con el estado
 *  que dejo la primera entrega. */
class DeliveryAlreadyRegisteredSignal extends Error {
  constructor() {
    super('la clave de entrega ya estaba registrada');
  }
}

function groupByLine(allocations: readonly DeliveryAllocation[]): ReadonlyMap<string, DeliveryAllocation[]> {
  const byLine = new Map<string, DeliveryAllocation[]>();
  for (const allocation of allocations) {
    const group = byLine.get(allocation.presentationLineId) ?? [];
    group.push(allocation);
    byLine.set(allocation.presentationLineId, group);
  }
  return byLine;
}

async function deliverInTransaction(
  tx: OrderDeliveryTransactionScope,
  input: DeliverOrderInput,
  actorId: string,
  now: Date,
  scope: OrderScope,
): Promise<DeliverOrderResult> {
  const order = await tx.orders.lockAliveById(input.orderId, scope);
  if (order === null) throw new OrderNotFoundError();
  if (order.status !== 'TERMINADO') throw new ActionNotAllowedError();

  const lines = await tx.orders.findPresentationLinesForFinish(input.orderId, scope);
  const lineById = new Map<string, FinishPackingLine>(lines.map((line) => [line.id, line]));
  if (input.allocations.some((a) => !lineById.has(a.presentationLineId))) throw new ValidationError();

  // Antes de comprobar el tope: un reintento con la misma clave tiene que responder que ya estaba
  // registrada, no que ahora excede lo que falta por su propia primera entrega.
  const created = await tx.deliveries.create(
    {
      deliveryKey: input.deliveryKey,
      orderId: input.orderId,
      customerId: input.customerId,
      actorId,
      now,
    },
    scope,
  );
  if (created.kind === 'duplicate_key') throw new DeliveryAlreadyRegisteredSignal();

  const delivered = await tx.deliveries.sumDeliveredPackages(input.orderId, scope);
  const check = checkDelivery(
    lines.map((line) => ({
      presentationLineId: line.id,
      orderedPackages: line.packages,
      deliveredPackages: delivered.get(line.id) ?? 0,
    })),
    null,
    input.allocations,
  );
  if (check.kind !== 'ok') throw new DeliveryExceedsRemainingError(`entrega de ${input.orderId}: ${check.kind}`);

  const deliveryLines: NewOrderDeliveryLine[] = [];
  for (const [presentationLineId, allocations] of groupByLine(input.allocations)) {
    const line = lineById.get(presentationLineId);
    if (line === undefined) throw new ValidationError();
    const outcome = await tx.finishedGoods.dispatchForDelivery({
      companyId: scope.companyId,
      orderId: input.orderId,
      orderDeliveryId: created.id,
      recipeId: order.recipeId,
      presentationId: line.presentationId,
      allocations: allocations.map((a) => ({ batchId: a.batchId, packages: a.packages })),
      actorId,
      now,
    });
    if (outcome.kind === 'batch_not_found') throw new DeliveryBatchNotFoundError(outcome.batchId);
    if (outcome.kind === 'insufficient') throw new DeliveryBatchInsufficientError(outcome.batchId);
    for (const dispatched of outcome.lines) {
      deliveryLines.push({ presentationLineId, ...dispatched });
    }
  }
  await tx.deliveries.addLines(created.id, deliveryLines, scope);

  if (!check.completesOrder) return { status: 'delivered', orderStatus: 'TERMINADO' };

  const moved = await tx.orders.setStatus(input.orderId, 'TERMINADO', 'ENTREGADO', actorId, now, scope);
  if (moved !== 'ok') throw new Error(`deliverOrder: setStatus devolvio '${moved}' con el pedido bloqueado`);
  return { status: 'delivered', orderStatus: 'ENTREGADO' };
}

async function alreadyRegistered(
  orders: OrderRepository,
  orderId: string,
  scope: OrderScope,
): Promise<DeliverOrderResult> {
  const order = await orders.findAliveById(orderId, scope);
  if (order === null) throw new OrderNotFoundError();
  if (order.status !== 'TERMINADO' && order.status !== 'ENTREGADO') throw new ActionNotAllowedError();
  return { status: 'already_registered', orderStatus: order.status };
}

/** Registra una entrega de producto terminado de un pedido `TERMINADO`. */
export function createDeliverOrder(
  deps: DeliverOrderDeps,
): (input: unknown, actor: Actor | null | undefined) => Promise<DeliverOrderResult> {
  const now = deps.now ?? (() => new Date());

  return async function deliverOrder(input, actor) {
    requirePermission(actor, 'entregas.modificar');

    const parsed = deliverOrderSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const data = parsed.data;

    await requireAliveCustomer(deps.customerCatalog, data.customerId, actor.companyId);

    assertTransition('TERMINADO', 'ENTREGADO');

    const scope: OrderScope = { companyId: actor.companyId };
    try {
      return await deps.unitOfWork.run((tx) => deliverInTransaction(tx, data, actor.id, now(), scope));
    } catch (error) {
      if (error instanceof DeliveryAlreadyRegisteredSignal) return alreadyRegistered(deps.orders, data.orderId, scope);
      throw error;
    }
  };
}
