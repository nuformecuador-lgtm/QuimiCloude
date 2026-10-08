import { errorMessage, type ErrorState } from '@/lib/modules/errores';
import type { DeliverOrderResult, OrderDeliveryView } from '@/lib/modules/pedidos';
import type { DeliverOrderInput } from '@/lib/modules/pedidos/adapters/driving/order-actions';

export const DELIVERY_ORDER_ID = 'a0000000-0000-4000-8000-000000000001';
export const DELIVERY_KEY = 'b0000000-0000-4000-8000-0000000000b1';
export const DELIVERY_CUSTOMER_ID = 'c0000000-0000-4000-8000-00000000000a';

/** Linea completa: ya no le falta ningun envase y no ofrece lotes. */
export const COMPLETE_LINE_ID = 'd0000000-0000-4000-8000-000000000001';
/** Linea con envases pendientes y dos lotes entregables. */
export const PENDING_LINE_ID = 'd0000000-0000-4000-8000-000000000002';
export const OLDER_BATCH_ID = 'e0000000-0000-4000-8000-000000000001';
export const NEWER_BATCH_ID = 'e0000000-0000-4000-8000-000000000002';

const PENDING_PRESENTATION_ID = 'f0000000-0000-4000-8000-000000000002';

export function deliveryView(overrides: Partial<OrderDeliveryView> = {}): OrderDeliveryView {
  return {
    orderId: DELIVERY_ORDER_ID,
    numberText: '2026-0000007',
    customer: { id: DELIVERY_CUSTOMER_ID, name: 'Ana Perez', isDeleted: false },
    lines: [
      {
        presentationLineId: COMPLETE_LINE_ID,
        presentationName: 'Galon 4 L',
        orderedPackages: 4,
        deliveredPackages: 4,
        remainingPackages: 0,
        batches: [],
      },
      {
        presentationLineId: PENDING_LINE_ID,
        presentationName: 'Botella 1 L',
        orderedPackages: 10,
        deliveredPackages: 3,
        remainingPackages: 7,
        batches: [
          {
            batchId: OLDER_BATCH_ID,
            presentationId: PENDING_PRESENTATION_ID,
            lot: 'L-2026-0001',
            purchaseDate: '2026-09-30',
            expiryDate: '2027-09-30',
            packageContent: '1.0000',
            availablePackages: 4,
          },
          {
            batchId: NEWER_BATCH_ID,
            presentationId: PENDING_PRESENTATION_ID,
            lot: 'L-2026-0002',
            purchaseDate: '2026-10-05',
            expiryDate: null,
            packageContent: '1.0000',
            availablePackages: 6,
          },
        ],
      },
    ],
    ...overrides,
  };
}

export const DELIVER_RESULTS = {
  partial: { status: 'delivered', orderStatus: 'TERMINADO' },
  completed: { status: 'delivered', orderStatus: 'ENTREGADO' },
  alreadyRegistered: { status: 'already_registered', orderStatus: 'ENTREGADO' },
} as const satisfies Record<string, DeliverOrderResult>;

const errorState = <C extends Exclude<ErrorState['code'], 'unexpected'>>(code: C) =>
  ({ status: 'error', code, message: errorMessage(code) }) as const;

/** Un `ErrorState` por cada codigo que puede devolver la entrega. */
export const DELIVERY_ERROR_STATES = {
  exceedsRemaining: errorState('delivery_exceeds_remaining'),
  batchInsufficient: errorState('delivery_batch_insufficient'),
  batchNotFound: errorState('batch_not_found'),
  actionNotAllowed: errorState('action_not_allowed'),
  orderNotFound: errorState('order_not_found'),
  customerNotFound: errorState('customer_not_found'),
  invalidInput: errorState('invalid_input'),
  unauthorized: errorState('unauthorized'),
} as const satisfies Record<string, ErrorState>;

export function deliverInput(overrides: Partial<DeliverOrderInput> = {}): DeliverOrderInput {
  return {
    orderId: DELIVERY_ORDER_ID,
    deliveryKey: DELIVERY_KEY,
    customerId: DELIVERY_CUSTOMER_ID,
    allocations: [
      { presentationLineId: PENDING_LINE_ID, batchId: OLDER_BATCH_ID, packages: 4 },
      { presentationLineId: PENDING_LINE_ID, batchId: NEWER_BATCH_ID, packages: 2 },
    ],
    ...overrides,
  };
}
