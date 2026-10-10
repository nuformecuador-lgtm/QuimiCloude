import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { SecretUnreadableError, ValidationError } from '../../../domain/errors';
import {
  encodeSecretContext,
  isCompleteSecretContext,
  type SecretContext,
} from '../../../domain/secret-context';
import { joinStoredSecret, splitStoredSecret } from '../../../domain/stored-secret';
import { readActiveKeyVersion, readEncryptionKeyRing } from '../config/encryption-keys-env';

import type { SecretCipher } from '../../../ports/secret-cipher';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
// Explícito en los dos lados: sin él, el descifrado en GCM acepta tags truncados.
const TAG_BYTES = 16;
const INVALID_SHAPE = 'forma inválida';

function additionalData(version: string, context: SecretContext): Buffer {
  return Buffer.from(encodeSecretContext(version, context), 'utf8');
}

async function encrypt(plaintext: string, context: SecretContext): Promise<string> {
  if (plaintext === '') throw new ValidationError('texto vacío');
  if (!isCompleteSecretContext(context)) throw new ValidationError('contexto incompleto');

  const ring = readEncryptionKeyRing();
  const version = readActiveKeyVersion(ring);
  const key = ring.get(version) as Buffer;

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(additionalData(version, context));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

  return joinStoredSecret({
    version,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  });
}

async function decrypt(stored: string, context: SecretContext): Promise<string> {
  if (!isCompleteSecretContext(context)) throw new ValidationError('contexto incompleto');

  const parts = splitStoredSecret(stored);
  if (parts === null) throw new SecretUnreadableError(INVALID_SHAPE);

  const key = readEncryptionKeyRing().get(parts.version);
  if (key === undefined) {
    throw new SecretUnreadableError(`versión ${parts.version} no configurada`);
  }

  const iv = Buffer.from(parts.iv, 'base64');
  const tag = Buffer.from(parts.tag, 'base64');
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new SecretUnreadableError(INVALID_SHAPE);
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(additionalData(parts.version, context));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(parts.ciphertext, 'base64')),
      decipher.final(),
    ]);
    return plaintext.toString('utf8');
  } catch {
    // Sin `cause`: el error de OpenSSL no aporta y así nada del valor guardado puede llegar al log.
    throw new SecretUnreadableError('no autentica');
  }
}

export const secretCipherAesGcm = { encrypt, decrypt } satisfies SecretCipher;
