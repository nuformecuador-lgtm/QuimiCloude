// T1b — Politica de bloqueo temporal, entera y sin base de datos (`design.md > 5.5`).
// `now` se inyecta en TODOS los casos: probar la caducidad con un `sleep` real seria un test
// de 60 segundos y, encima, intermitente.

import {
  LOCK_DURATIONS_MS,
  MAX_FAILED_ATTEMPTS,
  type AccountLockState,
  isLocked,
  nextLockState,
} from '@/lib/modules/identity/domain/account-lock';

const AHORA = new Date('2026-09-01T08:00:00.000Z');
const MINUTO_MS = 60_000;

const LIMPIO: AccountLockState = { failedAttempts: 0, lockLevel: 0, lockedUntil: null };

function despuesDe(now: Date, ms: number): Date {
  return new Date(now.getTime() + ms);
}

/** Encadena `n` fallos consecutivos desde un estado, todos en el mismo instante. */
function fallar(estado: AccountLockState, veces: number, now: Date): AccountLockState {
  let actual = estado;
  for (let i = 0; i < veces; i += 1) {
    actual = nextLockState(actual, 'failure', now);
  }
  return actual;
}

describe('bloqueo temporal de cuenta', () => {
  // R22
  it('el quinto fallo bloquea y reinicia el contador', () => {
    let estado = LIMPIO;

    for (let intento = 1; intento < MAX_FAILED_ATTEMPTS; intento += 1) {
      estado = nextLockState(estado, 'failure', AHORA);
      expect(estado.failedAttempts).toBe(intento);
      expect(estado.lockLevel).toBe(0);
      expect(estado.lockedUntil).toBeNull();
      expect(isLocked(estado, AHORA)).toBe(false);
    }

    estado = nextLockState(estado, 'failure', AHORA);

    expect(estado.failedAttempts).toBe(0);
    expect(estado.lockLevel).toBe(1);
    expect(estado.lockedUntil).toEqual(despuesDe(AHORA, 1 * MINUTO_MS));
    expect(isLocked(estado, AHORA)).toBe(true);
  });

  // R23
  it('la escalada es 1, 5, 15 y 60 minutos y no pasa de 60', () => {
    const esperados = [1, 5, 15, 60, 60, 60].map((m) => m * MINUTO_MS);
    const niveles = [1, 2, 3, 4, 4, 4];

    let estado = LIMPIO;
    let now = AHORA;

    esperados.forEach((duracionEsperada, indice) => {
      estado = fallar(estado, MAX_FAILED_ATTEMPTS, now);

      expect(estado.lockedUntil).not.toBeNull();
      expect(estado.lockLevel).toBe(niveles[indice]);
      expect(estado.failedAttempts).toBe(0);
      expect(estado.lockedUntil?.getTime()).toBe(now.getTime() + duracionEsperada);

      // Se salta al instante siguiente al fin del bloqueo para consumar el bloqueo posterior.
      now = despuesDe(estado.lockedUntil as Date, 1);
    });

    expect(LOCK_DURATIONS_MS).toEqual([1, 5, 15, 60].map((m) => m * MINUTO_MS));
  });

  // R26
  it('con el bloqueo caducado vuelve a aceptar intentos', () => {
    const bloqueado = fallar(LIMPIO, MAX_FAILED_ATTEMPTS, AHORA);
    const finBloqueo = bloqueado.lockedUntil as Date;

    expect(isLocked(bloqueado, despuesDe(finBloqueo, -1))).toBe(true);
    expect(isLocked(bloqueado, finBloqueo)).toBe(false);
    expect(isLocked(bloqueado, despuesDe(finBloqueo, 1))).toBe(false);

    const trasCaducar = nextLockState(bloqueado, 'failure', despuesDe(finBloqueo, MINUTO_MS));

    expect(trasCaducar.failedAttempts).toBe(1);
    expect(trasCaducar.lockLevel).toBe(bloqueado.lockLevel);
    expect(trasCaducar.lockedUntil).toBeNull();
  });

  // R25
  it('fallo estando bloqueada devuelve el mismo estado', () => {
    const bloqueado = fallar(LIMPIO, MAX_FAILED_ATTEMPTS, AHORA);
    const durante = despuesDe(AHORA, 30_000);

    const trasMartillear = fallar(bloqueado, 10, durante);

    expect(trasMartillear).toEqual(bloqueado);
    expect(trasMartillear.lockedUntil?.getTime()).toBe(bloqueado.lockedUntil?.getTime());
    expect(trasMartillear.lockLevel).toBe(bloqueado.lockLevel);
    expect(trasMartillear.failedAttempts).toBe(bloqueado.failedAttempts);
  });

  // R27
  it('un intento correcto deja contador, nivel y bloqueo a cero', () => {
    const bloqueado = fallar(LIMPIO, MAX_FAILED_ATTEMPTS * 2, AHORA);

    expect(nextLockState(bloqueado, 'success', AHORA)).toEqual({
      failedAttempts: 0,
      lockLevel: 0,
      lockedUntil: null,
    });
    expect(nextLockState({ failedAttempts: 3, lockLevel: 2, lockedUntil: null }, 'success', AHORA)).toEqual({
      failedAttempts: 0,
      lockLevel: 0,
      lockedUntil: null,
    });
  });
});
