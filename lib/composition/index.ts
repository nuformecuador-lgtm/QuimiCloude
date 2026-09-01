// lib/composition/index.ts — PUNTO UNICO DE COMPOSICION.
// Aqui, y solo aqui, se elige QUE implementacion concreta cumple cada puerto.
// Prohibido importar adaptadores driving desde aqui: la flecha va driving -> composicion (R12).
import { verifyCredentials } from '@/lib/modules/identity';
import {
  createPasswordHash,
  verifyPasswordHash,
} from '@/lib/modules/identity/adapters/driven/security/password-hash';
import {
  endSession,
  getSessionUser,
} from '@/lib/modules/identity/adapters/driven/session/session-stub';
import type { PasswordHasher } from '@/lib/modules/identity/ports/password-hasher';
import type { SessionProvider } from '@/lib/modules/identity/ports/session-provider';

const passwordHasher: PasswordHasher = { hash: createPasswordHash, verify: verifyPasswordHash };
const sessionProvider: SessionProvider = { getSessionUser, endSession };

/** Fachada del modulo `identity` ya cableada. Es lo que consumen acciones, rutas y layouts. */
export const identity = {
  verifyCredentials,
  passwordHasher,
  ...sessionProvider,
} as const;
