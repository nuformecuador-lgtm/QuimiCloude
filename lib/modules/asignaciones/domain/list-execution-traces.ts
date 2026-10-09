import { z } from 'zod';

import { requirePermission, type Actor } from './actor';
import { ValidationError } from './errors';
import { buildExecutionTrace, type TraceDuration } from './execution-trace';

import type { ExecutionEntryRecord } from './execution-entry';
import type { ExecutedOrdersFilter, ExecutionLogRepository } from '../ports/execution-log-repository';
import type { PeopleDirectory, PersonRef } from '@/lib/modules/identity';
import {
  formatOrderNumber,
  ORDER_STATUS_VALUES,
  type OrderCatalog,
  type OrderStatus,
  type Page,
} from '@/lib/modules/pedidos';

const MAX_ORDER_NUMBER_LENGTH = 20;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/** Una fecha civil `YYYY-MM-DD` que existe en el calendario: `2026-02-30` no pasa. */
const civilDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((day) => {
    const parsed = new Date(`${day}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day;
  });

const listExecutionTracesSchema = z.strictObject({
  page: z.number().int().min(1).default(1),
  pageSize: z.union([z.literal(10), z.literal(25)]).default(10),
  // Un texto con letras no es invalido: no casa con ningun numero y deja la lista vacia.
  orderNumber: z
    .string()
    .trim()
    .max(MAX_ORDER_NUMBER_LENGTH)
    .optional()
    .transform((text) => (text === '' ? undefined : text)),
  userId: z.string().uuid().optional(),
  from: civilDateSchema.optional(),
  to: civilDateSchema.optional(),
  cancelledOnly: z.boolean().default(false),
});

export type ExecutionTraceListInput = z.input<typeof listExecutionTracesSchema>;

export type ExecutionTracePerson = { readonly userId: string; readonly displayName: string };

export type ExecutionTraceRow = {
  readonly orderId: string;
  readonly numberText: string;
  readonly status: OrderStatus;
  readonly deleted: boolean;
  readonly people: readonly ExecutionTracePerson[];
  readonly firstAt: Date;
  readonly lastAt: Date;
  readonly duration: TraceDuration;
  readonly goBackCount: number;
};

export type ExecutionTraceList = {
  readonly page: Page<ExecutionTraceRow>;
  readonly personOptions: readonly ExecutionTracePerson[];
};

export type ListExecutionTracesDeps = {
  readonly log: ExecutionLogRepository;
  readonly orders: OrderCatalog;
  readonly people: PeopleDirectory;
};

function startOfDayUtc(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/** Dias UTC con los dos extremos inclusivos: `to` se convierte en el dia siguiente, exclusivo. */
function toExecutedOrdersFilter(input: {
  readonly userId?: string;
  readonly from?: string;
  readonly to?: string;
}): ExecutedOrdersFilter {
  return {
    ...(input.userId === undefined ? {} : { userId: input.userId }),
    ...(input.from === undefined ? {} : { occurredFrom: startOfDayUtc(input.from) }),
    ...(input.to === undefined
      ? {}
      : { occurredBefore: new Date(startOfDayUtc(input.to).getTime() + MILLISECONDS_PER_DAY) }),
  };
}

function emptyPage(page: number, pageSize: number): Page<ExecutionTraceRow> {
  return { items: [], total: 0, page, pageSize, totalPages: 1 };
}

/** Agrupa por pedido conservando el orden en que el registro devuelve las anotaciones. */
export function groupEntriesByOrder(
  entries: readonly ExecutionEntryRecord[],
): Map<string, ExecutionEntryRecord[]> {
  const byOrder = new Map<string, ExecutionEntryRecord[]>();
  for (const entry of entries) {
    const group = byOrder.get(entry.orderId);
    if (group === undefined) byOrder.set(entry.orderId, [entry]);
    else group.push(entry);
  }
  return byOrder;
}

export async function findPeopleByIds(
  people: PeopleDirectory,
  companyId: string,
  userIds: readonly string[],
  now: Date,
): Promise<Map<string, PersonRef>> {
  if (userIds.length === 0) return new Map();
  const refs = await people.findRefsIncludingDeletedInCompany(companyId, userIds, now);
  return new Map(refs.map((ref) => [ref.id, ref]));
}

async function listPersonOptions(
  deps: ListExecutionTracesDeps,
  companyId: string,
  now: Date,
): Promise<readonly ExecutionTracePerson[]> {
  const userIds = await deps.log.listUserIdsWithEntries(companyId);
  const refs = await findPeopleByIds(deps.people, companyId, userIds, now);
  return [...refs.values()]
    .map((ref) => ({ userId: ref.id, displayName: ref.displayName }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'es') || a.userId.localeCompare(b.userId));
}

export function createListExecutionTraces(
  deps: ListExecutionTracesDeps,
): (actor: Actor | null | undefined, input: unknown, now: Date) => Promise<ExecutionTraceList> {
  return async function listExecutionTraces(
    actor: Actor | null | undefined,
    input: unknown,
    now: Date,
  ): Promise<ExecutionTraceList> {
    // Autorizar va antes de validar la entrada y antes de tocar ningun puerto.
    requirePermission(actor, 'dashboard.consultar');

    const parsed = listExecutionTracesSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const { page, pageSize, orderNumber, cancelledOnly } = parsed.data;
    const companyId = actor.companyId;

    const listPage = async (): Promise<Page<ExecutionTraceRow>> => {
      const orderIds = await deps.log.listExecutedOrderIds(companyId, toExecutedOrdersFilter(parsed.data));
      if (orderIds.length === 0) return emptyPage(page, pageSize);

      const ordersPage = await deps.orders.listSummariesByIdsIncludingDeleted(
        companyId,
        orderIds,
        cancelledOnly ? ['CANCELADO'] : ORDER_STATUS_VALUES,
        page,
        pageSize,
        orderNumber === undefined ? undefined : { numberContains: orderNumber },
      );
      if (ordersPage.items.length === 0) return { ...ordersPage, items: [] };

      const entries = await deps.log.listEntriesForOrders(
        companyId,
        ordersPage.items.map((order) => order.id),
      );
      const byOrder = groupEntriesByOrder(entries);

      const traces = ordersPage.items.flatMap((order) => {
        const orderEntries = byOrder.get(order.id);
        if (orderEntries === undefined) return [];
        return [{ order, trace: buildExecutionTrace(orderEntries, order, now) }];
      });

      const userIds = [...new Set(traces.flatMap(({ trace }) => trace.userIds))];
      const refs = await findPeopleByIds(deps.people, companyId, userIds, now);

      const items: ExecutionTraceRow[] = traces.map(({ order, trace }) => ({
        orderId: order.id,
        numberText: formatOrderNumber(order.number),
        status: order.status,
        deleted: order.deleted,
        people: trace.userIds.flatMap((userId) => {
          const ref = refs.get(userId);
          return ref === undefined ? [] : [{ userId, displayName: ref.displayName }];
        }),
        firstAt: trace.firstAt,
        lastAt: trace.lastAt,
        duration: trace.duration,
        goBackCount: trace.goBackCount,
      }));

      return {
        items,
        total: ordersPage.total,
        page: ordersPage.page,
        pageSize: ordersPage.pageSize,
        totalPages: ordersPage.totalPages,
      };
    };

    const [pageResult, personOptions] = await Promise.all([
      listPage(),
      listPersonOptions(deps, companyId, now),
    ]);
    return { page: pageResult, personOptions };
  };
}
