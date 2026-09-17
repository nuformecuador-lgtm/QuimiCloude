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

type AssignedOrderSummaryRow = {
  readonly id: string;
  readonly orderYear: number;
  readonly orderSequence: number;
  readonly recipeId: string;
  readonly quantity: { toFixed(digits: number): string };
  readonly priority: string;
  readonly status: string;
};

/** `quantity` llega como `Prisma.Decimal` -tipado aqui por su forma minima para no importar
 *  `@prisma/client`- y se fija a 4 decimales, la escala de la columna `Decimal(14,4)`. */
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
 * Dos sentencias -`count` y `findMany`- para una lectura logica: asi el `total` describe el
 * conjunto ya filtrado por estado y por empresa, que es lo que se pagina.
 *
 * El orden repite el de `OrderRepository.listAlive` sin `sort`, con `id ASC` de desempate para
 * que sea total.
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
