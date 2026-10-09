'use client';

import { useMemo } from 'react';

import type { OrderDeliveryView } from '@/lib/modules/pedidos';

import {
  clearOrderDeliveryDraft,
  loadOrderDeliveryDraft,
  saveOrderDeliveryDraft,
  type DraftStorage,
  type LoadedOrderDeliveryDraft,
  type OrderDeliveryDraft,
} from './order-delivery-draft';

// Leer `window.localStorage` lanza en algunos modos privados y WebViews con el almacenamiento
// bloqueado.
function browserStorage(): DraftStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export type OrderDeliveryDraftStore = {
  readonly load: (view: OrderDeliveryView) => LoadedOrderDeliveryDraft;
  readonly save: (draft: OrderDeliveryDraft) => void;
  readonly clear: () => void;
};

export function useOrderDeliveryDraft(orderId: string): OrderDeliveryDraftStore {
  return useMemo(() => {
    const storage = browserStorage();
    return {
      load: (view) => loadOrderDeliveryDraft(storage, view, () => crypto.randomUUID()),
      save: (draft) => saveOrderDeliveryDraft(storage, draft),
      clear: () => clearOrderDeliveryDraft(storage, orderId),
    };
  }, [orderId]);
}
