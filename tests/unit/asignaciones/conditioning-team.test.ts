// tests/unit/asignaciones/conditioning-team.test.ts
// La entrada de Comenzar el acondicionamiento y la composicion pura del equipo.
import { describe, expect, it } from 'vitest';

import {
  composeConditioningTeam,
  startConditioningSchema,
} from '@/lib/modules/asignaciones/domain/conditioning-team';
import {
  ConditioningTeamEmptyError,
  ConditioningTeamMemberNotAllowedError,
  UserNotAssignableError,
  UserNotFoundError,
} from '@/lib/modules/asignaciones/domain/errors';
import { ROLE_ACONDICIONAMIENTO, ROLE_ADMINISTRADOR, ROLE_OPERADOR, SEED_ROLE_PERMISSIONS } from '@/lib/modules/identity';

import type { PersonRef, WorkGroupSnapshot } from '@/lib/modules/identity';

function uuid(seed: string): string {
  return `${seed.repeat(8)}-${seed.repeat(4)}-4${seed.repeat(3)}-8${seed.repeat(3)}-${seed.repeat(12)}`;
}

const EMPRESA = uuid('3');
const PEDIDO = uuid('7');
const ANA = uuid('1');
const BETO = uuid('2');
const CARLA = uuid('4');
const DIEGO = uuid('5');
const ELENA = uuid('6');
const GRUPO_A = uuid('8');
const GRUPO_B = uuid('9');

function persona(id: string, overrides?: Partial<PersonRef>): PersonRef {
  return { id, displayName: id, isActive: true, permissions: SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]!, ...overrides };
}

const ADMINISTRADOR: Partial<PersonRef> = { permissions: SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]! };

function grupo(id: string, name: string, activeMemberIds: readonly string[]): WorkGroupSnapshot {
  return { id, name, activeMemberIds };
}

describe('startConditioningSchema — la forma de la entrada (R18)', () => {
  it.each([
    ['sin userIds', { orderId: PEDIDO, workGroupIds: [GRUPO_A] }],
    ['sin workGroupIds', { orderId: PEDIDO, userIds: [ANA] }],
    ['sin orderId', { userIds: [ANA], workGroupIds: [] }],
    ['userIds que no es lista', { orderId: PEDIDO, userIds: ANA, workGroupIds: [] }],
    ['una persona repetida', { orderId: PEDIDO, userIds: [ANA, BETO, ANA], workGroupIds: [] }],
    ['un grupo repetido', { orderId: PEDIDO, userIds: [], workGroupIds: [GRUPO_A, GRUPO_A] }],
    ['las dos listas vacias', { orderId: PEDIDO, userIds: [], workGroupIds: [] }],
    ['un id que no es uuid', { orderId: PEDIDO, userIds: ['ana'], workGroupIds: [] }],
    ['orderId que no es uuid', { orderId: 'pedido', userIds: [ANA], workGroupIds: [] }],
    ['una clave de mas (companyId)', { orderId: PEDIDO, userIds: [ANA], workGroupIds: [], companyId: EMPRESA }],
    ['una clave de mas (workGroupName)', { orderId: PEDIDO, userIds: [], workGroupIds: [GRUPO_A], workGroupName: 'x' }],
  ])('R18: rechaza %s', (_n, entrada) => {
    expect(startConditioningSchema.safeParse(entrada).success).toBe(false);
  });

  it.each([
    ['solo personas', { orderId: PEDIDO, userIds: [ANA, BETO], workGroupIds: [] }],
    ['solo grupos', { orderId: PEDIDO, userIds: [], workGroupIds: [GRUPO_A] }],
    ['las dos', { orderId: PEDIDO, userIds: [ANA], workGroupIds: [GRUPO_A, GRUPO_B] }],
  ])('R18: acepta %s', (_n, entrada) => {
    expect(startConditioningSchema.safeParse(entrada)).toEqual({ success: true, data: entrada });
  });
});

describe('composeConditioningTeam — las sueltas se validan en el orden recibido (R16)', () => {
  it('R16: la persona que no vuelve de identity -> user_not_found', () => {
    expect(() => composeConditioningTeam(PEDIDO, EMPRESA, [persona(ANA)], [ANA, BETO], [], [])).toThrow(UserNotFoundError);
  });

  it('R16: la cuenta no activa -> user_not_assignable', () => {
    expect(() =>
      composeConditioningTeam(PEDIDO, EMPRESA, [persona(ANA, { isActive: false })], [ANA], [], []),
    ).toThrow(UserNotAssignableError);
  });

  it('R16: el Administrador (tiene pedidos.consultar) -> conditioning_team_member_not_allowed', () => {
    const error = (() => {
      try {
        composeConditioningTeam(PEDIDO, EMPRESA, [persona(ANA, ADMINISTRADOR)], [ANA], [], []);
      } catch (caught) {
        return caught;
      }
      return null;
    })();
    expect(error).toBeInstanceOf(ConditioningTeamMemberNotAllowedError);
    expect((error as ConditioningTeamMemberNotAllowedError).code).toBe('conditioning_team_member_not_allowed');
  });

  it('R16: gana el primer error en el orden de la entrada, no en el de la respuesta', () => {
    const respuesta = [persona(BETO, ADMINISTRADOR), persona(ANA, { isActive: false })];
    expect(() => composeConditioningTeam(PEDIDO, EMPRESA, respuesta, [ANA, BETO], [], [])).toThrow(
      UserNotAssignableError,
    );
    expect(() => composeConditioningTeam(PEDIDO, EMPRESA, respuesta, [BETO, ANA], [], [])).toThrow(
      ConditioningTeamMemberNotAllowedError,
    );
    expect(() => composeConditioningTeam(PEDIDO, EMPRESA, respuesta, [CARLA, BETO, ANA], [], [])).toThrow(
      UserNotFoundError,
    );
  });

  it('R16: el propio acondicionador y otros acondicionadores son elegibles', () => {
    const acondicionador: Partial<PersonRef> = { permissions: SEED_ROLE_PERMISSIONS[ROLE_ACONDICIONAMIENTO]! };
    const equipo = composeConditioningTeam(
      PEDIDO,
      EMPRESA,
      [persona(ANA, acondicionador), persona(BETO, acondicionador)],
      [ANA, BETO],
      [],
      [],
    );
    expect(equipo.map((fila) => fila.userId)).toEqual([ANA, BETO]);
  });
});

describe('composeConditioningTeam — los grupos omiten en silencio (R15)', () => {
  it('R15: los Administradores y los inactivos del grupo se omiten y el resto se guarda', () => {
    const miembros = [persona(BETO, ADMINISTRADOR), persona(CARLA), persona(DIEGO, { isActive: false }), persona(ELENA)];
    const equipo = composeConditioningTeam(
      PEDIDO,
      EMPRESA,
      [],
      [],
      [grupo(GRUPO_A, 'Turno manana', [BETO, CARLA, DIEGO, ELENA])],
      miembros,
    );
    expect(equipo.map((fila) => fila.userId)).toEqual([CARLA, ELENA]);
  });

  it('R15: un miembro que identity no devuelve (de baja o de otra empresa) se omite', () => {
    const equipo = composeConditioningTeam(PEDIDO, EMPRESA, [], [], [grupo(GRUPO_A, 'Turno', [BETO, CARLA])], [persona(CARLA)]);
    expect(equipo.map((fila) => fila.userId)).toEqual([CARLA]);
  });
});

describe('composeConditioningTeam — gana el primero y position es el orden final (R13)', () => {
  it('R13: sueltas primero en el orden recibido, despues cada grupo en el suyo, con position desde 0', () => {
    const equipo = composeConditioningTeam(
      PEDIDO,
      EMPRESA,
      [persona(BETO), persona(ANA)],
      [BETO, ANA],
      [grupo(GRUPO_A, 'Turno manana', [CARLA, ANA]), grupo(GRUPO_B, 'Turno tarde', [ELENA, CARLA, DIEGO])],
      [persona(ANA), persona(CARLA), persona(DIEGO), persona(ELENA)],
    );

    expect(equipo).toEqual([
      { orderId: PEDIDO, userId: BETO, companyId: EMPRESA, workGroupId: null, workGroupName: null, position: 0 },
      { orderId: PEDIDO, userId: ANA, companyId: EMPRESA, workGroupId: null, workGroupName: null, position: 1 },
      { orderId: PEDIDO, userId: CARLA, companyId: EMPRESA, workGroupId: GRUPO_A, workGroupName: 'Turno manana', position: 2 },
      { orderId: PEDIDO, userId: ELENA, companyId: EMPRESA, workGroupId: GRUPO_B, workGroupName: 'Turno tarde', position: 3 },
      { orderId: PEDIDO, userId: DIEGO, companyId: EMPRESA, workGroupId: GRUPO_B, workGroupName: 'Turno tarde', position: 4 },
    ]);
  });

  it('R13: invertir el orden de los grupos cambia el origen que gana', () => {
    const miembros = [persona(CARLA)];
    const ab = composeConditioningTeam(PEDIDO, EMPRESA, [], [], [grupo(GRUPO_A, 'A', [CARLA]), grupo(GRUPO_B, 'B', [CARLA])], miembros);
    const ba = composeConditioningTeam(PEDIDO, EMPRESA, [], [], [grupo(GRUPO_B, 'B', [CARLA]), grupo(GRUPO_A, 'A', [CARLA])], miembros);
    expect(ab).toEqual([expect.objectContaining({ workGroupId: GRUPO_A, workGroupName: 'A', position: 0 })]);
    expect(ba).toEqual([expect.objectContaining({ workGroupId: GRUPO_B, workGroupName: 'B', position: 0 })]);
  });

  it('R13: el nombre guardado es el del snapshot, el del instante de comenzar', () => {
    const [fila] = composeConditioningTeam(PEDIDO, EMPRESA, [], [], [grupo(GRUPO_A, 'Nombre de ahora', [CARLA])], [persona(CARLA)]);
    expect(fila?.workGroupName).toBe('Nombre de ahora');
  });
});

describe('composeConditioningTeam — el equipo vacio (R17)', () => {
  it('R17: un grupo sin nadie elegible y sin sueltas -> conditioning_team_empty', () => {
    expect(() =>
      composeConditioningTeam(
        PEDIDO,
        EMPRESA,
        [],
        [],
        [grupo(GRUPO_A, 'Turno', [BETO, DIEGO])],
        [persona(BETO, ADMINISTRADOR), persona(DIEGO, { isActive: false })],
      ),
    ).toThrow(ConditioningTeamEmptyError);
  });

  it('R17: un grupo vivo sin miembros activos y sin sueltas -> conditioning_team_empty', () => {
    expect(() => composeConditioningTeam(PEDIDO, EMPRESA, [], [], [grupo(GRUPO_A, 'Turno', [])], [])).toThrow(
      ConditioningTeamEmptyError,
    );
  });

  it('R17: con una suelta valida, un grupo vacio no vacia el equipo', () => {
    const equipo = composeConditioningTeam(PEDIDO, EMPRESA, [persona(ANA)], [ANA], [grupo(GRUPO_A, 'Turno', [])], []);
    expect(equipo).toHaveLength(1);
  });
});
