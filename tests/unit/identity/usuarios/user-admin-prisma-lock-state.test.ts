// QC-95 R3 (T2) — `applyGuardedChange` escribe el estado y los tres contadores en UN SOLO `data`.
//
// La integracion (`tests/integration/identity/session-stamp-writes.int.test.ts`) relee la fila y
// prueba el RESULTADO, pero no distingue «una escritura» de «dos `updateMany` seguidos en la misma
// transaccion»: los dos dejan la misma fila. Eso solo se ve mirando las llamadas al cliente, y es lo
// que hace este archivo con un DOBLE de Prisma (mismo patron que
// `tests/unit/identity/credencial/credential-setup-link-prisma.test.ts`).
//
// El doble finge el CONTRATO del cliente, no Postgres: `$transaction(cb)` invoca `cb(tx)`,
// `tx.$queryRaw` es el `SELECT ... FOR UPDATE` de los administradores activos y `tx.user.updateMany`
// la escritura. `tx` no tiene nada mas: si el adaptador pidiera otro metodo, el caso cae.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { applyGuardedChange } from '@/lib/modules/identity/adapters/driven/persistence/user-admin-prisma';
import { clearedLockState } from '@/lib/modules/identity/domain/effective-account-status';
import { ROLE_ADMINISTRADOR } from '@/lib/modules/identity/domain/roles';

import type { AccountLockState } from '@/lib/modules/identity/domain/account-lock';
import type { UserAccountStatus } from '@/lib/modules/identity/domain/account-status';

const doble = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock('@/lib/shared/db/prisma', () => {
  const tx = {
    user: { updateMany: doble.updateMany },
    $queryRaw: doble.queryRaw,
  };
  return {
    prisma: {
      $transaction: async (run: (client: typeof tx) => Promise<unknown>): Promise<unknown> => run(tx),
    },
  };
});

const EMPRESA = '99999999-9999-4999-8999-999999999999';
const OBJETIVO = '22222222-2222-4222-8222-222222222222';
const ACTOR = '11111111-1111-4111-8111-111111111111';
/** Otro administrador activo: el objetivo NO esta en el conjunto, asi que nunca salta R22. */
const OTRO_ADMINISTRADOR = '33333333-3333-4333-8333-333333333333';
const AHORA = new Date('2026-09-15T12:00:00.000Z');

const CONTADORES = ['failedLoginAttempts', 'lockLevel', 'lockedUntil'] as const;

function cambio(accountStatus: UserAccountStatus, lockState: AccountLockState | null) {
  return {
    kind: 'account_status',
    companyId: EMPRESA,
    id: OBJETIVO,
    adminRoleName: ROLE_ADMINISTRADOR,
    now: AHORA,
    accountStatus,
    changedBy: ACTOR,
    lockState,
  } as const;
}

/** El UNICO `data` escrito. Falla si hubo cero escrituras o mas de una. */
function unicoData(): Record<string, unknown> {
  expect(doble.updateMany).toHaveBeenCalledTimes(1);
  const [argumento] = doble.updateMany.mock.calls[0] ?? [];
  expect(argumento).toMatchObject({ where: { id: OBJETIVO, companyId: EMPRESA, deletedAt: null } });
  return (argumento as { data: Record<string, unknown> }).data;
}

beforeEach(() => {
  vi.clearAllMocks();
  doble.queryRaw.mockResolvedValue([{ id: OTRO_ADMINISTRADOR }]);
  doble.updateMany.mockResolvedValue({ count: 1 });
});

describe('QC-95 R3 — el estado y los contadores van en la MISMA escritura', () => {
  it.each(['active', 'pending', 'inactive'] as const)(
    'R3 — destino `%s` con `clearedLockState()`: un solo `updateMany` y su `data` lleva a la vez `accountStatus` y los tres contadores',
    async (destino) => {
      await expect(applyGuardedChange(cambio(destino, clearedLockState()))).resolves.toBe('ok');

      const data = unicoData();
      expect(data).toHaveProperty('accountStatus', destino);
      expect(data).toHaveProperty('failedLoginAttempts', 0);
      expect(data).toHaveProperty('lockLevel', 0);
      expect(data).toHaveProperty('lockedUntil', null);
    },
  );

  it('R3 — los valores de los contadores salen de `lockState`, no de un literal del adaptador', async () => {
    const plazo = new Date('2031-03-04T05:06:07.000Z');
    await applyGuardedChange(cambio('active', { failedAttempts: 2, lockLevel: 1, lockedUntil: plazo }));

    const data = unicoData();
    expect(data).toHaveProperty('accountStatus', 'active');
    expect(data).toHaveProperty('failedLoginAttempts', 2);
    expect(data).toHaveProperty('lockLevel', 1);
    expect(data).toHaveProperty('lockedUntil', plazo);
  });

  it('R2/R3 — destino `blocked` con `lockState` null: el `data` lleva `accountStatus` y NINGUNO de los tres contadores', async () => {
    await expect(applyGuardedChange(cambio('blocked', null))).resolves.toBe('ok');

    const data = unicoData();
    expect(data).toHaveProperty('accountStatus', 'blocked');
    for (const contador of CONTADORES) {
      expect(data).not.toHaveProperty(contador);
    }
  });
});
