import { z } from 'zod';

import { requirePermission, type Actor } from './actor';
import { ActionNotAllowedError, OrderNotFoundError } from './errors';
import { toOrderCustomer, type OrderCustomer } from './order-customer';
import { remainingPackages } from './order-delivery';
import { formatOrderNumber } from './order-number';
import type { OrderScope } from './order-scope';

import type { OrderDeliveryRepository } from '../ports/order-delivery-repository';
import type { OrderRepository } from '../ports/order-repository';
import type { OrderWriteRepository } from '../ports/order-write-repository';

import type { CustomerCatalog } from '@/lib/modules/clientes';
import type { DeliverableBatch, FinishedBatchCatalog, PresentationCatalog } from '@/lib/modules/inventario';

export type OrderDeliveryLineView = {
  readonly presentationLineId: string;
  readonly presentationName: string;
  readonly orderedPackages: number;
  readonly deliveredPackages: number;
  readonly remainingPackages: number;
  /** Vacio cuando a la linea ya no le falta ningun envase. */
  readonly batches: readonly DeliverableBatch[];
};

export type OrderDeliveryView = {
  readonly orderId: string;
  readonly numberText: string;
  /** El cliente del pedido si sigue vivo; si no tiene o esta dado de baja, `null`. */
  readonly customer: OrderCustomer | null;
  readonly lines: readonly OrderDeliveryLineView[];
};

export type GetOrderDeliveryDeps = {
  readonly orders: OrderRepository;
  readonly deliveries: Pick<OrderDeliveryRepository, 'sumDeliveredPackages'>;
  readonly lines: Pick<OrderWriteRepository, 'findPresentationLinesForFinish'>;
  readonly presentations: Pick<PresentationCatalog, 'findRefs'>;
  readonly finishedBatches: FinishedBatchCatalog;
  readonly customerCatalog: Pick<CustomerCatalog, 'findAliveRefById'>;
};

const orderIdSchema = z.string().uuid();

async function aliveCustomer(
  customerCatalog: Pick<CustomerCatalog, 'findAliveRefById'>,
  customerId: string | null,
  companyId: string,
): Promise<OrderCustomer | null> {
  if (customerId === null) return null;
  const ref = await customerCatalog.findAliveRefById(customerId, companyId);
  return ref === null ? null : toOrderCustomer(ref);
}

/** Lo que el sheet de entrega necesita de un pedido `TERMINADO`. */
export function createGetOrderDelivery(
  deps: GetOrderDeliveryDeps,
): (orderId: string, actor: Actor | null | undefined) => Promise<OrderDeliveryView> {
  return async function getOrderDelivery(orderId, actor) {
    requirePermission(actor, 'entregas.modificar');

    if (!orderIdSchema.safeParse(orderId).success) throw new OrderNotFoundError();
    const scope: OrderScope = { companyId: actor.companyId };

    const order = await deps.orders.findAliveById(orderId, scope);
    if (order === null) throw new OrderNotFoundError();
    if (order.status !== 'TERMINADO') throw new ActionNotAllowedError();

    const [lines, delivered] = await Promise.all([
      deps.lines.findPresentationLinesForFinish(orderId, scope),
      deps.deliveries.sumDeliveredPackages(orderId, scope),
    ]);
    const states = lines.map((line) => {
      const state = { presentationLineId: line.id, orderedPackages: line.packages, deliveredPackages: delivered.get(line.id) ?? 0 };
      return { line, state, remaining: remainingPackages(state) };
    });

    const presentationIds = [...new Set(lines.map((line) => line.presentationId))];
    const pendingPresentationIds = [
      ...new Set(states.filter((s) => s.remaining > 0).map((s) => s.line.presentationId)),
    ];
    const [refs, batches, customer] = await Promise.all([
      deps.presentations.findRefs(presentationIds, actor.companyId),
      pendingPresentationIds.length === 0
        ? Promise.resolve([])
        : deps.finishedBatches.findDeliverableBatches(order.recipeId, pendingPresentationIds, actor.companyId),
      aliveCustomer(deps.customerCatalog, order.customerId, actor.companyId),
    ]);
    const nameById = new Map(refs.map((ref) => [ref.id, ref.name]));

    return {
      orderId: order.id,
      numberText: formatOrderNumber(order.number),
      customer,
      lines: states.map(({ line, state, remaining }) => {
        const presentationName = nameById.get(line.presentationId);
        // La clave foranea de la linea garantiza la presentacion: si falta, la base esta rota.
        if (presentationName === undefined) {
          throw new Error(`getOrderDelivery: la presentacion ${line.presentationId} no aparece`);
        }
        return {
          presentationLineId: line.id,
          presentationName,
          orderedPackages: state.orderedPackages,
          deliveredPackages: state.deliveredPackages,
          remainingPackages: remaining,
          batches: remaining === 0 ? [] : batches.filter((batch) => batch.presentationId === line.presentationId),
        };
      }),
    };
  };
}
