import { describe, expect, it, vi } from 'vitest';

import {
  adjustOrderDeliveryDraft,
  clearOrderDeliveryDraft,
  loadOrderDeliveryDraft,
  orderDeliveryDraftKey,
  packagesKey,
  parseOrderDeliveryDraft,
  saveOrderDeliveryDraft,
  type DraftStorage,
  type OrderDeliveryDraft,
} from '@/app/(private)/pedidos/components';

import {
  COMPLETE_LINE_ID,
  DELIVERY_KEY,
  DELIVERY_ORDER_ID,
  NEWER_BATCH_ID,
  OLDER_BATCH_ID,
  PENDING_LINE_ID,
  deliveryView,
} from '../../fixtures/order-delivery';

const OTHER_ORDER_ID = 'a0000000-0000-4000-8000-000000000002';
const GONE_BATCH_ID = 'e0000000-0000-4000-8000-000000000099';
const OTHER_CUSTOMER = { id: 'c0000000-0000-4000-8000-00000000000b', name: 'Luis Gil', isDeleted: false };

function memoryStorage(): DraftStorage & { readonly items: Map<string, string> } {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  };
}

function throwingStorage(): DraftStorage {
  const fail = () => {
    throw new Error('QuotaExceededError');
  };
  return { getItem: fail, setItem: fail, removeItem: fail };
}

function draft(overrides: Partial<OrderDeliveryDraft> = {}): OrderDeliveryDraft {
  return {
    v: 1,
    orderId: DELIVERY_ORDER_ID,
    deliveryKey: DELIVERY_KEY,
    customer: OTHER_CUSTOMER,
    packages: { [packagesKey(PENDING_LINE_ID, OLDER_BATCH_ID)]: '3' },
    ...overrides,
  };
}

const neverCalled = () => {
  throw new Error('no debe generarse una clave nueva');
};

describe('borrador de entrega', () => {
  it('R35: escribe y lee por pedido, con su clave de entrega', () => {
    const storage = memoryStorage();
    saveOrderDeliveryDraft(storage, draft());

    expect([...storage.items.keys()]).toEqual([orderDeliveryDraftKey(DELIVERY_ORDER_ID)]);
    const loaded = loadOrderDeliveryDraft(storage, deliveryView(), neverCalled);
    expect(loaded).toEqual({ draft: draft(), adjusted: false });
  });

  it('R35: el borrador de un pedido no se lee desde otro', () => {
    const storage = memoryStorage();
    saveOrderDeliveryDraft(storage, draft());
    const newKey = vi.fn(() => 'b0000000-0000-4000-8000-0000000000b2');

    const loaded = loadOrderDeliveryDraft(storage, deliveryView({ orderId: OTHER_ORDER_ID }), newKey);

    expect(newKey).toHaveBeenCalledOnce();
    expect(loaded.draft.orderId).toBe(OTHER_ORDER_ID);
    expect(loaded.draft.packages).toEqual({});
  });

  it('R35, R9: sin borrador empieza con el cliente vivo del pedido y una clave nueva', () => {
    const loaded = loadOrderDeliveryDraft(memoryStorage(), deliveryView(), () => DELIVERY_KEY);

    expect(loaded).toEqual({
      draft: {
        v: 1,
        orderId: DELIVERY_ORDER_ID,
        deliveryKey: DELIVERY_KEY,
        customer: deliveryView().customer,
        packages: {},
      },
      adjusted: false,
    });
  });

  it('R9: sin borrador y con el cliente del pedido dado de baja, el cliente queda vacio', () => {
    const view = deliveryView({ customer: { ...OTHER_CUSTOMER, isDeleted: true } });
    expect(loadOrderDeliveryDraft(null, view, () => DELIVERY_KEY).draft.customer).toBeNull();
  });

  it('R36: borra el borrador del pedido y deja los de los demas', () => {
    const storage = memoryStorage();
    saveOrderDeliveryDraft(storage, draft());
    saveOrderDeliveryDraft(storage, draft({ orderId: OTHER_ORDER_ID }));

    clearOrderDeliveryDraft(storage, DELIVERY_ORDER_ID);

    expect([...storage.items.keys()]).toEqual([orderDeliveryDraftKey(OTHER_ORDER_ID)]);
  });

  it('R37: descarta los envases de los lotes que ya no se ofrecen y marca `adjusted`', () => {
    const saved = draft({
      packages: {
        [packagesKey(PENDING_LINE_ID, OLDER_BATCH_ID)]: '2',
        [packagesKey(PENDING_LINE_ID, NEWER_BATCH_ID)]: '1',
        [packagesKey(PENDING_LINE_ID, GONE_BATCH_ID)]: '4',
        [packagesKey(COMPLETE_LINE_ID, OLDER_BATCH_ID)]: '1',
      },
    });

    const result = adjustOrderDeliveryDraft(saved, deliveryView());

    expect(result.adjusted).toBe(true);
    expect(result.draft.packages).toEqual({
      [packagesKey(PENDING_LINE_ID, OLDER_BATCH_ID)]: '2',
      [packagesKey(PENDING_LINE_ID, NEWER_BATCH_ID)]: '1',
    });
    expect(result.draft.deliveryKey).toBe(DELIVERY_KEY);
    expect(result.draft.customer).toEqual(OTHER_CUSTOMER);
  });

  it('R37: un lote retirado sin envases escritos no cuenta como ajuste', () => {
    const saved = draft({ packages: { [packagesKey(PENDING_LINE_ID, GONE_BATCH_ID)]: '' } });
    expect(adjustOrderDeliveryDraft(saved, deliveryView())).toEqual({
      draft: { ...saved, packages: {} },
      adjusted: false,
    });
  });

  it.each([
    ['JSON corrupto', '{"v":1,'],
    ['otra version', JSON.stringify({ ...draft(), v: 2 })],
    ['sin clave de entrega', JSON.stringify({ ...draft(), deliveryKey: '' })],
    ['envases que no son texto', JSON.stringify({ ...draft(), packages: { a: 3 } })],
    ['cliente mal formado', JSON.stringify({ ...draft(), customer: { id: 'x' } })],
    ['un array', '[]'],
  ])('%s: se descarta sin lanzar', (_caso, raw) => {
    expect(parseOrderDeliveryDraft(raw, DELIVERY_ORDER_ID)).toBeNull();

    const storage = memoryStorage();
    storage.setItem(orderDeliveryDraftKey(DELIVERY_ORDER_ID), raw);
    const loaded = loadOrderDeliveryDraft(storage, deliveryView(), () => 'nueva');
    expect(loaded.draft.deliveryKey).toBe('nueva');
    expect(loaded.draft.packages).toEqual({});
  });

  it('sin localStorage, o con uno que lanza, ninguna operacion lanza', () => {
    for (const storage of [null, throwingStorage()]) {
      expect(() => saveOrderDeliveryDraft(storage, draft())).not.toThrow();
      expect(() => clearOrderDeliveryDraft(storage, DELIVERY_ORDER_ID)).not.toThrow();
      expect(loadOrderDeliveryDraft(storage, deliveryView(), () => DELIVERY_KEY).draft.packages).toEqual(
        {},
      );
    }
  });
});
