// tests/unit/asignaciones/list-packing-orders.test.ts
import { describe, expect, it, vi } from 'vitest';

import { createListPackingOrders, type ListPackingOrdersDeps } from '@/lib/modules/asignaciones/domain/list-packing-orders';
import { AsignacionesError, UnauthorizedError, ValidationError } from '@/lib/modules/asignaciones/domain/errors';

import type { Actor } from '@/lib/modules/asignaciones/domain/actor';

function uuid(seed: string): string {
  return `${seed.repeat(8)}-${seed.repeat(4)}-4${seed.repeat(3)}-8${seed.repeat(3)}-${seed.repeat(12)}`;
}

const EMPRESA = uuid('3');
const ANA = uuid('1');
const BETO = uuid('2');
const PEDIDO_1 = uuid('7');
const PEDIDO_2 = uuid('8');

const ACTOR: Actor = { id: ANA, companyId: EMPRESA, permissions: ['empaque.modificar'] };

const RESUMEN_1 = {
  id: PEDIDO_1,
  number: { year: 2026, sequence: 7 },
  recipeId: 'receta-1',
  quantity: '10.0000',
  priority: 'ALTA',
  status: 'POR_EMPACAR',
  presentationId: 'presentacion-1',
  finishedAt: null,
  packedBy: null,
};

const RESUMEN_2 = {
  id: PEDIDO_2,
  number: { year: 2026, sequence: 8 },
  recipeId: 'receta-2',
  quantity: '20.0000',
  priority: 'MEDIA',
  status: 'EN_EMPAQUE',
  presentationId: 'presentacion-1',
  finishedAt: null,
  packedBy: BETO,
};

type Dobles = {
  readonly deps: ListPackingOrdersDeps;
  readonly listAliveSummariesInCompany: ReturnType<typeof vi.fn>;
  readonly findRefsIncludingDeleted: ReturnType<typeof vi.fn>;
  readonly findRefsPresentations: ReturnType<typeof vi.fn>;
  readonly findFinishedGoodsReceipts: ReturnType<typeof vi.fn>;
  readonly findRefsIncludingDeletedInCompany: ReturnType<typeof vi.fn>;
  readonly listByOrdersInCompany: ReturnType<typeof vi.fn>;
};

function montar(): Dobles {
  const listAliveSummariesInCompany = vi.fn(async () => ({
    items: [RESUMEN_1, RESUMEN_2],
    total: 2,
    page: 1,
    pageSize: 10,
    totalPages: 1,
  }));
  const findRefsIncludingDeleted = vi.fn(async () => [{ id: 'receta-1', name: 'Desengrasante' }, { id: 'receta-2', name: 'Limpiador' }]);
  const findRefsPresentations = vi.fn(async () => [{ id: 'presentacion-1', name: 'Botella 1L' }]);
  const findFinishedGoodsReceipts = vi.fn(async () => [
    { orderId: PEDIDO_1, packages: '5' },
    { orderId: PEDIDO_2, packages: '3' },
  ]);
  const findRefsIncludingDeletedInCompany = vi.fn(async () => [{ id: BETO, displayName: 'Beto', isActive: true, permissions: [] }]);
  const listByOrdersInCompany = vi.fn(async () => []);

  const deps = {
    orders: { listAliveSummariesInCompany },
    assignments: { listByOrdersInCompany },
    recipes: { findRefsIncludingDeleted },
    people: { findRefsIncludingDeletedInCompany },
    presentations: { findRefs: findRefsPresentations },
    products: { findFinishedGoodsReceipts },
    now: () => new Date('2026-09-25T12:00:00.000Z'),
  } as unknown as ListPackingOrdersDeps;

  return {
    deps,
    listAliveSummariesInCompany,
    findRefsIncludingDeleted,
    findRefsPresentations,
    findFinishedGoodsReceipts,
    findRefsIncludingDeletedInCompany,
    listByOrdersInCompany,
  };
}

describe('listPackingOrders — autorizacion (R13)', () => {
  it('actor ausente rechaza sin tocar ningun puerto', async () => {
    const { deps, listAliveSummariesInCompany, findFinishedGoodsReceipts } = montar();
    const listPackingOrders = createListPackingOrders(deps);

    await expect(listPackingOrders(null, { page: 1 })).rejects.toBeInstanceOf(AsignacionesError);
    expect(listAliveSummariesInCompany).not.toHaveBeenCalled();
    expect(findFinishedGoodsReceipts).not.toHaveBeenCalled();
  });

  it('actor sin conjunto de permisos rechaza sin tocar ningun puerto', async () => {
    const { deps, listAliveSummariesInCompany } = montar();
    const listPackingOrders = createListPackingOrders(deps);

    await expect(
      listPackingOrders({ id: ANA, companyId: EMPRESA } as unknown as Actor, { page: 1 }),
    ).rejects.toBeInstanceOf(AsignacionesError);
    expect(listAliveSummariesInCompany).not.toHaveBeenCalled();
  });

  it('actor sin `empaque.modificar` rechaza con `unauthorized` sin tocar ningun puerto', async () => {
    const { deps, listAliveSummariesInCompany } = montar();
    const listPackingOrders = createListPackingOrders(deps);
    const actor: Actor = { id: ANA, companyId: EMPRESA, permissions: ['asignaciones.consultar'] };

    await expect(listPackingOrders(actor, { page: 1 })).rejects.toThrow(UnauthorizedError);
    expect(listAliveSummariesInCompany).not.toHaveBeenCalled();
  });

  it('la autorizacion corre ANTES que zod: entrada invalida con actor sin permiso sigue dando `unauthorized`', async () => {
    const { deps } = montar();
    const listPackingOrders = createListPackingOrders(deps);

    await expect(
      listPackingOrders({ id: ANA, companyId: EMPRESA, permissions: [] }, { page: 0 }),
    ).rejects.toThrow(UnauthorizedError);
  });
});

describe('listPackingOrders — R14, R15, R16: los dos estados de la empresa, con los seis datos, en orden de trabajo', () => {
  it('pide `POR_EMPACAR` y `EN_EMPAQUE` de la empresa del actor, en el orden `work_queue`', async () => {
    const { deps, listAliveSummariesInCompany } = montar();
    const listPackingOrders = createListPackingOrders(deps);

    await listPackingOrders(ACTOR, { page: 1 });

    expect(listAliveSummariesInCompany).toHaveBeenCalledWith(
      EMPRESA,
      ['POR_EMPACAR', 'EN_EMPAQUE'],
      'work_queue',
      1,
      undefined,
    );
  });

  it('cada fila trae numero, receta, presentacion, envases, estado y quien empaca (vacio en POR_EMPACAR)', async () => {
    const { deps } = montar();
    const listPackingOrders = createListPackingOrders(deps);

    const page = await listPackingOrders(ACTOR, { page: 1 });

    expect(page.items).toEqual([
      {
        id: PEDIDO_1,
        numberText: expect.any(String),
        recipeName: 'Desengrasante',
        presentationName: 'Botella 1L',
        packages: '5',
        status: 'POR_EMPACAR',
        packedByName: null,
        packedById: null,
      },
      {
        id: PEDIDO_2,
        numberText: expect.any(String),
        recipeName: 'Limpiador',
        presentationName: 'Botella 1L',
        packages: '3',
        status: 'EN_EMPAQUE',
        packedByName: 'Beto',
        packedById: BETO,
      },
    ]);
  });

  it('R14/R17: `packedById` trae el id de quien empaca en EN_EMPAQUE y null en POR_EMPACAR', async () => {
    const { deps } = montar();
    const listPackingOrders = createListPackingOrders(deps);

    const page = await listPackingOrders(ACTOR, { page: 1 });

    const porEmpacar = page.items.find((item) => item.id === PEDIDO_1);
    const enEmpaque = page.items.find((item) => item.id === PEDIDO_2);
    expect(porEmpacar?.packedById).toBeNull();
    expect(enEmpaque?.packedById).toBe(BETO);
  });

  it('respeta la paginacion pedida', async () => {
    const { deps, listAliveSummariesInCompany } = montar();
    const listPackingOrders = createListPackingOrders(deps);

    await listPackingOrders(ACTOR, { page: 2, pageSize: 5 });

    expect(listAliveSummariesInCompany).toHaveBeenCalledWith(EMPRESA, ['POR_EMPACAR', 'EN_EMPAQUE'], 'work_queue', 2, 5);
  });

  it('una entrada que no pasa zod rechaza con `invalid_input`', async () => {
    const { deps, listAliveSummariesInCompany } = montar();
    const listPackingOrders = createListPackingOrders(deps);

    await expect(listPackingOrders(ACTOR, { page: 0 })).rejects.toThrow(ValidationError);
    expect(listAliveSummariesInCompany).not.toHaveBeenCalled();
  });
});

describe('listPackingOrders — R25: ningun puerto de escritura de inventario', () => {
  it('solo llama a la lectura `findFinishedGoodsReceipts`, nunca una escritura', async () => {
    const { deps, findFinishedGoodsReceipts } = montar();
    const listPackingOrders = createListPackingOrders(deps);

    await listPackingOrders(ACTOR, { page: 1 });

    expect(findFinishedGoodsReceipts).toHaveBeenCalledWith([PEDIDO_1, PEDIDO_2], EMPRESA);
    // `deps.products` solo declara la lectura en este test: no hay ninguna funcion de escritura
    // que pudiera haberse llamado por error.
    expect(Object.keys(deps.products)).toEqual(['findFinishedGoodsReceipts']);
  });
});
