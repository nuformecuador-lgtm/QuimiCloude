// tests/unit/asignaciones/start-conditioning.test.ts
import { describe, expect, it, vi } from 'vitest';

import {
  ROLE_ACONDICIONAMIENTO,
  ROLE_ADMINISTRADOR,
  ROLE_EMPACADOR,
  SEED_ROLE_PERMISSIONS,
} from '@/lib/modules/identity';

import {
  createStartConditioning,
  type StartConditioningDeps,
} from '@/lib/modules/asignaciones/domain/start-conditioning';
import {
  OrderConditioningTakenError,
  OrderNotConditionableError,
  OrderNotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/modules/asignaciones/domain/errors';

import type { Actor } from '@/lib/modules/asignaciones/domain/actor';
import type { OrderCatalog } from '@/lib/modules/pedidos';

function uuid(seed: string): string {
  return `${seed.repeat(8)}-${seed.repeat(4)}-4${seed.repeat(3)}-8${seed.repeat(3)}-${seed.repeat(12)}`;
}

const EMPRESA = uuid('3');
const ANA = uuid('1');
const PEDIDO = uuid('7');
const AHORA = new Date('2026-10-08T12:00:00.000Z');

const ACTOR: Actor = { id: ANA, companyId: EMPRESA, permissions: ['acondicionamiento.modificar'] };

type Resultado = 'ok' | 'already_mine' | 'taken' | 'not_conditionable' | 'not_found';

function montar(resultado: Resultado): {
  readonly deps: StartConditioningDeps;
  readonly startConditioningAliveById: ReturnType<typeof vi.fn>;
} {
  const startConditioningAliveById = vi.fn(async () => resultado);
  const deps = {
    orders: { startConditioningAliveById } as unknown as OrderCatalog,
    now: () => AHORA,
  } satisfies StartConditioningDeps;
  return { deps, startConditioningAliveById };
}

/** Un catalogo que falla en cuanto se lee cualquiera de sus miembros. */
function catalogoIntocable(): OrderCatalog {
  return new Proxy({} as OrderCatalog, {
    get(_target, prop) {
      throw new Error(`se toco el puerto: ${String(prop)}`);
    },
  });
}

function depsIntocables(): StartConditioningDeps {
  return {
    orders: catalogoIntocable(),
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

  it.each(actoresSinPermiso)(
    'R15: actor %s rechaza con unauthorized sin tocar ningun puerto',
    async (_nombre, actor) => {
      const startConditioning = createStartConditioning(depsIntocables());
      await expect(startConditioning(actor, { orderId: PEDIDO })).rejects.toBeInstanceOf(UnauthorizedError);
    },
  );

  it.each(actoresSinPermiso)(
    'R15: actor %s con entrada invalida sigue dando unauthorized: autorizar va antes de validar',
    async (_nombre, actor) => {
      const startConditioning = createStartConditioning(depsIntocables());
      await expect(startConditioning(actor, { orderId: 'no-es-uuid', extra: 1 })).rejects.toBeInstanceOf(
        UnauthorizedError,
      );
    },
  );

  it('R15: los permisos de semilla del Administrador y del Empacador no incluyen el permiso', () => {
    expect(SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]).not.toContain('acondicionamiento.modificar');
    expect(SEED_ROLE_PERMISSIONS[ROLE_EMPACADOR]).not.toContain('acondicionamiento.modificar');
  });

  it('R11, R15: un actor con los permisos de semilla del Administrador de acondicionamiento comienza', async () => {
    const { deps, startConditioningAliveById } = montar('ok');
    const actor: Actor = { id: ANA, companyId: EMPRESA, permissions: SEED_ROLE_PERMISSIONS[ROLE_ACONDICIONAMIENTO]! };

    await expect(createStartConditioning(deps)(actor, { orderId: PEDIDO })).resolves.toBeUndefined();
    expect(startConditioningAliveById).toHaveBeenCalledTimes(1);
  });
});

describe('startConditioning — validacion de la entrada', () => {
  const entradasInvalidas: ReadonlyArray<readonly [string, unknown]> = [
    ['nula', null],
    ['no objeto', 'texto'],
    ['vacia', {}],
    ['orderId no uuid', { orderId: 'no-es-uuid' }],
    ['orderId numerico', { orderId: 7 }],
    ['con una clave de mas', { orderId: PEDIDO, companyId: EMPRESA }],
  ];

  it.each(entradasInvalidas)('R16: entrada %s rechaza con invalid_input sin tocar ningun puerto', async (_n, entrada) => {
    const startConditioning = createStartConditioning({ ...depsIntocables(), now: () => AHORA });
    const error = await startConditioning(ACTOR, entrada).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).code).toBe('invalid_input');
  });
});

describe('startConditioning — llamada al catalogo y traduccion del resultado', () => {
  it('R8, R11: llama al catalogo una vez con el pedido, la empresa y el id del actor, y el instante', async () => {
    const { deps, startConditioningAliveById } = montar('ok');

    await expect(createStartConditioning(deps)(ACTOR, { orderId: PEDIDO })).resolves.toBeUndefined();
    expect(startConditioningAliveById).toHaveBeenCalledTimes(1);
    expect(startConditioningAliveById).toHaveBeenCalledWith(PEDIDO, EMPRESA, ANA, AHORA);
  });

  it('R9: already_mine es exito', async () => {
    const { deps } = montar('already_mine');
    await expect(createStartConditioning(deps)(ACTOR, { orderId: PEDIDO })).resolves.toBeUndefined();
  });

  it('R9, R10: taken rechaza con order_conditioning_taken', async () => {
    const { deps } = montar('taken');
    const error = await createStartConditioning(deps)(ACTOR, { orderId: PEDIDO }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OrderConditioningTakenError);
    expect((error as OrderConditioningTakenError).code).toBe('order_conditioning_taken');
  });

  it('R14: not_conditionable rechaza con order_not_conditionable', async () => {
    const { deps } = montar('not_conditionable');
    const error = await createStartConditioning(deps)(ACTOR, { orderId: PEDIDO }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OrderNotConditionableError);
    expect((error as OrderNotConditionableError).code).toBe('order_not_conditionable');
  });

  it('R14: not_found rechaza con order_not_found', async () => {
    const { deps } = montar('not_found');
    const error = await createStartConditioning(deps)(ACTOR, { orderId: PEDIDO }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OrderNotFoundError);
    expect((error as OrderNotFoundError).code).toBe('order_not_found');
  });

  it('R14: la empresa sale del actor, nunca de la entrada', async () => {
    const { deps, startConditioningAliveById } = montar('ok');
    const otro: Actor = { ...ACTOR, companyId: uuid('9') };

    await createStartConditioning(deps)(otro, { orderId: PEDIDO });
    expect(startConditioningAliveById).toHaveBeenCalledWith(PEDIDO, uuid('9'), ANA, AHORA);
  });

  it('R8: sin now inyectado usa el reloj del sistema', async () => {
    const startConditioningAliveById = vi.fn<OrderCatalog['startConditioningAliveById']>(async () => 'ok');
    const startConditioning = createStartConditioning({
      orders: { startConditioningAliveById } as unknown as OrderCatalog,
    });

    await startConditioning(ACTOR, { orderId: PEDIDO });
    expect(startConditioningAliveById.mock.calls[0]?.[3]).toBeInstanceOf(Date);
  });
});
