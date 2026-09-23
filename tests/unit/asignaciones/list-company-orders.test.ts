// tests/unit/asignaciones/list-company-orders.test.ts
//
// «Todos»: los pedidos de la empresa en cualquier estado, sin filtro por usuario asignado.
// Filtrado por exactamente ENTREGADO, el orden es el de terminados; con cualquier otra
// combinacion, el de la lista de trabajo.

import { describe, expect, it, vi } from 'vitest';

import {
  createListCompanyOrders,
  type ListCompanyOrdersDeps,
} from '@/lib/modules/asignaciones/domain/list-company-orders';
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
const RECETA = uuid('a');

const ACTOR: Actor = { id: ANA, companyId: EMPRESA, permissions: ['pedidos.consultar'] };

function pedidoId(i: number): string {
  const sufijo = i.toString(16).padStart(2, '0');
  return `666666${sufijo}-6666-4666-8666-6666666666${sufijo}`;
}

function resumen(id: string, overrides?: Partial<AssignedOrderSummary>): AssignedOrderSummary {
  return {
    id,
    number: { year: 2026, sequence: 1 },
    recipeId: RECETA,
    quantity: '10.0000',
    priority: 'MEDIA',
    status: 'PENDIENTE',
    presentationId: null,
    finishedAt: null,
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

  const deps: ListCompanyOrdersDeps = {
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
  } as unknown as ListCompanyOrdersDeps;

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

describe('QC-145 — listCompanyOrders: autorizacion (R23)', () => {
  it('R23: exige `pedidos.consultar` ANTES de validar la entrada y ANTES de tocar ningun puerto', async () => {
    const { deps, todos } = montar();
    const listCompanyOrders = createListCompanyOrders(deps);

    await expect(
      listCompanyOrders({ id: ANA, companyId: EMPRESA, permissions: [] }, { page: 0 }),
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
      const listCompanyOrders = createListCompanyOrders(deps);
      await expect(listCompanyOrders(actor, { page: 1 })).rejects.toBeInstanceOf(AsignacionesError);
      for (const doble of todos) expect(doble).not.toHaveBeenCalled();
    }
  });

  it('`terminados.consultar` ni `asignaciones.consultar` sustituyen a `pedidos.consultar`', async () => {
    const { deps, listAliveSummariesInCompany } = montar();
    const listCompanyOrders = createListCompanyOrders(deps);

    await expect(
      listCompanyOrders({ id: ANA, companyId: EMPRESA, permissions: ['terminados.consultar'] }, { page: 1 }),
    ).rejects.toThrow(UnauthorizedError);
    await expect(
      listCompanyOrders({ id: ANA, companyId: EMPRESA, permissions: ['asignaciones.consultar'] }, { page: 1 }),
    ).rejects.toThrow(UnauthorizedError);
    expect(listAliveSummariesInCompany).not.toHaveBeenCalled();
  });
});

describe('QC-145 — listCompanyOrders: la entrada', () => {
  it('rechaza una entrada invalida SIN tocar ningun puerto', async () => {
    const { deps, todos } = montar();
    const listCompanyOrders = createListCompanyOrders(deps);

    await expect(listCompanyOrders(ACTOR, { page: 0 })).rejects.toThrow(ValidationError);
    await expect(listCompanyOrders(ACTOR, { page: 1, extra: true })).rejects.toThrow(ValidationError);
    await expect(listCompanyOrders(ACTOR, { page: 1, statuses: [] })).rejects.toThrow(ValidationError);
    await expect(listCompanyOrders(ACTOR, { page: 1, statuses: ['NO_EXISTE'] })).rejects.toThrow(ValidationError);
    for (const doble of todos) expect(doble).not.toHaveBeenCalled();
  });
});

describe('QC-145 — listCompanyOrders: R22 sin filtro trae los cuatro estados', () => {
  it('sin `statuses`, consulta con los cuatro estados y el orden de la lista de trabajo', async () => {
    const { deps, listAliveSummariesInCompany } = montar();
    const listCompanyOrders = createListCompanyOrders(deps);

    await listCompanyOrders(ACTOR, { page: 1 });

    expect(listAliveSummariesInCompany).toHaveBeenCalledWith(
      EMPRESA,
      ['PENDIENTE', 'EN_CURSO', 'ENTREGADO', 'CANCELADO'],
      'work_queue',
      1,
      undefined,
    );
  });
});

describe('QC-145 — listCompanyOrders: R24/D16 el orden depende del filtro', () => {
  it('exactamente `ENTREGADO` ordena como «Terminados»', async () => {
    const { deps, listAliveSummariesInCompany } = montar();
    const listCompanyOrders = createListCompanyOrders(deps);

    await listCompanyOrders(ACTOR, { page: 1, statuses: ['ENTREGADO'] });

    expect(listAliveSummariesInCompany).toHaveBeenCalledWith(
      EMPRESA,
      ['ENTREGADO'],
      'finished_recent_first',
      1,
      undefined,
    );
  });

  it('`ENTREGADO` duplicado, y solo eso, sigue contando como exactamente ENTREGADO', async () => {
    const { deps, listAliveSummariesInCompany } = montar();
    const listCompanyOrders = createListCompanyOrders(deps);

    await listCompanyOrders(ACTOR, { page: 1, statuses: ['ENTREGADO', 'ENTREGADO'] });

    expect(listAliveSummariesInCompany).toHaveBeenCalledWith(
      EMPRESA,
      ['ENTREGADO'],
      'finished_recent_first',
      1,
      undefined,
    );
  });

  it('ENTREGADO mezclado con otro estado usa el orden de la lista de trabajo', async () => {
    const { deps, listAliveSummariesInCompany } = montar();
    const listCompanyOrders = createListCompanyOrders(deps);

    await listCompanyOrders(ACTOR, { page: 1, statuses: ['ENTREGADO', 'PENDIENTE'] });

    expect(listAliveSummariesInCompany).toHaveBeenCalledWith(
      EMPRESA,
      ['ENTREGADO', 'PENDIENTE'],
      'work_queue',
      1,
      undefined,
    );
  });

  it('un solo estado que no es ENTREGADO usa el orden de la lista de trabajo', async () => {
    const { deps, listAliveSummariesInCompany } = montar();
    const listCompanyOrders = createListCompanyOrders(deps);

    await listCompanyOrders(ACTOR, { page: 1, statuses: ['PENDIENTE'] });

    expect(listAliveSummariesInCompany).toHaveBeenCalledWith(EMPRESA, ['PENDIENTE'], 'work_queue', 1, undefined);
  });
});

describe('QC-145 — listCompanyOrders: R25 la fila y sus responsables', () => {
  it('la fila expone exactamente las claves del contrato, incluida `finishedAt`', async () => {
    const items = [resumen(pedidoId(1))];
    const { deps } = montar({ page: { items, total: 1 }, refs: [receta()] });
    const listCompanyOrders = createListCompanyOrders(deps);

    const pagina = await listCompanyOrders(ACTOR, { page: 1 });

    expect(Object.keys(pagina.items[0] ?? {}).sort()).toEqual(
      [
        'id',
        'numberText',
        'recipeName',
        'quantity',
        'presentationName',
        'priority',
        'status',
        'responsibles',
        'finishedAt',
      ].sort(),
    );
  });

  it('sin responsables, la lista sale vacia y no da error', async () => {
    const items = [resumen(pedidoId(1))];
    const { deps } = montar({ page: { items, total: 1 }, refs: [receta()] });
    const listCompanyOrders = createListCompanyOrders(deps);

    const pagina = await listCompanyOrders(ACTOR, { page: 1 });

    expect(pagina.items[0]?.responsibles).toEqual([]);
  });

  it('conserva a TODOS los responsables, incluido el propio actor', async () => {
    const items = [resumen(pedidoId(1))];
    const rows = [filaSuelta(pedidoId(1), ANA)];
    const { deps } = montar({ page: { items, total: 1 }, refs: [receta()], rows, people: [persona(ANA)] });
    const listCompanyOrders = createListCompanyOrders(deps);

    const pagina = await listCompanyOrders(ACTOR, { page: 1 });

    expect(pagina.items[0]?.responsibles.map((r) => r.userId)).toEqual([ANA]);
  });
});

describe('QC-145 — listCompanyOrders: `finishedAt` viaja siempre (R31)', () => {
  it('con cualquier filtro (o sin el), la fila trae `finishedAt`, tenga valor o sea `null`', async () => {
    const fecha = new Date('2026-09-20T10:00:00.000Z');
    const items = [
      resumen(pedidoId(1), { status: 'ENTREGADO', finishedAt: fecha }),
      resumen(pedidoId(2), { status: 'PENDIENTE', finishedAt: null }),
    ];
    const { deps } = montar({ page: { items, total: 2 }, refs: [receta()] });
    const listCompanyOrders = createListCompanyOrders(deps);

    const pagina = await listCompanyOrders(ACTOR, { page: 1 });

    expect(pagina.items[0]?.finishedAt).toEqual(fecha);
    expect(pagina.items[1]?.finishedAt).toBeNull();
  });
});

describe('QC-145 — listCompanyOrders: R27 paginacion delegada al catalogo', () => {
  it('propaga page y pageSize a `listAliveSummariesInCompany` y refleja su `Page` de salida', async () => {
    const { deps, listAliveSummariesInCompany } = montar({ page: { items: [], total: 0 } });
    const listCompanyOrders = createListCompanyOrders(deps);

    const pagina = await listCompanyOrders(ACTOR, { page: 2, pageSize: 25 });

    expect(listAliveSummariesInCompany).toHaveBeenCalledWith(
      EMPRESA,
      ['PENDIENTE', 'EN_CURSO', 'ENTREGADO', 'CANCELADO'],
      'work_queue',
      2,
      25,
    );
    expect(pagina.page).toBe(2);
    expect(pagina.pageSize).toBe(25);
  });
});
