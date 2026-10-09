import { randomBytes, randomUUID } from 'node:crypto';

import type { RandomSource } from '../../../ports/random-source';

const VERIFY_TOKEN_BYTES = 32;

/** base64url: sin `+`, `/` ni `=`, para que el token se copie y se pegue en Meta tal cual. */
export const randomSourceNode = {
  newId: () => randomUUID(),
  newVerifyToken: () => randomBytes(VERIFY_TOKEN_BYTES).toString('base64url'),
} satisfies RandomSource;
