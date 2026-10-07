import { z } from 'zod';

import { requirePermission, type Actor } from './actor';
import {
  ActionNotAllowedError,
  AdjustmentReasonNotAllowedError,
  BatchNotFoundError,
  BatchStockChangedError,
  ValidationError,
} from './errors';
import { MOVEMENT_REASONS } from './movement-reason';
import {
  STOCK_QUANTITY_PATTERN,
  describeAdjustment,
  isReasonAllowed,
  type AdjustBatchStockResult,
} from './stock-adjustment';

import type { StockIncreaseListener } from './stock-increase-listener';
import type { ProductRepository } from '../ports/product-repository';

export type AdjustBatchStockDeps = {
  readonly products: ProductRepository;
  /** Recibe el aviso despues de un aumento aplicado; la disminucion no avisa. */
  readonly stockIncreases?: StockIncreaseListener;
  /** Inyectable para que los tests fijen el instante sin tocar el reloj global. */
  readonly now?: () => Date;
};

const stockQuantity = z.string().trim().regex(STOCK_QUANTITY_PATTERN);

/** `strictObject` para que un campo de mas (una diferencia colada) se rechace en vez de ignorarse. */
const adjustBatchStockSchema = z.strictObject({
  batchId: z.string().uuid(),
  countedStock: stockQuantity,
  seenStock: stockQuantity,
  reason: z.enum(MOVEMENT_REASONS),
});

export type AdjustBatchStockInput = z.infer<typeof adjustBatchStockSchema>;

/**
 * Correccion de la existencia de UN lote a partir del total contado.
 *
 * El permiso va antes de zod y antes del puerto: un actor sin el no dispara nada, ni siquiera una
 * validacion que le contaria como es la entrada.
 *
 * El sentido se valida aqui contra la existencia vista, y el puerto solo escribe si la existencia
 * bloqueada es esa misma: cuando escribe, la diferencia que asienta tiene el sentido ya validado.
 */
export function createAdjustBatchStock(
  deps: AdjustBatchStockDeps,
): (input: unknown, actor: Actor | null | undefined) => Promise<AdjustBatchStockResult> {
  const now = deps.now ?? (() => new Date());

  return async function adjustBatchStock(
    input: unknown,
    actor: Actor | null | undefined,
  ): Promise<AdjustBatchStockResult> {
    requirePermission(actor, 'inventario.modificar');

    const parsed = adjustBatchStockSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const entrada = parsed.data;

    const lectura = describeAdjustment(entrada.seenStock, entrada.countedStock);
    // `invalid` no llega: zod ya exigio el mismo patron a los dos campos.
    if (typeof lectura === 'string') throw new ValidationError('el total contado es igual a la existencia vista');
    if (!isReasonAllowed(lectura.direction, entrada.reason)) throw new AdjustmentReasonNotAllowedError();

    const instante = now();

    // La empresa sale del actor y nunca de la entrada, para que nadie pueda ajustar en otra.
    const resultado = await deps.products.adjustBatchStock(
      {
        batchId: entrada.batchId,
        countedStock: entrada.countedStock,
        seenStock: entrada.seenStock,
        reason: entrada.reason,
      },
      actor.id,
      instante,
      { companyId: actor.companyId },
    );

    switch (resultado.kind) {
      // El lote ajeno y el inexistente salen por el mismo camino: distinguirlos convertiria esto
      // en un oraculo de existencia sobre los lotes de las demas empresas.
      case 'batch_not_found':
        throw new BatchNotFoundError();
      case 'stock_changed':
        throw new BatchStockChangedError(resultado.currentStock);
      case 'increase_not_allowed':
        throw new ActionNotAllowedError();
      case 'adjusted':
        break;
    }

    if (lectura.direction === 'increase') {
      await deps.stockIncreases?.onStockIncreased({ companyId: actor.companyId, now: instante });
    }

    return { stock: resultado.stock, reserved: resultado.reserved, overReserved: resultado.overReserved };
  };
}
