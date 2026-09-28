// lib/modules/asignaciones/domain/compose-order-rows.ts
/**
 * Compone receta, presentacion y responsables para una pagina de pedidos, con una llamada por cada
 * dependencia sin importar cuantas filas traiga la pagina. Extraido de `list-assigned-orders.ts`
 * para que «Mis asignados», «Terminados» y «Todos» compartan la misma composicion en vez de tres
 * copias que podrian divergir.
 *
 * No excluye a nadie de los responsables: quien llama decide si descarta al propio actor.
 */
import { compareResponsibles, toOrigin } from './responsible-order';

import type { OrderResponsible } from './assignment-view';
import type { OrderAssignmentRepository } from '../ports/order-assignment-repository';

import type { AssignedOrderSummary } from '@/lib/modules/pedidos';
import type { PeopleDirectory } from '@/lib/modules/identity';
import type { PresentationCatalog } from '@/lib/modules/inventario';
import type { RecipeCatalog } from '@/lib/modules/recetas';

export type ComposeOrderRowsDeps = {
  readonly assignments: OrderAssignmentRepository;
  readonly recipes: RecipeCatalog;
  readonly people: PeopleDirectory;
  readonly presentations: PresentationCatalog;
  readonly now?: () => Date;
};

export type ComposedOrderRow = {
  readonly recipeName: string | null;
  readonly presentationName: string | null;
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

  // Transitorio: solo la primera linea del reparto hasta que este listado pinte el reparto entero.
  const presentationIds = [
    ...new Set(
      orders
        .map((row) => row.presentationLines[0]?.presentationId ?? null)
        .filter((id): id is string => id !== null),
    ),
  ];
  const presentations =
    presentationIds.length === 0 ? [] : await deps.presentations.findRefs(presentationIds, companyId);
  const presentationNames = new Map(presentations.map((presentation) => [presentation.id, presentation.name]));

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
    // Transitorio: solo la primera linea del reparto hasta que este listado pinte el reparto entero.
    const firstPresentationId = row.presentationLines[0]?.presentationId ?? null;
    result.set(row.id, {
      recipeName: recipeNames.get(row.recipeId) ?? null,
      presentationName:
        firstPresentationId === null ? null : presentationNames.get(firstPresentationId) ?? null,
      responsibles: responsiblesByOrder.get(row.id) ?? [],
    });
  }
  return result;
}
