/**
 * La clasificacion de un fallo del trabajo en REINTENTABLE o DEFINITIVO, en un solo sitio: quien
 * decide como responder a la cola consulta esto y nada mas.
 *
 * Solo tres codigos pueden salir hoy del procesamiento de un PDF: `ProcessingFailureCode` los
 * acota, y el `Record` no compila si alguno de los tres queda sin clasificar.
 *
 * La descarga del bucket falla ANTES de producir un `ErrorCode` propio de este modulo —el puerto
 * la lanza tal cual—, y por eso tiene su propia constante en vez de pasar por el mapa de codigos.
 */
import type { ErrorCode } from '@/lib/modules/errores';

export type FailureKind = 'retryable' | 'definitive';

type ProcessingFailureCode = Extract<ErrorCode, 'ai_unavailable' | 'unexpected' | 'invalid_input'>;

const KIND_BY_PROCESSING_CODE: Record<ProcessingFailureCode, FailureKind> = {
  ai_unavailable: 'retryable',
  unexpected: 'definitive',
  invalid_input: 'definitive',
};

function isProcessingFailureCode(code: ErrorCode): code is ProcessingFailureCode {
  return code in KIND_BY_PROCESSING_CODE;
}

/**
 * Clasifica un `ErrorCode` que salio del procesamiento de un PDF. Un codigo fuera de los tres
 * conocidos se trata como definitivo: reintentar algo que no se sabe interpretar no mejora nada.
 */
export function failureKind(code: ErrorCode): FailureKind {
  return isProcessingFailureCode(code) ? KIND_BY_PROCESSING_CODE[code] : 'definitive';
}

/** La descarga del bucket SIEMPRE admite otro intento: un corte de almacenamiento mejora esperando. */
export const STORAGE_FAILURE_KIND: FailureKind = 'retryable';
