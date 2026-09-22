// lib/modules/asignaciones/domain/list-assigned-orders.ts
/**
 * Compone los responsables con el metodo del puerto y NO con `listResponsiblesForOrders`: ese caso
 * de uso exige `pedidos.consultar`, que el Operador no tiene, y devolveria `unauthorized` para
 * todo Operador.
 */
import { z } from 'zod';

import { requirePermission, type Actor } from './actor';
import { ValidationError } from './errors';
import { compareResponsibles, toOrigin } from './responsible-order';

import type { AssignedOrderView } from './assigned-order-view';
import type { OrderResponsible } from './assignment-view';
import type { OrderAssignmentRepository } from '../ports/order-assignment-repository';

import { formatOrderNumber, type OrderCatalog, type Page } from '@/lib/modules/pedidos';
import type { PeopleDirectory } from '@/lib/modules/identity';
import type { PresentationCatalog } from '@/lib/modules/inventario';
import type { RecipeCatalog } from '@/lib/modules/recetas';

/**
 * Duplicados de `lib/shared/pagination.ts` a proposito: el dominio no puede importar
 * `lib/shared/**` (`docs/architecture.md > La regla de dependencias`). Un test ata los numeros.
 * Solo se usan cuando no hay ni un id y la pagina vacia se construye aqui, sin tocar el puerto.
 */
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 25;

function effectivePageSize(pageSize: number | undefined): number {
  return Math.min(pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
}

const listAssignedOrdersSchema = z.strictObject({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).optional(),
});

export type ListAssignedOrdersDeps = {
  readonly assignments: OrderAssignmentRepository;
  readonly orders: OrderCatalog;
  readonly recipes: RecipeCatalog;
  readonly people: PeopleDirectory;
  readonly presentations: PresentationCatalog;
  readonly now?: () => Date;
};

const ESTADOS_DE_TRABAJO = ['PENDIENTE', 'EN_CURSO'] as const;

/** El estrechamiento es seguro porque la consulta se llama SIEMPRE filtrando por
 *  `ESTADOS_DE_TRABAJO`: ninguna fila puede volver con otro estado. */
function toWorkingStatus(status: string): 'PENDIENTE' | 'EN_CURSO' {
  return status as 'PENDIENTE' | 'EN_CURSO';
}

export function createListAssignedOrders(
  deps: ListAssignedOrdersDeps,
): (actor: Actor | null | undefined, input: unknown) => Promise<Page<AssignedOrderView>> {
  return async function listAssignedOrders(
    actor: Actor | null | undefined,
    input: unknown,
  ): Promise<Page<AssignedOrderView>> {
    // Autorizar va antes de validar la entrada y antes de tocar ningun puerto.
    requirePermission(actor, 'asignaciones.consultar');

    const parsed = listAssignedOrdersSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const { page, pageSize } = parsed.data;

    // La empresa y la persona salen del actor, nunca de la entrada.
    const ids = await deps.assignments.listOrderIdsByUserInCompany(actor.companyId, actor.id);

    // Sin ni un id no se consulta nada mas: la pagina vacia se construye aqui.
    if (ids.length === 0) {
      return {
        items: [],
        total: 0,
        page,
        pageSize: effectivePageSize(pageSize),
        totalPages: 1,
      };
    }

    // El filtro de estado y la paginacion van en SQL, sobre el conjunto completo: si no, `total`
    // describiria algo distinto de lo que se muestra.
    const ordersPage = await deps.orders.listAliveSummariesByIds(
      actor.companyId,
      ids,
      ESTADOS_DE_TRABAJO,
      page,
      pageSize,
    );

    // Una sola llamada, tenga la pagina 1 fila o 25.
    const recipeIds = [...new Set(ordersPage.items.map((row) => row.recipeId))];
    const recipes = await deps.recipes.findRefsIncludingDeleted(recipeIds, actor.companyId);
    const recipeNames = new Map(recipes.map((recipe) => [recipe.id, recipe.name]));

    // Los ids de presentacion no nulos de la pagina, deduplicados, con UNA sola llamada -y
    // ninguna si ningun pedido de la pagina tiene presentacion.
    const presentationIds = [
      ...new Set(
        ordersPage.items
          .map((row) => row.presentationId)
          .filter((id): id is string => id !== null),
      ),
    ];
    const presentations =
      presentationIds.length === 0
        ? []
        : await deps.presentations.findRefs(presentationIds, actor.companyId);
    const presentationNames = new Map(
      presentations.map((presentation) => [presentation.id, presentation.name]),
    );

    // Solo los ids DE LA PAGINA, no todos los de la persona.
    const pageOrderIds = ordersPage.items.map((row) => row.id);
    const assignmentRows = await deps.assignments.listByOrdersInCompany(
      actor.companyId,
      pageOrderIds,
    );

    const userIds = [...new Set(assignmentRows.map((row) => row.userId))];
    const peopleRefs =
      userIds.length === 0
        ? []
        : await deps.people.findRefsIncludingDeletedInCompany(
            actor.companyId,
            userIds,
            deps.now?.() ?? new Date(),
          );
    const displayNames = new Map(peopleRefs.map((ref) => [ref.id, ref.displayName] as const));

    const responsiblesByOrder = new Map<string, OrderResponsible[]>(
      pageOrderIds.map((orderId) => [orderId, []]),
    );
    for (const row of assignmentRows) {
      const grupo = responsiblesByOrder.get(row.orderId);
      if (grupo === undefined) continue;
      grupo.push({
        userId: row.userId,
        displayName: displayNames.get(row.userId) ?? row.userId,
        origin: toOrigin(row),
      });
    }

    // Al actor se le descarta al final, para que el orden del resto no dependa de quien mira.
    const items: AssignedOrderView[] = ordersPage.items.map((row) => ({
      id: row.id,
      numberText: formatOrderNumber(row.number),
      recipeName: recipeNames.get(row.recipeId) ?? null,
      quantity: row.quantity,
      priority: row.priority,
      status: toWorkingStatus(row.status),
      otherResponsibles: (responsiblesByOrder.get(row.id) ?? [])
        .filter((responsible) => responsible.userId !== actor.id)
        .sort(compareResponsibles),
      presentationName:
        row.presentationId === null ? null : presentationNames.get(row.presentationId) ?? null,
    }));

    return {
      items,
      total: ordersPage.total,
      page: ordersPage.page,
      pageSize: ordersPage.pageSize,
      totalPages: ordersPage.totalPages,
    };
  };
}
