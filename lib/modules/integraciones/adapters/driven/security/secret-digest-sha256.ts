import { createHash, timingSafeEqual } from 'node:crypto';

import type { SecretDigest } from '../../../ports/secret-digest';

const HEX_DIGEST = /^[0-9a-f]{64}$/;

export function digestOfSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

/** Compara resúmenes de 32 bytes, no el secreto: su largo no influye en el tiempo de la comparación. */
export function secretMatchesDigest(secret: string, storedDigest: string): boolean {
  if (!HEX_DIGEST.test(storedDigest)) return false;
  return timingSafeEqual(
    Buffer.from(digestOfSecret(secret), 'hex'),
    Buffer.from(storedDigest, 'hex'),
  );
}

export const secretDigestSha256 = {
  digestOf: digestOfSecret,
  matches: secretMatchesDigest,
} satisfies SecretDigest;
