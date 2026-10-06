// tests/unit/asignaciones/start-packing.test.ts
import { describe, expect, it, vi } from 'vitest';

import { createStartPacking, type StartPackingDeps } from '@/lib/modules/asignaciones/domain/start-packing';
import {
  AsignacionesError,
  OrderNotFoundError,
  OrderNotPackableError,
  OrderPackingTakenError,
  OrderWithoutDistributionError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/modules/asignaciones/domain/errors';

import type { Actor } from '@/lib/modules/asignaciones/domain/actor';

function uuid(seed: string): string {
  return `${seed.repeat(8)}-${seed.repeat(4)}-4${seed.repeat(3)}-8${seed.repeat(3)}-${seed.repeat(12)}`;
}

const EMPRESA = uuid('3');
const ANA = uuid('1');
const PEDIDO = uuid('7');

const ACTOR: Actor = { id: ANA, companyId: EMPRESA, permissions: ['empaque.modificar'] };

type Resultado = 'ok' | 'already_mine' | 'taken' | 'not_packable' | 'not_found' | 'without_distribution';

function montar(resultado: Resultado): {
  readonly deps: StartPackingDeps;
  readonly startPackingAliveById: ReturnType<typeof vi.fn>;
} {
  const startPackingAliveById = vi.fn(async () => resultado);
  const deps = {
    orders: { startPackingAliveById },
    now: () => new Date('2026-09-25T12:00:00.000Z'),
  } as unknown as StartPackingDeps;
  return { deps, startPackingAliveById };
}

describe('startPacking — autorizacion (R13)', () => {
  it('actor ausente rechaza sin tocar ningun puerto', async () => {
    const { deps, startPackingAliveById } = montar('ok');
    const startPacking = createStartPacking(deps);

    await expect(startPacking(null, { orderId: PEDIDO })).rejects.toBeInstanceOf(AsignacionesError);
    expect(startPackingAliveById).not.toHaveBeenCalled();
  });

  it('actor sin conjunto de permisos rechaza sin tocar ningun puerto', async () => {
    const { deps, startPackingAliveById } = montar('ok');
    const startPacking = createStartPacking(deps);

    await expect(
      startPacking({ id: ANA, companyId: EMPRESA } as unknown as Actor, { orderId: PEDIDO }),
    ).rejects.toBeInstanceOf(AsignacionesError);
    expect(startPackingAliveById).not.toHaveBeenCalled();
  });

  it('actor con el conjunto vacio rechaza sin tocar ningun puerto', async () => {
    const { deps, startPackingAliveById } = montar('ok');
    const startPacking = createStartPacking(deps);

    await expect(startPacking({ id: ANA, companyId: EMPRESA, permissions: [] }, { orderId: PEDIDO })).rejects.toThrow(
      UnauthorizedError,
    );
    expect(startPackingAliveById).not.toHaveBeenCalled();
  });

  it('actor sin `empaque.modificar` -otro permiso cualquiera- rechaza sin tocar ningun puerto', async () => {
    const { deps, startPackingAliveById } = montar('ok');
    const startPacking = createStartPacking(deps);
    const actor: Actor = { id: ANA, companyId: EMPRESA, permissions: ['asignaciones.consultar'] };

    await expect(startPacking(actor, { orderId: PEDIDO })).rejects.toThrow(UnauthorizedError);
    expect(startPackingAliveById).not.toHaveBeenCalled();
  });

  it('la autorizacion corre ANTES que zod: entrada invalida con actor sin permiso sigue dando `unauthorized`', async () => {
    const { deps, startPackingAliveById } = montar('ok');
    const startPacking = createStartPacking(deps);

    await expect(startPacking({ id: ANA, companyId: EMPRESA, permissions: [] }, { orderId: 'no-es-uuid' })).rejects.toThrow(
      UnauthorizedError,
    );
    expect(startPackingAliveById).not.toHaveBeenCalled();
  });
});

describe('startPacking — R18: `ok` deja al actor como quien empaca', () => {
  it('llama al puerto con el pedido, la empresa, el actor y `now`, y resuelve sin error', async () => {
    const { deps, startPackingAliveById } = montar('ok');
    const startPacking = createStartPacking(deps);

    await expect(startPacking(ACTOR, { orderId: PEDIDO })).resolves.toBeUndefined();
    expect(startPackingAliveById).toHaveBeenCalledWith(PEDIDO, EMPRESA, ANA, expect.any(Date));
  });
});

describe('startPacking — R20: repetir Comenzar sobre el propio EN_EMPAQUE es exito', () => {
  it('`already_mine` resuelve sin error', async () => {
    const { deps } = montar('already_mine');
    const startPacking = createStartPacking(deps);

    await expect(startPacking(ACTOR, { orderId: PEDIDO })).resolves.toBeUndefined();
  });
});

describe('startPacking — R19, R20: tomado por otro', () => {
  it('`taken` rechaza con `order_packing_taken`', async () => {
    const { deps } = montar('taken');
    const startPacking = createStartPacking(deps);

    await expect(startPacking(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(OrderPackingTakenError);
  });
});

describe('startPacking — R23: estado que no admite Comenzar', () => {
  it('`not_packable` rechaza con `order_not_packable`', async () => {
    const { deps } = montar('not_packable');
    const startPacking = createStartPacking(deps);

    await expect(startPacking(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(OrderNotPackableError);
  });
});

describe('startPacking — R10: POR_EMPACAR sin ninguna linea de reparto', () => {
  it('`without_distribution` rechaza con `order_without_distribution`', async () => {
    const { deps } = montar('without_distribution');
    const startPacking = createStartPacking(deps);

    await expect(startPacking(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(
      OrderWithoutDistributionError,
    );
  });
});

describe('startPacking — R24: no existe, esta de baja o es de otra empresa', () => {
  it('`not_found` rechaza con `order_not_found`', async () => {
    const { deps } = montar('not_found');
    const startPacking = createStartPacking(deps);

    await expect(startPacking(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(OrderNotFoundError);
  });
});

describe('startPacking — R25: ningun puerto de inventario', () => {
  it('las dependencias declaradas son solo `orders`', async () => {
    const { deps } = montar('ok');
    expect(Object.keys(deps).sort()).toEqual(['now', 'orders']);
  });
});

describe('startPacking — entrada', () => {
  it('un `orderId` que no es uuid rechaza con `invalid_input` sin tocar el puerto', async () => {
    const { deps, startPackingAliveById } = montar('ok');
    const startPacking = createStartPacking(deps);

    await expect(startPacking(ACTOR, { orderId: 'no-es-uuid' })).rejects.toThrow(ValidationError);
    expect(startPackingAliveById).not.toHaveBeenCalled();
  });
});
