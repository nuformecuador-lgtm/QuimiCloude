// tests/unit/inventario/finished-goods-prisma.test.ts
//
// `receiveFinishedGoods` con un `tx` doblado: nada de esto toca Postgres. Cubre el ORDEN de los
// pasos (presentacion -> producto -> lote -> asiento -> recalculo) y que un rechazo temprano no
// llega a escribir nada. La garantia real contra el `ON CONFLICT`, el indice parcial y el
// `CHECK` de la base es de `finished-goods.int.test.ts`.

import { describe, expect, it, vi } from 'vitest';

import { receiveFinishedGoods } from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';

import type { Prisma } from '@prisma/client';

type Row = Record<string, unknown>;

function makeTx(overrides: {
  readonly presentationRows: readonly Row[];
  readonly productRows: readonly Row[];
  readonly maxLotRows: readonly Row[];
}) {
  const order: string[] = [];

  const queryRawQueue = [
    async () => {
      order.push('presentation-for-share');
      return overrides.presentationRows;
    },
    async () => {
      order.push('product-select');
      return overrides.productRows;
    },
    async () => {
      order.push('max-lot');
      return overrides.maxLotRows;
    },
  ];
  let queryRawCall = 0;

  const executeRawQueue = ['insert-product', 'advisory-lock', 'recalculate-stock'];
  let executeRawCall = 0;

  const tx = {
    $queryRaw: vi.fn(async () => {
      const step = queryRawQueue[queryRawCall];
      queryRawCall += 1;
      return step ? step() : [];
    }),
    $executeRaw: vi.fn(async () => {
      order.push(executeRawQueue[executeRawCall] ?? `executeRaw-${executeRawCall}`);
      executeRawCall += 1;
      return 1;
    }),
    productBatch: {
      create: vi.fn(async (args: { data: { id?: string } }) => {
        order.push('batch-create');
        return { id: 'batch-1', ...args.data };
      }),
    },
    inventoryMovement: {
      create: vi.fn(async (args: { data: { orderId?: string; orderPresentationLineId?: string } }) => {
        order.push('movement-create');
        return { id: 'movement-1', ...args.data };
      }),
    },
  };

  return { tx: tx as unknown as Prisma.TransactionClient, txDouble: tx, order };
}

const SCOPE = { companyId: 'company-1' };

function baseInput(overrides: Partial<Parameters<typeof receiveFinishedGoods>[1]> = {}) {
  return {
    orderId: 'order-1',
    recipeId: 'recipe-1',
    recipeName: 'Desengrasante industrial',
    presentationId: 'presentation-1',
    orderPresentationLineId: 'line-1',
    packages: 50,
    orderContent: null,
    unitCost: '2.0000',
    actorId: 'actor-1',
    now: new Date('2026-09-24T12:00:00Z'),
    ...overrides,
  };
}

describe('receiveFinishedGoods — orden de pasos con un tx doblado', () => {
  it('camino feliz: presentacion -> producto -> advisory lock -> max lote -> lote -> asiento -> recalculo', async () => {
    const { tx, order } = makeTx({
      presentationRows: [{ name: 'Botella 1L', unitId: 'unit-1', content: '1.0000' }],
      productRows: [{ id: 'product-1', name: 'Desengrasante industrial · Botella 1L' }],
      maxLotRows: [{ top: null }],
    });

    const outcome = await receiveFinishedGoods(tx, baseInput(), SCOPE);

    expect(outcome).toEqual({
      kind: 'received',
      productId: 'product-1',
      productName: 'Desengrasante industrial · Botella 1L',
      packages: '50',
    });
    expect(order).toEqual([
      'presentation-for-share',
      'insert-product',
      'product-select',
      'advisory-lock',
      'max-lot',
      'batch-create',
      'movement-create',
      'recalculate-stock',
    ]);
  });

  it('sin fila de presentacion: rechaza sin escribir nada', async () => {
    const { tx, txDouble } = makeTx({ presentationRows: [], productRows: [], maxLotRows: [] });

    const outcome = await receiveFinishedGoods(tx, baseInput(), SCOPE);

    expect(outcome).toEqual({ kind: 'presentation_without_content' });
    expect(txDouble.$executeRaw).not.toHaveBeenCalled();
    expect(txDouble.productBatch.create).not.toHaveBeenCalled();
    expect(txDouble.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('sin copia del pedido y sin contenido vigente: rechaza sin escribir nada', async () => {
    const { tx, txDouble } = makeTx({
      presentationRows: [{ name: 'Botella 1L', unitId: 'unit-1', content: null }],
      productRows: [],
      maxLotRows: [],
    });

    const outcome = await receiveFinishedGoods(tx, baseInput({ orderContent: null }), SCOPE);

    expect(outcome).toEqual({ kind: 'presentation_without_content' });
    expect(txDouble.$executeRaw).not.toHaveBeenCalled();
    expect(txDouble.productBatch.create).not.toHaveBeenCalled();
  });

  it('la copia del pedido manda sobre el contenido vigente de la presentacion', async () => {
    const { tx } = makeTx({
      presentationRows: [{ name: 'Botella 1L', unitId: 'unit-1', content: '2.0000' }],
      productRows: [{ id: 'product-1', name: 'Desengrasante industrial · Botella 1L' }],
      maxLotRows: [{ top: null }],
    });

    const outcome = await receiveFinishedGoods(tx, baseInput({ packages: 3, orderContent: '3' }), SCOPE);

    expect(outcome).toEqual({
      kind: 'received',
      productId: 'product-1',
      productName: 'Desengrasante industrial · Botella 1L',
      packages: '3',
    });
  });

  // Los envases ya no se calculan aqui -los da la linea del reparto, validada
  // entero y positivo rio arriba (R1)-, asi que no hay division que pueda dejar
  // `no_whole_package`: ese caso desaparecio del contrato. Lo que queda de ese caso es este:
  // el `unitCost` ya llega resuelto y esta funcion lo escribe tal cual, sin recalcularlo.
  it('el unitCost llega resuelto y se escribe tal cual, sin recalcularlo', async () => {
    const { tx, txDouble } = makeTx({
      presentationRows: [{ name: 'Botella 1L', unitId: 'unit-1', content: '1.0000' }],
      productRows: [{ id: 'product-1', name: 'Desengrasante industrial · Botella 1L' }],
      maxLotRows: [{ top: null }],
    });

    const outcome = await receiveFinishedGoods(tx, baseInput({ unitCost: '0.0000' }), SCOPE);

    expect(outcome.kind).toBe('received');
    const createCall = txDouble.productBatch.create.mock.calls[0]?.[0] as { data: { unitCost: unknown } };
    expect(createCall.data.unitCost?.toString()).toBe('0');
  });

  it('el asiento `production` lleva `order_id` Y `order_presentation_line_id`', async () => {
    const { tx, txDouble } = makeTx({
      presentationRows: [{ name: 'Botella 1L', unitId: 'unit-1', content: '1.0000' }],
      productRows: [{ id: 'product-1', name: 'Desengrasante industrial · Botella 1L' }],
      maxLotRows: [{ top: null }],
    });

    await receiveFinishedGoods(tx, baseInput({ orderId: 'order-9', orderPresentationLineId: 'line-9' }), SCOPE);

    const createCall = txDouble.inventoryMovement.create.mock.calls[0]?.[0];
    expect(createCall?.data.orderId).toBe('order-9');
    expect(createCall?.data.orderPresentationLineId).toBe('line-9');
  });
});
