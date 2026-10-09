import type { OrderCustomer, OrderDeliveryView } from '@/lib/modules/pedidos';

const DRAFT_KEY_PREFIX = 'qc.order-delivery-draft.';
const DRAFT_VERSION = 1;

/** Lo que el sheet guarda de una entrega a medias. `packages` lleva el texto tal cual se escribio. */
export type OrderDeliveryDraft = {
  readonly v: typeof DRAFT_VERSION;
  readonly orderId: string;
  readonly deliveryKey: string;
  readonly customer: OrderCustomer | null;
  readonly packages: Readonly<Record<string, string>>;
};

export type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type LoadedOrderDeliveryDraft = {
  readonly draft: OrderDeliveryDraft;
  /** Se descarto algun envase escrito en un lote que ya no se ofrece. */
  readonly adjusted: boolean;
};

export function orderDeliveryDraftKey(orderId: string): string {
  return `${DRAFT_KEY_PREFIX}${orderId}`;
}

export function packagesKey(presentationLineId: string, batchId: string): string {
  return `${presentationLineId}:${batchId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseCustomer(value: unknown): OrderCustomer | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const { id, name, isDeleted } = value;
  if (typeof id !== 'string' || typeof name !== 'string' || typeof isDeleted !== 'boolean') {
    return undefined;
  }
  return { id, name, isDeleted };
}

function parsePackages(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const packages: Record<string, string> = {};
  for (const [key, text] of Object.entries(value)) {
    if (typeof text !== 'string') return undefined;
    packages[key] = text;
  }
  return packages;
}

/** Un texto que no es un borrador de esta version y de este pedido devuelve `null`, sin lanzar. */
export function parseOrderDeliveryDraft(
  raw: string | null,
  orderId: string,
): OrderDeliveryDraft | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value) || value.v !== DRAFT_VERSION || value.orderId !== orderId) return null;
  if (typeof value.deliveryKey !== 'string' || value.deliveryKey === '') return null;
  const customer = parseCustomer(value.customer);
  const packages = parsePackages(value.packages);
  if (customer === undefined || packages === undefined) return null;
  return { v: DRAFT_VERSION, orderId, deliveryKey: value.deliveryKey, customer, packages };
}

export function newOrderDeliveryDraft(
  view: OrderDeliveryView,
  deliveryKey: string,
): OrderDeliveryDraft {
  const customer = view.customer !== null && !view.customer.isDeleted ? view.customer : null;
  return { v: DRAFT_VERSION, orderId: view.orderId, deliveryKey, customer, packages: {} };
}

/** Quita los envases de los lotes que la vista ya no ofrece para su linea. */
export function adjustOrderDeliveryDraft(
  draft: OrderDeliveryDraft,
  view: OrderDeliveryView,
): LoadedOrderDeliveryDraft {
  const offered = new Set(
    view.lines.flatMap((line) =>
      line.batches.map((batch) => packagesKey(line.presentationLineId, batch.batchId)),
    ),
  );
  const packages: Record<string, string> = {};
  let adjusted = false;
  for (const [key, text] of Object.entries(draft.packages)) {
    if (offered.has(key)) {
      packages[key] = text;
    } else if (text.trim() !== '') {
      adjusted = true;
    }
  }
  return { draft: { ...draft, packages }, adjusted };
}

/**
 * Lee el borrador del pedido y lo ajusta a la vista. Sin borrador valido, empieza uno con el
 * cliente vivo del pedido y una clave de entrega nueva.
 */
export function loadOrderDeliveryDraft(
  storage: DraftStorage | null,
  view: OrderDeliveryView,
  newDeliveryKey: () => string,
): LoadedOrderDeliveryDraft {
  let raw: string | null = null;
  try {
    raw = storage?.getItem(orderDeliveryDraftKey(view.orderId)) ?? null;
  } catch {
    raw = null;
  }
  const saved = parseOrderDeliveryDraft(raw, view.orderId);
  if (saved === null) {
    return { draft: newOrderDeliveryDraft(view, newDeliveryKey()), adjusted: false };
  }
  return adjustOrderDeliveryDraft(saved, view);
}

// Sin almacenamiento, o con la cuota llena, el sheet sigue funcionando: solo deja de persistir.
export function saveOrderDeliveryDraft(storage: DraftStorage | null, draft: OrderDeliveryDraft): void {
  try {
    storage?.setItem(orderDeliveryDraftKey(draft.orderId), JSON.stringify(draft));
  } catch {
    // Ignorado a proposito: ver arriba.
  }
}

export function clearOrderDeliveryDraft(storage: DraftStorage | null, orderId: string): void {
  try {
    storage?.removeItem(orderDeliveryDraftKey(orderId));
  } catch {
    // Ignorado a proposito: ver `saveOrderDeliveryDraft`.
  }
}
