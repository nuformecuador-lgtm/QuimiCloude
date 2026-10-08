// QC-50 T25 — `update-order.test.ts` (R26): editar un pedido CAMBIANDO su receta a una que
// pertenece a OTRA empresa se rechaza con el MISMO codigo con el que ya se rechaza una receta
// inexistente, y no modifica ninguna fila.
//
// Igual que `create-order.test.ts`: archivo NUEVO y pequeno. `order-service.test.ts` ya cubre
// el resto de `updateOrder` (R20-R25, R33), incluida la excepcion de R25 -una receta YA en el
// pedido se acepta aunque este dada de baja, si no cambia-. Lo unico que anade QC-50 es que
// CAMBIAR la receta a una de otra empresa se rechaza igual que cambiarla a una inexistente o
// dada de baja: ningun codigo de error nuevo, ninguna firma publica distinta.
//
// QC-170: la presentacion UNICA de QC-146 se fue; la edicion ahora exige `unitId` y valida el
// reparto contra el total con `validateDistribution`, con la fila del pedido YA bloqueada.

import { describe, expect, it, vi } from 'vitest';

import {
  OrderUnitNotConvertibleError,
  RecipeNotFoundError,
  RecipeVersionUnderReviewError,
  UnauthorizedError,
  type PedidosError,
} from '@/lib/modules/pedidos/domain/errors';
import { createUpdateOrder } from '@/lib/modules/pedidos/domain/update-order';
import { fakeScopeProducts, fakeScopeUnits, fakeUnitOfWork } from '@/tests/helpers/order-unit-of-work-double';

import type { Actor } from '@/lib/modules/pedidos/domain/actor';
import type { OrderStatus } from '@/lib/modules/pedidos/domain/order-classification';
import type { OrderRow } from '@/lib/modules/pedidos/domain/order-view';
import type { OrderRepository } from '@/lib/modules/pedidos/ports/order-repository';
import type { OrderUnitOfWork } from '@/lib/modules/pedidos/ports/order-unit-of-work';
import type { CostingBatch, PackagingCatalog, PresentationCatalog, ProductCatalog, ProductRef } from '@/lib/modules/inventario';
import type { RecipeCatalog, RecipeExecutionLine, RecipeRef } from '@/lib/modules/recetas';
import type { UnitCatalog, UnitConversion, UnitRef } from '@/lib/modules/unidades';
import { fakePackagingCatalog, packagingRef } from '../../helpers/packaging-catalog-double';
import { fakeCustomerCatalog } from '../../helpers/customer-catalog-double';

const EMPRESA_A = '33333333-3333-4333-8333-333333333333';
const EMPRESA_B = '44444444-4444-4444-8444-444444444444';

const ACTOR_A: Actor = {
  id: 'admin-a',
  companyId: EMPRESA_A,
  permissions: ['pedidos.consultar', 'pedidos.modificar'],
};

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const RECETA_DE_A = '22222222-2222-4222-8222-222222222222';
const RECETA_DE_B = '55555555-5555-4555-8555-555555555555';
const RECETA_INEXISTENTE = '99999999-9999-4999-8999-999999999999';
const PRESENTACION_DE_A = '66666666-6666-4666-8666-666666666666';
/** La unidad del pedido: `catalogoDeUnidades` la deja SIEMPRE resoluble. */
const UNIT_ID = '77777777-7777-4777-8777-777777777777';
const OTRA_UNIDAD_INCOMPATIBLE = '10101010-1010-4101-8101-101010101010';

const AHORA = new Date('2026-09-16T10:00:00.000Z');

function filaExistente(): OrderRow {
  return {
    id: ORDER_ID,
    number: { year: 2026, sequence: 7 },
    recipeId: RECETA_DE_A,
    quantity: '10.0000',
    priority: 'BAJA',
    status: 'PENDIENTE',
    cancellationReason: null,
    ingredientsCost: null,
    createdAt: AHORA,
    updatedAt: AHORA,
    createdBy: 'admin-0',
    updatedBy: 'admin-0',
    presentationLines: [],
    unitId: null,
    customerId: null,
  };
}

/** Igual que en `create-order.test.ts`: una receta de otra empresa no vuelve, igual que una que
 *  no existe (contrato de `RecipeCatalog.findRefsIncludingDeleted`). */
function catalogoDeRecetas(lineasPorReceta: ReadonlyMap<string, readonly RecipeExecutionLine[]> = new Map()) {
  const recetas = new Map<string, { companyId: string; ref: RecipeRef }>([
    [RECETA_DE_A, { companyId: EMPRESA_A, ref: { id: RECETA_DE_A, name: 'Acido citrico 50%', ownName: 'Acido citrico 50%', isUnderReview: false, original: null, isDeleted: false } }],
    [RECETA_DE_B, { companyId: EMPRESA_B, ref: { id: RECETA_DE_B, name: 'Formula de B', ownName: 'Formula de B', isUnderReview: false, original: null, isDeleted: false } }],
  ]);
  const findRefsIncludingDeleted = vi.fn(async (ids: readonly string[], companyId: string) =>
    ids.flatMap((id) => {
      const guardado = recetas.get(id);
      return guardado !== undefined && guardado.companyId === companyId ? [guardado.ref] : [];
    }),
  );
  // Sin lineas por defecto: los tests de este archivo que no ejercitan el calculo del importe
  // no necesitan mas dobles, porque una receta sin lineas siempre sale sin importe.
  const findExecutionContentById = vi.fn(async (id: string) => ({
    id,
    name: recetas.get(id)?.ref.name ?? 'Receta',
    isDeleted: recetas.get(id)?.ref.isDeleted ?? false,
    steps: [],
    lines: lineasPorReceta.get(id) ?? [],
  }));
  return {
    recipes: { findRefsIncludingDeleted, findExecutionContentById } as unknown as RecipeCatalog,
    findRefsIncludingDeleted,
    findExecutionContentById,
  };
}

/** Catalogo de productos (T5): una llamada a `findCostingBatches` y otra a `findRefs` por alta
 *  o edicion, ninguna crece con el numero de lineas. Sin `refs` explicitas, la unidad de cada
 *  producto sale de sus propios lotes -asi los dobles no repiten la misma unidad dos veces-. */
function catalogoDeProductos(batches: readonly CostingBatch[] = [], refs?: readonly ProductRef[]) {
  const refsPorDefecto =
    refs ??
    [...new Map(batches.map((batch) => [batch.productId, batch.unitId])).entries()].map(
      ([id, unitId]): ProductRef => ({ id, name: 'producto', unitId, stockByUnit: [], type: 'PRODUCT' }),
    );
  const findCostingBatches = vi.fn(async () => batches);
  const findRefs = vi.fn(async () => refsPorDefecto);
  return { products: { findRefs, findCostingBatches } as unknown as ProductCatalog, findCostingBatches, findRefs };
}

/** Catalogo de unidades: `UNIT_ID` -la del pedido- SIEMPRE resuelve, ademas de las que el test
 *  anada (las de las presentaciones del reparto, o la del coste de ingredientes). */
function catalogoDeUnidades(unidades: ReadonlyMap<string, UnitConversion> = new Map()) {
  const UNIDAD_PEDIDO: UnitConversion = { id: UNIT_ID, baseUnitId: null, factor: null };
  const combinadas = new Map<string, UnitConversion>([[UNIT_ID, UNIDAD_PEDIDO], ...unidades]);
  const findRefs = vi.fn(async (ids: readonly string[]) =>
    ids.flatMap((id) => {
      const unidad = combinadas.get(id);
      return unidad === undefined ? [] : [unidad];
    }),
  );
  const findRefsSharingBaseInCompany = vi.fn(async () => []);
  const findMassVolumeBridge = vi.fn(async () => null);
  return {
    units: { findRefs, findRefsSharingBaseInCompany, findMassVolumeBridge } as unknown as UnitCatalog,
    findRefs,
  };
}

/** Catalogo de presentaciones: acepta por defecto `PRESENTACION_DE_A` de la empresa A, con el
 *  contenido y la unidad que le pase el test -`null`/`UNIT_ID` por defecto. */
function catalogoDePresentaciones(
  content: string | null = null,
  unitId: string = UNIT_ID,
): { presentations: PresentationCatalog; findRefs: ReturnType<typeof vi.fn> } {
  const findRefs = vi.fn(async (ids: readonly string[]) =>
    ids.includes(PRESENTACION_DE_A) ? [{ id: PRESENTACION_DE_A, name: 'Bidon 20L', content, unitId }] : [],
  );
  return { presentations: { findRefs } as unknown as PresentationCatalog, findRefs };
}

const ENVASE_DE_A = 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1';

/** Catalogo de envases: `ENVASE_DE_A`, con su presentacion fija `PRESENTACION_DE_A` y el
 *  contenido y la unidad que le pase el test. */
function catalogoDeEnvases(content: string | null = null, unitId: string = UNIT_ID) {
  return fakePackagingCatalog([
    packagingRef({ id: ENVASE_DE_A, name: 'Bidon 20L', presentationId: PRESENTACION_DE_A, content, unitId }),
  ]);
}

function repositorioDePedidos() {
  const filaVista = filaExistente();
  const findAliveById = vi.fn(async () => filaVista);
  const explota = (nombre: string) =>
    vi.fn(() => {
      throw new Error(`${nombre} no deberia llamarse en este caso`);
    });
  const orders = {
    findAliveById,
    listAlive: explota('listAlive'),
  } as unknown as OrderRepository;

  // `lockAliveById` bloquea la MISMA fila que `findAliveById`: en estos tests no hay carrera
  // que las separe.
  const lockAliveById = vi.fn(async () => ({ ...filaVista, reservedAt: null, packagingCost: null }));
  const updateAlive = vi.fn(async () => 'ok' as const);
  const setReservedAt = vi.fn(async () => undefined);
  const syncForOrder = vi.fn(async () => ({ kind: 'reserved' as const }));
  const consumeForOrder = vi.fn(async () => ({ kind: 'consumed' as const }));
  const { unitOfWork } = fakeUnitOfWork({
    orders: { lockAliveById, updateAlive, setReservedAt },
    reservations: { syncForOrder, consumeForOrder },
  });
  return { orders, unitOfWork, findAliveById, lockAliveById, updateAlive, setReservedAt, syncForOrder, consumeForOrder };
}

async function codigoDelFallo(operacion: () => Promise<unknown>): Promise<string> {
  const error = await operacion().then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, 'la operacion tenia que fallar').not.toBeNull();
  return (error as PedidosError).code;
}

const EDICION_HACIA_B = {
  recipeId: RECETA_DE_B,
  quantity: '10.0000',
  unitId: UNIT_ID,
};

/** Repositorio con la fila en el ESTADO que pide el caso, para ejercitar la edicion sobre
 *  pedidos en distintos estados. */
function repositorioConEstado(status: OrderStatus) {
  const filaVista = {
    ...filaExistente(),
    status,
    cancellationReason: status === 'CANCELADO' ? 'anulado' : null,
  };
  const findAliveById = vi.fn(async () => filaVista);
  const explota = (nombre: string) =>
    vi.fn(() => {
      throw new Error(`${nombre} no deberia llamarse en este caso`);
    });
  const orders = {
    findAliveById,
    listAlive: explota('listAlive'),
  } as unknown as OrderRepository;

  const lockAliveById = vi.fn(async () => ({ ...filaVista, reservedAt: null, packagingCost: null }));
  const updateAlive = vi.fn(async () => 'ok' as const);
  const setReservedAt = vi.fn(async () => undefined);
  const syncForOrder = vi.fn(async () => ({ kind: 'reserved' as const }));
  const consumeForOrder = vi.fn(async () => ({ kind: 'consumed' as const }));
  const { unitOfWork } = fakeUnitOfWork({
    orders: { lockAliveById, updateAlive, setReservedAt },
    reservations: { syncForOrder, consumeForOrder },
  });
  return { orders, unitOfWork, findAliveById, lockAliveById, updateAlive, setReservedAt, syncForOrder, consumeForOrder };
}

describe('QC-50 R26 — editar un pedido CAMBIANDO su receta a una de OTRA empresa se rechaza como inexistente', () => {
  it('receta de OTRA empresa -> `recipe_not_found`, el MISMO codigo que una receta inexistente, y no modifica ninguna fila', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioDePedidos();
    const updateOrder = createUpdateOrder({
      customerCatalog: fakeCustomerCatalog(),
      orders: repo.orders,
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones().presentations,
      packaging: fakePackagingCatalog(),
      now: () => AHORA,
    });

    const codigoAjena = await codigoDelFallo(() => updateOrder(ORDER_ID, EDICION_HACIA_B, ACTOR_A));

    expect(codigoAjena).toBe('recipe_not_found');
    expect(repo.updateAlive).not.toHaveBeenCalled();

    // NUNCA nace un codigo de error nuevo: es exactamente el mismo `RecipeNotFoundError` que ya
    // exigia una receta inexistente o dada de baja al cambiarla en la edicion (R25).
    const repo2 = repositorioDePedidos();
    await expect(
      createUpdateOrder({
        customerCatalog: fakeCustomerCatalog(),
        orders: repo2.orders,
        unitOfWork: repo2.unitOfWork,
        recipes: cat.recipes,
        products: catalogoDeProductos().products,
        units: catalogoDeUnidades().units,
        presentations: catalogoDePresentaciones().presentations,
        packaging: fakePackagingCatalog(),
        now: () => AHORA,
      })(ORDER_ID, EDICION_HACIA_B, ACTOR_A),
    ).rejects.toBeInstanceOf(RecipeNotFoundError);

    // Indistinguible de una receta que no existe en absoluto: mismo `code`.
    const cat2 = catalogoDeRecetas();
    const repo3 = repositorioDePedidos();
    const errorInexistente = await createUpdateOrder({
      customerCatalog: fakeCustomerCatalog(),
      orders: repo3.orders,
      unitOfWork: repo3.unitOfWork,
      recipes: cat2.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones().presentations,
      packaging: fakePackagingCatalog(),
      now: () => AHORA,
    })(ORDER_ID, { ...EDICION_HACIA_B, recipeId: RECETA_INEXISTENTE }, ACTOR_A).catch((e: unknown) => e);

    expect((errorInexistente as PedidosError).code).toBe(codigoAjena);
    expect((errorInexistente as Error).constructor.name).toBe(RecipeNotFoundError.name);
    expect(repo3.updateAlive).not.toHaveBeenCalled();
  });

  it('el catalogo recibe la empresa DEL ACTOR, nunca una empresa distinta', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioDePedidos();
    const updateOrder = createUpdateOrder({
      customerCatalog: fakeCustomerCatalog(),
      orders: repo.orders,
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones().presentations,
      packaging: fakePackagingCatalog(),
      now: () => AHORA,
    });

    await codigoDelFallo(() => updateOrder(ORDER_ID, EDICION_HACIA_B, ACTOR_A));

    expect(cat.findRefsIncludingDeleted).toHaveBeenCalledWith([RECETA_DE_B], EMPRESA_A);
  });

  it('CONTROL POSITIVO: cambiar a una receta de la PROPIA empresa se acepta y modifica la fila', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioDePedidos();
    const updateOrder = createUpdateOrder({
      customerCatalog: fakeCustomerCatalog(),
      orders: repo.orders,
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones().presentations,
      packaging: fakePackagingCatalog(),
      now: () => AHORA,
    });

    await updateOrder(ORDER_ID, { ...EDICION_HACIA_B, recipeId: RECETA_DE_A }, ACTOR_A);

    expect(repo.updateAlive).toHaveBeenCalledTimes(1);
  });

  it('CONTROL POSITIVO: no cambiar la receta ni siquiera pregunta al catalogo (R25, intacto)', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioDePedidos();
    const updateOrder = createUpdateOrder({
      customerCatalog: fakeCustomerCatalog(),
      orders: repo.orders,
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones().presentations,
      packaging: fakePackagingCatalog(),
      now: () => AHORA,
    });

    await updateOrder(ORDER_ID, { ...EDICION_HACIA_B, recipeId: RECETA_DE_A }, ACTOR_A);

    expect(cat.findRefsIncludingDeleted).not.toHaveBeenCalled();
    expect(repo.updateAlive).toHaveBeenCalledTimes(1);
  });
});

describe('QC-170 — el reparto en la edicion (R2, R7, R9, R35, R36, R38, R41, R42)', () => {
  it('R41: editar un pedido sin `unitId` en la entrada lanza invalid_input', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioDePedidos();
    const pres = catalogoDePresentaciones();
    const updateOrder = createUpdateOrder({
      customerCatalog: fakeCustomerCatalog(),
      orders: repo.orders,
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: pres.presentations,
      packaging: fakePackagingCatalog(),
      now: () => AHORA,
    });

    expect(
      await codigoDelFallo(() =>
        updateOrder(ORDER_ID, { recipeId: RECETA_DE_A, quantity: '10.0000' }, ACTOR_A),
      ),
    ).toBe('invalid_input');
    expect(repo.updateAlive).not.toHaveBeenCalled();
    expect(pres.findRefs).not.toHaveBeenCalled();
  });

  it('R41: cambiar a una unidad ausente del catalogo de la empresa -> unit_not_found, sin escribir', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioDePedidos();
    const pres = catalogoDePresentaciones();
    const updateOrder = createUpdateOrder({
      customerCatalog: fakeCustomerCatalog(),
      orders: repo.orders,
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: pres.presentations,
      packaging: fakePackagingCatalog(),
      now: () => AHORA,
    });

    const UNIDAD_AJENA = '20202020-2020-4202-8202-202020202020';
    expect(
      await codigoDelFallo(() =>
        updateOrder(ORDER_ID, { ...EDICION_HACIA_B, recipeId: RECETA_DE_A, unitId: UNIDAD_AJENA }, ACTOR_A),
      ),
    ).toBe('unit_not_found');
    expect(repo.updateAlive).not.toHaveBeenCalled();
  });

  it('R9: un pedido PENDIENTE y uno EN_CURSO aceptan cambiar la unidad', async () => {
    for (const status of ['PENDIENTE', 'EN_CURSO'] as const) {
      const cat = catalogoDeRecetas();
      const repo = repositorioConEstado(status);
      const OTRA_UNIDAD = '30303030-3030-4303-8303-303030303030';
      const unidades = catalogoDeUnidades(
        new Map([[OTRA_UNIDAD, { id: OTRA_UNIDAD, baseUnitId: null, factor: null }]]),
      );
      const updateOrder = createUpdateOrder({
        customerCatalog: fakeCustomerCatalog(),
        orders: repo.orders,
        unitOfWork: repo.unitOfWork,
        recipes: cat.recipes,
        products: catalogoDeProductos().products,
        units: unidades.units,
        presentations: catalogoDePresentaciones().presentations,
        packaging: fakePackagingCatalog(),
        now: () => AHORA,
      });

      await updateOrder(
        ORDER_ID,
        { ...EDICION_HACIA_B, recipeId: RECETA_DE_A, unitId: OTRA_UNIDAD },
        ACTOR_A,
      );

      expect(repo.updateAlive, status).toHaveBeenCalledTimes(1);
      const [, dataEscrita] = repo.updateAlive.mock.calls[0] as unknown as [string, { unitId: string }];
      expect(dataEscrita.unitId, status).toBe(OTRA_UNIDAD);
    }
  });

  it('R10: ENTREGADO, CANCELADO, POR_EMPACAR y EN_EMPAQUE rechazan con invalid_transition sin consultar el catalogo de presentaciones', async () => {
    for (const status of ['ENTREGADO', 'CANCELADO', 'POR_EMPACAR', 'EN_EMPAQUE'] as const) {
      const cat = catalogoDeRecetas();
      const repo = repositorioConEstado(status);
      const pres = catalogoDePresentaciones();
      const updateOrder = createUpdateOrder({
        customerCatalog: fakeCustomerCatalog(),
        orders: repo.orders,
        unitOfWork: repo.unitOfWork,
        recipes: cat.recipes,
        products: catalogoDeProductos().products,
        units: catalogoDeUnidades().units,
        presentations: pres.presentations,
        packaging: fakePackagingCatalog(),
        now: () => AHORA,
      });

      expect(
        await codigoDelFallo(() =>
          updateOrder(ORDER_ID, { ...EDICION_HACIA_B, recipeId: RECETA_DE_A }, ACTOR_A),
        ),
        status,
      ).toBe('invalid_transition');
      expect(repo.updateAlive, status).not.toHaveBeenCalled();
      expect(pres.findRefs, status).not.toHaveBeenCalled();
    }
  });

  it('receta y unidad invalidas a la vez -> `recipe_not_found`: la receta se comprueba primero', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioDePedidos();
    const pres = catalogoDePresentaciones();
    const UNIDAD_INEXISTENTE = '40404040-4040-4404-8404-404040404040';
    const updateOrder = createUpdateOrder({
      customerCatalog: fakeCustomerCatalog(),
      orders: repo.orders,
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: pres.presentations,
      packaging: fakePackagingCatalog(),
      now: () => AHORA,
    });

    const codigo = await codigoDelFallo(() =>
      updateOrder(
        ORDER_ID,
        { ...EDICION_HACIA_B, unitId: UNIDAD_INEXISTENTE },
        ACTOR_A,
      ),
    );

    expect(codigo).toBe('recipe_not_found');
    expect(pres.findRefs).not.toHaveBeenCalled();
    expect(repo.updateAlive).not.toHaveBeenCalled();
  });

  it('R6, R8 / QC-195 R14: una linea con envase escribe su presentacion fija y el contenido copiado en este instante', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioDePedidos();
    const updateOrder = createUpdateOrder({
      customerCatalog: fakeCustomerCatalog(),
      orders: repo.orders,
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones().presentations,
      packaging: catalogoDeEnvases('7.0000'),
      now: () => AHORA,
    });

    await updateOrder(
      ORDER_ID,
      {
        ...EDICION_HACIA_B,
        recipeId: RECETA_DE_A,
        presentationLines: [{ packagingProductId: ENVASE_DE_A, packages: 1 }],
      },
      ACTOR_A,
    );

    const [, dataEscrita] = repo.updateAlive.mock.calls[0] as unknown as [
      string,
      { presentationLines: readonly { presentationId: string; packages: number; content: string | null; packagingProductId: string | null }[] },
    ];
    expect(dataEscrita.presentationLines).toEqual([
      { presentationId: PRESENTACION_DE_A, packages: 1, content: '7.0000', packagingProductId: ENVASE_DE_A },
    ]);
  });

  it('R9: sin ningun reparto en la entrada, la edicion escribe el conjunto vacio', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioDePedidos();
    const updateOrder = createUpdateOrder({
      customerCatalog: fakeCustomerCatalog(),
      orders: repo.orders,
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones().presentations,
      packaging: catalogoDeEnvases(),
      now: () => AHORA,
    });

    await updateOrder(ORDER_ID, { ...EDICION_HACIA_B, recipeId: RECETA_DE_A, quantity: '20.0000' }, ACTOR_A);

    const [, dataEscrita] = repo.updateAlive.mock.calls[0] as unknown as [string, { presentationLines: readonly unknown[] }];
    expect(dataEscrita.presentationLines).toEqual([]);
  });

  it('R35 / QC-195 R13: un envase cuya presentacion no tiene contenido -> presentation_without_content, sin escribir', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioDePedidos();
    const updateOrder = createUpdateOrder({
      customerCatalog: fakeCustomerCatalog(),
      orders: repo.orders,
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones().presentations,
      packaging: catalogoDeEnvases(null),
      now: () => AHORA,
    });

    const codigo = await codigoDelFallo(() =>
      updateOrder(
        ORDER_ID,
        {
          ...EDICION_HACIA_B,
          recipeId: RECETA_DE_A,
          presentationLines: [{ packagingProductId: ENVASE_DE_A, packages: 1 }],
        },
        ACTOR_A,
      ),
    );

    expect(codigo).toBe('presentation_without_content');
    expect(repo.updateAlive).not.toHaveBeenCalled();
  });

  it('R7, R38 / QC-195 R11: la unidad nueva deja el envase vigente inconvertible -> incompatible_units, sin escribir', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioDePedidos();
    const unidades = catalogoDeUnidades(
      new Map([[OTRA_UNIDAD_INCOMPATIBLE, { id: OTRA_UNIDAD_INCOMPATIBLE, baseUnitId: null, factor: null }]]),
    );
    const updateOrder = createUpdateOrder({
      customerCatalog: fakeCustomerCatalog(),
      orders: repo.orders,
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: unidades.units,
      presentations: catalogoDePresentaciones().presentations,
      packaging: catalogoDeEnvases('5.0000', UNIT_ID),
      now: () => AHORA,
    });

    const codigo = await codigoDelFallo(() =>
      updateOrder(
        ORDER_ID,
        {
          ...EDICION_HACIA_B,
          recipeId: RECETA_DE_A,
          unitId: OTRA_UNIDAD_INCOMPATIBLE,
          presentationLines: [{ packagingProductId: ENVASE_DE_A, packages: 1 }],
        },
        ACTOR_A,
      ),
    );

    expect(codigo).toBe('incompatible_units');
    expect(repo.updateAlive).not.toHaveBeenCalled();
  });

  it('R36, R38 / QC-195 R13: bajar la cantidad deja los envases vigentes por encima del total -> order_distribution_exceeds_quantity', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioDePedidos();
    const updateOrder = createUpdateOrder({
      customerCatalog: fakeCustomerCatalog(),
      orders: repo.orders,
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones().presentations,
      packaging: catalogoDeEnvases('5.0000'),
      now: () => AHORA,
    });

    const codigo = await codigoDelFallo(() =>
      updateOrder(
        ORDER_ID,
        {
          ...EDICION_HACIA_B,
          recipeId: RECETA_DE_A,
          quantity: '4.0000',
          // 3 envases x 5 = 15, mas que los 4 de la cantidad bajada.
          presentationLines: [{ packagingProductId: ENVASE_DE_A, packages: 3 }],
        },
        ACTOR_A,
      ),
    );

    expect(codigo).toBe('order_distribution_exceeds_quantity');
    expect(repo.updateAlive).not.toHaveBeenCalled();
  });

  it('QC-195 R35: una linea antigua que llega igual (misma presentacion y envases) se conserva sin envase', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioDePedidos();
    repo.lockAliveById.mockResolvedValue({
      ...filaExistente(),
      presentationLines: [{ presentationId: PRESENTACION_DE_A, packages: 1, packagingProductId: null }],
      reservedAt: null,
      packagingCost: null,
    });
    const updateOrder = createUpdateOrder({
      customerCatalog: fakeCustomerCatalog(),
      orders: repo.orders,
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones('5.0000').presentations,
      packaging: catalogoDeEnvases('5.0000'),
      now: () => AHORA,
    });

    await updateOrder(
      ORDER_ID,
      { ...EDICION_HACIA_B, recipeId: RECETA_DE_A, presentationLines: [{ presentationId: PRESENTACION_DE_A, packages: 1 }] },
      ACTOR_A,
    );

    const [, dataEscrita] = repo.updateAlive.mock.calls[0] as unknown as [string, { presentationLines: readonly unknown[] }];
    expect(dataEscrita.presentationLines).toEqual([
      { presentationId: PRESENTACION_DE_A, packages: 1, content: '5.0000', packagingProductId: null },
    ]);
  });

  it('QC-195 R34: una linea antigua con sus envases cambiados -> invalid_input, sin escribir', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioDePedidos();
    repo.lockAliveById.mockResolvedValue({
      ...filaExistente(),
      presentationLines: [{ presentationId: PRESENTACION_DE_A, packages: 1, packagingProductId: null }],
      reservedAt: null,
      packagingCost: null,
    });
    const updateOrder = createUpdateOrder({
      customerCatalog: fakeCustomerCatalog(),
      orders: repo.orders,
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones('5.0000').presentations,
      packaging: catalogoDeEnvases('5.0000'),
      now: () => AHORA,
    });

    const codigo = await codigoDelFallo(() =>
      updateOrder(
        ORDER_ID,
        { ...EDICION_HACIA_B, recipeId: RECETA_DE_A, presentationLines: [{ presentationId: PRESENTACION_DE_A, packages: 2 }] },
        ACTOR_A,
      ),
    );

    expect(codigo).toBe('invalid_input');
    expect(repo.updateAlive).not.toHaveBeenCalled();
  });
});

describe('QC-145 R6 — la edicion no mueve el estado', () => {
  it('un `status` en la entrada se ignora: el pedido se guarda sin que el dato viaje al puerto', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioDePedidos();
    const updateOrder = createUpdateOrder({
      customerCatalog: fakeCustomerCatalog(),
      orders: repo.orders,
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones().presentations,
      packaging: fakePackagingCatalog(),
      now: () => AHORA,
    });

    await updateOrder(
      ORDER_ID,
      { ...EDICION_HACIA_B, recipeId: RECETA_DE_A, status: 'ENTREGADO' },
      ACTOR_A,
    );

    expect(repo.updateAlive).toHaveBeenCalledTimes(1);
    const [, dataEscrita] = repo.updateAlive.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(dataEscrita).not.toHaveProperty('status');
  });

  it('un `status` fuera del conjunto conocido tampoco rompe la entrada: se ignora igual', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioDePedidos();
    const updateOrder = createUpdateOrder({
      customerCatalog: fakeCustomerCatalog(),
      orders: repo.orders,
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones().presentations,
      packaging: fakePackagingCatalog(),
      now: () => AHORA,
    });

    await updateOrder(
      ORDER_ID,
      { ...EDICION_HACIA_B, recipeId: RECETA_DE_A, status: 'NO_EXISTE' },
      ACTOR_A,
    );

    expect(repo.updateAlive).toHaveBeenCalledTimes(1);
  });
});

describe('QC-150 — la edicion no da de alta producto terminado', () => {
  it('R27: un status ENTREGADO en la entrada de un pedido EN_CURSO no lo deja ENTREGADO y no llama a scope.finishedGoods', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioConEstado('EN_CURSO');
    const receiveFromOrder = vi.fn();
    const { unitOfWork, finishedGoods } = fakeUnitOfWork({
      orders: { lockAliveById: repo.lockAliveById, updateAlive: repo.updateAlive, setReservedAt: repo.setReservedAt },
      reservations: { syncForOrder: repo.syncForOrder, consumeForOrder: repo.consumeForOrder },
      finishedGoods: { receiveFromOrder },
    });
    const updateOrder = createUpdateOrder({
      customerCatalog: fakeCustomerCatalog(),
      orders: repo.orders,
      unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones().presentations,
      packaging: fakePackagingCatalog(),
      now: () => AHORA,
    });

    await updateOrder(
      ORDER_ID,
      { ...EDICION_HACIA_B, recipeId: RECETA_DE_A, status: 'ENTREGADO' },
      ACTOR_A,
    );

    expect(repo.updateAlive).toHaveBeenCalledTimes(1);
    const [, dataEscrita] = repo.updateAlive.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(dataEscrita).not.toHaveProperty('status');
    expect(finishedGoods.receiveFromOrder).not.toHaveBeenCalled();
  });

  it('R27: scope.finishedGoods.receiveFromOrder nunca se llama en una edicion, ni siquiera con status ENTREGADO en la entrada', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioDePedidos();
    const updateOrder = createUpdateOrder({
      customerCatalog: fakeCustomerCatalog(),
      orders: repo.orders,
      // `fakeUnitOfWork` por defecto (helper compartido) explota si algo llama a
      // `finishedGoods.receiveFromOrder`: que la edicion termine sin lanzar demuestra que no lo hizo.
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones().presentations,
      packaging: fakePackagingCatalog(),
      now: () => AHORA,
    });

    await expect(
      updateOrder(ORDER_ID, { ...EDICION_HACIA_B, recipeId: RECETA_DE_A, status: 'ENTREGADO' }, ACTOR_A),
    ).resolves.toBeUndefined();
  });

  it('R27: un pedido ya ENTREGADO rechaza la edicion con invalid_transition -la transicion a ENTREGADO no se ofrece- y no llama a scope.finishedGoods', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioConEstado('ENTREGADO');
    const receiveFromOrder = vi.fn();
    const { unitOfWork, finishedGoods } = fakeUnitOfWork({
      orders: { lockAliveById: repo.lockAliveById, updateAlive: repo.updateAlive, setReservedAt: repo.setReservedAt },
      reservations: { syncForOrder: repo.syncForOrder, consumeForOrder: repo.consumeForOrder },
      finishedGoods: { receiveFromOrder },
    });
    const updateOrder = createUpdateOrder({
      customerCatalog: fakeCustomerCatalog(),
      orders: repo.orders,
      unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones().presentations,
      packaging: fakePackagingCatalog(),
      now: () => AHORA,
    });

    const codigo = await codigoDelFallo(() =>
      updateOrder(ORDER_ID, { ...EDICION_HACIA_B, recipeId: RECETA_DE_A }, ACTOR_A),
    );

    expect(codigo).toBe('invalid_transition');
    expect(repo.updateAlive).not.toHaveBeenCalled();
    expect(finishedGoods.receiveFromOrder).not.toHaveBeenCalled();
  });
});

describe('QC-145 R8 — un pedido ENTREGADO, CANCELADO, POR_EMPACAR o EN_EMPAQUE rechaza toda edicion, sin escribir', () => {
  it('ENTREGADO, CANCELADO, POR_EMPACAR y EN_EMPAQUE -> `invalid_transition`, aunque la entrada no traiga ningun `status` (R32)', async () => {
    for (const status of ['ENTREGADO', 'CANCELADO', 'POR_EMPACAR', 'EN_EMPAQUE'] as const) {
      const cat = catalogoDeRecetas();
      const repo = repositorioConEstado(status);
      const pres = catalogoDePresentaciones();
      const updateOrder = createUpdateOrder({
        customerCatalog: fakeCustomerCatalog(),
        orders: repo.orders,
        unitOfWork: repo.unitOfWork,
        recipes: cat.recipes,
        products: catalogoDeProductos().products,
        units: catalogoDeUnidades().units,
        presentations: pres.presentations,
        packaging: fakePackagingCatalog(),
        now: () => AHORA,
      });

      expect(
        await codigoDelFallo(() =>
          updateOrder(ORDER_ID, { ...EDICION_HACIA_B, recipeId: RECETA_DE_A }, ACTOR_A),
        ),
        status,
      ).toBe('invalid_transition');
      expect(repo.updateAlive, status).not.toHaveBeenCalled();
    }
  });

  it('R19, R30 (QC-215): POR_ACONDICIONAR, EN_ACONDICIONAMIENTO y TERMINADO -> `invalid_transition`, sin escribir', async () => {
    for (const status of ['POR_ACONDICIONAR', 'EN_ACONDICIONAMIENTO', 'TERMINADO'] as const) {
      const cat = catalogoDeRecetas();
      const repo = repositorioConEstado(status);
      const pres = catalogoDePresentaciones();
      const updateOrder = createUpdateOrder({
        customerCatalog: fakeCustomerCatalog(),
        orders: repo.orders,
        unitOfWork: repo.unitOfWork,
        recipes: cat.recipes,
        products: catalogoDeProductos().products,
        units: catalogoDeUnidades().units,
        presentations: pres.presentations,
        packaging: fakePackagingCatalog(),
        now: () => AHORA,
      });

      expect(
        await codigoDelFallo(() =>
          updateOrder(ORDER_ID, { ...EDICION_HACIA_B, recipeId: RECETA_DE_A }, ACTOR_A),
        ),
        status,
      ).toBe('invalid_transition');
      // Tambien con un `status` en la entrada que pida quedarse igual.
      expect(
        await codigoDelFallo(() =>
          updateOrder(ORDER_ID, { ...EDICION_HACIA_B, recipeId: RECETA_DE_A, status }, ACTOR_A),
        ),
        status,
      ).toBe('invalid_transition');
      expect(repo.updateAlive, status).not.toHaveBeenCalled();
    }
  });
});

// T5 — la edicion RECALCULA el importe de los ingredientes con la receta del DATO ENTRANTE.

const PRODUCTO_X = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
/** Deriva de la unidad del pedido con factor 1: la necesidad pasa al insumo sin cambiar de cifra. */
const LITRO: UnitConversion = { id: 'l', baseUnitId: UNIT_ID, factor: '1' };

/** Una unica linea al 100 %: la cantidad necesaria queda igual a la del pedido. */
function lineaDeReceta(overrides: Partial<RecipeExecutionLine> = {}): RecipeExecutionLine {
  return { productId: PRODUCTO_X, productName: null, percentage: '100.00', ...overrides };
}

function loteCosteable(overrides: Partial<CostingBatch> = {}): CostingBatch {
  const stock = overrides.stock ?? '100';
  return {
    productId: PRODUCTO_X,
    lot: '1',
    stock,
    unitCost: '3.0000',
    unitId: LITRO.id,
    purchaseDate: '2026-01-01',
    available: stock,
    ...overrides,
  };
}

/** Los DOS puertos, la unidad de trabajo y el catalogo de recetas FALLAN SI SE LLAMAN: no basta
 *  con que la edicion rechace, tiene que rechazar SIN haber leido nada ni abierto la
 *  transaccion. */
function catalogosQueExplotan() {
  const explota = (nombre: string) =>
    vi.fn(() => {
      throw new Error(`${nombre} no deberia llamarse sin permiso`);
    });
  return {
    orders: {
      findAliveById: explota('orders.findAliveById'),
      listAlive: explota('orders.listAlive'),
    } as unknown as OrderRepository,
    unitOfWork: { run: explota('unitOfWork.run') } as unknown as OrderUnitOfWork,
    recipes: {
      findRefsIncludingDeleted: explota('recipes.findRefsIncludingDeleted'),
      findExecutionContentById: explota('recipes.findExecutionContentById'),
    } as unknown as RecipeCatalog,
    products: {
      findRefs: explota('products.findRefs'),
      findCostingBatches: explota('products.findCostingBatches'),
    } as unknown as ProductCatalog,
    units: {
      findRefs: explota('units.findRefs'),
      findRefsSharingBaseInCompany: explota('units.findRefsSharingBaseInCompany'),
      findMassVolumeBridge: explota('units.findMassVolumeBridge'),
    } as unknown as UnitCatalog,
    presentations: {
      findRefs: explota('presentations.findRefs'),
    } as unknown as PresentationCatalog,
    packaging: {
      findRefs: explota('packaging.findRefs'),
      findCostingBatches: explota('packaging.findCostingBatches'),
    } as unknown as PackagingCatalog,
  };
}

describe('T5 — la edicion recalcula el importe de los ingredientes', () => {
  it('la edicion recalcula y sustituye el importe (R11)', async () => {
    const cat = catalogoDeRecetas(new Map([[RECETA_DE_A, [lineaDeReceta()]]]));
    const prod = catalogoDeProductos([loteCosteable({ stock: '100', unitCost: '3.0000' })]);
    const uni = catalogoDeUnidades(new Map([[LITRO.id, LITRO]]));
    const repo = repositorioDePedidos();
    const updateOrder = createUpdateOrder({
      customerCatalog: fakeCustomerCatalog(),
      orders: repo.orders,
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: prod.products,
      units: uni.units,
      presentations: catalogoDePresentaciones().presentations,
      packaging: fakePackagingCatalog(),
      now: () => AHORA,
    });

    await updateOrder(ORDER_ID, { ...EDICION_HACIA_B, recipeId: RECETA_DE_A, quantity: '20.0000' }, ACTOR_A);

    // necesaria = 20 * 100 % = 20, cubierta por el unico lote a 3.0000: 20 * 3 = 60.
    expect(repo.updateAlive).toHaveBeenCalledTimes(1);
    expect((repo.updateAlive.mock.calls[0] as unknown as readonly unknown[])[4]).toEqual({ total: '60.0000', packaging: '0.0000' });
  });

  it('el catalogo de recetas se pregunta por la del DATO ENTRANTE, no por la de la fila vieja', async () => {
    const cat = catalogoDeRecetas(new Map([[RECETA_DE_A, [lineaDeReceta()]]]));
    const prod = catalogoDeProductos([loteCosteable({ stock: '100', unitCost: '3.0000' })]);
    const uni = catalogoDeUnidades(new Map([[LITRO.id, LITRO]]));
    const repo = repositorioDePedidos();
    const updateOrder = createUpdateOrder({
      customerCatalog: fakeCustomerCatalog(),
      orders: repo.orders,
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: prod.products,
      units: uni.units,
      presentations: catalogoDePresentaciones().presentations,
      packaging: fakePackagingCatalog(),
      now: () => AHORA,
    });

    // La fila vieja tiene RECETA_DE_A (`filaExistente`); la edicion NO la cambia, y aun asi el
    // coste se recalcula con los lotes de HOY, no con el importe guardado.
    await updateOrder(ORDER_ID, { ...EDICION_HACIA_B, recipeId: RECETA_DE_A, quantity: '20.0000' }, ACTOR_A);

    expect(cat.findExecutionContentById).toHaveBeenCalledWith(RECETA_DE_A, EMPRESA_A);
  });

  it('las lecturas de lotes son UNA sola y las de unidades DOS -coste y reparto-, tenga la receta 1 o 20 lineas', async () => {
    for (const cantidad of [1, 20]) {
      const lineas = Array.from({ length: cantidad }, (_, i) =>
        lineaDeReceta({ productId: `${PRODUCTO_X}-${i % 5}` }),
      );
      const lotes = Array.from({ length: 5 }, (_, i) =>
        loteCosteable({ productId: `${PRODUCTO_X}-${i}`, stock: '100', unitCost: '1.0000' }),
      );
      const cat = catalogoDeRecetas(new Map([[RECETA_DE_A, lineas]]));
      const prod = catalogoDeProductos(lotes);
      const uni = catalogoDeUnidades(new Map([[LITRO.id, LITRO]]));
      const repo = repositorioDePedidos();
      const updateOrder = createUpdateOrder({
        customerCatalog: fakeCustomerCatalog(),
        orders: repo.orders,
        unitOfWork: repo.unitOfWork,
        recipes: cat.recipes,
        products: prod.products,
        units: uni.units,
        presentations: catalogoDePresentaciones().presentations,
        packaging: fakePackagingCatalog(),
        now: () => AHORA,
      });

      await updateOrder(ORDER_ID, { ...EDICION_HACIA_B, recipeId: RECETA_DE_A, quantity: '1.0000' }, ACTOR_A);

      expect(prod.findCostingBatches, `${cantidad} lineas`).toHaveBeenCalledTimes(1);
      expect(uni.findRefs, `${cantidad} lineas`).toHaveBeenCalledTimes(2);
    }
  });

  it('pasa el `id` del pedido como `excludeOrderId`: lo que EL mismo tiene apartado cuenta como disponible para si mismo (R65)', async () => {
    const cat = catalogoDeRecetas(new Map([[RECETA_DE_A, [lineaDeReceta()]]]));
    const prod = catalogoDeProductos([loteCosteable({ stock: '100', unitCost: '3.0000' })]);
    const uni = catalogoDeUnidades(new Map([[LITRO.id, LITRO]]));
    const repo = repositorioDePedidos();
    const updateOrder = createUpdateOrder({
      customerCatalog: fakeCustomerCatalog(),
      orders: repo.orders,
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: prod.products,
      units: uni.units,
      presentations: catalogoDePresentaciones().presentations,
      packaging: fakePackagingCatalog(),
      now: () => AHORA,
    });

    await updateOrder(ORDER_ID, { ...EDICION_HACIA_B, recipeId: RECETA_DE_A, quantity: '20.0000' }, ACTOR_A);

    expect(prod.findCostingBatches).toHaveBeenCalledWith([PRODUCTO_X], EMPRESA_A, { excludeOrderId: ORDER_ID });
  });

  it('sin pedidos.modificar no se lee ni un lote ni una unidad (R23)', async () => {
    const catalogos = catalogosQueExplotan();
    const ACTOR_SIN_MODIFICAR: Actor = {
      id: 'u-1',
      companyId: EMPRESA_A,
      permissions: ['pedidos.consultar'],
    };
    const updateOrder = createUpdateOrder({
      customerCatalog: fakeCustomerCatalog(),
      orders: catalogos.orders,
      unitOfWork: catalogos.unitOfWork,
      recipes: catalogos.recipes,
      products: catalogos.products,
      units: catalogos.units,
      presentations: catalogos.presentations,
      packaging: fakePackagingCatalog(),
      now: () => AHORA,
    });

    await expect(
      updateOrder(ORDER_ID, EDICION_HACIA_B, ACTOR_SIN_MODIFICAR),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe('QC-141 T9 — editar con reserva (R12, R20, R41, R49, R52)', () => {
  /** Registra el ORDEN real de las llamadas dentro de la unidad de trabajo. */
  function repositorioConOrden(opciones: {
    sync?: 'reserved' | 'not_reserved';
    consume?: 'consumed' | 'insufficient' | 'nothing_to_consume';
  } = {}) {
    const filaVista = filaExistente();
    const findAliveById = vi.fn(async () => filaVista);
    const orders = { findAliveById, listAlive: vi.fn() } as unknown as OrderRepository;

    const orden: string[] = [];
    const lockAliveById = vi.fn(async () => ({ ...filaVista, reservedAt: null, packagingCost: null }));
    const updateAlive = vi.fn(async () => {
      orden.push('orders.updateAlive');
      return 'ok' as const;
    });
    const setReservedAt = vi.fn(async (id: string, reservedAt: Date | null) => {
      void [id, reservedAt];
      orden.push('orders.setReservedAt');
    });
    const syncForOrder = vi.fn(async () => {
      orden.push('reservations.syncForOrder');
      return { kind: opciones.sync ?? 'reserved' } as const;
    });
    const consumeForOrder = vi.fn(async () => {
      orden.push('reservations.consumeForOrder');
      return { kind: opciones.consume ?? 'consumed', productIds: [] } as const;
    });
    const { unitOfWork } = fakeUnitOfWork({
      orders: { lockAliveById, updateAlive, setReservedAt },
      reservations: { syncForOrder, consumeForOrder },
    });
    return { orders, unitOfWork, orden, updateAlive, setReservedAt, syncForOrder, consumeForOrder };
  }

  it('destino distinto de ENTREGADO: updateAlive -> syncForOrder -> setReservedAt(now)', async () => {
    const cat = catalogoDeRecetas(new Map([[RECETA_DE_A, [lineaDeReceta()]]]));
    const repo = repositorioConOrden({ sync: 'reserved' });
    const updateOrder = createUpdateOrder({
      customerCatalog: fakeCustomerCatalog(),
      orders: repo.orders,
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones().presentations,
      packaging: fakePackagingCatalog(),
      now: () => AHORA,
    });

    await updateOrder(ORDER_ID, { ...EDICION_HACIA_B, recipeId: RECETA_DE_A, status: 'EN_CURSO' }, ACTOR_A);

    expect(repo.orden).toEqual(['orders.updateAlive', 'reservations.syncForOrder', 'orders.setReservedAt']);
    expect(repo.consumeForOrder).not.toHaveBeenCalled();
    expect(repo.setReservedAt.mock.calls[0]?.[1]).toBe(AHORA);
  });

  it('R52: un `status` de entrada no dispara consumo -ni siquiera "ENTREGADO"-, solo sincroniza la reserva', async () => {
    const cat = catalogoDeRecetas(new Map([[RECETA_DE_A, [lineaDeReceta()]]]));
    const repo = repositorioConOrden({ sync: 'reserved' });
    const updateOrder = createUpdateOrder({
      customerCatalog: fakeCustomerCatalog(),
      orders: repo.orders,
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones().presentations,
      packaging: fakePackagingCatalog(),
      now: () => AHORA,
    });

    await updateOrder(ORDER_ID, { ...EDICION_HACIA_B, recipeId: RECETA_DE_A, status: 'ENTREGADO' }, ACTOR_A);

    expect(repo.orden).toEqual(['orders.updateAlive', 'reservations.syncForOrder', 'orders.setReservedAt']);
    expect(repo.consumeForOrder).not.toHaveBeenCalled();
  });

  it('R49: editar con una receta sin lineas guarda sin error y deja reserved_at nulo', async () => {
    const cat = catalogoDeRecetas()
    const repo = repositorioConOrden({ sync: 'not_reserved' })
    const updateOrder = createUpdateOrder({
      customerCatalog: fakeCustomerCatalog(),
      orders: repo.orders,
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones().presentations,
      packaging: fakePackagingCatalog(),
      now: () => AHORA,
    })

    await updateOrder(ORDER_ID, { ...EDICION_HACIA_B, recipeId: RECETA_DE_A, status: 'EN_CURSO' }, ACTOR_A)

    expect(repo.syncForOrder).toHaveBeenCalledTimes(1)
    const requerido = (repo.syncForOrder.mock.calls[0] as unknown as readonly [{ requirement: readonly unknown[] }])[0]
    expect(requerido.requirement).toEqual([])
    expect(repo.setReservedAt.mock.calls[0]?.[1]).toBeNull()
  });

  it('R41: el permiso se exige ANTES de abrir la unidad de trabajo', async () => {
    const cat = catalogoDeRecetas();
    const unitOfWork = {
      run: vi.fn(() => {
        throw new Error('unitOfWork.run no deberia llamarse sin permiso');
      }),
    };
    const findAliveById = vi.fn(() => {
      throw new Error('orders.findAliveById no deberia llamarse sin permiso');
    });
    const updateOrder = createUpdateOrder({
      customerCatalog: fakeCustomerCatalog(),
      orders: { findAliveById, listAlive: vi.fn() } as unknown as OrderRepository,
      unitOfWork: unitOfWork as unknown as ReturnType<typeof repositorioConOrden>['unitOfWork'],
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones().presentations,
      packaging: fakePackagingCatalog(),
      now: () => AHORA,
    });
    const SIN_PERMISO: Actor = { id: 'u-1', companyId: EMPRESA_A, permissions: ['pedidos.consultar'] };

    await expect(
      updateOrder(ORDER_ID, EDICION_HACIA_B, SIN_PERMISO),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    expect(findAliveById).not.toHaveBeenCalled();
    expect(unitOfWork.run).not.toHaveBeenCalled();
  });

  it('m7: la receta para la reserva se lee con `scope.recipes`, no con el lector global del coste', async () => {
    const lineas = [lineaDeReceta()];
    // El lector GLOBAL solo responde por el COSTE (fuera de la unidad de trabajo): una sola
    // llamada, y nunca por `findRefsIncludingDeleted` -la receta no cambia respecto a la fila-.
    const findExecutionContentByIdGlobal = vi.fn(async (id: string) => ({
      id,
      name: 'Receta',
      isDeleted: false,
      steps: [],
      lines: lineas,
      tools: [],
    }));
    const recipesGlobal = {
      findRefsIncludingDeleted: vi.fn(() => {
        throw new Error('findRefsIncludingDeleted no deberia llamarse: la receta no cambia');
      }),
      findExecutionContentById: findExecutionContentByIdGlobal,
    } as unknown as RecipeCatalog;
    // El lector de `scope.recipes` -sobre el cliente de LA transaccion- es el UNICO que puede
    // responder por la reserva.
    const findExecutionContentByIdDeLaTransaccion = vi.fn(async (id: string) => ({
      id,
      name: 'Receta',
      isDeleted: false,
      steps: [],
      lines: lineas,
      tools: [],
    }));
    const filaVista = filaExistente();
    const findAliveById = vi.fn(async () => filaVista);
    const lockAliveById = vi.fn(async () => ({ ...filaVista, reservedAt: null, packagingCost: null }));
    const updateAlive = vi.fn(async () => 'ok' as const);
    const setReservedAt = vi.fn(async () => undefined);
    const syncForOrder = vi.fn(async (input: { requirement: readonly unknown[] }) => {
      expect(input.requirement).toEqual([{ productId: PRODUCTO_X, quantity: '10' }]);
      return { kind: 'reserved' as const };
    });
    const { unitOfWork } = fakeUnitOfWork({
      orders: { lockAliveById, updateAlive, setReservedAt },
      reservations: { syncForOrder },
      recipes: { findExecutionContentById: findExecutionContentByIdDeLaTransaccion },
    });
    const updateOrder = createUpdateOrder({
      customerCatalog: fakeCustomerCatalog(),
      orders: { findAliveById, listAlive: vi.fn() } as unknown as OrderRepository,
      unitOfWork,
      recipes: recipesGlobal,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones().presentations,
      packaging: fakePackagingCatalog(),
      now: () => AHORA,
    });

    await updateOrder(
      ORDER_ID,
      { recipeId: RECETA_DE_A, quantity: '10.0000', unitId: UNIT_ID },
      ACTOR_A,
    );

    expect(findExecutionContentByIdGlobal).toHaveBeenCalledTimes(1);
    expect(findExecutionContentByIdDeLaTransaccion).toHaveBeenCalledWith(RECETA_DE_A, EMPRESA_A);
  });
});

describe('edicion con version de receta', () => {
  const VERSION_DE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const OTRA_VERSION_DE_A = 'abababab-abab-4bab-8bab-abababababab';
  const VERSION_DE_OTRA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const OTRA_ORIGINAL = 'dededede-dede-4ede-8ede-dededededede';
  const ORIGINAL_A = { id: RECETA_DE_A, name: 'Acido citrico 50%' };
  const PRODUCTO_Y = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

  function ref(id: string, overrides: Partial<RecipeRef> = {}): RecipeRef {
    return { id, name: id, ownName: id, isDeleted: false, isUnderReview: false, original: null, ...overrides };
  }

  /** Lo que no esta en `refs` no vuelve del catalogo, como una receta de otra empresa. */
  function catalogoConVersiones(
    refs: readonly RecipeRef[],
    lineas: ReadonlyMap<string, readonly RecipeExecutionLine[]> = new Map(),
  ) {
    const findRefsIncludingDeleted = vi.fn(async (ids: readonly string[], companyId: string) =>
      companyId === EMPRESA_A ? refs.filter((r) => ids.includes(r.id)) : [],
    );
    const contenido = (id: string) => ({ id, name: 'Receta', isDeleted: false, steps: [], lines: lineas.get(id) ?? [], tools: [] });
    const findExecutionContentById = vi.fn(async (id: string) => contenido(id));
    const enTransaccion = vi.fn(async (id: string) => contenido(id));
    return {
      recipes: { findRefsIncludingDeleted, findExecutionContentById } as unknown as RecipeCatalog,
      findRefsIncludingDeleted,
      findExecutionContentById,
      enTransaccion,
    };
  }

  /** Pedido PENDIENTE cuya receta guardada es `recetaGuardada`. */
  function edicion(
    recetaGuardada: string,
    cat: ReturnType<typeof catalogoConVersiones>,
    batches: readonly CostingBatch[] = [],
  ) {
    const fila = { ...filaExistente(), recipeId: recetaGuardada };
    const orders = {
      findAliveById: vi.fn(async () => fila),
      listAlive: vi.fn(),
    } as unknown as OrderRepository;
    const updateAlive = vi.fn(async () => 'ok' as const);
    const syncForOrder = vi.fn(async () => ({ kind: 'reserved' as const }));
    const { unitOfWork } = fakeUnitOfWork({
      orders: {
        lockAliveById: vi.fn(async () => ({ ...fila, reservedAt: null, packagingCost: null })),
        updateAlive,
        setReservedAt: vi.fn(async () => undefined),
      },
      reservations: { syncForOrder },
      recipes: { findExecutionContentById: cat.enTransaccion },
    });
    const run = vi.spyOn(unitOfWork, 'run');
    const updateOrder = createUpdateOrder({
      customerCatalog: fakeCustomerCatalog(),
      orders,
      unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos(batches).products,
      units: catalogoDeUnidades(new Map([[LITRO.id, LITRO]])).units,
      presentations: catalogoDePresentaciones().presentations,
      packaging: fakePackagingCatalog(),
      now: () => AHORA,
    });
    return { updateOrder, updateAlive, syncForOrder, run };
  }

  const entrada = (recipeVersionId: string | null, recipeId = RECETA_DE_A) => ({
    recipeId,
    quantity: '10.0000',
    unitId: UNIT_ID,
    recipeVersionId,
  });

  const lineas = new Map([
    [RECETA_DE_A, [lineaDeReceta()]],
    [VERSION_DE_A, [lineaDeReceta({ productId: PRODUCTO_Y })]],
  ]);
  const lotes = [
    loteCosteable({ stock: '100', unitCost: '3.0000' }),
    loteCosteable({ productId: PRODUCTO_Y, stock: '100', unitCost: '5.0000' }),
  ];

  function guardado(updateAlive: ReturnType<typeof vi.fn>) {
    return updateAlive.mock.calls[0] as unknown as readonly [string, { recipeId: string }, unknown, unknown, unknown];
  }

  it('R34: pasar de la original a una version viva la guarda y recalcula coste y necesidad con sus lineas', async () => {
    const cat = catalogoConVersiones([ref(RECETA_DE_A), ref(VERSION_DE_A, { original: ORIGINAL_A })], lineas);
    const { updateOrder, updateAlive, syncForOrder } = edicion(RECETA_DE_A, cat, lotes);

    await updateOrder(ORDER_ID, entrada(VERSION_DE_A), ACTOR_A);

    expect(cat.findRefsIncludingDeleted).toHaveBeenCalledTimes(1);
    expect(cat.findRefsIncludingDeleted).toHaveBeenCalledWith([RECETA_DE_A, VERSION_DE_A], EMPRESA_A);
    const [, datos, , , coste] = guardado(updateAlive);
    expect(datos.recipeId).toBe(VERSION_DE_A);
    expect(datos).not.toHaveProperty('recipeVersionId');
    expect(coste).toEqual({ total: '50.0000', packaging: '0.0000' });
    expect(cat.enTransaccion).toHaveBeenCalledWith(VERSION_DE_A, EMPRESA_A);
    const sync = (syncForOrder.mock.calls[0] as unknown as readonly [{ requirement: readonly unknown[] }])[0];
    expect(sync.requirement).toEqual([{ productId: PRODUCTO_Y, quantity: '10' }]);
  });

  it('R34: volver de una version a «Original» exige la original viva y recalcula con sus lineas', async () => {
    const cat = catalogoConVersiones([ref(RECETA_DE_A), ref(VERSION_DE_A, { original: ORIGINAL_A })], lineas);
    const { updateOrder, updateAlive } = edicion(VERSION_DE_A, cat, lotes);

    await updateOrder(ORDER_ID, entrada(''), ACTOR_A);

    expect(cat.findRefsIncludingDeleted).toHaveBeenCalledWith([RECETA_DE_A], EMPRESA_A);
    const [, datos, , , coste] = guardado(updateAlive);
    expect(datos.recipeId).toBe(RECETA_DE_A);
    expect(coste).toEqual({ total: '30.0000', packaging: '0.0000' });
  });

  it('R34, R33: cambiar a una version por revisar -> recipe_version_under_review sin abrir la unidad de trabajo', async () => {
    const cat = catalogoConVersiones([
      ref(RECETA_DE_A),
      ref(VERSION_DE_A, { original: ORIGINAL_A, isUnderReview: true }),
    ]);
    const { updateOrder, updateAlive, run } = edicion(RECETA_DE_A, cat);

    const error = await updateOrder(ORDER_ID, entrada(VERSION_DE_A), ACTOR_A).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RecipeVersionUnderReviewError);
    expect(run).not.toHaveBeenCalled();
    expect(updateAlive).not.toHaveBeenCalled();
  });

  const rechazos: readonly (readonly [string, readonly RecipeRef[], string, string])[] = [
    [
      'a una version de baja',
      [ref(RECETA_DE_A), ref(VERSION_DE_A, { original: ORIGINAL_A, isDeleted: true })],
      RECETA_DE_A,
      VERSION_DE_A,
    ],
    [
      'a una version de otra receta',
      [ref(RECETA_DE_A), ref(OTRA_ORIGINAL), ref(VERSION_DE_OTRA, { original: { id: OTRA_ORIGINAL, name: 'Otra' } })],
      RECETA_DE_A,
      VERSION_DE_OTRA,
    ],
    ['a una version de otra empresa', [ref(RECETA_DE_A)], RECETA_DE_A, VERSION_DE_A],
    ['a una receta que es version', [ref(VERSION_DE_A, { original: ORIGINAL_A })], VERSION_DE_A, ''],
  ];

  it.each(rechazos)(
    'R34, R32: cambiar %s -> recipe_not_found sin abrir la unidad de trabajo',
    async (_caso, refs, recipeId, recipeVersionId) => {
      const cat = catalogoConVersiones(refs);
      const { updateOrder, updateAlive, run } = edicion(RECETA_DE_A, cat);

      const error = await updateOrder(ORDER_ID, entrada(recipeVersionId, recipeId), ACTOR_A).catch(
        (e: unknown) => e,
      );

      expect(error).toBeInstanceOf(RecipeNotFoundError);
      expect(run).not.toHaveBeenCalled();
      expect(updateAlive).not.toHaveBeenCalled();
    },
  );

  it('R34: cambiar de una version a otra por revisar tambien se rechaza', async () => {
    const cat = catalogoConVersiones([
      ref(RECETA_DE_A),
      ref(OTRA_VERSION_DE_A, { original: ORIGINAL_A, isUnderReview: true }),
    ]);
    const { updateOrder, run } = edicion(VERSION_DE_A, cat);

    await expect(updateOrder(ORDER_ID, entrada(OTRA_VERSION_DE_A), ACTOR_A)).rejects.toBeInstanceOf(
      RecipeVersionUnderReviewError,
    );
    expect(run).not.toHaveBeenCalled();
  });

  it.each([
    ['por revisar', { isUnderReview: true }],
    ['de baja', { isDeleted: true }],
  ] as const)(
    'R35, R25: conservar una version %s se acepta sin preguntar al catalogo y recalcula con sus lineas',
    async (_caso, estado) => {
      const cat = catalogoConVersiones([ref(RECETA_DE_A), ref(VERSION_DE_A, { original: ORIGINAL_A, ...estado })], lineas);
      const { updateOrder, updateAlive, syncForOrder } = edicion(VERSION_DE_A, cat, lotes);

      await updateOrder(ORDER_ID, entrada(VERSION_DE_A), ACTOR_A);

      expect(cat.findRefsIncludingDeleted).not.toHaveBeenCalled();
      const [, datos, , , coste] = guardado(updateAlive);
      expect(datos.recipeId).toBe(VERSION_DE_A);
      expect(coste).toEqual({ total: '50.0000', packaging: '0.0000' });
      const sync = (syncForOrder.mock.calls[0] as unknown as readonly [{ requirement: readonly unknown[] }])[0];
      expect(sync.requirement).toEqual([{ productId: PRODUCTO_Y, quantity: '10' }]);
    },
  );

  it('R31: sin version y sin cambiar la original, igual que hoy: no pregunta al catalogo', async () => {
    const cat = catalogoConVersiones([ref(RECETA_DE_A)], lineas);
    const { updateOrder, updateAlive } = edicion(RECETA_DE_A, cat, lotes);

    await updateOrder(
      ORDER_ID,
      { recipeId: RECETA_DE_A, quantity: '10.0000', unitId: UNIT_ID },
      ACTOR_A,
    );

    expect(cat.findRefsIncludingDeleted).not.toHaveBeenCalled();
    expect(guardado(updateAlive)[1].recipeId).toBe(RECETA_DE_A);
  });

  it('R39: con version se exige el mismo permiso de hoy y sin el no se lee nada', async () => {
    const updateOrder = createUpdateOrder({ customerCatalog: fakeCustomerCatalog(), ...catalogosQueExplotan(), now: () => AHORA });
    const SIN_PERMISO: Actor = { id: 'u-1', companyId: EMPRESA_A, permissions: ['pedidos.consultar'] };

    await expect(updateOrder(ORDER_ID, entrada(VERSION_DE_A), SIN_PERMISO)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );

    const cat = catalogoConVersiones([ref(RECETA_DE_A), ref(VERSION_DE_A, { original: ORIGINAL_A })]);
    const { updateOrder: conPermiso, updateAlive } = edicion(RECETA_DE_A, cat);
    await conPermiso(ORDER_ID, entrada(VERSION_DE_A), { ...SIN_PERMISO, permissions: ['pedidos.modificar'] });
    expect(updateAlive).toHaveBeenCalledTimes(1);
  });
});

describe('QC-138 — la edicion bloquea y desbloquea (R1, R2, R6, R8, R10, R11, R12, R26)', () => {
  const INSUFICIENTE = { kind: 'insufficient' as const, productIds: [PRODUCTO_X] };
  type Resultado = { kind: 'reserved' } | { kind: 'not_reserved' } | typeof INSUFICIENTE;

  function edicionSobre(status: OrderStatus, outcome: Resultado, prod = catalogoDeProductos()) {
    const fila = { ...filaExistente(), status };
    const orders = {
      findAliveById: vi.fn(async () => fila),
      listAlive: vi.fn(),
    } as unknown as OrderRepository;
    const lockAliveById = vi.fn(async () => ({ ...fila, reservedAt: null, packagingCost: null }));
    const updateAlive = vi.fn(async () => 'ok' as const);
    const syncForOrder = vi.fn(async () => outcome);
    const setStatus = vi.fn(async () => 'ok' as const);
    const setIngredientsCost = vi.fn(async () => 'ok' as const);
    const setReservedAt = vi.fn(async () => undefined);
    const { unitOfWork } = fakeUnitOfWork({
      orders: { lockAliveById, updateAlive, setStatus, setIngredientsCost, setReservedAt },
      reservations: { syncForOrder },
    });
    const updateOrder = createUpdateOrder({
      customerCatalog: fakeCustomerCatalog(),
      orders,
      unitOfWork,
      recipes: catalogoDeRecetas(new Map([[RECETA_DE_A, [lineaDeReceta()]]])).recipes,
      products: prod.products,
      units: catalogoDeUnidades(new Map([[LITRO.id, LITRO]])).units,
      presentations: catalogoDePresentaciones().presentations,
      packaging: fakePackagingCatalog(),
      now: () => AHORA,
    });
    return { updateOrder, updateAlive, syncForOrder, setStatus, setIngredientsCost, setReservedAt };
  }

  const ENTRADA = { recipeId: RECETA_DE_A, quantity: '10.0000', unitId: UNIT_ID };
  const SCOPE = { companyId: EMPRESA_A };

  it('R6: PENDIENTE que deja de alcanzar sin confirmacion -> order_would_block, sin mover estado ni reserva', async () => {
    const caso = edicionSobre('PENDIENTE', INSUFICIENTE);

    expect(await codigoDelFallo(() => caso.updateOrder(ORDER_ID, ENTRADA, ACTOR_A))).toBe('order_would_block');
    expect(caso.setStatus).not.toHaveBeenCalled();
    expect(caso.setReservedAt).not.toHaveBeenCalled();
  });

  it('R6: BLOQUEADO que sigue sin alcanzar sin confirmacion -> order_would_block', async () => {
    const caso = edicionSobre('BLOQUEADO', INSUFICIENTE);

    expect(await codigoDelFallo(() => caso.updateOrder(ORDER_ID, ENTRADA, ACTOR_A))).toBe('order_would_block');
  });

  it('R11: PENDIENTE que pasa a BLOQUEADO con confirmacion libera con quien edita como autor', async () => {
    const caso = edicionSobre('PENDIENTE', INSUFICIENTE);

    await caso.updateOrder(ORDER_ID, { ...ENTRADA, confirmBlocked: true }, ACTOR_A);

    expect(caso.syncForOrder).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: ORDER_ID, actorId: ACTOR_A.id, now: AHORA }),
    );
    expect(caso.setStatus).toHaveBeenCalledWith(ORDER_ID, 'PENDIENTE', 'BLOQUEADO', ACTOR_A.id, AHORA, SCOPE);
    expect(caso.setReservedAt).toHaveBeenCalledWith(ORDER_ID, null, SCOPE);
  });

  it('R26: BLOQUEADO que sigue sin alcanzar con confirmacion se guarda sin mover el estado', async () => {
    const caso = edicionSobre('BLOQUEADO', INSUFICIENTE);

    await caso.updateOrder(ORDER_ID, { ...ENTRADA, confirmBlocked: true }, ACTOR_A);

    expect(caso.updateAlive).toHaveBeenCalledTimes(1);
    expect(caso.setStatus).not.toHaveBeenCalled();
    expect(caso.setReservedAt).toHaveBeenCalledWith(ORDER_ID, null, SCOPE);
  });

  it('R5: al bloquear con confirmacion, un importe recien calculado se borra', async () => {
    const caso = edicionSobre(
      'PENDIENTE',
      INSUFICIENTE,
      catalogoDeProductos([loteCosteable({ stock: '100', unitCost: '3.0000' })]),
    );

    await caso.updateOrder(ORDER_ID, { ...ENTRADA, confirmBlocked: true }, ACTOR_A);

    expect((caso.updateAlive.mock.calls[0] as unknown as readonly unknown[])[4]).toEqual({ total: '30.0000', packaging: '0.0000' });
    expect(caso.setIngredientsCost).toHaveBeenCalledWith(ORDER_ID, null, ACTOR_A.id, AHORA, SCOPE);
  });

  it('R10: BLOQUEADO que ya alcanza -> PENDIENTE y aparta, sin pedir confirmacion', async () => {
    const caso = edicionSobre('BLOQUEADO', { kind: 'reserved' });

    await caso.updateOrder(ORDER_ID, ENTRADA, ACTOR_A);

    expect(caso.setStatus).toHaveBeenCalledWith(ORDER_ID, 'BLOQUEADO', 'PENDIENTE', ACTOR_A.id, AHORA, SCOPE);
    expect(caso.setReservedAt).toHaveBeenCalledWith(ORDER_ID, AHORA, SCOPE);
  });

  it('R2: BLOQUEADO cuya receta se quedo sin lineas -> PENDIENTE sin apartar', async () => {
    const caso = edicionSobre('BLOQUEADO', { kind: 'not_reserved' });

    await caso.updateOrder(ORDER_ID, ENTRADA, ACTOR_A);

    expect(caso.setStatus).toHaveBeenCalledWith(ORDER_ID, 'BLOQUEADO', 'PENDIENTE', ACTOR_A.id, AHORA, SCOPE);
    expect(caso.setReservedAt).toHaveBeenCalledWith(ORDER_ID, null, SCOPE);
  });

  it('R8: con confirmacion pero alcanzando, un PENDIENTE sigue PENDIENTE', async () => {
    const caso = edicionSobre('PENDIENTE', { kind: 'reserved' });

    await caso.updateOrder(ORDER_ID, { ...ENTRADA, confirmBlocked: true }, ACTOR_A);

    expect(caso.setStatus).not.toHaveBeenCalled();
    expect(caso.setReservedAt).toHaveBeenCalledWith(ORDER_ID, AHORA, SCOPE);
  });

  it('R12, R28: EN_CURSO que deja de alcanzar -> insufficient_material, aunque venga confirmado', async () => {
    for (const confirmBlocked of [false, true]) {
      const caso = edicionSobre('EN_CURSO', INSUFICIENTE);

      expect(
        await codigoDelFallo(() => caso.updateOrder(ORDER_ID, { ...ENTRADA, confirmBlocked }, ACTOR_A)),
        `confirmBlocked=${String(confirmBlocked)}`,
      ).toBe('insufficient_material');
      expect(caso.setStatus).not.toHaveBeenCalled();
      expect(caso.setReservedAt).not.toHaveBeenCalled();
    }
  });

  it('EN_CURSO que sigue alcanzando se edita sin cambiar de estado', async () => {
    const caso = edicionSobre('EN_CURSO', { kind: 'reserved' });

    await caso.updateOrder(ORDER_ID, ENTRADA, ACTOR_A);

    expect(caso.setStatus).not.toHaveBeenCalled();
  });

  it('R37: sin pedidos.modificar -> unauthorized antes de leer nada', async () => {
    const catalogos = catalogosQueExplotan();
    const updateOrder = createUpdateOrder({ customerCatalog: fakeCustomerCatalog(), ...catalogos, now: () => AHORA });
    const SIN_PERMISO: Actor = { id: 'u-1', companyId: EMPRESA_A, permissions: ['inventario.modificar'] };

    await expect(
      updateOrder(ORDER_ID, { ...ENTRADA, confirmBlocked: true }, SIN_PERMISO),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe('QC-204 — la edicion convierte la necesidad con la unidad editada', () => {
  const GRAMO: UnitRef = { id: 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', name: 'Gramo', symbol: 'g', baseUnitId: null, factor: null };
  const KILO: UnitRef = { id: 'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2', name: 'Kilogramo', symbol: 'kg', baseUnitId: GRAMO.id, factor: '1000' };
  const PIEZA: UnitRef = { id: 'a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3', name: 'Pieza', symbol: 'pz', baseUnitId: null, factor: null };

  /** La fila guardada esta en kg; la edicion la pasa a gramos. */
  function montar(insumoUnitId: string) {
    const cat = catalogoDeRecetas(new Map([[RECETA_DE_A, [lineaDeReceta({ percentage: '10.00' })]]]));
    const insumo: ProductRef = { id: PRODUCTO_X, name: 'insumo', unitId: insumoUnitId, stockByUnit: [], type: 'PRODUCT' };
    const prod = catalogoDeProductos(
      [loteCosteable({ stock: '100', unitCost: '3.0000', unitId: insumoUnitId })],
      [insumo],
    );
    const uni = catalogoDeUnidades(new Map([[GRAMO.id, GRAMO], [KILO.id, KILO], [PIEZA.id, PIEZA]]));
    const filaVista = { ...filaExistente(), quantity: '1000.0000', unitId: KILO.id };
    const findAliveById = vi.fn(async () => filaVista);
    const orders = { findAliveById, listAlive: vi.fn() } as unknown as OrderRepository;
    const lockAliveById = vi.fn(async () => ({ ...filaVista, reservedAt: null, packagingCost: null }));
    const updateAlive = vi.fn(async () => 'ok' as const);
    const setReservedAt = vi.fn(async () => undefined);
    const syncForOrder = vi.fn(async () => ({ kind: 'reserved' as const }));
    const { unitOfWork } = fakeUnitOfWork({
      orders: { lockAliveById, updateAlive, setReservedAt },
      reservations: { syncForOrder },
      recipes: cat.recipes,
      products: fakeScopeProducts([insumo]),
      units: fakeScopeUnits([GRAMO, KILO, PIEZA]),
    });
    const updateOrder = createUpdateOrder({
      customerCatalog: fakeCustomerCatalog(),
      orders,
      unitOfWork,
      recipes: cat.recipes,
      products: prod.products,
      units: uni.units,
      presentations: catalogoDePresentaciones().presentations,
      packaging: fakePackagingCatalog(),
      now: () => AHORA,
    });
    return { updateOrder, updateAlive, syncForOrder, setReservedAt };
  }

  const EDICION_EN_GRAMOS = { recipeId: RECETA_DE_A, quantity: '1000', unitId: GRAMO.id };

  it('R5 la edicion recalcula con la unidad editada', async () => {
    const m = montar(KILO.id);

    await m.updateOrder(ORDER_ID, EDICION_EN_GRAMOS, ACTOR_A);

    // 1000 g al 10 % son 0.1 kg a 3.0000: 0.3000. Con la unidad guardada (kg) serian 300.0000.
    expect((m.updateAlive.mock.calls[0] as unknown as readonly unknown[])[4]).toEqual({ total: '0.3000', packaging: '0.0000' });
  });

  it('R10 la edicion vuelve a apartar con la unidad nueva', async () => {
    const m = montar(KILO.id);

    await m.updateOrder(ORDER_ID, EDICION_EN_GRAMOS, ACTOR_A);

    const entrada = (m.syncForOrder.mock.calls[0] as unknown as readonly [{ requirement: readonly { productId: string; quantity: string }[] }])[0];
    expect(entrada.requirement).toHaveLength(1);
    expect(entrada.requirement[0]?.productId).toBe(PRODUCTO_X);
    expect(Number(entrada.requirement[0]?.quantity)).toBe(0.1);
  });

  it('R12 la edicion y el reparto con una linea no convertible se rechazan con order_unit_not_convertible', async () => {
    const m = montar(PIEZA.id);

    const error = await m.updateOrder(ORDER_ID, EDICION_EN_GRAMOS, ACTOR_A).then(
      () => null,
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(OrderUnitNotConvertibleError);
    expect((error as PedidosError).code).toBe('order_unit_not_convertible');
    expect(m.updateAlive).not.toHaveBeenCalled();
    expect(m.syncForOrder).not.toHaveBeenCalled();
    expect(m.setReservedAt).not.toHaveBeenCalled();
  });
});
