// El registro paso a paso del trabajo que entrega la cola.
//
// Cubre lo que el 500 de QStash no dice: cada etapa deja su linea con el `fileId`,
// los errores se registran con su causa, y el borrado final fallido es un aviso que
// NO cambia el desenlace `done`.

import { describe, expect, it, vi } from 'vitest';

import { createRunDocumentJob } from '@/lib/modules/documentos/domain/run-document-job';

import type {
  BatchStatus,
  DocumentFileStatusEntry,
} from '@/lib/modules/documentos/domain/batch-status';
import type { CropCatalogImagesResult } from '@/lib/modules/documentos/domain/crop-catalog-images';
import type { StrategyRunResult } from '@/lib/modules/documentos/domain/process-pdf-by-strategy';
import type {
  ClaimedFile,
  DocumentBatchRepository,
} from '@/lib/modules/documentos/ports/document-batch-repository';
import type { DocumentJobLog } from '@/lib/modules/documentos/ports/document-job-log';
import type { DocumentStorage } from '@/lib/modules/documentos/ports/document-storage';

const EMPRESA = '33333333-3333-4333-8333-333333333333';
const ARCHIVO = 'archivo-1';
const TANDA = 'tanda-1';
const MENSAJE = 'mensaje-1';
const RUTA = `${EMPRESA}/documento.pdf`;

/** Un texto que delata cualquier fuga al log: si sale por el registro, cae el test. */
const TEXTO_SECRETO_DE_LA_IA = 'secreto-de-la-ia-que-jamas-va-al-log';

function fila(): ClaimedFile {
  return { id: ARCHIVO, companyId: EMPRESA, batchId: TANDA, path: RUTA };
}

function dobleDeLog() {
  const info = vi.fn();
  const warn = vi.fn();
  const error = vi.fn();
  const log: DocumentJobLog = { info, warn, error };
  const emitido = (): string =>
    [...info.mock.calls, ...warn.mock.calls, ...error.mock.calls]
      .map((llamada) => JSON.stringify(llamada))
      .join('\n');
  return { log, info, warn, error, emitido };
}

function dobleDeRepositorio() {
  const finish = vi.fn<DocumentBatchRepository['finish']>(async () => {});
  const claim = vi.fn(async (): Promise<ClaimedFile | null> => fila());
  const batch: BatchStatus = {
    id: TANDA,
    companyId: EMPRESA,
    strategy: 'catalogo',
    files: [] as readonly DocumentFileStatusEntry[],
  };
  const repository: DocumentBatchRepository = {
    createBatch: vi.fn(async () => {
      throw new Error('este test no crea tandas');
    }),
    attachMessageId: vi.fn(async () => {
      throw new Error('este test no anota mensajes');
    }),
    claim,
    finish,
    expireStale: vi.fn(async () => {
      throw new Error('este test no caduca nada');
    }),
    readBatch: vi.fn(async (): Promise<BatchStatus | null> => batch),
    readFileForReview: vi.fn(async () => {
      throw new Error('este test no lee para revision');
    }),
  };
  return { repository, claim, finish };
}

function dobleDeAlmacenamiento() {
  const download = vi.fn(async (): Promise<Uint8Array> => new Uint8Array([9, 8, 7]));
  const remove = vi.fn(async (): Promise<void> => {});
  const storage: DocumentStorage = {
    createSignedUpload: vi.fn(async () => {
      throw new Error('este test no firma subidas');
    }),
    createSignedReadUrl: vi.fn(async () => {
      throw new Error('este test no firma lecturas');
    }),
    download,
    remove,
  };
  return { storage, download, remove };
}

function trabajoOk(): StrategyRunResult {
  return { ok: true, strategy: 'catalogo', path: RUTA, mode: 'images', text: TEXTO_SECRETO_DE_LA_IA };
}

function trabajoFallidoReintentable(): StrategyRunResult {
  return {
    ok: false,
    strategy: 'catalogo',
    path: RUTA,
    mode: null,
    code: 'ai_unavailable',
    reason: 'la IA no respondio dentro del plazo',
  };
}

describe('documentos — runDocumentJob con registro', () => {
  it('el camino feliz deja una linea por etapa y no avisa ni falla', async () => {
    const repo = dobleDeRepositorio();
    const almacenamiento = dobleDeAlmacenamiento();
    const espia = dobleDeLog();
    const runDocumentJob = createRunDocumentJob({
      repository: repo.repository,
      storage: almacenamiento.storage,
      processPdfByStrategy: vi.fn(async () => trabajoOk()),
      cropCatalogImages: vi.fn(
        async (): Promise<CropCatalogImagesResult> => ({ ok: true, uploaded: 2, skipped: 1 }),
      ),
      log: espia.log,
    });

    const resultado = await runDocumentJob({ documentFileId: ARCHIVO, messageId: MENSAJE });

    expect(resultado).toEqual({ kind: 'done' });
    expect(almacenamiento.remove).toHaveBeenCalledTimes(1);
    const mensajes = espia.info.mock.calls.map((llamada) => String(llamada[0]));
    expect(mensajes).toContain('trabajo recibido');
    expect(mensajes).toContain('fila reclamada');
    expect(mensajes).toContain('pdf descargado');
    expect(mensajes).toContain('pdf procesado');
    expect(mensajes).toContain('imagenes recortadas');
    expect(mensajes).toContain('trabajo terminado');
    expect(espia.warn).not.toHaveBeenCalled();
    expect(espia.error).not.toHaveBeenCalled();
  });

  it('la descarga registra la longitud, nunca los bytes', async () => {
    const repo = dobleDeRepositorio();
    const almacenamiento = dobleDeAlmacenamiento();
    const espia = dobleDeLog();
    const runDocumentJob = createRunDocumentJob({
      repository: repo.repository,
      storage: almacenamiento.storage,
      processPdfByStrategy: vi.fn(async () => trabajoOk()),
      cropCatalogImages: vi.fn(
        async (): Promise<CropCatalogImagesResult> => ({ ok: true, uploaded: 0, skipped: 0 }),
      ),
      log: espia.log,
    });

    await runDocumentJob({ documentFileId: ARCHIVO, messageId: MENSAJE });

    const descarga = espia.info.mock.calls.find((llamada) => llamada[0] === 'pdf descargado');
    expect(descarga?.[1]).toEqual({ fileId: ARCHIVO, byteLength: 3 });
    expect(espia.emitido()).not.toContain('9,8,7');
  });

  it('el texto de la IA jamas sale por el registro', async () => {
    const repo = dobleDeRepositorio();
    const almacenamiento = dobleDeAlmacenamiento();
    const espia = dobleDeLog();
    const runDocumentJob = createRunDocumentJob({
      repository: repo.repository,
      storage: almacenamiento.storage,
      processPdfByStrategy: vi.fn(async () => trabajoOk()),
      cropCatalogImages: vi.fn(
        async (): Promise<CropCatalogImagesResult> => ({ ok: true, uploaded: 0, skipped: 0 }),
      ),
      log: espia.log,
    });

    await runDocumentJob({ documentFileId: ARCHIVO, messageId: MENSAJE });

    expect(espia.emitido()).not.toContain(TEXTO_SECRETO_DE_LA_IA);
  });

  it('el borrado final fallido es un aviso y el desenlace sigue done', async () => {
    const repo = dobleDeRepositorio();
    const almacenamiento = dobleDeAlmacenamiento();
    almacenamiento.remove.mockRejectedValueOnce(new Error('corte del bucket'));
    const espia = dobleDeLog();
    const runDocumentJob = createRunDocumentJob({
      repository: repo.repository,
      storage: almacenamiento.storage,
      processPdfByStrategy: vi.fn(async () => trabajoOk()),
      cropCatalogImages: vi.fn(
        async (): Promise<CropCatalogImagesResult> => ({ ok: true, uploaded: 0, skipped: 0 }),
      ),
      log: espia.log,
    });

    const resultado = await runDocumentJob({ documentFileId: ARCHIVO, messageId: MENSAJE });

    expect(resultado).toEqual({ kind: 'done' });
    expect(repo.finish).toHaveBeenCalledTimes(1);
    expect(espia.warn).toHaveBeenCalledTimes(1);
    expect(espia.warn.mock.calls[0]?.[0]).toContain('borrado final fallido');
    expect(espia.warn.mock.calls[0]?.[1]).toMatchObject({ fileId: ARCHIVO });
    expect(espia.error).not.toHaveBeenCalled();
  });

  it('un fallo inesperado se registra con su causa y se propaga', async () => {
    const repo = dobleDeRepositorio();
    repo.claim.mockRejectedValueOnce(new Error('corte de base'));
    const almacenamiento = dobleDeAlmacenamiento();
    const espia = dobleDeLog();
    const runDocumentJob = createRunDocumentJob({
      repository: repo.repository,
      storage: almacenamiento.storage,
      processPdfByStrategy: vi.fn(async () => trabajoOk()),
      cropCatalogImages: vi.fn(
        async (): Promise<CropCatalogImagesResult> => ({ ok: true, uploaded: 0, skipped: 0 }),
      ),
      log: espia.log,
    });

    await expect(
      runDocumentJob({ documentFileId: ARCHIVO, messageId: MENSAJE }),
    ).rejects.toThrow('corte de base');
    expect(espia.error).toHaveBeenCalledTimes(1);
    expect(espia.error.mock.calls[0]?.[1]).toMatchObject({
      fileId: ARCHIVO,
      operation: 'run',
      cause: 'corte de base',
    });
  });

  it('un fallo reintentable del proveedor deja el motivo en el log de "pdf procesado"', async () => {
    const repo = dobleDeRepositorio();
    const almacenamiento = dobleDeAlmacenamiento();
    const espia = dobleDeLog();
    const runDocumentJob = createRunDocumentJob({
      repository: repo.repository,
      storage: almacenamiento.storage,
      processPdfByStrategy: vi.fn(async () => trabajoFallidoReintentable()),
      cropCatalogImages: vi.fn(
        async (): Promise<CropCatalogImagesResult> => ({ ok: true, uploaded: 0, skipped: 0 }),
      ),
      log: espia.log,
    });

    const resultado = await runDocumentJob({ documentFileId: ARCHIVO, messageId: MENSAJE });

    expect(resultado).toEqual({ kind: 'requeue' });
    const procesado = espia.info.mock.calls.find((llamada) => llamada[0] === 'pdf procesado');
    expect(procesado?.[1]).toMatchObject({
      code: 'ai_unavailable',
      reason: 'la IA no respondio dentro del plazo',
    });
    const terminado = espia.info.mock.calls.find((llamada) => llamada[0] === 'trabajo terminado');
    expect(terminado?.[1]).toMatchObject({
      code: 'ai_unavailable',
      reason: 'la IA no respondio dentro del plazo',
    });
  });

  it('el omitido se registra y no llama a la IA', async () => {
    const repo = dobleDeRepositorio();
    repo.claim.mockResolvedValueOnce(null);
    const almacenamiento = dobleDeAlmacenamiento();
    const espia = dobleDeLog();
    const proceso = vi.fn(async () => trabajoOk());
    const runDocumentJob = createRunDocumentJob({
      repository: repo.repository,
      storage: almacenamiento.storage,
      processPdfByStrategy: proceso,
      cropCatalogImages: vi.fn(
        async (): Promise<CropCatalogImagesResult> => ({ ok: true, uploaded: 0, skipped: 0 }),
      ),
      log: espia.log,
    });

    const resultado = await runDocumentJob({ documentFileId: ARCHIVO, messageId: MENSAJE });

    expect(resultado).toEqual({ kind: 'skipped' });
    expect(proceso).not.toHaveBeenCalled();
    expect(
      espia.info.mock.calls.some((llamada) => String(llamada[0]).includes('omitido')),
    ).toBe(true);
  });
});
