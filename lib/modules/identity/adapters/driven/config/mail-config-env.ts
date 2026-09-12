/**
 * QC-79 T5 — Las cuatro variables de entorno del correo del enlace (R28; `design.md > 7.3`).
 *
 * Copia literal del patron de `recetas/adapters/driven/config/storage-config-env.ts` (QC-25) y,
 * antes que el, de `initial-access-credentials-env.ts` (QC-6): las variables se leen **en el
 * momento de la invocacion** —dentro de una funcion, nunca al importar el modulo— y si falta
 * alguna el error la NOMBRA sin filtrar ningun valor. Eso es lo que hace que la suite entera pase
 * con las cuatro variables vacias: importar este archivo no lee nada y no hace ninguna llamada.
 *
 * **Por que la lectura esta partida en tres funciones y no en una.** El transporte de correo
 * (`design.md > 9.2`) puede ser `outbox`, que no llama a ningun proveedor y por tanto **no
 * necesita `RESEND_API_KEY`**. Si un unico lector exigiera las cuatro, elegir el transporte
 * obligaria a tener la credencial del proveedor para no usarla. Asi que:
 *
 * - `readMailTransportFromEnv()` — solo `MAIL_TRANSPORT`. Se puede consultar sin ninguna otra.
 * - `readCredentialSetupLinkBaseUrlFromEnv()` — solo `APP_BASE_URL`. La necesitan **los dos**
 *   transportes, porque los dos arman la URL del enlace.
 * - `readResendMailConfigFromEnv()` — las tres que necesita el adaptador del proveedor.
 *
 * Este archivo NO importa la libreria del proveedor: el unico que puede hacerlo es el adaptador
 * de correo (R27). Aqui solo se leen cadenas del entorno.
 */

/** Los dos transportes admitidos (`design.md > 7.3`, § 9.2). `resend` es el de produccion. */
export const MAIL_TRANSPORTS = ['resend', 'outbox'] as const;

export type MailTransport = (typeof MAIL_TRANSPORTS)[number];

/** El transporte por defecto cuando `MAIL_TRANSPORT` falta: el REAL, nunca el buzon. */
const DEFAULT_MAIL_TRANSPORT: MailTransport = MAIL_TRANSPORTS[0];

export type ResendMailConfig = {
  /** Credencial del proveedor. Secreto: no se registra ni aparece en ningun mensaje. */
  readonly apiKey: string;
  /** Direccion remitente. Su valor lo decide el humano (pregunta abierta 1). */
  readonly from: string;
  /** Base con la que se construye la URL del enlace. */
  readonly baseUrl: string;
};

/**
 * Los nombres de variable viven UNICAMENTE como elementos de estos arreglos, cadenas literales en
 * posicion de valor —mismo criterio que `storage-config-env.ts`—: ninguno se repite como
 * identificador aparte, asi que renombrar una variable es tocar un solo sitio.
 */
const RESEND_ENV_VAR_NAMES = ['RESEND_API_KEY', 'MAIL_FROM_ADDRESS', 'APP_BASE_URL'] as const;
const MAIL_TRANSPORT_ENV_VAR_NAME = 'MAIL_TRANSPORT';

const APP_BASE_URL_ENV_VAR_NAME = RESEND_ENV_VAR_NAMES[2];

/** Vacia o solo-espacios cuenta como ausente. Devuelve el valor SIN recortar. */
function readRequiredEnv(name: string): string {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') {
    throw new Error(`falta la variable de entorno ${name}`);
  }
  return raw;
}

/**
 * Resuelve varias variables por posicion. Si falta una o varias, el error las nombra TODAS juntas
 * y nunca incluye ningun valor (R28).
 */
function readRequiredEnvVars(names: readonly string[]): readonly string[] {
  const missing: string[] = [];
  const resolved: string[] = [];

  for (const name of names) {
    try {
      resolved.push(readRequiredEnv(name));
    } catch {
      missing.push(name);
    }
  }

  if (missing.length > 0) {
    throw new Error(`faltan las variables de entorno: ${missing.join(', ')}`);
  }

  return resolved;
}

/**
 * `MAIL_TRANSPORT` (R28, § 9.2). Ausente o vacia = `resend`, el transporte REAL: una variable que
 * nadie puso no puede acabar escribiendo los correos a un archivo en silencio. Cualquier valor que
 * no sea uno de los dos admitidos **falla**, y el mensaje nombra la variable **sin incluir el valor
 * recibido** —que es entrada de operacion y no se repite en una traza—.
 */
export function readMailTransportFromEnv(): MailTransport {
  const raw = process.env[MAIL_TRANSPORT_ENV_VAR_NAME];
  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_MAIL_TRANSPORT;
  }

  const candidate = raw.trim();
  const transport = MAIL_TRANSPORTS.find((admitted) => admitted === candidate);
  if (transport === undefined) {
    throw new Error(
      `la variable de entorno ${MAIL_TRANSPORT_ENV_VAR_NAME} no es uno de los transportes admitidos`,
    );
  }

  return transport;
}

/**
 * `APP_BASE_URL` sola (R28). La piden los DOS transportes, porque los dos arman la URL del enlace;
 * el de buzon no tiene por que exigir la credencial del proveedor para escribirla.
 */
export function readCredentialSetupLinkBaseUrlFromEnv(): string {
  const [baseUrl] = readRequiredEnvVars([APP_BASE_URL_ENV_VAR_NAME]) as [string];
  return baseUrl;
}

/**
 * Las tres variables del adaptador del proveedor (R28). Si falta una o varias, el error las nombra
 * todas juntas y no incluye ningun valor: ni la clave, ni el remitente, ni la base de la URL.
 */
export function readResendMailConfigFromEnv(): ResendMailConfig {
  const [apiKey, from, baseUrl] = readRequiredEnvVars(RESEND_ENV_VAR_NAMES) as [string, string, string];
  return { apiKey, from, baseUrl };
}
