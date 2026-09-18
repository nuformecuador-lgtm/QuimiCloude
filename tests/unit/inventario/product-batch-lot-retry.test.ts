// Sin Postgres: el doble finge el contrato del cliente de Prisma, y los `P2002` llevan las COLUMNAS
// en `meta.target`, que es lo que expone `@prisma/client@6.19.3`. Que el indice unico dispare de
// verdad, que el lock serialice dos altas y que la transaccion abortada no deje filas lo prueba la
// integracion contra base real.

import { Prisma } from '@prisma/client';

const doble = vi.hoisted(() => {
  const productCreate = vi.fn();
  const batchCreate = vi.fn();
  const movementCreate = vi.fn();
  const executeRaw = vi.fn();
  const queryRaw = vi.fn();
  // Sin `product.findFirst`: si el alta volviera a leer el producto sin lock, fallaria aqui.
  const tx = {
    product: { create: productCreate },
    productBatch: { create: batchCreate },
    inventoryMovement: { create: movementCreate },
    $executeRaw: executeRaw,
    $queryRaw: queryRaw,
  };
  return {
    tx,
    productCreate,
    batchCreate,
    movementCreate,
    executeRaw,
    queryRaw,
    transaction: vi.fn(),
  };
});

vi.mock('@/lib/shared/db/prisma', () => ({
  prisma: { $transaction: doble.transaction },
}));

const { addBatchToAlive, createWithFirstBatch, isDuplicateBatchLot } = await import(
  '@/lib/modules/inventario/adapters/driven/persistence/product-prisma'
);
const { BatchDuplicateLotError, InventarioError, ValidationError } = await import(
  '@/lib/modules/inventario/domain/errors'
);

import type { InventoryScope } from '@/lib/modules/inventario/domain/inventory-scope';
import type { NewProductBatch } from '@/lib/modules/inventario/domain/product-batch';
import type { NewProduct } from '@/lib/modules/inventario/domain/product-view';

const EMPRESA = '11111111-1111-4111-8111-111111111111';
const AMBITO: InventoryScope = { companyId: EMPRESA };
const AHORA = new Date('2026-09-15T10:00:00.000Z');
const PRODUCTO_ID = '33333333-3333-4333-8333-333333333333';
const LOTE_ID = '44444444-4444-4444-8444-444444444444';

const PRODUCTO: NewProduct = { name: 'Acido citrico' };

const LOTE_GENERADO: NewProductBatch = {
  presentationId: '55555555-5555-4555-8555-555555555555',
  stock: 10,
  unitCost: '2.5000',
  lot: null,
  purchaseDate: '2026-09-10',
  expiryDate: null,
  createdBy: '66666666-6666-4666-8666-666666666666',
};

const LOTE_A_MANO: NewProductBatch = { ...LOTE_GENERADO, lot: 'ACME-2026-07' };

/** Un `P2002` construido como lo construye el motor: `meta.target` con las COLUMNAS. */
function choqueDeUnicidad(target: unknown): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.19.3',
    meta: { modelName: 'ProductBatch', target },
  });
}

const choqueDeLote = (): Prisma.PrismaClientKnownRequestError =>
  choqueDeUnicidad(['company_id', 'lot']);

function loteEscrito(llamada: number): unknown {
  const args = doble.batchCreate.mock.calls[llamada]?.[0] as { data: { lot: unknown } } | undefined;
  return args?.data.lot;
}

beforeEach(() => {
  vi.resetAllMocks();
  // Cada llamada a `$transaction` es una transaccion NUEVA sobre el mismo doble: lo que se cuenta
  // es cuantas se abren.
  doble.transaction.mockImplementation(
    async (run: (client: typeof doble.tx) => Promise<unknown>) => run(doble.tx),
  );
  doble.productCreate.mockResolvedValue({ id: PRODUCTO_ID });
  doble.batchCreate.mockResolvedValue({ id: LOTE_ID });
  doble.movementCreate.mockResolvedValue({ id: 'movimiento-1' });
  doble.executeRaw.mockResolvedValue(0);
  doble.queryRaw.mockResolvedValue([{ top: '41' }]);
});

describe('isDuplicateBatchLot — P2002 Y la pareja de columnas (R13, R15)', () => {
  it('es verdadero con P2002 y meta.target con las columnas company_id y lot', () => {
    expect(isDuplicateBatchLot(choqueDeUnicidad(['company_id', 'lot']))).toBe(true);
  });

  it('es verdadero con la misma pareja en el otro orden: se compara el conjunto', () => {
    expect(isDuplicateBatchLot(choqueDeUnicidad(['lot', 'company_id']))).toBe(true);
  });

  it('es falso con P2002 sobre otras columnas', () => {
    expect(isDuplicateBatchLot(choqueDeUnicidad(['company_id', 'name_normalized']))).toBe(false);
    expect(isDuplicateBatchLot(choqueDeUnicidad(['lot']))).toBe(false);
    expect(isDuplicateBatchLot(choqueDeUnicidad(['company_id', 'lot', 'presentation_id']))).toBe(false);
  });

  it('es falso con P2002 sin meta.target inspeccionable o con target como cadena suelta', () => {
    expect(isDuplicateBatchLot(choqueDeUnicidad(undefined))).toBe(false);
    // Una cadena cuenta como UNA columna: nunca forma la pareja.
    expect(isDuplicateBatchLot(choqueDeUnicidad('product_batches_company_lot_unique'))).toBe(false);
  });

  it('es falso con otro codigo aunque meta.target traiga company_id y lot', () => {
    const otroCodigo = new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', {
      code: 'P2003',
      clientVersion: '6.19.3',
      meta: { target: ['company_id', 'lot'] },
    });
    expect(isDuplicateBatchLot(otroCodigo)).toBe(false);
  });

  it('es falso con un Error suelto que dice P2002', () => {
    expect(isDuplicateBatchLot(new Error('P2002 company_id lot'))).toBe(false);
    expect(isDuplicateBatchLot(undefined)).toBe(false);
  });
});

describe('createWithFirstBatch devuelve el lote escrito cuando R12 lo pide', () => {
  it('con el lote generado, devuelve el correlativo que quedo escrito en la fila', async () => {
    await expect(createWithFirstBatch(PRODUCTO, LOTE_GENERADO, AHORA, AMBITO)).resolves.toEqual({
      id: PRODUCTO_ID,
      batchId: LOTE_ID,
      lot: '42',
    });
  });

  it('con el lote tecleado a mano, devuelve ese mismo texto, no un correlativo', async () => {
    await expect(createWithFirstBatch(PRODUCTO, LOTE_A_MANO, AHORA, AMBITO)).resolves.toEqual({
      id: PRODUCTO_ID,
      batchId: LOTE_ID,
      lot: 'ACME-2026-07',
    });
  });
});

describe('createWithFirstBatch — lote GENERADO que choca: reintento acotado (R15)', () => {
  it('reintenta en una transaccion nueva, con maximo nuevo, y a la segunda escribe', async () => {
    doble.queryRaw.mockResolvedValueOnce([{ top: '41' }]).mockResolvedValueOnce([{ top: '42' }]);
    doble.batchCreate.mockRejectedValueOnce(choqueDeLote()).mockResolvedValueOnce({ id: LOTE_ID });

    await expect(createWithFirstBatch(PRODUCTO, LOTE_GENERADO, AHORA, AMBITO)).resolves.toEqual({
      id: PRODUCTO_ID,
      batchId: LOTE_ID,
      lot: '43',
    });

    expect(doble.transaction).toHaveBeenCalledTimes(2);
    // Cada intento vuelve a pedir el lock y a leer el maximo: no reusa el numero del intento abortado.
    expect(doble.executeRaw).toHaveBeenCalledTimes(2);
    expect(doble.queryRaw).toHaveBeenCalledTimes(2);
    expect(loteEscrito(0)).toBe('42');
    expect(loteEscrito(1)).toBe('43');
  });

  it('se para en 3 intentos y lanza un Error con empresa, ultimo lote e intentos, con el choque como cause', async () => {
    const choques = [choqueDeLote(), choqueDeLote(), choqueDeLote()];
    doble.batchCreate
      .mockRejectedValueOnce(choques[0])
      .mockRejectedValueOnce(choques[1])
      .mockRejectedValueOnce(choques[2]);
    doble.queryRaw
      .mockResolvedValueOnce([{ top: '41' }])
      .mockResolvedValueOnce([{ top: '42' }])
      .mockResolvedValueOnce([{ top: '43' }]);

    const fallo: unknown = await createWithFirstBatch(PRODUCTO, LOTE_GENERADO, AHORA, AMBITO).catch(
      (error: unknown) => error,
    );

    expect(doble.transaction).toHaveBeenCalledTimes(3);
    expect(doble.batchCreate).toHaveBeenCalledTimes(3);
    expect(fallo).toBeInstanceOf(Error);
    // No se disfraza de error de dominio: ni `invalid_input` ni `batch_duplicate_lot`.
    expect(fallo).not.toBeInstanceOf(InventarioError);
    const error = fallo as Error;
    expect(error.message).toContain(EMPRESA);
    expect(error.message).toContain("'44'");
    expect(error.message).toContain('3 intentos');
    expect(error.cause).toBe(choques[2]);
  });

  it('un P2002 ajeno se relanza tal cual y sin reintentar', async () => {
    const ajeno = choqueDeUnicidad(['company_id', 'name_normalized']);
    doble.batchCreate.mockRejectedValueOnce(ajeno);

    await expect(createWithFirstBatch(PRODUCTO, LOTE_GENERADO, AHORA, AMBITO)).rejects.toBe(ajeno);

    expect(doble.transaction).toHaveBeenCalledTimes(1);
  });

  it('un P2003 de la presentacion sigue saliendo como ValidationError y sin reintentar', async () => {
    doble.batchCreate.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', {
        code: 'P2003',
        clientVersion: '6.19.3',
      }),
    );

    await expect(createWithFirstBatch(PRODUCTO, LOTE_GENERADO, AHORA, AMBITO)).rejects.toBeInstanceOf(
      ValidationError,
    );

    expect(doble.transaction).toHaveBeenCalledTimes(1);
  });
});

describe('createWithFirstBatch — lote ESCRITO A MANO que choca: rechazo distinguible (R13)', () => {
  it('no reintenta, no pide lock ni maximo, y sale BatchDuplicateLotError', async () => {
    doble.batchCreate.mockRejectedValue(choqueDeLote());

    const fallo: unknown = await createWithFirstBatch(PRODUCTO, LOTE_A_MANO, AHORA, AMBITO).catch(
      (error: unknown) => error,
    );

    expect(fallo).toBeInstanceOf(BatchDuplicateLotError);
    expect((fallo as InstanceType<typeof BatchDuplicateLotError>).code).toBe('batch_duplicate_lot');
    expect(doble.transaction).toHaveBeenCalledTimes(1);
    expect(doble.batchCreate).toHaveBeenCalledTimes(1);
    expect(doble.executeRaw).not.toHaveBeenCalled();
    expect(doble.queryRaw).not.toHaveBeenCalled();
    // Lo que se intento escribir es el lote escrito, nunca un correlativo en su lugar.
    expect(loteEscrito(0)).toBe('ACME-2026-07');
  });
});

/** El SQL de una llamada al doble de `$queryRaw`, que recibe un `Prisma.Sql`. */
function sqlDe(llamada: unknown): string {
  return (llamada as Prisma.Sql).sql;
}

/**
 * El alta sobre producto existente hace dos lecturas crudas: la de la fila del producto y la del
 * maximo. Se reparten por la tabla que leen, no por el orden, para que un cambio de orden no
 * cambie lo que devuelve cada una.
 */
function doblarLecturas(producto: { id: string } | null, maximos: readonly string[] = []): void {
  const pendientes = [...maximos];
  doble.queryRaw.mockImplementation(async (consulta: unknown) => {
    if (sqlDe(consulta).includes('FROM "products"')) return producto === null ? [] : [producto];
    return [{ top: pendientes.shift() ?? null }];
  });
}

describe('addBatchToAlive devuelve el lote escrito cuando R13 lo pide', () => {
  beforeEach(() => {
    doblarLecturas({ id: PRODUCTO_ID }, ['41']);
  });

  it('con el lote generado, devuelve el correlativo que quedo escrito en la fila', async () => {
    await expect(addBatchToAlive(PRODUCTO_ID, LOTE_GENERADO, AHORA, AMBITO)).resolves.toEqual({
      batchId: LOTE_ID,
      lot: '42',
    });
  });

  it('con el lote tecleado a mano, devuelve ese mismo texto, no un correlativo', async () => {
    await expect(addBatchToAlive(PRODUCTO_ID, LOTE_A_MANO, AHORA, AMBITO)).resolves.toEqual({
      batchId: LOTE_ID,
      lot: 'ACME-2026-07',
    });
  });
});

describe('addBatchToAlive — el mismo reintento en el otro camino que escribe lote (R13, R15)', () => {
  beforeEach(() => {
    doblarLecturas({ id: PRODUCTO_ID }, ['41']);
  });

  it('con lote generado reintenta y a la segunda escribe', async () => {
    doblarLecturas({ id: PRODUCTO_ID }, ['7', '8']);
    doble.batchCreate.mockRejectedValueOnce(choqueDeLote()).mockResolvedValueOnce({ id: LOTE_ID });

    await expect(addBatchToAlive(PRODUCTO_ID, LOTE_GENERADO, AHORA, AMBITO)).resolves.toEqual({
      batchId: LOTE_ID,
      lot: '9',
    });

    expect(doble.transaction).toHaveBeenCalledTimes(2);
    expect(loteEscrito(1)).toBe('9');
  });

  it('con lote escrito a mano no reintenta y sale BatchDuplicateLotError', async () => {
    doble.batchCreate.mockRejectedValue(choqueDeLote());

    await expect(addBatchToAlive(PRODUCTO_ID, LOTE_A_MANO, AHORA, AMBITO)).rejects.toBeInstanceOf(
      BatchDuplicateLotError,
    );

    expect(doble.transaction).toHaveBeenCalledTimes(1);
  });

  it('con el producto borrado o ajeno devuelve null sin pedir lock ni escribir', async () => {
    doblarLecturas(null);

    await expect(addBatchToAlive(PRODUCTO_ID, LOTE_GENERADO, AHORA, AMBITO)).resolves.toBeNull();

    expect(doble.transaction).toHaveBeenCalledTimes(1);
    expect(doble.executeRaw).not.toHaveBeenCalled();
    expect(doble.batchCreate).not.toHaveBeenCalled();
  });
});

describe('addBatchToAlive — la fila del producto se bloquea antes que el correlativo (R37)', () => {
  it('R37: addBatchToAlive bloquea la fila del producto con FOR NO KEY UPDATE antes de pedir el lock del correlativo', async () => {
    doblarLecturas({ id: PRODUCTO_ID }, ['41']);

    await expect(addBatchToAlive(PRODUCTO_ID, LOTE_GENERADO, AHORA, AMBITO)).resolves.toEqual({
      batchId: LOTE_ID,
      lot: '42',
    });

    const ordenDe = (mock: { mock: { invocationCallOrder: number[] } }): number[] =>
      mock.mock.invocationCallOrder;
    const llamadasDeLaTransaccion = [
      ...ordenDe(doble.queryRaw),
      ...ordenDe(doble.executeRaw),
      ...ordenDe(doble.batchCreate),
      ...ordenDe(doble.productCreate),
    ];
    const primeraLectura = ordenDe(doble.queryRaw)[0];
    const lockDeAviso = ordenDe(doble.executeRaw)[0];

    expect(primeraLectura).toBe(Math.min(...llamadasDeLaTransaccion));
    expect(lockDeAviso).toBeDefined();
    expect(primeraLectura).toBeLessThan(lockDeAviso as number);

    const consulta = doble.queryRaw.mock.calls[0]?.[0] as Prisma.Sql;
    expect(consulta.sql).toContain('FOR NO KEY UPDATE');
    expect(consulta.sql).toContain('deleted_at');
    expect(consulta.values).toEqual([PRODUCTO_ID, EMPRESA]);
    expect(sqlDe(doble.executeRaw.mock.calls[0]?.[0])).toContain('pg_advisory_xact_lock');
  });

  it('R37: sin fila viva que bloquear, addBatchToAlive devuelve null con la lectura bloqueante como unica sentencia', async () => {
    doblarLecturas(null);

    await expect(addBatchToAlive(PRODUCTO_ID, LOTE_GENERADO, AHORA, AMBITO)).resolves.toBeNull();

    expect(doble.queryRaw).toHaveBeenCalledTimes(1);
    expect(sqlDe(doble.queryRaw.mock.calls[0]?.[0])).toContain('FOR NO KEY UPDATE');
    expect(doble.executeRaw).toHaveBeenCalledTimes(0);
    expect(doble.batchCreate).toHaveBeenCalledTimes(0);
  });
});
