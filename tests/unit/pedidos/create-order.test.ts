// QC-50 T25 — `create-order.test.ts` (R26): crear un pedido cuya receta pertenece a OTRA
// empresa se rechaza con el MISMO codigo con el que ya se rechaza una receta inexistente, y no
// crea ninguna fila.
//
// Este archivo es NUEVO y deliberadamente pequeno: `tests/unit/pedidos/order-service.test.ts`
// ya cubre el resto de `createOrder` (R6, R8, R9, R10, R15, R16) con una receta inexistente o
// dada de baja; lo unico que QC-50 anade es el TERCER caso -receta de otra empresa-, y lo cierra
// reutilizando exactamente el mismo `RecipeNotFoundError`/`recipe_not_found` que ya existia
// (decision cerrada 6 de `requirements.md`: "no nace ningun codigo de error nuevo"). No se
// cambia ninguna firma publica de `pedidos` ni se toca ningun otro caso.
//
// El catalogo de recetas es la UNICA pieza nueva del doble: `findRefsIncludingDeleted(ids,
// companyId)` simplemente no devuelve la referencia cuando la receta pedida es de otra empresa
// -tal y como promete `RecipeCatalog` (`lib/modules/recetas/domain/recipe-catalog.ts`)-, y el
// caso de uso no puede distinguir eso de que el id no exista en absoluto.

import { describe, expect, it, vi } from 'vitest';

import { createCreateOrder } from '@/lib/modules/pedidos/domain/create-order';
import { RecipeNotFoundError, UnauthorizedError, type PedidosError } from '@/lib/modules/pedidos/domain/errors';

import type { Actor } from '@/lib/modules/pedidos/domain/actor';
import type { OrderRow } from '@/lib/modules/pedidos/domain/order-view';
import type { OrderRepository } from '@/lib/modules/pedidos/ports/order-repository';
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

const RECETA_DE_A = '22222222-2222-4222-8222-222222222222';
const RECETA_DE_B = '55555555-5555-4555-8555-555555555555';
const RECETA_INEXISTENTE = '99999999-9999-4999-8999-999999999999';
const PRESENTACION_DE_A = '66666666-6666-4666-8666-666666666666';

const AHORA = new Date('2026-09-16T10:00:00.000Z');

function filaCreada(): OrderRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    number: { year: 2026, sequence: 1 },
    recipeId: RECETA_DE_A,
    quantity: '10.0000',
    priority: 'BAJA',
    status: 'PENDIENTE',
    cancellationReason: null,
    ingredientsCost: null,
    createdAt: AHORA,
    updatedAt: AHORA,
    createdBy: ACTOR_A.id,
    updatedBy: ACTOR_A.id,
    presentationId: PRESENTACION_DE_A,
  };
}

/**
 * Catalogo de recetas ACOTADO a la empresa preguntada: una receta de otra empresa simplemente
 * no vuelve en la respuesta, igual que una que no existe -es el contrato que
 * `RecipeCatalog.findRefsIncludingDeleted` promete (QC-50 R25)-.
 */
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
  const create = vi.fn(async () => filaCreada());
  const explota = (nombre: string) =>
    vi.fn(() => {
      throw new Error(`${nombre} no deberia llamarse en este caso`);
    });
  const orders = {
    create,
    findAliveById: explota('findAliveById'),
    listAlive: explota('listAlive'),
    updateAlive: explota('updateAlive'),
    cancelAlive: explota('cancelAlive'),
    softDeleteAlive: explota('softDeleteAlive'),
  } as unknown as OrderRepository;
  return { orders, create };
}

async function codigoDelFallo(operacion: () => Promise<unknown>): Promise<string> {
  const error = await operacion().then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, 'la operacion tenia que fallar').not.toBeNull();
  return (error as PedidosError).code;
}

describe('QC-50 R26 — crear un pedido con una receta de OTRA empresa se rechaza como inexistente', () => {
  it('receta de OTRA empresa -> `recipe_not_found`, el MISMO codigo que una receta inexistente, y no crea ninguna fila', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioDePedidos();
    const createOrder = createCreateOrder({
      orders: repo.orders,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones().presentations,
      now: () => AHORA,
    });

    const codigoAjena = await codigoDelFallo(() =>
      createOrder({ recipeId: RECETA_DE_B, quantity: '10.0000', presentationId: PRESENTACION_DE_A }, ACTOR_A),
    );

    expect(codigoAjena).toBe('recipe_not_found');
    expect(repo.create).not.toHaveBeenCalled();

    // NUNCA nace un codigo de error nuevo: es exactamente el mismo `RecipeNotFoundError` que ya
    // exigia una receta inexistente o dada de baja.
    const repo2 = repositorioDePedidos();
    await expect(
      createCreateOrder({
        orders: repo2.orders,
        recipes: cat.recipes,
        products: catalogoDeProductos().products,
        units: catalogoDeUnidades().units,
        presentations: catalogoDePresentaciones().presentations,
        now: () => AHORA,
      })({ recipeId: RECETA_DE_B, quantity: '10.0000', presentationId: PRESENTACION_DE_A }, ACTOR_A),
    ).rejects.toBeInstanceOf(RecipeNotFoundError);

    // Indistinguible de una receta que no existe en absoluto: mismo `code`, mismo mensaje.
    const cat2 = catalogoDeRecetas();
    const repo3 = repositorioDePedidos();
    const errorInexistente = await createCreateOrder({
      orders: repo3.orders,
      recipes: cat2.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones().presentations,
      now: () => AHORA,
    })({ recipeId: RECETA_INEXISTENTE, quantity: '10.0000', presentationId: PRESENTACION_DE_A }, ACTOR_A).catch((e: unknown) => e);

    expect((errorInexistente as PedidosError).code).toBe(codigoAjena);
    expect((errorInexistente as Error).constructor.name).toBe(RecipeNotFoundError.name);
  });

  it('el catalogo recibe la empresa DEL ACTOR, nunca una empresa distinta', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioDePedidos();
    const createOrder = createCreateOrder({
      orders: repo.orders,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones().presentations,
      now: () => AHORA,
    });

    await codigoDelFallo(() => createOrder({ recipeId: RECETA_DE_B, quantity: '10.0000', presentationId: PRESENTACION_DE_A }, ACTOR_A));

    expect(cat.findRefsIncludingDeleted).toHaveBeenCalledWith([RECETA_DE_B], EMPRESA_A);
  });

  it('CONTROL POSITIVO: una receta de la PROPIA empresa se acepta y crea la fila', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioDePedidos();
    const createOrder = createCreateOrder({
      orders: repo.orders,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones().presentations,
      now: () => AHORA,
    });

    const creado = await createOrder({ recipeId: RECETA_DE_A, quantity: '10.0000', presentationId: PRESENTACION_DE_A }, ACTOR_A);

    expect(creado.id).toBe(filaCreada().id);
    expect(repo.create).toHaveBeenCalledTimes(1);
  });
});

describe('QC-146 — la presentacion del pedido en el alta (R6, R8, R13)', () => {
  it('R6: sin presentacion lanza invalid_input y no escribe', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioDePedidos();
    const pres = catalogoDePresentaciones();
    const createOrder = createCreateOrder({
      orders: repo.orders,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: pres.presentations,
      now: () => AHORA,
    });

    expect(
      await codigoDelFallo(() => createOrder({ recipeId: RECETA_DE_A, quantity: '10.0000' }, ACTOR_A)),
    ).toBe('invalid_input');
    expect(repo.create).not.toHaveBeenCalled();
    expect(pres.findRefs).not.toHaveBeenCalled();
  });

  it('R8: una presentacion ausente del catalogo de la empresa -> presentation_not_found, sin escribir', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioDePedidos();
    const pres = catalogoDePresentaciones();
    const createOrder = createCreateOrder({
      orders: repo.orders,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: pres.presentations,
      now: () => AHORA,
    });

    const AJENA = '88888888-8888-4888-8888-888888888888';
    expect(
      await codigoDelFallo(() =>
        createOrder({ recipeId: RECETA_DE_A, quantity: '10.0000', presentationId: AJENA }, ACTOR_A),
      ),
    ).toBe('presentation_not_found');
    expect(repo.create).not.toHaveBeenCalled();
    expect(pres.findRefs).toHaveBeenCalledWith([AJENA], EMPRESA_A);
  });

  it('R13: el coste y la cantidad no dependen de la presentacion', async () => {
    const cat = catalogoDeRecetas(new Map([[RECETA_DE_A, [lineaDeReceta()]]]));
    const prod = catalogoDeProductos([loteCosteable({ stock: 100, unitCost: '3.0000' })]);
    const uni = catalogoDeUnidades(new Map([[LITRO.id, LITRO]]));
    const repo1 = repositorioDePedidos();
    const repo2 = repositorioDePedidos();

    const createOrder1 = createCreateOrder({
      orders: repo1.orders,
      recipes: cat.recipes,
      products: prod.products,
      units: uni.units,
      presentations: catalogoDePresentaciones().presentations,
      now: () => AHORA,
    });
    const createOrder2 = createCreateOrder({
      orders: repo2.orders,
      recipes: cat.recipes,
      products: prod.products,
      units: uni.units,
      presentations: catalogoDePresentaciones().presentations,
      now: () => AHORA,
    });

    await createOrder1({ recipeId: RECETA_DE_A, quantity: '10.0000', presentationId: PRESENTACION_DE_A }, ACTOR_A);
    await createOrder2({ recipeId: RECETA_DE_A, quantity: '10.0000', presentationId: PRESENTACION_DE_A }, ACTOR_A);

    const costeUno = (repo1.create.mock.calls[0] as unknown as readonly unknown[])[4];
    const costeDos = (repo2.create.mock.calls[0] as unknown as readonly unknown[])[4];
    expect(costeUno).toBe(costeDos);
    expect(costeUno).toBe('30.0000');
    // El `NewOrder` que llega al puerto lleva la presentacion, pero nunca se le pasa a
    // `resolveIngredientsCost`: firma de esa funcion en `resolve-ingredients-cost.ts`.
    const dataUno = (repo1.create.mock.calls[0] as unknown as readonly unknown[])[0] as { presentationId: string };
    expect(dataUno.presentationId).toBe(PRESENTACION_DE_A);
  });
});

// T5 — el alta calcula el coste de los ingredientes y lo pasa al puerto, en el orden que R23
// exige: despues del permiso, la validacion y la receta.

const PRODUCTO_X = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const LITRO: UnitConversion = { id: 'l', baseUnitId: null, factor: null };

/** Una unica linea al 100 %: la cantidad necesaria queda igual a la del pedido, y cada test
 *  pone la necesaria que le conviene directamente en `quantity` del pedido. */
function lineaDeReceta(overrides: Partial<RecipeExecutionLine> = {}): RecipeExecutionLine {
  return { productId: PRODUCTO_X, productName: null, percentage: '100.00', ...overrides };
}

function loteCosteable(overrides: Partial<CostingBatch> = {}): CostingBatch {
  return {
    productId: PRODUCTO_X,
    lot: '1',
    stock: 100,
    unitCost: '3.0000',
    unitId: LITRO.id,
    purchaseDate: '2026-01-01',
    ...overrides,
  };
}

/** Los DOS puertos y el catalogo de recetas FALLAN SI SE LLAMAN: no basta con que el alta
 *  rechace, tiene que rechazar SIN haber leido nada (R23). */
function catalogosQueExplotan() {
  const explota = (nombre: string) =>
    vi.fn(() => {
      throw new Error(`${nombre} no deberia llamarse sin permiso`);
    });
  return {
    orders: {
      create: explota('orders.create'),
      findAliveById: explota('orders.findAliveById'),
      listAlive: explota('orders.listAlive'),
      updateAlive: explota('orders.updateAlive'),
      cancelAlive: explota('orders.cancelAlive'),
      softDeleteAlive: explota('orders.softDeleteAlive'),
    } as unknown as OrderRepository,
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

describe('T5 — el alta calcula el importe de los ingredientes', () => {
  it('el alta calcula el importe y lo pasa al puerto (R10)', async () => {
    const cat = catalogoDeRecetas(new Map([[RECETA_DE_A, [lineaDeReceta()]]]));
    const prod = catalogoDeProductos([loteCosteable({ stock: 100, unitCost: '3.0000' })]);
    const uni = catalogoDeUnidades(new Map([[LITRO.id, LITRO]]));
    const repo = repositorioDePedidos();
    const createOrder = createCreateOrder({
      orders: repo.orders,
      recipes: cat.recipes,
      products: prod.products,
      units: uni.units,
      presentations: catalogoDePresentaciones().presentations,
      now: () => AHORA,
    });

    await createOrder(
      { recipeId: RECETA_DE_A, quantity: '20.0000', presentationId: PRESENTACION_DE_A },
      ACTOR_A,
    );

    // necesaria = 20 * 100 % = 20, cubierta por el unico lote a 3.0000: 20 * 3 = 60.
    expect(repo.create).toHaveBeenCalledTimes(1);
    expect((repo.create.mock.calls[0] as unknown as readonly unknown[])[4]).toBe('60.0000');
  });

  it('las lecturas de lotes y de unidades son UNA sola, tenga la receta 1 o 20 lineas', async () => {
    for (const cantidad of [1, 20]) {
      const lineas = Array.from({ length: cantidad }, (_, i) =>
        lineaDeReceta({ productId: `${PRODUCTO_X}-${i % 5}` }),
      );
      const lotes = Array.from({ length: 5 }, (_, i) =>
        loteCosteable({ productId: `${PRODUCTO_X}-${i}`, stock: 100, unitCost: '1.0000' }),
      );
      const cat = catalogoDeRecetas(new Map([[RECETA_DE_A, lineas]]));
      const prod = catalogoDeProductos(lotes);
      const uni = catalogoDeUnidades(new Map([[LITRO.id, LITRO]]));
      const repo = repositorioDePedidos();
      const createOrder = createCreateOrder({
        orders: repo.orders,
        recipes: cat.recipes,
        products: prod.products,
        units: uni.units,
        presentations: catalogoDePresentaciones().presentations,
        now: () => AHORA,
      });

      await createOrder({ recipeId: RECETA_DE_A, quantity: '1.0000', presentationId: PRESENTACION_DE_A }, ACTOR_A);

      expect(prod.findCostingBatches, `${cantidad} lineas`).toHaveBeenCalledTimes(1);
      expect(uni.findRefs, `${cantidad} lineas`).toHaveBeenCalledTimes(1);
    }
  });

  it('sin pedidos.modificar no se lee ni un lote ni una unidad (R23)', async () => {
    const catalogos = catalogosQueExplotan();
    const ACTOR_SIN_MODIFICAR: Actor = {
      id: 'u-1',
      companyId: EMPRESA_A,
      permissions: ['pedidos.consultar'],
    };
    const createOrder = createCreateOrder({
      orders: catalogos.orders,
      recipes: catalogos.recipes,
      products: catalogos.products,
      units: catalogos.units,
      presentations: catalogos.presentations,
      now: () => AHORA,
    });

    await expect(
      createOrder({ recipeId: RECETA_DE_A, quantity: '10.0000', presentationId: PRESENTACION_DE_A }, ACTOR_SIN_MODIFICAR),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('el alta se completa aunque el importe desborde (R24)', async () => {
    const cat = catalogoDeRecetas(
      new Map([[RECETA_DE_A, [lineaDeReceta()]]]),
    );
    const prod = catalogoDeProductos([loteCosteable({ stock: 1, unitCost: '10000000000.0000' })]);
    const uni = catalogoDeUnidades(new Map([[LITRO.id, LITRO]]));
    const repo = repositorioDePedidos();
    const createOrder = createCreateOrder({
      orders: repo.orders,
      recipes: cat.recipes,
      products: prod.products,
      units: uni.units,
      presentations: catalogoDePresentaciones().presentations,
      now: () => AHORA,
    });

    const creado = await createOrder({ recipeId: RECETA_DE_A, quantity: '1.0000', presentationId: PRESENTACION_DE_A }, ACTOR_A);

    expect(creado.id).toBe(filaCreada().id);
    expect(repo.create).toHaveBeenCalledTimes(1);
    expect((repo.create.mock.calls[0] as unknown as readonly unknown[])[4]).toBeNull();
  });
});
