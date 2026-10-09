import { errorMessage, type ErrorState } from '@/lib/modules/errores';
import type { OrderDeliveryHistoryView, VoidDeliveryResult } from '@/lib/modules/pedidos';
import type { VoidDeliveryInput } from '@/lib/modules/pedidos/adapters/driving/order-actions';

export const VOID_ORDER_ID = 'a0000000-0000-4000-8000-000000000024';
export const VOID_KEY = 'b0000000-0000-4000-8000-0000000000c1';

/** La entrega mas reciente: dos presentaciones, una ya anulada. */
export const NEWER_DELIVERY_ID = '10000000-0000-4000-8000-000000000002';
/** La entrega mas antigua: una presentacion sin anular. */
export const OLDER_DELIVERY_ID = '10000000-0000-4000-8000-000000000001';

/** Presentacion sin anular de la entrega mas reciente, con dos lotes. */
export const OPEN_LINE_ID = 'd0000000-0000-4000-8000-000000000024';
/** Presentacion ya anulada de la entrega mas reciente. */
export const VOIDED_LINE_ID = 'd0000000-0000-4000-8000-000000000025';

export const FIRST_BATCH_ID = 'e0000000-0000-4000-8000-000000000024';
export const SECOND_BATCH_ID = 'e0000000-0000-4000-8000-000000000025';
export const THIRD_BATCH_ID = 'e0000000-0000-4000-8000-000000000026';

export const VOID_REASON = 'El cliente devolvio el producto por error de etiqueta';

export function deliveryHistoryView(overrides: Partial<OrderDeliveryHistoryView> = {}): OrderDeliveryHistoryView {
  return {
    orderId: VOID_ORDER_ID,
    numberText: '2026-0000024',
    orderStatus: 'ENTREGADO',
    deliveries: [
      {
        id: NEWER_DELIVERY_ID,
        createdAt: '2026-10-08T15:30:00.000Z',
        customerName: 'Ana Perez',
        authorName: 'Laura Gomez',
        presentations: [
          {
            presentationLineId: OPEN_LINE_ID,
            presentationName: 'Botella 1 L',
            packages: 6,
            batches: [
              { batchId: FIRST_BATCH_ID, lot: 'L-2026-0101', packages: 4 },
              { batchId: SECOND_BATCH_ID, lot: 'L-2026-0102', packages: 2 },
            ],
            void: null,
          },
          {
            presentationLineId: VOIDED_LINE_ID,
            presentationName: 'Galon 4 L',
            packages: 3,
            batches: [{ batchId: THIRD_BATCH_ID, lot: 'L-2026-0103', packages: 3 }],
            void: { reason: VOID_REASON, authorName: 'Laura Gomez', createdAt: '2026-10-09T09:00:00.000Z' },
          },
        ],
      },
      {
        id: OLDER_DELIVERY_ID,
        createdAt: '2026-10-07T11:00:00.000Z',
        customerName: 'Ana Perez',
        authorName: 'Carlos Ruiz',
        presentations: [
          {
            presentationLineId: OPEN_LINE_ID,
            presentationName: 'Botella 1 L',
            packages: 4,
            batches: [{ batchId: FIRST_BATCH_ID, lot: 'L-2026-0101', packages: 4 }],
            void: null,
          },
        ],
      },
    ],
    ...overrides,
  };
}

export const VOID_RESULTS = {
  voided: { status: 'voided', orderStatus: 'TERMINADO' },
  alreadyRegistered: { status: 'already_registered', orderStatus: 'ENTREGADO' },
} as const satisfies Record<string, VoidDeliveryResult>;

const errorState = <C extends Exclude<ErrorState['code'], 'unexpected'>>(code: C) =>
  ({ status: 'error', code, message: errorMessage(code) }) as const;

/** Un `ErrorState` por cada codigo que puede devolver la anulacion o la lista de entregas. */
export const VOID_ERROR_STATES = {
  deliveryNotFound: errorState('delivery_not_found'),
  alreadyVoided: errorState('delivery_already_voided'),
  actionNotAllowed: errorState('action_not_allowed'),
  orderNotFound: errorState('order_not_found'),
  invalidInput: errorState('invalid_input'),
  unauthorized: errorState('unauthorized'),
} as const satisfies Record<string, ErrorState>;

export function voidInput(overrides: Partial<VoidDeliveryInput> = {}): VoidDeliveryInput {
  return {
    deliveryId: NEWER_DELIVERY_ID,
    voidKey: VOID_KEY,
    presentationLineIds: [OPEN_LINE_ID],
    reason: VOID_REASON,
    ...overrides,
  };
}
