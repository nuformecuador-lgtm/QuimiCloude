/**
 * Los valores por defecto de dos plazos de INFRAESTRUCTURA, y la funcion que los aplica cuando la
 * variable de entorno viene vacia.
 *
 * No viven en `domain/limits.ts`: ese archivo declara lo que el modulo promete, y estos dos
 * cambian por entorno. Quien LEE la variable es el adaptador; este archivo solo sabe que hacer
 * cuando esta vacia.
 *
 * Dominio puro: este archivo no importa nada.
 */

/** Cuanto puede llevar una fila en cola o procesando antes de caducar, en segundos. */
export const DEFAULT_PROCESSING_TIMEOUT_SECONDS = 900;

/** Cuantas veces reintenta la cola un mensaje antes de dejar de entregarlo. */
export const DEFAULT_PROCESSING_MAX_RETRIES = 3;

/** Un entero positivo, o `null` si el valor no lo es. Vacio o solo-espacios cuenta como ausente. */
function parsePositiveInteger(raw: string | undefined): number | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function resolveTimeoutSeconds(raw: string | undefined): number {
  return parsePositiveInteger(raw) ?? DEFAULT_PROCESSING_TIMEOUT_SECONDS;
}

export function resolveMaxRetries(raw: string | undefined): number {
  return parsePositiveInteger(raw) ?? DEFAULT_PROCESSING_MAX_RETRIES;
}
