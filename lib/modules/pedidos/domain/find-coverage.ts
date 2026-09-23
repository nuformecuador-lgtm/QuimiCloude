// lib/modules/pedidos/domain/find-coverage.ts
/**
 * QC-141 T14 — La cobertura de VARIOS pedidos a la vez (`design.md > 5.1`, `> 10`; R35).
 *
 * Existe para que el listado de Pedidos pinte la cobertura de una pagina entera con un numero de
 * consultas CONSTANTE: la pantalla pide la pagina a `pedidos` y despues, de golpe, la cobertura
 * de esos identificadores. Mismo espiritu que `listResponsiblesForOrders` de `asignaciones`
 * (QC-102 T4) -permiso en la primera linea, UNA sola consulta al puerto para toda la pagina-, con
 * la firma `(input, actor)` de los seis casos de uso de este modulo.
 *
 * Dominio PURO: `zod` y el tipo que publica `inventario`. Sin `next/*`, sin `@prisma/client`, sin
 * adaptadores y sin `@/lib/shared/**`.
 */
import { z } from 'zod';

import { requirePermission, type Actor } from './actor';
import { ValidationError } from './errors';

import type { OrderCoverage, ReservationQueries } from '@/lib/modules/inventario';

/**
 * Tope de identificadores por lote, DECLARADO AQUI porque el dominio no puede importar
 * `lib/shared` (`docs/architecture.md > La regla de dependencias`). Es el mismo numero que
 * `MAX_PAGE_SIZE` (`lib/shared/pagination.ts`) y que `MAX_ORDERS_PER_BATCH` de
 * `asignaciones/domain/list-responsibles-for-orders.ts`: las tres viven separadas a proposito, y
 * un test las ata para que ampliar la pagina en una no deje a las otras dos cortando la mitad en
 * silencio.
 */
export const MAX_ORDERS_PER_COVERAGE_BATCH = 25;

const orderIdsSchema = z.array(z.string().uuid()).max(MAX_ORDERS_PER_COVERAGE_BATCH);

export type FindCoverageDeps = {
  /** Lectura pura de `inventario`, fuera de transaccion (`design.md > 5.1`). */
  readonly reservations: ReservationQueries;
};

export function createFindCoverage(
  deps: FindCoverageDeps,
): (
  orderIds: unknown,
  actor: Actor | null | undefined,
) => Promise<ReadonlyMap<string, OrderCoverage>> {
  return async function findCoverage(
    orderIds: unknown,
    actor: Actor | null | undefined,
  ): Promise<ReadonlyMap<string, OrderCoverage>> {
    // 1. PRIMERA LINEA, antes de zod y antes de tocar ningun puerto.
    requirePermission(actor, 'pedidos.consultar');

    // 2. El borde: forma valida o rechazo, sin tocar ningun puerto.
    const parsed = orderIdsSchema.safeParse(orderIds);
    if (!parsed.success) throw new ValidationError();

    // Los repetidos se consultan UNA sola vez; el orden no importa, el resultado es un mapa.
    const ids = [...new Set(parsed.data)];

    // 3. Lista vacia: resultado vacio SIN tocar ningun puerto.
    if (ids.length === 0) return new Map();

    // 4. UNA consulta para toda la pagina (sin N+1). La empresa sale del ACTOR.
    return deps.reservations.findCoverageByOrderIds(actor.companyId, ids);
  };
}
