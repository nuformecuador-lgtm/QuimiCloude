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
//
// QC-170: la presentacion UNICA de QC-146 se fue. El alta ahora exige `unitId` y valida el
// reparto (`presentationLines`) contra el total con `validateDistribution` -las descripciones
// «QC-146 — la presentacion del pedido en el alta» de esta feccion pasan a ser
// «QC-170 — el reparto en el alta».

import { describe, expect, it, vi } from 'vitest';

import { createCreateOrder } from '@/lib/modules/pedidos/domain/create-order';
import {
  RecipeNotFoundError,
  RecipeVersionUnderReviewError,
  UnauthorizedError,
  type PedidosError,
} from '@/lib/modules/pedidos/domain/errors';
import { fakeUnitOfWork } from '@/tests/helpers/order-unit-of-work-double';

import type { Actor } from '@/lib/modules/pedidos/domain/actor';
import type { OrderRow } from '@/lib/modules/pedidos/domain/order-view';
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

const RECETA_DE_A = '22222222-2222-4222-8222-222222222222';
const RECETA_DE_B = '55555555-5555-4555-8555-555555555555';
const RECETA_INEXISTENTE = '99999999-9999-4999-8999-999999999999';
const PRESENTACION_DE_A = '66666666-6666-4666-8666-666666666666';
/** La unidad del pedido, por defecto: `catalogoDeUnidades` la deja SIEMPRE resoluble, porque
 *  casi todos los casos de este archivo necesitan un `unitId` valido para llegar al reparto. */
const UNIT_ID = '77777777-7777-4777-8777-777777777777';
const OTRA_UNIDAD_INCOMPATIBLE = '88888888-8888-4888-8888-888888888888';

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
    presentationLines: [],
    unitId: null,
  };
}

/**
 * Catalogo de recetas ACOTADO a la empresa preguntada: una receta de otra empresa simplemente
 * no vuelve en la respuesta, igual que una que no existe -es el contrato que
 * `RecipeCatalog.findRefsIncludingDeleted` promete (QC-50 R25)-.
 */
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
  return { units: { findRefs, findRefsSharingBaseInCompany } as unknown as UnitCatalog, findRefs };
}

/** Catalogo de presentaciones: acepta por defecto `PRESENTACION_DE_A` de la empresa A, con el
 *  contenido y la unidad que le pase el test -`null`/`UNIT_ID` por defecto, para el caso sin
 *  copia y misma unidad que el pedido, sin conversion. */
function catalogoDePresentaciones(
  content: string | null = null,
  unitId: string = UNIT_ID,
): { presentations: PresentationCatalog; findRefs: ReturnType<typeof vi.fn> } {
  const findRefs = vi.fn(async (ids: readonly string[]) =>
    ids.includes(PRESENTACION_DE_A) ? [{ id: PRESENTACION_DE_A, name: 'Bidon 20L', content, unitId }] : [],
  );
  return { presentations: { findRefs } as unknown as PresentationCatalog, findRefs };
}

function repositorioDePedidos() {
  const create = vi.fn(async () => filaCreada());
  const setReservedAt = vi.fn(async () => undefined);
  const syncForOrder = vi.fn(async () => ({ kind: 'reserved' as const }));
  const { unitOfWork } = fakeUnitOfWork({
    orders: { create, setReservedAt },
    reservations: { syncForOrder },
  });
  return { unitOfWork, create, setReservedAt, syncForOrder };
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
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones().presentations,
      now: () => AHORA,
    });

    const codigoAjena = await codigoDelFallo(() =>
      createOrder({ recipeId: RECETA_DE_B, quantity: '10.0000', unitId: UNIT_ID }, ACTOR_A),
    );

    expect(codigoAjena).toBe('recipe_not_found');
    expect(repo.create).not.toHaveBeenCalled();

    // NUNCA nace un codigo de error nuevo: es exactamente el mismo `RecipeNotFoundError` que ya
    // exigia una receta inexistente o dada de baja.
    const repo2 = repositorioDePedidos();
    await expect(
      createCreateOrder({
        unitOfWork: repo2.unitOfWork,
        recipes: cat.recipes,
        products: catalogoDeProductos().products,
        units: catalogoDeUnidades().units,
        presentations: catalogoDePresentaciones().presentations,
        now: () => AHORA,
      })({ recipeId: RECETA_DE_B, quantity: '10.0000', unitId: UNIT_ID }, ACTOR_A),
    ).rejects.toBeInstanceOf(RecipeNotFoundError);

    // Indistinguible de una receta que no existe en absoluto: mismo `code`, mismo mensaje.
    const cat2 = catalogoDeRecetas();
    const repo3 = repositorioDePedidos();
    const errorInexistente = await createCreateOrder({
      unitOfWork: repo3.unitOfWork,
      recipes: cat2.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones().presentations,
      now: () => AHORA,
    })({ recipeId: RECETA_INEXISTENTE, quantity: '10.0000', unitId: UNIT_ID }, ACTOR_A).catch((e: unknown) => e);

    expect((errorInexistente as PedidosError).code).toBe(codigoAjena);
    expect((errorInexistente as Error).constructor.name).toBe(RecipeNotFoundError.name);
  });

  it('el catalogo recibe la empresa DEL ACTOR, nunca una empresa distinta', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioDePedidos();
    const createOrder = createCreateOrder({
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones().presentations,
      now: () => AHORA,
    });

    await codigoDelFallo(() => createOrder({ recipeId: RECETA_DE_B, quantity: '10.0000', unitId: UNIT_ID }, ACTOR_A));

    expect(cat.findRefsIncludingDeleted).toHaveBeenCalledWith([RECETA_DE_B], EMPRESA_A);
  });

  it('CONTROL POSITIVO: una receta de la PROPIA empresa se acepta y crea la fila', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioDePedidos();
    const createOrder = createCreateOrder({
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones().presentations,
      now: () => AHORA,
    });

    const creado = await createOrder({ recipeId: RECETA_DE_A, quantity: '10.0000', unitId: UNIT_ID }, ACTOR_A);

    expect(creado.id).toBe(filaCreada().id);
    expect(repo.create).toHaveBeenCalledTimes(1);
  });
});

describe('QC-170 — el reparto en el alta (R2, R6-R9, R35, R36, R41, R42)', () => {
  it('R41: sin `unitId` lanza invalid_input y no escribe', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioDePedidos();
    const pres = catalogoDePresentaciones();
    const createOrder = createCreateOrder({
      unitOfWork: repo.unitOfWork,
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

  it('R41: una unidad ausente del catalogo de la empresa -> unit_not_found, sin escribir', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioDePedidos();
    const pres = catalogoDePresentaciones();
    const createOrder = createCreateOrder({
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: pres.presentations,
      now: () => AHORA,
    });

    const UNIDAD_AJENA = '99999999-1111-4222-8333-444444444444';
    expect(
      await codigoDelFallo(() =>
        createOrder({ recipeId: RECETA_DE_A, quantity: '10.0000', unitId: UNIDAD_AJENA }, ACTOR_A),
      ),
    ).toBe('unit_not_found');
    expect(repo.create).not.toHaveBeenCalled();
    expect(pres.findRefs).not.toHaveBeenCalled();
  });

  it('R2: una presentacion repetida en el reparto se rechaza en el BORDE, sin llegar a ningun catalogo', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioDePedidos();
    const pres = catalogoDePresentaciones();
    const createOrder = createCreateOrder({
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: pres.presentations,
      now: () => AHORA,
    });

    expect(
      await codigoDelFallo(() =>
        createOrder(
          {
            recipeId: RECETA_DE_A,
            quantity: '10.0000',
            unitId: UNIT_ID,
            presentationLines: [
              { presentationId: PRESENTACION_DE_A, packages: 1 },
              { presentationId: PRESENTACION_DE_A, packages: 2 },
            ],
          },
          ACTOR_A,
        ),
      ),
    ).toBe('invalid_input');
    expect(repo.create).not.toHaveBeenCalled();
    expect(pres.findRefs).not.toHaveBeenCalled();
  });

  it('R9: sin ningun reparto (`[]`), el alta se completa igual y escribe el conjunto vacio', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioDePedidos();
    const createOrder = createCreateOrder({
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones().presentations,
      now: () => AHORA,
    });

    await createOrder({ recipeId: RECETA_DE_A, quantity: '10.0000', unitId: UNIT_ID }, ACTOR_A);

    expect(repo.create).toHaveBeenCalledTimes(1);
    const data = (repo.create.mock.calls[0] as unknown as readonly unknown[])[0] as {
      unitId: string;
      presentationLines: readonly unknown[];
    };
    expect(data.unitId).toBe(UNIT_ID);
    expect(data.presentationLines).toEqual([]);
  });

  it('R6, R8: una linea que existe en la empresa del actor escribe el reparto con el contenido copiado', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioDePedidos();
    const createOrder = createCreateOrder({
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones('5.0000').presentations,
      now: () => AHORA,
    });

    await createOrder(
      {
        recipeId: RECETA_DE_A,
        quantity: '10.0000',
        unitId: UNIT_ID,
        presentationLines: [{ presentationId: PRESENTACION_DE_A, packages: 2 }],
      },
      ACTOR_A,
    );

    const data = (repo.create.mock.calls[0] as unknown as readonly unknown[])[0] as {
      presentationLines: readonly { presentationId: string; packages: number; content: string | null }[];
    };
    expect(data.presentationLines).toEqual([{ presentationId: PRESENTACION_DE_A, packages: 2, content: '5.0000' }]);
  });

  it('una presentacion ausente del catalogo de la empresa -> presentation_not_found, sin escribir', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioDePedidos();
    const pres = catalogoDePresentaciones();
    const createOrder = createCreateOrder({
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: pres.presentations,
      now: () => AHORA,
    });

    const AJENA = '88888888-8888-4888-8888-888888888888';
    expect(
      await codigoDelFallo(() =>
        createOrder(
          {
            recipeId: RECETA_DE_A,
            quantity: '10.0000',
            unitId: UNIT_ID,
            presentationLines: [{ presentationId: AJENA, packages: 1 }],
          },
          ACTOR_A,
        ),
      ),
    ).toBe('presentation_not_found');
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('R35: una presentacion sin contenido en el reparto -> presentation_without_content, sin escribir', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioDePedidos();
    const createOrder = createCreateOrder({
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones(null).presentations,
      now: () => AHORA,
    });

    expect(
      await codigoDelFallo(() =>
        createOrder(
          {
            recipeId: RECETA_DE_A,
            quantity: '10.0000',
            unitId: UNIT_ID,
            presentationLines: [{ presentationId: PRESENTACION_DE_A, packages: 1 }],
          },
          ACTOR_A,
        ),
      ),
    ).toBe('presentation_without_content');
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('R7: la unidad de la presentacion no comparte base con la del pedido -> incompatible_units, sin escribir', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioDePedidos();
    const unidades = catalogoDeUnidades(
      new Map([[OTRA_UNIDAD_INCOMPATIBLE, { id: OTRA_UNIDAD_INCOMPATIBLE, baseUnitId: null, factor: null }]]),
    );
    const createOrder = createCreateOrder({
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: unidades.units,
      presentations: catalogoDePresentaciones('5.0000', OTRA_UNIDAD_INCOMPATIBLE).presentations,
      now: () => AHORA,
    });

    expect(
      await codigoDelFallo(() =>
        createOrder(
          {
            recipeId: RECETA_DE_A,
            quantity: '10.0000',
            unitId: UNIT_ID,
            presentationLines: [{ presentationId: PRESENTACION_DE_A, packages: 1 }],
          },
          ACTOR_A,
        ),
      ),
    ).toBe('incompatible_units');
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('R36: el reparto pasa de la cantidad del pedido -> order_distribution_exceeds_quantity, sin escribir', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioDePedidos();
    const createOrder = createCreateOrder({
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones('5.0000').presentations,
      now: () => AHORA,
    });

    expect(
      await codigoDelFallo(() =>
        createOrder(
          {
            recipeId: RECETA_DE_A,
            quantity: '10.0000',
            unitId: UNIT_ID,
            // 3 envases x 5 = 15, mas que los 10 del pedido.
            presentationLines: [{ presentationId: PRESENTACION_DE_A, packages: 3 }],
          },
          ACTOR_A,
        ),
      ),
    ).toBe('order_distribution_exceeds_quantity');
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('R20: ninguna alta -con o sin reparto- llama a scope.finishedGoods.receiveFromOrder', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioDePedidos();
    const createOrder = createCreateOrder({
      // `fakeUnitOfWork` por defecto explota si algo llama a `finishedGoods.receiveFromOrder`:
      // que el alta termine sin lanzar demuestra que no lo hizo.
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones('5.0000').presentations,
      now: () => AHORA,
    });

    await expect(
      createOrder(
        {
          recipeId: RECETA_DE_A,
          quantity: '10.0000',
          unitId: UNIT_ID,
          presentationLines: [{ presentationId: PRESENTACION_DE_A, packages: 1 }],
        },
        ACTOR_A,
      ),
    ).resolves.toMatchObject({ id: filaCreada().id });
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

/** La unidad de trabajo y el catalogo de recetas FALLAN SI SE LLAMAN: no basta con que el alta
 *  rechace, tiene que rechazar SIN haber leido nada ni abierto la transaccion. */
function catalogosQueExplotan() {
  const explota = (nombre: string) =>
    vi.fn(() => {
      throw new Error(`${nombre} no deberia llamarse sin permiso`);
    });
  return {
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

describe('T5 — el alta calcula el importe de los ingredientes', () => {
  it('el alta calcula el importe y lo pasa al puerto (R10)', async () => {
    const cat = catalogoDeRecetas(new Map([[RECETA_DE_A, [lineaDeReceta()]]]));
    const prod = catalogoDeProductos([loteCosteable({ stock: '100', unitCost: '3.0000' })]);
    const uni = catalogoDeUnidades(new Map([[LITRO.id, LITRO]]));
    const repo = repositorioDePedidos();
    const createOrder = createCreateOrder({
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: prod.products,
      units: uni.units,
      presentations: catalogoDePresentaciones().presentations,
      now: () => AHORA,
    });

    await createOrder(
      { recipeId: RECETA_DE_A, quantity: '20.0000', unitId: UNIT_ID },
      ACTOR_A,
    );

    // necesaria = 20 * 100 % = 20, cubierta por el unico lote a 3.0000: 20 * 3 = 60.
    expect(repo.create).toHaveBeenCalledTimes(1);
    expect((repo.create.mock.calls[0] as unknown as readonly unknown[])[4]).toBe('60.0000');
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
      const createOrder = createCreateOrder({
        unitOfWork: repo.unitOfWork,
        recipes: cat.recipes,
        products: prod.products,
        units: uni.units,
        presentations: catalogoDePresentaciones().presentations,
        now: () => AHORA,
      });

      await createOrder({ recipeId: RECETA_DE_A, quantity: '1.0000', unitId: UNIT_ID }, ACTOR_A);

      expect(prod.findCostingBatches, `${cantidad} lineas`).toHaveBeenCalledTimes(1);
      // Dos llamadas: `resolveIngredientsCost` (el coste) y `resolveDistribution` (el reparto,
      // que resuelve `unitId` aunque no traiga ninguna linea) -ninguna crece con el numero de
      // lineas de la receta.
      expect(uni.findRefs, `${cantidad} lineas`).toHaveBeenCalledTimes(2);
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
      unitOfWork: catalogos.unitOfWork,
      recipes: catalogos.recipes,
      products: catalogos.products,
      units: catalogos.units,
      presentations: catalogos.presentations,
      now: () => AHORA,
    });

    await expect(
      createOrder({ recipeId: RECETA_DE_A, quantity: '10.0000', unitId: UNIT_ID }, ACTOR_SIN_MODIFICAR),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('el alta se completa aunque el importe desborde (R24)', async () => {
    const cat = catalogoDeRecetas(
      new Map([[RECETA_DE_A, [lineaDeReceta()]]]),
    );
    const prod = catalogoDeProductos([loteCosteable({ stock: '1', unitCost: '10000000000.0000' })]);
    const uni = catalogoDeUnidades(new Map([[LITRO.id, LITRO]]));
    const repo = repositorioDePedidos();
    const createOrder = createCreateOrder({
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: prod.products,
      units: uni.units,
      presentations: catalogoDePresentaciones().presentations,
      now: () => AHORA,
    });

    const creado = await createOrder({ recipeId: RECETA_DE_A, quantity: '1.0000', unitId: UNIT_ID }, ACTOR_A);

    expect(creado.id).toBe(filaCreada().id);
    expect(repo.create).toHaveBeenCalledTimes(1);
    expect((repo.create.mock.calls[0] as unknown as readonly unknown[])[4]).toBeNull();
  });

  it('el alta no excluye ningun pedido del disponible: todavia no aparto nada (R65)', async () => {
    const cat = catalogoDeRecetas(new Map([[RECETA_DE_A, [lineaDeReceta()]]]));
    const prod = catalogoDeProductos([loteCosteable({ stock: '100', unitCost: '3.0000' })]);
    const uni = catalogoDeUnidades(new Map([[LITRO.id, LITRO]]));
    const repo = repositorioDePedidos();
    const createOrder = createCreateOrder({
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: prod.products,
      units: uni.units,
      presentations: catalogoDePresentaciones().presentations,
      now: () => AHORA,
    });

    await createOrder(
      { recipeId: RECETA_DE_A, quantity: '20.0000', unitId: UNIT_ID },
      ACTOR_A,
    );

    expect(prod.findCostingBatches).toHaveBeenCalledWith([PRODUCTO_X], EMPRESA_A, { excludeOrderId: undefined });
  });
});

describe('QC-141 T9 — crear con reserva (R7, R41, R49)', () => {
  /** Registra el ORDEN real de las llamadas al `scope` de la unidad de trabajo, no solo si se
   *  llamaron: `create` -> `syncForOrder` -> `setReservedAt` es el pseudocodigo literal del
   *  caso de uso. */
  function repositorioConOrden(outcome: 'reserved' | 'not_reserved' = 'reserved') {
    const orden: string[] = [];
    const create = vi.fn(async () => {
      orden.push('orders.create');
      return filaCreada();
    });
    const setReservedAt = vi.fn(async (id: string, reservedAt: Date | null) => {
      void [id, reservedAt];
      orden.push('orders.setReservedAt');
    });
    const syncForOrder = vi.fn(async () => {
      orden.push('reservations.syncForOrder');
      return { kind: outcome } as const;
    });
    const { unitOfWork } = fakeUnitOfWork({
      orders: { create, setReservedAt },
      reservations: { syncForOrder },
    });
    return { unitOfWork, orden, create, setReservedAt, syncForOrder };
  }

  it('el orden real es create -> syncForOrder -> setReservedAt(now) cuando aparta', async () => {
    const cat = catalogoDeRecetas(new Map([[RECETA_DE_A, [lineaDeReceta()]]]));
    const repo = repositorioConOrden('reserved');
    const createOrder = createCreateOrder({
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones().presentations,
      now: () => AHORA,
    });

    await createOrder({ recipeId: RECETA_DE_A, quantity: '10.0000', unitId: UNIT_ID }, ACTOR_A);

    expect(repo.orden).toEqual(['orders.create', 'reservations.syncForOrder', 'orders.setReservedAt']);
    expect(repo.setReservedAt.mock.calls[0]?.[1]).toBe(AHORA);
  });

  it('setReservedAt recibe null cuando el reparto no aparta (not_reserved)', async () => {
    const cat = catalogoDeRecetas(new Map([[RECETA_DE_A, [lineaDeReceta()]]]));
    const repo = repositorioConOrden('not_reserved');
    const createOrder = createCreateOrder({
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones().presentations,
      now: () => AHORA,
    });

    await createOrder({ recipeId: RECETA_DE_A, quantity: '10.0000', unitId: UNIT_ID }, ACTOR_A);

    expect(repo.setReservedAt.mock.calls[0]?.[1]).toBeNull();
  });

  it('R41: el permiso se exige ANTES de abrir la unidad de trabajo', async () => {
    const cat = catalogoDeRecetas();
    const unitOfWork = {
      run: vi.fn(() => {
        throw new Error('unitOfWork.run no deberia llamarse sin permiso');
      }),
    };
    const createOrder = createCreateOrder({
      unitOfWork: unitOfWork as unknown as ReturnType<typeof repositorioDePedidos>['unitOfWork'],
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones().presentations,
      now: () => AHORA,
    });
    const SIN_PERMISO: Actor = { id: 'u-1', companyId: EMPRESA_A, permissions: ['pedidos.consultar'] };

    await expect(
      createOrder({ recipeId: RECETA_DE_A, quantity: '10.0000', unitId: UNIT_ID }, SIN_PERMISO),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    expect(unitOfWork.run).not.toHaveBeenCalled();
  });

  it('R49: una receta sin lineas guarda sin error y deja reserved_at nulo', async () => {
    // Receta sin lineas: `catalogoDeRecetas()` por defecto sin mapa devuelve `lines: []`.
    const cat = catalogoDeRecetas();
    const repo = repositorioConOrden('not_reserved');
    const createOrder = createCreateOrder({
      unitOfWork: repo.unitOfWork,
      recipes: cat.recipes,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones().presentations,
      now: () => AHORA,
    });

    const creado = await createOrder(
      { recipeId: RECETA_DE_A, quantity: '10.0000', unitId: UNIT_ID },
      ACTOR_A,
    );

    expect(creado.id).toBe(filaCreada().id);
    expect(repo.syncForOrder).toHaveBeenCalledTimes(1);
    const requerido = (repo.syncForOrder.mock.calls[0] as unknown as readonly [{ requirement: readonly unknown[] }])[0];
    expect(requerido.requirement).toEqual([]);
    expect(repo.setReservedAt.mock.calls[0]?.[1]).toBeNull();
  });

  it('m7: la receta para la reserva se lee con `scope.recipes`, no con el lector global del coste', async () => {
    const lineas = [lineaDeReceta()];
    // El lector GLOBAL solo responde por el COSTE (fuera de la unidad de trabajo): una sola
    // llamada. Si `create-order.ts` volviera a preguntarle por la reserva, esta prueba lo
    // detectaria contando sus llamadas.
    const findExecutionContentByIdGlobal = vi.fn(async (id: string) => ({
      id,
      name: 'Receta',
      isDeleted: false,
      steps: [],
      lines: lineas,
    }));
    const recipesGlobal = {
      findRefsIncludingDeleted: vi.fn(async (ids: readonly string[]) => ids.map((id) => ({ id, name: 'x', ownName: 'x', isUnderReview: false, original: null, isDeleted: false }))),
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
    }));
    const create = vi.fn(async () => filaCreada());
    const setReservedAt = vi.fn(async () => undefined);
    const syncForOrder = vi.fn(async (input: { requirement: readonly unknown[] }) => {
      expect(input.requirement).toEqual([{ productId: PRODUCTO_X, quantity: '10' }]);
      return { kind: 'reserved' as const };
    });
    const { unitOfWork } = fakeUnitOfWork({
      orders: { create, setReservedAt },
      reservations: { syncForOrder },
      recipes: { findExecutionContentById: findExecutionContentByIdDeLaTransaccion },
    });
    const createOrder = createCreateOrder({
      unitOfWork,
      recipes: recipesGlobal,
      products: catalogoDeProductos().products,
      units: catalogoDeUnidades().units,
      presentations: catalogoDePresentaciones().presentations,
      now: () => AHORA,
    });

    await createOrder({ recipeId: RECETA_DE_A, quantity: '10.0000', unitId: UNIT_ID }, ACTOR_A);

    expect(findExecutionContentByIdGlobal).toHaveBeenCalledTimes(1);
    expect(findExecutionContentByIdDeLaTransaccion).toHaveBeenCalledWith(RECETA_DE_A, EMPRESA_A);
  });
});

describe('alta con version de receta', () => {
  const VERSION_DE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const VERSION_DE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const ORIGINAL_A = { id: RECETA_DE_A, name: 'Acido citrico 50%' };
  const PRODUCTO_Y = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

  function ref(id: string, overrides: Partial<RecipeRef> = {}): RecipeRef {
    return { id, name: id, ownName: id, isDeleted: false, isUnderReview: false, original: null, ...overrides };
  }

  /** Catalogo acotado a la empresa A: lo que no esta en `refs` no vuelve, como una receta de
   *  otra empresa. Las lineas de cada id las sirven los dos lectores, global y de transaccion. */
  function catalogoConVersiones(
    refs: readonly RecipeRef[],
    lineas: ReadonlyMap<string, readonly RecipeExecutionLine[]> = new Map(),
  ) {
    const findRefsIncludingDeleted = vi.fn(async (ids: readonly string[], companyId: string) =>
      companyId === EMPRESA_A ? refs.filter((r) => ids.includes(r.id)) : [],
    );
    const contenido = (id: string) => ({ id, name: 'Receta', isDeleted: false, steps: [], lines: lineas.get(id) ?? [] });
    const findExecutionContentById = vi.fn(async (id: string) => contenido(id));
    const enTransaccion = vi.fn(async (id: string) => contenido(id));
    return {
      recipes: { findRefsIncludingDeleted, findExecutionContentById } as unknown as RecipeCatalog,
      findRefsIncludingDeleted,
      findExecutionContentById,
      enTransaccion,
    };
  }

  function alta(
    recipes: RecipeCatalog,
    enTransaccion?: RecipeCatalog['findExecutionContentById'],
    batches: readonly CostingBatch[] = [],
  ) {
    const create = vi.fn(async () => filaCreada());
    const setReservedAt = vi.fn(async () => undefined);
    const syncForOrder = vi.fn(async () => ({ kind: 'reserved' as const }));
    const { unitOfWork } = fakeUnitOfWork({
      orders: { create, setReservedAt },
      reservations: { syncForOrder },
      ...(enTransaccion === undefined ? {} : { recipes: { findExecutionContentById: enTransaccion } }),
    });
    const run = vi.spyOn(unitOfWork, 'run');
    const createOrder = createCreateOrder({
      unitOfWork,
      recipes,
      products: catalogoDeProductos(batches).products,
      units: catalogoDeUnidades(new Map([[LITRO.id, LITRO]])).units,
      presentations: catalogoDePresentaciones().presentations,
      now: () => AHORA,
    });
    return { createOrder, create, syncForOrder, run };
  }

  const entrada = (recipeVersionId?: string | null) => ({
    recipeId: RECETA_DE_A,
    quantity: '10.0000',
    unitId: UNIT_ID,
    ...(recipeVersionId === undefined ? {} : { recipeVersionId }),
  });

  it('R30: guarda la version como receta y calcula necesidad y coste con SUS lineas, en una sola lectura del catalogo', async () => {
    const cat = catalogoConVersiones(
      [ref(RECETA_DE_A), ref(VERSION_DE_A, { original: ORIGINAL_A })],
      new Map([
        [RECETA_DE_A, [lineaDeReceta()]],
        [VERSION_DE_A, [lineaDeReceta({ productId: PRODUCTO_Y })]],
      ]),
    );
    const lotes = [
      loteCosteable({ stock: '100', unitCost: '3.0000' }),
      loteCosteable({ productId: PRODUCTO_Y, stock: '100', unitCost: '5.0000' }),
    ];
    const { createOrder, create, syncForOrder } = alta(cat.recipes, cat.enTransaccion, lotes);

    await createOrder(entrada(VERSION_DE_A), ACTOR_A);

    expect(cat.findRefsIncludingDeleted).toHaveBeenCalledTimes(1);
    expect(cat.findRefsIncludingDeleted).toHaveBeenCalledWith([RECETA_DE_A, VERSION_DE_A], EMPRESA_A);
    const [nuevo, , , , coste] = create.mock.calls[0] as unknown as readonly [
      { recipeId: string },
      unknown,
      unknown,
      unknown,
      string,
    ];
    expect(nuevo.recipeId).toBe(VERSION_DE_A);
    expect(nuevo).not.toHaveProperty('recipeVersionId');
    expect(coste).toBe('50.0000');
    expect(cat.findExecutionContentById).toHaveBeenCalledWith(VERSION_DE_A, EMPRESA_A);
    expect(cat.enTransaccion).toHaveBeenCalledWith(VERSION_DE_A, EMPRESA_A);
    const sync = (syncForOrder.mock.calls[0] as unknown as readonly [{ requirement: readonly unknown[] }])[0];
    expect(sync.requirement).toEqual([{ productId: PRODUCTO_Y, quantity: '10' }]);
  });

  it('R31: sin version, o con version vacia, pide solo la receta y guarda la original como hoy', async () => {
    for (const recipeVersionId of [undefined, null, '']) {
      const cat = catalogoConVersiones([ref(RECETA_DE_A)]);
      const { createOrder, create } = alta(cat.recipes);

      await createOrder(entrada(recipeVersionId), ACTOR_A);

      expect(cat.findRefsIncludingDeleted).toHaveBeenCalledWith([RECETA_DE_A], EMPRESA_A);
      expect((create.mock.calls[0] as unknown as readonly [{ recipeId: string }])[0].recipeId).toBe(RECETA_DE_A);
    }
  });

  const rechazos: readonly (readonly [string, readonly RecipeRef[], string, string])[] = [
    ['la receta es una version', [ref(VERSION_DE_A, { original: ORIGINAL_A })], VERSION_DE_A, ''],
    [
      'la version es de otra receta',
      [ref(RECETA_DE_A), ref(VERSION_DE_B, { original: { id: RECETA_DE_B, name: 'B' } })],
      RECETA_DE_A,
      VERSION_DE_B,
    ],
    [
      'la version esta de baja',
      [ref(RECETA_DE_A), ref(VERSION_DE_A, { original: ORIGINAL_A, isDeleted: true })],
      RECETA_DE_A,
      VERSION_DE_A,
    ],
    ['la version es de otra empresa', [ref(RECETA_DE_A)], RECETA_DE_A, VERSION_DE_A],
    [
      'la original esta de baja',
      [ref(RECETA_DE_A, { isDeleted: true }), ref(VERSION_DE_A, { original: ORIGINAL_A })],
      RECETA_DE_A,
      VERSION_DE_A,
    ],
  ];

  it.each(rechazos)(
    'R32: %s -> recipe_not_found sin abrir la unidad de trabajo',
    async (_caso, refs, recipeId, recipeVersionId) => {
      const cat = catalogoConVersiones(refs);
      const { createOrder, create, run } = alta(cat.recipes);

      const error = await createOrder({ ...entrada(recipeVersionId), recipeId }, ACTOR_A).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(RecipeNotFoundError);
      expect(run).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
      expect(cat.findExecutionContentById).not.toHaveBeenCalled();
    },
  );

  it('R33: una version por revisar -> recipe_version_under_review, distinto de not_found, sin abrir la unidad de trabajo', async () => {
    const cat = catalogoConVersiones([
      ref(RECETA_DE_A),
      ref(VERSION_DE_A, { original: ORIGINAL_A, isUnderReview: true }),
    ]);
    const { createOrder, create, run } = alta(cat.recipes);

    const error = await createOrder(entrada(VERSION_DE_A), ACTOR_A).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RecipeVersionUnderReviewError);
    expect((error as PedidosError).code).toBe('recipe_version_under_review');
    expect(run).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('R39: con version se exige el mismo permiso de hoy y sin el no se lee nada', async () => {
    const createOrder = createCreateOrder({ ...catalogosQueExplotan(), now: () => AHORA });
    const SIN_PERMISO: Actor = { id: 'u-1', companyId: EMPRESA_A, permissions: ['pedidos.consultar'] };

    await expect(createOrder(entrada(VERSION_DE_A), SIN_PERMISO)).rejects.toBeInstanceOf(UnauthorizedError);

    const cat = catalogoConVersiones([ref(RECETA_DE_A), ref(VERSION_DE_A, { original: ORIGINAL_A })]);
    const { createOrder: conPermiso, create } = alta(cat.recipes);
    await conPermiso(entrada(VERSION_DE_A), { ...SIN_PERMISO, permissions: ['pedidos.modificar'] });
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe('QC-138 — el alta bloquea con confirmacion (R1, R2, R3, R5, R6, R8)', () => {
  const INSUFICIENTE = { kind: 'insufficient' as const, productIds: [PRODUCTO_X] };

  function repositorioQueBloquea(outcome: { kind: 'reserved' } | { kind: 'not_reserved' } | typeof INSUFICIENTE) {
    const orden: string[] = [];
    const create = vi.fn(async () => {
      orden.push('orders.create');
      return filaCreada();
    });
    const syncForOrder = vi.fn(async () => {
      orden.push('reservations.syncForOrder');
      return outcome;
    });
    const setStatus = vi.fn(async () => {
      orden.push('orders.setStatus');
      return 'ok' as const;
    });
    const setIngredientsCost = vi.fn(async () => {
      orden.push('orders.setIngredientsCost');
      return 'ok' as const;
    });
    const setReservedAt = vi.fn(async (id: string, reservedAt: Date | null) => {
      void [id, reservedAt];
      orden.push('orders.setReservedAt');
    });
    const { unitOfWork } = fakeUnitOfWork({
      orders: { create, setStatus, setIngredientsCost, setReservedAt },
      reservations: { syncForOrder },
    });
    return { unitOfWork, orden, create, syncForOrder, setStatus, setIngredientsCost, setReservedAt };
  }

  function altaCon(repo: ReturnType<typeof repositorioQueBloquea>, prod = catalogoDeProductos()) {
    return createCreateOrder({
      unitOfWork: repo.unitOfWork,
      recipes: catalogoDeRecetas(new Map([[RECETA_DE_A, [lineaDeReceta()]]])).recipes,
      products: prod.products,
      units: catalogoDeUnidades(new Map([[LITRO.id, LITRO]])).units,
      presentations: catalogoDePresentaciones().presentations,
      now: () => AHORA,
    });
  }

  const ENTRADA = { recipeId: RECETA_DE_A, quantity: '10.0000', unitId: UNIT_ID };

  it('R1, R6: no alcanza y sin confirmacion -> order_would_block, sin fijar estado ni reserva', async () => {
    const repo = repositorioQueBloquea(INSUFICIENTE);
    const createOrder = altaCon(repo);

    expect(await codigoDelFallo(() => createOrder(ENTRADA, ACTOR_A))).toBe('order_would_block');
    expect(repo.orden).toEqual(['orders.create', 'reservations.syncForOrder']);
    expect(repo.setStatus).not.toHaveBeenCalled();
    expect(repo.setReservedAt).not.toHaveBeenCalled();
  });

  it('R6: confirmBlocked=false explicito se comporta igual que la ausencia', async () => {
    const repo = repositorioQueBloquea(INSUFICIENTE);
    const createOrder = altaCon(repo);

    expect(await codigoDelFallo(() => createOrder({ ...ENTRADA, confirmBlocked: false }, ACTOR_A))).toBe(
      'order_would_block',
    );
  });

  it('R5, R8: no alcanza y con confirmacion -> BLOQUEADO desde PENDIENTE, reserved_at nulo', async () => {
    const repo = repositorioQueBloquea(INSUFICIENTE);
    const createOrder = altaCon(repo);

    const creado = await createOrder({ ...ENTRADA, confirmBlocked: true }, ACTOR_A);

    expect(creado.id).toBe(filaCreada().id);
    expect(repo.setStatus).toHaveBeenCalledWith(
      filaCreada().id,
      'PENDIENTE',
      'BLOQUEADO',
      ACTOR_A.id,
      AHORA,
      { companyId: EMPRESA_A },
    );
    expect(repo.setReservedAt.mock.calls[0]?.[1]).toBeNull();
    // El alta inserta con el estado por defecto: el bloqueado entra solo por `setStatus`.
    expect((repo.create.mock.calls[0] as unknown as readonly [{ status: string }])[0].status).toBe('PENDIENTE');
  });

  it('R5: con confirmacion, un importe calculado antes de bloquear se borra', async () => {
    const repo = repositorioQueBloquea(INSUFICIENTE);
    const createOrder = altaCon(repo, catalogoDeProductos([loteCosteable({ stock: '100', unitCost: '3.0000' })]));

    await createOrder({ ...ENTRADA, confirmBlocked: true }, ACTOR_A);

    expect((repo.create.mock.calls[0] as unknown as readonly unknown[])[4]).toBe('30.0000');
    expect(repo.setIngredientsCost).toHaveBeenCalledWith(filaCreada().id, null, ACTOR_A.id, AHORA, {
      companyId: EMPRESA_A,
    });
  });

  it('R5: sin importe previo no hace falta borrarlo', async () => {
    const repo = repositorioQueBloquea(INSUFICIENTE);
    const createOrder = altaCon(repo);

    await createOrder({ ...ENTRADA, confirmBlocked: true }, ACTOR_A);

    expect(repo.setIngredientsCost).not.toHaveBeenCalled();
  });

  it('R8, R10: con confirmacion pero alcanza -> PENDIENTE con material apartado, sin setStatus', async () => {
    const repo = repositorioQueBloquea({ kind: 'reserved' });
    const createOrder = altaCon(repo);

    await createOrder({ ...ENTRADA, confirmBlocked: true }, ACTOR_A);

    expect(repo.setStatus).not.toHaveBeenCalled();
    expect(repo.setReservedAt.mock.calls[0]?.[1]).toBe(AHORA);
  });

  it('R2: receta sin lineas (not_reserved) -> PENDIENTE sin pedir confirmacion', async () => {
    const repo = repositorioQueBloquea({ kind: 'not_reserved' });
    const createOrder = altaCon(repo);

    await createOrder(ENTRADA, ACTOR_A);

    expect(repo.setStatus).not.toHaveBeenCalled();
    expect(repo.setReservedAt.mock.calls[0]?.[1]).toBeNull();
  });

  it('R3: importe nulo por una unidad sin base comun, con la reserva cubierta -> PENDIENTE', async () => {
    const repo = repositorioQueBloquea({ kind: 'reserved' });
    // El lote esta en una unidad que no se puede convertir a la del producto: el coste es nulo.
    const prod = catalogoDeProductos(
      [loteCosteable({ unitId: 'bidon' })],
      [{ id: PRODUCTO_X, name: 'producto', unitId: LITRO.id, stockByUnit: [], type: 'PRODUCT' }],
    );
    const createOrder = altaCon(repo, prod);

    await createOrder(ENTRADA, ACTOR_A);

    expect((repo.create.mock.calls[0] as unknown as readonly unknown[])[4]).toBeNull();
    expect(repo.setStatus).not.toHaveBeenCalled();
    expect(repo.setReservedAt.mock.calls[0]?.[1]).toBe(AHORA);
  });

  it('R37: sin pedidos.modificar -> unauthorized antes de leer nada', async () => {
    const catalogos = catalogosQueExplotan();
    const createOrder = createCreateOrder({ ...catalogos, now: () => AHORA });
    const SIN_PERMISO: Actor = { id: 'u-1', companyId: EMPRESA_A, permissions: ['inventario.modificar'] };

    await expect(createOrder({ ...ENTRADA, confirmBlocked: true }, SIN_PERMISO)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });
});
