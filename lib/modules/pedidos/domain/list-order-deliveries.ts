import { z } from 'zod';

import { requirePermission, type Actor } from './actor';
import { OrderNotFoundError } from './errors';
import type { OrderStatus } from './order-classification';
import { formatOrderCustomerName } from './order-customer';
import { formatOrderNumber } from './order-number';
import type { OrderScope } from './order-scope';

import type { DeliveryHistoryRow, OrderDeliveryHistoryReader } from '../ports/order-delivery-void-repository';
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

type DeliveryView = OrderDeliveryHistoryView['deliveries'][number];
type PresentationView = DeliveryView['presentations'][number];
type HistoryLine = DeliveryHistoryRow['lines'][number];

const orderIdSchema = z.string().uuid();

const SHORT_ID_LENGTH = 8;

/** Lo que se ve cuando un nombre no vuelve de su catalogo: la lista no se cae por un dato ausente. */
function nameOrShortId(names: ReadonlyMap<string, string>, id: string): string {
  return names.get(id) ?? id.slice(0, SHORT_ID_LENGTH);
}

type Names = {
  readonly presentationByLine: ReadonlyMap<string, string>;
  readonly customers: ReadonlyMap<string, string>;
  readonly people: ReadonlyMap<string, string>;
  readonly lots: ReadonlyMap<string, string>;
};

function toPresentationView(presentationLineId: string, lines: readonly HistoryLine[], names: Names): PresentationView {
  // Las lineas de una presentacion se anulan juntas: la primera dice como estan todas.
  const voided = lines[0]?.void ?? null;
  return {
    presentationLineId,
    presentationName: nameOrShortId(names.presentationByLine, presentationLineId),
    packages: lines.reduce((sum, line) => sum + line.packages, 0),
    batches: lines.map((line) => ({
      batchId: line.batchId,
      lot: nameOrShortId(names.lots, line.batchId),
      packages: line.packages,
    })),
    void:
      voided === null
        ? null
        : {
            reason: voided.reason,
            authorName: nameOrShortId(names.people, voided.createdBy),
            createdAt: voided.createdAt.toISOString(),
          },
  };
}

function toDeliveryView(row: DeliveryHistoryRow, names: Names): DeliveryView {
  const byPresentation = new Map<string, HistoryLine[]>();
  for (const line of row.lines) {
    const group = byPresentation.get(line.presentationLineId) ?? [];
    group.push(line);
    byPresentation.set(line.presentationLineId, group);
  }
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    customerName: nameOrShortId(names.customers, row.customerId),
    authorName: nameOrShortId(names.people, row.createdBy),
    presentations: [...byPresentation].map(([presentationLineId, lines]) =>
      toPresentationView(presentationLineId, lines, names),
    ),
  };
}

async function resolveNames(
  deps: ListOrderDeliveriesDeps,
  orderId: string,
  rows: readonly DeliveryHistoryRow[],
  now: Date,
  scope: OrderScope,
): Promise<Names> {
  const lines = rows.flatMap((row) => row.lines);
  const customerIds = [...new Set(rows.map((row) => row.customerId))];
  const personIds = [
    ...new Set([
      ...rows.map((row) => row.createdBy),
      ...lines.flatMap((line) => (line.void === null ? [] : [line.void.createdBy])),
    ]),
  ];
  const batchIds = [...new Set(lines.map((line) => line.batchId))];

  const [presentationByLine, customers, people, lots] = await Promise.all([
    deps.lines.findPresentationLinesForFinish(orderId, scope).then(async (orderLines) => {
      const presentationIds = [...new Set(orderLines.map((line) => line.presentationId))];
      const refs = await deps.presentations.findRefs(presentationIds, scope.companyId);
      const nameById = new Map(refs.map((ref) => [ref.id, ref.name]));
      const byLine = new Map<string, string>();
      for (const line of orderLines) {
        const name = nameById.get(line.presentationId);
        if (name !== undefined) byLine.set(line.id, name);
      }
      return byLine;
    }),
    deps.customerCatalog
      .findRefsIncludingDeleted(customerIds, scope.companyId)
      .then((refs) => new Map(refs.map((ref) => [ref.id, formatOrderCustomerName(ref)]))),
    deps.people
      .findRefsIncludingDeletedInCompany(scope.companyId, personIds, now)
      .then((refs) => new Map(refs.map((ref) => [ref.id, ref.displayName]))),
    deps.batchLots.findLots(batchIds, scope.companyId),
  ]);
  return { presentationByLine, customers, people, lots };
}

/** Las entregas de un pedido, con lo anulado de cada una. */
export function createListOrderDeliveries(
  deps: ListOrderDeliveriesDeps,
): (orderId: string, actor: Actor | null | undefined) => Promise<OrderDeliveryHistoryView> {
  const now = deps.now ?? (() => new Date());

  return async function listOrderDeliveries(orderId, actor) {
    requirePermission(actor, 'pedidos.consultar');

    if (!orderIdSchema.safeParse(orderId).success) throw new OrderNotFoundError();
    const scope: OrderScope = { companyId: actor.companyId };

    const order = await deps.orders.findAliveById(orderId, scope);
    if (order === null) throw new OrderNotFoundError();

    const rows = await deps.history.listByOrder(orderId, scope);
    const header = { orderId: order.id, numberText: formatOrderNumber(order.number), orderStatus: order.status };
    if (rows.length === 0) return { ...header, deliveries: [] };

    const names = await resolveNames(deps, orderId, rows, now(), scope);
    return { ...header, deliveries: rows.map((row) => toDeliveryView(row, names)) };
  };
}
