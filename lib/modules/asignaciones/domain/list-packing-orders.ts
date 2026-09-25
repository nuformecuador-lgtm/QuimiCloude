// lib/modules/asignaciones/domain/list-packing-orders.ts
/**
 * «Por empacar»: los pedidos `POR_EMPACAR` y `EN_EMPAQUE` de toda la empresa, sin filtro por
 * asignacion (D2) y con el mismo orden y los mismos tamanos de pagina que la lista de trabajo
 * (R16).
 */
import { z } from 'zod';

import { requirePermission, type Actor } from './actor';
import { ValidationError } from './errors';
import { composePackingOrderRows, type PackingOrderRow, type PackingOrderViewDeps } from './packing-order-view';

import { type OrderCatalog, type Page } from '@/lib/modules/pedidos';

const PACKING_STATUSES = ['POR_EMPACAR', 'EN_EMPAQUE'] as const;

const listPackingOrdersSchema = z.strictObject({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).optional(),
});

export type ListPackingOrdersDeps = PackingOrderViewDeps & {
  readonly orders: OrderCatalog;
};

export function createListPackingOrders(
  deps: ListPackingOrdersDeps,
): (actor: Actor | null | undefined, input: unknown) => Promise<Page<PackingOrderRow>> {
  return async function listPackingOrders(
    actor: Actor | null | undefined,
    input: unknown,
  ): Promise<Page<PackingOrderRow>> {
    // R13: autorizar va antes de validar la entrada y antes de tocar ningun puerto.
    requirePermission(actor, 'empaque.modificar');

    const parsed = listPackingOrdersSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const { page, pageSize } = parsed.data;

    const ordersPage = await deps.orders.listAliveSummariesInCompany(
      actor.companyId,
      PACKING_STATUSES,
      'work_queue',
      page,
      pageSize,
    );

    const items = await composePackingOrderRows(deps, actor.companyId, ordersPage.items);

    return {
      items,
      total: ordersPage.total,
      page: ordersPage.page,
      pageSize: ordersPage.pageSize,
      totalPages: ordersPage.totalPages,
    };
  };
}
