// lib/composition/index.ts — PUNTO UNICO DE COMPOSICION.
// Aqui, y solo aqui, se elige QUE implementacion concreta cumple cada puerto.
// Prohibido importar adaptadores driving desde aqui: la flecha va driving -> composicion (R12).
import { createVerifyCredentials, seedInitialAccess } from '@/lib/modules/identity';
import { readInitialAdminCredentialsFromEnv } from '@/lib/modules/identity/adapters/driven/config/initial-access-credentials-env';
import { withInitialAccessTransaction } from '@/lib/modules/identity/adapters/driven/persistence/initial-access-repository-prisma';
import {
  compareAndSetLoginAttempt,
  findActiveByUsername,
  setLoginAttempt,
} from '@/lib/modules/identity/adapters/driven/persistence/user-credentials-prisma';
import {
  createPasswordHash,
  verifyPasswordHash,
} from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { startSession } from '@/lib/modules/identity/adapters/driven/session/session-cookie';
import {
  endSession,
  getSessionUser,
} from '@/lib/modules/identity/adapters/driven/session/session-stub';
import type { LoginAttemptRecorder } from '@/lib/modules/identity/ports/login-attempt-recorder';
import type { PasswordHasher } from '@/lib/modules/identity/ports/password-hasher';
import type { SessionProvider } from '@/lib/modules/identity/ports/session-provider';
import type { SessionWriter } from '@/lib/modules/identity/ports/session-writer';
import type { UserCredentialsReader } from '@/lib/modules/identity/ports/user-credentials-reader';

const passwordHasher: PasswordHasher = { hash: createPasswordHash, verify: verifyPasswordHash };
const userCredentialsReader: UserCredentialsReader = { findActiveByUsername };
const loginAttemptRecorder: LoginAttemptRecorder = {
  compareAndSet: compareAndSetLoginAttempt,
  set: setLoginAttempt,
};
const sessionWriter: SessionWriter = { startSession };
// Leer y cerrar sesion siguen siendo el stub de QC-8: QC-7 solo escribe la cookie (R20).
const sessionProvider: SessionProvider = { getSessionUser, endSession };

/** Fachada del modulo `identity` ya cableada. Es lo que consumen acciones, rutas y layouts. */
export const identity = {
  // La clave conserva nombre y firma: por eso `login-action.ts` no cambia (R16).
  verifyCredentials: createVerifyCredentials({
    users: userCredentialsReader,
    attempts: loginAttemptRecorder,
    hasher: passwordHasher,
    session: sessionWriter,
  }),
  passwordHasher,
  ...sessionProvider,
  // QC-6: siembra roles y usuario inicial. Invocable como `identity.seedInitialAccess()`,
  // sin argumentos: el repositorio, el hasher y el proveedor de credenciales ya estan
  // cableados aqui (`design.md > 5`). Solo lo consume `scripts/seed.ts`.
  // La invocacion corre dentro de `withInitialAccessTransaction`: es lo que hace cierto
  // R13 (`design.md > 5.2`, "los pasos 4 y 5 corren dentro de una unica
  // `prisma.$transaction`"). Si el alta del usuario falla, los roles creados en la misma
  // corrida tampoco quedan comiteados.
  seedInitialAccess: () =>
    withInitialAccessTransaction((repository) =>
      seedInitialAccess({ repository, passwordHasher, credentials: readInitialAdminCredentialsFromEnv }),
    ),
} as const;
