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
 * El par `(failedAttempts, lockLevel)` NO identifica por si solo el estado de la fila, y por eso
 * no basta como predicado. `(0, 1)` existe con dos `locked_until` distintos: como bloqueo recien
 * consumado —`(0, 1, T_futuro)`— y como ese mismo bloqueo ya caducado —`(0, 1, T_pasado)`—; y se
 * vuelve a `(0, 1)` despues de un login correcto, que deja `(0, 0, null)`, mas otros cinco
 * fallos. Es un ABA de manual: un intento que leyo `(0, 1, T_pasado)` y llega tarde con su
 * escritura casaria el predicado contra un bloqueo VIVO y lo borraria, dejando fuera al bloqueo
 * que la politica acababa de imponer. Se comprobo ejecutandolo contra Postgres.
 *
 * Por eso el predicado exige ademas que **no haya bloqueo vigente en `now`**, y lo hace con un
 * RANGO (`locked_until` nulo o `<= now`) y no con una igualdad contra `esperado.lockedUntil`.
 * La distincion no es de estilo: `locked_until` es `timestamptz(6)` —microsegundos en Postgres—
 * y un `Date` de JS solo llega al milisegundo, asi que una igualdad seria una comparacion que
 * un dia deja de casar en silencio y el CAS no volveria a aplicar nunca. Un rango no necesita
 * que las marcas de tiempo casen exactamente, solo que caigan del lado correcto.
 *
 * Los tres caminos legitimos siguen pasando: el fallo normal y el quinto fallo salen de filas
 * con `locked_until` nulo, y un bloqueo ya caducado entra por el `lte: now`.
 *
 * `updateMany` y no `update` porque el `where` lleva columnas que no son clave; como `id` si es
 * la primaria, el conjunto afectado es de 0 o 1 filas.
 */
export async function compareAndSetLoginAttempt(
  userId: string,
  esperado: AccountLockState,
  siguiente: AccountLockState,
  now: Date,
): Promise<boolean> {
  const { count } = await prisma.user.updateMany({
    where: {
      id: userId,
      failedLoginAttempts: esperado.failedAttempts,
      lockLevel: esperado.lockLevel,
      OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }],
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
