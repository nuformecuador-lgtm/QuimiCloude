import { requirePermission, type Actor } from './actor';
import { ActionNotAllowedError } from './errors';
import type { OrderStatus } from './order-classification';

import type { OrderDeliveryHistoryReader } from '../ports/order-delivery-void-repository';
import type { OrderRepository } from '../ports/order-repository';
import type { OrderWriteRepository } from '../ports/order-write-repository';

import type { CustomerCatalog } from '@/lib/modules/clientes';
import type { PeopleDirectory } from '@/lib/modules/identity';
import type { BatchLotDirectory, PresentationCatalog } from '@/lib/modules/inventario';

export type OrderDeliveryHistoryView = {
  readonly orderId: string;
  readonly numberText: string;
  readonly orderStatus: OrderStatus;
  readonly deliveries: readonly {
    readonly id: string;
    /** ISO */
    readonly createdAt: string;
    /** Tambien el de un cliente dado de baja. */
    readonly customerName: string;
    /** Tambien el de una persona dada de baja. */
    readonly authorName: string;
    readonly presentations: readonly {
      readonly presentationLineId: string;
      readonly presentationName: string;
      /** Suma de sus lotes. */
      readonly packages: number;
      readonly batches: readonly { readonly batchId: string; readonly lot: string; readonly packages: number }[];
      readonly void: { readonly reason: string; readonly authorName: string; readonly createdAt: string } | null;
    }[];
  }[];
};

export type ListOrderDeliveriesDeps = {
  readonly orders: OrderRepository;
  readonly lines: Pick<OrderWriteRepository, 'findPresentationLinesForFinish'>;
  readonly history: OrderDeliveryHistoryReader;
  readonly presentations: Pick<PresentationCatalog, 'findRefs'>;
  readonly customerCatalog: Pick<CustomerCatalog, 'findRefsIncludingDeleted'>;
  readonly people: Pick<PeopleDirectory, 'findRefsIncludingDeletedInCompany'>;
  readonly batchLots: BatchLotDirectory;
  readonly now?: () => Date;
};

/** Las entregas de un pedido, con lo anulado de cada una. */
export function createListOrderDeliveries(
  deps: ListOrderDeliveriesDeps,
): (orderId: string, actor: Actor | null | undefined) => Promise<OrderDeliveryHistoryView> {
  void deps;
  return async function listOrderDeliveries(orderId, actor) {
    requirePermission(actor, 'pedidos.consultar');
    void orderId;
    throw new ActionNotAllowedError('listOrderDeliveries: sin implementar');
  };
}
