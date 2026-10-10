// lib/modules/asignaciones/domain/conditioning-order-view.ts
/**
 * La fila comun de «Por acondicionar» y del detalle del acondicionador: una sola composicion para
 * las dos, para que la lista y el detalle nunca muestren datos distintos de un mismo pedido.
 */
import { batchesByPresentation, hasBatchData, missingBatchDataLines } from './conditioning-batch-data';
import { composeOrderRows, type ComposeOrderRowsDeps } from './compose-order-rows';
import type { OrderDistributionLineView } from './order-distribution-view';
import type { ConditioningTeamMemberRow } from '../ports/conditioning-team-repository';

import type { FinishedBatchOfOrderLine } from '@/lib/modules/inventario';
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

export type ConditioningTeamMemberView = {
  readonly userId: string;
  readonly displayName: string;
  readonly origin:
    | { readonly kind: 'direct' }
    | { readonly kind: 'workGroup'; readonly workGroupId: string; readonly workGroupName: string };
};

/** Una linea del reparto con su lote. Sin datos, los tres campos van `null` y `provisionalLot` trae
 *  el lote automatico; con datos, al reves. Fechas `AAAA-MM-DD`. */
export type ConditioningBatchLineView = {
  /** `null` = la linea no tiene lote de produccion. */
  readonly batchId: string | null;
  readonly presentationId: string;
  readonly presentationName: string | null;
  readonly packagingName: string | null;
  readonly packages: number;
  readonly provisionalLot: string | null;
  readonly lot: string | null;
  readonly expiryDate: string | null;
  readonly productionDate: string | null;
};

export type ConditioningBatchData = {
  readonly lines: readonly ConditioningBatchLineView[];
  readonly missingCount: number;
};

/** La fila del detalle con su equipo; vacio en `POR_ACONDICIONAR`, que todavia no lo tiene.
 *  `batchData` es `null` para quien no puede escribir los datos de lote. */
export type ConditioningOrderDetail = ConditioningOrderRow & {
  readonly team: readonly ConditioningTeamMemberView[];
  readonly batchData: ConditioningBatchData | null;
};

export async function composeConditioningOrderRows(
  deps: ComposeOrderRowsDeps,
  companyId: string,
  orders: readonly AssignedOrderSummary[],
): Promise<readonly ConditioningOrderRow[]> {
  const { rows } = await composeConditioningOrderRowsWithNames(deps, companyId, orders, []);
  return rows;
}

/** Una sola lectura de personas para quien acondiciona y para el equipo de un pedido. */
export async function composeConditioningOrderDetail(
  deps: ComposeOrderRowsDeps,
  companyId: string,
  order: AssignedOrderSummary,
  team: readonly ConditioningTeamMemberRow[],
  batches: readonly FinishedBatchOfOrderLine[] | null,
): Promise<ConditioningOrderDetail | undefined> {
  const { rows, names } = await composeConditioningOrderRowsWithNames(
    deps,
    companyId,
    [order],
    team.map((member) => member.userId),
  );
  const row = rows[0];
  if (row === undefined) return undefined;
  return {
    ...row,
    team: team.map((member) => ({
      userId: member.userId,
      displayName: names.get(member.userId) ?? member.userId,
      origin:
        member.workGroupId === null || member.workGroupName === null
          ? { kind: 'direct' }
          : { kind: 'workGroup', workGroupId: member.workGroupId, workGroupName: member.workGroupName },
    })),
    batchData: batches === null ? null : composeBatchData(row.presentationLines, batches),
  };
}

function composeBatchData(
  lines: readonly OrderDistributionLineView[],
  batches: readonly FinishedBatchOfOrderLine[],
): ConditioningBatchData {
  const byPresentation = batchesByPresentation(batches);
  return {
    lines: lines.map((line) => {
      const batch = byPresentation.get(line.presentationId);
      const withData = hasBatchData(batch);
      return {
        batchId: batch?.batchId ?? null,
        presentationId: line.presentationId,
        presentationName: line.presentationName,
        packagingName: line.packagingName,
        packages: line.packages,
        provisionalLot: batch !== undefined && !withData ? batch.lot : null,
        lot: withData ? (batch?.lot ?? null) : null,
        expiryDate: withData ? (batch?.expiryDate ?? null) : null,
        productionDate: withData ? (batch?.productionDate ?? null) : null,
      };
    }),
    missingCount: missingBatchDataLines(lines, batches),
  };
}

async function composeConditioningOrderRowsWithNames(
  deps: ComposeOrderRowsDeps,
  companyId: string,
  orders: readonly AssignedOrderSummary[],
  extraPersonIds: readonly string[],
): Promise<{ readonly rows: readonly ConditioningOrderRow[]; readonly names: ReadonlyMap<string, string> }> {
  const composed = await composeOrderRows(deps, companyId, orders);

  const personIds = [
    ...new Set([
      ...orders.map((order) => order.conditionedBy).filter((id): id is string => id !== null),
      ...extraPersonIds,
    ]),
  ];
  // Incluye a las personas dadas de baja: quien acondiciono y su equipo siguen teniendo nombre.
  const personRefs =
    personIds.length === 0
      ? []
      : await deps.people.findRefsIncludingDeletedInCompany(companyId, personIds, deps.now?.() ?? new Date());
  const names = new Map(personRefs.map((ref) => [ref.id, ref.displayName] as const));

  const rows = orders.map((order) => {
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
      conditionedByName: order.conditionedBy === null ? null : (names.get(order.conditionedBy) ?? order.conditionedBy),
      conditionedById: order.conditionedBy,
    };
  });
  return { rows, names };
}
