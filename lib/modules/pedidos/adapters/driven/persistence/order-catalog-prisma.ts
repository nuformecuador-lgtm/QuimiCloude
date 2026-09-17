import { buildPage, toOffsetLimit } from '@/lib/shared/pagination';

import { prisma } from '@/lib/shared/db/prisma';

import { orderCompanyScope } from './company-scope';

import type { OrderStatus } from '../../../domain/order-classification';
import type { AssignedOrderSummary, OrderAssignmentTarget } from '../../../domain/order-catalog';
import type { Page } from '../../../domain/page';

/**
 * Implementa `OrderCatalog['findAliveById']` (`domain/order-catalog.ts`, QC-87
 * `design.md > 2.1`): el hueco que el contrato publico de `pedidos` abre para que otro modulo
 * -QC-87 `asignaciones` es su primer consumidor- pueda saber si un pedido existe y en que
 * estado esta SIN tocar la tabla ni el repositorio de pedido. Mismo patron que
 * `recetas/.../recipe-catalog-prisma.ts`.
 *
 * `deleted_at IS NULL` va en el `where`, no en un `if` posterior: es exactamente el filtro de
 * `findAliveOrderById` del repositorio de QC-34 (R33, R40), y por eso un pedido dado de baja
 * no se distingue de uno que no existe -los dos son `null`-.
 *
 * El `select` pide DOS columnas y no `ORDER_SELECT`: el tipo publico solo lleva `id` y
 * `status`, asi que traer el resto seria material para filtrarse por descuido. `deletedAt`
 * tampoco sale: ya lo filtro el `where`, y siempre valdria `null`.
 *
 * El `status` de Prisma es su propio `enum` generado; el casteo a `OrderStatus` es el mismo
 * cruce -a mano y en un solo sitio- que hace `order-prisma.ts`, y lo vigila el caso de
 * `module-contract.test.ts` que compara valor a valor el enum del dominio con el de
 * `db/schema.prisma`.
 *
 * La empresa llega como cadena (ver `OrderCatalog` en `order-catalog.ts`) y se convierte aqui al
 * `OrderScope` interno.
 */

type OrderCatalogRow = {
  readonly id: string;
  readonly status: string;
};

/** Fila de Prisma -> `OrderAssignmentTarget`. Funcion pura, testeable sin base. */
export function toOrderAssignmentTarget(row: OrderCatalogRow): OrderAssignmentTarget {
  return { id: row.id, status: row.status as OrderStatus };
}

export async function findAliveOrderTargetById(
  id: string,
  companyId: string,
): Promise<OrderAssignmentTarget | null> {
  const row = await prisma.order.findFirst({
    where: { AND: [orderCompanyScope({ companyId }), { id, deletedAt: null }] },
    select: { id: true, status: true },
  });

  return row === null ? null : toOrderAssignmentTarget(row);
}

// ---------------------------------------------------------------------------------------
// QC-88 (T5, R11, `design.md > 6`, `> 13` nota del merge 2026-09-16). Bloque nuevo al final:
// `findAliveOrderTargetById` de arriba no se toca.
// ---------------------------------------------------------------------------------------

/** El `select` de esta lectura: solo lo que `AssignedOrderSummary` puede expresar. Ni autoria
 *  ni motivo de cancelacion, a diferencia de `ORDER_SELECT` de `order-prisma.ts`. */
type AssignedOrderSummaryRow = {
  readonly id: string;
  readonly orderYear: number;
  readonly orderSequence: number;
  readonly recipeId: string;
  readonly quantity: { toFixed(digits: number): string };
  readonly priority: string;
  readonly status: string;
};

/** Fila de Prisma -> `AssignedOrderSummary`. Funcion pura, testeable sin base.
 *
 *  `quantity` llega como `Prisma.Decimal` -aqui SOLO tipado por su forma minima, sin importar
 *  `@prisma/client`- y se convierte con su propio `toFixed(4)`: la MISMA escala de la columna
 *  `Decimal(14,4)` que usa `fromDecimal` de `order-prisma.ts`, sin cruzar a ese archivo. */
export function toAssignedOrderSummary(row: AssignedOrderSummaryRow): AssignedOrderSummary {
  return {
    id: row.id,
    number: { year: row.orderYear, sequence: row.orderSequence },
    recipeId: row.recipeId,
    quantity: row.quantity.toFixed(4),
    priority: row.priority as AssignedOrderSummary['priority'],
    status: row.status as OrderStatus,
  };
}

/**
 * Implementa `OrderCatalog['listAliveSummariesByIds']` (QC-88 R11, R15): los datos de un
 * conjunto de pedidos por sus ids, acotados a los estados pedidos y a la empresa, y paginados.
 *
 * El `where` lleva `orderCompanyScope({ companyId })` (`./company-scope`) EN `AND`, junto a
 * `id: { in }`, `status: { in }` y `deletedAt: null` -mismo patron que `findAliveOrderTargetById`
 * y sincronizacion del 2026-09-16 tras el merge de QC-60-. `ids` vacio no llega: el caso de uso
 * que invoca esta funcion corta antes.
 *
 * PAGINACION: `toOffsetLimit`/`buildPage` de `lib/shared/pagination`, NUNCA reimplementada
 * (mismo reparto que `listAliveOrders` de `order-prisma.ts`). Son DOS sentencias -un `count` y
 * un `findMany`- para UNA lectura logica, como cualquier listado paginado del repo; el `total`
 * describe el conjunto YA FILTRADO por estado y por empresa.
 *
 * El orden es el MISMO que `OrderRepository.listAlive` sin `sort` (QC-88 R15, `design.md > 5.3`):
 * `priority DESC, created_at ASC, order_year ASC, order_sequence ASC`, con `id ASC` como
 * desempate final para que el orden sea total.
 */
export async function listAliveOrderSummariesByIds(
  companyId: string,
  ids: readonly string[],
  statuses: readonly OrderStatus[],
  page: number,
  pageSize?: number,
): Promise<Page<AssignedOrderSummary>> {
  const { offset, limit } = toOffsetLimit(page, pageSize);
  const where = {
    AND: [
      orderCompanyScope({ companyId }),
      { id: { in: [...ids] }, status: { in: [...statuses] }, deletedAt: null },
    ],
  };

  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      select: {
        id: true,
        orderYear: true,
        orderSequence: true,
        recipeId: true,
        quantity: true,
        priority: true,
        status: true,
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'asc' },
        { orderYear: 'asc' },
        { orderSequence: 'asc' },
        { id: 'asc' },
      ],
      skip: offset,
      take: limit,
    }),
    prisma.order.count({ where }),
  ]);

  return buildPage(rows.map(toAssignedOrderSummary), total, page, limit);
}
