// QC-50 T25 — `update-order.test.ts` (R26): editar un pedido CAMBIANDO su receta a una que
// pertenece a OTRA empresa se rechaza con el MISMO codigo con el que ya se rechaza una receta
// inexistente, y no modifica ninguna fila.
//
// Igual que `create-order.test.ts`: archivo NUEVO y pequeno. `order-service.test.ts` ya cubre
// el resto de `updateOrder` (R20-R25, R33), incluida la excepcion de R25 -una receta YA en el
// pedido se acepta aunque este dada de baja, si no cambia-. Lo unico que anade QC-50 es que
// CAMBIAR la receta a una de otra empresa se rechaza igual que cambiarla a una inexistente o
// dada de baja: ningun codigo de error nuevo, ninguna firma publica distinta.

import { describe, expect, it, vi } from 'vitest';

import {
  RecipeNotFoundError,
  UnauthorizedError,
  type PedidosError,
} from '@/lib/modules/pedidos/domain/errors';
import { createUpdateOrder } from '@/lib/modules/pedidos/domain/update-order';
import { fakeUnitOfWork } from '@/tests/helpers/order-unit-of-work-double';

import type { Actor } from '@/lib/modules/pedidos/domain/actor';
import type { OrderRow } from '@/lib/modules/pedidos/domain/order-view';
import type { OrderRepository } from '@/lib/modules/pedidos/ports/order-repository';
import type { OrderUnitOfWork } from '@/lib/modules/pedidos/ports/order-unit-of-work';
import type { CostingBatch, PresentationCatalog, ProductCatalog, ProductRef } from '@/lib/modules/inventario';
import type { RecipeCatalog, RecipeExecutionLine, RecipeRef } from '@/lib/modules/recetas';
import type { UnitCatalog, UnitConversion } from '@/lib/modules/unidades';

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
    presentationId: PRESENTACION_DE_A,
  };
}

/** Igual que en `create-order.test.ts`: una receta de otra empresa no vuelve, igual que una que
 *  no existe (contrato de `RecipeCatalog.findRefsIncludingDeleted`). */
function catalogoDeRecetas(lineasPorReceta: ReadonlyMap<string, readonly RecipeExecutionLine[]> = new Map()) {
  const recetas = new Map<string, { companyId: string; ref: RecipeRef }>([
    [RECETA_DE_A, { companyId: EMPRESA_A, ref: { id: RECETA_DE_A, name: 'Acido citrico 50%', isDeleted: false } }],
    [RECETA_DE_B, { companyId: EMPRESA_B, ref: { id: RECETA_DE_B, name: 'Formula de B', isDeleted: false } }],
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
      ([id, unitId]): ProductRef => ({ id, name: 'producto', unitId, stockByUnit: [] }),
    );
  const findCostingBatches = vi.fn(async () => batches);
  const findRefs = vi.fn(async () => refsPorDefecto);
  return { products: { findRefs, findCostingBatches } as unknown as ProductCatalog, findCostingBatches, findRefs };
}

/** Catalogo de unidades (T5): una sola llamada por alta o edicion. */
function catalogoDeUnidades(unidades: ReadonlyMap<string, UnitConversion> = new Map()) {
  const findRefs = vi.fn(async (ids: readonly string[]) =>
    ids.flatMap((id) => {
      const unidad = unidades.get(id);
      return unidad === undefined ? [] : [unidad];
    }),
  );
  const findRefsSharingBaseInCompany = vi.fn(async () => []);
  return { units: { findRefs, findRefsSharingBaseInCompany } as unknown as UnitCatalog, findRefs };
}

/** Catalogo de presentaciones: acepta por defecto `PRESENTACION_DE_A` de la empresa A. */
function catalogoDePresentaciones(): { presentations: PresentationCatalog; findRefs: ReturnType<typeof vi.fn> } {
  const findRefs = vi.fn(async (ids: readonly string[]) =>
    ids.includes(PRESENTACION_DE_A) ? [{ id: PRESENTACION_DE_A, name: 'Bidon 20L' }] : [],
  );
  return { presentations: { findRefs } as unknown as PresentationCatalog, findRefs };
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
  const lockAliveById = vi.fn(async () => ({ ...filaVista, reservedAt: null }));
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
  presentationId: PRESENTACION_DE_A,
};

/** Repositorio con la fila en el ESTADO que pide el caso, para ejercitar la edicion sobre
 *  pedidos en distintos estados. */
function repositorioConEstado(status: 'PENDIENTE' | 'EN_CURSO' | 'ENTREGADO' | 'CANCELADO') {
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

  const lockAliveById = vi.fn(async () => ({ ...filaVista, reservedAt: null }));
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
      orders: repo.orders,
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones().presentations,
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
        orders: repo2.orders,
        unitOfWork: repo2.unitOfWork,
        recipes: cat.recipes,
        products: catalogoDeProductos().products,
        units: catalogoDeUnidades().units,
        presentations: catalogoDePresentaciones().presentations,
        now: () => AHORA,
      })(ORDER_ID, EDICION_HACIA_B, ACTOR_A),
    ).rejects.toBeInstanceOf(RecipeNotFoundError);

    // Indistinguible de una receta que no existe en absoluto: mismo `code`.
    const cat2 = catalogoDeRecetas();
    const repo3 = repositorioDePedidos();
    const errorInexistente = await createUpdateOrder({
      orders: repo3.orders,
      unitOfWork: repo3.unitOfWork,
      recipes: cat2.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones().presentations,
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
      orders: repo.orders,
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones().presentations,
      now: () => AHORA,
    });

    await codigoDelFallo(() => updateOrder(ORDER_ID, EDICION_HACIA_B, ACTOR_A));

    expect(cat.findRefsIncludingDeleted).toHaveBeenCalledWith([RECETA_DE_B], EMPRESA_A);
  });

  it('CONTROL POSITIVO: cambiar a una receta de la PROPIA empresa se acepta y modifica la fila', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioDePedidos();
    const updateOrder = createUpdateOrder({
      orders: repo.orders,
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones().presentations,
      now: () => AHORA,
    });

    await updateOrder(ORDER_ID, { ...EDICION_HACIA_B, recipeId: RECETA_DE_A }, ACTOR_A);

    expect(repo.updateAlive).toHaveBeenCalledTimes(1);
  });

  it('CONTROL POSITIVO: no cambiar la receta ni siquiera pregunta al catalogo (R25, intacto)', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioDePedidos();
    const updateOrder = createUpdateOrder({
      orders: repo.orders,
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones().presentations,
      now: () => AHORA,
    });

    await updateOrder(ORDER_ID, { ...EDICION_HACIA_B, recipeId: RECETA_DE_A }, ACTOR_A);

    expect(cat.findRefsIncludingDeleted).not.toHaveBeenCalled();
    expect(repo.updateAlive).toHaveBeenCalledTimes(1);
  });
});

describe('QC-146 — la presentacion del pedido en la edicion (R7, R9, R10)', () => {
  it('R7: editar un pedido sin presentacion exige elegir una', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioDePedidos();
    const pres = catalogoDePresentaciones();
    const updateOrder = createUpdateOrder({
      orders: repo.orders,
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: pres.presentations,
      now: () => AHORA,
    });

    expect(
      await codigoDelFallo(() => updateOrder(ORDER_ID, { ...EDICION_HACIA_B, recipeId: RECETA_DE_A, presentationId: undefined }, ACTOR_A)),
    ).toBe('invalid_input');
    expect(repo.updateAlive).not.toHaveBeenCalled();
    expect(pres.findRefs).not.toHaveBeenCalled();
  });

  it('R9: un pedido PENDIENTE y uno EN_CURSO cambian de presentacion', async () => {
    for (const status of ['PENDIENTE', 'EN_CURSO'] as const) {
      const cat = catalogoDeRecetas();
      const repo = repositorioConEstado(status);
      const pres = catalogoDePresentaciones();
      const OTRA_PRESENTACION = '99999999-9999-4999-8999-999999999999';
      pres.findRefs.mockImplementation(async (ids: readonly string[]) =>
        ids.includes(OTRA_PRESENTACION) ? [{ id: OTRA_PRESENTACION, name: 'Tambor 200L' }] : [],
      );
      const updateOrder = createUpdateOrder({
        orders: repo.orders,
        unitOfWork: repo.unitOfWork,
        recipes: cat.recipes,
        products: catalogoDeProductos().products,
        units: catalogoDeUnidades().units,
        presentations: pres.presentations,
        now: () => AHORA,
      });

      await updateOrder(
        ORDER_ID,
        { ...EDICION_HACIA_B, recipeId: RECETA_DE_A, presentationId: OTRA_PRESENTACION },
        ACTOR_A,
      );

      expect(repo.updateAlive, status).toHaveBeenCalledTimes(1);
      const [, dataEscrita] = repo.updateAlive.mock.calls[0] as unknown as [string, { presentationId: string }];
      expect(dataEscrita.presentationId, status).toBe(OTRA_PRESENTACION);
    }
  });

  it('R10: ENTREGADO y CANCELADO rechazan con invalid_transition sin consultar el catalogo de presentaciones', async () => {
    for (const status of ['ENTREGADO', 'CANCELADO'] as const) {
      const cat = catalogoDeRecetas();
      const repo = repositorioConEstado(status);
      const pres = catalogoDePresentaciones();
      const updateOrder = createUpdateOrder({
        orders: repo.orders,
        unitOfWork: repo.unitOfWork,
        recipes: cat.recipes,
        products: catalogoDeProductos().products,
        units: catalogoDeUnidades().units,
        presentations: pres.presentations,
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

  it('receta y presentacion invalidas a la vez -> `recipe_not_found`: la receta se comprueba primero', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioDePedidos();
    const pres = catalogoDePresentaciones();
    const PRESENTACION_INEXISTENTE = '77777777-7777-4777-8777-777777777777';
    const updateOrder = createUpdateOrder({
      orders: repo.orders,
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: pres.presentations,
      now: () => AHORA,
    });

    const codigo = await codigoDelFallo(() =>
      updateOrder(
        ORDER_ID,
        { ...EDICION_HACIA_B, presentationId: PRESENTACION_INEXISTENTE },
        ACTOR_A,
      ),
    );

    expect(codigo).toBe('recipe_not_found');
    expect(pres.findRefs).not.toHaveBeenCalled();
    expect(repo.updateAlive).not.toHaveBeenCalled();
  });
});

describe('QC-145 R6 — la edicion no mueve el estado', () => {
  it('un `status` en la entrada se ignora: el pedido se guarda sin que el dato viaje al puerto', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioDePedidos();
    const updateOrder = createUpdateOrder({
      orders: repo.orders,
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones().presentations,
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
      orders: repo.orders,
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones().presentations,
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

describe('QC-145 R8 — un pedido ENTREGADO o CANCELADO rechaza toda edicion, sin escribir', () => {
  it('ENTREGADO y CANCELADO -> `invalid_transition`, aunque la entrada no traiga ningun `status`', async () => {
    for (const status of ['ENTREGADO', 'CANCELADO'] as const) {
      const cat = catalogoDeRecetas();
      const repo = repositorioConEstado(status);
      const pres = catalogoDePresentaciones();
      const updateOrder = createUpdateOrder({
        orders: repo.orders,
        unitOfWork: repo.unitOfWork,
        recipes: cat.recipes,
        products: catalogoDeProductos().products,
        units: catalogoDeUnidades().units,
        presentations: pres.presentations,
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
});

// T5 — la edicion RECALCULA el importe de los ingredientes con la receta del DATO ENTRANTE.

const PRODUCTO_X = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const LITRO: UnitConversion = { id: 'l', baseUnitId: null, factor: null };

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
    } as unknown as UnitCatalog,
    presentations: {
      findRefs: explota('presentations.findRefs'),
    } as unknown as PresentationCatalog,
  };
}

describe('T5 — la edicion recalcula el importe de los ingredientes', () => {
  it('la edicion recalcula y sustituye el importe (R11)', async () => {
    const cat = catalogoDeRecetas(new Map([[RECETA_DE_A, [lineaDeReceta()]]]));
    const prod = catalogoDeProductos([loteCosteable({ stock: '100', unitCost: '3.0000' })]);
    const uni = catalogoDeUnidades(new Map([[LITRO.id, LITRO]]));
    const repo = repositorioDePedidos();
    const updateOrder = createUpdateOrder({
      orders: repo.orders,
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: prod.products,
      units: uni.units,
      presentations: catalogoDePresentaciones().presentations,
      now: () => AHORA,
    });

    await updateOrder(ORDER_ID, { ...EDICION_HACIA_B, recipeId: RECETA_DE_A, quantity: '20.0000' }, ACTOR_A);

    // necesaria = 20 * 100 % = 20, cubierta por el unico lote a 3.0000: 20 * 3 = 60.
    expect(repo.updateAlive).toHaveBeenCalledTimes(1);
    expect((repo.updateAlive.mock.calls[0] as unknown as readonly unknown[])[4]).toBe('60.0000');
  });

  it('el catalogo de recetas se pregunta por la del DATO ENTRANTE, no por la de la fila vieja', async () => {
    const cat = catalogoDeRecetas(new Map([[RECETA_DE_A, [lineaDeReceta()]]]));
    const prod = catalogoDeProductos([loteCosteable({ stock: '100', unitCost: '3.0000' })]);
    const uni = catalogoDeUnidades(new Map([[LITRO.id, LITRO]]));
    const repo = repositorioDePedidos();
    const updateOrder = createUpdateOrder({
      orders: repo.orders,
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: prod.products,
      units: uni.units,
      presentations: catalogoDePresentaciones().presentations,
      now: () => AHORA,
    });

    // La fila vieja tiene RECETA_DE_A (`filaExistente`); la edicion NO la cambia, y aun asi el
    // coste se recalcula con los lotes de HOY, no con el importe guardado.
    await updateOrder(ORDER_ID, { ...EDICION_HACIA_B, recipeId: RECETA_DE_A, quantity: '20.0000' }, ACTOR_A);

    expect(cat.findExecutionContentById).toHaveBeenCalledWith(RECETA_DE_A, EMPRESA_A);
  });

  it('las lecturas de lotes y de unidades son UNA sola, tenga la receta 1 o 20 lineas', async () => {
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
        orders: repo.orders,
        unitOfWork: repo.unitOfWork,
        recipes: cat.recipes,
        products: prod.products,
        units: uni.units,
        presentations: catalogoDePresentaciones().presentations,
        now: () => AHORA,
      });

      await updateOrder(ORDER_ID, { ...EDICION_HACIA_B, recipeId: RECETA_DE_A, quantity: '1.0000' }, ACTOR_A);

      expect(prod.findCostingBatches, `${cantidad} lineas`).toHaveBeenCalledTimes(1);
      expect(uni.findRefs, `${cantidad} lineas`).toHaveBeenCalledTimes(1);
    }
  });

  it('pasa el `id` del pedido como `excludeOrderId`: lo que EL mismo tiene apartado cuenta como disponible para si mismo (R65)', async () => {
    const cat = catalogoDeRecetas(new Map([[RECETA_DE_A, [lineaDeReceta()]]]));
    const prod = catalogoDeProductos([loteCosteable({ stock: '100', unitCost: '3.0000' })]);
    const uni = catalogoDeUnidades(new Map([[LITRO.id, LITRO]]));
    const repo = repositorioDePedidos();
    const updateOrder = createUpdateOrder({
      orders: repo.orders,
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: prod.products,
      units: uni.units,
      presentations: catalogoDePresentaciones().presentations,
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
      orders: catalogos.orders,
      unitOfWork: catalogos.unitOfWork,
      recipes: catalogos.recipes,
      products: catalogos.products,
      units: catalogos.units,
      presentations: catalogos.presentations,
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
    const lockAliveById = vi.fn(async () => ({ ...filaVista, reservedAt: null }));
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
      orders: repo.orders,
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones().presentations,
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
      orders: repo.orders,
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones().presentations,
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
      orders: repo.orders,
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones().presentations,
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
      orders: { findAliveById, listAlive: vi.fn() } as unknown as OrderRepository,
      unitOfWork: unitOfWork as unknown as ReturnType<typeof repositorioConOrden>['unitOfWork'],
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones().presentations,
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
    }));
    const recipesGlobal = {
      findRefsIncludingDeleted: vi.fn(() => {
        throw new Error('findRefsIncludingDeleted no deberia llamarse: la receta no cambia');
      }),
      findExecutionContentById: findExecutionContentByIdGlobal,
    } as unknown as RecipeCatalog;
    // El lector de `scope.recipes` -sobre el cliente de LA transaccion- es el UNICO que puede
    // responder por la reserva (`design.md > 5.2.2`, m7).
    const findExecutionContentByIdDeLaTransaccion = vi.fn(async (id: string) => ({
      id,
      name: 'Receta',
      isDeleted: false,
      steps: [],
      lines: lineas,
    }));
    const filaVista = filaExistente();
    const findAliveById = vi.fn(async () => filaVista);
    const lockAliveById = vi.fn(async () => ({ ...filaVista, reservedAt: null }));
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
      orders: { findAliveById, listAlive: vi.fn() } as unknown as OrderRepository,
      unitOfWork,
      recipes: recipesGlobal,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones().presentations,
      now: () => AHORA,
    });

    await updateOrder(
      ORDER_ID,
      { recipeId: RECETA_DE_A, quantity: '10.0000', presentationId: PRESENTACION_DE_A },
      ACTOR_A,
    );

    expect(findExecutionContentByIdGlobal).toHaveBeenCalledTimes(1);
    expect(findExecutionContentByIdDeLaTransaccion).toHaveBeenCalledWith(RECETA_DE_A, EMPRESA_A);
  });
});
