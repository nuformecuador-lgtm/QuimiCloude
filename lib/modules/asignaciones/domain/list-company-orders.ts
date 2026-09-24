// lib/modules/asignaciones/domain/list-company-orders.ts
/**
 * «Todos»: los pedidos de la empresa en cualquier estado, sin filtro por usuario asignado. Sin
 * filtro de estado o con una mezcla, el orden es el de la lista de trabajo; filtrado por
 * exactamente `ENTREGADO`, el orden es el de terminados y la fecha de terminado se pinta.
 */
import { z } from 'zod';

import { requirePermission, type Actor } from './actor';
import { composeOrderRows, type ComposeOrderRowsDeps } from './compose-order-rows';
import { ValidationError } from './errors';

import type { CompanyOrderView } from './company-order-view';

import {
  formatOrderNumber,
  ORDER_STATUS_VALUES,
  type OrderCatalog,
  type OrderStatus,
  type OrderSummaryOrdering,
  type Page,
} from '@/lib/modules/pedidos';

const listCompanyOrdersSchema = z.strictObject({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).optional(),
  statuses: z.array(z.enum(ORDER_STATUS_VALUES)).min(1).optional(),
});

export type ListCompanyOrdersDeps = ComposeOrderRowsDeps & {
  readonly orders: OrderCatalog;
};

/** Solo `['ENTREGADO']`, y nada mas, ordena como «Terminados». Cualquier otra combinacion,
 *  aunque incluya `ENTREGADO`, usa el orden de la lista de trabajo. */
function resolveOrdering(statuses: readonly OrderStatus[]): OrderSummaryOrdering {
  return statuses.length === 1 && statuses[0] === 'ENTREGADO' ? 'finished_recent_first' : 'work_queue';
}

export function createListCompanyOrders(
  deps: ListCompanyOrdersDeps,
): (actor: Actor | null | undefined, input: unknown) => Promise<Page<CompanyOrderView>> {
  return async function listCompanyOrders(
    actor: Actor | null | undefined,
    input: unknown,
  ): Promise<Page<CompanyOrderView>> {
    // Autorizar va antes de validar la entrada y antes de tocar ningun puerto.
    requirePermission(actor, 'pedidos.consultar');

    const parsed = listCompanyOrdersSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const { page, pageSize, statuses } = parsed.data;

    const statusesEfectivos = [...new Set(statuses ?? ORDER_STATUS_VALUES)];
    const ordering = resolveOrdering(statusesEfectivos);

    const ordersPage = await deps.orders.listAliveSummariesInCompany(
      actor.companyId,
      statusesEfectivos,
      ordering,
      page,
      pageSize,
    );

    const composed = await composeOrderRows(deps, actor.companyId, ordersPage.items);

    const items: CompanyOrderView[] = ordersPage.items.map((row) => {
      const rowComposed = composed.get(row.id);
      return {
        id: row.id,
        numberText: formatOrderNumber(row.number),
        recipeName: rowComposed?.recipeName ?? null,
        quantity: row.quantity,
        presentationName: rowComposed?.presentationName ?? null,
        priority: row.priority,
        status: row.status,
        responsibles: rowComposed?.responsibles ?? [],
        finishedAt: row.finishedAt,
      };
    });

    return {
      items,
      total: ordersPage.total,
      page: ordersPage.page,
      pageSize: ordersPage.pageSize,
      totalPages: ordersPage.totalPages,
    };
  };
}
