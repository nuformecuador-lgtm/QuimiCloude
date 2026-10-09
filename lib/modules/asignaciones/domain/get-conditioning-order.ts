// lib/modules/asignaciones/domain/get-conditioning-order.ts
/**
 * El detalle del acondicionador: la misma fila de «Por acondicionar» para un unico pedido. Abre un
 * `POR_ACONDICIONAR` o `EN_ACONDICIONAMIENTO` de la empresa, lo acondicione quien lo acondicione, y
 * un `TERMINADO` solo si lo acondiciono el actor. Todo lo demas es `order_not_found`, el mismo error
 * que un pedido inexistente, para no revelar que existe en otro estado o de otra persona.
 */
import { z } from 'zod';

import { requirePermission, type Actor } from './actor';
import { composeConditioningOrderDetail, type ConditioningOrderDetail } from './conditioning-order-view';
import { OrderNotFoundError, ValidationError } from './errors';

import type { ComposeOrderRowsDeps } from './compose-order-rows';
import type { ConditioningTeamRepository } from '../ports/conditioning-team-repository';

import type { OrderCatalog } from '@/lib/modules/pedidos';

const DETAIL_STATUSES = ['POR_ACONDICIONAR', 'EN_ACONDICIONAMIENTO', 'TERMINADO'] as const;
const TEAM_STATUSES: ReadonlySet<string> = new Set(['EN_ACONDICIONAMIENTO', 'TERMINADO']);

const getConditioningOrderSchema = z.strictObject({
  orderId: z.string().uuid(),
});

export type GetConditioningOrderDeps = ComposeOrderRowsDeps & {
  readonly orders: OrderCatalog;
  readonly team: ConditioningTeamRepository;
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
    if (summary.status === 'TERMINADO' && summary.conditionedBy !== actor.id) throw new OrderNotFoundError();

    const team = TEAM_STATUSES.has(summary.status)
      ? await deps.team.listByOrderInCompany(actor.companyId, orderId)
      : [];
    const detail = await composeConditioningOrderDetail(deps, actor.companyId, summary, team);
    if (detail === undefined) throw new OrderNotFoundError();
    return detail;
  };
}
