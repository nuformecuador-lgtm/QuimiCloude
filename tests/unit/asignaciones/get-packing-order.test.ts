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
  readonly findPackingStepsById: ReturnType<typeof vi.fn>;
  readonly todos: readonly ReturnType<typeof vi.fn>[];
};

function paso(text: string) {
  return { blocks: [{ kind: 'paragraph' as const, spans: [{ text }] }] };
}

const ENVASAR = paso('Envasar en garrafas de 5 L');
const ETIQUETAR = paso('Etiquetar con el lote');
const MEZCLAR_OPERADOR = 'Mezclar en frio 10 minutos';

function montar(options?: {
  readonly items?: readonly unknown[];
  readonly packingSteps?: readonly unknown[] | null;
}): Dobles {
  const listAliveSummariesByIds = vi.fn(async () => ({
    items: options?.items ?? [RESUMEN],
    total: (options?.items ?? [RESUMEN]).length,
    page: 1,
    pageSize: 1,
    totalPages: 1,
  }));
  const findFinishedGoodsReceipts = vi.fn(async () => [{ orderId: PEDIDO, packages: '5' }]);
  const findPackingStepsById = vi.fn(async () =>
    options?.packingSteps === undefined ? [ENVASAR, ETIQUETAR] : options.packingSteps,
  );
  const listByOrdersInCompany = vi.fn(async () => []);
  const findRefsIncludingDeleted = vi.fn(async () => [{ id: 'receta-1', name: 'Desengrasante', ownName: 'Desengrasante', isUnderReview: false, original: null, isDeleted: false }]);
  const findRefsIncludingDeletedInCompany = vi.fn(async () => []);
  const findPresentationRefs = vi.fn(async () => [
    { id: 'presentacion-1', name: 'Botella 1L' },
    { id: 'presentacion-2', name: 'Botella 200 ml' },
  ]);
  const findUnitRefs = vi.fn(async () => [{ id: 'unidad-1', name: 'Litro', symbol: 'L', baseUnitId: null, factor: null }]);

  const deps = {
    orders: { listAliveSummariesByIds },
    assignments: { listByOrdersInCompany },
    recipes: { findRefsIncludingDeleted },
    people: { findRefsIncludingDeletedInCompany },
    presentations: { findRefs: findPresentationRefs },
    units: { findRefs: findUnitRefs },
    products: { findFinishedGoodsReceipts },
    packingSteps: { findPackingStepsById },
    now: () => new Date('2026-09-25T12:00:00.000Z'),
  } as unknown as GetPackingOrderDeps;

  return {
    deps,
    listAliveSummariesByIds,
    findFinishedGoodsReceipts,
    findPackingStepsById,
    todos: [
      listAliveSummariesByIds,
      listByOrdersInCompany,
      findRefsIncludingDeleted,
      findRefsIncludingDeletedInCompany,
      findPresentationRefs,
      findUnitRefs,
      findFinishedGoodsReceipts,
      findPackingStepsById,
    ],
  };
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
      packingSteps: [],
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

describe('QC-211 — getPackingOrder: los pasos de envasado', () => {
  const RESUMEN_DEL_ACTOR = { ...RESUMEN, status: 'EN_EMPAQUE', packedBy: ANA };

  it('R19: en `POR_EMPACAR` devuelve `packingSteps: []` sin llamar al lector', async () => {
    const { deps, findPackingStepsById } = montar();
    const getPackingOrder = createGetPackingOrder(deps);

    const row = await getPackingOrder(ACTOR, { orderId: PEDIDO });

    expect(row.packingSteps).toEqual([]);
    expect(findPackingStepsById).not.toHaveBeenCalled();
  });

  it('R22: en `EN_EMPAQUE` a nombre de otro devuelve `packingSteps: []` sin llamar al lector', async () => {
    const { deps, findPackingStepsById } = montar({ items: [RESUMEN_EN_EMPAQUE] });
    const getPackingOrder = createGetPackingOrder(deps);

    const row = await getPackingOrder(ACTOR, { orderId: PEDIDO });

    expect(row.packingSteps).toEqual([]);
    expect(findPackingStepsById).not.toHaveBeenCalled();
  });

  it('R20: en `EN_EMPAQUE` del actor devuelve los pasos del lector, en orden', async () => {
    const { deps, findPackingStepsById } = montar({ items: [RESUMEN_DEL_ACTOR] });
    const getPackingOrder = createGetPackingOrder(deps);

    const row = await getPackingOrder(ACTOR, { orderId: PEDIDO });

    expect(row.packingSteps).toEqual([ENVASAR, ETIQUETAR]);
    expect(findPackingStepsById).toHaveBeenCalledTimes(1);
  });

  it('R20, R29: si el lector devuelve `null` (otra empresa o inexistente) la salida trae `[]`', async () => {
    const { deps } = montar({ items: [RESUMEN_DEL_ACTOR], packingSteps: null });
    const getPackingOrder = createGetPackingOrder(deps);

    const row = await getPackingOrder(ACTOR, { orderId: PEDIDO });

    expect(row.packingSteps).toEqual([]);
  });

  it('R29: el lector recibe la receta del pedido y la empresa del actor', async () => {
    const { deps, findPackingStepsById } = montar({ items: [RESUMEN_DEL_ACTOR] });
    const getPackingOrder = createGetPackingOrder(deps);

    await getPackingOrder(ACTOR, { orderId: PEDIDO });

    expect(findPackingStepsById).toHaveBeenCalledWith('receta-1', EMPRESA);
  });

  it('R27: la salida no tiene ninguna clave con los pasos del operador', async () => {
    const { deps } = montar({ items: [RESUMEN_DEL_ACTOR] });
    const getPackingOrder = createGetPackingOrder(deps);

    const row = await getPackingOrder(ACTOR, { orderId: PEDIDO });

    expect(Object.keys(row).filter((key) => /steps/i.test(key))).toEqual(['packingSteps']);
    expect(JSON.stringify(row)).not.toContain(MEZCLAR_OPERADOR);
  });

  it('R28: un actor con solo `empaque.modificar` recibe los pasos', async () => {
    const { deps } = montar({ items: [RESUMEN_DEL_ACTOR] });
    const getPackingOrder = createGetPackingOrder(deps);
    const soloEmpaque: Actor = { id: ANA, companyId: EMPRESA, permissions: ['empaque.modificar'] };

    const row = await getPackingOrder(soloEmpaque, { orderId: PEDIDO });

    expect(row.packingSteps).toEqual([ENVASAR, ETIQUETAR]);
  });

  it('R28: sin `empaque.modificar` rechaza antes de validar y sin llamar a ningun puerto, lector incluido', async () => {
    const { deps, todos } = montar({ items: [RESUMEN_DEL_ACTOR] });
    const getPackingOrder = createGetPackingOrder(deps);
    const sinPermiso: Actor = {
      id: ANA,
      companyId: EMPRESA,
      permissions: ['recetas.consultar', 'asignaciones.ejecutar'],
    };

    await expect(getPackingOrder(sinPermiso, { orderId: 'no-es-uuid' })).rejects.toThrow(UnauthorizedError);
    for (const doble of todos) expect(doble).not.toHaveBeenCalled();
  });
});
