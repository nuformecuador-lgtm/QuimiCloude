// R28 (enmienda 2026-10-05) — solo entra en un grupo quien tiene estado EFECTIVO activo.
//
// El doble del puerto imita al adaptador: invoca el predicado `admits` que le pasa el caso de uso
// y solo «crea» si lo admite. Asi se prueba que la decision sale del dominio y llega ANTES de la
// escritura.

import { describe, expect, it, vi } from 'vitest';

import { createAddWorkGroupMember } from '@/lib/modules/identity/domain/add-work-group-member';
import {
  IdentityError,
  UnauthorizedError,
  ValidationError,
  WorkGroupMemberNotActiveError,
  WorkGroupMemberSelfError,
} from '@/lib/modules/identity/domain/errors';

import type { UserAccountStatus } from '@/lib/modules/identity/domain/account-status';
import type { Actor } from '@/lib/modules/identity/domain/actor';
import type {
  AddMemberOutcome,
  MemberCandidate,
  WorkGroupRepository,
} from '@/lib/modules/identity/ports/work-group-repository';

const COMPANY_ID = '99999999-9999-4999-8999-999999999999';
const GROUP_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';

const NOW = new Date('2026-10-05T12:00:00.000Z');
const VIGENTE = new Date('2026-10-05T12:15:00.000Z');
const VENCIDO = new Date('2026-10-05T11:45:00.000Z');

const actor: Actor = {
  id: '11111111-1111-4111-8111-111111111111',
  companyId: COMPANY_ID,
  permissions: ['usuarios.modificar'],
};

function cuenta(accountStatus: UserAccountStatus, lockedUntil: Date | null): MemberCandidate {
  return {
    id: USER_ID,
    firstNames: 'Ana',
    lastNames: 'Perez',
    username: 'aperez',
    accountStatus,
    lockedUntil,
  };
}

function dobles(account: MemberCandidate) {
  const escrituras: string[] = [];
  const addMemberAliveInCompany = vi.fn(
    async (
      _companyId: string,
      _id: string,
      userId: string,
      _now: Date,
      admits: (account: MemberCandidate) => boolean,
    ): Promise<AddMemberOutcome> => {
      if (!admits(account)) return { kind: 'not_admitted' };
      escrituras.push(userId);
      return { kind: 'created' };
    },
  );
  return {
    workGroups: { addMemberAliveInCompany } as unknown as WorkGroupRepository,
    addMemberAliveInCompany,
    escrituras,
  };
}

async function meter(account: MemberCandidate) {
  const d = dobles(account);
  const resultado = await createAddWorkGroupMember({ workGroups: d.workGroups, now: () => NOW })(
    actor,
    { workGroupId: GROUP_ID, userId: USER_ID },
  ).then(
    () => null,
    (error: unknown) => error,
  );
  return { resultado, ...d };
}

describe('R28 (enmienda 2026-10-05) — meter exige estado EFECTIVO activo', () => {
  const rechazadas: ReadonlyArray<{ caso: string; account: MemberCandidate }> = [
    { caso: 'pendiente', account: cuenta('pending', null) },
    { caso: 'inactiva', account: cuenta('inactive', null) },
    { caso: 'bloqueada sin plazo', account: cuenta('blocked', null) },
    { caso: 'bloqueada con plazo vigente', account: cuenta('blocked', VIGENTE) },
    { caso: "columna 'active' con plazo vigente", account: cuenta('active', VIGENTE) },
    { caso: 'pendiente con plazo vencido', account: cuenta('pending', VENCIDO) },
  ];

  for (const { caso, account } of rechazadas) {
    it(`R28 — ${caso}: \`work_group_member_not_active\` y ninguna fila`, async () => {
      const { resultado, escrituras, addMemberAliveInCompany } = await meter(account);

      expect(resultado).toBeInstanceOf(WorkGroupMemberNotActiveError);
      expect((resultado as IdentityError).code).toBe('work_group_member_not_active');
      expect(escrituras).toEqual([]);
      expect(addMemberAliveInCompany).toHaveBeenCalledTimes(1);
    });
  }

  const admitidas: ReadonlyArray<{ caso: string; account: MemberCandidate }> = [
    { caso: 'activa', account: cuenta('active', null) },
    { caso: 'activa con plazo vencido', account: cuenta('active', VENCIDO) },
    { caso: 'bloqueada con plazo YA vencido', account: cuenta('blocked', VENCIDO) },
  ];

  for (const { caso, account } of admitidas) {
    it(`R28 — ${caso}: entra`, async () => {
      const { resultado, escrituras } = await meter(account);

      expect(resultado).toBeNull();
      expect(escrituras).toEqual([USER_ID]);
    });
  }

  it('R28 — el predicado se evalua con el MISMO instante que se pasa al puerto', async () => {
    const { addMemberAliveInCompany } = await meter(cuenta('blocked', VIGENTE));
    const [, , , instante, admits] = addMemberAliveInCompany.mock.calls[0] ?? [];

    expect(instante).toBe(NOW);
    // Un milisegundo despues del plazo la misma cuenta ya estaria admitida: el predicado no usa
    // otro reloj que el de la llamada.
    expect(admits?.(cuenta('blocked', new Date(NOW.getTime() - 1)))).toBe(true);
    expect(admits?.(cuenta('blocked', new Date(NOW.getTime() + 1)))).toBe(false);
  });

  it('R28 — `not_active` no comparte `code` con ninguno de los de «ya pertenece»', () => {
    expect(new WorkGroupMemberNotActiveError().code).not.toMatch(/^work_group_member_exists/);
  });
});

describe('enmienda 2026-10-05 — nadie puede meterse a si mismo en un grupo', () => {
  async function meterseASiMismo(quien: Actor | null, entrada: unknown) {
    const d = dobles(cuenta('active', null));
    const resultado = await createAddWorkGroupMember({ workGroups: d.workGroups, now: () => NOW })(
      quien,
      entrada,
    ).then(
      () => null,
      (error: unknown) => error,
    );
    return { resultado, ...d };
  }

  it('el actor que se mete a si mismo recibe `work_group_member_self` y el puerto no se toca', async () => {
    const { resultado, addMemberAliveInCompany, escrituras } = await meterseASiMismo(actor, {
      workGroupId: GROUP_ID,
      userId: actor.id,
    });

    expect(resultado).toBeInstanceOf(WorkGroupMemberSelfError);
    expect((resultado as IdentityError).code).toBe('work_group_member_self');
    expect(addMemberAliveInCompany).not.toHaveBeenCalled();
    expect(escrituras).toEqual([]);
  });

  it('el permiso va antes: sin `usuarios.modificar` el rechazo es `unauthorized`, no `self`', async () => {
    const { resultado } = await meterseASiMismo(
      { ...actor, permissions: ['usuarios.consultar'] },
      { workGroupId: GROUP_ID, userId: actor.id },
    );
    expect(resultado).toBeInstanceOf(UnauthorizedError);
  });

  it('zod va antes: una entrada mal formada es `invalid_input`, no `self`', async () => {
    const { resultado } = await meterseASiMismo(actor, { workGroupId: 'no-es-uuid', userId: actor.id });
    expect(resultado).toBeInstanceOf(ValidationError);
  });

  it('meter a OTRA persona sigue funcionando', async () => {
    const { resultado, escrituras } = await meterseASiMismo(actor, {
      workGroupId: GROUP_ID,
      userId: USER_ID,
    });
    expect(resultado).toBeNull();
    expect(escrituras).toEqual([USER_ID]);
  });
});
