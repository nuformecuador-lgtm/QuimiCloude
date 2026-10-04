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
  presentationLines: [{ presentationId: 'presentacion-1', packages: 1, packagingName: null }],
  unitId: 'unidad-1',
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
    recipes: { findRefsIncludingDeleted: vi.fn(async () => [{ id: 'receta-1', name: 'Desengrasante', ownName: 'Desengrasante', isUnderReview: false, original: null, isDeleted: false }]) },
    people: { findRefsIncludingDeletedInCompany: vi.fn(async () => []) },
    presentations: {
      findRefs: vi.fn(async () => [
        { id: 'presentacion-1', name: 'Botella 1L' },
        { id: 'presentacion-2', name: 'Botella 200 ml' },
      ]),
    },
    units: {
      findRefs: vi.fn(async () => [{ id: 'unidad-1', name: 'Litro', symbol: 'L', baseUnitId: null, factor: null }]),
    },
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
      quantity: '10.0000',
      presentationLines: [{ presentationId: 'presentacion-1', presentationName: 'Botella 1L', packages: 1, packagingName: null }],
      unitId: 'unidad-1',
      unitLabel: 'L',
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

describe('QC-170 — getPackingOrder: el reparto y la unidad para la pantalla del Empacador', () => {
  it('R47: trae TODAS las lineas del reparto en orden de alta y la cantidad con la etiqueta de su unidad', async () => {
    const conDosLineas = {
      ...RESUMEN,
      presentationLines: [
        { presentationId: 'presentacion-2', packages: 5, packagingName: null },
        { presentationId: 'presentacion-1', packages: 1, packagingName: null },
      ],
    };
    const { deps } = montar({ items: [conDosLineas] });
    const getPackingOrder = createGetPackingOrder(deps);

    const row = await getPackingOrder(ACTOR, { orderId: PEDIDO });

    expect(row.presentationLines).toEqual([
      { presentationId: 'presentacion-2', presentationName: 'Botella 200 ml', packages: 5, packagingName: null },
      { presentationId: 'presentacion-1', presentationName: 'Botella 1L', packages: 1, packagingName: null },
    ]);
    expect(row.quantity).toBe('10.0000');
    expect(row.unitLabel).toBe('L');
  });

  it('R47: un `POR_EMPACAR` sin lineas sale con `presentationLines: []` y su estado, para que la pantalla avise que falta el reparto', async () => {
    const { deps } = montar({ items: [{ ...RESUMEN, presentationLines: [] }] });
    const getPackingOrder = createGetPackingOrder(deps);

    const row = await getPackingOrder(ACTOR, { orderId: PEDIDO });

    expect(row.status).toBe('POR_EMPACAR');
    expect(row.presentationLines).toEqual([]);
  });

  it('R44: la linea con envase llega a la pantalla de empaque con su nombre y la antigua con `packagingName: null` (R33)', async () => {
    const conEnvase = {
      ...RESUMEN,
      presentationLines: [
        { presentationId: 'presentacion-1', packages: 3, packagingName: 'Envase PET 1L' },
        { presentationId: 'presentacion-2', packages: 2, packagingName: null },
      ],
    };
    const { deps } = montar({ items: [conEnvase] });
    const getPackingOrder = createGetPackingOrder(deps);

    const row = await getPackingOrder(ACTOR, { orderId: PEDIDO });

    expect(row.presentationLines).toEqual([
      { presentationId: 'presentacion-1', presentationName: 'Botella 1L', packages: 3, packagingName: 'Envase PET 1L' },
      { presentationId: 'presentacion-2', presentationName: 'Botella 200 ml', packages: 2, packagingName: null },
    ]);
  });

  it('R42: un pedido sin unidad sale con `unitId` y `unitLabel` a null', async () => {
    const { deps } = montar({ items: [{ ...RESUMEN, unitId: null }] });
    const getPackingOrder = createGetPackingOrder(deps);

    const row = await getPackingOrder(ACTOR, { orderId: PEDIDO });

    expect(row.unitId).toBeNull();
    expect(row.unitLabel).toBeNull();
  });
});
