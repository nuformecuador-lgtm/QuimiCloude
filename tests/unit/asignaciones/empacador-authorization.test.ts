// El Empacador se autoriza como cualquier otro conjunto de permisos. Este archivo fija que el
// conjunto que el seed le da no ejecuta pedidos asignados (leer, comenzar, terminar), que su lista
// de «Mis asignados» sale vacia, y que rechaza en los casos de uso que exigen
// `inventario.consultar`, `inventario.modificar` o `asignaciones.modificar`.
//
// El actor se construye con `SEED_ROLE_PERMISSIONS[ROLE_EMPACADOR]`, NUNCA con una lista copiada a
// mano: si el seed cambiara ese conjunto, este archivo tiene que enterarse con el, no seguir
// vigilando un conjunto que ya no es el del Empacador.

import { describe, expect, it, vi } from 'vitest';

import { ROLE_EMPACADOR, SEED_ROLE_PERMISSIONS } from '@/lib/modules/identity';

import {
  createFinishAssignedOrder,
  type FinishAssignedOrderDeps,
} from '@/lib/modules/asignaciones/domain/finish-assigned-order';
import {
  createGetAssignedOrderExecution,
  type GetAssignedOrderExecutionDeps,
} from '@/lib/modules/asignaciones/domain/get-assigned-order-execution';
import {
  createListAssignedOrders,
  type ListAssignedOrdersDeps,
} from '@/lib/modules/asignaciones/domain/list-assigned-orders';
import {
  createStartAssignedOrder,
  type StartAssignedOrderDeps,
} from '@/lib/modules/asignaciones/domain/start-assigned-order';

import {
  createAssignResponsibles,
  type AssignResponsiblesDeps,
} from '@/lib/modules/asignaciones/domain/assign-responsibles';
import {
  createRemoveWorkGroupFromOrder,
  type RemoveWorkGroupFromOrderDeps,
} from '@/lib/modules/asignaciones/domain/remove-work-group-from-order';
import {
  createUnassignResponsible,
  type UnassignResponsibleDeps,
} from '@/lib/modules/asignaciones/domain/unassign-responsible';
import { AsignacionesError, UnauthorizedError as AsignacionesUnauthorizedError } from '@/lib/modules/asignaciones/domain/errors';

import { createCreateProduct } from '@/lib/modules/inventario/domain/create-product';
import { createGetProduct } from '@/lib/modules/inventario/domain/get-product';
import { createListProducts } from '@/lib/modules/inventario/domain/list-products';
import {
  InventarioError,
  UnauthorizedError as InventarioUnauthorizedError,
} from '@/lib/modules/inventario/domain/errors';

import type { Actor as AsignacionesActor } from '@/lib/modules/asignaciones/domain/actor';
import type { Actor as InventarioActor } from '@/lib/modules/inventario/domain/actor';
import type { ProductRepository } from '@/lib/modules/inventario/ports/product-repository';
import type { ListQueryLog } from '@/lib/modules/inventario/ports/list-query-log';

/** Un uuid valido y legible a partir de un solo digito hexadecimal. */
function uuid(seed: string): string {
  return `${seed.repeat(8)}-${seed.repeat(4)}-4${seed.repeat(3)}-8${seed.repeat(3)}-${seed.repeat(12)}`;
}

const EMPRESA = uuid('3');
const EMPACADOR = uuid('1');
const PEDIDO = uuid('7');

/**
 * El actor del Empacador, con el conjunto que EL SEED le declara — nunca una copia a mano. Si
 * `SEED_ROLE_PERMISSIONS[ROLE_EMPACADOR]` cambiara, este actor cambia con el.
 */
const PERMISOS_DEL_EMPACADOR = SEED_ROLE_PERMISSIONS[ROLE_EMPACADOR];
if (PERMISOS_DEL_EMPACADOR === undefined) {
  throw new Error('SEED_ROLE_PERMISSIONS no declara al Empacador: este archivo no puede construir su actor');
}

const ACTOR_ASIGNACIONES: AsignacionesActor = {
  id: EMPACADOR,
  companyId: EMPRESA,
  permissions: PERMISOS_DEL_EMPACADOR,
};

const ACTOR_INVENTARIO: InventarioActor = {
  id: EMPACADOR,
  companyId: EMPRESA,
  permissions: PERMISOS_DEL_EMPACADOR,
};

/** Un doble que registra la llamada y explota: si el caso de uso lo toca, el test lo ve. */
function explode<T extends (...args: never[]) => unknown>(): T {
  return vi.fn(() => {
    throw new Error('este puerto no debe ser llamado');
  }) as unknown as T;
}

function asignacionesQueExplotan() {
  return {
    insertMissing: explode(),
    listByOrderInCompany: explode(),
    listByOrdersInCompany: explode(),
    deleteOne: explode(),
    deleteByWorkGroup: explode(),
    listOrderIdsByUserInCompany: explode(),
  };
}

function doblesDe(deps: object): unknown[] {
  return Object.values(deps as Record<string, unknown>).flatMap((value) =>
    vi.isMockFunction(value) ? [value] : value !== null && typeof value === 'object' ? doblesDe(value) : [],
  );
}

describe('el Empacador no ejecuta pedidos asignados', () => {
  it('R4: el conjunto del seed del Empacador no trae `asignaciones.ejecutar`', () => {
    expect([...PERMISOS_DEL_EMPACADOR].sort()).toEqual(
      ['asignaciones.consultar', 'empaque.modificar', 'terminados.consultar'].sort(),
    );
  });

  it('R16: listAssignedOrders concede pero devuelve la pagina vacia sin tocar ningun puerto', async () => {
    const deps = {
      assignments: asignacionesQueExplotan(),
      orders: { findAliveById: explode(), listAliveSummariesByIds: explode() },
      recipes: { findRefsIncludingDeleted: explode() },
      people: { findAliveRefsInCompany: explode(), findRefsIncludingDeletedInCompany: explode() },
      now: () => new Date('2026-09-22T10:00:00.000Z'),
    } as unknown as ListAssignedOrdersDeps;

    const pagina = await createListAssignedOrders(deps)(ACTOR_ASIGNACIONES, { page: 1 });

    expect(pagina).toEqual({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 1 });
    for (const doble of doblesDe(deps)) expect(doble).not.toHaveBeenCalled();
  });

  it('R5: getAssignedOrderExecution rechaza con `unauthorized` sin tocar ningun puerto', async () => {
    const deps = {
      assignments: asignacionesQueExplotan(),
      orders: { findAliveById: explode(), listAliveSummariesByIds: explode(), transitionAliveById: explode() },
      recipes: { findRefsIncludingDeleted: explode(), findExecutionContentById: explode() },
      units: { findRefs: explode(), findRefsSharingBaseInCompany: explode() },
      products: { findRefs: explode(), findCostingBatches: explode() },
      presentations: { findRefs: explode() },
    } as unknown as GetAssignedOrderExecutionDeps;

    await expect(
      createGetAssignedOrderExecution(deps)(ACTOR_ASIGNACIONES, { orderId: PEDIDO }),
    ).rejects.toBeInstanceOf(AsignacionesUnauthorizedError);
    for (const doble of doblesDe(deps)) expect(doble).not.toHaveBeenCalled();
  });

  it('R6: startAssignedOrder rechaza con `unauthorized` sin tocar ningun puerto ni transicionar', async () => {
    const deps = {
      assignments: asignacionesQueExplotan(),
      orders: { findAliveById: explode(), listAliveSummariesByIds: explode(), transitionAliveById: explode() },
      recipes: { findRefsIncludingDeleted: explode(), findExecutionContentById: explode() },
      units: { findRefs: explode(), findRefsSharingBaseInCompany: explode() },
      products: { findRefs: explode(), findCostingBatches: explode() },
      presentations: { findRefs: explode() },
      log: { append: explode(), findLastStepPosition: explode() },
      transaction: { run: explode() },
      now: () => new Date('2026-09-22T10:00:00.000Z'),
    } as unknown as StartAssignedOrderDeps;

    await expect(createStartAssignedOrder(deps)(ACTOR_ASIGNACIONES, { orderId: PEDIDO })).rejects.toBeInstanceOf(
      AsignacionesUnauthorizedError,
    );
    for (const doble of doblesDe(deps)) expect(doble).not.toHaveBeenCalled();
  });

  it('R7: finishAssignedOrder rechaza con `unauthorized` sin tocar ningun puerto ni crear asignaciones', async () => {
    const deps = {
      assignments: asignacionesQueExplotan(),
      orders: { findAliveById: explode(), listAliveSummariesByIds: explode(), transitionAliveById: explode() },
      people: { findAliveRefsInCompany: explode(), findRefsIncludingDeletedInCompany: explode() },
      groups: { findSnapshotAliveInCompany: explode() },
      log: { append: explode(), findLastStepPosition: explode() },
      transaction: { run: explode() },
      now: () => new Date('2026-09-22T10:00:00.000Z'),
    } as unknown as FinishAssignedOrderDeps;

    await expect(createFinishAssignedOrder(deps)(ACTOR_ASIGNACIONES, { orderId: PEDIDO })).rejects.toBeInstanceOf(
      AsignacionesUnauthorizedError,
    );
    for (const doble of doblesDe(deps)) expect(doble).not.toHaveBeenCalled();
  });
});

describe('QC-144 R13 — el Empacador rechaza en inventario, sin invocar ningun puerto', () => {
  const productsQueExplotan: ProductRepository = {
    create: explode(),
    findAliveById: explode(),
    updateAlive: explode(),
    softDeleteAlive: explode(),
    listAlive: explode(),
    findAliveIdByNameInPresentationUnit: explode(),
    findAliveIdByNameInUnit: explode(),
    findAlivePackagingByName: explode(),
    createWithFirstBatch: explode(),
    addBatchToAlive: explode(),
    adjustBatchStock: explode(),
    findBatchesOfAliveProduct: explode(),
    findBatchMovements: explode(),
  };
  const logQueExplota: ListQueryLog = { ignoredFields: explode() };

  it('listProducts rechaza con el error de autorizacion de inventario, sin tocar el repositorio ni el log', async () => {
    const listProducts = createListProducts({ products: productsQueExplotan, log: logQueExplota });

    await expect(listProducts({}, ACTOR_INVENTARIO)).rejects.toBeInstanceOf(InventarioUnauthorizedError);
    await expect(listProducts({}, ACTOR_INVENTARIO)).rejects.toBeInstanceOf(InventarioError);
    expect(productsQueExplotan.listAlive).not.toHaveBeenCalled();
    expect(logQueExplota.ignoredFields).not.toHaveBeenCalled();
  });

  it('getProduct rechaza con el error de autorizacion de inventario, sin tocar el repositorio', async () => {
    const getProduct = createGetProduct({ products: productsQueExplotan });

    await expect(getProduct('producto-1', ACTOR_INVENTARIO)).rejects.toBeInstanceOf(InventarioUnauthorizedError);
    await expect(getProduct('producto-1', ACTOR_INVENTARIO)).rejects.toBeInstanceOf(InventarioError);
    expect(productsQueExplotan.findAliveById).not.toHaveBeenCalled();
  });

  it('createProduct rechaza con el error de autorizacion de inventario, sin tocar el repositorio', async () => {
    const createProduct = createCreateProduct({ products: productsQueExplotan });

    await expect(createProduct({}, ACTOR_INVENTARIO)).rejects.toBeInstanceOf(InventarioUnauthorizedError);
    await expect(createProduct({}, ACTOR_INVENTARIO)).rejects.toBeInstanceOf(InventarioError);
    expect(productsQueExplotan.create).not.toHaveBeenCalled();
    expect(productsQueExplotan.createWithFirstBatch).not.toHaveBeenCalled();
  });
});

describe('QC-144 R13 — el Empacador rechaza en asignaciones.modificar, sin invocar ningun puerto', () => {
  it('assignResponsibles rechaza con el error de autorizacion de asignaciones, sin tocar ningun puerto', async () => {
    const deps = {
      assignments: {
        insertMissing: explode(),
        listByOrderInCompany: explode(),
        listByOrdersInCompany: explode(),
        deleteOne: explode(),
        deleteByWorkGroup: explode(),
        listOrderIdsByUserInCompany: explode(),
      },
      orders: { findAliveById: explode() },
      people: { findAliveRefsInCompany: explode(), findRefsIncludingDeletedInCompany: explode() },
      groups: { findSnapshotAliveInCompany: explode() },
    } as unknown as AssignResponsiblesDeps;

    const assignResponsibles = createAssignResponsibles(deps);

    await expect(
      assignResponsibles(ACTOR_ASIGNACIONES, { orderId: PEDIDO, userIds: [] }, new Date('2026-09-22T10:00:00.000Z')),
    ).rejects.toBeInstanceOf(AsignacionesUnauthorizedError);
    await expect(
      assignResponsibles(ACTOR_ASIGNACIONES, { orderId: PEDIDO, userIds: [] }, new Date('2026-09-22T10:00:00.000Z')),
    ).rejects.toBeInstanceOf(AsignacionesError);
    expect(deps.assignments.insertMissing).not.toHaveBeenCalled();
    expect(deps.orders.findAliveById).not.toHaveBeenCalled();
    expect(deps.people.findAliveRefsInCompany).not.toHaveBeenCalled();
    expect(deps.groups.findSnapshotAliveInCompany).not.toHaveBeenCalled();
  });

  it('unassignResponsible rechaza con el error de autorizacion de asignaciones, sin tocar ningun puerto', async () => {
    const deps = {
      assignments: {
        insertMissing: explode(),
        listByOrderInCompany: explode(),
        listByOrdersInCompany: explode(),
        deleteOne: explode(),
        deleteByWorkGroup: explode(),
        listOrderIdsByUserInCompany: explode(),
      },
      orders: { findAliveById: explode() },
    } as unknown as UnassignResponsibleDeps;

    const unassignResponsible = createUnassignResponsible(deps);

    await expect(
      unassignResponsible(ACTOR_ASIGNACIONES, { orderId: PEDIDO, userId: EMPACADOR }),
    ).rejects.toBeInstanceOf(AsignacionesUnauthorizedError);
    await expect(
      unassignResponsible(ACTOR_ASIGNACIONES, { orderId: PEDIDO, userId: EMPACADOR }),
    ).rejects.toBeInstanceOf(AsignacionesError);
    expect(deps.assignments.deleteOne).not.toHaveBeenCalled();
    expect(deps.orders.findAliveById).not.toHaveBeenCalled();
  });

  it('removeWorkGroupFromOrder rechaza con el error de autorizacion de asignaciones, sin tocar ningun puerto', async () => {
    const deps = {
      assignments: {
        insertMissing: explode(),
        listByOrderInCompany: explode(),
        listByOrdersInCompany: explode(),
        deleteOne: explode(),
        deleteByWorkGroup: explode(),
        listOrderIdsByUserInCompany: explode(),
      },
      orders: { findAliveById: explode() },
    } as unknown as RemoveWorkGroupFromOrderDeps;

    const removeWorkGroupFromOrder = createRemoveWorkGroupFromOrder(deps);

    await expect(
      removeWorkGroupFromOrder(ACTOR_ASIGNACIONES, { orderId: PEDIDO, workGroupId: uuid('9') }),
    ).rejects.toBeInstanceOf(AsignacionesUnauthorizedError);
    await expect(
      removeWorkGroupFromOrder(ACTOR_ASIGNACIONES, { orderId: PEDIDO, workGroupId: uuid('9') }),
    ).rejects.toBeInstanceOf(AsignacionesError);
    expect(deps.assignments.deleteByWorkGroup).not.toHaveBeenCalled();
    expect(deps.orders.findAliveById).not.toHaveBeenCalled();
  });
});
