// tests/unit/asignaciones/start-conditioning.test.ts
// Comenzar el acondicionamiento con equipo, con dobles de los cuatro puertos: el orden de los
// pasos, que puertos se tocan en cada rechazo y que se escribe dentro de la transaccion.
import { describe, expect, it, vi } from 'vitest';

import {
  ROLE_ACONDICIONAMIENTO,
  ROLE_ADMINISTRADOR,
  ROLE_EMPACADOR,
  SEED_ROLE_PERMISSIONS,
  type PeopleDirectory,
  type PersonRef,
  type WorkGroupDirectory,
  type WorkGroupSnapshot,
} from '@/lib/modules/identity';

import {
  createStartConditioning,
  type StartConditioningDeps,
} from '@/lib/modules/asignaciones/domain/start-conditioning';
import {
  ConditioningTeamEmptyError,
  ConditioningTeamMemberNotAllowedError,
  OrderConditioningTakenError,
  OrderNotConditionableError,
  OrderNotFoundError,
  UnauthorizedError,
  UserNotAssignableError,
  UserNotFoundError,
  ValidationError,
  WorkGroupNotFoundError,
} from '@/lib/modules/asignaciones/domain/errors';

import type { Actor } from '@/lib/modules/asignaciones/domain/actor';
import type { NewConditioningTeamMember } from '@/lib/modules/asignaciones/ports/conditioning-team-repository';
import type { ExecutionTransaction, ExecutionWriters } from '@/lib/modules/asignaciones/ports/execution-transaction';
import type { OrderCatalog, OrderStatus } from '@/lib/modules/pedidos';

function uuid(seed: string): string {
  return `${seed.repeat(8)}-${seed.repeat(4)}-4${seed.repeat(3)}-8${seed.repeat(3)}-${seed.repeat(12)}`;
}

const EMPRESA = uuid('3');
const ANA = uuid('1');
const BETO = uuid('2');
const CARLA = uuid('4');
const DIEGO = uuid('5');
const PEDIDO = uuid('7');
const GRUPO = uuid('8');
const AHORA = new Date('2026-10-08T12:00:00.000Z');

const ACTOR: Actor = { id: ANA, companyId: EMPRESA, permissions: ['acondicionamiento.modificar'] };
const ENTRADA = { orderId: PEDIDO, userIds: [BETO], workGroupIds: [] as string[] };

function persona(id: string, overrides?: Partial<PersonRef>): PersonRef {
  return { id, displayName: `Persona ${id.slice(0, 1)}`, isActive: true, permissions: [], ...overrides };
}

type Escritura = 'ok' | 'already_mine' | 'taken' | 'not_conditionable' | 'not_found';

type Opciones = {
  readonly status?: OrderStatus | null;
  readonly people?: readonly PersonRef[];
  readonly groups?: Readonly<Record<string, WorkGroupSnapshot | null>>;
  readonly escritura?: Escritura;
  readonly insertAll?: (rows: readonly NewConditioningTeamMember[]) => Promise<number>;
};

function montar(opciones: Opciones = {}) {
  const pasos: string[] = [];
  const status = opciones.status === undefined ? 'POR_ACONDICIONAR' : opciones.status;
  const people = opciones.people ?? [persona(BETO), persona(CARLA), persona(DIEGO)];

  const findAliveById = vi.fn(async (id: string) => {
    pasos.push('pedido');
    return status === null ? null : { id, status };
  });
  const findAliveRefsInCompany = vi.fn(async (_companyId: string, ids: readonly string[]) => {
    pasos.push('personas');
    return people.filter((person) => ids.includes(person.id));
  });
  const findSnapshotAliveInCompany = vi.fn(async (_companyId: string, workGroupId: string) => {
    pasos.push('grupo');
    return opciones.groups?.[workGroupId] ?? null;
  });
  const startConditioningAliveById = vi.fn(async () => {
    pasos.push('escribe-pedido');
    return opciones.escritura ?? 'ok';
  });
  const insertAll = vi.fn(async (rows: readonly NewConditioningTeamMember[]) => {
    pasos.push('escribe-equipo');
    return opciones.insertAll ? opciones.insertAll(rows) : rows.length;
  });
  const run = vi.fn(async <T>(work: (writers: ExecutionWriters) => Promise<T>) => {
    pasos.push('transaccion');
    return work({
      conditioning: { startConditioningAliveById },
      team: { insertAll, listByOrderInCompany: vi.fn() },
    } as unknown as ExecutionWriters);
  });

  const deps: StartConditioningDeps = {
    orders: { findAliveById } as unknown as OrderCatalog,
    people: { findAliveRefsInCompany } as unknown as PeopleDirectory,
    groups: { findSnapshotAliveInCompany } as unknown as WorkGroupDirectory,
    transaction: { run } as ExecutionTransaction,
    now: () => AHORA,
  };
  return {
    deps,
    pasos,
    findAliveById,
    findAliveRefsInCompany,
    findSnapshotAliveInCompany,
    startConditioningAliveById,
    insertAll,
    run,
    startConditioning: createStartConditioning(deps),
  };
}

function intocable<T extends object>(nombre: string): T {
  return new Proxy({} as T, {
    get(_target, prop) {
      throw new Error(`se toco el puerto ${nombre}: ${String(prop)}`);
    },
  });
}

function depsIntocables(): StartConditioningDeps {
  return {
    orders: intocable<OrderCatalog>('orders'),
    people: intocable<PeopleDirectory>('people'),
    groups: intocable<WorkGroupDirectory>('groups'),
    transaction: intocable<ExecutionTransaction>('transaction'),
    now: () => {
      throw new Error('se pidio la hora');
    },
  };
}

describe('startConditioning — autorizacion', () => {
  const actoresSinPermiso: ReadonlyArray<readonly [string, Actor | null | undefined]> = [
    ['nulo', null],
    ['ausente', undefined],
    [
      'con los permisos de semilla del Administrador',
      { id: ANA, companyId: EMPRESA, permissions: SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]! },
    ],
    [
      'con los permisos de semilla del Empacador',
      { id: ANA, companyId: EMPRESA, permissions: SEED_ROLE_PERMISSIONS[ROLE_EMPACADOR]! },
    ],
    ['con el conjunto vacio', { id: ANA, companyId: EMPRESA, permissions: [] }],
  ];

  it.each(actoresSinPermiso)('R19: actor %s rechaza con unauthorized sin tocar ningun puerto', async (_n, actor) => {
    const startConditioning = createStartConditioning(depsIntocables());
    await expect(startConditioning(actor, ENTRADA)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it.each(actoresSinPermiso)(
    'R19: actor %s con entrada invalida sigue dando unauthorized: autorizar va antes de validar',
    async (_n, actor) => {
      const startConditioning = createStartConditioning(depsIntocables());
      await expect(startConditioning(actor, { orderId: 'no-es-uuid', extra: 1 })).rejects.toBeInstanceOf(
        UnauthorizedError,
      );
    },
  );

  it('R19: un actor con los permisos de semilla del Administrador de acondicionamiento comienza sin ser responsable', async () => {
    const { startConditioning, startConditioningAliveById } = montar();
    const actor: Actor = { id: ANA, companyId: EMPRESA, permissions: SEED_ROLE_PERMISSIONS[ROLE_ACONDICIONAMIENTO]! };

    await expect(startConditioning(actor, ENTRADA)).resolves.toBeUndefined();
    expect(startConditioningAliveById).toHaveBeenCalledTimes(1);
  });
});

describe('startConditioning — la forma de la entrada', () => {
  const entradasInvalidas: ReadonlyArray<readonly [string, unknown]> = [
    ['nula', null],
    ['no objeto', 'texto'],
    ['vacia', {}],
    ['solo con orderId', { orderId: PEDIDO }],
    ['sin userIds', { orderId: PEDIDO, workGroupIds: [GRUPO] }],
    ['sin workGroupIds', { orderId: PEDIDO, userIds: [BETO] }],
    ['con las dos listas vacias', { orderId: PEDIDO, userIds: [], workGroupIds: [] }],
    ['con una persona repetida', { orderId: PEDIDO, userIds: [BETO, BETO], workGroupIds: [] }],
    ['con un grupo repetido', { orderId: PEDIDO, userIds: [], workGroupIds: [GRUPO, GRUPO] }],
    ['con un id de persona que no es uuid', { orderId: PEDIDO, userIds: ['beto'], workGroupIds: [] }],
    ['con orderId que no es uuid', { orderId: 'no-es-uuid', userIds: [BETO], workGroupIds: [] }],
    ['con una clave de mas', { ...ENTRADA, companyId: EMPRESA }],
  ];

  it.each(entradasInvalidas)('R18: entrada %s rechaza con invalid_input sin tocar ningun puerto', async (_n, entrada) => {
    const startConditioning = createStartConditioning({ ...depsIntocables(), now: () => AHORA });
    const error = await startConditioning(ACTOR, entrada).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).code).toBe('invalid_input');
  });

  it('R18: una lista vacia es valida si la otra trae algo', async () => {
    const { startConditioning } = montar({ groups: { [GRUPO]: { id: GRUPO, name: 'Turno', activeMemberIds: [CARLA] } } });

    await expect(
      startConditioning(ACTOR, { orderId: PEDIDO, userIds: [], workGroupIds: [GRUPO] }),
    ).resolves.toBeUndefined();
  });
});

describe('startConditioning — el orden auth -> zod -> pedido -> equipo -> transaccion', () => {
  it('R12, R13: lee el pedido, despues el equipo, y escribe pedido y equipo dentro de la transaccion', async () => {
    const { startConditioning, pasos, startConditioningAliveById, insertAll } = montar({
      groups: { [GRUPO]: { id: GRUPO, name: 'Turno manana', activeMemberIds: [CARLA, BETO] } },
    });

    await startConditioning(ACTOR, { orderId: PEDIDO, userIds: [BETO], workGroupIds: [GRUPO] });

    expect(pasos[0]).toBe('pedido');
    expect(pasos.slice(1, 3).sort()).toEqual(['grupo', 'personas']);
    expect(pasos.slice(3)).toEqual(['personas', 'transaccion', 'escribe-pedido', 'escribe-equipo']);
    expect(startConditioningAliveById).toHaveBeenCalledWith(PEDIDO, EMPRESA, ANA, AHORA);
    expect(insertAll).toHaveBeenCalledWith([
      { orderId: PEDIDO, userId: BETO, companyId: EMPRESA, workGroupId: null, workGroupName: null, position: 0 },
      { orderId: PEDIDO, userId: CARLA, companyId: EMPRESA, workGroupId: GRUPO, workGroupName: 'Turno manana', position: 1 },
    ]);
  });

  it('R13: el grupo se resuelve con el instante de comenzar', async () => {
    const { startConditioning, findSnapshotAliveInCompany, findAliveRefsInCompany } = montar({
      groups: { [GRUPO]: { id: GRUPO, name: 'Turno', activeMemberIds: [CARLA] } },
    });

    await startConditioning(ACTOR, { orderId: PEDIDO, userIds: [], workGroupIds: [GRUPO] });

    expect(findSnapshotAliveInCompany).toHaveBeenCalledWith(EMPRESA, GRUPO, AHORA);
    expect(findAliveRefsInCompany).toHaveBeenCalledWith(EMPRESA, [CARLA], AHORA);
  });

  it('R12: la empresa sale del actor, nunca de la entrada', async () => {
    const { startConditioning, findAliveById, insertAll } = montar();
    const otro: Actor = { ...ACTOR, companyId: uuid('9') };

    await startConditioning(otro, ENTRADA);

    expect(findAliveById).toHaveBeenCalledWith(PEDIDO, uuid('9'));
    expect(insertAll.mock.calls[0]?.[0].every((row) => row.companyId === uuid('9'))).toBe(true);
  });

  it('R12: sin now inyectado usa el reloj del sistema', async () => {
    const { deps, startConditioningAliveById } = montar();

    await createStartConditioning({ ...deps, now: undefined })(ACTOR, ENTRADA);
    expect((startConditioningAliveById.mock.calls[0] as unknown[] | undefined)?.[3]).toBeInstanceOf(Date);
  });

  it('R12: si insertar el equipo falla, el error sale de la transaccion para que la deshaga', async () => {
    const fallo = new Error('fallo al insertar el equipo');
    const { startConditioning, startConditioningAliveById } = montar({
      insertAll: async () => {
        throw fallo;
      },
    });

    await expect(startConditioning(ACTOR, ENTRADA)).rejects.toBe(fallo);
    expect(startConditioningAliveById).toHaveBeenCalledTimes(1);
  });
});

describe('startConditioning — los errores del pedido van antes que los del equipo (R20)', () => {
  // Una entrada cuyo equipo fallaria si se resolviera: la persona no existe y el grupo tampoco.
  const EQUIPO_INVALIDO = { orderId: PEDIDO, userIds: [uuid('6')], workGroupIds: [GRUPO] };

  it('R20: pedido inexistente, de baja o de otra empresa -> order_not_found sin resolver el equipo ni escribir', async () => {
    const { startConditioning, findAliveRefsInCompany, findSnapshotAliveInCompany, run } = montar({ status: null });

    const error = await startConditioning(ACTOR, EQUIPO_INVALIDO).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(OrderNotFoundError);
    expect((error as OrderNotFoundError).code).toBe('order_not_found');
    expect(findAliveRefsInCompany).not.toHaveBeenCalled();
    expect(findSnapshotAliveInCompany).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it.each<OrderStatus>(['PENDIENTE', 'EN_CURSO', 'BLOQUEADO', 'POR_EMPACAR', 'EN_EMPAQUE', 'TERMINADO', 'ENTREGADO', 'CANCELADO'])(
    'R20: estado %s -> order_not_conditionable sin resolver el equipo ni escribir',
    async (status) => {
      const { startConditioning, findAliveRefsInCompany, findSnapshotAliveInCompany, run } = montar({ status });

      const error = await startConditioning(ACTOR, EQUIPO_INVALIDO).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(OrderNotConditionableError);
      expect((error as OrderNotConditionableError).code).toBe('order_not_conditionable');
      expect(findAliveRefsInCompany).not.toHaveBeenCalled();
      expect(findSnapshotAliveInCompany).not.toHaveBeenCalled();
      expect(run).not.toHaveBeenCalled();
    },
  );

  it('R20: EN_ACONDICIONAMIENTO de otra persona -> order_conditioning_taken sin resolver el equipo ni escribirlo', async () => {
    const { startConditioning, findAliveRefsInCompany, findSnapshotAliveInCompany, insertAll } = montar({
      status: 'EN_ACONDICIONAMIENTO',
      escritura: 'taken',
    });

    const error = await startConditioning(ACTOR, EQUIPO_INVALIDO).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(OrderConditioningTakenError);
    expect((error as OrderConditioningTakenError).code).toBe('order_conditioning_taken');
    expect(findAliveRefsInCompany).not.toHaveBeenCalled();
    expect(findSnapshotAliveInCompany).not.toHaveBeenCalled();
    expect(insertAll).not.toHaveBeenCalled();
  });
});

describe('startConditioning — el propio actor repite Comenzar (R21)', () => {
  it('R21: already_mine termina con exito sin resolver el equipo ni escribirlo, aunque la entrada traiga otro', async () => {
    const { startConditioning, findAliveRefsInCompany, findSnapshotAliveInCompany, insertAll, startConditioningAliveById } =
      montar({ status: 'EN_ACONDICIONAMIENTO', escritura: 'already_mine' });

    await expect(
      startConditioning(ACTOR, { orderId: PEDIDO, userIds: [uuid('6')], workGroupIds: [GRUPO] }),
    ).resolves.toBeUndefined();

    expect(findAliveRefsInCompany).not.toHaveBeenCalled();
    expect(findSnapshotAliveInCompany).not.toHaveBeenCalled();
    expect(startConditioningAliveById).toHaveBeenCalledTimes(1);
    expect(insertAll).not.toHaveBeenCalled();
  });
});

describe('startConditioning — el equipo invalido rechaza sin escribir (R16, R17)', () => {
  it.each([
    ['persona que no existe, de baja o de otra empresa', [] as PersonRef[], UserNotFoundError, 'user_not_found'],
    ['cuenta no activa', [persona(BETO, { isActive: false })], UserNotAssignableError, 'user_not_assignable'],
    [
      'Administrador',
      [persona(BETO, { permissions: ['pedidos.consultar'] })],
      ConditioningTeamMemberNotAllowedError,
      'conditioning_team_member_not_allowed',
    ],
  ] as const)('R16: suelta con %s -> su codigo, sin abrir la transaccion', async (_n, people, clase, code) => {
    const { startConditioning, run } = montar({ people });

    const error = await startConditioning(ACTOR, ENTRADA).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(clase);
    expect((error as { code: string }).code).toBe(code);
    expect(run).not.toHaveBeenCalled();
  });

  it('R16: grupo inexistente, de baja o de otra empresa -> work_group_not_found, sin abrir la transaccion', async () => {
    const { startConditioning, run } = montar({ groups: { [GRUPO]: null } });

    const error = await startConditioning(ACTOR, { orderId: PEDIDO, userIds: [BETO], workGroupIds: [GRUPO] }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(WorkGroupNotFoundError);
    expect((error as WorkGroupNotFoundError).code).toBe('work_group_not_found');
    expect(run).not.toHaveBeenCalled();
  });

  it('R16: una suelta invalida gana a un grupo inexistente: primero las personas, despues los grupos', async () => {
    const { startConditioning } = montar({ people: [], groups: { [GRUPO]: null } });

    const error = await startConditioning(ACTOR, { orderId: PEDIDO, userIds: [BETO], workGroupIds: [GRUPO] }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(UserNotFoundError);
  });

  it('R17: un grupo que solo aporta Administradores e inactivos -> conditioning_team_empty, sin abrir la transaccion', async () => {
    const { startConditioning, run } = montar({
      people: [persona(CARLA, { permissions: ['pedidos.consultar'] }), persona(DIEGO, { isActive: false })],
      groups: { [GRUPO]: { id: GRUPO, name: 'Turno', activeMemberIds: [CARLA, DIEGO] } },
    });

    const error = await startConditioning(ACTOR, { orderId: PEDIDO, userIds: [], workGroupIds: [GRUPO] }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(ConditioningTeamEmptyError);
    expect((error as ConditioningTeamEmptyError).code).toBe('conditioning_team_empty');
    expect(run).not.toHaveBeenCalled();
  });
});

describe('startConditioning — lo que responde la escritura del pedido (R22)', () => {
  it.each([
    ['taken', OrderConditioningTakenError, 'order_conditioning_taken'],
    ['not_conditionable', OrderNotConditionableError, 'order_not_conditionable'],
    ['not_found', OrderNotFoundError, 'order_not_found'],
  ] as const)('R22: si entre la lectura y la escritura el UPDATE responde %s, no se inserta equipo', async (escritura, clase, code) => {
    const { startConditioning, insertAll } = montar({ escritura });

    const error = await startConditioning(ACTOR, ENTRADA).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(clase);
    expect((error as { code: string }).code).toBe(code);
    expect(insertAll).not.toHaveBeenCalled();
  });
});
