// tests/unit/asignaciones/list-assigned-orders.test.ts
//
// Los dobles CUENTAN INVOCACIONES: «una consulta por puerto» no se puede demostrar mirando el
// resultado —una pagina de 1 fila y una de 25 pueden salir igual de correctas con dos consultas
// que con veinte—, asi que lo que se afirma es cuantas veces se llamo a cada puerto.

import { describe, expect, it, vi } from 'vitest';

import {
  createListAssignedOrders,
  type ListAssignedOrdersDeps,
} from '@/lib/modules/asignaciones/domain/list-assigned-orders';
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

const ACTOR: Actor = { id: ANA, companyId: EMPRESA, permissions: ['asignaciones.consultar'] };

function pedidoId(i: number): string {
  const sufijo = i.toString(16).padStart(2, '0');
  return `444444${sufijo}-4444-4444-8444-4444444444${sufijo}`;
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
    packedBy: null,
    ...overrides,
  };
}

function receta(overrides?: Partial<RecipeRef>): RecipeRef {
  return { id: RECETA, name: 'Jabon liquido', ownName: 'Jabon liquido', isUnderReview: false, original: null, isDeleted: false, ...overrides };
}

function persona(id: string): PersonRef {
  return { id, displayName: `Persona ${id.slice(0, 1)}`, isActive: true, permissions: [] };
}

const PRESENTACION = uuid('7');

function presentacion(overrides?: Partial<PresentationRef>): PresentationRef {
  return { id: PRESENTACION, name: 'Bidon 20L', content: null, ...overrides };
}

function filaSuelta(orderId: string, userId: string): OrderAssignmentRowWithOrder {
  return { orderId, userId, workGroupId: null, workGroupName: null };
}

type Dobles = {
  readonly deps: ListAssignedOrdersDeps;
  readonly listOrderIdsByUserInCompany: ReturnType<typeof vi.fn>;
  readonly listByOrdersInCompany: ReturnType<typeof vi.fn>;
  readonly listAliveSummariesByIds: ReturnType<typeof vi.fn>;
  readonly findRefsIncludingDeleted: ReturnType<typeof vi.fn>;
  readonly findRefsIncludingDeletedInCompany: ReturnType<typeof vi.fn>;
  readonly findRefsPresentations: ReturnType<typeof vi.fn>;
  /** TODOS los metodos de puerto del montaje: lo que hace verificable «sin tocar ningun puerto» y
   *  «el mismo numero de llamadas con 1 fila que con 25». */
  readonly todos: readonly ReturnType<typeof vi.fn>[];
};

function montar(options?: {
  readonly ids?: readonly string[];
  readonly page?: { items: readonly AssignedOrderSummary[]; total: number };
  readonly refs?: readonly RecipeRef[];
  readonly rows?: readonly OrderAssignmentRowWithOrder[];
  readonly people?: readonly PersonRef[];
  readonly presentations?: readonly PresentationRef[];
}): Dobles {
  const idsDeLaPersona = options?.ids ?? [];
  const paginaDePedidos = options?.page ?? { items: [], total: 0 };

  const listOrderIdsByUserInCompany = vi.fn(async () => idsDeLaPersona);
  const listByOrderInCompany = vi.fn(async () => {
    throw new Error('esta lista no resuelve responsables de UN pedido (usa el lote de QC-102)');
  });
  const listByOrdersInCompany = vi.fn(async () => options?.rows ?? []);
  const insertMissing = vi.fn(async () => 0);
  const deleteOne = vi.fn(async () => 'ok' as const);
  const deleteByWorkGroup = vi.fn(async () => 0);

  const listAliveSummariesByIds = vi.fn(
    async (_companyId: string, _ids: readonly string[], _statuses: readonly string[], page: number, pageSize?: number) => {
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
  const findAliveById = vi.fn(async () => {
    throw new Error('R11: la operacion NO consulta un pedido a la vez');
  });

  const findRefsIncludingDeleted = vi.fn(async () => options?.refs ?? []);
  const findAliveRefsInCompany = vi.fn(async () => {
    throw new Error('R20: no se necesitan personas vivas, solo nombres mostrables');
  });
  const findRefsIncludingDeletedInCompany = vi.fn(async () => options?.people ?? []);
  const findRefsPresentations = vi.fn(async () => options?.presentations ?? []);

  const deps: ListAssignedOrdersDeps = {
    assignments: {
      insertMissing,
      listByOrderInCompany,
      listByOrdersInCompany,
      deleteOne,
      deleteByWorkGroup,
      listOrderIdsByUserInCompany,
    },
    orders: { findAliveById, listAliveSummariesByIds } as unknown as OrderCatalog,
    recipes: { findRefsIncludingDeleted } as unknown as RecipeCatalog,
    people: { findAliveRefsInCompany, findRefsIncludingDeletedInCompany },
    presentations: { findRefs: findRefsPresentations } as unknown as PresentationCatalog,
    now: () => new Date('2026-09-16T10:00:00.000Z'),
  } as unknown as ListAssignedOrdersDeps;

  return {
    deps,
    listOrderIdsByUserInCompany,
    listByOrdersInCompany,
    listAliveSummariesByIds,
    findRefsIncludingDeleted,
    findRefsIncludingDeletedInCompany,
    findRefsPresentations,
    todos: [
      listOrderIdsByUserInCompany,
      listByOrderInCompany,
      listByOrdersInCompany,
      insertMissing,
      deleteOne,
      deleteByWorkGroup,
      listAliveSummariesByIds,
      findAliveById,
      findRefsIncludingDeleted,
      findAliveRefsInCompany,
      findRefsIncludingDeletedInCompany,
      findRefsPresentations,
    ],
  };
}

// QC-123 T8 (R15) — comprobacion de TIPO, ademas de la de comportamiento de mas abajo: un
// literal con `ingredientsCost` de mas sobre `AssignedOrderSummary` tiene que dejar de compilar.
// Si el contrato ganara el campo, el `@ts-expect-error` se quedaria SIN USAR y `tsc` se pondria
// rojo aqui mismo -mismo mecanismo que `tests/unit/observabilidad/error-state-types.test-d.ts`-.
const _r15TipoSinImporte: AssignedOrderSummary = {
  ...resumen(pedidoId(0)),
  // @ts-expect-error `AssignedOrderSummary` no declara `ingredientsCost` (R15): si esto
  // compila, el pedido asignado gano el importe.
  ingredientsCost: '10.0000',
};
void _r15TipoSinImporte;

describe('QC-88 — listAssignedOrders: autorizacion (R5, R6, R40)', () => {
  it('R5: exige `asignaciones.consultar` ANTES de tocar ningun puerto', async () => {
    const { deps, todos } = montar();
    const listAssignedOrders = createListAssignedOrders(deps);

    await expect(listAssignedOrders({ id: ANA, companyId: EMPRESA, permissions: [] }, { page: 1 })).rejects.toThrow(
      UnauthorizedError,
    );
    for (const doble of todos) expect(doble).not.toHaveBeenCalled();
  });

  it('R6: los cuatro actores invalidos se rechazan igual, sin leer ni escribir nada', async () => {
    const casos: readonly (Actor | null | undefined)[] = [
      null,
      undefined,
      { id: ANA, companyId: EMPRESA } as unknown as Actor,
      { id: ANA, companyId: EMPRESA, permissions: [] },
    ];

    for (const actor of casos) {
      const { deps, todos } = montar();
      const listAssignedOrders = createListAssignedOrders(deps);
      await expect(listAssignedOrders(actor, { page: 1 })).rejects.toBeInstanceOf(AsignacionesError);
      for (const doble of todos) expect(doble).not.toHaveBeenCalled();
    }
  });

  it('R40: un actor sin el permiso lanza SIN llegar al repositorio (contando invocaciones)', async () => {
    const { deps, listOrderIdsByUserInCompany, listAliveSummariesByIds } = montar();
    const listAssignedOrders = createListAssignedOrders(deps);

    await expect(
      listAssignedOrders({ id: ANA, companyId: EMPRESA, permissions: ['pedidos.consultar'] }, { page: 1 }),
    ).rejects.toThrow(UnauthorizedError);

    expect(listOrderIdsByUserInCompany).not.toHaveBeenCalled();
    expect(listAliveSummariesByIds).not.toHaveBeenCalled();
  });
});

describe('QC-88 — listAssignedOrders: la entrada (`design.md > 9.1`)', () => {
  it('rechaza una entrada invalida SIN tocar ningun puerto', async () => {
    const { deps, todos } = montar();
    const listAssignedOrders = createListAssignedOrders(deps);

    await expect(listAssignedOrders(ACTOR, { page: 0 })).rejects.toThrow(ValidationError);
    await expect(listAssignedOrders(ACTOR, { page: 1, extra: true })).rejects.toThrow(ValidationError);
    for (const doble of todos) expect(doble).not.toHaveBeenCalled();
  });
});

describe('QC-88 — listAssignedOrders: R7 la empresa y la persona salen del ACTOR', () => {
  it('llama a `listOrderIdsByUserInCompany` con la empresa y la persona del ACTOR, no de la entrada', async () => {
    const { deps, listOrderIdsByUserInCompany } = montar();
    const listAssignedOrders = createListAssignedOrders(deps);

    await listAssignedOrders(ACTOR, { page: 1 });

    expect(listOrderIdsByUserInCompany).toHaveBeenCalledWith(EMPRESA, ANA);
  });

  it('llama a `listAliveSummariesByIds` con la empresa del ACTOR, y SOLO los dos estados de trabajo (R12)', async () => {
    const { deps, listAliveSummariesByIds } = montar({ ids: [pedidoId(1)] });
    const listAssignedOrders = createListAssignedOrders(deps);

    await listAssignedOrders(ACTOR, { page: 1 });

    expect(listAliveSummariesByIds).toHaveBeenCalledWith(
      EMPRESA,
      [pedidoId(1)],
      ['PENDIENTE', 'EN_CURSO'],
      1,
      undefined,
    );
  });
});

describe('QC-88 — listAssignedOrders: corte seco sin ids', () => {
  it('sin ni un id asignado, devuelve la pagina vacia SIN tocar ningun otro puerto', async () => {
    const { deps, todos, listOrderIdsByUserInCompany } = montar({ ids: [] });
    const listAssignedOrders = createListAssignedOrders(deps);

    const pagina = await listAssignedOrders(ACTOR, { page: 1 });

    expect(pagina).toEqual({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 1 });
    expect(listOrderIdsByUserInCompany).toHaveBeenCalledTimes(1);
    for (const doble of todos) {
      if (doble === listOrderIdsByUserInCompany) continue;
      expect(doble).not.toHaveBeenCalled();
    }
  });

  it('la pagina vacia respeta el `pageSize` pedido, acotado al tope', async () => {
    const { deps } = montar({ ids: [] });
    const listAssignedOrders = createListAssignedOrders(deps);

    await expect(listAssignedOrders(ACTOR, { page: 1, pageSize: 25 })).resolves.toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 25,
      totalPages: 1,
    });
    await expect(listAssignedOrders(ACTOR, { page: 1, pageSize: 500 })).resolves.toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 25,
      totalPages: 1,
    });
  });
});

describe('QC-88 — listAssignedOrders: R14 numero de consultas CONSTANTE', () => {
  it('las mismas CUATRO llamadas de puerto con 1 fila que con 25', async () => {
    for (const cantidad of [1, 25]) {
      const ids = Array.from({ length: cantidad }, (_, i) => pedidoId(i));
      const items = ids.map((id) => resumen(id));
      const rows = ids.map((id) => filaSuelta(id, BEA));

      const { deps, listOrderIdsByUserInCompany, listAliveSummariesByIds, findRefsIncludingDeleted, listByOrdersInCompany } =
        montar({ ids, page: { items, total: cantidad }, refs: [receta()], rows, people: [persona(BEA)] });
      const listAssignedOrders = createListAssignedOrders(deps);

      await listAssignedOrders(ACTOR, { page: 1, pageSize: 25 });

      expect(listOrderIdsByUserInCompany).toHaveBeenCalledTimes(1);
      expect(listAliveSummariesByIds).toHaveBeenCalledTimes(1);
      expect(findRefsIncludingDeleted).toHaveBeenCalledTimes(1);
      expect(listByOrdersInCompany).toHaveBeenCalledTimes(1);
    }
  });
});

describe('QC-88 — listAssignedOrders: R15 recetas y responsables', () => {
  it('deduplica los ids de receta antes de preguntar', async () => {
    const ids = [pedidoId(1), pedidoId(2)];
    const items = ids.map((id) => resumen(id));
    const { deps, findRefsIncludingDeleted } = montar({ ids, page: { items, total: 2 }, refs: [receta()] });
    const listAssignedOrders = createListAssignedOrders(deps);

    await listAssignedOrders(ACTOR, { page: 1 });

    expect(findRefsIncludingDeleted).toHaveBeenCalledWith([RECETA], ACTOR.companyId);
  });

  it('una receta sin resolver pinta `null`, nunca el identificador', async () => {
    const ids = [pedidoId(1)];
    const items = ids.map((id) => resumen(id));
    const { deps } = montar({ ids, page: { items, total: 1 }, refs: [] });
    const listAssignedOrders = createListAssignedOrders(deps);

    const pagina = await listAssignedOrders(ACTOR, { page: 1 });

    expect(pagina.items[0]?.recipeName).toBeNull();
  });

  it('llama al lote de responsables (QC-102) con los ids DE LA PAGINA, no de toda la persona', async () => {
    const ids = [pedidoId(1)];
    const items = ids.map((id) => resumen(id));
    const { deps, listByOrdersInCompany } = montar({ ids, page: { items, total: 1 } });
    const listAssignedOrders = createListAssignedOrders(deps);

    await listAssignedOrders(ACTOR, { page: 1 });

    expect(listByOrdersInCompany).toHaveBeenCalledWith(EMPRESA, [pedidoId(1)]);
  });
});

describe('QC-88 — listAssignedOrders: R20 el actor no sale entre sus propios responsables', () => {
  it('descarta al actor de `otherResponsibles`, pero conserva a los demas', async () => {
    const ids = [pedidoId(1)];
    const items = ids.map((id) => resumen(id));
    const rows = [filaSuelta(pedidoId(1), ANA), filaSuelta(pedidoId(1), BEA)];
    const { deps } = montar({
      ids,
      page: { items, total: 1 },
      refs: [receta()],
      rows,
      people: [persona(ANA), persona(BEA)],
    });
    const listAssignedOrders = createListAssignedOrders(deps);

    const pagina = await listAssignedOrders(ACTOR, { page: 1 });

    const responsables = pagina.items[0]?.otherResponsibles ?? [];
    expect(responsables.map((r) => r.userId)).toEqual([BEA]);
    expect(responsables.some((r) => r.userId === ANA)).toBe(false);
  });
});

describe('QC-88 — listAssignedOrders: la fila (R16, R17)', () => {
  it('compone el numero visible con `formatOrderNumber` y nunca a mano', async () => {
    const ids = [pedidoId(1)];
    const items = [resumen(pedidoId(1), { number: { year: 2026, sequence: 7 } })];
    const { deps } = montar({ ids, page: { items, total: 1 }, refs: [receta()] });
    const listAssignedOrders = createListAssignedOrders(deps);

    const pagina = await listAssignedOrders(ACTOR, { page: 1 });

    expect(pagina.items[0]?.numberText).toBe('2026-0000007');
  });
});

// QC-123 T8 — la via de `asignaciones` NO lleva el importe (R15). Se comprueba la FORMA del
// contrato -la lista CERRADA de claves de la fila que el Operador recibe-, no solo un ejemplo:
// si `AssignedOrderView` ganara `ingredientsCost`, el `toEqual` de abajo pasaria a comparar un
// conjunto de claves distinto y este caso se pondria rojo.
describe('QC-123 — el pedido asignado no lleva importe (R15)', () => {
  it('el pedido asignado no lleva importe (R15)', async () => {
    const ids = [pedidoId(1)];
    const items = [resumen(pedidoId(1))];
    const { deps } = montar({ ids, page: { items, total: 1 }, refs: [receta()] });
    const listAssignedOrders = createListAssignedOrders(deps);

    const pagina = await listAssignedOrders(ACTOR, { page: 1 });

    const fila = pagina.items[0];
    expect(fila).toBeDefined();
    expect(Object.keys(fila ?? {}).sort()).toEqual(
      [
        'id',
        'numberText',
        'recipeName',
        'quantity',
        'priority',
        'status',
        'otherResponsibles',
        'presentationName',
      ].sort(),
    );
    expect(Object.keys(fila ?? {})).not.toContain('ingredientsCost');
  });
});

describe('listAssignedOrders: la presentacion del pedido asignado', () => {
  it('R24: cada fila lleva el nombre de la presentacion, o null, con una sola llamada al catalogo', async () => {
    const ids = [pedidoId(1), pedidoId(2)];
    const items = [
      resumen(pedidoId(1), { presentationId: PRESENTACION }),
      resumen(pedidoId(2), { presentationId: null }),
    ];
    const { deps, findRefsPresentations } = montar({
      ids,
      page: { items, total: 2 },
      refs: [receta()],
      presentations: [presentacion()],
    });
    const listAssignedOrders = createListAssignedOrders(deps);

    const pagina = await listAssignedOrders(ACTOR, { page: 1 });

    expect(findRefsPresentations).toHaveBeenCalledTimes(1);
    expect(findRefsPresentations).toHaveBeenCalledWith([PRESENTACION], EMPRESA);
    expect(pagina.items[0]?.presentationName).toBe('Bidon 20L');
    expect(pagina.items[1]?.presentationName).toBeNull();
  });

  it('R24: ninguna llamada al catalogo si ningun pedido de la pagina tiene presentacion', async () => {
    const ids = [pedidoId(1)];
    const items = [resumen(pedidoId(1), { presentationId: null })];
    const { deps, findRefsPresentations } = montar({
      ids,
      page: { items, total: 1 },
      refs: [receta()],
    });
    const listAssignedOrders = createListAssignedOrders(deps);

    const pagina = await listAssignedOrders(ACTOR, { page: 1 });

    expect(findRefsPresentations).not.toHaveBeenCalled();
    expect(pagina.items[0]?.presentationName).toBeNull();
  });

  it('R26: un actor con solo asignaciones.consultar recibe la presentacion de sus pedidos asignados', async () => {
    const ids = [pedidoId(1)];
    const items = [resumen(pedidoId(1), { presentationId: PRESENTACION })];
    const { deps } = montar({
      ids,
      page: { items, total: 1 },
      refs: [receta()],
      presentations: [presentacion()],
    });
    const listAssignedOrders = createListAssignedOrders(deps);

    const pagina = await listAssignedOrders(ACTOR, { page: 1 });

    expect(ACTOR.permissions).toEqual(['asignaciones.consultar']);
    expect(pagina.items[0]?.presentationName).toBe('Bidon 20L');
  });
});
