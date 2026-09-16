// QC-95 R6 — el estado limpio sale de `clearedLockState()` y de NINGUN otro sitio.
//
// POR QUE UN ARCHIVO APARTE: `vi.mock` es por archivo. Aqui `clearedLockState` se SUSTITUYE por un
// doble, y meterlo en `set-user-account-status-lock.test.ts` cambiaria el significado de los casos
// que ya viven alli (que comparan contra la funcion real).
//
// POR QUE UN CENTINELA Y `toBe`: el caso R1 del archivo hermano compara `lockState` con
// `toEqual(clearedLockState())`, o sea POR VALOR. Un caso de uso que escribiera a mano
// `{ failedAttempts: 0, lockLevel: 0, lockedUntil: null }` —justo lo que R6 prohibe— lo deja verde.
// Aqui el doble devuelve un objeto CONGELADO con valores imposibles (negativos, plazo en 1900): la
// unica forma de que el puerto reciba ESE objeto (`toBe`, identidad) es que el caso de uso lo haya
// pedido al doble. Ni un literal ni una copia por valor encajan.
//
// COMO SE SABE QUE EL MOCK INTERCEPTA EL IMPORT RELATIVO: el caso de uso importa
// `./effective-account-status` y aqui se mockea por alias. Vitest mockea por archivo RESUELTO, y el
// propio test lo demuestra: si no interceptara, el doble tendria cero llamadas y los casos `active`,
// `pending` e `inactive` caerian en `toHaveBeenCalledTimes(1)`.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createSetUserAccountStatus } from '@/lib/modules/identity/domain/set-user-account-status';

import type { AccountLockState } from '@/lib/modules/identity/domain/account-lock';
import type { Actor } from '@/lib/modules/identity/domain/actor';
import type {
  GuardedChange,
  UserAdminRepository,
} from '@/lib/modules/identity/ports/user-admin-repository';

const doble = vi.hoisted(() => {
  const centinela = Object.freeze({
    failedAttempts: -9_999,
    lockLevel: -9_999,
    lockedUntil: new Date('1900-01-01T00:00:00.000Z'),
  });
  return {
    centinela,
    clearedLockState: vi.fn<() => AccountLockState>(() => centinela),
  };
});

vi.mock('@/lib/modules/identity/domain/effective-account-status', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@/lib/modules/identity/domain/effective-account-status')>();
  return { ...original, clearedLockState: doble.clearedLockState };
});

const ACTOR: Actor = {
  id: '11111111-1111-4111-8111-111111111111',
  companyId: '99999999-9999-4999-8999-999999999999',
  permissions: ['usuarios.consultar', 'usuarios.modificar'],
};
const OTRO_ID = '22222222-2222-4222-8222-222222222222';
const AHORA = new Date('2026-09-15T12:00:00.000Z');

type CambioAccountStatus = Extract<GuardedChange, { kind: 'account_status' }>;

async function cambioPedido(
  accountStatus: CambioAccountStatus['accountStatus'],
): Promise<CambioAccountStatus> {
  const users = {
    create: vi.fn<UserAdminRepository['create']>(),
    findAliveInCompany: vi.fn<UserAdminRepository['findAliveInCompany']>(),
    listAliveInCompany: vi.fn<UserAdminRepository['listAliveInCompany']>(),
    updateAliveInCompany: vi.fn<UserAdminRepository['updateAliveInCompany']>(async () => 'ok'),
    applyGuardedChange: vi.fn<UserAdminRepository['applyGuardedChange']>(async () => 'ok'),
  } satisfies UserAdminRepository;

  await createSetUserAccountStatus({ users, now: () => AHORA })(ACTOR, OTRO_ID, { accountStatus });

  expect(users.applyGuardedChange).toHaveBeenCalledTimes(1);
  const [cambio] = users.applyGuardedChange.mock.calls[0] ?? [];
  if (cambio?.kind !== 'account_status') {
    throw new Error('el caso de uso no pidio un cambio de tipo `account_status`');
  }
  return cambio;
}

beforeEach(() => {
  // `mockClear` y no `mockReset`: se borran las llamadas del caso anterior, pero el doble sigue
  // devolviendo el centinela.
  doble.clearedLockState.mockClear();
});

describe('QC-95 R6 — el caso de uso obtiene el estado limpio llamando a `clearedLockState()`', () => {
  it('control: el centinela no se parece a ningun estado limpio real', async () => {
    const real = await vi.importActual<
      typeof import('@/lib/modules/identity/domain/effective-account-status')
    >('@/lib/modules/identity/domain/effective-account-status');

    // Si el centinela fuera igual por valor al estado real, el `toBe` de abajo seguiria siendo
    // estricto, pero este control deja por escrito que ni un `toEqual` accidental los confunde.
    expect(doble.centinela).not.toEqual(real.clearedLockState());
    expect(Object.isFrozen(doble.centinela)).toBe(true);
  });

  it.each(['active', 'pending', 'inactive'] as const)(
    'R6 — destino `%s`: se llama a `clearedLockState()` una vez y el puerto recibe ESE MISMO objeto',
    async (destino) => {
      const cambio = await cambioPedido(destino);

      expect(cambio.accountStatus).toBe(destino);
      expect(doble.clearedLockState).toHaveBeenCalledTimes(1);
      // Identidad, no valor: un literal `{ 0, 0, null }` escrito en el caso de uso no es este objeto.
      expect(cambio.lockState).toBe(doble.centinela);
    },
  );

  it('R6/R2 — destino `blocked`: `clearedLockState()` NO se llama y `lockState` es `null`', async () => {
    const cambio = await cambioPedido('blocked');

    expect(cambio.accountStatus).toBe('blocked');
    expect(doble.clearedLockState).not.toHaveBeenCalled();
    expect(cambio.lockState).toBeNull();
  });
});
