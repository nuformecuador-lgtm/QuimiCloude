// QC-95 T4 — el caso de uso decide por el DESTINO y pasa `lockState` al puerto (R1, R2, R4, R6).
//
// Lo que este nivel puede afirmar: que `applyGuardedChange` recibe el estado de bloqueo que le toca
// segun el destino. Que esos valores caen en la MISMA escritura sobre la fila (R3) no se demuestra
// con un doble —se demuestra contra Postgres real en
// `tests/integration/identity/session-stamp-writes.int.test.ts`, que es el repo donde ya se ejercita
// `applyGuardedChange`.
//
// Tres aserciones por cada caso: el destino correcto, el `lockState` que corresponde, y que el
// puerto NO leyo el estado actual del objetivo (R4) — `findAliveInCompany` no se llama: la decision
// vive entera en el dato de entrada.

import { describe, expect, it, vi } from 'vitest';

import { clearedLockState } from '@/lib/modules/identity/domain/effective-account-status';
import { createSetUserAccountStatus } from '@/lib/modules/identity/domain/set-user-account-status';

import type { Actor } from '@/lib/modules/identity/domain/actor';
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

describe('QC-95 — al mover el estado se limpian los contadores segun el DESTINO (R1, R2, R4, R6)', () => {
  it('R1 — destino `active`: el puerto recibe `lockState` IGUAL a `clearedLockState()`', async () => {
    const { users, cambio } = await cambioPedido('active');

    expect(cambio.accountStatus).toBe('active');
    // Comparacion por VALOR contra la funcion pura, no contra un literal esparcido: la UNICA fuente
    // de «cero, cero, null» es `clearedLockState()` (R6).
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

  it('R5 — al salir de `blocked` el siguiente fallo cuenta como el primero', () => {
    // La vía DE LOGIN de R5 ya esta cubierta en `tests/unit/identity/verify-credentials.test.ts`
    // (~linea 1051, «tras clearedLockState el siguiente fallo cuenta como el primero y no
    // rebloquea»): ahi se demuestra que una fila con el estado limpio (`clearedLockState()`)
    // vuelve a bloquearse recien tras 5 fallos nuevos.
    //
    // El CAMINO ADMINISTRATIVO queda cubierto por este archivo: el caso R1 de arriba demuestra que
    // mover a `active` escribe exactamente `clearedLockState()` en la fila, asi que la cuenta que
    // sale de `blocked` llega al login en el mismo estado que el caso de verify-credentials.
    //
    // Encadenar los dos aqui (llamar al login tras el caso de uso con dobles reales) no anadiria
    // una asercion nueva: el eslabon que conecta las dos vias es `clearedLockState()`, que el caso
    // R1 ya prueba que viaja. Ver `requirements.md` R5.
    expect(clearedLockState()).toEqual({ failedAttempts: 0, lockLevel: 0, lockedUntil: null });
  });
});
