import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';

import type { ErrorCode } from '@/lib/modules/errores';
import type {
  ClaimedFile,
  CreatedBatch,
  DocumentBatchRepository,
  JobOutcome,
  NewBatch,
} from '../../../ports/document-batch-repository';
import type { BatchStatus, DocumentFileStatus } from '../../../domain/batch-status';
import type { PdfStrategy } from '../../../domain/pdf-strategy';

/**
 * Implementa `DocumentBatchRepository` con Prisma. `claim` va con `$queryRaw` porque el candado
 * de la idempotencia es un `UPDATE` condicional cuya semantica no expresa la API tipada: lo que
 * hace atomica la operacion es que el `WHERE status = 'queued'` y el `RETURNING` corran en la
 * misma sentencia.
 */

type ClaimRow = {
  id: string;
  company_id: string;
  batch_id: string;
  path: string;
};

export async function createBatch(input: NewBatch): Promise<CreatedBatch> {
  return prisma.$transaction(async (tx) => {
    const batch = await tx.documentBatch.create({
      data: {
        companyId: input.companyId,
        strategy: input.strategy,
        createdBy: input.createdBy,
      },
      select: { id: true },
    });

    const files = await Promise.all(
      input.paths.map((path) =>
        tx.documentFile.create({
          data: { batchId: batch.id, companyId: input.companyId, path },
          select: { id: true, path: true },
        }),
      ),
    );

    return { batchId: batch.id, files };
  });
}

export async function attachMessageId(documentFileId: string, messageId: string): Promise<void> {
  await prisma.documentFile.update({
    where: { id: documentFileId },
    data: { queueMessageId: messageId },
  });
}

export async function claim(documentFileId: string, messageId: string): Promise<ClaimedFile | null> {
  const rows = await prisma.$queryRaw<readonly ClaimRow[]>(Prisma.sql`
    UPDATE "document_files"
       SET "status" = 'processing',
           "attempts" = "attempts" + 1,
           "queue_message_id" = ${messageId},
           "error_code" = NULL,
           "error_reason" = NULL,
           "updated_at" = now()
     WHERE "id" = ${documentFileId}::uuid
       AND "status" = 'queued'
       AND ("queue_message_id" IS NULL OR "queue_message_id" = ${messageId})
     RETURNING "id", "company_id", "batch_id", "path"
  `);

  const row = rows[0];
  if (row === undefined) return null;

  return { id: row.id, companyId: row.company_id, batchId: row.batch_id, path: row.path };
}

export async function finish(documentFileId: string, outcome: JobOutcome): Promise<void> {
  const data =
    outcome.kind === 'done'
      ? { status: 'done' as const, extractedText: outcome.text, errorCode: null, errorReason: null }
      : outcome.kind === 'error'
        ? { status: 'error' as const, errorCode: outcome.code, errorReason: outcome.reason }
        : { status: 'queued' as const, errorCode: null, errorReason: null };

  await prisma.documentFile.update({ where: { id: documentFileId }, data });
}

/** Motivo fijo, sin literal `unexpected` repetido: el catalogo no tiene un codigo de "se agoto el plazo". */
const STALE_ERROR_REASON = 'se agoto el plazo de procesamiento';

export async function expireStale(
  batchId: string,
  companyId: string,
  olderThan: Date,
): Promise<void> {
  await prisma.documentFile.updateMany({
    where: {
      batchId,
      companyId,
      status: { in: ['queued', 'processing'] },
      updatedAt: { lt: olderThan },
    },
    data: { status: 'error', errorCode: 'unexpected', errorReason: STALE_ERROR_REASON },
  });
}

/**
 * Sin `include`: `DocumentBatch` y `DocumentFile` no llevan `@relation` en el esquema —la FK que
 * las une esta escrita a mano en la migracion—, asi que la tanda y sus archivos se leen en dos
 * consultas separadas, no en un `include`.
 */
export async function readBatch(batchId: string, companyId: string): Promise<BatchStatus | null> {
  const batch = await prisma.documentBatch.findFirst({
    where: { id: batchId, companyId },
    select: { id: true, companyId: true, strategy: true },
  });
  if (batch === null) return null;

  const files = await prisma.documentFile.findMany({
    where: { batchId, companyId },
    select: {
      id: true,
      path: true,
      status: true,
      extractedText: true,
      errorCode: true,
      errorReason: true,
    },
  });

  return {
    id: batch.id,
    companyId: batch.companyId,
    strategy: batch.strategy as PdfStrategy,
    files: files.map((file) => ({
      id: file.id,
      path: file.path,
      status: file.status as DocumentFileStatus,
      extractedText: file.extractedText,
      errorCode: file.errorCode as ErrorCode | null,
      errorReason: file.errorReason,
    })),
  };
}

export const documentBatchRepositoryPrisma: DocumentBatchRepository = {
  createBatch,
  attachMessageId,
  claim,
  finish,
  expireStale,
  readBatch,
};
