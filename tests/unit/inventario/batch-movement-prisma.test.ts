// Sin Postgres: `writeMovement` recibe su `tx` como argumento, asi que el doble alcanza con un
// objeto que solo implementa `inventoryMovement.create`. `findBatchMovements` si lee del cliente
// compartido, y ese se mockea igual que en `product-batch-lot-retry.test.ts`.

const doble = vi.hoisted(() => ({
  productBatchFindFirst: vi.fn(),
  movementFindMany: vi.fn(),
}));

vi.mock('@/lib/shared/db/prisma', () => ({
  prisma: {
    productBatch: { findFirst: doble.productBatchFindFirst },
    inventoryMovement: { findMany: doble.movementFindMany },
  },
}));

const { writeMovement, findBatchMovements } = await import(
  '@/lib/modules/inventario/adapters/driven/persistence/batch-movement-prisma'
);

import { Prisma } from '@prisma/client';

import type { InventoryScope } from '@/lib/modules/inventario/domain/inventory-scope';

const EMPRESA = '11111111-1111-4111-8111-111111111111';
const AMBITO: InventoryScope = { companyId: EMPRESA };
const AHORA = new Date('2026-09-17T13:00:00.000Z');
const LOTE_ID = '22222222-2222-4222-8222-222222222222';
const ACTOR_ID = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('writeMovement (R6, R12) — recibe la tx, no la abre', () => {
  it('inserta el asiento con las columnas de ambito y sin abrir ninguna transaccion propia', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'movimiento-1' });
    const tx = { inventoryMovement: { create } } as unknown as Parameters<typeof writeMovement>[0];

    await writeMovement(
      tx,
      { batchId: LOTE_ID, kind: 'opening', quantity: '10', reason: null, createdBy: ACTOR_ID },
      AHORA,
      AMBITO,
    );

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      data: {
        batchId: LOTE_ID,
        kind: 'opening',
        quantity: '10',
        reason: null,
        createdBy: ACTOR_ID,
        companyId: EMPRESA,
        createdAt: AHORA,
      },
    });
  });

  it('escribe el motivo cuando el asiento es un ajuste', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'movimiento-2' });
    const tx = { inventoryMovement: { create } } as unknown as Parameters<typeof writeMovement>[0];

    await writeMovement(
      tx,
      { batchId: LOTE_ID, kind: 'adjustment', quantity: '-3', reason: 'merma', createdBy: ACTOR_ID },
      AHORA,
      AMBITO,
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: 'adjustment', quantity: '-3', reason: 'merma' }) }),
    );
  });
});

describe('findBatchMovements (R18) — null cuando el lote no existe o es de otra empresa', () => {
  it('sin fila de lote visible en el ambito, devuelve null sin leer el historial', async () => {
    doble.productBatchFindFirst.mockResolvedValue(null);

    await expect(findBatchMovements(LOTE_ID, AMBITO)).resolves.toBeNull();

    expect(doble.movementFindMany).not.toHaveBeenCalled();
  });

  it('con el lote visible, devuelve el historial del mas reciente al mas antiguo', async () => {
    doble.productBatchFindFirst.mockResolvedValue({ id: LOTE_ID });
    doble.movementFindMany.mockResolvedValue([
      {
        id: 'movimiento-2',
        kind: 'adjustment',
        quantity: new Prisma.Decimal(-3),
        reason: 'merma',
        createdBy: ACTOR_ID,
        createdAt: new Date('2026-09-17T14:00:00.000Z'),
      },
      {
        id: 'movimiento-1',
        kind: 'opening',
        quantity: new Prisma.Decimal(10),
        reason: null,
        createdBy: ACTOR_ID,
        createdAt: AHORA,
      },
    ]);

    await expect(findBatchMovements(LOTE_ID, AMBITO)).resolves.toEqual([
      {
        id: 'movimiento-2',
        kind: 'adjustment',
        quantity: '-3.0000',
        reason: 'merma',
        authorName: ACTOR_ID,
        createdAt: '2026-09-17T14:00:00.000Z',
      },
      {
        id: 'movimiento-1',
        kind: 'opening',
        quantity: '10.0000',
        reason: null,
        authorName: ACTOR_ID,
        createdAt: AHORA.toISOString(),
      },
    ]);

    const llamada = doble.movementFindMany.mock.calls[0]?.[0] as { where: unknown; orderBy: unknown };
    expect(llamada.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    expect(llamada.where).toEqual({ AND: [{ companyId: EMPRESA }, { batchId: LOTE_ID }] });
  });

  it('un lote vivo sin ningun asiento devuelve un array vacio, no null', async () => {
    doble.productBatchFindFirst.mockResolvedValue({ id: LOTE_ID });
    doble.movementFindMany.mockResolvedValue([]);

    await expect(findBatchMovements(LOTE_ID, AMBITO)).resolves.toEqual([]);
  });
});
