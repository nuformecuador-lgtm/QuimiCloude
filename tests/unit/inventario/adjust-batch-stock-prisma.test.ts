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
  const reservationMovementFindMany = vi.fn();
  const tx = {
    product: { create: productCreate },
    presentation: { findFirst: presentationFindFirst },
    productBatch: { create: batchCreate, update: batchUpdate, findMany: batchFindMany },
    inventoryMovement: { create: movementCreate },
    reservationMovement: { findMany: reservationMovementFindMany },
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
    reservationMovementFindMany,
    transaction: vi.fn(),
  };
});

vi.mock('@/lib/shared/db/prisma', () => ({
  prisma: { $transaction: doble.transaction },
}));

const { adjustBatchStock, createWithFirstBatch } = await import(
  '@/lib/modules/inventario/adapters/driven/persistence/product-prisma'
);
const { BatchStockNegativeError, ValidationError } = await import('@/lib/modules/inventario/domain/errors');

import type { InventoryScope } from '@/lib/modules/inventario/domain/inventory-scope';
import type { MovementReason } from '@/lib/modules/inventario/domain/movement-reason';
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
  stock: '10',
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
function doblarLecturaDelProducto(
  fila: { id: string; type?: string; presentationId?: string | null; batchStock?: string } | null,
): void {
  doble.queryRaw.mockImplementation(async (consulta: unknown) => {
    if (sqlDe(consulta).includes('FROM "products"')) {
      return fila === null ? [] : [{ presentationId: null, batchStock: '10.0000', ...fila }];
    }
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
  doble.reservationMovementFindMany.mockResolvedValue([]);
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
        orderId: null,
        orderPresentationLineId: null,
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

/** El ajuste de un lote que el doble lee con existencia 10: `countedStock` decide el sentido. */
function ajuste(countedStock: string, reason: MovementReason = 'conteo_fisico', seenStock = '10') {
  return { batchId: LOTE_ID, countedStock, seenStock, reason };
}

describe('adjustBatchStock (R1, R2, R4, R6, R7, R18) — increment relativo mas su asiento, en una tx', () => {
  it('R2, R7: un total mayor suma la diferencia sobre lo que la base tenga, y el asiento queda como ajuste', async () => {
    doble.batchUpdate.mockResolvedValueOnce({ stock: new Prisma.Decimal(15) });

    await expect(adjustBatchStock(ajuste('15'), ACTOR_ID, AHORA, AMBITO)).resolves.toEqual({
      kind: 'adjusted',
      previousStock: '10.0000',
      difference: '5.0000',
      stock: '15.0000',
      reserved: '0.0000',
      overReserved: false,
    });

    expect(doble.batchUpdate).toHaveBeenCalledWith({
      where: { id: LOTE_ID, companyId: EMPRESA },
      data: { stock: { increment: new Prisma.Decimal('5') }, updatedBy: ACTOR_ID, updatedAt: AHORA },
      select: { stock: true },
    });
    expect(doble.movementCreate).toHaveBeenCalledWith({
      data: {
        batchId: LOTE_ID,
        kind: 'adjustment',
        quantity: '5.0000',
        reason: 'conteo_fisico',
        orderId: null,
        orderPresentationLineId: null,
        stockBefore: '10.0000',
        countedStock: '15',
        createdBy: ACTOR_ID,
        companyId: EMPRESA,
        createdAt: AHORA,
      },
    });
  });

  it('R2, R7: un total menor resta la diferencia sobre lo que la base tenga', async () => {
    doble.batchUpdate.mockResolvedValueOnce({ stock: new Prisma.Decimal(6) });

    await expect(adjustBatchStock(ajuste('6', 'merma'), ACTOR_ID, AHORA, AMBITO)).resolves.toMatchObject({
      kind: 'adjusted',
      difference: '-4.0000',
      stock: '6.0000',
    });

    expect(doble.batchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stock: { increment: new Prisma.Decimal('-4') } }),
      }),
    );
    expect(doble.movementCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ quantity: '-4.0000', reason: 'merma' }) }),
    );
  });

  it('R33: un total que deja el apartado por encima de la existencia nueva marca overReserved', async () => {
    doble.batchUpdate.mockResolvedValueOnce({ stock: new Prisma.Decimal(3) });
    doble.reservationMovementFindMany.mockResolvedValueOnce([
      { kind: 'reserve', quantity: new Prisma.Decimal(5) },
    ]);

    await expect(adjustBatchStock(ajuste('3', 'merma'), ACTOR_ID, AHORA, AMBITO)).resolves.toMatchObject({
      kind: 'adjusted',
      stock: '3.0000',
      reserved: '5.0000',
      overReserved: true,
    });
  });

  it('R18: sin fila que bloquear (lote inexistente o de otra empresa), devuelve batch_not_found sin llamar a productBatch.update', async () => {
    // El paso 1 -el SELECT con FOR NO KEY UPDATE- es quien detecta esto, antes de llegar
    // siquiera al `update` del lote.
    doblarLecturaDelProducto(null);

    await expect(adjustBatchStock(ajuste('15', 'merma'), ACTOR_ID, AHORA, AMBITO)).resolves.toEqual({
      kind: 'batch_not_found',
    });

    expect(doble.batchUpdate).not.toHaveBeenCalled();
    expect(doble.movementCreate).not.toHaveBeenCalled();
  });

  it('R18: si el lote desaparece entre el bloqueo y el update, el P2025 se traduce igual a batch_not_found', async () => {
    // Caso de resguardo: la FK es RESTRICT y no hay borrado de lotes, pero el adaptador no lo
    // supone.
    doble.batchUpdate.mockRejectedValueOnce(registroNoEncontrado());

    await expect(adjustBatchStock(ajuste('15'), ACTOR_ID, AHORA, AMBITO)).resolves.toEqual({
      kind: 'batch_not_found',
    });

    expect(doble.movementCreate).not.toHaveBeenCalled();
  });

  it('R6: si el asiento falla, el ajuste entero se rechaza -no queda el ajuste sin su asiento-', async () => {
    doble.batchUpdate.mockResolvedValueOnce({ stock: new Prisma.Decimal(15) });
    const fallo = new Error('la base rechazo el INSERT del asiento');
    doble.movementCreate.mockRejectedValueOnce(fallo);

    await expect(adjustBatchStock(ajuste('15'), ACTOR_ID, AHORA, AMBITO)).rejects.toBe(fallo);
  });

  it('R4: el `23514` de product_batches_stock_non_negative se traduce a BatchStockNegativeError', async () => {
    doble.batchUpdate.mockRejectedValueOnce(violacionDeCheck('product_batches_stock_non_negative'));

    await expect(adjustBatchStock(ajuste('0', 'merma'), ACTOR_ID, AHORA, AMBITO)).rejects.toBeInstanceOf(
      BatchStockNegativeError,
    );

    expect(doble.movementCreate).not.toHaveBeenCalled();
  });

  it('un `23514` de otra restriccion no se disfraza de BatchStockNegativeError', async () => {
    const otraViolacion = violacionDeCheck('product_batches_unit_cost_positive');
    doble.batchUpdate.mockRejectedValueOnce(otraViolacion);

    await expect(adjustBatchStock(ajuste('0', 'merma'), ACTOR_ID, AHORA, AMBITO)).rejects.toBe(otraViolacion);
  });
});

describe('adjustBatchStock — bloqueo del producto y recalculo de stock (QC-121, R29, R31, R32)', () => {
  it('bloquea la fila del PRODUCTO y la del lote antes de tocar nada, con la empresa en el where', async () => {
    doble.batchUpdate.mockResolvedValueOnce({ stock: new Prisma.Decimal(15) });

    await adjustBatchStock(ajuste('15'), ACTOR_ID, AHORA, AMBITO);

    const [consulta] = doble.queryRaw.mock.calls[0] as [Prisma.Sql];
    expect(consulta.sql).toContain('FOR NO KEY UPDATE OF p, b');
    expect(consulta.sql).toContain('FROM "products"');
    expect(consulta.values).toEqual([LOTE_ID, EMPRESA]);
    // El bloqueo es la PRIMERA sentencia: antes del `update` del lote.
    expect(doble.queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      doble.batchUpdate.mock.invocationCallOrder[0] as number,
    );
  });

  it('recalcula DESPUES del asiento, sumando en SQL, y la unica columna que escribe en products es stock (R32)', async () => {
    doble.batchUpdate.mockResolvedValueOnce({ stock: new Prisma.Decimal(15) });

    await adjustBatchStock(ajuste('15'), ACTOR_ID, AHORA, AMBITO);

    const llamadaUpdate = doble.executeRaw.mock.calls.find((llamada) =>
      sqlDe(llamada[0]).includes('UPDATE "products"'),
    );
    if (llamadaUpdate === undefined) throw new Error('no se llamo al UPDATE de stock');
    expect(doble.executeRaw.mock.invocationCallOrder.at(-1)).toBeGreaterThan(
      doble.movementCreate.mock.invocationCallOrder[0] as number,
    );
    expect(sqlDe(llamadaUpdate[0])).toMatch(/SELECT\s+sum\(/i);
    expect((llamadaUpdate[0] as Prisma.Sql).values).toEqual([PRODUCTO_ID, EMPRESA, PRODUCTO_ID, EMPRESA]);
    expect(sqlDe(llamadaUpdate[0])).not.toContain('name');
    expect(sqlDe(llamadaUpdate[0])).not.toContain('qty_alert');
    expect(sqlDe(llamadaUpdate[0])).not.toContain('unit_id');
    expect(sqlDe(llamadaUpdate[0])).not.toContain('updated_at');
  });

  it('si el recalculo lanza, el ajuste se rechaza en vez de darse por bueno (R29)', async () => {
    doble.batchUpdate.mockResolvedValueOnce({ stock: new Prisma.Decimal(15) });
    const fallo = new Error('la base rechazo el UPDATE de stock');
    // El lock de aviso es el primer `$executeRaw` de `adjustBatchStock` -aqui no hay ninguno,
    // asi que el recalculo es la primera y unica llamada-.
    doble.executeRaw.mockRejectedValueOnce(fallo);

    await expect(adjustBatchStock(ajuste('15'), ACTOR_ID, AHORA, AMBITO)).rejects.toBe(fallo);

    expect(doble.batchUpdate).toHaveBeenCalledTimes(1);
    expect(doble.movementCreate).toHaveBeenCalledTimes(1);
  });
});

describe('adjustBatchStock — producto terminado (R31, R32)', () => {
  it("R31: un total mayor sobre FINISHED_PRODUCT devuelve 'increase_not_allowed' sin UPDATE ni asiento", async () => {
    doblarLecturaDelProducto({ id: PRODUCTO_ID, type: 'FINISHED_PRODUCT' });

    await expect(adjustBatchStock(ajuste('11'), ACTOR_ID, AHORA, AMBITO)).resolves.toEqual({
      kind: 'increase_not_allowed',
    });

    expect(doble.batchUpdate).not.toHaveBeenCalled();
    expect(doble.movementCreate).not.toHaveBeenCalled();
    expect(doble.executeRaw).not.toHaveBeenCalled();
  });

  it('R32: un total menor sobre FINISHED_PRODUCT se aplica igual que a cualquier otro lote', async () => {
    doblarLecturaDelProducto({ id: PRODUCTO_ID, type: 'FINISHED_PRODUCT' });
    doble.batchUpdate.mockResolvedValueOnce({ stock: new Prisma.Decimal(6) });

    await expect(adjustBatchStock(ajuste('6', 'merma'), ACTOR_ID, AHORA, AMBITO)).resolves.toMatchObject({
      kind: 'adjusted',
      stock: '6.0000',
      reserved: '0.0000',
      overReserved: false,
    });
  });

  it('R32: una disminucion que la base rechaza por negativa se rechaza igual que en cualquier otro lote', async () => {
    doblarLecturaDelProducto({ id: PRODUCTO_ID, type: 'FINISHED_PRODUCT' });
    doble.batchUpdate.mockRejectedValueOnce(violacionDeCheck('product_batches_stock_non_negative'));

    await expect(adjustBatchStock(ajuste('0', 'merma'), ACTOR_ID, AHORA, AMBITO)).rejects.toBeInstanceOf(
      BatchStockNegativeError,
    );
  });
});

describe('adjustBatchStock — el total contado frente a la existencia bloqueada', () => {
  it('R12: la diferencia es el total menos la existencia bloqueada, y es la que mueve el lote y el asiento', async () => {
    doblarLecturaDelProducto({ id: PRODUCTO_ID, batchStock: '10.2500' });
    doble.batchUpdate.mockResolvedValueOnce({ stock: new Prisma.Decimal('12.75') });

    await expect(adjustBatchStock(ajuste('12.75', 'conteo_fisico', '10.25'), ACTOR_ID, AHORA, AMBITO)).resolves.toMatchObject({
      kind: 'adjusted',
      previousStock: '10.2500',
      difference: '2.5000',
      stock: '12.7500',
    });

    expect(doble.batchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stock: { increment: new Prisma.Decimal('2.5') } }),
      }),
    );
    expect(doble.movementCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ quantity: '2.5000' }) }),
    );
  });

  it('R13: con una existencia bloqueada distinta de la vista devuelve stock_changed sin update, asiento ni recalculo', async () => {
    doblarLecturaDelProducto({ id: PRODUCTO_ID, batchStock: '9.0000' });

    await expect(adjustBatchStock(ajuste('12'), ACTOR_ID, AHORA, AMBITO)).resolves.toEqual({
      kind: 'stock_changed',
      currentStock: '9.0000',
    });

    expect(doble.batchUpdate).not.toHaveBeenCalled();
    expect(doble.movementCreate).not.toHaveBeenCalled();
    expect(doble.executeRaw).not.toHaveBeenCalled();
  });

  it('R13: la comparacion con la vista es decimal, no de cadenas', async () => {
    doblarLecturaDelProducto({ id: PRODUCTO_ID, batchStock: '10.0000' });
    doble.batchUpdate.mockResolvedValue({ stock: new Prisma.Decimal(12) });

    for (const seenStock of ['10', '10.0', '10.0000']) {
      await expect(
        adjustBatchStock(ajuste('12', 'conteo_fisico', seenStock), ACTOR_ID, AHORA, AMBITO),
        seenStock,
      ).resolves.toMatchObject({ kind: 'adjusted' });
    }
  });

  it('R13: la existencia cambiada se mira antes que la regla de producto terminado', async () => {
    // Con la vista (10) el total 11 seria un aumento; con la existencia real (12) es una
    // disminucion. Lo que manda es que la vista ya no vale.
    doblarLecturaDelProducto({ id: PRODUCTO_ID, type: 'FINISHED_PRODUCT', batchStock: '12.0000' });

    await expect(adjustBatchStock(ajuste('11'), ACTOR_ID, AHORA, AMBITO)).resolves.toEqual({
      kind: 'stock_changed',
      currentStock: '12.0000',
    });
  });

  it('R17: un aumento sobre un producto terminado devuelve increase_not_allowed sin escribir', async () => {
    doblarLecturaDelProducto({ id: PRODUCTO_ID, type: 'FINISHED_PRODUCT' });

    await expect(adjustBatchStock(ajuste('10.0001'), ACTOR_ID, AHORA, AMBITO)).resolves.toEqual({
      kind: 'increase_not_allowed',
    });

    expect(doble.batchUpdate).not.toHaveBeenCalled();
    expect(doble.movementCreate).not.toHaveBeenCalled();
  });

  it('R18: un envase con presentacion fija y un total no entero lanza ValidationError sin escribir', async () => {
    doblarLecturaDelProducto({ id: PRODUCTO_ID, type: 'PACKAGING', presentationId: 'presentacion-fija' });

    await expect(adjustBatchStock(ajuste('12.5'), ACTOR_ID, AHORA, AMBITO)).rejects.toBeInstanceOf(ValidationError);

    expect(doble.batchUpdate).not.toHaveBeenCalled();
    expect(doble.movementCreate).not.toHaveBeenCalled();
  });

  it('R18: un envase con presentacion fija y un total entero se aplica', async () => {
    doblarLecturaDelProducto({ id: PRODUCTO_ID, type: 'PACKAGING', presentationId: 'presentacion-fija' });
    doble.batchUpdate.mockResolvedValueOnce({ stock: new Prisma.Decimal(12) });

    await expect(adjustBatchStock(ajuste('12'), ACTOR_ID, AHORA, AMBITO)).resolves.toMatchObject({
      kind: 'adjusted',
      stock: '12.0000',
    });
  });

  it('R19: la violacion del CHECK de existencia negativa se traduce a BatchStockNegativeError', async () => {
    doble.batchUpdate.mockRejectedValueOnce(violacionDeCheck('product_batches_stock_non_negative'));

    await expect(adjustBatchStock(ajuste('0', 'merma'), ACTOR_ID, AHORA, AMBITO)).rejects.toBeInstanceOf(
      BatchStockNegativeError,
    );
    expect(doble.movementCreate).not.toHaveBeenCalled();
  });

  it('R24: writeMovement recibe la existencia bloqueada como previousStock y el total contado', async () => {
    doblarLecturaDelProducto({ id: PRODUCTO_ID, batchStock: '10.0000' });
    doble.batchUpdate.mockResolvedValueOnce({ stock: new Prisma.Decimal('7.5') });

    await adjustBatchStock(ajuste('7.5', 'rotura'), ACTOR_ID, AHORA, AMBITO);

    expect(doble.movementCreate).toHaveBeenCalledWith({
      data: {
        batchId: LOTE_ID,
        kind: 'adjustment',
        quantity: '-2.5000',
        reason: 'rotura',
        orderId: null,
        orderPresentationLineId: null,
        stockBefore: '10.0000',
        countedStock: '7.5',
        createdBy: ACTOR_ID,
        companyId: EMPRESA,
        createdAt: AHORA,
      },
    });
  });
});
