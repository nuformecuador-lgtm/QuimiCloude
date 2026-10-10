// tests/unit/asignaciones/list-conditioning-team-candidates.test.ts
// Las personas y los grupos que ofrece el modal de Acondicionar, con dobles de los dos
// directorios de `identity`.
import { describe, expect, it, vi } from 'vitest';

import type { Actor } from '@/lib/modules/asignaciones/domain/actor';
import { UnauthorizedError, ValidationError } from '@/lib/modules/asignaciones/domain/errors';
import {
  createListConditioningTeamCandidates,
  type ListConditioningTeamCandidatesDeps,
} from '@/lib/modules/asignaciones/domain/list-conditioning-team-candidates';
import { MAX_CANDIDATES } from '@/lib/modules/asignaciones/domain/list-responsible-candidates';
import {
  ACTIVE_ACCOUNTS_ONLY,
  ROLE_ACONDICIONAMIENTO,
  ROLE_ADMINISTRADOR,
  ROLE_EMPACADOR,
  ROLE_OPERADOR,
  SEED_ROLE_PERMISSIONS,
  type PeopleDirectory,
  type PersonRef,
  type WorkGroupDirectory,
  type WorkGroupSnapshot,
} from '@/lib/modules/identity';

function uuid(seed: string): string {
  return `${seed.repeat(8)}-${seed.repeat(4)}-4${seed.repeat(3)}-8${seed.repeat(3)}-${seed.repeat(12)}`;
}

const EMPRESA = uuid('3');
const ANA = uuid('1');
const BETO = uuid('2');
const CARLA = uuid('4');
const DIEGO = uuid('5');
const ELENA = uuid('6');
const GRUPO_A = uuid('8');
const GRUPO_B = uuid('9');
const GRUPO_C = uuid('a');
const AHORA = new Date('2026-10-08T10:00:00.000Z');

const ACONDICIONADOR: Actor = {
  id: ANA,
  companyId: EMPRESA,
  permissions: SEED_ROLE_PERMISSIONS[ROLE_ACONDICIONAMIENTO]!,
};

function persona(id: string, displayName: string, overrides?: Partial<PersonRef>): PersonRef {
  return { id, displayName, isActive: true, permissions: SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]!, ...overrides };
}

const ADMINISTRADOR: Partial<PersonRef> = { permissions: SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]! };

function montar(opciones: {
  readonly people?: readonly PersonRef[];
  readonly groups?: readonly WorkGroupSnapshot[];
  readonly members?: readonly PersonRef[];
} = {}) {
  const listAliveInCompany = vi.fn(async () => opciones.people ?? []);
  const findAliveRefsInCompany = vi.fn(async (_c: string, ids: readonly string[]) =>
    (opciones.members ?? []).filter((person) => ids.includes(person.id)),
  );
  const listSnapshotsAliveInCompany = vi.fn(async () => opciones.groups ?? []);
  const findSnapshotAliveInCompany = vi.fn();
  const deps: ListConditioningTeamCandidatesDeps = {
    people: { listAliveInCompany, findAliveRefsInCompany } as unknown as PeopleDirectory,
    groups: { listSnapshotsAliveInCompany, findSnapshotAliveInCompany } as unknown as WorkGroupDirectory,
    now: () => AHORA,
  };
  return {
    listar: createListConditioningTeamCandidates(deps),
    listAliveInCompany,
    findAliveRefsInCompany,
    listSnapshotsAliveInCompany,
    todos: [listAliveInCompany, findAliveRefsInCompany, listSnapshotsAliveInCompany, findSnapshotAliveInCompany],
  };
}

describe('listConditioningTeamCandidates — autorizacion (R30)', () => {
  const sinPermiso: ReadonlyArray<readonly [string, Actor | null | undefined]> = [
    ['nulo', null],
    ['ausente', undefined],
    ['sin permisos', { id: ANA, companyId: EMPRESA, permissions: [] }],
    ['Administrador de semilla', { id: ANA, companyId: EMPRESA, permissions: SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]! }],
    ['Operador de semilla', { id: ANA, companyId: EMPRESA, permissions: SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]! }],
    ['Empacador de semilla', { id: ANA, companyId: EMPRESA, permissions: SEED_ROLE_PERMISSIONS[ROLE_EMPACADOR]! }],
  ];

  it.each(sinPermiso)('R30: actor %s -> unauthorized antes de zod y sin tocar ningun puerto', async (_n, actor) => {
    const m = montar();

    await expect(m.listar(actor, { extra: 'entrada invalida' })).rejects.toBeInstanceOf(UnauthorizedError);
    for (const doble of m.todos) expect(doble).not.toHaveBeenCalled();
  });

  it('R30: no exige asignaciones.modificar ni usuarios.consultar: basta el permiso de acondicionamiento', async () => {
    const m = montar();
    const actor: Actor = { id: ANA, companyId: EMPRESA, permissions: ['acondicionamiento.modificar'] };

    await expect(m.listar(actor, {})).resolves.toEqual({ people: [], workGroups: [] });
  });

  it('R30: con el permiso, una entrada con claves -> invalid_input sin tocar ningun puerto', async () => {
    const m = montar();

    await expect(m.listar(ACONDICIONADOR, { companyId: EMPRESA })).rejects.toBeInstanceOf(ValidationError);
    for (const doble of m.todos) expect(doble).not.toHaveBeenCalled();
  });
});

describe('listConditioningTeamCandidates — personas (R6, D13)', () => {
  it('R6: ofrece solo personas elegibles: ni Administradores ni cuentas inactivas', async () => {
    const m = montar({
      people: [
        persona(ANA, 'Ana', { permissions: SEED_ROLE_PERMISSIONS[ROLE_ACONDICIONAMIENTO]! }),
        persona(BETO, 'Beto', ADMINISTRADOR),
        persona(CARLA, 'Carla'),
        persona(DIEGO, 'Diego', { isActive: false }),
      ],
    });

    const { people } = await m.listar(ACONDICIONADOR, {});

    expect(people).toEqual([
      { id: ANA, displayName: 'Ana' },
      { id: CARLA, displayName: 'Carla' },
    ]);
  });

  it('R6, D13: pide a identity la empresa del actor, el instante, el tope heredado y solo cuentas activas', async () => {
    const m = montar();

    await m.listar(ACONDICIONADOR, {});

    expect(MAX_CANDIDATES).toBe(25);
    expect(m.listAliveInCompany).toHaveBeenCalledWith(EMPRESA, AHORA, MAX_CANDIDATES, ACTIVE_ACCOUNTS_ONLY);
    expect(m.listSnapshotsAliveInCompany).toHaveBeenCalledWith(EMPRESA, AHORA, MAX_CANDIDATES);
  });

  it('D13: el tope se aplica antes de filtrar: con 25 filas y un Administrador, salen 24 en el mismo orden', async () => {
    const filas = Array.from({ length: MAX_CANDIDATES }, (_v, i) =>
      persona(`p-${String(i).padStart(2, '0')}`, `Persona ${i}`, i === 3 ? ADMINISTRADOR : undefined),
    );
    const m = montar({ people: filas });

    const { people } = await m.listar(ACONDICIONADOR, {});

    expect(people).toHaveLength(MAX_CANDIDATES - 1);
    expect(people.map((p) => p.id)).toEqual(filas.filter((_f, i) => i !== 3).map((f) => f.id));
  });
});

describe('listConditioningTeamCandidates — grupos (R7)', () => {
  it('R7: cada grupo con contributes y excludedAdministrators, en el orden de identity', async () => {
    const m = montar({
      groups: [
        { id: GRUPO_A, name: 'Turno manana', activeMemberIds: [BETO, CARLA, DIEGO] },
        { id: GRUPO_B, name: 'Turno tarde', activeMemberIds: [CARLA, ELENA] },
      ],
      members: [persona(BETO, 'Beto', ADMINISTRADOR), persona(CARLA, 'Carla'), persona(DIEGO, 'Diego'), persona(ELENA, 'Elena', ADMINISTRADOR)],
    });

    const { workGroups } = await m.listar(ACONDICIONADOR, {});

    expect(workGroups).toEqual([
      { id: GRUPO_A, name: 'Turno manana', contributes: 2, excludedAdministrators: 1 },
      { id: GRUPO_B, name: 'Turno tarde', contributes: 1, excludedAdministrators: 1 },
    ]);
  });

  it('R7: un grupo de solo Administradores aporta 0 y los cuenta como excluidos', async () => {
    const m = montar({
      groups: [{ id: GRUPO_C, name: 'Direccion', activeMemberIds: [BETO, ELENA] }],
      members: [persona(BETO, 'Beto', ADMINISTRADOR), persona(ELENA, 'Elena', ADMINISTRADOR)],
    });

    const { workGroups } = await m.listar(ACONDICIONADOR, {});

    expect(workGroups).toEqual([{ id: GRUPO_C, name: 'Direccion', contributes: 0, excludedAdministrators: 2 }]);
  });

  it('R7: un miembro con la cuenta no activa no aporta ni cuenta como Administrador excluido', async () => {
    const m = montar({
      groups: [{ id: GRUPO_A, name: 'Turno', activeMemberIds: [BETO, CARLA] }],
      members: [persona(BETO, 'Beto', { ...ADMINISTRADOR, isActive: false }), persona(CARLA, 'Carla', { isActive: false })],
    });

    const { workGroups } = await m.listar(ACONDICIONADOR, {});

    expect(workGroups).toEqual([{ id: GRUPO_A, name: 'Turno', contributes: 0, excludedAdministrators: 0 }]);
  });

  it('R7: una sola lectura de personas para todos los miembros, sin repetidos', async () => {
    const m = montar({
      groups: [
        { id: GRUPO_A, name: 'A', activeMemberIds: [BETO, CARLA] },
        { id: GRUPO_B, name: 'B', activeMemberIds: [CARLA, DIEGO] },
      ],
      members: [persona(BETO, 'Beto'), persona(CARLA, 'Carla'), persona(DIEGO, 'Diego')],
    });

    await m.listar(ACONDICIONADOR, {});

    expect(m.findAliveRefsInCompany).toHaveBeenCalledTimes(1);
    expect(m.findAliveRefsInCompany).toHaveBeenCalledWith(EMPRESA, [BETO, CARLA, DIEGO], AHORA);
  });

  it('R7: sin grupos no consulta miembros', async () => {
    const m = montar();

    await m.listar(ACONDICIONADOR, {});

    expect(m.findAliveRefsInCompany).not.toHaveBeenCalled();
  });
});
