import { buildPage, toOffsetLimit } from '@/lib/shared/pagination';

import { prisma } from '@/lib/shared/db/prisma';

import { orderCompanyScope } from './company-scope';

import type { OrderStatus } from '../../../domain/order-classification';
import type {
  AssignedOrderSummary,
  OrderAssignmentTarget,
  OrderHistorySummary,
  OrderSummaryOrdering,
} from '../../../domain/order-catalog';
import type { OrderNumber } from '../../../domain/order-number';
import type { Page } from '../../../domain/page';
import type { OrderSummaryLineRecord, OrderSummaryRecord } from '../../../ports/order-summary-reader';

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

/** Una fila de `order_presentation_lines`, ya en el orden de alta: la
 *  consulta pide `createdAt asc, id asc`, asi que este adaptador no reordena nada en memoria. */
type AssignedOrderPresentationLineRow = {
  readonly presentationId: string;
  readonly packages: number;
  readonly packagingProductId: string | null;
};

type AssignedOrderSummaryRow = {
  readonly id: string;
  readonly orderYear: number;
  readonly orderSequence: number;
  readonly recipeId: string;
  readonly quantity: { toFixed(digits: number): string };
  readonly priority: string;
  readonly status: string;
  readonly unitId: string | null;
  readonly presentationLines: readonly AssignedOrderPresentationLineRow[];
  readonly finishedAt: Date | null;
  readonly packedBy: string | null;
};

/** `select` unico de los dos listados de resumen: si uno gana una columna y el otro no, el
 *  tipo `AssignedOrderSummaryRow` lo dice enseguida.
 *
 * El `orderBy` de `presentationLines` lleva sus literales fijados uno a uno -y no con un
 * `as const` de todo el objeto-, porque este archivo no importa `@prisma/client`
 * (`tests/unit/pedidos/module-contract.test.ts`) y Prisma exige un ARRAY MUTABLE de
 * `SortOrder`, no una tupla de solo lectura. */
const SUMMARY_SELECT = {
  id: true,
  orderYear: true,
  orderSequence: true,
  recipeId: true,
  quantity: true,
  priority: true,
  status: true,
  unitId: true,
  presentationLines: {
    select: { presentationId: true, packages: true, packagingProductId: true },
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
  },
  finishedAt: true,
  packedBy: true,
};

/** El «orden de la lista de trabajo»: prioridad, antiguedad y numero, con `id ASC` de
 *  desempate para que sea total. Compartido por los dos listados de resumen para que no
 *  puedan divergir. */
const WORK_QUEUE_ORDER_BY = [
  { priority: 'desc' },
  { createdAt: 'asc' },
  { orderYear: 'asc' },
  { orderSequence: 'asc' },
  { id: 'asc' },
] as const;

/** El «orden de terminados»: fecha de terminado descendente con los nulos EXPLICITOS
 *  al final, y entre los «sin fecha», numero de pedido descendente. */
const FINISHED_RECENT_FIRST_ORDER_BY = [
  { finishedAt: { sort: 'desc', nulls: 'last' } },
  { orderYear: 'desc' },
  { orderSequence: 'desc' },
  { id: 'asc' },
] as const;

/** `quantity` llega como `Prisma.Decimal` -tipado aqui por su forma minima para no importar
 *  `@prisma/client`- y se fija a 4 decimales, la escala de la columna `Decimal(14,4)`. */
export function toOrderSummaryRecord(row: AssignedOrderSummaryRow): OrderSummaryRecord {
  return {
    id: row.id,
    number: { year: row.orderYear, sequence: row.orderSequence },
    recipeId: row.recipeId,
    quantity: row.quantity.toFixed(4),
    priority: row.priority as AssignedOrderSummary['priority'],
    status: row.status as OrderStatus,
    unitId: row.unitId,
    presentationLines: row.presentationLines.map(
      (line): OrderSummaryLineRecord => ({
        presentationId: line.presentationId,
        packages: line.packages,
        packagingProductId: line.packagingProductId,
      }),
    ),
    finishedAt: row.finishedAt,
    packedBy: row.packedBy,
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
): Promise<Page<OrderSummaryRecord>> {
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
      select: SUMMARY_SELECT,
      orderBy: [...WORK_QUEUE_ORDER_BY],
      skip: offset,
      take: limit,
    }),
    prisma.order.count({ where }),
  ]);

  return buildPage(rows.map(toOrderSummaryRecord), total, page, limit);
}

/** A diferencia de las lecturas de vivos, el `where` NO lleva `deletedAt: null`: el historial
 *  incluye los dados de baja. El ambito de empresa sigue siendo el primer termino del `AND`. */
function historyWhere(companyId: string, ids: readonly string[], statuses: readonly OrderStatus[]) {
  return {
    AND: [orderCompanyScope({ companyId }), { id: { in: [...ids] }, status: { in: [...statuses] } }],
  };
}

const HISTORY_ORDER_BY = [{ orderYear: 'desc' }, { orderSequence: 'desc' }, { id: 'asc' }] as const;

type OrderHistoryRow = {
  readonly id: string;
  readonly orderYear: number;
  readonly orderSequence: number;
  readonly status: string;
  readonly deletedAt: Date | null;
};

/** `deletedAt` se reduce a la marca: la fecha de baja no sale del adaptador. */
export function toOrderHistorySummary(row: OrderHistoryRow): OrderHistorySummary {
  return {
    id: row.id,
    number: { year: row.orderYear, sequence: row.orderSequence },
    status: row.status as OrderStatus,
    deleted: row.deletedAt !== null,
  };
}

export async function listOrderNumbersByIdsIncludingDeleted(
  companyId: string,
  ids: readonly string[],
  statuses: readonly OrderStatus[],
): Promise<readonly { readonly id: string; readonly number: OrderNumber }[]> {
  const rows = await prisma.order.findMany({
    where: historyWhere(companyId, ids, statuses),
    select: { id: true, orderYear: true, orderSequence: true },
  });
  return rows.map((row) => ({ id: row.id, number: { year: row.orderYear, sequence: row.orderSequence } }));
}

export async function listOrderHistoryByIdsIncludingDeleted(
  companyId: string,
  ids: readonly string[],
  statuses: readonly OrderStatus[],
  page: number,
  pageSize?: number,
): Promise<Page<OrderHistorySummary>> {
  const { offset, limit } = toOffsetLimit(page, pageSize);
  const where = historyWhere(companyId, ids, statuses);

  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      select: { id: true, orderYear: true, orderSequence: true, status: true, deletedAt: true },
      orderBy: [...HISTORY_ORDER_BY],
      skip: offset,
      take: limit,
    }),
    prisma.order.count({ where }),
  ]);

  return buildPage(rows.map(toOrderHistorySummary), total, page, limit);
}

/**
 * Implementa `OrderSummaryReader['listAliveInCompany']`: el mismo
 * resumen que `listAliveOrderSummariesByIds`, pero SIN filtro de ids -toda la empresa-, para
 * «Terminados» y «Todos», que no acotan por quien esta asignado.
 */
export async function listAliveOrderSummariesInCompany(
  companyId: string,
  statuses: readonly OrderStatus[],
  ordering: OrderSummaryOrdering,
  page: number,
  pageSize?: number,
  filter?: { readonly packedBy?: string },
): Promise<Page<OrderSummaryRecord>> {
  const { offset, limit } = toOffsetLimit(page, pageSize);
  const where = {
    AND: [
      orderCompanyScope({ companyId }),
      {
        status: { in: [...statuses] },
        deletedAt: null,
        ...(filter?.packedBy === undefined ? {} : { packedBy: filter.packedBy }),
      },
    ],
  };
  const orderBy =
    ordering === 'finished_recent_first'
      ? [...FINISHED_RECENT_FIRST_ORDER_BY]
      : [...WORK_QUEUE_ORDER_BY];

  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      select: SUMMARY_SELECT,
      orderBy,
      skip: offset,
      take: limit,
    }),
    prisma.order.count({ where }),
  ]);

  return buildPage(rows.map(toOrderSummaryRecord), total, page, limit);
}

