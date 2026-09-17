// lib/modules/asignaciones/domain/list-assigned-orders.ts
/**
 * QC-88 T6 — Caso de uso «los pedidos que YO tengo asignados» (`design.md > 5`; R5-R8, R11,
 * R14, R15, R20).
 *
 * Es el listado de trabajo del Operador: los pedidos `PENDIENTE`/`EN_CURSO` de la persona que
 * consulta, con sus demas responsables ya compuestos en lote (QC-102).
 *
 * El ORDEN de las operaciones es el requisito (`design.md > 5.1`), no un detalle de estilo:
 *
 *   1. `requirePermission(actor, 'asignaciones.consultar')` — PRIMERA linea, antes de `zod` y
 *      antes de tocar NINGUN puerto (R5, R6). Es la puerta que la enmienda de T7 abrio para
 *      este archivo y SOLO para el.
 *   2. `zod` sobre la entrada: solo `page` y `pageSize` (`design.md > 9.1`). Rechazo SIN tocar
 *      puerto.
 *   3. `assignments.listOrderIdsByUserInCompany(actor.companyId, actor.id)` — la empresa y la
 *      persona SALEN DEL ACTOR, nunca de la entrada (R7).
 *   4. Corte seco: sin ni un id, pagina vacia SIN tocar ningun otro puerto (mismo criterio que
 *      `list-responsibles-for-orders.ts:109`).
 *   5. `orders.listAliveSummariesByIds(actor.companyId, ids, ['PENDIENTE','EN_CURSO'], page,
 *      pageSize)` — la empresa sale del actor; el filtro de estado y la paginacion ocurren en
 *      SQL, sobre el conjunto completo y ANTES de paginar (R11), de modo que `total` describe
 *      lo que se muestra.
 *   6. Nombres de receta: ids DEDUPLICADOS y UNA llamada a `recipes.findRefsIncludingDeleted`
 *      (igual que `list-orders.ts:140-147`): una receta dada de baja sigue apareciendo con su
 *      nombre.
 *   7. Responsables: UNA llamada a `assignments.listByOrdersInCompany(actor.companyId,
 *      idsDeLaPagina)` —el metodo de QC-102, R14— y resolucion de nombres con `people`
 *      (mismo patron que `list-responsibles-for-orders.ts`), compuestos en memoria con
 *      `toOrigin` y `compareResponsibles` de `./responsible-order` —REUTILIZADOS, no
 *      copiados—.
 *   8. Se descarta al propio actor de los responsables de cada fila (R20), AL FINAL, para que
 *      el orden no dependa de quien mira.
 *
 * **NO invoca `listResponsiblesForOrders`** (`design.md > 0` hallazgo H1): ese caso de uso
 * exige `pedidos.consultar`, que el Operador no tiene, y llamarlo devolveria `unauthorized`
 * para todo Operador.
 *
 * Dominio PURO: `zod` y tipos del propio modulo o del contrato publico de otro. Sin `next/*`,
 * sin `@prisma/client`, sin adaptadores y sin `@/lib/shared/**`.
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
import type { RecipeCatalog } from '@/lib/modules/recetas';

/**
 * Defecto y tope del tamano de pagina, DUPLICADOS de `lib/shared/pagination.ts` a proposito: el
 * dominio de un modulo NO PUEDE importar `lib/shared/**` (`docs/architecture.md > La regla de
 * dependencias`). Es la MISMA duplicacion, con el MISMO motivo, que `MAX_ORDERS_PER_BATCH` de
 * `list-responsibles-for-orders.ts:57` y esta atada por un test que compara los dos numeros.
 *
 * Solo hacen falta para el CORTE SECO del paso 4: cuando no hay ni un id, este caso de uso
 * construye la pagina vacia el mismo, sin invocar `orders.listAliveSummariesByIds` -que es
 * quien normalmente aplica el defecto y el tope-.
 */
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 25;

function effectivePageSize(pageSize: number | undefined): number {
  return Math.min(pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
}

/** El esquema del borde (`design.md > 9.1`): SOLO `page` y `pageSize`. `strict`: un campo de
 *  mas no se ignora, se rechaza -esta lista no ordena, no filtra y no busca-. */
const listAssignedOrdersSchema = z.strictObject({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).optional(),
});

export type ListAssignedOrdersDeps = {
  /** El puerto propio: los ids de la persona (paso 3) y el lote de responsables (paso 7). */
  readonly assignments: OrderAssignmentRepository;
  /** `pedidos`: los datos de esos ids, ya extendido con `listAliveSummariesByIds` (T4, T5). */
  readonly orders: OrderCatalog;
  /** `recetas`: el nombre, con el mismo contrato y el mismo patron que `list-orders.ts:145`. */
  readonly recipes: RecipeCatalog;
  /** `identity`: nombres mostrables de los responsables, incluidos los de baja. */
  readonly people: PeopleDirectory;
  readonly now?: () => Date;
};

const ESTADOS_DE_TRABAJO = ['PENDIENTE', 'EN_CURSO'] as const;

/** Estrecha el `OrderStatus` completo a los dos literales que `AssignedOrderView.status` puede
 *  expresar. Seguro: `orders.listAliveSummariesByIds` se llama SIEMPRE con
 *  `ESTADOS_DE_TRABAJO` como filtro, asi que ninguna fila puede volver con otro estado. */
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
    // 1. PRIMERA LINEA (R5, R6): antes de `zod` y antes de tocar ningun puerto.
    requirePermission(actor, 'asignaciones.consultar');

    // 2. El borde (`design.md > 9.1`). El rechazo ocurre SIN tocar ningun puerto.
    const parsed = listAssignedOrdersSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const { page, pageSize } = parsed.data;

    // 3. La empresa Y LA PERSONA salen del ACTOR, nunca de la entrada (R7).
    const ids = await deps.assignments.listOrderIdsByUserInCompany(actor.companyId, actor.id);

    // 4. Corte seco: pagina vacia SIN tocar ningun otro puerto.
    if (ids.length === 0) {
      return {
        items: [],
        total: 0,
        page,
        pageSize: effectivePageSize(pageSize),
        totalPages: 1,
      };
    }

    // 5. UNA consulta para toda la pagina, acotada a los DOS estados de trabajo (R11). El
    //    filtro y la paginacion ocurren en SQL, sobre el conjunto completo y ANTES de paginar.
    const ordersPage = await deps.orders.listAliveSummariesByIds(
      actor.companyId,
      ids,
      ESTADOS_DE_TRABAJO,
      page,
      pageSize,
    );

    // 6. Nombres de receta: ids DEDUPLICADOS y UNA llamada, tenga la pagina 1 fila o 25 (R14).
    const recipeIds = [...new Set(ordersPage.items.map((row) => row.recipeId))];
    const recipes = await deps.recipes.findRefsIncludingDeleted(recipeIds);
    const recipeNames = new Map(recipes.map((recipe) => [recipe.id, recipe.name]));

    // 7. Responsables: UNA llamada al lote de QC-102, sobre los ids DE LA PAGINA -no de toda la
    //    persona-, y composicion EN MEMORIA con `toOrigin` y `compareResponsibles`.
    const pageOrderIds = ordersPage.items.map((row) => row.id);
    const assignmentRows = await deps.assignments.listByOrdersInCompany(
      actor.companyId,
      pageOrderIds,
    );

    // Nombres de las personas responsables: UNA llamada, con los identificadores DEDUPLICADOS
    // (mismo patron que `list-responsibles-for-orders.ts`).
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

    // 8. Se compone la fila y se descarta al PROPIO ACTOR de sus responsables, AL FINAL (R20).
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
