// lib/modules/asignaciones/domain/list-delivered-conditioned-orders.ts
/**
 * «Entregados» del acondicionador: los pedidos `ENTREGADO` de la empresa que acondiciono el propio
 * actor, para corregir sus datos de lote despues de la entrega. Misma fila, orden y filtro que su
 * «Terminados», con otro estado.
 */
import { z } from 'zod';

import { requirePermission, type Actor } from './actor';
import { composeOrderRows, type ComposeOrderRowsDeps } from './compose-order-rows';
import { ValidationError } from './errors';

import type { FinishedOrderView } from './finished-order-view';

import { formatOrderNumber, type OrderCatalog, type Page } from '@/lib/modules/pedidos';

const listDeliveredConditionedOrdersSchema = z.strictObject({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).optional(),
});

export type ListDeliveredConditionedOrdersDeps = ComposeOrderRowsDeps & {
  readonly orders: OrderCatalog;
};

export function createListDeliveredConditionedOrders(
  deps: ListDeliveredConditionedOrdersDeps,
): (actor: Actor | null | undefined, input: unknown) => Promise<Page<FinishedOrderView>> {
  return async function listDeliveredConditionedOrders(
    actor: Actor | null | undefined,
    input: unknown,
  ): Promise<Page<FinishedOrderView>> {
    // Autorizar va antes de validar la entrada y antes de tocar ningun puerto.
    requirePermission(actor, 'acondicionamiento.modificar');

    const parsed = listDeliveredConditionedOrdersSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const { page, pageSize } = parsed.data;

    // El filtro va en la consulta para que `total` y la paginacion describan lo que se muestra.
    const ordersPage = await deps.orders.listAliveSummariesInCompany(
      actor.companyId,
      ['ENTREGADO'],
      'finished_recent_first',
      page,
      pageSize,
      { conditionedBy: actor.id },
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
