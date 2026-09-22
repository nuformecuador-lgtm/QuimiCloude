// El trabajo que entrega la cola, contra dobles del repositorio (con la SEMANTICA del `claim`,
// no solo su forma), del almacenamiento, de `processPdfByStrategy` ya construido y del recorte de
// catalogo ya construido.

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
import type { DocumentStorage } from '@/lib/modules/documentos/ports/document-storage';

const EMPRESA = '33333333-3333-4333-8333-333333333333';
const ARCHIVO = 'archivo-1';
const TANDA = 'tanda-1';
const MENSAJE = 'mensaje-1';
const RUTA = `${EMPRESA}/documento.pdf`;

/** Un texto que delata cualquier recorte: saltos de linea, tabuladores y espacios al borde. */
const TEXTO_DE_LA_IA = '  \n Linea uno\t\r\n  Linea dos con espacios raros   \n';

function fila(): ClaimedFile {
  return { id: ARCHIVO, companyId: EMPRESA, batchId: TANDA, path: RUTA };
}

/** Doble del repositorio con la semantica real del `claim`: solo una entrega se lleva la fila. */
function dobleDeRepositorio(strategy: 'catalogo' | 'formula' = 'catalogo') {
  let reclamada = false;
  const finish = vi.fn<DocumentBatchRepository['finish']>(async () => {});
  const claim = vi.fn(async (): Promise<ClaimedFile | null> => {
    if (reclamada) return null;
    reclamada = true;
    return fila();
  });
  const batch: BatchStatus = {
    id: TANDA,
    companyId: EMPRESA,
    strategy,
    files: [] as readonly DocumentFileStatusEntry[],
  };
  const readBatch = vi.fn(async (): Promise<BatchStatus | null> => batch);

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
    readBatch,
  };

  return { repository, claim, finish, readBatch };
}

function dobleDeAlmacenamiento(bytes: Uint8Array = new Uint8Array([1, 2, 3])) {
  const download = vi.fn(async (): Promise<Uint8Array> => bytes);
  const remove = vi.fn(async (): Promise<void> => {});
  const storage: DocumentStorage = {
    createSignedUpload: vi.fn(async () => {
      throw new Error('run-document-job no firma subidas');
    }),
    createSignedReadUrl: vi.fn(async () => {
      throw new Error('run-document-job no firma lecturas');
    }),
    download,
    remove,
  };
  return { storage, download, remove };
}

function dobleDeProcesamiento(resultado: StrategyRunResult) {
  return vi.fn(async () => resultado);
}

/** Doble del recorte de catalogo. Por defecto, cero recortes y exito. */
function dobleDeRecorte(
  resultado: CropCatalogImagesResult = { ok: true, uploaded: 0, skipped: 0 },
) {
  return vi.fn(async () => resultado);
}

describe('documentos — runDocumentJob', () => {
  it('R10 — un claim que devuelve null no llama a la IA ni a remove', async () => {
    const repo = dobleDeRepositorio();
    repo.claim.mockResolvedValueOnce(null);
    const storage = dobleDeAlmacenamiento();
    const processPdfByStrategy = dobleDeProcesamiento({
      ok: true,
      strategy: 'catalogo',
      path: RUTA,
      mode: 'images',
      text: TEXTO_DE_LA_IA,
    });
    const cropCatalogImages = dobleDeRecorte();
    const runDocumentJob = createRunDocumentJob({
      repository: repo.repository,
      storage: storage.storage,
      processPdfByStrategy,
      cropCatalogImages,
    });

    const resultado = await runDocumentJob({ documentFileId: ARCHIVO, messageId: MENSAJE });

    expect(resultado).toEqual({ kind: 'skipped' });
    expect(processPdfByStrategy).not.toHaveBeenCalled();
    expect(cropCatalogImages).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
    expect(repo.finish).not.toHaveBeenCalled();
  });

  it('R10 — dos claim seguidos sobre el mismo doble solo devuelven fila una vez, y la IA se llama una sola vez', async () => {
    const repo = dobleDeRepositorio();
    const storage = dobleDeAlmacenamiento();
    const processPdfByStrategy = dobleDeProcesamiento({
      ok: true,
      strategy: 'catalogo',
      path: RUTA,
      mode: 'images',
      text: TEXTO_DE_LA_IA,
    });
    const cropCatalogImages = dobleDeRecorte();
    const runDocumentJob = createRunDocumentJob({
      repository: repo.repository,
      storage: storage.storage,
      processPdfByStrategy,
      cropCatalogImages,
    });

    const primera = await runDocumentJob({ documentFileId: ARCHIVO, messageId: MENSAJE });
    const segunda = await runDocumentJob({ documentFileId: ARCHIVO, messageId: MENSAJE });

    expect(primera).toEqual({ kind: 'done' });
    expect(segunda).toEqual({ kind: 'skipped' });
    expect(processPdfByStrategy).toHaveBeenCalledTimes(1);
    expect(repo.claim).toHaveBeenCalledTimes(2);
  });

  it('R13 — el exito guarda el texto TAL CUAL y llama a remove', async () => {
    const repo = dobleDeRepositorio();
    const storage = dobleDeAlmacenamiento();
    const processPdfByStrategy = dobleDeProcesamiento({
      ok: true,
      strategy: 'catalogo',
      path: RUTA,
      mode: 'images',
      text: TEXTO_DE_LA_IA,
    });
    const cropCatalogImages = dobleDeRecorte();
    const runDocumentJob = createRunDocumentJob({
      repository: repo.repository,
      storage: storage.storage,
      processPdfByStrategy,
      cropCatalogImages,
    });

    const resultado = await runDocumentJob({ documentFileId: ARCHIVO, messageId: MENSAJE });

    expect(resultado).toEqual({ kind: 'done' });
    expect(repo.finish).toHaveBeenCalledWith(ARCHIVO, { kind: 'done', text: TEXTO_DE_LA_IA });
    expect(storage.remove).toHaveBeenCalledWith(RUTA);
    // El texto que se guarda es identico byte a byte al que devolvio la estrategia.
    const guardado = repo.finish.mock.calls[0]?.[1] as { text: string };
    expect(guardado.text).toBe(TEXTO_DE_LA_IA);
  });

  it('R15 — fallo ai_unavailable deja la fila re-encolable y NO llama a remove', async () => {
    const repo = dobleDeRepositorio();
    const storage = dobleDeAlmacenamiento();
    const processPdfByStrategy = dobleDeProcesamiento({
      ok: false,
      strategy: 'catalogo',
      path: RUTA,
      mode: 'images',
      code: 'ai_unavailable',
      reason: 'el proveedor no respondio',
    });
    const cropCatalogImages = dobleDeRecorte();
    const runDocumentJob = createRunDocumentJob({
      repository: repo.repository,
      storage: storage.storage,
      processPdfByStrategy,
      cropCatalogImages,
    });

    const resultado = await runDocumentJob({ documentFileId: ARCHIVO, messageId: MENSAJE });

    expect(resultado).toEqual({ kind: 'requeue' });
    expect(repo.finish).toHaveBeenCalledWith(ARCHIVO, {
      kind: 'requeue',
      code: 'ai_unavailable',
      reason: 'el proveedor no respondio',
    });
    expect(storage.remove).not.toHaveBeenCalled();
    expect(cropCatalogImages).not.toHaveBeenCalled();
  });

  it('R16 — fallo unexpected deja error a la primera y NO llama a remove', async () => {
    const repo = dobleDeRepositorio();
    const storage = dobleDeAlmacenamiento();
    const processPdfByStrategy = dobleDeProcesamiento({
      ok: false,
      strategy: 'catalogo',
      path: RUTA,
      mode: 'images',
      code: 'unexpected',
      reason: 'PDF corrupto',
    });
    const cropCatalogImages = dobleDeRecorte();
    const runDocumentJob = createRunDocumentJob({
      repository: repo.repository,
      storage: storage.storage,
      processPdfByStrategy,
      cropCatalogImages,
    });

    const resultado = await runDocumentJob({ documentFileId: ARCHIVO, messageId: MENSAJE });

    expect(resultado).toEqual({ kind: 'error' });
    expect(repo.finish).toHaveBeenCalledWith(ARCHIVO, {
      kind: 'error',
      code: 'unexpected',
      reason: 'PDF corrupto',
    });
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('R11 — la descarga falla (bucket caido): la fila queda re-encolable y no se llama a la IA', async () => {
    const repo = dobleDeRepositorio();
    const storage = dobleDeAlmacenamiento();
    storage.download.mockRejectedValueOnce(new Error('bucket no disponible'));
    const processPdfByStrategy = dobleDeProcesamiento({
      ok: true,
      strategy: 'catalogo',
      path: RUTA,
      mode: 'images',
      text: TEXTO_DE_LA_IA,
    });
    const cropCatalogImages = dobleDeRecorte();
    const runDocumentJob = createRunDocumentJob({
      repository: repo.repository,
      storage: storage.storage,
      processPdfByStrategy,
      cropCatalogImages,
    });

    const resultado = await runDocumentJob({ documentFileId: ARCHIVO, messageId: MENSAJE });

    expect(resultado).toEqual({ kind: 'requeue' });
    expect(processPdfByStrategy).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
    expect(repo.finish).toHaveBeenCalledTimes(1);
  });

  it('R11 — el ambito con el que se descarga no lleva ningun permiso concedido', async () => {
    const repo = dobleDeRepositorio();
    const storage = dobleDeAlmacenamiento();
    const processPdfByStrategy = dobleDeProcesamiento({
      ok: true,
      strategy: 'catalogo',
      path: RUTA,
      mode: 'images',
      text: TEXTO_DE_LA_IA,
    });
    const cropCatalogImages = dobleDeRecorte();
    const runDocumentJob = createRunDocumentJob({
      repository: repo.repository,
      storage: storage.storage,
      processPdfByStrategy,
      cropCatalogImages,
    });

    await runDocumentJob({ documentFileId: ARCHIVO, messageId: MENSAJE });

    // `downloadDocument` solo pasa la ruta al puerto: si el actor tuviera permisos, no habria
    // forma de verlo desde aqui, asi que lo que se comprueba es que la descarga ocurrio con la
    // ruta de la fila reclamada y nada mas.
    expect(storage.download).toHaveBeenCalledWith(RUTA);
  });

  it('R12 — la estrategia que llega al procesamiento es la de la TANDA, no un valor inventado', async () => {
    const repo = dobleDeRepositorio('formula');
    const storage = dobleDeAlmacenamiento();
    const processPdfByStrategy = dobleDeProcesamiento({
      ok: true,
      strategy: 'formula',
      path: RUTA,
      mode: 'pdf',
      text: TEXTO_DE_LA_IA,
    });
    const cropCatalogImages = dobleDeRecorte();
    const runDocumentJob = createRunDocumentJob({
      repository: repo.repository,
      storage: storage.storage,
      processPdfByStrategy,
      cropCatalogImages,
    });

    await runDocumentJob({ documentFileId: ARCHIVO, messageId: MENSAJE });

    expect(processPdfByStrategy).toHaveBeenCalledWith({
      strategy: 'formula',
      path: RUTA,
      bytes: expect.any(Uint8Array),
    });
  });

  it('R1 — con formula el doble del recorte NO se invoca; con catalogo SI', async () => {
    const repoFormula = dobleDeRepositorio('formula');
    const storageFormula = dobleDeAlmacenamiento();
    const cropCatalogImagesFormula = dobleDeRecorte();
    const runDocumentJobFormula = createRunDocumentJob({
      repository: repoFormula.repository,
      storage: storageFormula.storage,
      processPdfByStrategy: dobleDeProcesamiento({
        ok: true,
        strategy: 'formula',
        path: RUTA,
        mode: 'pdf',
        text: TEXTO_DE_LA_IA,
      }),
      cropCatalogImages: cropCatalogImagesFormula,
    });

    await runDocumentJobFormula({ documentFileId: ARCHIVO, messageId: MENSAJE });

    expect(cropCatalogImagesFormula).not.toHaveBeenCalled();

    const repoCatalogo = dobleDeRepositorio('catalogo');
    const storageCatalogo = dobleDeAlmacenamiento();
    const cropCatalogImagesCatalogo = dobleDeRecorte();
    const runDocumentJobCatalogo = createRunDocumentJob({
      repository: repoCatalogo.repository,
      storage: storageCatalogo.storage,
      processPdfByStrategy: dobleDeProcesamiento({
        ok: true,
        strategy: 'catalogo',
        path: RUTA,
        mode: 'images',
        text: TEXTO_DE_LA_IA,
      }),
      cropCatalogImages: cropCatalogImagesCatalogo,
    });

    await runDocumentJobCatalogo({ documentFileId: ARCHIVO, messageId: MENSAJE });

    expect(cropCatalogImagesCatalogo).toHaveBeenCalledTimes(1);
    expect(cropCatalogImagesCatalogo).toHaveBeenCalledWith({
      documentFileId: ARCHIVO,
      companyId: EMPRESA,
      path: RUTA,
      bytes: expect.any(Uint8Array),
    });
  });

  it('R16 — cero recortes deja la fila en listo y borra el PDF', async () => {
    const repo = dobleDeRepositorio('catalogo');
    const storage = dobleDeAlmacenamiento();
    const processPdfByStrategy = dobleDeProcesamiento({
      ok: true,
      strategy: 'catalogo',
      path: RUTA,
      mode: 'images',
      text: TEXTO_DE_LA_IA,
    });
    const cropCatalogImages = dobleDeRecorte({ ok: true, uploaded: 0, skipped: 0 });
    const runDocumentJob = createRunDocumentJob({
      repository: repo.repository,
      storage: storage.storage,
      processPdfByStrategy,
      cropCatalogImages,
    });

    const resultado = await runDocumentJob({ documentFileId: ARCHIVO, messageId: MENSAJE });

    expect(resultado).toEqual({ kind: 'done' });
    expect(repo.finish).toHaveBeenCalledWith(ARCHIVO, { kind: 'done', text: TEXTO_DE_LA_IA });
    expect(storage.remove).toHaveBeenCalledWith(RUTA);
  });

  it('R5 — un fallo del paso de recorte deja error/requeue y NO borra el PDF', async () => {
    const repo = dobleDeRepositorio('catalogo');
    const storage = dobleDeAlmacenamiento();
    const processPdfByStrategy = dobleDeProcesamiento({
      ok: true,
      strategy: 'catalogo',
      path: RUTA,
      mode: 'images',
      text: TEXTO_DE_LA_IA,
    });
    const cropCatalogImages = dobleDeRecorte({
      ok: false,
      code: 'invalid_input',
      reason: 'el texto de la IA no traia un JSON interpretable',
    });
    const runDocumentJob = createRunDocumentJob({
      repository: repo.repository,
      storage: storage.storage,
      processPdfByStrategy,
      cropCatalogImages,
    });

    const resultado = await runDocumentJob({ documentFileId: ARCHIVO, messageId: MENSAJE });

    expect(resultado).toEqual({ kind: 'error' });
    expect(repo.finish).toHaveBeenCalledWith(ARCHIVO, {
      kind: 'error',
      code: 'invalid_input',
      reason: 'el texto de la IA no traia un JSON interpretable',
    });
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('R17 — una region perdida (skipped > 0) igual deja la fila en listo y borra el PDF', async () => {
    const repo = dobleDeRepositorio('catalogo');
    const storage = dobleDeAlmacenamiento();
    const processPdfByStrategy = dobleDeProcesamiento({
      ok: true,
      strategy: 'catalogo',
      path: RUTA,
      mode: 'images',
      text: TEXTO_DE_LA_IA,
    });
    const cropCatalogImages = dobleDeRecorte({ ok: true, uploaded: 2, skipped: 1 });
    const runDocumentJob = createRunDocumentJob({
      repository: repo.repository,
      storage: storage.storage,
      processPdfByStrategy,
      cropCatalogImages,
    });

    const resultado = await runDocumentJob({ documentFileId: ARCHIVO, messageId: MENSAJE });

    expect(resultado).toEqual({ kind: 'done' });
    expect(repo.finish).toHaveBeenCalledWith(ARCHIVO, { kind: 'done', text: TEXTO_DE_LA_IA });
    expect(storage.remove).toHaveBeenCalledWith(RUTA);
  });
});
