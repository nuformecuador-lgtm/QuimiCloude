// Sin Postgres: el doble finge el contrato del cliente de Prisma, igual que
// `product-batch-lot-retry.test.ts`. Que el `increment` sea de verdad relativo en la base, que el
// CHECK rechace el negativo y que un lote de otra empresa no aparezca lo prueba la integracion.

import { Prisma } from '@prisma/client';

const doble = vi.hoisted(() => {
  const productCreate = vi.fn();
  const presentationFindFirst = vi.fn();
  const batchCreate = vi.fn();
  const batchFindMany = vi.fn();
  const batchUpdate = vi.fn();
  const executeRaw = vi.fn();
  const queryRaw = vi.fn();
  const movementCreate = vi.fn();
  const tx = {
    product: { create: productCreate },
    presentation: { findFirst: presentationFindFirst },
    productBatch: { create: batchCreate, update: batchUpdate, findMany: batchFindMany },
    inventoryMovement: { create: movementCreate },
    $executeRaw: executeRaw,
    $queryRaw: queryRaw,
  };
  return {
    tx,
    productCreate,
    presentationFindFirst,
    batchCreate,
    batchFindMany,
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

/** El SQL de una llamada al doble de `$queryRaw`, que recibe un `Prisma.Sql`. */
function sqlDe(llamada: unknown): string {
  return (llamada as Prisma.Sql).sql;
}

/**
 * Dos consultas crudas distintas comparten `$queryRaw`: el maximo del correlativo (`resolveLot`,
 * usado por `createWithFirstBatch`) y el bloqueo del producto de `adjustBatchStock`. Se reparten
 * por la tabla que leen, no por el orden.
 */
function doblarLecturaDelProducto(fila: { id: string } | null): void {
  doble.queryRaw.mockImplementation(async (consulta: unknown) => {
    if (sqlDe(consulta).includes('FROM "products"')) return fila === null ? [] : [fila];
    return [{ top: '0' }];
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  doble.transaction.mockImplementation(
    async (run: (client: typeof doble.tx) => Promise<unknown>) => run(doble.tx),
  );
  doble.productCreate.mockResolvedValue({ id: PRODUCTO_ID });
  doble.presentationFindFirst.mockResolvedValue({ unitId: '77777777-7777-4777-8777-777777777777' });
  doble.batchCreate.mockResolvedValue({ id: LOTE_ID });
  doble.batchFindMany.mockResolvedValue([]);
  doble.executeRaw.mockResolvedValue(0);
  doblarLecturaDelProducto({ id: PRODUCTO_ID });
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
    doble.batchUpdate.mockResolvedValueOnce({ stock: new Prisma.Decimal(15) });

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
    doble.batchUpdate.mockResolvedValueOnce({ stock: new Prisma.Decimal(6) });

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

  it('R18: sin fila que bloquear (lote inexistente o de otra empresa), devuelve null sin llamar a productBatch.update', async () => {
    // El paso 1 -el SELECT con FOR NO KEY UPDATE- es quien detecta esto, antes de llegar
    // siquiera al `update` del lote.
    doblarLecturaDelProducto(null);

    await expect(adjustBatchStock(LOTE_ID, 5, 'merma', ACTOR_ID, AHORA, AMBITO)).resolves.toBeNull();

    expect(doble.batchUpdate).not.toHaveBeenCalled();
    expect(doble.movementCreate).not.toHaveBeenCalled();
  });

  it('R18: si el lote desaparece entre el bloqueo y el update, el P2025 se traduce igual a null', async () => {
    // Caso de resguardo: la FK es RESTRICT y no hay borrado de lotes, pero el adaptador no lo
    // supone.
    doble.batchUpdate.mockRejectedValueOnce(registroNoEncontrado());

    await expect(adjustBatchStock(LOTE_ID, 5, 'merma', ACTOR_ID, AHORA, AMBITO)).resolves.toBeNull();

    expect(doble.movementCreate).not.toHaveBeenCalled();
  });

  it('R6: si el asiento falla, el ajuste entero se rechaza -no queda el ajuste sin su asiento-', async () => {
    doble.batchUpdate.mockResolvedValueOnce({ stock: new Prisma.Decimal(15) });
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

describe('adjustBatchStock — bloqueo del producto y recalculo de stock (QC-121, R29, R31, R32)', () => {
  it('bloquea la fila del PRODUCTO -no la del lote- antes de tocar nada, con la empresa en el where', async () => {
    doble.batchUpdate.mockResolvedValueOnce({ stock: new Prisma.Decimal(15) });

    await adjustBatchStock(LOTE_ID, 5, 'conteo_fisico', ACTOR_ID, AHORA, AMBITO);

    const [consulta] = doble.queryRaw.mock.calls[0] as [Prisma.Sql];
    expect(consulta.sql).toContain('FOR NO KEY UPDATE OF p');
    expect(consulta.sql).toContain('FROM "products"');
    expect(consulta.values).toEqual([LOTE_ID, EMPRESA]);
    // El bloqueo es la PRIMERA sentencia: antes del `update` del lote.
    expect(doble.queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      doble.batchUpdate.mock.invocationCallOrder[0] as number,
    );
  });

  it('recalcula DESPUES del asiento, y la unica columna que escribe en products es stock (R32)', async () => {
    doble.batchUpdate.mockResolvedValueOnce({ stock: new Prisma.Decimal(15) });
    doble.batchFindMany.mockResolvedValueOnce([
      { stock: new Prisma.Decimal(15), presentation: { unitId: '77777777-7777-4777-8777-777777777777' } },
    ]);

    await adjustBatchStock(LOTE_ID, 5, 'conteo_fisico', ACTOR_ID, AHORA, AMBITO);

    expect(doble.batchFindMany.mock.invocationCallOrder[0]).toBeGreaterThan(
      doble.movementCreate.mock.invocationCallOrder[0] as number,
    );
    const llamadaUpdate = doble.executeRaw.mock.calls.find((llamada) =>
      sqlDe(llamada[0]).includes('UPDATE "products"'),
    );
    if (llamadaUpdate === undefined) throw new Error('no se llamo al UPDATE de stock');
    expect((llamadaUpdate[0] as Prisma.Sql).values).toEqual([15, PRODUCTO_ID, EMPRESA]);
    expect(sqlDe(llamadaUpdate[0])).not.toContain('name');
    expect(sqlDe(llamadaUpdate[0])).not.toContain('qty_alert');
    expect(sqlDe(llamadaUpdate[0])).not.toContain('unit_id');
    expect(sqlDe(llamadaUpdate[0])).not.toContain('updated_at');
  });

  it('si el recalculo lanza, el ajuste se rechaza en vez de darse por bueno (R29)', async () => {
    doble.batchUpdate.mockResolvedValueOnce({ stock: new Prisma.Decimal(15) });
    const fallo = new Error('mezcla de unidades');
    doble.batchFindMany.mockRejectedValueOnce(fallo);

    await expect(adjustBatchStock(LOTE_ID, 5, 'conteo_fisico', ACTOR_ID, AHORA, AMBITO)).rejects.toBe(
      fallo,
    );

    expect(doble.batchUpdate).toHaveBeenCalledTimes(1);
    expect(doble.movementCreate).toHaveBeenCalledTimes(1);
  });
});
