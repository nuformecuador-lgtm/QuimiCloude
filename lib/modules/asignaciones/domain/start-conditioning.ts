// lib/modules/asignaciones/domain/start-conditioning.ts
/**
 * Comenzar el acondicionamiento: `POR_ACONDICIONAR -> EN_ACONDICIONAMIENTO` con el actor como quien
 * acondiciona. Sin comprobacion de asignacion: cualquier actor con `acondicionamiento.modificar`
 * puede tomar cualquier pedido vivo de su empresa que este `POR_ACONDICIONAR`. No toca inventario.
 */
import { z } from 'zod';

import { requirePermission, type Actor } from './actor';
import {
  OrderConditioningTakenError,
  OrderNotConditionableError,
  OrderNotFoundError,
  ValidationError,
} from './errors';

import type { OrderCatalog } from '@/lib/modules/pedidos';

const startConditioningSchema = z.strictObject({
  orderId: z.string().uuid(),
});

export type StartConditioningDeps = {
  readonly orders: OrderCatalog;
  readonly now?: () => Date;
};

export function createStartConditioning(
  deps: StartConditioningDeps,
): (actor: Actor | null | undefined, input: unknown) => Promise<void> {
  return async function startConditioning(actor: Actor | null | undefined, input: unknown): Promise<void> {
    // Autorizar va antes de validar la entrada y antes de tocar ningun puerto.
    requirePermission(actor, 'acondicionamiento.modificar');

    const parsed = startConditioningSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const { orderId } = parsed.data;

    const now = deps.now?.() ?? new Date();
    const result = await deps.orders.startConditioningAliveById(orderId, actor.companyId, actor.id, now);
    // `already_mine` es exito: repetir Comenzar sobre el propio pedido no escribe nada.
    if (result === 'ok' || result === 'already_mine') return;
    if (result === 'taken') throw new OrderConditioningTakenError();
    if (result === 'not_conditionable') throw new OrderNotConditionableError();
    throw new OrderNotFoundError();
  };
}
