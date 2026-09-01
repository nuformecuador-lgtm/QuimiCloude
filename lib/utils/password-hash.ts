import { compare, hash } from 'bcryptjs';

/** Coste de bcrypt (`design.md > 3`). Queda escrito dentro del propio valor guardado. */
export const BCRYPT_ROUNDS = 10;

/** Maximo de bytes UTF-8 que bcrypt tiene en cuenta. Mas alla, truncaria (`design.md > 5`). */
export const BCRYPT_MAX_INPUT_BYTES = 72;

/** Cadena estandar de bcrypt: prefijo, coste y 53 caracteres de sal + digest. */
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

/**
 * Transforma una contrasena en su valor almacenable. Sal interna nueva en cada
 * llamada: dos llamadas con la misma contrasena devuelven valores distintos (R2).
 * Lanza si `plaintext` supera los 72 bytes en UTF-8 (R9), sin incluirlo en el mensaje (R8).
 */
export async function createPasswordHash(plaintext: string): Promise<string> {
  if (Buffer.byteLength(plaintext, 'utf8') > BCRYPT_MAX_INPUT_BYTES) {
    throw new Error(
      `La contrasena excede el maximo de ${BCRYPT_MAX_INPUT_BYTES} bytes UTF-8 que admite bcrypt.`,
    );
  }
  return hash(plaintext, BCRYPT_ROUNDS);
}

/**
 * Responde si `plaintext` corresponde a `storedHash`. Falla cerrado: un `storedHash`
 * vacio, mal formado o corrupto devuelve `false` sin lanzar (R5).
 */
export async function verifyPasswordHash(plaintext: string, storedHash: string): Promise<boolean> {
  if (typeof storedHash !== 'string' || !BCRYPT_HASH_PATTERN.test(storedHash)) return false;
  try {
    return await compare(plaintext, storedHash);
  } catch {
    return false;
  }
}
