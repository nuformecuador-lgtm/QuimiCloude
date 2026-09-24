// Sin Postgres: el adaptador se ejercita contra un doble del cliente Prisma. Lo que se prueba aqui
// es la FORMA de cada operacion -que columnas toca, que WHERE usa, que devuelve-, no la atomicidad
// del `UPDATE ... WHERE status='queued'`, que es cosa de `tests/integration/` contra la base real.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const doble = vi.hoisted(() => ({
  transaction: vi.fn(),
  queryRaw: vi.fn(),
  documentFileUpdate: vi.fn(),
  documentFileUpdateMany: vi.fn(),
  documentFileFindMany: vi.fn(),
  documentBatchFindFirst: vi.fn(),
}));

vi.mock('@/lib/shared/db/prisma', () => ({
  prisma: {
    $transaction: doble.transaction,
    $queryRaw: doble.queryRaw,
    documentFile: {
      update: doble.documentFileUpdate,
      updateMany: doble.documentFileUpdateMany,
      findMany: doble.documentFileFindMany,
    },
    documentBatch: {
      findFirst: doble.documentBatchFindFirst,
    },
  },
}));

const {
  createBatch,
  attachMessageId,
  claim,
  finish,
  expireStale,
  readBatch,
} = await import('@/lib/modules/documentos/adapters/driven/persistence/document-batch-repository-prisma');

const EMPRESA = '11111111-1111-4111-8111-111111111111';
const TANDA = '22222222-2222-4222-8222-222222222222';
const ARCHIVO = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('createBatch — una transaccion con la tanda y sus archivos', () => {
  it('R1 — inserta la tanda y un archivo por ruta, todo en la misma tx', async () => {
    const batchCreate = vi.fn().mockResolvedValue({ id: TANDA });
    const fileCreate = vi
      .fn()
      .mockResolvedValueOnce({ id: 'a1', path: 'empresa/a.pdf' })
      .mockResolvedValueOnce({ id: 'a2', path: 'empresa/b.pdf' });
    doble.transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
      callback({ documentBatch: { create: batchCreate }, documentFile: { create: fileCreate } }),
    );

    const resultado = await createBatch({
      companyId: EMPRESA,
      strategy: 'catalogo',
      createdBy: null,
      paths: ['empresa/a.pdf', 'empresa/b.pdf'],
    });

    expect(batchCreate).toHaveBeenCalledWith({
      data: { companyId: EMPRESA, strategy: 'catalogo', createdBy: null },
      select: { id: true },
    });
    expect(fileCreate).toHaveBeenCalledTimes(2);
    expect(resultado).toEqual({
      batchId: TANDA,
      files: [
        { id: 'a1', path: 'empresa/a.pdf' },
        { id: 'a2', path: 'empresa/b.pdf' },
      ],
    });
  });
});

describe('attachMessageId', () => {
  it('actualiza solo el queueMessageId de la fila', async () => {
    doble.documentFileUpdate.mockResolvedValue({});

    await attachMessageId(ARCHIVO, 'msg-1');

    expect(doble.documentFileUpdate).toHaveBeenCalledWith({
      where: { id: ARCHIVO },
      data: { queueMessageId: 'msg-1' },
    });
  });
});

describe('claim — el UPDATE condicional', () => {
  it('R10 — devuelve la fila reclamada cuando el UPDATE devuelve una', async () => {
    doble.queryRaw.mockResolvedValue([
      { id: ARCHIVO, company_id: EMPRESA, batch_id: TANDA, path: 'empresa/a.pdf' },
    ]);

    await expect(claim(ARCHIVO, 'msg-1')).resolves.toEqual({
      id: ARCHIVO,
      companyId: EMPRESA,
      batchId: TANDA,
      path: 'empresa/a.pdf',
    });
  });

  it('R10 — devuelve null cuando el UPDATE no reclamo ninguna fila', async () => {
    doble.queryRaw.mockResolvedValue([]);

    await expect(claim(ARCHIVO, 'msg-1')).resolves.toBeNull();
  });
});

describe('finish — los tres desenlaces', () => {
  it('R13 — done: guarda el texto tal cual y limpia error', async () => {
    doble.documentFileUpdate.mockResolvedValue({});

    await finish(ARCHIVO, { kind: 'done', text: 'texto extraido' });

    expect(doble.documentFileUpdate).toHaveBeenCalledWith({
      where: { id: ARCHIVO },
      data: { status: 'done', extractedText: 'texto extraido', errorCode: null, errorReason: null },
    });
  });

  it('error: guarda code y reason', async () => {
    doble.documentFileUpdate.mockResolvedValue({});

    await finish(ARCHIVO, { kind: 'error', code: 'unexpected', reason: 'PDF corrupto' });

    expect(doble.documentFileUpdate).toHaveBeenCalledWith({
      where: { id: ARCHIVO },
      data: { status: 'error', errorCode: 'unexpected', errorReason: 'PDF corrupto' },
    });
  });

  it('R17 — requeue: vuelve a queued LIMPIANDO code y reason', async () => {
    doble.documentFileUpdate.mockResolvedValue({});

    await finish(ARCHIVO, { kind: 'requeue', code: 'ai_unavailable', reason: 'la IA no respondio' });

    expect(doble.documentFileUpdate).toHaveBeenCalledWith({
      where: { id: ARCHIVO },
      data: { status: 'queued', errorCode: null, errorReason: null },
    });
  });
});

describe('expireStale — acotado por tanda Y por empresa', () => {
  it('R17 — pasa a error lo que lleva demasiado en queued/processing, con su motivo', async () => {
    doble.documentFileUpdateMany.mockResolvedValue({ count: 2 });
    const limite = new Date('2026-09-18T00:00:00.000Z');

    await expireStale(TANDA, EMPRESA, limite);

    expect(doble.documentFileUpdateMany).toHaveBeenCalledWith({
      where: {
        batchId: TANDA,
        companyId: EMPRESA,
        status: { in: ['queued', 'processing'] },
        updatedAt: { lt: limite },
      },
      data: {
        status: 'error',
        errorCode: 'unexpected',
        errorReason: expect.any(String),
      },
    });
  });
});

describe('readBatch — null si no existe o es de otra empresa', () => {
  it('R18 — sin fila de tanda visible en la empresa, devuelve null sin leer los archivos', async () => {
    doble.documentBatchFindFirst.mockResolvedValue(null);

    await expect(readBatch(TANDA, EMPRESA)).resolves.toBeNull();
    expect(doble.documentFileFindMany).not.toHaveBeenCalled();
  });

  it('con la tanda visible, devuelve la tanda y sus archivos', async () => {
    doble.documentBatchFindFirst.mockResolvedValue({ id: TANDA, companyId: EMPRESA, strategy: 'catalogo' });
    doble.documentFileFindMany.mockResolvedValue([
      {
        id: ARCHIVO,
        path: 'empresa/a.pdf',
        status: 'done',
        extractedText: 'texto',
        errorCode: null,
        errorReason: null,
      },
    ]);

    await expect(readBatch(TANDA, EMPRESA)).resolves.toEqual({
      id: TANDA,
      companyId: EMPRESA,
      strategy: 'catalogo',
      files: [
        {
          id: ARCHIVO,
          path: 'empresa/a.pdf',
          status: 'done',
          extractedText: 'texto',
          errorCode: null,
          errorReason: null,
        },
      ],
    });
    expect(doble.documentFileFindMany.mock.calls[0]?.[0]).toMatchObject({
      where: { batchId: TANDA, companyId: EMPRESA },
    });
  });
});
