import { z } from 'zod';

import { requirePermission, type Actor } from './actor';
import { compareQuantities } from './decimal-quantity';
import { ActionNotAllowedError, BatchNotFoundError, ValidationError } from './errors';
import { MOVEMENT_REASONS } from './movement-reason';

import type { ProductRepository } from '../ports/product-repository';

export type AdjustBatchStockDeps = {
  readonly products: ProductRepository;
  /** Inyectable para que los tests fijen el instante sin tocar el reloj global. */
  readonly now?: () => Date;
};

/** Decimal con signo, hasta diez enteros y cuatro decimales. */
const DELTA_PATTERN = /^-?\d{1,10}(\.\d{1,4})?$/;

/**
 * El ajuste es la cantidad que suma o resta, nunca el total nuevo: el cero no mueve nada.
 * `strictObject` para que un campo de mas se rechace en vez de ignorarse en silencio.
 */
const adjustBatchStockSchema = z.strictObject({
  batchId: z.string().uuid(),
  delta: z
    .string()
    .trim()
    .regex(DELTA_PATTERN)
    // Sin `DELTA_PATTERN.test` aqui, `compareQuantities` recibiria una cadena que el `regex` ya
    // rechazo y lanzaria en vez de sumar un issue: zod sigue evaluando este `refine` aunque el
    // paso anterior haya fallado.
    .refine((value) => !DELTA_PATTERN.test(value) || compareQuantities(value, '0') !== 0),
  reason: z.enum(MOVEMENT_REASONS),
});

export type AdjustBatchStockInput = z.infer<typeof adjustBatchStockSchema>;

/**
 * Correccion de la existencia de UN lote.
 *
 * El permiso va antes de zod y antes del puerto: un actor sin el no dispara nada, ni siquiera una
 * validacion que le contaria como es la entrada.
 *
 * Aqui NO se lee el stock previo para escribir el total: el puerto aplica el movimiento relativo y
 * la base calcula el resultado. Leer y escribir el total dejaria que dos ajustes simultaneos se
 * pisaran, que es justo el fallo que este caso de uso existe para quitar. El rechazo del negativo
 * tampoco se anticipa aqui: lo decide quien escribe, con la fila bloqueada.
 */
export function createAdjustBatchStock(
  deps: AdjustBatchStockDeps,
): (
  input: unknown,
  actor: Actor | null | undefined,
) => Promise<{ stock: string; reserved: string; overReserved: boolean }> {
  const now = deps.now ?? (() => new Date());

  return async function adjustBatchStock(
    input: unknown,
    actor: Actor | null | undefined,
  ): Promise<{ stock: string; reserved: string; overReserved: boolean }> {
    requirePermission(actor, 'inventario.modificar');

    const parsed = adjustBatchStockSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const entrada = parsed.data;

    // La empresa sale del actor y nunca de la entrada, para que nadie pueda ajustar en otra.
    const resultado = await deps.products.adjustBatchStock(
      entrada.batchId,
      entrada.delta,
      entrada.reason,
      actor.id,
      now(),
      { companyId: actor.companyId },
    );

    // El lote ajeno y el inexistente salen por el mismo camino: distinguirlos convertiria esto en
    // un oraculo de existencia sobre los lotes de las demas empresas.
    if (resultado === null) throw new BatchNotFoundError();
    if (resultado === 'increase_not_allowed') throw new ActionNotAllowedError();

    return resultado;
  };
}
