// Sin Postgres: el doble finge el contrato del cliente de Prisma, igual que
// `product-batch-lot-retry.test.ts`. Que el `increment` sea de verdad relativo en la base, que el
// CHECK rechace el negativo y que un lote de otra empresa no aparezca lo prueba la integracion.

import { Prisma } from '@prisma/client';

const doble = vi.hoisted(() => {
  const productCreate = vi.fn();
  const batchCreate = vi.fn();
  const batchUpdate = vi.fn();
  const executeRaw = vi.fn();
  const queryRaw = vi.fn();
  const movementCreate = vi.fn();
  const tx = {
    product: { create: productCreate },
    productBatch: { create: batchCreate, update: batchUpdate },
    inventoryMovement: { create: movementCreate },
    $executeRaw: executeRaw,
    $queryRaw: queryRaw,
  };
  return {
    tx,
    productCreate,
    batchCreate,
    batchUpdate,
    executeRaw,
    queryRaw,
    movementCreate,
    transaction: vi.fn(),
  };
});

vi.mock('@/lib/shared/db/prisma', () => ({
  prisma: { $transaction: doble.transaction },
}));

const { adjustBatchStock, createWithFirstBatch } = await import(
  '@/lib/modules/inventario/adapters/driven/persistence/product-prisma'
);
const { BatchStockNegativeError } = await import('@/lib/modules/inventario/domain/errors');

import type { InventoryScope } from '@/lib/modules/inventario/domain/inventory-scope';
import type { NewProductBatch } from '@/lib/modules/inventario/domain/product-batch';
import type { NewProduct } from '@/lib/modules/inventario/domain/product-view';

const EMPRESA = '11111111-1111-4111-8111-111111111111';
const AMBITO: InventoryScope = { companyId: EMPRESA };
const AHORA = new Date('2026-09-17T13:00:00.000Z');
const PRODUCTO_ID = '22222222-2222-4222-8222-222222222222';
const LOTE_ID = '33333333-3333-4333-8333-333333333333';
const ACTOR_ID = '44444444-4444-4444-8444-444444444444';

const PRODUCTO: NewProduct = { name: 'Acido citrico' };

const LOTE: NewProductBatch = {
  presentationId: '55555555-5555-4555-8555-555555555555',
  stock: 10,
  unitCost: '2.5000',
  lot: null,
  purchaseDate: '2026-09-10',
  expiryDate: null,
  createdBy: ACTOR_ID,
};

beforeEach(() => {
  vi.resetAllMocks();
  doble.transaction.mockImplementation(
    async (run: (client: typeof doble.tx) => Promise<unknown>) => run(doble.tx),
  );
  doble.productCreate.mockResolvedValue({ id: PRODUCTO_ID });
  doble.batchCreate.mockResolvedValue({ id: LOTE_ID });
  doble.executeRaw.mockResolvedValue(0);
  doble.queryRaw.mockResolvedValue([{ top: '0' }]);
  doble.movementCreate.mockResolvedValue({ id: 'movimiento-1' });
});

/** El `23514` construido como lo entrega el conector para una restriccion nombrada. */
function violacionDeCheck(nombreRestriccion: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    `new row for relation "product_batches" violates check constraint "${nombreRestriccion}"`,
    { code: 'P2010', clientVersion: '6.19.3', meta: { code: '23514', message: nombreRestriccion } },
  );
}

/** `P2025`: lo que Prisma lanza cuando el `where` unico mas el filtro extra no hallan fila. */
function registroNoEncontrado(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('An operation failed because it depends on one or more records that were required but not found.', {
    code: 'P2025',
    clientVersion: '6.19.3',
  });
}

describe('R12 — el alta deja su asiento de apertura en la misma transaccion', () => {
  it('createWithFirstBatch escribe el lote y, despues, su asiento de apertura', async () => {
    await expect(createWithFirstBatch(PRODUCTO, LOTE, AHORA, AMBITO)).resolves.toEqual({
      id: PRODUCTO_ID,
      batchId: LOTE_ID,
      lot: '1',
    });

    expect(doble.movementCreate).toHaveBeenCalledTimes(1);
    expect(doble.movementCreate).toHaveBeenCalledWith({
      data: {
        batchId: LOTE_ID,
        kind: 'opening',
        quantity: LOTE.stock,
        reason: null,
        createdBy: ACTOR_ID,
        companyId: EMPRESA,
        createdAt: AHORA,
      },
    });
    // El asiento se escribe DESPUES de crear el lote, no antes: no hay nada que asentar todavia.
    expect(doble.batchCreate.mock.invocationCallOrder[0]).toBeLessThan(
      doble.movementCreate.mock.invocationCallOrder[0] as number,
    );
  });

  it('si el asiento falla, la transaccion entera se rechaza y no solo el lote queda escrito', async () => {
    const fallo = new Error('la base rechazo el INSERT del asiento');
    doble.movementCreate.mockRejectedValueOnce(fallo);

    await expect(createWithFirstBatch(PRODUCTO, LOTE, AHORA, AMBITO)).rejects.toBe(fallo);

    expect(doble.batchCreate).toHaveBeenCalledTimes(1);
    expect(doble.movementCreate).toHaveBeenCalledTimes(1);
  });
});

describe('adjustBatchStock (R1, R2, R4, R6, R7, R18) — increment relativo mas su asiento, en una tx', () => {
  it('R2, R7: un delta positivo suma sobre lo que la base tenga, y el asiento queda como ajuste', async () => {
    doble.batchUpdate.mockResolvedValueOnce({ stock: 15 });

    await expect(adjustBatchStock(LOTE_ID, 5, 'conteo_fisico', ACTOR_ID, AHORA, AMBITO)).resolves.toEqual({
      stock: 15,
    });

    expect(doble.batchUpdate).toHaveBeenCalledWith({
      where: { id: LOTE_ID, companyId: EMPRESA },
      data: { stock: { increment: 5 }, updatedBy: ACTOR_ID, updatedAt: AHORA },
      select: { stock: true },
    });
    expect(doble.movementCreate).toHaveBeenCalledWith({
      data: {
        batchId: LOTE_ID,
        kind: 'adjustment',
        quantity: 5,
        reason: 'conteo_fisico',
        createdBy: ACTOR_ID,
        companyId: EMPRESA,
        createdAt: AHORA,
      },
    });
  });

  it('R2, R7: un delta negativo resta sobre lo que la base tenga', async () => {
    doble.batchUpdate.mockResolvedValueOnce({ stock: 6 });

    await expect(adjustBatchStock(LOTE_ID, -4, 'merma', ACTOR_ID, AHORA, AMBITO)).resolves.toEqual({
      stock: 6,
    });

    expect(doble.batchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stock: { increment: -4 } }) }),
    );
    expect(doble.movementCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ quantity: -4, reason: 'merma' }) }),
    );
  });

  it('R18: un lote inexistente o de otra empresa no afecta ninguna fila y devuelve null sin asentar nada', async () => {
    doble.batchUpdate.mockRejectedValueOnce(registroNoEncontrado());

    await expect(adjustBatchStock(LOTE_ID, 5, 'merma', ACTOR_ID, AHORA, AMBITO)).resolves.toBeNull();

    expect(doble.movementCreate).not.toHaveBeenCalled();
  });

  it('R6: si el asiento falla, el ajuste entero se rechaza -no queda el ajuste sin su asiento-', async () => {
    doble.batchUpdate.mockResolvedValueOnce({ stock: 15 });
    const fallo = new Error('la base rechazo el INSERT del asiento');
    doble.movementCreate.mockRejectedValueOnce(fallo);

    await expect(adjustBatchStock(LOTE_ID, 5, 'merma', ACTOR_ID, AHORA, AMBITO)).rejects.toBe(fallo);
  });

  it('R4: el `23514` de product_batches_stock_non_negative se traduce a BatchStockNegativeError', async () => {
    doble.batchUpdate.mockRejectedValueOnce(violacionDeCheck('product_batches_stock_non_negative'));

    await expect(adjustBatchStock(LOTE_ID, -100, 'merma', ACTOR_ID, AHORA, AMBITO)).rejects.toBeInstanceOf(
      BatchStockNegativeError,
    );

    expect(doble.movementCreate).not.toHaveBeenCalled();
  });

  it('un `23514` de otra restriccion no se disfraza de BatchStockNegativeError', async () => {
    const otraViolacion = violacionDeCheck('product_batches_unit_cost_positive');
    doble.batchUpdate.mockRejectedValueOnce(otraViolacion);

    await expect(adjustBatchStock(LOTE_ID, -100, 'merma', ACTOR_ID, AHORA, AMBITO)).rejects.toBe(
      otraViolacion,
    );
  });
});
