import { errorMessage } from '@/lib/modules/errores';
import type { AdjustBatchStockOutcome, BatchHistoryEntry } from '@/lib/modules/inventario';
import type { AdjustBatchStockFormState } from '@/lib/modules/inventario/adapters/driving/batch-actions';

export const ADJUST_BATCH_ID = '11111111-1111-4111-8111-111111111111';

export const ADJUST_FORM_STATES = {
  success: { status: 'success', stock: '7.0000', reserved: '0.0000', overReserved: false },
  successOverReserved: { status: 'success', stock: '2.0000', reserved: '5.0000', overReserved: true },
  stockChanged: {
    status: 'stock_changed',
    code: 'batch_stock_changed',
    message: errorMessage('batch_stock_changed'),
    currentStock: '8.0000',
  },
  reasonNotAllowed: {
    status: 'error',
    code: 'adjustment_reason_not_allowed',
    message: errorMessage('adjustment_reason_not_allowed'),
  },
  zero: { status: 'error', code: 'invalid_input', message: errorMessage('invalid_input') },
  finishedIncrease: {
    status: 'error',
    code: 'action_not_allowed',
    message: errorMessage('action_not_allowed'),
  },
  unexpected: {
    status: 'error',
    code: 'unexpected',
    message: errorMessage('unexpected'),
    reference: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  },
} as const satisfies Record<string, AdjustBatchStockFormState>;

export function historyEntry(overrides: Partial<BatchHistoryEntry> = {}): BatchHistoryEntry {
  return {
    id: 'asiento-1',
    kind: 'adjustment',
    quantity: '-3.0000',
    reason: 'merma',
    orderNumberText: null,
    authorName: 'Carla Duarte',
    createdAt: '2026-10-06T08:15:00.000Z',
    previousStock: null,
    countedStock: null,
    ...overrides,
  };
}

export const ADJUSTMENT_WITH_COUNT: BatchHistoryEntry = historyEntry({
  id: 'ajuste-con-conteo',
  previousStock: '10.0000',
  countedStock: '7.0000',
});

/** Ajuste guardado antes de que existieran las columnas: sin existencia anterior ni total contado. */
export const LEGACY_ADJUSTMENT: BatchHistoryEntry = historyEntry({ id: 'ajuste-anterior' });

type AdjustFormFields = {
  batchId: string;
  countedStock: string;
  seenStock: string;
  reason: string;
};

export function adjustFormData(fields: Partial<AdjustFormFields> = {}): FormData {
  const values: AdjustFormFields = {
    batchId: ADJUST_BATCH_ID,
    countedStock: '7',
    seenStock: '10',
    reason: 'merma',
    ...fields,
  };
  const formData = new FormData();
  for (const [name, value] of Object.entries(values)) {
    formData.set(name, value);
  }
  return formData;
}

export function adjustedOutcome(
  overrides: Partial<Omit<Extract<AdjustBatchStockOutcome, { kind: 'adjusted' }>, 'kind'>> = {},
): AdjustBatchStockOutcome {
  return {
    kind: 'adjusted',
    previousStock: '10.0000',
    difference: '-3.0000',
    stock: '7.0000',
    reserved: '0.0000',
    overReserved: false,
    ...overrides,
  };
}
