// lib/modules/asignaciones/domain/list-conditioning-orders.ts
/**
 * «Por acondicionar»: los pedidos `POR_ACONDICIONAR` y `EN_ACONDICIONAMIENTO` de toda la empresa,
 * sin filtro por asignacion ni por quien acondiciona, en el orden de la lista de trabajo.
 */
import { z } from 'zod';

import { requirePermission, type Actor } from './actor';
import { composeConditioningOrderRows, type ConditioningOrderRow } from './conditioning-order-view';
import { ValidationError } from './errors';

import type { ComposeOrderRowsDeps } from './compose-order-rows';

import type { OrderCatalog, Page } from '@/lib/modules/pedidos';

const CONDITIONING_STATUSES = ['POR_ACONDICIONAR', 'EN_ACONDICIONAMIENTO'] as const;

const listConditioningOrdersSchema = z.strictObject({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).optional(),
});

export type ListConditioningOrdersDeps = ComposeOrderRowsDeps & {
  readonly orders: OrderCatalog;
};

export function createListConditioningOrders(
  deps: ListConditioningOrdersDeps,
): (actor: Actor | null | undefined, input: unknown) => Promise<Page<ConditioningOrderRow>> {
  return async function listConditioningOrders(
    actor: Actor | null | undefined,
    input: unknown,
  ): Promise<Page<ConditioningOrderRow>> {
    // Autorizar va antes de validar la entrada y antes de tocar ningun puerto.
    requirePermission(actor, 'acondicionamiento.modificar');

    const parsed = listConditioningOrdersSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const { page, pageSize } = parsed.data;

    const ordersPage = await deps.orders.listAliveSummariesInCompany(
      actor.companyId,
      CONDITIONING_STATUSES,
      'work_queue',
      page,
      pageSize,
    );

    const items = await composeConditioningOrderRows(deps, actor.companyId, ordersPage.items);

    return {
      items,
      total: ordersPage.total,
      page: ordersPage.page,
      pageSize: ordersPage.pageSize,
      totalPages: ordersPage.totalPages,
    };
  };
}
