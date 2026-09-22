// El Route Handler del webhook, invocado DIRECTO con un `Request` normal, sin levantar Next: R26,
// R7, R8, R9, R10, D18.
//
// La firma y el mensaje de la cola se doblan en `@/lib/composition`; el esquema del cuerpo es el
// REAL del contrato, sin doblar. El caso de «mismo mensaje dos veces» cablea el caso de uso REAL
// de `runDocumentJob` sobre dobles del repositorio (con la SEMANTICA del `claim`), del
// almacenamiento y de `processPdfByStrategy`: asi «una sola llamada a la IA» es una afirmacion
// sobre el dominio, no sobre un doble que ya lo prometia.
//
// Nada de esto toca la red ni depende de que ninguna variable de entorno tenga valor (R26).

import { describe, expect, it, vi, beforeEach } from 'vitest';

import { POST } from '@/lib/modules/documentos/adapters/driving/document-job-route';
import { createRunDocumentJob } from '@/lib/modules/documentos/domain/run-document-job';

import type { BatchStatus } from '@/lib/modules/documentos/domain/batch-status';
import type { StrategyRunResult } from '@/lib/modules/documentos/domain/process-pdf-by-strategy';
import type {
  ClaimedFile,
  DocumentBatchRepository,
} from '@/lib/modules/documentos/ports/document-batch-repository';
import type { DocumentStorage } from '@/lib/modules/documentos/ports/document-storage';

const { verifyMock, messageIdOfMock, runDocumentJobMock } = vi.hoisted(() => ({
  verifyMock: vi.fn(),
  messageIdOfMock: vi.fn(),
  runDocumentJobMock: vi.fn(),
}));

vi.mock('@/lib/composition', () => ({
  documentos: {
    queueSignature: { verify: verifyMock, messageIdOf: messageIdOfMock },
    runDocumentJob: runDocumentJobMock,
  },
}));

const EMPRESA = '33333333-3333-4333-8333-333333333333';
const ARCHIVO = 'file-1';
const MENSAJE = 'msg-1';

function requestCon(cuerpo: string, headers: Record<string, string> = {}): Request {
  return new Request('https://app.invalida/api/documentos/trabajos', {
    method: 'POST',
    headers,
    body: cuerpo,
  });
}

const CUERPO_VALIDO = JSON.stringify({ documentFileId: ARCHIVO });

/** Cablea el caso de uso REAL sobre dobles con la semantica del `claim`: solo una entrega se lleva
 *  la fila, y `processPdfByStrategy` hace de sustituto observable de «la llamada a la IA». */
function cablearRunDocumentJobReal() {
  let reclamada = false;
  const claim = vi.fn(async (): Promise<ClaimedFile | null> => {
    if (reclamada) return null;
    reclamada = true;
    return { id: ARCHIVO, companyId: EMPRESA, batchId: 'batch-1', path: `${EMPRESA}/doc.pdf` };
  });
  const finish = vi.fn(async () => {});
  const batch: BatchStatus = { id: 'batch-1', companyId: EMPRESA, strategy: 'catalogo', files: [] };
  const repository: DocumentBatchRepository = {
    createBatch: vi.fn(async () => {
      throw new Error('run-document-job no crea tandas');
    }),
    attachMessageId: vi.fn(async () => {
      throw new Error('run-document-job no anota mensajes');
    }),
    claim,
    finish,
    expireStale: vi.fn(async () => {
      throw new Error('run-document-job no caduca nada');
    }),
    readBatch: vi.fn(async () => batch),
  };
  const remove = vi.fn(async () => {});
  const storage: DocumentStorage = {
    createSignedUpload: vi.fn(async () => {
      throw new Error('run-document-job no firma subidas');
    }),
    createSignedReadUrl: vi.fn(async () => {
      throw new Error('run-document-job no firma lecturas');
    }),
    download: vi.fn(async () => new Uint8Array([1, 2, 3])),
    remove,
  };
  const procesar = vi.fn(
    async (): Promise<StrategyRunResult> => ({
      ok: true,
      strategy: 'catalogo',
      path: `${EMPRESA}/doc.pdf`,
      mode: 'images',
      text: 'texto leido',
    }),
  );

  const runDocumentJob = createRunDocumentJob({
    repository,
    storage,
    processPdfByStrategy: procesar,
    cropCatalogImages: vi.fn(async () => ({ ok: true as const, uploaded: 0, skipped: 0 })),
  });

  return { runDocumentJob, claim, finish, remove, procesar };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('documentos — el Route Handler del webhook', () => {
  it('R7 — firma invalida: 401 y CERO efectos (ni claim, ni descarga, ni IA, ni escritura)', async () => {
    verifyMock.mockResolvedValue(false);

    const respuesta = await POST(requestCon(CUERPO_VALIDO, { 'upstash-signature': 'mala' }));

    expect(respuesta.status).toBe(401);
    expect(runDocumentJobMock).not.toHaveBeenCalled();
    expect(messageIdOfMock).not.toHaveBeenCalled();
  });

  it('R7 — firma ausente: 401 y cero efectos', async () => {
    verifyMock.mockResolvedValue(false);

    const respuesta = await POST(requestCon(CUERPO_VALIDO));

    expect(respuesta.status).toBe(401);
    expect(verifyMock).toHaveBeenCalledWith({ rawBody: CUERPO_VALIDO, signature: null });
    expect(runDocumentJobMock).not.toHaveBeenCalled();
  });

  it('R9 — cuerpo que no pasa zod: 400 y cero efectos', async () => {
    verifyMock.mockResolvedValue(true);
    messageIdOfMock.mockReturnValue(MENSAJE);

    const respuesta = await POST(
      requestCon(JSON.stringify({ campoQueNoExiste: 'x' }), { 'upstash-signature': 'buena' }),
    );

    expect(respuesta.status).toBe(400);
    expect(runDocumentJobMock).not.toHaveBeenCalled();
  });

  it('R9 — cuerpo que ni siquiera es JSON: 400 y cero efectos', async () => {
    verifyMock.mockResolvedValue(true);

    const respuesta = await POST(requestCon('esto no es json', { 'upstash-signature': 'buena' }));

    expect(respuesta.status).toBe(400);
    expect(runDocumentJobMock).not.toHaveBeenCalled();
  });

  it('firma valida: procesa y responde 200', async () => {
    verifyMock.mockResolvedValue(true);
    messageIdOfMock.mockReturnValue(MENSAJE);
    runDocumentJobMock.mockResolvedValue({ kind: 'done' });

    const respuesta = await POST(requestCon(CUERPO_VALIDO, { 'upstash-signature': 'buena' }));

    expect(respuesta.status).toBe(200);
    expect(runDocumentJobMock).toHaveBeenCalledWith({ documentFileId: ARCHIVO, messageId: MENSAJE });
  });

  it('R16 — fallo DEFINITIVO responde 200: le dice a la cola que no reintente', async () => {
    verifyMock.mockResolvedValue(true);
    messageIdOfMock.mockReturnValue(MENSAJE);
    runDocumentJobMock.mockResolvedValue({ kind: 'error' });

    const respuesta = await POST(requestCon(CUERPO_VALIDO, { 'upstash-signature': 'buena' }));

    expect(respuesta.status).toBe(200);
  });

  it('R15 — fallo REINTENTABLE responde 500: es el unico caso que pide un 5xx', async () => {
    verifyMock.mockResolvedValue(true);
    messageIdOfMock.mockReturnValue(MENSAJE);
    runDocumentJobMock.mockResolvedValue({ kind: 'requeue' });

    const respuesta = await POST(requestCon(CUERPO_VALIDO, { 'upstash-signature': 'buena' }));

    expect(respuesta.status).toBe(500);
  });

  it('R10 — el mismo mensaje dos veces: una sola llamada a la IA, un solo texto guardado, 200 las dos veces', async () => {
    verifyMock.mockResolvedValue(true);
    messageIdOfMock.mockReturnValue(MENSAJE);
    const { runDocumentJob, procesar, finish, claim } = cablearRunDocumentJobReal();
    runDocumentJobMock.mockImplementation(runDocumentJob);

    const primera = await POST(requestCon(CUERPO_VALIDO, { 'upstash-signature': 'buena' }));
    const segunda = await POST(requestCon(CUERPO_VALIDO, { 'upstash-signature': 'buena' }));

    expect(primera.status).toBe(200);
    expect(segunda.status).toBe(200);
    expect(claim).toHaveBeenCalledTimes(2);
    expect(procesar).toHaveBeenCalledTimes(1);
    expect(finish).toHaveBeenCalledTimes(1);
    expect(finish).toHaveBeenCalledWith(ARCHIVO, { kind: 'done', text: 'texto leido' });
  });
});
