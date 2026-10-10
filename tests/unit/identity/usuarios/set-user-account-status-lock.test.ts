// QC-95 T4 — el caso de uso decide por el DESTINO y pasa `lockState` al puerto (R1, R2, R4), y una
// cuenta que sale de `blocked` por esta via cuenta su siguiente fallo como el primero (R5).
//
// Lo que este nivel puede afirmar: que `applyGuardedChange` recibe el estado de bloqueo que le toca
// segun el destino. Que esos valores caen en la MISMA escritura sobre la fila (R3) no se demuestra
// con un doble del puerto: el `data` del `updateMany` lo afirma
// `tests/unit/identity/usuarios/user-admin-prisma-lock-state.test.ts`, y la fila releida contra
// Postgres real (incluido el aborto) `tests/integration/identity/session-stamp-writes.int.test.ts`.
//
// Que el estado limpio sale de LLAMAR a `clearedLockState()` y no de un literal (R6) tampoco se
// demuestra aqui: los casos de abajo comparan POR VALOR y un literal `{ 0, 0, null }` los dejaria
// verdes. Eso lo ata `set-user-account-status-cleared-lock-state.test.ts`, con un doble y `toBe`.
//
// Tres aserciones por cada caso de destino: el destino correcto, el `lockState` que corresponde, y
// que el puerto NO leyo el estado actual del objetivo (R4) — `findAliveInCompany` no se llama: la
// decision vive entera en el dato de entrada.
//
// R5 va ENCADENADO con dobles en memoria y sin base: una fila `blocked` con plazo futuro pasa por
// este caso de uso (con un `applyGuardedChange` que aplica el cambio sobre ESA fila) y despues por
// el login real del dominio (`createVerifyCredentials`) leyendo la misma fila.

import { describe, expect, it, vi } from 'vitest';

import { clearedLockState } from '@/lib/modules/identity/domain/effective-account-status';
import { createSetUserAccountStatus } from '@/lib/modules/identity/domain/set-user-account-status';
import { createVerifyCredentials } from '@/lib/modules/identity/domain/verify-credentials';

import type { Actor } from '@/lib/modules/identity/domain/actor';
import type { LoginAttemptRecorder } from '@/lib/modules/identity/ports/login-attempt-recorder';
import type { PasswordHasher } from '@/lib/modules/identity/ports/password-hasher';
import type { SessionIdFactory } from '@/lib/modules/identity/ports/session-id-factory';
import type { SessionWriter } from '@/lib/modules/identity/ports/session-writer';
import type { AuthenticatableUser } from '@/lib/modules/identity/ports/user-credentials-reader';
import type { GuardedChange } from '@/lib/modules/identity/ports/user-admin-repository';
import type { UserAdminRepository } from '@/lib/modules/identity/ports/user-admin-repository';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const COMPANY_ID = '99999999-9999-4999-8999-999999999999';
const OTRO_ID = '22222222-2222-4222-8222-222222222222';
const AHORA = new Date('2026-09-10T15:00:00.000Z');

const ACTOR: Actor = {
  id: ACTOR_ID,
  companyId: COMPANY_ID,
  permissions: ['usuarios.consultar', 'usuarios.modificar'],
};

const now = () => AHORA;

/** Dobles que ACEPTAN: sirven para leer QUE se le pidio al puerto, incluido `lockState`. */
function doblesQueAceptan() {
  return {
    create: vi.fn<UserAdminRepository['create']>(),
    findAliveInCompany: vi.fn<UserAdminRepository['findAliveInCompany']>(),
    listAliveInCompany: vi.fn<UserAdminRepository['listAliveInCompany']>(),
    updateAliveInCompany: vi.fn<UserAdminRepository['updateAliveInCompany']>(async () => 'ok'),
    applyGuardedChange: vi.fn<UserAdminRepository['applyGuardedChange']>(async () => 'ok'),
  } satisfies UserAdminRepository;
}

type CambioAccountStatus = Extract<GuardedChange, { kind: 'account_status' }>;

async function cambioPedido(
  accountStatus: 'active' | 'pending' | 'inactive' | 'blocked',
): Promise<{ users: ReturnType<typeof doblesQueAceptan>; cambio: CambioAccountStatus }> {
  const users = doblesQueAceptan();
  await createSetUserAccountStatus({ users, now })(ACTOR, OTRO_ID, { accountStatus });
  const [cambio] = users.applyGuardedChange.mock.calls[0] ?? [];
  expect(cambio.kind).toBe('account_status');
  return { users, cambio: cambio as CambioAccountStatus };
}

describe('QC-95 — al mover el estado se limpian los contadores segun el DESTINO (R1, R2, R4)', () => {
  it('R1 — destino `active`: el puerto recibe `lockState` IGUAL a `clearedLockState()`', async () => {
    const { users, cambio } = await cambioPedido('active');

    expect(cambio.accountStatus).toBe('active');
    // Comparacion por VALOR: prueba QUE estado viaja, no DE DONDE sale. El «de donde» (R6) lo ata
    // `set-user-account-status-cleared-lock-state.test.ts`.
    expect(cambio.lockState).toEqual(clearedLockState());
    expect(cambio.lockState).toEqual({ failedAttempts: 0, lockLevel: 0, lockedUntil: null });

    // R4: la decision no leyo el estado actual del objetivo.
    expect(users.findAliveInCompany).not.toHaveBeenCalled();
  });

  it('R4 — destino `pending`: idem (la decision es por el destino, no por el estado actual)', async () => {
    const { users, cambio } = await cambioPedido('pending');

    expect(cambio.accountStatus).toBe('pending');
    expect(cambio.lockState).toEqual(clearedLockState());
    expect(users.findAliveInCompany).not.toHaveBeenCalled();
  });

  it('R2 — destino `blocked`: `lockState` va `null` y no se escribe ningun contador', async () => {
    const { users, cambio } = await cambioPedido('blocked');

    expect(cambio.accountStatus).toBe('blocked');
    expect(cambio.lockState).toBeNull();
    expect(users.findAliveInCompany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------
// R5 — encadenado: desbloqueo administrativo -> login con contrasena incorrecta
// ---------------------------------------------------------------------------------------------

/** Marcador ficticio de la credencial de la fila. No es la de nadie. */
const CLAVE_DE_PRUEBA = 'clave-de-prueba-qc95';
const NOMBRE_DE_USUARIO = 'persona.qc95';

function hashDe(texto: string): string {
  return `hash:${texto}`;
}

/**
 * La fila que dejo la politica de intentos: `blocked`, nivel de escalada alto, contador casi en el
 * umbral y un plazo muy lejano. Sin limpiar, el login la rechaza; limpiando solo el plazo, el
 * siguiente fallo la rebloquearia con la duracion escalada.
 */
function filaBloqueada(): AuthenticatableUser {
  return {
    id: OTRO_ID,
    passwordHash: hashDe(CLAVE_DE_PRUEBA),
    roleName: 'rol-de-prueba-qc95',
    companyId: COMPANY_ID,
    companyDeletedAt: null,
    accountStatus: 'blocked',
    sessionsValidFrom: new Date('2026-01-01T00:00:00.000Z'),
    failedAttempts: 4,
    lockLevel: 3,
    lockedUntil: new Date('2099-01-01T00:00:00.000Z'),
  };
}

/**
 * UNA fila en memoria compartida por los dos casos de uso: `applyGuardedChange` le aplica el
 * cambio pedido (estado y, si llega, el `lockState`, igual que el `data` condicional del
 * adaptador) y `findActiveByUsername` la devuelve tal como quedo.
 */
function escenarioEnMemoria(inicial: AuthenticatableUser) {
  let fila = inicial;

  const users = doblesQueAceptan();
  users.applyGuardedChange.mockImplementation(async (cambio) => {
    if (cambio.kind !== 'account_status' || cambio.id !== fila.id) return 'not_found';
    fila = { ...fila, accountStatus: cambio.accountStatus, ...(cambio.lockState ?? {}) };
    return 'ok';
  });

  const attempts = {
    compareAndSet: vi.fn<LoginAttemptRecorder['compareAndSet']>(async () => true),
    set: vi.fn<LoginAttemptRecorder['set']>(async () => {}),
  } satisfies LoginAttemptRecorder;
  const hasher = {
    hash: vi.fn<PasswordHasher['hash']>(async (texto) => hashDe(texto)),
    verify: vi.fn<PasswordHasher['verify']>(async (texto, guardado) => guardado === hashDe(texto)),
  } satisfies PasswordHasher;
  const session = {
    startSession: vi.fn<SessionWriter['startSession']>(async () => {}),
  } satisfies SessionWriter;
  const ids = {
    newSessionId: vi.fn<SessionIdFactory['newSessionId']>(() => '00000000-0000-4000-8000-000000000001'),
  } satisfies SessionIdFactory;

  const verifyCredentials = createVerifyCredentials({
    users: {
      findActiveByUsername: async (username) => (username === NOMBRE_DE_USUARIO ? fila : null),
    },
    attempts,
    hasher,
    session,
    ids,
  });

  return {
    fila: () => fila,
    setUserAccountStatus: createSetUserAccountStatus({ users, now }),
    verifyCredentials,
    attempts,
    session,
  };
}

describe('QC-95 R5 — tras salir de `blocked` por el caso de uso, el siguiente fallo cuenta como el primero', () => {
  it('control: la MISMA fila, sin pasar por el caso de uso, el login la trata como bloqueada', async () => {
    const escenario = escenarioEnMemoria(filaBloqueada());

    // Ni con la contrasena CORRECTA entra, y un fallo no escribe nada: el corte por estado efectivo
    // va antes de registrar el fallo. Sin este control, el encadenado de abajo podria pasar por una
    // razon equivocada (p. ej. una fila que ya no estuviera bloqueada).
    await expect(
      escenario.verifyCredentials({ username: NOMBRE_DE_USUARIO, password: CLAVE_DE_PRUEBA }),
    ).resolves.toEqual({ ok: false });
    await expect(
      escenario.verifyCredentials({ username: NOMBRE_DE_USUARIO, password: 'incorrecta' }),
    ).resolves.toEqual({ ok: false });

    expect(escenario.session.startSession).not.toHaveBeenCalled();
    expect(escenario.attempts.compareAndSet).not.toHaveBeenCalled();
    expect(escenario.attempts.set).not.toHaveBeenCalled();
  });

  it('R5 — `blocked` -> `active` por el caso de uso, y un fallo de login registra `failedAttempts = 1` sin rebloquear', async () => {
    const escenario = escenarioEnMemoria(filaBloqueada());

    await escenario.setUserAccountStatus(ACTOR, OTRO_ID, { accountStatus: 'active' });
    expect(escenario.fila().accountStatus).toBe('active');

    await expect(
      escenario.verifyCredentials({ username: NOMBRE_DE_USUARIO, password: 'incorrecta' }),
    ).resolves.toEqual({ ok: false });

    // El fallo SE REGISTRA (la cuenta ya no esta efectivamente bloqueada) y es el PRIMERO de una
    // serie nueva: contador 1, nivel 0, sin plazo, y ningun estado de cuenta que escribir.
    expect(escenario.attempts.compareAndSet).toHaveBeenCalledTimes(1);
    const [userId, , siguiente, , , estadoCuenta] = escenario.attempts.compareAndSet.mock.calls[0] ?? [];
    expect(userId).toBe(OTRO_ID);
    expect(siguiente).toEqual({ failedAttempts: 1, lockLevel: 0, lockedUntil: null });
    expect(estadoCuenta).toBeNull();
  });
});
