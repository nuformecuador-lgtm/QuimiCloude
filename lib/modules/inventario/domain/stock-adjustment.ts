import { compareQuantities, subtractQuantities } from './decimal-quantity';
import { MOVEMENT_REASONS, type MovementReason } from './movement-reason';

/** Decimal NO negativo, hasta diez enteros y cuatro decimales: la escala de `decimal(14,4)`. */
export const STOCK_QUANTITY_PATTERN = /^\d{1,10}(\.\d{1,4})?$/;

export type AdjustmentDirection = 'increase' | 'decrease';

export const REASONS_BY_DIRECTION = {
  increase: ['conteo_fisico', 'error_de_carga'],
  decrease: MOVEMENT_REASONS,
} as const satisfies Record<AdjustmentDirection, readonly MovementReason[]>;

export type StockAdjustment = {
  readonly direction: AdjustmentDirection;
  /** Total contado menos existencia vista, con signo, normalizado a cuatro decimales. */
  readonly difference: string;
  /** Valor absoluto de `difference`, normalizado a cuatro decimales. */
  readonly amount: string;
};

/**
 * `'invalid'`: alguno de los dos no cumple `STOCK_QUANTITY_PATTERN` (vacio, parcial como `'12.'`,
 * con signo, con exponente). `'zero'`: los dos son el mismo decimal (`'12'` y `'12.0000'` lo son).
 */
export type StockAdjustmentReading = StockAdjustment | 'zero' | 'invalid';

export type AdjustBatchStockResult = {
  readonly stock: string;
  readonly reserved: string;
  readonly overReserved: boolean;
};

export type BatchStockAdjustment = {
  readonly batchId: string;
  readonly countedStock: string;
  readonly seenStock: string;
  readonly reason: MovementReason;
};

export type AdjustBatchStockOutcome =
  | {
      readonly kind: 'adjusted';
      readonly previousStock: string;
      readonly difference: string;
      readonly stock: string;
      readonly reserved: string;
      readonly overReserved: boolean;
    }
  | { readonly kind: 'batch_not_found' }
  | { readonly kind: 'stock_changed'; readonly currentStock: string }
  | { readonly kind: 'increase_not_allowed' };

export function describeAdjustment(seenStock: string, countedStock: string): StockAdjustmentReading {
  if (!STOCK_QUANTITY_PATTERN.test(seenStock) || !STOCK_QUANTITY_PATTERN.test(countedStock)) {
    return 'invalid';
  }
  const sign = compareQuantities(countedStock, seenStock);
  if (sign === 0) return 'zero';

  const difference = subtractQuantities(countedStock, seenStock);
  return {
    direction: sign > 0 ? 'increase' : 'decrease',
    difference,
    amount: difference.startsWith('-') ? difference.slice(1) : difference,
  };
}

export function reasonsFor(direction: AdjustmentDirection): readonly MovementReason[] {
  return REASONS_BY_DIRECTION[direction];
}

export function isReasonAllowed(direction: AdjustmentDirection, reason: MovementReason): boolean {
  return reasonsFor(direction).includes(reason);
}
