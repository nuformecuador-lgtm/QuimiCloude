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

/**
 * Cuanto puede correr el trabajo de la cola antes de que la plataforma lo mate, en segundos.
 *
 * **300 es tambien el valor por defecto de Vercel**, asi que dejarlo aqui no cambia el
 * comportamiento: lo hace EXPLICITO y da un solo sitio donde subirlo.
 */
export const DEFAULT_JOB_MAX_DURATION_SECONDS = 300;

/**
 * El techo que la plataforma admite, en segundos.
 *
 * **800 s es el maximo de Vercel en Pro y Enterprise**; en Hobby el maximo es 300, que coincide
 * con el valor por defecto. Por encima de 800 solo se llega con la beta de duracion extendida
 * (hasta 1800 s), que exige configuracion por funcion y no se contempla aqui.
 *
 * Pedir mas de este techo no es un error del que valga la pena morirse: se recorta y se sigue,
 * porque un despliegue que no arranca por un numero de mas en el entorno es peor que uno que
 * corre con el maximo legal.
 */
export const MAX_JOB_MAX_DURATION_SECONDS = 800;
