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
  readonly recipeRows?: readonly Row[];
  readonly presentationRows: readonly Row[];
  readonly productRows: readonly Row[];
  readonly maxLotRows: readonly Row[];
}) {
  const order: string[] = [];

  const queryRawQueue = [
    async () => {
      order.push('recipe-of-company');
      return overrides.recipeRows ?? [{ id: 'recipe-1' }];
    },
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
      create: vi.fn(async () => {
        order.push('movement-create');
        return {};
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
    orderQuantity: '50.5',
    orderContent: null,
    lotCost: '100',
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
      'recipe-of-company',
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

  it('sin fila de receta de la empresa: rechaza sin escribir nada, y no llega a leer la presentacion', async () => {
    const { tx, txDouble, order } = makeTx({
      recipeRows: [],
      presentationRows: [{ name: 'Botella 1L', unitId: 'unit-1', content: '1.0000' }],
      productRows: [{ id: 'product-1', name: 'Desengrasante industrial · Botella 1L' }],
      maxLotRows: [{ top: null }],
    });

    const outcome = await receiveFinishedGoods(tx, baseInput(), SCOPE);

    expect(outcome).toEqual({ kind: 'recipe_not_found' });
    expect(order).toEqual(['recipe-of-company']);
    expect(txDouble.$executeRaw).not.toHaveBeenCalled();
    expect(txDouble.productBatch.create).not.toHaveBeenCalled();
    expect(txDouble.inventoryMovement.create).not.toHaveBeenCalled();
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

    const outcome = await receiveFinishedGoods(tx, baseInput({ orderQuantity: '10', orderContent: '3' }), SCOPE);

    expect(outcome).toEqual({
      kind: 'received',
      productId: 'product-1',
      productName: 'Desengrasante industrial · Botella 1L',
      packages: '3',
    });
  });

  it('menos de un envase entero: rechaza sin escribir nada', async () => {
    const { tx, txDouble } = makeTx({
      presentationRows: [{ name: 'Botella 1L', unitId: 'unit-1', content: '1.0000' }],
      productRows: [],
      maxLotRows: [],
    });

    const outcome = await receiveFinishedGoods(tx, baseInput({ orderQuantity: '0.5' }), SCOPE);

    expect(outcome).toEqual({ kind: 'no_whole_package' });
    expect(txDouble.$executeRaw).not.toHaveBeenCalled();
    expect(txDouble.productBatch.create).not.toHaveBeenCalled();
    expect(txDouble.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('sin coste de ingredientes: el lote entra a costo cero, nunca sin unit_cost', async () => {
    const { tx, txDouble } = makeTx({
      presentationRows: [{ name: 'Botella 1L', unitId: 'unit-1', content: '1.0000' }],
      productRows: [{ id: 'product-1', name: 'Desengrasante industrial · Botella 1L' }],
      maxLotRows: [{ top: null }],
    });

    const outcome = await receiveFinishedGoods(tx, baseInput({ lotCost: '0.0000' }), SCOPE);

    expect(outcome.kind).toBe('received');
    const createCall = txDouble.productBatch.create.mock.calls[0]?.[0] as { data: { unitCost: unknown } };
    expect(createCall.data.unitCost?.toString()).toBe('0');
  });
});
