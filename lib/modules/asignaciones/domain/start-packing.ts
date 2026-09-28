// lib/modules/asignaciones/domain/start-packing.ts
/**
 * Comenzar: `POR_EMPACAR -> EN_EMPAQUE` con el actor como quien empaca. Sin comprobacion de
 * asignacion: cualquier actor con `empaque.modificar` puede tomar cualquier pedido vivo de su
 * empresa que este `POR_EMPACAR`.
 *
 * No consume, aparta ni libera material, ni da de alta ningun lote, ni escribe ningun asiento de
 * inventario: la unica escritura es la de `OrderCatalog['startPackingAliveById']`.
 */
import { z } from 'zod';

import { requirePermission, type Actor } from './actor';
import {
  OrderNotFoundError,
  OrderNotPackableError,
  OrderPackingTakenError,
  OrderWithoutDistributionError,
  ValidationError,
} from './errors';

import type { OrderCatalog } from '@/lib/modules/pedidos';

const startPackingSchema = z.strictObject({
  orderId: z.string().uuid(),
});

export type StartPackingDeps = {
  readonly orders: OrderCatalog;
  readonly now?: () => Date;
};

export function createStartPacking(
  deps: StartPackingDeps,
): (actor: Actor | null | undefined, input: unknown) => Promise<void> {
  return async function startPacking(actor: Actor | null | undefined, input: unknown): Promise<void> {
    // Autorizar va antes de validar la entrada y antes de tocar ningun puerto.
    requirePermission(actor, 'empaque.modificar');

    const parsed = startPackingSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const { orderId } = parsed.data;

    const now = deps.now?.() ?? new Date();
    const result = await deps.orders.startPackingAliveById(orderId, actor.companyId, actor.id, now);

    // Repetir Comenzar sobre el propio `EN_EMPAQUE` es exito, sin escribir nada.
    if (result === 'ok' || result === 'already_mine') return;
    if (result === 'taken') throw new OrderPackingTakenError();
    // R10: `POR_EMPACAR` sin ninguna linea de reparto. `pedidos` ya distingue este caso
    // de `'not_packable'` -es un estado CORRECTO, solo que sin nada que empacar todavia-.
    if (result === 'without_distribution') throw new OrderWithoutDistributionError();
    if (result === 'not_packable') throw new OrderNotPackableError();
    throw new OrderNotFoundError(); // 'not_found'
  };
}
