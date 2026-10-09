/**
 * Se leen dentro de cada llamada, nunca al importar: así la composición carga sin las variables.
 * Los errores nombran la variable y, como mucho, una versión ya validada; nunca un trozo del valor.
 */
import { isKeyVersion, isStandardBase64 } from '../../../domain/stored-secret';

export type EncryptionKeyRing = ReadonlyMap<string, Buffer>;

const KEYS_VAR = 'INTEGRATIONS_ENCRYPTION_KEYS';
const ACTIVE_VAR = 'INTEGRATIONS_ENCRYPTION_ACTIVE';
const KEY_BYTES = 32;

function readRequiredEnv(name: string): string {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') {
    throw new Error(`falta la variable de entorno ${name}`);
  }
  return raw;
}

function decodeKey(version: string, encoded: string): Buffer {
  const key = isStandardBase64(encoded) ? Buffer.from(encoded, 'base64') : null;
  if (key === null || key.length !== KEY_BYTES) {
    throw new Error(`${KEYS_VAR}: la clave ${version} no son ${KEY_BYTES} bytes en base64`);
  }
  return key;
}

export function readEncryptionKeyRing(): EncryptionKeyRing {
  const entries = readRequiredEnv(KEYS_VAR).split(',');
  const ring = new Map<string, Buffer>();

  entries.forEach((rawEntry, index) => {
    const entry = rawEntry.trim();
    const separator = entry.indexOf(':');
    const version = separator === -1 ? '' : entry.slice(0, separator);
    // Con la versión mal formada se da la posición: la etiqueta sería un trozo del valor sin validar.
    if (!isKeyVersion(version)) {
      throw new Error(`${KEYS_VAR}: la entrada ${index + 1} no tiene la forma v<n>:<base64>`);
    }
    if (ring.has(version)) {
      throw new Error(`${KEYS_VAR}: la versión ${version} aparece dos veces`);
    }
    ring.set(version, decodeKey(version, entry.slice(separator + 1)));
  });

  return ring;
}

export function readActiveKeyVersion(ring: EncryptionKeyRing): string {
  const version = readRequiredEnv(ACTIVE_VAR).trim();
  if (!isKeyVersion(version)) {
    throw new Error(`${ACTIVE_VAR}: no tiene la forma v<n>`);
  }
  if (!ring.has(version)) {
    throw new Error(`${ACTIVE_VAR}: la versión activa no está en ${KEYS_VAR}`);
  }
  return version;
}
