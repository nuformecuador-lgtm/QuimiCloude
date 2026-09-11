// QC-78 T3 — El estado efectivo y sus dos companeras, enteros y sin base de datos
// (`design.md > 1`, R7-R15, R17, R24, R25).
//
// `now` se inyecta en TODOS los casos y los objetos son planos: probar la caducidad de un
// bloqueo con una espera real seria un test de 60 segundos e intermitente, y falsear el reloj
// global taparia justo lo que R7 exige comprobar —que la funcion no tiene reloj propio—.

import {
  LOCK_DURATIONS_MS,
  MAX_FAILED_ATTEMPTS,
  type AccountLockState,
  nextLockState,
} from '@/lib/modules/identity/domain/account-lock';
import {
  USER_ACCOUNT_STATUSES,
  type UserAccountStatus,
} from '@/lib/modules/identity/domain/account-status';
import {
  type AccountStatusView,
  accountStatusAfterAttempt,
  clearedLockState,
  effectiveAccountStatus,
} from '@/lib/modules/identity/domain/effective-account-status';

const AHORA = new Date('2026-09-01T08:00:00.000Z');
const MINUTO_MS = 60_000;

const FUTURO = new Date(AHORA.getTime() + 10 * MINUTO_MS);
const VENCIDO = new Date(AHORA.getTime() - 1);
const MUY_LEJANO = new Date('2099-01-01T00:00:00.000Z');

const LIMPIO: AccountLockState = { failedAttempts: 0, lockLevel: 0, lockedUntil: null };

function ficha(accountStatus: UserAccountStatus, lockedUntil: Date | null): AccountStatusView {
  return { accountStatus, lockedUntil };
}

/** Encadena `veces` fallos consecutivos desde un estado, todos en el mismo instante. */
function fallar(estado: AccountLockState, veces: number, now: Date): AccountLockState {
  let actual = estado;
  for (let i = 0; i < veces; i += 1) {
    actual = nextLockState(actual, 'failure', now);
  }
  return actual;
}

describe('R7 — la traduccion del estado vive en una sola funcion sin reloj propio', () => {
  it('la misma ficha da bloqueada antes del plazo y activa despues, solo por el instante recibido', () => {
    const bloqueadaHastaLasNueve = ficha('blocked', new Date('2026-09-01T09:00:00.000Z'));

    expect(effectiveAccountStatus(bloqueadaHastaLasNueve, new Date('2026-09-01T08:59:59.999Z'))).toBe(
      'blocked',
    );
    expect(effectiveAccountStatus(bloqueadaHastaLasNueve, new Date('2026-09-01T09:00:00.000Z'))).toBe(
      'active',
    );
  });

  it('devuelve un estado del catalogo para cualquier combinacion de estado almacenado y plazo', () => {
    const plazos: readonly (Date | null)[] = [null, VENCIDO, FUTURO];

    for (const almacenado of USER_ACCOUNT_STATUSES) {
      for (const plazo of plazos) {
        const efectivo = effectiveAccountStatus(ficha(almacenado, plazo), AHORA);

        expect(USER_ACCOUNT_STATUSES).toContain(efectivo);
      }
    }
  });

  it('no devuelve nunca un estado distinto del almacenado sin que medie el plazo o el bloqueo', () => {
    // `active` sin plazo y sin plazo vigente se queda igual: la traduccion no inventa estados.
    expect(effectiveAccountStatus(ficha('active', null), AHORA)).toBe('active');
    expect(effectiveAccountStatus(ficha('active', VENCIDO), AHORA)).toBe('active');
  });
});

describe('R8 — el bloqueo automatico caduca solo', () => {
  it('una cuenta bloqueada con el plazo ya vencido esta activa', () => {
    expect(effectiveAccountStatus(ficha('blocked', VENCIDO), AHORA)).toBe('active');
  });

  it('sigue activa cuanto mas lejos queda el plazo vencido', () => {
    expect(effectiveAccountStatus(ficha('blocked', VENCIDO), MUY_LEJANO)).toBe('active');
  });
});

describe('R9 — el bloqueo puesto por una persona no caduca', () => {
  it('una cuenta bloqueada sin plazo sigue bloqueada en el instante evaluado', () => {
    expect(effectiveAccountStatus(ficha('blocked', null), AHORA)).toBe('blocked');
  });

  it('sigue bloqueada en un instante muy lejano y en uno anterior', () => {
    const sinPlazo = ficha('blocked', null);

    expect(effectiveAccountStatus(sinPlazo, MUY_LEJANO)).toBe('blocked');
    expect(effectiveAccountStatus(sinPlazo, new Date('2020-01-01T00:00:00.000Z'))).toBe('blocked');
  });
});

describe('R10 — el bloqueo automatico vigente mantiene fuera a la cuenta', () => {
  it('una cuenta bloqueada con el plazo todavia futuro esta bloqueada', () => {
    expect(effectiveAccountStatus(ficha('blocked', FUTURO), AHORA)).toBe('blocked');
  });

  it('sigue bloqueada en el ultimo milisegundo del plazo', () => {
    expect(effectiveAccountStatus(ficha('blocked', FUTURO), new Date(FUTURO.getTime() - 1))).toBe(
      'blocked',
    );
  });
});

describe('R11 — un plazo vigente bloquea aunque la columna diga activa', () => {
  it('una cuenta activa con plazo futuro esta bloqueada', () => {
    expect(effectiveAccountStatus(ficha('active', FUTURO), AHORA)).toBe('blocked');
  });

  it('esa misma cuenta vuelve a estar activa en cuanto el plazo se cumple', () => {
    expect(effectiveAccountStatus(ficha('active', FUTURO), FUTURO)).toBe('active');
  });
});

describe('R12 — pendiente e inactiva mandan sobre el plazo', () => {
  it('una cuenta pendiente sigue pendiente con plazo futuro, vencido o vacio', () => {
    expect(effectiveAccountStatus(ficha('pending', FUTURO), AHORA)).toBe('pending');
    expect(effectiveAccountStatus(ficha('pending', VENCIDO), AHORA)).toBe('pending');
    expect(effectiveAccountStatus(ficha('pending', null), AHORA)).toBe('pending');
  });

  it('una cuenta inactiva sigue inactiva con plazo futuro, vencido o vacio', () => {
    expect(effectiveAccountStatus(ficha('inactive', FUTURO), AHORA)).toBe('inactive');
    expect(effectiveAccountStatus(ficha('inactive', VENCIDO), AHORA)).toBe('inactive');
    expect(effectiveAccountStatus(ficha('inactive', null), AHORA)).toBe('inactive');
  });
});

describe('R13 — el bloqueo por intentos se escribe como bloqueada', () => {
  it('un estado de bloqueo con plazo sobre una cuenta activa manda escribir bloqueada', () => {
    const bloqueo = fallar(LIMPIO, MAX_FAILED_ATTEMPTS, AHORA);

    expect(accountStatusAfterAttempt('active', bloqueo)).toBe('blocked');
  });
});

describe('R14 — el estado de cuenta se deriva de la politica de intentos existente', () => {
  it('los cuatro primeros fallos no mandan escribir nada y el quinto manda bloquear', () => {
    let estado = LIMPIO;

    for (let intento = 1; intento < MAX_FAILED_ATTEMPTS; intento += 1) {
      estado = nextLockState(estado, 'failure', AHORA);
      expect(accountStatusAfterAttempt('active', estado)).toBeNull();
    }

    estado = nextLockState(estado, 'failure', AHORA);

    expect(accountStatusAfterAttempt('active', estado)).toBe('blocked');
  });

  it('los plazos siguen siendo los de la politica, 1, 5, 15 y 60 minutos', () => {
    expect(LOCK_DURATIONS_MS).toEqual([1, 5, 15, 60].map((m) => m * MINUTO_MS));

    let estado = LIMPIO;
    let now = AHORA;

    for (const duracionEsperada of LOCK_DURATIONS_MS) {
      estado = fallar(estado, MAX_FAILED_ATTEMPTS, now);

      expect(accountStatusAfterAttempt('active', estado)).toBe('blocked');
      expect(estado.lockedUntil?.getTime()).toBe(now.getTime() + duracionEsperada);

      now = new Date((estado.lockedUntil as Date).getTime() + 1);
    }
  });

  it('no existe bloqueo automatico sin plazo: todo estado que manda bloquear trae plazo', () => {
    const bloqueo = fallar(LIMPIO, MAX_FAILED_ATTEMPTS, AHORA);

    expect(accountStatusAfterAttempt('active', bloqueo)).toBe('blocked');
    expect(bloqueo.lockedUntil).not.toBeNull();
  });
});

describe('R15 — ninguna escritura automatica deja bloqueada con el plazo vacio', () => {
  it('un fallo suelto sobre una cuenta bloqueada con el plazo caducado la devuelve a activa', () => {
    const caducado: AccountLockState = { failedAttempts: 0, lockLevel: 1, lockedUntil: VENCIDO };
    const trasElFallo = nextLockState(caducado, 'failure', AHORA);

    expect(trasElFallo.lockedUntil).toBeNull();
    expect(accountStatusAfterAttempt('blocked', trasElFallo)).toBe('active');
  });

  it('un ingreso correcto sobre una cuenta bloqueada la devuelve a activa', () => {
    const trasElExito = nextLockState({ ...LIMPIO, lockedUntil: VENCIDO }, 'success', AHORA);

    expect(trasElExito.lockedUntil).toBeNull();
    expect(accountStatusAfterAttempt('blocked', trasElExito)).toBe('active');
  });

  it('nunca manda escribir bloqueada cuando el estado de bloqueo se queda sin plazo', () => {
    for (const almacenado of USER_ACCOUNT_STATUSES) {
      const sinPlazo = accountStatusAfterAttempt(almacenado, LIMPIO);

      expect(sinPlazo).not.toBe('blocked');
    }
  });
});

describe('R17 — no se escribe el estado cuando no cambia', () => {
  it('una cuenta ya bloqueada que sigue bloqueada no manda tocar la columna', () => {
    const bloqueo = fallar(LIMPIO, MAX_FAILED_ATTEMPTS, AHORA);

    expect(accountStatusAfterAttempt('blocked', bloqueo)).toBeNull();
  });

  it('una cuenta activa que sigue activa no manda tocar la columna', () => {
    const unFallo = nextLockState(LIMPIO, 'failure', AHORA);

    expect(accountStatusAfterAttempt('active', unFallo)).toBeNull();
    expect(accountStatusAfterAttempt('active', LIMPIO)).toBeNull();
  });
});

describe('R24 — el desbloqueo administrativo limpia los tres a la vez', () => {
  it('devuelve contador a cero, nivel a cero y plazo vacio', () => {
    expect(clearedLockState()).toEqual({ failedAttempts: 0, lockLevel: 0, lockedUntil: null });
  });

  it('limpia tambien partiendo de un bloqueo escalado y vigente', () => {
    const escalado = fallar(LIMPIO, MAX_FAILED_ATTEMPTS, AHORA);
    const limpio = clearedLockState();

    expect(escalado.lockLevel).toBeGreaterThan(0);
    expect(limpio.failedAttempts).toBe(0);
    expect(limpio.lockLevel).toBe(0);
    expect(limpio.lockedUntil).toBeNull();
  });
});

describe('R25 — tras el desbloqueo, el siguiente fallo cuenta como el primero', () => {
  it('un fallo sobre el estado limpio no rebloquea y arranca una serie nueva', () => {
    const trasElFallo = nextLockState(clearedLockState(), 'failure', AHORA);

    expect(trasElFallo.failedAttempts).toBe(1);
    expect(trasElFallo.lockedUntil).toBeNull();
    expect(accountStatusAfterAttempt('active', trasElFallo)).toBeNull();
  });

  it('hacen falta otros cinco fallos para volver a bloquear', () => {
    let estado = clearedLockState();

    for (let intento = 1; intento < MAX_FAILED_ATTEMPTS; intento += 1) {
      estado = nextLockState(estado, 'failure', AHORA);
      expect(estado.lockedUntil).toBeNull();
    }

    estado = nextLockState(estado, 'failure', AHORA);

    expect(estado.lockedUntil).toEqual(new Date(AHORA.getTime() + LOCK_DURATIONS_MS[0]));
  });
});
