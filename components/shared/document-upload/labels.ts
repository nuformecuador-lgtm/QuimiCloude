import { errorMessage, UNEXPECTED_ERROR_CODE, type ErrorCode } from '@/lib/modules/errores';
import type { DocumentFileStatus } from '@/lib/modules/documentos';

/**
 * La fase del navegador: vive en memoria, muere con la pantalla y no es ninguno de los estados que
 * el modulo persiste.
 */
export type BrowserPhase = 'pending' | 'uploading' | 'uploaded' | 'failed';

export const BROWSER_PHASE_LABELS: Record<BrowserPhase, string> = {
  pending: 'Sin subir',
  uploading: 'Subiendo',
  uploaded: 'Subido',
  failed: 'No se pudo subir',
};

export const FILE_STATUS_LABELS: Record<DocumentFileStatus, string> = {
  queued: 'En cola',
  processing: 'Procesando',
  done: 'Listo',
  error: 'Error',
};

/** El texto de un archivo en error sale del catalogo por su `code`, nunca de un mensaje recibido. */
export function fileErrorMessage(code: ErrorCode | null): string {
  return errorMessage(code ?? UNEXPECTED_ERROR_CODE);
}

export const SELECTION_TRIGGER_LABEL = 'Elegir PDFs';
export const SUBMIT_LABEL = 'Subir';
export const CLEAR_LABEL = 'Quitar la seleccion';
export const RESUME_LABEL = 'Reanudar';
export const UNKNOWN_BATCH_LABEL = 'La tanda ya no esta disponible.';
export const REVIEW_LABEL = 'Revisar';

export function tooManyFilesMessage(max: number): string {
  return `Se admiten como mucho ${max} archivos por tanda. Vuelve a elegir.`;
}
