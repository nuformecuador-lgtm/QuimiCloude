// tests/unit/inventario/finished-goods-dispatch-prisma.test.ts
//
// `dispatchFinishedGoods` (y su fabrica `createFinishedGoodsDispatch`) con un `tx` doblado: nada de
// esto toca Postgres. Cubre el ORDEN de los pasos (producto -> lotes -> decremento -> asiento ->
// recalculo), que un rechazo no escribe ningun asiento y la forma exacta del asiento `delivery`.
// La garantia real contra el decremento condicional, los CHECK y el ambito es de
// `tests/integration/inventario/finished-goods-dispatch.int.test.ts`.

import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { createFinishedGoodsDispatch } from '@/lib/modules/inventario/adapters/driven/persistence/finished-goods-dispatch-prisma';
import { dispatchFinishedGoods } from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';

type BatchRow = { readonly id: string; readonly packageContent: Prisma.Decimal | null };

const COMPANY = 'company-1';
const SCOPE = { companyId: COMPANY };
const NOW = new Date('2026-10-08T12:00:00Z');

function makeTx(overrides: {
  readonly productRows: readonly { id: string }[];
  readonly batchRows: readonly BatchRow[];
  /** `count` que devuelve cada `updateMany`, en orden. Por defecto 1. */
  readonly updateCounts?: readonly number[];
  /** `stock` que relee el `findFirst` tras un `count === 0`. */
  readonly currentStock?: string | null;
}) {
  const order: string[] = [];
  let updateCall = 0;

  const tx = {
    $queryRaw: vi.fn(async () => {
      order.push('product-lock');
      return overrides.productRows;
    }),
    $executeRaw: vi.fn(async () => {
      order.push('recalculate-stock');
      return 1;
    }),
    productBatch: {
      findMany: vi.fn(async () => {
        order.push('batches-read');
        return overrides.batchRows;
      }),
      updateMany: vi.fn(async () => {
        order.push('batch-decrement');
        const count = overrides.updateCounts?.[updateCall] ?? 1;
        updateCall += 1;
        return { count };
      }),
      findFirst: vi.fn(async () => {
        order.push('batch-reread');
        const stock = overrides.currentStock;
        return stock === undefined || stock === null ? null : { stock: new Prisma.Decimal(stock) };
      }),
    },
    inventoryMovement: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        order.push('movement-create');
        return { id: 'movement-1', ...args.data };
      }),
    },
  };

  return { tx: tx as unknown as Prisma.TransactionClient, txDouble: tx, order };
}

function baseInput(overrides: Partial<Parameters<typeof dispatchFinishedGoods>[1]> = {}) {
  return {
    orderId: 'order-1',
    orderDeliveryId: 'delivery-1',
    recipeId: 'recipe-1',
    presentationId: 'presentation-1',
    allocations: [
      { batchId: 'batch-1', packages: 3 },
      { batchId: 'batch-2', packages: 2 },
    ],
    actorId: 'actor-1',
    now: NOW,
    ...overrides,
  };
}

const TWO_BATCHES: readonly BatchRow[] = [
  { id: 'batch-1', packageContent: new Prisma.Decimal('5') },
  { id: 'batch-2', packageContent: new Prisma.Decimal('0.75') },
];

describe('dispatchFinishedGoods — orden de pasos con un tx doblado', () => {
  it('R23: producto -> lotes -> (decremento -> asiento) por lote -> un solo recalculo, y devuelve las cantidades', async () => {
    const { tx, txDouble, order } = makeTx({ productRows: [{ id: 'product-1' }], batchRows: TWO_BATCHES });

    const outcome = await dispatchFinishedGoods(tx, baseInput(), SCOPE);

    expect(outcome).toEqual({
      kind: 'dispatched',
      lines: [
        { batchId: 'batch-1', packages: 3, quantity: '15.0000' },
        { batchId: 'batch-2', packages: 2, quantity: '1.5000' },
      ],
    });
    expect(order).toEqual([
      'product-lock',
      'batches-read',
      'batch-decrement',
      'movement-create',
      'batch-decrement',
      'movement-create',
      'recalculate-stock',
    ]);
    expect(txDouble.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('R28: el decremento es condicional -stock >= cantidad- y acotado a empresa, lote y producto', async () => {
    const { tx, txDouble } = makeTx({ productRows: [{ id: 'product-1' }], batchRows: TWO_BATCHES });

    await dispatchFinishedGoods(tx, baseInput(), SCOPE);

    const firstCall = txDouble.productBatch.updateMany.mock.calls[0] as unknown as [
      { where: { AND: Record<string, unknown>[] }; data: Record<string, unknown> },
    ];
    const [{ where, data }] = firstCall;
    expect(where.AND).toEqual([
      { companyId: COMPANY },
      { id: 'batch-1', productId: 'product-1', stock: { gte: new Prisma.Decimal('15') } },
    ]);
    expect(data).toEqual({
      stock: { decrement: new Prisma.Decimal('15') },
      updatedBy: 'actor-1',
      updatedAt: NOW,
    });
  });

  it('R19: los lotes se leen solo del producto bloqueado, de la empresa y con contenido de envase', async () => {
    const { tx, txDouble } = makeTx({ productRows: [{ id: 'product-1' }], batchRows: TWO_BATCHES });

    await dispatchFinishedGoods(tx, baseInput(), SCOPE);

    expect(txDouble.productBatch.findMany).toHaveBeenCalledWith({
      where: {
        AND: [
          { companyId: COMPANY },
          { id: { in: ['batch-1', 'batch-2'] }, productId: 'product-1', packageContent: { not: null } },
        ],
      },
      select: { id: true, packageContent: true },
    });
  });

  it('R24: cada asiento es delivery, en negativo, con su pedido, su entrega, sin motivo ni linea de reparto', async () => {
    const { tx, txDouble } = makeTx({ productRows: [{ id: 'product-1' }], batchRows: TWO_BATCHES });

    await dispatchFinishedGoods(tx, baseInput(), SCOPE);

    const datos = txDouble.inventoryMovement.create.mock.calls.map((call) => call[0].data);
    expect(datos).toEqual([
      {
        batchId: 'batch-1',
        kind: 'delivery',
        quantity: '-15.0000',
        reason: null,
        orderId: 'order-1',
        orderPresentationLineId: null,
        orderDeliveryId: 'delivery-1',
        createdBy: 'actor-1',
        companyId: COMPANY,
        createdAt: NOW,
      },
      {
        batchId: 'batch-2',
        kind: 'delivery',
        quantity: '-1.5000',
        reason: null,
        orderId: 'order-1',
        orderPresentationLineId: null,
        orderDeliveryId: 'delivery-1',
        createdBy: 'actor-1',
        companyId: COMPANY,
        createdAt: NOW,
      },
    ]);
  });
});

describe('dispatchFinishedGoods — rechazos sin escribir', () => {
  function expectNothingWritten(txDouble: ReturnType<typeof makeTx>['txDouble']): void {
    expect(txDouble.productBatch.updateMany).not.toHaveBeenCalled();
    expect(txDouble.inventoryMovement.create).not.toHaveBeenCalled();
    expect(txDouble.$executeRaw).not.toHaveBeenCalled();
  }

  it('R19: sin producto terminado vivo de la combinacion, batch_not_found con el primer lote', async () => {
    const { tx, txDouble } = makeTx({ productRows: [], batchRows: [] });

    const outcome = await dispatchFinishedGoods(tx, baseInput(), SCOPE);

    expect(outcome).toEqual({ kind: 'batch_not_found', batchId: 'batch-1' });
    expect(txDouble.productBatch.findMany).not.toHaveBeenCalled();
    expectNothingWritten(txDouble);
  });

  it('R19: un lote ajeno, de otro producto o sin contenido no vuelve en la lectura: batch_not_found con ese lote', async () => {
    // La consulta filtra empresa, producto y contenido: cualquiera de los tres casos llega aqui
    // como un lote que simplemente no vuelve.
    const { tx, txDouble } = makeTx({
      productRows: [{ id: 'product-1' }],
      batchRows: [{ id: 'batch-1', packageContent: new Prisma.Decimal('5') }],
    });

    const outcome = await dispatchFinishedGoods(tx, baseInput(), SCOPE);

    expect(outcome).toEqual({ kind: 'batch_not_found', batchId: 'batch-2' });
    expectNothingWritten(txDouble);
  });

  it('R19: un lote que vuelve sin contenido de envase tambien es batch_not_found', async () => {
    const { tx, txDouble } = makeTx({
      productRows: [{ id: 'product-1' }],
      batchRows: [
        { id: 'batch-1', packageContent: new Prisma.Decimal('5') },
        { id: 'batch-2', packageContent: null },
      ],
    });

    const outcome = await dispatchFinishedGoods(tx, baseInput(), SCOPE);

    expect(outcome).toEqual({ kind: 'batch_not_found', batchId: 'batch-2' });
    expectNothingWritten(txDouble);
  });

  it('R20: count === 0 da insufficient con los envases enteros que quedan y sin asiento ni recalculo', async () => {
    const { tx, txDouble, order } = makeTx({
      productRows: [{ id: 'product-1' }],
      batchRows: TWO_BATCHES,
      updateCounts: [0],
      currentStock: '14.9999',
    });

    const outcome = await dispatchFinishedGoods(tx, baseInput(), SCOPE);

    expect(outcome).toEqual({ kind: 'insufficient', batchId: 'batch-1', availablePackages: 2 });
    expect(order).toEqual(['product-lock', 'batches-read', 'batch-decrement', 'batch-reread']);
    expect(txDouble.inventoryMovement.create).not.toHaveBeenCalled();
    expect(txDouble.$executeRaw).not.toHaveBeenCalled();
  });

  it('R20: si el segundo lote no alcanza, el primero ya asento pero no hay recalculo: quien llama deshace todo', async () => {
    const { tx, txDouble } = makeTx({
      productRows: [{ id: 'product-1' }],
      batchRows: TWO_BATCHES,
      updateCounts: [1, 0],
      currentStock: '0.7499',
    });

    const outcome = await dispatchFinishedGoods(tx, baseInput(), SCOPE);

    expect(outcome).toEqual({ kind: 'insufficient', batchId: 'batch-2', availablePackages: 0 });
    expect(txDouble.inventoryMovement.create).toHaveBeenCalledTimes(1);
    expect(txDouble.$executeRaw).not.toHaveBeenCalled();
  });
});

describe('createFinishedGoodsDispatch — la fabrica sobre la tx de quien llama', () => {
  it('R24: dispatchForDelivery acota por la empresa de la entrada y delega en la misma tx', async () => {
    const { tx, txDouble } = makeTx({ productRows: [{ id: 'product-1' }], batchRows: TWO_BATCHES });

    const outcome = await createFinishedGoodsDispatch(tx).dispatchForDelivery({
      companyId: 'company-2',
      ...baseInput(),
    });

    expect(outcome.kind).toBe('dispatched');
    const datos = txDouble.inventoryMovement.create.mock.calls.map((call) => call[0].data);
    expect(datos.map((d) => [d.companyId, d.orderDeliveryId])).toEqual([
      ['company-2', 'delivery-1'],
      ['company-2', 'delivery-1'],
    ]);
  });
});
