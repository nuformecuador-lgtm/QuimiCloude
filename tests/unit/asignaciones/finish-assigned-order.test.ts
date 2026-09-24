// tests/unit/asignaciones/finish-assigned-order.test.ts
import { describe, expect, it, vi } from 'vitest';

import {
  createFinishAssignedOrder,
  type FinishAssignedOrderDeps,
} from '@/lib/modules/asignaciones/domain/finish-assigned-order';
import {
  AsignacionesError,
  MaterialShortageError,
  NoWholePackageError,
  OrderCancelledNotAssignableError,
  OrderDeliveredFrozenError,
  PresentationWithoutContentError,
  RecipeWithoutLinesError,
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

const NUMERO_PEDIDO = { year: 2026, sequence: 7 };

/** El exito por defecto de `transitionAliveById` yendo a `ENTREGADO` (QC-150, R24): un objeto
 *  con el lote de producto terminado que entro, no el literal `'ok'` -ese solo sale de una
 *  transicion que no es `ENTREGADO`, y `finishAssignedOrder` siempre pide esa-. */
const OK_CON_PRODUCCION = {
  kind: 'ok' as const,
  finishedGoods: { productName: 'Desengrasante industrial · Botella 1L', packages: '5' },
};

type TransitionResult =
  | typeof OK_CON_PRODUCCION
  | 'not_found'
  | 'stale'
  | 'insufficient_material'
  | 'recipe_without_lines'
  | 'presentation_without_content'
  | 'no_whole_package';

type Dobles = {
  readonly deps: FinishAssignedOrderDeps;
  readonly listOrderIdsByUserInCompany: ReturnType<typeof vi.fn>;
  readonly findAliveById: ReturnType<typeof vi.fn>;
  readonly listAliveSummariesByIds: ReturnType<typeof vi.fn>;
  readonly transitionAliveById: ReturnType<typeof vi.fn>;
};

function montar(options?: {
  readonly ordenDeEstados?: readonly OrderStatus[];
  readonly transitionResults?: readonly TransitionResult[];
  readonly ids?: readonly string[];
}): Dobles {
  const estados = [...(options?.ordenDeEstados ?? ['EN_CURSO'])];
  const resultados = [...(options?.transitionResults ?? [OK_CON_PRODUCCION])];

  const listOrderIdsByUserInCompany = vi.fn(async () => options?.ids ?? [PEDIDO]);
  const findAliveById = vi.fn(async () => ({ id: PEDIDO, status: estados.shift() ?? 'ENTREGADO' }));
  const listAliveSummariesByIds = vi.fn(async () => ({
    items: [{ id: PEDIDO, number: NUMERO_PEDIDO, recipeId: 'receta-1', quantity: '10.0000', priority: 'MEDIA', status: 'EN_CURSO' }],
    total: 1,
    page: 1,
    pageSize: 1,
    totalPages: 1,
  }));
  const transitionAliveById = vi.fn(async () => resultados.shift() ?? OK_CON_PRODUCCION);

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
      listAliveSummariesByIds,
      transitionAliveById,
    } as unknown as OrderCatalog,
    now: () => new Date('2026-09-17T12:00:00.000Z'),
  };

  return { deps, listOrderIdsByUserInCompany, findAliveById, listAliveSummariesByIds, transitionAliveById };
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
      transitionResults: ['stale', OK_CON_PRODUCCION],
    });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await expect(finishAssignedOrder(ACTOR, { orderId: PEDIDO })).resolves.toEqual({
      numberText: '2026-0000007',
      productName: OK_CON_PRODUCCION.finishedGoods.productName,
      packages: OK_CON_PRODUCCION.finishedGoods.packages,
    });
    expect(findAliveById).toHaveBeenCalledTimes(2);
    expect(transitionAliveById).toHaveBeenCalledTimes(2);
  });
});

describe('finishAssignedOrder — confirmacion: devuelve el numero, leido ANTES de transicionar', () => {
  it('resuelve con el `numberText` formateado del pedido', async () => {
    const { deps } = montar({ ordenDeEstados: ['EN_CURSO'] });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await expect(finishAssignedOrder(ACTOR, { orderId: PEDIDO })).resolves.toEqual({
      numberText: '2026-0000007',
      productName: OK_CON_PRODUCCION.finishedGoods.productName,
      packages: OK_CON_PRODUCCION.finishedGoods.packages,
    });
  });

  it('R24: el exito lleva el producto y los envases del lote de producto terminado que entro', async () => {
    const { deps } = montar({
      ordenDeEstados: ['EN_CURSO'],
      transitionResults: [{ kind: 'ok', finishedGoods: { productName: 'Acido citrico 50% · Bidon 20L', packages: '3' } }],
    });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await expect(finishAssignedOrder(ACTOR, { orderId: PEDIDO })).resolves.toEqual({
      numberText: '2026-0000007',
      productName: 'Acido citrico 50% · Bidon 20L',
      packages: '3',
    });
  });

  it('lee el numero ANTES de transicionar: el pedido ya no aparece en los estados de trabajo despues de ENTREGADO', async () => {
    const { deps, listAliveSummariesByIds, transitionAliveById } = montar({
      ordenDeEstados: ['EN_CURSO'],
    });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await finishAssignedOrder(ACTOR, { orderId: PEDIDO });

    const [ordenLectura] = listAliveSummariesByIds.mock.invocationCallOrder;
    const [ordenTransicion] = transitionAliveById.mock.invocationCallOrder;
    expect(ordenLectura).toBeLessThan(ordenTransicion as number);
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

describe('finishAssignedOrder — QC-141: el Finalizar traduce lo que devuelve el consumo', () => {
  it('R27, R30, R31: `insufficient_material` se traduce a MaterialShortageError, sin reintentar', async () => {
    const { deps, transitionAliveById } = montar({
      ordenDeEstados: ['EN_CURSO'],
      transitionResults: ['insufficient_material'],
    });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await expect(finishAssignedOrder(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(
      MaterialShortageError,
    );
    expect(transitionAliveById).toHaveBeenCalledTimes(1);
  });

  it('R50: `recipe_without_lines` se traduce a RecipeWithoutLinesError, sin reintentar', async () => {
    const { deps, transitionAliveById } = montar({
      ordenDeEstados: ['EN_CURSO'],
      transitionResults: ['recipe_without_lines'],
    });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await expect(finishAssignedOrder(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(
      RecipeWithoutLinesError,
    );
    expect(transitionAliveById).toHaveBeenCalledTimes(1);
  });

  it('R18: `presentation_without_content` se traduce a PresentationWithoutContentError, sin reintentar', async () => {
    const { deps, transitionAliveById } = montar({
      ordenDeEstados: ['EN_CURSO'],
      transitionResults: ['presentation_without_content'],
    });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await expect(finishAssignedOrder(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(
      PresentationWithoutContentError,
    );
    expect(transitionAliveById).toHaveBeenCalledTimes(1);
  });

  it('R19: `no_whole_package` se traduce a NoWholePackageError, sin reintentar', async () => {
    const { deps, transitionAliveById } = montar({
      ordenDeEstados: ['EN_CURSO'],
      transitionResults: ['no_whole_package'],
    });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await expect(finishAssignedOrder(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(
      NoWholePackageError,
    );
    expect(transitionAliveById).toHaveBeenCalledTimes(1);
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
