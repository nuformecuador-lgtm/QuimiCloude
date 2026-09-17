// tests/unit/asignaciones/finish-assigned-order.test.ts
import { describe, expect, it, vi } from 'vitest';

import {
  createFinishAssignedOrder,
  type FinishAssignedOrderDeps,
} from '@/lib/modules/asignaciones/domain/finish-assigned-order';
import {
  AsignacionesError,
  OrderCancelledNotAssignableError,
  OrderDeliveredFrozenError,
  UnauthorizedError,
} from '@/lib/modules/asignaciones/domain/errors';

import type { Actor } from '@/lib/modules/asignaciones/domain/actor';
import type { OrderAssignmentRepository } from '@/lib/modules/asignaciones/ports/order-assignment-repository';
import type { OrderCatalog, OrderStatus } from '@/lib/modules/pedidos';

function uuid(seed: string): string {
  return `${seed.repeat(8)}-${seed.repeat(4)}-4${seed.repeat(3)}-8${seed.repeat(3)}-${seed.repeat(12)}`;
}

const EMPRESA = uuid('3');
const ANA = uuid('1');
const PEDIDO = uuid('7');

const ACTOR: Actor = { id: ANA, companyId: EMPRESA, permissions: ['asignaciones.consultar'] };

type Dobles = {
  readonly deps: FinishAssignedOrderDeps;
  readonly listOrderIdsByUserInCompany: ReturnType<typeof vi.fn>;
  readonly findAliveById: ReturnType<typeof vi.fn>;
  readonly transitionAliveById: ReturnType<typeof vi.fn>;
};

function montar(options?: {
  readonly ordenDeEstados?: readonly OrderStatus[];
  readonly transitionResults?: readonly ('ok' | 'not_found' | 'stale')[];
  readonly ids?: readonly string[];
}): Dobles {
  const estados = [...(options?.ordenDeEstados ?? ['EN_CURSO'])];
  const resultados = [...(options?.transitionResults ?? ['ok'])];

  const listOrderIdsByUserInCompany = vi.fn(async () => options?.ids ?? [PEDIDO]);
  const findAliveById = vi.fn(async () => ({ id: PEDIDO, status: estados.shift() ?? 'ENTREGADO' }));
  const transitionAliveById = vi.fn(async () => resultados.shift() ?? 'ok');

  const deps: FinishAssignedOrderDeps = {
    assignments: {
      insertMissing: vi.fn(),
      listByOrderInCompany: vi.fn(),
      listByOrdersInCompany: vi.fn(),
      deleteOne: vi.fn(),
      deleteByWorkGroup: vi.fn(),
      listOrderIdsByUserInCompany,
    } as unknown as OrderAssignmentRepository,
    orders: {
      findAliveById,
      listAliveSummariesByIds: vi.fn(),
      transitionAliveById,
    } as unknown as OrderCatalog,
    now: () => new Date('2026-09-17T12:00:00.000Z'),
  };

  return { deps, listOrderIdsByUserInCompany, findAliveById, transitionAliveById };
}

describe('finishAssignedOrder — autorizacion', () => {
  it('R5: exige `asignaciones.consultar` ANTES de tocar ningun puerto', async () => {
    const { deps, listOrderIdsByUserInCompany, findAliveById, transitionAliveById } = montar();
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await expect(
      finishAssignedOrder({ id: ANA, companyId: EMPRESA, permissions: [] }, { orderId: PEDIDO }),
    ).rejects.toThrow(UnauthorizedError);
    expect(listOrderIdsByUserInCompany).not.toHaveBeenCalled();
    expect(findAliveById).not.toHaveBeenCalled();
    expect(transitionAliveById).not.toHaveBeenCalled();
  });

  it('rechaza sin actor, sin tocar ningun puerto', async () => {
    const { deps, transitionAliveById } = montar();
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await expect(finishAssignedOrder(null, { orderId: PEDIDO })).rejects.toBeInstanceOf(AsignacionesError);
    expect(transitionAliveById).not.toHaveBeenCalled();
  });
});

describe('finishAssignedOrder — R6: no es tuyo', () => {
  it('un pedido no asignado a quien lo pide rechaza con `order_not_found`, sin leer el pedido', async () => {
    const { deps, findAliveById } = montar({ ids: [] });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await expect(finishAssignedOrder(ACTOR, { orderId: PEDIDO })).rejects.toMatchObject({
      code: 'order_not_found',
    });
    expect(findAliveById).not.toHaveBeenCalled();
  });
});

describe('finishAssignedOrder — R11: EN_CURSO transiciona a ENTREGADO', () => {
  it('llama a `transitionAliveById` con el estado leido y `ENTREGADO`', async () => {
    const { deps, transitionAliveById } = montar({ ordenDeEstados: ['EN_CURSO'] });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await finishAssignedOrder(ACTOR, { orderId: PEDIDO });

    expect(transitionAliveById).toHaveBeenCalledWith(
      PEDIDO,
      EMPRESA,
      'EN_CURSO',
      'ENTREGADO',
      ANA,
      new Date('2026-09-17T12:00:00.000Z'),
    );
  });

  it('sin `stale`, resuelve con una sola llamada de transicion', async () => {
    const { deps, transitionAliveById } = montar({ ordenDeEstados: ['EN_CURSO'] });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await finishAssignedOrder(ACTOR, { orderId: PEDIDO });

    expect(transitionAliveById).toHaveBeenCalledTimes(1);
  });
});

describe('finishAssignedOrder — `stale`: relee y reintenta contra el estado real', () => {
  it('si `transitionAliveById` devuelve `stale`, relee y reintenta sin lanzar un error visible', async () => {
    const { deps, findAliveById, transitionAliveById } = montar({
      ordenDeEstados: ['EN_CURSO', 'EN_CURSO'],
      transitionResults: ['stale', 'ok'],
    });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await expect(finishAssignedOrder(ACTOR, { orderId: PEDIDO })).resolves.toBeUndefined();
    expect(findAliveById).toHaveBeenCalledTimes(2);
    expect(transitionAliveById).toHaveBeenCalledTimes(2);
  });
});

describe('finishAssignedOrder — R14: ENTREGADO y CANCELADO no admiten un segundo Finalizar', () => {
  it('ENTREGADO rechaza con `order_delivered_frozen` sin escribir', async () => {
    const { deps, transitionAliveById } = montar({ ordenDeEstados: ['ENTREGADO'] });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await expect(finishAssignedOrder(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(
      OrderDeliveredFrozenError,
    );
    expect(transitionAliveById).not.toHaveBeenCalled();
  });

  it('CANCELADO rechaza con `order_cancelled_not_assignable` sin escribir', async () => {
    const { deps, transitionAliveById } = montar({ ordenDeEstados: ['CANCELADO'] });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await expect(finishAssignedOrder(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(
      OrderCancelledNotAssignableError,
    );
    expect(transitionAliveById).not.toHaveBeenCalled();
  });
});

describe('finishAssignedOrder — R16: no admite ningun dato de marcado', () => {
  it('la firma solo acepta el actor y el identificador del pedido: sin un tercer parametro', () => {
    const { deps } = montar();
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    expect(finishAssignedOrder.length).toBe(2);
  });

  it('un `input` con datos de marcado no cambia el resultado: el esquema estricto los rechaza', async () => {
    const { deps } = montar({ ordenDeEstados: ['EN_CURSO'] });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await expect(
      finishAssignedOrder(ACTOR, { orderId: PEDIDO, checkedItems: ['a', 'b'] } as unknown),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  });
});
