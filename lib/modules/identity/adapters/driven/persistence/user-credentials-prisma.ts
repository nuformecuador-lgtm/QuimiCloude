import { prisma } from '@/lib/shared/db/prisma';

import type { AccountLockState } from '../../../domain/account-lock';
import type { AuthenticatableUser } from '../../../ports/user-credentials-reader';

// Implementa dos puertos del modulo `identity`:
// - `UserCredentialsReader` (`../../../ports/user-credentials-reader`): `findActiveByUsername`;
// - `LoginAttemptRecorder` (`../../../ports/login-attempt-recorder`): `compareAndSetLoginAttempt`
//   cumple `compareAndSet` y `setLoginAttempt` cumple `set`.
// El cableado nombre a nombre lo hace el punto de composicion.

/** Fila cruda que devuelve Postgres: nombres de columna, no de modelo. */
type FilaCredenciales = {
  id: string;
  password_hash: string;
  failed_login_attempts: number;
  lock_level: number;
  locked_until: Date | null;
};

/**
 * Busca un usuario NO borrado por su nombre de usuario, sin distinguir mayusculas (R1, R4, R5).
 *
 * Va con `$queryRaw` parametrizado (template tag, jamas interpolacion de cadenas) y no con la
 * API tipada y `mode: 'insensitive'` por una razon concreta: la unicidad del nombre de usuario
 * vive como indice funcional parcial `users_username_unique` sobre
 * `lower(username) WHERE deleted_at IS NULL`. `mode: 'insensitive'` genera `ILIKE`, que **no**
 * usa ese indice: el login haria un seq scan sobre `users` en la ruta mas caliente de la app.
 *
 * Devuelve solo el id, el hash y el estado de bloqueo. Ni correo, ni documento, ni nombre, ni
 * telefono: lo que no sale de la base no se puede filtrar por error en un log (R15). Por lo
 * mismo, aqui no hay ni un `console.*`.
 */
export async function findActiveByUsername(username: string): Promise<AuthenticatableUser | null> {
  const filas = await prisma.$queryRaw<FilaCredenciales[]>`
    SELECT id, password_hash, failed_login_attempts, lock_level, locked_until FROM users
    WHERE lower(username) = lower(${username}) AND deleted_at IS NULL
    LIMIT 1
  `;

  const fila = filas[0];
  if (fila === undefined) return null;

  // El raw no pasa por el mapeo de Prisma: las conversiones son explicitas y no implicitas.
  return {
    id: fila.id,
    passwordHash: fila.password_hash,
    failedAttempts: Number(fila.failed_login_attempts),
    lockLevel: Number(fila.lock_level),
    lockedUntil: fila.locked_until === null ? null : new Date(fila.locked_until),
  };
}

/**
 * Escritura CONDICIONAL del estado de bloqueo que ya calculo el dominio (`nextLockState`),
 * sin decidir nada sobre la escalada (R22, R23, R27, R30). Aplica `siguiente` solo si la fila
 * sigue en `esperado`, y devuelve si llego a afectarla.
 *
 * Es lo que hace que el contador aguante intentos concurrentes: el caso de uso lee el estado,
 * tarda ~110 ms en bcrypt y solo entonces escribe. Con un `UPDATE` incondicional, N intentos
 * en paralelo leerian `0` y escribirian todos `1`, y la cuenta no se bloquearia nunca. Si el
 * `UPDATE` no afecta a ninguna fila, otro intento se adelanto y el dominio relee y recalcula.
 *
 * El predicado usa SOLO los dos enteros, NO `locked_until`: la columna es `timestamptz(6)`
 * —microsegundos en Postgres— y un `Date` de JS solo tiene milisegundos, asi que meterla en el
 * `where` es una comparacion que un dia deja de casar en silencio y el CAS no volveria a
 * aplicar nunca. Ademas no hace falta: el par `(failedAttempts, lockLevel)` ya identifica cada
 * estado de la cadena de transiciones.
 *
 * `updateMany` y no `update` porque el `where` lleva columnas que no son clave; como `id` si es
 * la primaria, el conjunto afectado es de 0 o 1 filas.
 */
export async function compareAndSetLoginAttempt(
  userId: string,
  esperado: AccountLockState,
  siguiente: AccountLockState,
): Promise<boolean> {
  const { count } = await prisma.user.updateMany({
    where: {
      id: userId,
      failedLoginAttempts: esperado.failedAttempts,
      lockLevel: esperado.lockLevel,
    },
    data: {
      failedLoginAttempts: siguiente.failedAttempts,
      lockLevel: siguiente.lockLevel,
      lockedUntil: siguiente.lockedUntil,
    },
  });

  return count === 1;
}

/**
 * Escritura INCONDICIONAL del estado de bloqueo. Solo la usa el camino de exito, cuyo estado
 * es todo ceros y no depende del valor previo.
 *
 * Aqui si va la API tipada por clave primaria: no necesita el indice funcional y asi el
 * compilador vigila los nombres de las columnas.
 */
export async function setLoginAttempt(userId: string, estado: AccountLockState): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      failedLoginAttempts: estado.failedAttempts,
      lockLevel: estado.lockLevel,
      lockedUntil: estado.lockedUntil,
    },
  });
}
