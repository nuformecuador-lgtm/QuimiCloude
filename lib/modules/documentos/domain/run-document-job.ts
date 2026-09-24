/**
 * El caso de uso del TRABAJO que entrega la cola: reclamar la fila, bajar sus bytes, procesar y
 * guardar el resultado. No recibe actor de sesion: su ambito es la empresa que salio del `claim`,
 * con permisos vacios, y esa es la unica autorizacion que necesita `downloadDocument`.
 *
 * El recorte de imagenes corre DESPUES de que el procesamiento por estrategia termine bien, y
 * SOLO para la estrategia `catalogo`: es la unica que rasteriza las paginas para mandarlas a la
 * IA, asi que es la unica que puede pedirle donde estan sus imagenes. Corre ANTES de cerrar la
 * fila para que un fallo suyo pueda dejarla en error con su motivo, y si falla el PDF NO se borra.
 */
import { failureKind, STORAGE_FAILURE_KIND } from './failure-kind';
import { createDownloadDocument } from './read-document';

import { UNEXPECTED_ERROR_CODE } from '@/lib/modules/errores';

import type { Actor } from './actor';
import type { CropCatalogImagesInput, CropCatalogImagesResult } from './crop-catalog-images';
import type { ProcessPdfByStrategyInput, StrategyRunResult } from './process-pdf-by-strategy';
import type { DocumentBatchRepository } from '../ports/document-batch-repository';
import type { DocumentStorage } from '../ports/document-storage';

export type RunDocumentJobMessage = {
  readonly documentFileId: string;
  readonly messageId: string;
};

/** Lo que el driving necesita para elegir el codigo HTTP de la respuesta. */
export type RunDocumentJobResult =
  | { readonly kind: 'skipped' }
  | { readonly kind: 'done' }
  | { readonly kind: 'error' }
  | { readonly kind: 'requeue' };

export type RunDocumentJobDeps = {
  readonly repository: DocumentBatchRepository;
  readonly storage: DocumentStorage;
  readonly processPdfByStrategy: (input: ProcessPdfByStrategyInput) => Promise<StrategyRunResult>;
  readonly cropCatalogImages: (input: CropCatalogImagesInput) => Promise<CropCatalogImagesResult>;
};

function causaDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function outcomeKindOf(kind: ReturnType<typeof failureKind>): 'requeue' | 'error' {
  return kind === 'retryable' ? 'requeue' : 'error';
}

export function createRunDocumentJob(
  deps: RunDocumentJobDeps,
): (message: RunDocumentJobMessage) => Promise<RunDocumentJobResult> {
  // `downloadDocument` ya comprueba que la ruta cae bajo la empresa del ambito: reusarlo evita
  // repetir esa guardia con una comparacion propia.
  const downloadDocument = createDownloadDocument({ storage: deps.storage });

  return async function runDocumentJob(
    message: RunDocumentJobMessage,
  ): Promise<RunDocumentJobResult> {
    const claimed = await deps.repository.claim(message.documentFileId, message.messageId);
    if (!claimed) return { kind: 'skipped' };

    // Permisos vacios a proposito: es el ambito minimo que `downloadDocument` necesita para
    // comprobar la empresa, sin conceder nada mas.
    const scope: Actor = { id: claimed.id, companyId: claimed.companyId, permissions: [] };

    // La estrategia es de la TANDA, no de la fila: se lee de ahi para no duplicar la columna.
    // Una fila recien reclamada sin tanda es un dato imposible, no un fallo del archivo: se trata
    // igual que un corte de almacenamiento, con `STORAGE_FAILURE_KIND`.
    const batch = await deps.repository.readBatch(claimed.batchId, claimed.companyId);
    if (!batch) {
      const outcome = {
        kind: outcomeKindOf(STORAGE_FAILURE_KIND),
        code: UNEXPECTED_ERROR_CODE,
        reason: `run-document-job: la tanda '${claimed.batchId}' no aparece tras reclamar '${claimed.id}'`,
      } as const;
      await deps.repository.finish(claimed.id, outcome);
      return { kind: outcome.kind };
    }

    let bytes: Uint8Array;
    try {
      bytes = await downloadDocument(scope, claimed.path);
    } catch (error) {
      const outcome = {
        kind: outcomeKindOf(STORAGE_FAILURE_KIND),
        code: UNEXPECTED_ERROR_CODE,
        reason: `run-document-job: descarga fallida sobre '${claimed.path}' (${causaDe(error)})`,
      } as const;
      await deps.repository.finish(claimed.id, outcome);
      return { kind: outcome.kind };
    }

    const result = await deps.processPdfByStrategy({
      strategy: batch.strategy,
      path: claimed.path,
      bytes,
    });

    if (result.ok) {
      if (batch.strategy === 'catalogo') {
        const crop = await deps.cropCatalogImages({
          documentFileId: claimed.id,
          companyId: claimed.companyId,
          path: claimed.path,
          bytes,
        });
        if (!crop.ok) {
          const outcome = {
            kind: outcomeKindOf(failureKind(crop.code)),
            code: crop.code,
            reason: crop.reason,
          } as const;
          await deps.repository.finish(claimed.id, outcome);
          return { kind: outcome.kind };
        }
      }

      await deps.repository.finish(claimed.id, { kind: 'done', text: result.text });
      await deps.storage.remove(claimed.path);
      return { kind: 'done' };
    }

    const outcome = {
      kind: outcomeKindOf(failureKind(result.code)),
      code: result.code,
      reason: result.reason,
    } as const;
    await deps.repository.finish(claimed.id, outcome);
    return { kind: outcome.kind };
  };
}
