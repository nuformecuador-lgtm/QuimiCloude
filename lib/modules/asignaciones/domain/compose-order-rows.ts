// lib/modules/asignaciones/domain/compose-order-rows.ts
/**
 * Compone receta, reparto, unidad y responsables para una pagina de pedidos, con una llamada por cada
 * dependencia sin importar cuantas filas traiga la pagina. Extraido de `list-assigned-orders.ts`
 * para que «Mis asignados», «Terminados» y «Todos» compartan la misma composicion en vez de tres
 * copias que podrian divergir.
 *
 * No excluye a nadie de los responsables: quien llama decide si descarta al propio actor.
 */
import {
  distributionPresentationIds,
  toDistributionLines,
  unitLabelOf,
  type OrderDistributionLineView,
} from './order-distribution-view';
import { compareResponsibles, toOrigin } from './responsible-order';

import type { OrderResponsible } from './assignment-view';
import type { OrderAssignmentRepository } from '../ports/order-assignment-repository';

import type { AssignedOrderSummary } from '@/lib/modules/pedidos';
import type { PeopleDirectory } from '@/lib/modules/identity';
import type { PresentationCatalog } from '@/lib/modules/inventario';
import type { RecipeCatalog } from '@/lib/modules/recetas';
import type { UnitCatalog } from '@/lib/modules/unidades';

export type ComposeOrderRowsDeps = {
  readonly assignments: OrderAssignmentRepository;
  readonly recipes: RecipeCatalog;
  readonly people: PeopleDirectory;
  readonly presentations: PresentationCatalog;
  readonly units: UnitCatalog;
  readonly now?: () => Date;
};

export type ComposedOrderRow = {
  readonly recipeName: string | null;
  /** En el orden de alta; vacio = sin reparto. */
  readonly presentationLines: readonly OrderDistributionLineView[];
  /** `null` = pedido sin unidad: la cantidad se muestra sola. */
  readonly unitLabel: string | null;
  readonly responsibles: readonly OrderResponsible[];
};

export async function composeOrderRows(
  deps: ComposeOrderRowsDeps,
  companyId: string,
  orders: readonly AssignedOrderSummary[],
): Promise<ReadonlyMap<string, ComposedOrderRow>> {
  const recipeIds = [...new Set(orders.map((row) => row.recipeId))];
  const recipes =
    recipeIds.length === 0 ? [] : await deps.recipes.findRefsIncludingDeleted(recipeIds, companyId);
  const recipeNames = new Map(recipes.map((recipe) => [recipe.id, recipe.name]));

  const presentationIds = distributionPresentationIds(orders);
  const presentations =
    presentationIds.length === 0 ? [] : await deps.presentations.findRefs(presentationIds, companyId);
  const presentationNames = new Map(presentations.map((presentation) => [presentation.id, presentation.name]));

  const unitIds = [
    ...new Set(orders.map((row) => row.unitId).filter((id): id is string => id !== null)),
  ];
  const units = unitIds.length === 0 ? [] : await deps.units.findRefs(unitIds, companyId);
  const unitLabels = new Map(units.map((unit) => [unit.id, unitLabelOf(unit)]));

  const orderIds = orders.map((row) => row.id);
  const assignmentRows =
    orderIds.length === 0 ? [] : await deps.assignments.listByOrdersInCompany(companyId, orderIds);

  const userIds = [...new Set(assignmentRows.map((row) => row.userId))];
  const peopleRefs =
    userIds.length === 0
      ? []
      : await deps.people.findRefsIncludingDeletedInCompany(companyId, userIds, deps.now?.() ?? new Date());
  const displayNames = new Map(peopleRefs.map((ref) => [ref.id, ref.displayName] as const));

  const responsiblesByOrder = new Map<string, OrderResponsible[]>(orderIds.map((id) => [id, []]));
  for (const row of assignmentRows) {
    const grupo = responsiblesByOrder.get(row.orderId);
    if (grupo === undefined) continue;
    grupo.push({
      userId: row.userId,
      displayName: displayNames.get(row.userId) ?? row.userId,
      origin: toOrigin(row),
    });
  }
  for (const grupo of responsiblesByOrder.values()) grupo.sort(compareResponsibles);

  const result = new Map<string, ComposedOrderRow>();
  for (const row of orders) {
    result.set(row.id, {
      recipeName: recipeNames.get(row.recipeId) ?? null,
      presentationLines: toDistributionLines(row.presentationLines, presentationNames),
      unitLabel: row.unitId === null ? null : unitLabels.get(row.unitId) ?? null,
      responsibles: responsiblesByOrder.get(row.id) ?? [],
    });
  }
  return result;
}
