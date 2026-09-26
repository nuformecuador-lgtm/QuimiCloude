/**
 * El puerto de PERSISTENCIA de una tanda y de sus archivos: lo que el dominio necesita de la base,
 * dicho sin nombrar a Prisma.
 *
 * `claim` es el candado de la idempotencia: un `UPDATE` condicional que solo una entrega concurrente
 * se lleva. `finish` es el unico camino para dejar una fila en `done`, en `error` o de vuelta en
 * `queued` tras un fallo reintentable.
 */
import type { ErrorCode } from '@/lib/modules/errores';
import type { BatchStatus, DocumentFileStatus } from '../domain/batch-status';
import type { PdfStrategy } from '../domain/pdf-strategy';

export type NewBatch = {
  readonly companyId: string;
  readonly strategy: PdfStrategy;
  readonly createdBy: string | null;
  readonly paths: readonly string[];
};

/** La tanda ya escrita, con el identificador de cada archivo para poder publicar un mensaje por uno. */
export type CreatedBatch = {
  readonly batchId: string;
  readonly files: readonly { readonly id: string; readonly path: string }[];
};

/** Lo que devuelve un `claim` que SI reclamo la fila: lo minimo para bajar sus bytes y procesarla. */
export type ClaimedFile = {
  readonly id: string;
  readonly companyId: string;
  readonly batchId: string;
  readonly path: string;
};

export type JobOutcome =
  | { readonly kind: 'done'; readonly text: string }
  | { readonly kind: 'error'; readonly code: ErrorCode; readonly reason: string }
  | { readonly kind: 'requeue'; readonly code: ErrorCode; readonly reason: string };

/** Lo minimo de un archivo que necesita su revision -sea cual sea la estrategia-: su estado, la
 *  estrategia de SU TANDA y el texto que dejo la IA. */
export type FileForReview = {
  readonly status: DocumentFileStatus;
  readonly strategy: PdfStrategy;
  readonly extractedText: string | null;
};

export interface DocumentBatchRepository {
  /** Inserta la tanda y sus archivos en `queued`, en una transaccion. */
  createBatch(input: NewBatch): Promise<CreatedBatch>;
  attachMessageId(documentFileId: string, messageId: string): Promise<void>;
  /** El `UPDATE` condicional que reclama la fila. `null` si nadie la reclamo. */
  claim(documentFileId: string, messageId: string): Promise<ClaimedFile | null>;
  finish(documentFileId: string, outcome: JobOutcome): Promise<void>;
  /** Pasa a `error` por caducidad las filas de esa tanda y esa empresa mas viejas que el plazo. */
  expireStale(batchId: string, companyId: string, olderThan: Date): Promise<void>;
  readBatch(batchId: string, companyId: string): Promise<BatchStatus | null>;
  /** El archivo con lo que su revision necesita. `null` si no existe o es de otra empresa: los
   *  dos casos se ven igual desde fuera. */
  readFileForReview(documentFileId: string, companyId: string): Promise<FileForReview | null>;
}
