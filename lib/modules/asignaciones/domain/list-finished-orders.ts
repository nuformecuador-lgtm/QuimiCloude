// lib/modules/asignaciones/domain/list-finished-orders.ts
/**
 * Los pedidos `ENTREGADO` de toda la empresa, sin filtro por usuario asignado: la fecha de
 * terminado los ordena y la composicion de responsables no descarta al actor, porque aqui no hay
 * un «yo» al que restar de la lista.
 */
import { z } from 'zod';

import { requirePermission, type Actor } from './actor';
import { composeOrderRows, type ComposeOrderRowsDeps } from './compose-order-rows';
import { ValidationError } from './errors';

import type { FinishedOrderView } from './finished-order-view';

import { formatOrderNumber, type OrderCatalog, type Page } from '@/lib/modules/pedidos';

const listFinishedOrdersSchema = z.strictObject({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).optional(),
});

export type ListFinishedOrdersDeps = ComposeOrderRowsDeps & {
  readonly orders: OrderCatalog;
};

export function createListFinishedOrders(
  deps: ListFinishedOrdersDeps,
): (actor: Actor | null | undefined, input: unknown) => Promise<Page<FinishedOrderView>> {
  return async function listFinishedOrders(
    actor: Actor | null | undefined,
    input: unknown,
  ): Promise<Page<FinishedOrderView>> {
    // Autorizar va antes de validar la entrada y antes de tocar ningun puerto.
    requirePermission(actor, 'terminados.consultar');

    const parsed = listFinishedOrdersSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const { page, pageSize } = parsed.data;

    const ordersPage = await deps.orders.listAliveSummariesInCompany(
      actor.companyId,
      ['ENTREGADO'],
      'finished_recent_first',
      page,
      pageSize,
    );

    const composed = await composeOrderRows(deps, actor.companyId, ordersPage.items);

    const items: FinishedOrderView[] = ordersPage.items.map((row) => {
      const rowComposed = composed.get(row.id);
      return {
        id: row.id,
        numberText: formatOrderNumber(row.number),
        recipeName: rowComposed?.recipeName ?? null,
        quantity: row.quantity,
        presentationLines: rowComposed?.presentationLines ?? [],
        unitId: row.unitId,
        unitLabel: rowComposed?.unitLabel ?? null,
        finishedAt: row.finishedAt,
        responsibles: rowComposed?.responsibles ?? [],
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
