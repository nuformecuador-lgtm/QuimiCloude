// tests/unit/asignaciones/list-finished-orders.test.ts
//
// «Terminados»: los `ENTREGADO` de toda la empresa, sin filtro por usuario asignado, ordenados por
// fecha de terminado. A diferencia de «Mis asignados», los responsables incluyen al propio actor.

import { describe, expect, it, vi } from 'vitest';

import {
  createListFinishedOrders,
  type ListFinishedOrdersDeps,
} from '@/lib/modules/asignaciones/domain/list-finished-orders';
import { AsignacionesError, UnauthorizedError, ValidationError } from '@/lib/modules/asignaciones/domain/errors';

import type { Actor } from '@/lib/modules/asignaciones/domain/actor';
import type { OrderAssignmentRowWithOrder } from '@/lib/modules/asignaciones/ports/order-assignment-repository';
import type { PersonRef } from '@/lib/modules/identity';
import type { PresentationCatalog, PresentationRef } from '@/lib/modules/inventario';
import type { AssignedOrderSummary, OrderCatalog } from '@/lib/modules/pedidos';
import type { RecipeCatalog, RecipeRef } from '@/lib/modules/recetas';

/** Un uuid valido y legible a partir de un solo digito hexadecimal. */
function uuid(seed: string): string {
  return `${seed.repeat(8)}-${seed.repeat(4)}-4${seed.repeat(3)}-8${seed.repeat(3)}-${seed.repeat(12)}`;
}

const EMPRESA = uuid('3');
const ANA = uuid('1');
const BEA = uuid('2');
const RECETA = uuid('a');

const ACTOR: Actor = { id: ANA, companyId: EMPRESA, permissions: ['terminados.consultar'] };

function pedidoId(i: number): string {
  const sufijo = i.toString(16).padStart(2, '0');
  return `555555${sufijo}-5555-4555-8555-5555555555${sufijo}`;
}

function resumen(id: string, overrides?: Partial<AssignedOrderSummary>): AssignedOrderSummary {
  return {
    id,
    number: { year: 2026, sequence: 1 },
    recipeId: RECETA,
    quantity: '10.0000',
    priority: 'MEDIA',
    status: 'ENTREGADO',
    presentationId: null,
    finishedAt: new Date('2026-09-20T10:00:00.000Z'),
    packedBy: null,
    ...overrides,
  };
}

function receta(overrides?: Partial<RecipeRef>): RecipeRef {
  return { id: RECETA, name: 'Jabon liquido', isDeleted: false, ...overrides };
}

function persona(id: string): PersonRef {
  return { id, displayName: `Persona ${id.slice(0, 1)}`, isActive: true, permissions: [] };
}

function filaSuelta(orderId: string, userId: string): OrderAssignmentRowWithOrder {
  return { orderId, userId, workGroupId: null, workGroupName: null };
}

function montar(options?: {
  readonly page?: { items: readonly AssignedOrderSummary[]; total: number };
  readonly refs?: readonly RecipeRef[];
  readonly rows?: readonly OrderAssignmentRowWithOrder[];
  readonly people?: readonly PersonRef[];
  readonly presentations?: readonly PresentationRef[];
}) {
  const paginaDePedidos = options?.page ?? { items: [], total: 0 };

  const listAliveSummariesInCompany = vi.fn(
    async (
      _companyId: string,
      _statuses: readonly string[],
      _ordering: string,
      page: number,
      pageSize?: number,
    ) => {
      const size = pageSize ?? 10;
      return {
        items: paginaDePedidos.items,
        total: paginaDePedidos.total,
        page,
        pageSize: size,
        totalPages: Math.max(1, Math.ceil(paginaDePedidos.total / size)),
      };
    },
  );

  const listByOrdersInCompany = vi.fn(async () => options?.rows ?? []);
  const findRefsIncludingDeleted = vi.fn(async () => options?.refs ?? []);
  const findRefsIncludingDeletedInCompany = vi.fn(async () => options?.people ?? []);
  const findRefsPresentations = vi.fn(async () => options?.presentations ?? []);

  const deps: ListFinishedOrdersDeps = {
    assignments: {
      insertMissing: vi.fn(),
      listByOrderInCompany: vi.fn(),
      listByOrdersInCompany,
      deleteOne: vi.fn(),
      deleteByWorkGroup: vi.fn(),
      listOrderIdsByUserInCompany: vi.fn(),
    },
    orders: { listAliveSummariesInCompany } as unknown as OrderCatalog,
    recipes: { findRefsIncludingDeleted } as unknown as RecipeCatalog,
    people: { findRefsIncludingDeletedInCompany },
    presentations: { findRefs: findRefsPresentations } as unknown as PresentationCatalog,
    now: () => new Date('2026-09-23T10:00:00.000Z'),
  } as unknown as ListFinishedOrdersDeps;

  return {
    deps,
    listAliveSummariesInCompany,
    listByOrdersInCompany,
    findRefsIncludingDeleted,
    findRefsIncludingDeletedInCompany,
    findRefsPresentations,
    todos: [
      listAliveSummariesInCompany,
      listByOrdersInCompany,
      findRefsIncludingDeleted,
      findRefsIncludingDeletedInCompany,
      findRefsPresentations,
    ],
  };
}

describe('QC-145 — listFinishedOrders: autorizacion (R18)', () => {
  it('R18: exige `terminados.consultar` ANTES de validar la entrada y ANTES de tocar ningun puerto', async () => {
    const { deps, todos } = montar();
    const listFinishedOrders = createListFinishedOrders(deps);

    // Una entrada invalida NO enmascara la falta de permiso: si autorizar corriera despues de
    // validar, esta llamada con `page: 0` lanzaria `ValidationError` en vez de `UnauthorizedError`.
    await expect(
      listFinishedOrders({ id: ANA, companyId: EMPRESA, permissions: [] }, { page: 0 }),
    ).rejects.toThrow(UnauthorizedError);
    for (const doble of todos) expect(doble).not.toHaveBeenCalled();
  });

  it('los cuatro actores invalidos se rechazan igual, sin leer nada', async () => {
    const casos: readonly (Actor | null | undefined)[] = [
      null,
      undefined,
      { id: ANA, companyId: EMPRESA } as unknown as Actor,
      { id: ANA, companyId: EMPRESA, permissions: [] },
    ];

    for (const actor of casos) {
      const { deps, todos } = montar();
      const listFinishedOrders = createListFinishedOrders(deps);
      await expect(listFinishedOrders(actor, { page: 1 })).rejects.toBeInstanceOf(AsignacionesError);
      for (const doble of todos) expect(doble).not.toHaveBeenCalled();
    }
  });

  it('`pedidos.consultar` no sustituye a `terminados.consultar`', async () => {
    const { deps, listAliveSummariesInCompany } = montar();
    const listFinishedOrders = createListFinishedOrders(deps);

    await expect(
      listFinishedOrders({ id: ANA, companyId: EMPRESA, permissions: ['pedidos.consultar'] }, { page: 1 }),
    ).rejects.toThrow(UnauthorizedError);
    expect(listAliveSummariesInCompany).not.toHaveBeenCalled();
  });
});

describe('QC-145 — listFinishedOrders: la entrada', () => {
  it('rechaza una entrada invalida SIN tocar ningun puerto', async () => {
    const { deps, todos } = montar();
    const listFinishedOrders = createListFinishedOrders(deps);

    await expect(listFinishedOrders(ACTOR, { page: 0 })).rejects.toThrow(ValidationError);
    await expect(listFinishedOrders(ACTOR, { page: 1, extra: true })).rejects.toThrow(ValidationError);
    for (const doble of todos) expect(doble).not.toHaveBeenCalled();
  });
});

describe('QC-145 — listFinishedOrders: R17 pedidos ENTREGADO de toda la empresa', () => {
  it('consulta el catalogo con la empresa del actor, solo ENTREGADO y el orden de terminados', async () => {
    const { deps, listAliveSummariesInCompany } = montar();
    const listFinishedOrders = createListFinishedOrders(deps);

    await listFinishedOrders(ACTOR, { page: 1 });

    expect(listAliveSummariesInCompany).toHaveBeenCalledWith(
      EMPRESA,
      ['ENTREGADO'],
      'finished_recent_first',
      1,
      undefined,
    );
  });
});

describe('QC-145 — listFinishedOrders: R19 estado vacio sin error', () => {
  it('sin ningun pedido que cumpla, devuelve una pagina vacia', async () => {
    const { deps } = montar({ page: { items: [], total: 0 } });
    const listFinishedOrders = createListFinishedOrders(deps);

    const pagina = await listFinishedOrders(ACTOR, { page: 1 });

    expect(pagina).toEqual({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 1 });
  });
});

describe('QC-145 — listFinishedOrders: R21 la fila y sus responsables', () => {
  it('el actor SI aparece entre los responsables de su propio pedido terminado', async () => {
    const items = [resumen(pedidoId(1))];
    const rows = [filaSuelta(pedidoId(1), ANA), filaSuelta(pedidoId(1), BEA)];
    const { deps } = montar({
      page: { items, total: 1 },
      refs: [receta()],
      rows,
      people: [persona(ANA), persona(BEA)],
    });
    const listFinishedOrders = createListFinishedOrders(deps);

    const pagina = await listFinishedOrders(ACTOR, { page: 1 });

    const responsables = pagina.items[0]?.responsibles ?? [];
    expect(responsables.map((r) => r.userId).sort()).toEqual([ANA, BEA].sort());
  });

  it('sin fecha, el pedido sale con `finishedAt: null`; sin responsables, la lista sale vacia', async () => {
    const items = [resumen(pedidoId(1), { finishedAt: null })];
    const { deps } = montar({ page: { items, total: 1 }, refs: [receta()] });
    const listFinishedOrders = createListFinishedOrders(deps);

    const pagina = await listFinishedOrders(ACTOR, { page: 1 });

    expect(pagina.items[0]?.finishedAt).toBeNull();
    expect(pagina.items[0]?.responsibles).toEqual([]);
  });

  it('sin presentacion ni receta resueltas, salen `null` y no el identificador', async () => {
    const items = [resumen(pedidoId(1), { presentationId: null })];
    const { deps } = montar({ page: { items, total: 1 }, refs: [] });
    const listFinishedOrders = createListFinishedOrders(deps);

    const pagina = await listFinishedOrders(ACTOR, { page: 1 });

    expect(pagina.items[0]?.recipeName).toBeNull();
    expect(pagina.items[0]?.presentationName).toBeNull();
  });

  it('la fila expone exactamente las claves del contrato, sin importe ni otros datos', async () => {
    const items = [resumen(pedidoId(1))];
    const { deps } = montar({ page: { items, total: 1 }, refs: [receta()] });
    const listFinishedOrders = createListFinishedOrders(deps);

    const pagina = await listFinishedOrders(ACTOR, { page: 1 });

    expect(Object.keys(pagina.items[0] ?? {}).sort()).toEqual(
      ['id', 'numberText', 'recipeName', 'quantity', 'presentationName', 'finishedAt', 'responsibles'].sort(),
    );
  });
});

describe('QC-145 — listFinishedOrders: R27 paginacion delegada al catalogo', () => {
  it('propaga page y pageSize a `listAliveSummariesInCompany` y refleja su `Page` de salida', async () => {
    const { deps, listAliveSummariesInCompany } = montar({ page: { items: [], total: 0 } });
    const listFinishedOrders = createListFinishedOrders(deps);

    const pagina = await listFinishedOrders(ACTOR, { page: 2, pageSize: 25 });

    expect(listAliveSummariesInCompany).toHaveBeenCalledWith(EMPRESA, ['ENTREGADO'], 'finished_recent_first', 2, 25);
    expect(pagina.page).toBe(2);
    expect(pagina.pageSize).toBe(25);
  });
});
