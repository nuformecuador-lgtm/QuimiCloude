/**
 * El ESTADO de un archivo y el de una tanda: lo que devuelve la consulta y lo que persiste el
 * repositorio.
 *
 * `documentFileStatusSchema` no es solo un tipo: la estrategia guardada ya demostro que un valor de
 * la base puede llegar podrido, y un estado no es distinto.
 *
 * Dominio puro: el unico import externo es `zod`.
 */
import { z } from 'zod';

import type { ErrorCode } from '@/lib/modules/errores';
import type { PdfStrategy } from './pdf-strategy';

export const documentFileStatusSchema = z.union([
  z.literal('queued'),
  z.literal('processing'),
  z.literal('done'),
  z.literal('error'),
]);

export type DocumentFileStatus = z.infer<typeof documentFileStatusSchema>;

/**
 * Una fila de archivo tal como la ve quien consulta: el texto y el motivo solo llevan valor en el
 * estado que les corresponde, igual que lo hacen inexpresable los `CHECK` de la base.
 */
export type DocumentFileStatusEntry = {
  readonly id: string;
  readonly path: string;
  readonly status: DocumentFileStatus;
  readonly extractedText: string | null;
  readonly errorCode: ErrorCode | null;
  readonly errorReason: string | null;
};

/** La tanda entera, con la estrategia elegida una sola vez y el estado de cada uno de sus archivos. */
export type BatchStatus = {
  readonly id: string;
  readonly companyId: string;
  readonly strategy: PdfStrategy;
  readonly files: readonly DocumentFileStatusEntry[];
};
