import { ERROR_MESSAGE_KEY, ERROR_MESSAGES_ES } from './error-catalog';
import type { ErrorCode } from './error-codes';

/**
 * QC-70 (R1, R7) — el UNICO camino del codigo a su texto: codigo -> clave estable -> texto.
 *
 * Lo llama la clase base de error de cada modulo al construirse, para que el mensaje NO se
 * pueda pasar desde el sitio que lanza (R7), y lo llama el traductor unico (`error-state.ts`).
 * No admite un texto por defecto ni un `code` que no este en la lista: el tipo lo impide (R2).
 */
export function errorMessage(code: ErrorCode): string {
  return ERROR_MESSAGES_ES[ERROR_MESSAGE_KEY[code]];
}
