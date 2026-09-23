// lib/modules/asignaciones/domain/list-assigned-orders.ts
/**
 * Compone los responsables con el metodo del puerto y NO con `listResponsiblesForOrders`: ese caso
 * de uso exige `pedidos.consultar`, que el Operador no tiene, y devolveria `unauthorized` para
 * todo Operador.
 */
import { z } from 'zod';

import { requirePermission, type Actor } from './actor';
import { composeOrderRows, type ComposeOrderRowsDeps } from './compose-order-rows';
import { ValidationError } from './errors';

import type { AssignedOrderView } from './assigned-order-view';

import { formatOrderNumber, type OrderCatalog, type Page } from '@/lib/modules/pedidos';

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

export type ListAssignedOrdersDeps = ComposeOrderRowsDeps & {
  readonly orders: OrderCatalog;
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

    // Una sola llamada por dependencia, tenga la pagina 1 fila o 25.
    const composed = await composeOrderRows(deps, actor.companyId, ordersPage.items);

    // Al actor se le descarta al final, para que el orden del resto no dependa de quien mira.
    const items: AssignedOrderView[] = ordersPage.items.map((row) => {
      const rowComposed = composed.get(row.id);
      return {
        id: row.id,
        numberText: formatOrderNumber(row.number),
        recipeName: rowComposed?.recipeName ?? null,
        quantity: row.quantity,
        priority: row.priority,
        status: toWorkingStatus(row.status),
        otherResponsibles: (rowComposed?.responsibles ?? []).filter(
          (responsible) => responsible.userId !== actor.id,
        ),
        presentationName: rowComposed?.presentationName ?? null,
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
