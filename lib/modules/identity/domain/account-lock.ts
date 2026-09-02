// T1b — Politica de bloqueo temporal de cuenta (`design.md > 5.5`, R22-R27).
// Dominio puro: dos funciones sin efectos, sin reloj propio (`now` entra como parametro) y
// sin ningun conocimiento de la base. Es lo que permite testear la escalada entera sin
// Postgres y sin esperar 60 segundos a que caduque nada.

/** Fallos consecutivos que consuman un bloqueo (D11). */
export const MAX_FAILED_ATTEMPTS = 5;

/**
 * Duracion del bloqueo por nivel de escalada: niveles 1..4 -> 1, 5, 15 y 60 minutos.
 *
 * El ultimo valor es el tope: a partir del cuarto bloqueo se repite 60 min para siempre.
 * NUNCA hay bloqueo permanente porque no existe pantalla de administracion que lo levante
 * (D11): un bloqueo eterno dejaria al usuario fuera hasta tocar la base a mano.
 */
export const LOCK_DURATIONS_MS: readonly number[] = [1, 5, 15, 60].map((minutos) => minutos * 60_000);

export type AccountLockState = {
  readonly failedAttempts: number;
  readonly lockLevel: number;
  readonly lockedUntil: Date | null;
};

const MAX_LOCK_LEVEL = LOCK_DURATIONS_MS.length;

const UNLOCKED: AccountLockState = { failedAttempts: 0, lockLevel: 0, lockedUntil: null };

export function isLocked(state: AccountLockState, now: Date): boolean {
  return state.lockedUntil !== null && state.lockedUntil.getTime() > now.getTime();
}

/**
 * Estado que corresponde a un intento, dado el estado previo y su desenlace.
 *
 * Tres decisiones que no son obvias:
 * - un exito reinicia contador **y nivel**: el dueño de la cuenta demostro su identidad y
 *   mantenerle el nivel alto lo castigaria por un ataque que no es suyo (R27);
 * - un fallo **durante** un bloqueo devuelve el estado tal cual, para que martillear una
 *   cuenta bloqueada no la mantenga bloqueada indefinidamente (R25);
 * - el nivel solo sube al consumar un bloqueo, o sea cada 5 fallos, y el contador se
 *   reinicia ahi para que el siguiente bloqueo necesite otros 5 (R22).
 */
export function nextLockState(
  state: AccountLockState,
  outcome: 'success' | 'failure',
  now: Date,
): AccountLockState {
  if (outcome === 'success') return UNLOCKED;

  if (isLocked(state, now)) return state;

  const failedAttempts = state.failedAttempts + 1;

  if (failedAttempts < MAX_FAILED_ATTEMPTS) {
    // `lockedUntil` a null y no "igual": si venia de un bloqueo ya caducado, arrastrarlo
    // dejaria en la base un instante pasado que no significa nada.
    return { failedAttempts, lockLevel: state.lockLevel, lockedUntil: null };
  }

  const lockLevel = Math.min(state.lockLevel + 1, MAX_LOCK_LEVEL);
  const duracion = LOCK_DURATIONS_MS[lockLevel - 1];

  return {
    failedAttempts: 0,
    lockLevel,
    lockedUntil: new Date(now.getTime() + duracion),
  };
}
