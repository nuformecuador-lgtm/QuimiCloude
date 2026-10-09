// tests/unit/inventario/finished-goods-return-prisma.test.ts
//
// `returnFinishedGoods` (y su fabrica `createFinishedGoodsReturn`) con un `tx` doblado: nada de
// esto toca Postgres. Cubre el ORDEN de los pasos (lotes -> productos bloqueados por id ->
// incremento -> asiento -> recalculo), que un lote ausente no escribe nada y la forma exacta del
// asiento `delivery_void`. Lo real contra la base es de
// `tests/integration/inventario/finished-goods-return.int.test.ts`.

import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { createFinishedGoodsReturn } from '@/lib/modules/inventario/adapters/driven/persistence/finished-goods-return-prisma';
import { returnFinishedGoods } from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';

type BatchRow = { readonly id: string; readonly productId: string };

const COMPANY = 'company-1';
const SCOPE = { companyId: COMPANY };
const NOW = new Date('2026-10-09T12:00:00Z');

function makeTx(batchRows: readonly BatchRow[]) {
  const order: string[] = [];

  const tx = {
    $queryRaw: vi.fn(async () => {
      order.push('product-lock');
      return [];
    }),
    $executeRaw: vi.fn(async () => {
      order.push('recalculate-stock');
      return 1;
    }),
    productBatch: {
      findMany: vi.fn(async () => {
        order.push('batches-read');
        return batchRows;
      }),
      update: vi.fn(async (args: { where: { id: string } }) => {
        order.push(`batch-increment:${args.where.id}`);
        return { id: args.where.id };
      }),
    },
    inventoryMovement: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        order.push(`movement-create:${String(args.data.batchId)}`);
        return { id: 'movement-1', ...args.data };
      }),
    },
  };

  return { tx: tx as unknown as Prisma.TransactionClient, txDouble: tx, order };
}

function baseInput(overrides: Partial<Parameters<typeof returnFinishedGoods>[1]> = {}) {
  return {
    orderId: 'order-1',
    orderDeliveryVoidId: 'void-1',
    lines: [
      { batchId: 'batch-1', quantity: '15.0000' },
      { batchId: 'batch-2', quantity: '1.5000' },
      { batchId: 'batch-3', quantity: '2.0000' },
    ],
    actorId: 'actor-1',
    now: NOW,
    ...overrides,
  };
}

// Dos productos, a proposito en orden inverso al de su id.
const THREE_BATCHES: readonly BatchRow[] = [
  { id: 'batch-1', productId: 'product-b' },
  { id: 'batch-2', productId: 'product-a' },
  { id: 'batch-3', productId: 'product-b' },
];

/** El SQL del bloqueo, con sus parametros, como texto comparable. */
function lockSql(txDouble: ReturnType<typeof makeTx>['txDouble']): { sql: string; values: unknown[] } {
  const call = txDouble.$queryRaw.mock.calls[0] as unknown as [Prisma.Sql];
  return { sql: call[0].sql.replace(/\s+/gu, ' ').trim(), values: call[0].values };
}

describe('returnFinishedGoods — orden de pasos con un tx doblado', () => {
  it('R23: lotes -> bloqueo de productos -> (incremento -> asiento) por linea -> un recalculo por producto', async () => {
    const { tx, txDouble, order } = makeTx(THREE_BATCHES);

    const outcome = await returnFinishedGoods(tx, baseInput(), SCOPE);

    expect(outcome).toEqual({ kind: 'returned' });
    expect(order).toEqual([
      'batches-read',
      'product-lock',
      'batch-increment:batch-1',
      'movement-create:batch-1',
      'batch-increment:batch-2',
      'movement-create:batch-2',
      'batch-increment:batch-3',
      'movement-create:batch-3',
      'recalculate-stock',
      'recalculate-stock',
    ]);
    expect(txDouble.$queryRaw).toHaveBeenCalledTimes(1);
    expect(txDouble.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it('R30, R31: bloquea los productos de la empresa ordenados por id, FOR NO KEY UPDATE y sin filtrar por deleted_at', async () => {
    const { tx, txDouble } = makeTx(THREE_BATCHES);

    await returnFinishedGoods(tx, baseInput(), SCOPE);

    const { sql, values } = lockSql(txDouble);
    expect(sql).toMatch(/FROM "products"/);
    expect(sql).toMatch(/ORDER BY "id" FOR NO KEY UPDATE$/);
    expect(sql).not.toMatch(/deleted_at/);
    // Cada producto una sola vez, en orden de id, despues de la empresa.
    expect(values).toEqual([COMPANY, 'product-a', 'product-b']);
  });

  it('R23: el recalculo va una vez por producto afectado, en orden de id', async () => {
    const { tx, txDouble } = makeTx(THREE_BATCHES);

    await returnFinishedGoods(tx, baseInput(), SCOPE);

    const recalculados = txDouble.$executeRaw.mock.calls.map((call) => (call as unknown as [Prisma.Sql])[0].values[0]);
    expect(recalculados).toEqual(['product-a', 'product-b']);
  });

  it('R23: los lotes se leen por id y empresa, sin filtrar por producto vivo', async () => {
    const { tx, txDouble } = makeTx(THREE_BATCHES);

    await returnFinishedGoods(tx, baseInput(), SCOPE);

    expect(txDouble.productBatch.findMany).toHaveBeenCalledWith({
      where: { AND: [{ companyId: COMPANY }, { id: { in: ['batch-1', 'batch-2', 'batch-3'] } }] },
      select: { id: true, productId: true },
    });
  });

  it('R23: el incremento suma la cantidad de la linea al lote por su clave (id, empresa), sin condicion de stock', async () => {
    const { tx, txDouble } = makeTx(THREE_BATCHES);

    await returnFinishedGoods(tx, baseInput(), SCOPE);

    expect(txDouble.productBatch.update.mock.calls[0]).toEqual([
      {
        where: { id: 'batch-1', companyId: COMPANY },
        data: { stock: { increment: new Prisma.Decimal('15.0000') }, updatedBy: 'actor-1', updatedAt: NOW },
        select: { id: true },
      },
    ]);
  });

  it('R24: writeMovement recibe delivery_void, cantidad positiva, pedido, anulacion y reason null', async () => {
    const { tx, txDouble } = makeTx(THREE_BATCHES);

    await returnFinishedGoods(tx, baseInput(), SCOPE);

    const datos = txDouble.inventoryMovement.create.mock.calls.map((call) => call[0].data);
    expect(datos).toEqual(
      [
        ['batch-1', '15.0000'],
        ['batch-2', '1.5000'],
        ['batch-3', '2.0000'],
      ].map(([batchId, quantity]) => ({
        batchId,
        kind: 'delivery_void',
        quantity,
        reason: null,
        orderId: 'order-1',
        orderPresentationLineId: null,
        orderDeliveryVoidId: 'void-1',
        createdBy: 'actor-1',
        companyId: COMPANY,
        createdAt: NOW,
      })),
    );
    // Ni entrega ni datos de ajuste: el asiento de anulacion no los lleva.
    for (const dato of datos) {
      expect(dato).not.toHaveProperty('orderDeliveryId');
      expect(dato).not.toHaveProperty('stockBefore');
    }
  });

  it('sin lineas no lee, no bloquea ni escribe', async () => {
    const { tx, order } = makeTx(THREE_BATCHES);

    const outcome = await returnFinishedGoods(tx, baseInput({ lines: [] }), SCOPE);

    expect(outcome).toEqual({ kind: 'returned' });
    expect(order).toEqual([]);
  });
});

describe('returnFinishedGoods — lote ausente sin escribir', () => {
  it('R29: un lote que no vuelve (ausente o de otra empresa) da batch_not_found con ese lote y no escribe nada', async () => {
    const { tx, txDouble, order } = makeTx([THREE_BATCHES[0] as BatchRow, THREE_BATCHES[2] as BatchRow]);

    const outcome = await returnFinishedGoods(tx, baseInput(), SCOPE);

    expect(outcome).toEqual({ kind: 'batch_not_found', batchId: 'batch-2' });
    expect(order).toEqual(['batches-read']);
    expect(txDouble.$queryRaw).not.toHaveBeenCalled();
    expect(txDouble.productBatch.update).not.toHaveBeenCalled();
    expect(txDouble.inventoryMovement.create).not.toHaveBeenCalled();
    expect(txDouble.$executeRaw).not.toHaveBeenCalled();
  });
});

describe('createFinishedGoodsReturn — la fabrica sobre la tx de quien llama', () => {
  it('R24: returnForDeliveryVoid acota por la empresa de la entrada y delega en la misma tx', async () => {
    const { tx, txDouble } = makeTx(THREE_BATCHES);

    const outcome = await createFinishedGoodsReturn(tx).returnForDeliveryVoid({ companyId: 'company-2', ...baseInput() });

    expect(outcome).toEqual({ kind: 'returned' });
    const datos = txDouble.inventoryMovement.create.mock.calls.map((call) => call[0].data);
    expect(datos.map((d) => [d.companyId, d.orderDeliveryVoidId])).toEqual([
      ['company-2', 'void-1'],
      ['company-2', 'void-1'],
      ['company-2', 'void-1'],
    ]);
    expect(lockSql(txDouble).values[0]).toBe('company-2');
  });
});
