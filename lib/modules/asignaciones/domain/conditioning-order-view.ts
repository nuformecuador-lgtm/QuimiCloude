// lib/modules/asignaciones/domain/conditioning-order-view.ts
/**
 * La fila comun de «Por acondicionar» y del detalle del acondicionador: una sola composicion para
 * las dos, para que la lista y el detalle nunca muestren datos distintos de un mismo pedido.
 */
import { composeOrderRows, type ComposeOrderRowsDeps } from './compose-order-rows';
import type { OrderDistributionLineView } from './order-distribution-view';

import { formatOrderNumber, type AssignedOrderSummary, type OrderStatus } from '@/lib/modules/pedidos';

export type ConditioningOrderRow = {
  readonly id: string;
  readonly numberText: string;
  /** `null` = la receta ya no se encuentra. */
  readonly recipeName: string | null;
  /** Cadena decimal, nunca `number`. */
  readonly quantity: string;
  /** La unidad de `quantity`; los dos `null` = pedido sin unidad, la cifra va sola. */
  readonly unitId: string | null;
  readonly unitLabel: string | null;
  /** El reparto completo en orden de alta; vacio = sin reparto. */
  readonly presentationLines: readonly OrderDistributionLineView[];
  readonly status: OrderStatus;
  /** Los dos `null` en `POR_ACONDICIONAR`: todavia nadie lo acondiciona. */
  readonly conditionedByName: string | null;
  readonly conditionedById: string | null;
};

export async function composeConditioningOrderRows(
  deps: ComposeOrderRowsDeps,
  companyId: string,
  orders: readonly AssignedOrderSummary[],
): Promise<readonly ConditioningOrderRow[]> {
  const composed = await composeOrderRows(deps, companyId, orders);

  const conditionerIds = [
    ...new Set(orders.map((order) => order.conditionedBy).filter((id): id is string => id !== null)),
  ];
  // Incluye a las personas dadas de baja: quien acondiciono sigue teniendo nombre en la fila.
  const conditionerRefs =
    conditionerIds.length === 0
      ? []
      : await deps.people.findRefsIncludingDeletedInCompany(companyId, conditionerIds, deps.now?.() ?? new Date());
  const conditionerNames = new Map(conditionerRefs.map((ref) => [ref.id, ref.displayName] as const));

  return orders.map((order) => {
    const rowComposed = composed.get(order.id);
    return {
      id: order.id,
      numberText: formatOrderNumber(order.number),
      recipeName: rowComposed?.recipeName ?? null,
      quantity: order.quantity,
      unitId: order.unitId,
      unitLabel: rowComposed?.unitLabel ?? null,
      presentationLines: rowComposed?.presentationLines ?? [],
      status: order.status,
      conditionedByName:
        order.conditionedBy === null ? null : (conditionerNames.get(order.conditionedBy) ?? order.conditionedBy),
      conditionedById: order.conditionedBy,
    };
  });
}
