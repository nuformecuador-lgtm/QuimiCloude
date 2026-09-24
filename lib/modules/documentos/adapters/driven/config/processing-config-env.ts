/**
 * Las variables de entorno del procesamiento por lotes, leidas EN EL MOMENTO DE LA INVOCACION
 * —dentro de una funcion, nunca al importar el modulo—, exactamente como
 * `document-storage-config-env.ts`.
 *
 * Que se lean aqui y no en el top-level es lo que permite que el punto de composicion construya
 * la fachada del modulo sin leer una sola variable y sin tocar la red, y que la suite entera
 * corra sin la cola configurada.
 *
 * Si falta alguna, el error las NOMBRA y no incluye jamas ningun valor.
 */
import { resolveMaxRetries, resolveTimeoutSeconds } from '../../../domain/processing-timeouts';

import type { ProcessingConfig } from '../../../ports/processing-config';

export type QstashConfig = {
  readonly token: string;
  readonly currentSigningKey: string;
  readonly nextSigningKey: string;
  readonly targetUrl: string;
};

/**
 * Los cuatro nombres viven UNICAMENTE como elementos de este arreglo, cadenas literales en
 * posicion de valor. Repetirlos como identificador aparte seria tener dos sitios que dicen como
 * se llama lo mismo.
 */
const REQUIRED_QSTASH_ENV_VAR_NAMES = [
  'QSTASH_TOKEN',
  'QSTASH_CURRENT_SIGNING_KEY',
  'QSTASH_NEXT_SIGNING_KEY',
  'QSTASH_TARGET_URL',
] as const;

/** Vacia o solo-espacios cuenta como ausente. Devuelve el valor SIN recortar. */
function readRequiredEnv(name: string): string {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') {
    throw new Error(`falta la variable de entorno ${name}`);
  }
  return raw;
}

/**
 * Resuelve las cuatro por POSICION, no por nombre de propiedad, para no volver a escribir
 * ninguno de los cuatro nombres fuera del arreglo de arriba. Si faltan varias, el error las
 * nombra TODAS juntas y nunca incluye ningun valor.
 */
export function readQstashConfigFromEnv(): QstashConfig {
  const missing: string[] = [];
  const resolved: string[] = [];

  for (const name of REQUIRED_QSTASH_ENV_VAR_NAMES) {
    try {
      resolved.push(readRequiredEnv(name));
    } catch {
      missing.push(name);
    }
  }

  if (missing.length > 0) {
    throw new Error(`faltan las variables de entorno: ${missing.join(', ')}`);
  }

  const [token, currentSigningKey, nextSigningKey, targetUrl] = resolved as [
    string,
    string,
    string,
    string,
  ];
  return { token, currentSigningKey, nextSigningKey, targetUrl };
}

/**
 * Los dos plazos son OPCIONALES: si vienen vacios, `processing-timeouts.ts` aplica su valor por
 * defecto. Por eso no participan del arreglo de obligatorias de arriba.
 */
export function readProcessingConfigFromEnv(): ProcessingConfig {
  const timeoutSeconds = resolveTimeoutSeconds(process.env.DOCUMENT_PROCESSING_TIMEOUT_SECONDS);
  const maxRetries = resolveMaxRetries(process.env.DOCUMENT_PROCESSING_MAX_RETRIES);

  return {
    timeoutSeconds: () => timeoutSeconds,
    maxRetries: () => maxRetries,
  };
}
