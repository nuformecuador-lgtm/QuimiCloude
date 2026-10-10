export type StoredSecretParts = {
  readonly version: string;
  readonly iv: string;
  readonly tag: string;
  readonly ciphertext: string;
};

const SEPARATOR = ':';
const KEY_VERSION = /^v[1-9][0-9]*$/;
// Hace falta la regex: decodificar base64 en Node ignora en silencio los caracteres sobrantes.
const STANDARD_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export function isKeyVersion(label: string): boolean {
  return KEY_VERSION.test(label);
}

export function isStandardBase64(value: string): boolean {
  return value !== '' && STANDARD_BASE64.test(value);
}

export function joinStoredSecret(parts: StoredSecretParts): string {
  return [parts.version, parts.iv, parts.tag, parts.ciphertext].join(SEPARATOR);
}

/** `null` si el valor no tiene la forma `v<n>:<iv>:<tag>:<ciphertext>`. */
export function splitStoredSecret(stored: string): StoredSecretParts | null {
  const pieces = stored.split(SEPARATOR);
  if (pieces.length !== 4) return null;
  const [version, iv, tag, ciphertext] = pieces as [string, string, string, string];
  if (!isKeyVersion(version)) return null;
  if (![iv, tag, ciphertext].every(isStandardBase64)) return null;
  return { version, iv, tag, ciphertext };
}
