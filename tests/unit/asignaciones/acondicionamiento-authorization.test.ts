// El Administrador de acondicionamiento se autoriza como cualquier otro conjunto de permisos: con
// el que le declara el seed no ve ningun pedido de «Mis asignados», rechaza en todo caso de uso de
// pedidos, terminados, empaque, ejecucion, asignacion e inventario sin tocar un puerto, y en
// `/asignacion` se le ofrecen exactamente sus dos vistas.
//
// El actor sale de `SEED_ROLE_PERMISSIONS[ROLE_ACONDICIONAMIENTO]`, nunca de una lista a mano.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ROLE_ACONDICIONAMIENTO, SEED_ROLE_PERMISSIONS } from '@/lib/modules/identity';

import { resolveAssignmentView, resolveAssignmentViews } from '@/lib/modules/asignaciones/domain/assignment-views';
import {
  createAssignResponsibles,
  type AssignResponsiblesDeps,
} from '@/lib/modules/asignaciones/domain/assign-responsibles';
import {
  createFinishAssignedOrder,
  type FinishAssignedOrderDeps,
} from '@/lib/modules/asignaciones/domain/finish-assigned-order';
import { createFinishPacking, type FinishPackingDeps } from '@/lib/modules/asignaciones/domain/finish-packing';
import {
  createGetAssignedOrderExecution,
  type GetAssignedOrderExecutionDeps,
} from '@/lib/modules/asignaciones/domain/get-assigned-order-execution';
import {
  createGetPackingOrder,
  type GetPackingOrderDeps,
} from '@/lib/modules/asignaciones/domain/get-packing-order';
import {
  createListAssignedOrders,
  type ListAssignedOrdersDeps,
} from '@/lib/modules/asignaciones/domain/list-assigned-orders';
import {
  createListCompanyOrders,
  type ListCompanyOrdersDeps,
} from '@/lib/modules/asignaciones/domain/list-company-orders';
import {
  createListFinishedOrders,
  type ListFinishedOrdersDeps,
} from '@/lib/modules/asignaciones/domain/list-finished-orders';
import {
  createListPackingOrders,
  type ListPackingOrdersDeps,
} from '@/lib/modules/asignaciones/domain/list-packing-orders';
import {
  createListResponsibleCandidates,
  type ListResponsibleCandidatesDeps,
} from '@/lib/modules/asignaciones/domain/list-responsible-candidates';
import {
  createRemoveWorkGroupFromOrder,
  type RemoveWorkGroupFromOrderDeps,
} from '@/lib/modules/asignaciones/domain/remove-work-group-from-order';
import {
  createStartAssignedOrder,
  type StartAssignedOrderDeps,
} from '@/lib/modules/asignaciones/domain/start-assigned-order';
import { createStartPacking, type StartPackingDeps } from '@/lib/modules/asignaciones/domain/start-packing';
import {
  createUnassignResponsible,
  type UnassignResponsibleDeps,
} from '@/lib/modules/asignaciones/domain/unassign-responsible';
import {
  AsignacionesError,
  UnauthorizedError as AsignacionesUnauthorizedError,
} from '@/lib/modules/asignaciones/domain/errors';

import { createCreateProduct, type CreateProductDeps } from '@/lib/modules/inventario/domain/create-product';
import { createListProducts, type ListProductsDeps } from '@/lib/modules/inventario/domain/list-products';
import {
  InventarioError,
  UnauthorizedError as InventarioUnauthorizedError,
} from '@/lib/modules/inventario/domain/errors';

import type { Actor as AsignacionesActor } from '@/lib/modules/asignaciones/domain/actor';
import type { Actor as InventarioActor } from '@/lib/modules/inventario/domain/actor';

function uuid(seed: string): string {
  return `${seed.repeat(8)}-${seed.repeat(4)}-4${seed.repeat(3)}-8${seed.repeat(3)}-${seed.repeat(12)}`;
}

const EMPRESA = uuid('3');
const ACONDICIONADOR = uuid('1');
const OTRA_PERSONA = uuid('2');
const PEDIDO = uuid('7');
const GRUPO = uuid('9');
const AHORA = new Date('2026-10-06T10:00:00.000Z');

const PERMISOS_DEL_ROL = SEED_ROLE_PERMISSIONS[ROLE_ACONDICIONAMIENTO];
if (PERMISOS_DEL_ROL === undefined) {
  throw new Error('SEED_ROLE_PERMISSIONS no declara al Administrador de acondicionamiento');
}

const ACTOR_ASIGNACIONES: AsignacionesActor = {
  id: ACONDICIONADOR,
  companyId: EMPRESA,
  permissions: PERMISOS_DEL_ROL,
};

const ACTOR_INVENTARIO: InventarioActor = {
  id: ACONDICIONADOR,
  companyId: EMPRESA,
  permissions: PERMISOS_DEL_ROL,
};

/**
 * Cada metodo que el caso de uso lea de un puerto falso queda registrado y explota al llamarse.
 * Un Proxy, y no una lista de metodos, para que un metodo nuevo del puerto tampoco escape.
 */
const accesos: string[] = [];
const dobles: ReturnType<typeof vi.fn>[] = [];

function puerto(nombre: string): unknown {
  return new Proxy(
    {},
    {
      get(_target, metodo) {
        if (typeof metodo !== 'string' || metodo === 'then') return undefined;
        accesos.push(`${nombre}.${metodo}`);
        const doble = vi.fn(() => {
          throw new Error(`el puerto ${nombre}.${metodo} no debe ser llamado`);
        });
        dobles.push(doble);
        return doble;
      },
    },
  );
}

/** Todos los puertos que declaran los casos de uso de esta prueba, falsos. */
function puertos(): Record<string, unknown> {
  return {
    assignments: puerto('assignments'),
    orders: puerto('orders'),
    recipes: puerto('recipes'),
    people: puerto('people'),
    presentations: puerto('presentations'),
    products: puerto('products'),
    packingSteps: puerto('packingSteps'),
    units: puerto('units'),
    groups: puerto('groups'),
    log: puerto('log'),
    stockIncreases: puerto('stockIncreases'),
    packageUnit: puerto('packageUnit'),
    now: () => AHORA,
  };
}

function expectNingunPuertoTocado(): void {
  expect(accesos, `puertos leidos: ${accesos.join(', ')}`).toEqual([]);
  for (const doble of dobles) expect(doble).not.toHaveBeenCalled();
}

beforeEach(() => {
  accesos.length = 0;
  dobles.length = 0;
});

describe('R14 — «Mis asignados» sale vacia para el rol sin consultar ningun puerto', () => {
  it('R14: listAssignedOrders devuelve total = 0 aunque el puerto tenga pedidos asignados al actor', async () => {
    const listOrderIdsByUserInCompany = vi.fn(async () => [PEDIDO]);
    const listAliveSummariesByIds = vi.fn(async () => ({
      items: [{ id: PEDIDO, number: { year: 2026, sequence: 1 } }],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    }));
    const listByOrdersInCompany = vi.fn(async () => []);
    const deps = {
      ...puertos(),
      assignments: { listOrderIdsByUserInCompany, listByOrdersInCompany },
      orders: { listAliveSummariesByIds },
    } as unknown as ListAssignedOrdersDeps;

    const pagina = await createListAssignedOrders(deps)(ACTOR_ASIGNACIONES, { page: 1 });

    expect(pagina.total).toBe(0);
    expect(pagina.items).toEqual([]);
    expect(listOrderIdsByUserInCompany).not.toHaveBeenCalled();
    expect(listByOrdersInCompany).not.toHaveBeenCalled();
    expect(listAliveSummariesByIds).not.toHaveBeenCalled();
    expectNingunPuertoTocado();
  });
});

type CasoDeAsignaciones = {
  readonly nombre: string;
  readonly exige: string;
  readonly invocar: (deps: Record<string, unknown>) => Promise<unknown>;
};

const CASOS_DE_ASIGNACIONES: readonly CasoDeAsignaciones[] = [
  {
    nombre: 'listCompanyOrders',
    exige: 'pedidos.consultar',
    invocar: (deps) =>
      createListCompanyOrders(deps as unknown as ListCompanyOrdersDeps)(ACTOR_ASIGNACIONES, { page: 1 }),
  },
  {
    nombre: 'listFinishedOrders',
    exige: 'terminados.consultar',
    invocar: (deps) =>
      createListFinishedOrders(deps as unknown as ListFinishedOrdersDeps)(ACTOR_ASIGNACIONES, { page: 1 }),
  },
  {
    nombre: 'listPackingOrders',
    exige: 'empaque.modificar',
    invocar: (deps) =>
      createListPackingOrders(deps as unknown as ListPackingOrdersDeps)(ACTOR_ASIGNACIONES, { page: 1 }),
  },
  {
    nombre: 'getPackingOrder',
    exige: 'empaque.modificar',
    invocar: (deps) =>
      createGetPackingOrder(deps as unknown as GetPackingOrderDeps)(ACTOR_ASIGNACIONES, { orderId: PEDIDO }),
  },
  {
    nombre: 'startPacking',
    exige: 'empaque.modificar',
    invocar: (deps) =>
      createStartPacking(deps as unknown as StartPackingDeps)(ACTOR_ASIGNACIONES, { orderId: PEDIDO }),
  },
  {
    nombre: 'finishPacking',
    exige: 'empaque.modificar',
    invocar: (deps) =>
      createFinishPacking(deps as unknown as FinishPackingDeps)(ACTOR_ASIGNACIONES, { orderId: PEDIDO }),
  },
  {
    nombre: 'getAssignedOrderExecution',
    exige: 'asignaciones.ejecutar',
    invocar: (deps) =>
      createGetAssignedOrderExecution(deps as unknown as GetAssignedOrderExecutionDeps)(ACTOR_ASIGNACIONES, {
        orderId: PEDIDO,
      }),
  },
  {
    nombre: 'startAssignedOrder',
    exige: 'asignaciones.ejecutar',
    invocar: (deps) =>
      createStartAssignedOrder(deps as unknown as StartAssignedOrderDeps)(ACTOR_ASIGNACIONES, {
        orderId: PEDIDO,
      }),
  },
  {
    nombre: 'finishAssignedOrder',
    exige: 'asignaciones.ejecutar',
    invocar: (deps) =>
      createFinishAssignedOrder(deps as unknown as FinishAssignedOrderDeps)(ACTOR_ASIGNACIONES, {
        orderId: PEDIDO,
      }),
  },
  {
    nombre: 'assignResponsibles',
    exige: 'asignaciones.modificar',
    invocar: (deps) =>
      createAssignResponsibles(deps as unknown as AssignResponsiblesDeps)(
        ACTOR_ASIGNACIONES,
        { orderId: PEDIDO, userIds: [OTRA_PERSONA], workGroupIds: [] },
        AHORA,
      ),
  },
  {
    nombre: 'unassignResponsible',
    exige: 'asignaciones.modificar',
    invocar: (deps) =>
      createUnassignResponsible(deps as unknown as UnassignResponsibleDeps)(ACTOR_ASIGNACIONES, {
        orderId: PEDIDO,
        userId: OTRA_PERSONA,
      }),
  },
  {
    nombre: 'removeWorkGroupFromOrder',
    exige: 'asignaciones.modificar',
    invocar: (deps) =>
      createRemoveWorkGroupFromOrder(deps as unknown as RemoveWorkGroupFromOrderDeps)(ACTOR_ASIGNACIONES, {
        orderId: PEDIDO,
        workGroupId: GRUPO,
      }),
  },
  {
    nombre: 'listResponsibleCandidates',
    exige: 'asignaciones.modificar',
    invocar: (deps) =>
      createListResponsibleCandidates(deps as unknown as ListResponsibleCandidatesDeps)(ACTOR_ASIGNACIONES, {}),
  },
];

describe('R15 — el rol rechaza en asignaciones sin invocar ningun puerto', () => {
  it('R15: el actor no tiene ninguno de los permisos que exigen estos casos de uso', () => {
    for (const caso of CASOS_DE_ASIGNACIONES) {
      expect(PERMISOS_DEL_ROL, caso.nombre).not.toContain(caso.exige);
    }
  });

  it.each(CASOS_DE_ASIGNACIONES.map((caso) => [caso.nombre, caso.exige, caso] as const))(
    'R15: %s (exige %s) rechaza con el error de autorizacion de asignaciones',
    async (_nombre, _exige, caso) => {
      const resultado = caso.invocar(puertos());

      await expect(resultado).rejects.toBeInstanceOf(AsignacionesUnauthorizedError);
      await expect(resultado).rejects.toBeInstanceOf(AsignacionesError);
      expectNingunPuertoTocado();
    },
  );
});

describe('R15 — el rol rechaza en inventario sin invocar ningun puerto', () => {
  it('R15: el actor no tiene inventario.consultar ni inventario.modificar', () => {
    expect(PERMISOS_DEL_ROL).not.toContain('inventario.consultar');
    expect(PERMISOS_DEL_ROL).not.toContain('inventario.modificar');
  });

  it('R15: listProducts (exige inventario.consultar) rechaza con el error de autorizacion de inventario', async () => {
    const listProducts = createListProducts(puertos() as unknown as ListProductsDeps);
    const resultado = listProducts({}, ACTOR_INVENTARIO);

    await expect(resultado).rejects.toBeInstanceOf(InventarioUnauthorizedError);
    await expect(resultado).rejects.toBeInstanceOf(InventarioError);
    expectNingunPuertoTocado();
  });

  it('R15: createProduct (exige inventario.modificar) rechaza con el error de autorizacion de inventario', async () => {
    const createProduct = createCreateProduct(puertos() as unknown as CreateProductDeps);
    const resultado = createProduct({}, ACTOR_INVENTARIO);

    await expect(resultado).rejects.toBeInstanceOf(InventarioUnauthorizedError);
    await expect(resultado).rejects.toBeInstanceOf(InventarioError);
    expectNingunPuertoTocado();
  });
});

describe('R15 — sensibilidad: el puerto falso si registra a quien lo toca', () => {
  it('R15: con el permiso que exige, listCompanyOrders llega al puerto y el registro lo ve', async () => {
    const actor: AsignacionesActor = { ...ACTOR_ASIGNACIONES, permissions: ['pedidos.consultar'] };

    await expect(
      createListCompanyOrders(puertos() as unknown as ListCompanyOrdersDeps)(actor, { page: 1 }),
    ).rejects.not.toBeInstanceOf(AsignacionesUnauthorizedError);
    expect(accesos.length).toBeGreaterThan(0);
  });
});

describe('R2 — en /asignacion el rol recibe exactamente sus vistas (enmienda la vista de reserva)', () => {
  it("R2, QC-219 R20: resolveAssignmentViews con los permisos del rol devuelve exactamente ['por_acondicionar', 'acondicionados', 'acondicionados_entregados']", () => {
    expect(resolveAssignmentViews(ACTOR_ASIGNACIONES)).toEqual([
      'por_acondicionar',
      'acondicionados',
      'acondicionados_entregados',
    ]);
  });

  it('R2: no incluye asignados, todos, terminados ni por_empacar', () => {
    const vistas = resolveAssignmentViews(ACTOR_ASIGNACIONES);

    expect(vistas).not.toContain('asignados');
    expect(vistas).not.toContain('todos');
    expect(vistas).not.toContain('terminados');
    expect(vistas).not.toContain('por_empacar');
  });

  it('R2: la vista por defecto del rol es `por_acondicionar`', () => {
    const vistas = resolveAssignmentViews(ACTOR_ASIGNACIONES);
    expect(resolveAssignmentView(undefined, vistas)).toBe('por_acondicionar');
    expect(resolveAssignmentView('asignados', vistas)).toBe('por_acondicionar');
  });
});
