// lib/modules/asignaciones/domain/get-conditioning-order.ts
/**
 * El detalle del acondicionador: la misma fila de «Por acondicionar» para un unico pedido. Abre un
 * `POR_ACONDICIONAR` o `EN_ACONDICIONAMIENTO` de la empresa, lo acondicione quien lo acondicione, y
 * un `TERMINADO` o `ENTREGADO` solo si lo acondiciono el actor. Todo lo demas es `order_not_found`,
 * el mismo error que un pedido inexistente, para no revelar que existe en otro estado o de otra
 * persona.
 *
 * Los datos de lote solo los ve quien acondiciona, que es el unico que puede escribirlos.
 */
import { z } from 'zod';

import { requirePermission, type Actor } from './actor';
import { composeConditioningOrderDetail, type ConditioningOrderDetail } from './conditioning-order-view';
import { OrderNotFoundError, ValidationError } from './errors';

import type { ComposeOrderRowsDeps } from './compose-order-rows';
import type { ConditioningTeamRepository } from '../ports/conditioning-team-repository';

import type { FinishedBatchLabels } from '@/lib/modules/inventario';
import type { OrderCatalog } from '@/lib/modules/pedidos';

const DETAIL_STATUSES = ['POR_ACONDICIONAR', 'EN_ACONDICIONAMIENTO', 'TERMINADO', 'ENTREGADO'] as const;
const CLOSED_STATUSES: ReadonlySet<string> = new Set(['TERMINADO', 'ENTREGADO']);
const TEAM_STATUSES: ReadonlySet<string> = new Set(['EN_ACONDICIONAMIENTO', 'TERMINADO', 'ENTREGADO']);

const getConditioningOrderSchema = z.strictObject({
  orderId: z.string().uuid(),
});

export type GetConditioningOrderDeps = ComposeOrderRowsDeps & {
  readonly orders: OrderCatalog;
  readonly team: ConditioningTeamRepository;
  readonly batches: Pick<FinishedBatchLabels, 'listOfOrder'>;
};

export function createGetConditioningOrder(
  deps: GetConditioningOrderDeps,
): (actor: Actor | null | undefined, input: unknown) => Promise<ConditioningOrderDetail> {
  return async function getConditioningOrder(
    actor: Actor | null | undefined,
    input: unknown,
  ): Promise<ConditioningOrderDetail> {
    // Autorizar va antes de validar la entrada y antes de tocar ningun puerto.
    requirePermission(actor, 'acondicionamiento.modificar');

    const parsed = getConditioningOrderSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const { orderId } = parsed.data;

    const summaryPage = await deps.orders.listAliveSummariesByIds(actor.companyId, [orderId], DETAIL_STATUSES, 1, 1);
    const summary = summaryPage.items[0];
    if (summary === undefined) throw new OrderNotFoundError();
    const isConditioner = summary.conditionedBy === actor.id;
    if (CLOSED_STATUSES.has(summary.status) && !isConditioner) throw new OrderNotFoundError();

    const team = TEAM_STATUSES.has(summary.status)
      ? await deps.team.listByOrderInCompany(actor.companyId, orderId)
      : [];
    const batches =
      summary.status !== 'POR_ACONDICIONAR' && isConditioner
        ? await deps.batches.listOfOrder(actor.companyId, orderId)
        : null;
    const detail = await composeConditioningOrderDetail(deps, actor.companyId, summary, team, batches);
    if (detail === undefined) throw new OrderNotFoundError();
    return detail;
  };
}
