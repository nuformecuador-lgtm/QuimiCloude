// tests/unit/asignaciones/get-packing-order.test.ts
import { describe, expect, it, vi } from 'vitest';

import { createGetPackingOrder, type GetPackingOrderDeps } from '@/lib/modules/asignaciones/domain/get-packing-order';
import { AsignacionesError, OrderNotFoundError, UnauthorizedError } from '@/lib/modules/asignaciones/domain/errors';

import type { Actor } from '@/lib/modules/asignaciones/domain/actor';

function uuid(seed: string): string {
  return `${seed.repeat(8)}-${seed.repeat(4)}-4${seed.repeat(3)}-8${seed.repeat(3)}-${seed.repeat(12)}`;
}

const EMPRESA = uuid('3');
const ANA = uuid('1');
const BETO = uuid('2');
const PEDIDO = uuid('7');

const ACTOR: Actor = { id: ANA, companyId: EMPRESA, permissions: ['empaque.modificar'] };

const RESUMEN = {
  id: PEDIDO,
  number: { year: 2026, sequence: 7 },
  recipeId: 'receta-1',
  quantity: '10.0000',
  priority: 'ALTA',
  status: 'POR_EMPACAR',
  presentationLines: [{ presentationId: 'presentacion-1', packages: 1 }],
  unitId: null,
  finishedAt: null,
  packedBy: null,
};

const RESUMEN_EN_EMPAQUE = { ...RESUMEN, status: 'EN_EMPAQUE', packedBy: BETO };

type Dobles = {
  readonly deps: GetPackingOrderDeps;
  readonly listAliveSummariesByIds: ReturnType<typeof vi.fn>;
  readonly findFinishedGoodsReceipts: ReturnType<typeof vi.fn>;
};

function montar(options?: { readonly items?: readonly unknown[] }): Dobles {
  const listAliveSummariesByIds = vi.fn(async () => ({
    items: options?.items ?? [RESUMEN],
    total: (options?.items ?? [RESUMEN]).length,
    page: 1,
    pageSize: 1,
    totalPages: 1,
  }));
  const findFinishedGoodsReceipts = vi.fn(async () => [{ orderId: PEDIDO, packages: '5' }]);

  const deps = {
    orders: { listAliveSummariesByIds },
    assignments: { listByOrdersInCompany: vi.fn(async () => []) },
    recipes: { findRefsIncludingDeleted: vi.fn(async () => [{ id: 'receta-1', name: 'Desengrasante' }]) },
    people: { findRefsIncludingDeletedInCompany: vi.fn(async () => []) },
    presentations: { findRefs: vi.fn(async () => [{ id: 'presentacion-1', name: 'Botella 1L' }]) },
    products: { findFinishedGoodsReceipts },
    now: () => new Date('2026-09-25T12:00:00.000Z'),
  } as unknown as GetPackingOrderDeps;

  return { deps, listAliveSummariesByIds, findFinishedGoodsReceipts };
}

describe('getPackingOrder — autorizacion (R13)', () => {
  it('actor ausente rechaza sin tocar ningun puerto', async () => {
    const { deps, listAliveSummariesByIds } = montar();
    const getPackingOrder = createGetPackingOrder(deps);

    await expect(getPackingOrder(null, { orderId: PEDIDO })).rejects.toBeInstanceOf(AsignacionesError);
    expect(listAliveSummariesByIds).not.toHaveBeenCalled();
  });

  it('actor sin `empaque.modificar` rechaza con `unauthorized` sin tocar ningun puerto', async () => {
    const { deps, listAliveSummariesByIds } = montar();
    const getPackingOrder = createGetPackingOrder(deps);
    const actor: Actor = { id: ANA, companyId: EMPRESA, permissions: [] };

    await expect(getPackingOrder(actor, { orderId: PEDIDO })).rejects.toThrow(UnauthorizedError);
    expect(listAliveSummariesByIds).not.toHaveBeenCalled();
  });
});

describe('getPackingOrder — la misma fila que `listPackingOrders`', () => {
  it('devuelve numero, receta, presentacion, envases, estado y quien empaca', async () => {
    const { deps, listAliveSummariesByIds } = montar();
    const getPackingOrder = createGetPackingOrder(deps);

    const row = await getPackingOrder(ACTOR, { orderId: PEDIDO });

    expect(listAliveSummariesByIds).toHaveBeenCalledWith(EMPRESA, [PEDIDO], ['POR_EMPACAR', 'EN_EMPAQUE'], 1, 1);
    expect(row).toEqual({
      id: PEDIDO,
      numberText: expect.any(String),
      recipeName: 'Desengrasante',
      presentationName: 'Botella 1L',
      packages: '5',
      status: 'POR_EMPACAR',
      packedByName: null,
      packedById: null,
    });
  });

  it('R17: en `EN_EMPAQUE`, `packedById` trae el id de quien empaca', async () => {
    const { deps } = montar({ items: [RESUMEN_EN_EMPAQUE] });
    const getPackingOrder = createGetPackingOrder(deps);

    const row = await getPackingOrder(ACTOR, { orderId: PEDIDO });

    expect(row.packedById).toBe(BETO);
  });
});

describe('getPackingOrder — R24: no existe, esta de baja, es de otra empresa o esta en otro estado', () => {
  it('sin filas rechaza con `order_not_found`', async () => {
    const { deps } = montar({ items: [] });
    const getPackingOrder = createGetPackingOrder(deps);

    await expect(getPackingOrder(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(OrderNotFoundError);
  });
});
