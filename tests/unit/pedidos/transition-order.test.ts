// `createTransitionOrder`: implementa `OrderCatalog['transitionAliveById']` sobre la unidad de
// trabajo compartida con `inventario`. Doble de `OrderUnitOfWork`, sin base de
// datos: lo que se prueba es el ORDEN de llamadas (permiso implicito en `assertTransition`
// antes de abrir la unidad, `lockAliveById` antes de `consumeForOrder`, `consumeForOrder` antes
// de `setStatus`: si falta material o la receta no tiene lineas, ni el estado ni `finishedAt`
// quedan escritos) y los resultados posibles, incluida el alta del lote de producto terminado
// del Finalizar.

import { describe, expect, it, vi } from 'vitest';

import { InvalidTransitionError } from '@/lib/modules/pedidos/domain/errors';
import { createTransitionOrder, type TransitionOrderDeps } from '@/lib/modules/pedidos/domain/transition-order';
import { fakeFinishedGoodsIntake, fakeUnitOfWork } from '@/tests/helpers/order-unit-of-work-double';

import type { LockedOrderRow } from '@/lib/modules/pedidos/ports/order-write-repository';
import type { OrderTransactionScope, OrderUnitOfWork } from '@/lib/modules/pedidos/ports/order-unit-of-work';
import type { RecipeExecutionLine } from '@/lib/modules/recetas';

const EMPRESA = 'c-1';
const AHORA = new Date('2026-09-23T12:00:00Z');

/** Con contenido `1`: quien no lo necesite distinto no repite el calculo de envases en cada
 *  test (R12: un pedido de `10` con contenido `1` da 10 envases exactos). */
function filaBloqueada(overrides: Partial<LockedOrderRow> = {}): LockedOrderRow {
  return {
    id: 'o-1',
    number: { year: 2026, sequence: 7 },
    recipeId: 'r-1',
    quantity: '10.0000',
    priority: 'BAJA',
    status: 'EN_CURSO',
    cancellationReason: null,
    ingredientsCost: null,
    createdAt: AHORA,
    updatedAt: AHORA,
    createdBy: 'admin-0',
    updatedBy: 'admin-0',
    presentationId: 'p-1',
    presentationContent: '1.0000',
    reservedAt: null,
    ...overrides,
  };
}

/** Con una sola linea al 100%, para no repetir la formula de `consumedQuantity` en cada test.
 *  Es el lector de `scope.recipes`: sobre el cliente de la
 *  transaccion, nunca el lector global. */
function catalogoDeRecetas(lines: readonly RecipeExecutionLine[] = [{ productId: 'p-1', productName: null, percentage: '100.00' }]) {
  const findExecutionContentById = vi.fn(async (id: string) => ({
    id,
    name: 'Receta',
    isDeleted: false,
    steps: [],
    lines,
  }));
  return { recipes: { findExecutionContentById } as unknown as OrderTransactionScope['recipes'], findExecutionContentById };
}

/** Deps de `TransitionOrderDeps` fuera del ambito: el catalogo global de recetas -para el
 *  nombre y, cuando hace falta, para recalcular el coste- y los catalogos de productos y
 *  unidades, que ningun test de este archivo necesita distintos de vacios. */
function catalogosGlobales(overrides: { readonly recipeName?: string } = {}) {
  const findRefsIncludingDeleted = vi.fn(async (ids: readonly string[]) =>
    ids.map((id) => ({ id, name: overrides.recipeName ?? 'Desengrasante industrial', isDeleted: false })),
  );
  const recipes = {
    findRefsIncludingDeleted,
    findExecutionContentById: vi.fn(),
    findIdsMatchingName: vi.fn(),
  } as unknown as TransitionOrderDeps['recipes'];
  const products = {
    findRefs: vi.fn(async () => []),
    findCostingBatches: vi.fn(async () => []),
  } as unknown as TransitionOrderDeps['products'];
  const units = {
    findRefs: vi.fn(async () => []),
    findRefsSharingBaseInCompany: vi.fn(async () => []),
  } as unknown as TransitionOrderDeps['units'];
  return { recipes, products, units, findRefsIncludingDeleted };
}

describe('createTransitionOrder', () => {
  it('R21/R22: una transicion ilegal lanza InvalidTransitionError SIN abrir la unidad de trabajo', async () => {
    const lockAliveById = vi.fn();
    const { unitOfWork } = fakeUnitOfWork({ orders: { lockAliveById } });
    const { recipes, products, units } = catalogosGlobales();
    const transitionAliveById = createTransitionOrder({ unitOfWork, recipes, products, units });

    await expect(
      transitionAliveById('o-1', EMPRESA, 'ENTREGADO', 'EN_CURSO', 'actor-1', AHORA),
    ).rejects.toBeInstanceOf(InvalidTransitionError);

    expect(lockAliveById).not.toHaveBeenCalled();
  });

  it('not_found: el pedido no existe, esta borrado o es de otra empresa', async () => {
    const lockAliveById = vi.fn(async () => null);
    const { unitOfWork } = fakeUnitOfWork({ orders: { lockAliveById } });
    const { recipes, products, units } = catalogosGlobales();
    const transitionAliveById = createTransitionOrder({ unitOfWork, recipes, products, units });

    await expect(
      transitionAliveById('o-1', EMPRESA, 'PENDIENTE', 'EN_CURSO', 'actor-1', AHORA),
    ).resolves.toBe('not_found');
  });

  it('stale: la fila bloqueada ya no esta en el estado que dice el llamante', async () => {
    const lockAliveById = vi.fn(async () => filaBloqueada({ status: 'EN_CURSO' }));
    const setStatus = vi.fn();
    const { unitOfWork } = fakeUnitOfWork({ orders: { lockAliveById, setStatus } });
    const { recipes, products, units } = catalogosGlobales();
    const transitionAliveById = createTransitionOrder({ unitOfWork, recipes, products, units });

    await expect(
      transitionAliveById('o-1', EMPRESA, 'PENDIENTE', 'EN_CURSO', 'actor-1', AHORA),
    ).resolves.toBe('stale');

    expect(setStatus).not.toHaveBeenCalled();
  });

  it('ok, sin consumo: PENDIENTE -> EN_CURSO no toca la reserva ni el producto terminado', async () => {
    const { recipes: scopeRecipes, findExecutionContentById } = catalogoDeRecetas();
    const orden: string[] = [];
    const lockAliveById = vi.fn(async () => {
      orden.push('lockAliveById');
      return filaBloqueada({ status: 'PENDIENTE' });
    });
    const setStatus = vi.fn(async () => {
      orden.push('setStatus');
      return 'ok' as const;
    });
    const consumeForOrder = vi.fn(async () => ({ kind: 'consumed' as const }));
    const setReservedAt = vi.fn();
    const receiveFromOrder = vi.fn();
    const { unitOfWork } = fakeUnitOfWork({
      orders: { lockAliveById, setStatus, setReservedAt },
      reservations: { consumeForOrder },
      recipes: scopeRecipes,
      finishedGoods: { receiveFromOrder },
    });
    const { recipes, products, units } = catalogosGlobales();
    const transitionAliveById = createTransitionOrder({ unitOfWork, recipes, products, units });

    await expect(
      transitionAliveById('o-1', EMPRESA, 'PENDIENTE', 'EN_CURSO', 'actor-1', AHORA),
    ).resolves.toBe('ok');

    expect(orden).toEqual(['lockAliveById', 'setStatus']);
    expect(findExecutionContentById).not.toHaveBeenCalled();
    expect(consumeForOrder).not.toHaveBeenCalled();
    expect(setReservedAt).not.toHaveBeenCalled();
    expect(receiveFromOrder).not.toHaveBeenCalled();
  });

  it('R18: sin presentacion, se rechaza con presentation_without_content ANTES de consumir', async () => {
    const { recipes: scopeRecipes } = catalogoDeRecetas();
    const lockAliveById = vi.fn(async () => filaBloqueada({ status: 'EN_CURSO', presentationId: null, presentationContent: null }));
    const consumeForOrder = vi.fn();
    const setStatus = vi.fn();
    const receiveFromOrder = vi.fn();
    const { unitOfWork } = fakeUnitOfWork({
      orders: { lockAliveById, setStatus },
      reservations: { consumeForOrder },
      recipes: scopeRecipes,
      finishedGoods: { receiveFromOrder },
    });
    const { recipes, products, units } = catalogosGlobales();
    const transitionAliveById = createTransitionOrder({ unitOfWork, recipes, products, units });

    await expect(
      transitionAliveById('o-1', EMPRESA, 'EN_CURSO', 'ENTREGADO', 'actor-1', AHORA),
    ).resolves.toBe('presentation_without_content');

    expect(consumeForOrder).not.toHaveBeenCalled();
    expect(setStatus).not.toHaveBeenCalled();
    expect(receiveFromOrder).not.toHaveBeenCalled();
  });

  it('R42, R43: con importe guardado, el coste del lote es ese importe -sin recalcular- y se resuelve antes de consumir', async () => {
    const { recipes: scopeRecipes } = catalogoDeRecetas();
    const orden: string[] = [];
    const lockAliveById = vi.fn(async () => {
      orden.push('lockAliveById');
      return filaBloqueada({ status: 'EN_CURSO', ingredientsCost: '12.5000' });
    });
    const consumeForOrder = vi.fn(async () => {
      orden.push('consumeForOrder');
      return { kind: 'consumed' as const };
    });
    const setStatus = vi.fn(async () => {
      orden.push('setStatus');
      return 'ok' as const;
    });
    const setReservedAt = vi.fn(async () => {
      orden.push('setReservedAt');
    });
    const receiveFromOrder = vi.fn(async (input: { readonly lotCost: string }) => {
      orden.push('receiveFromOrder');
      expect(input.lotCost).toBe('12.5000');
      return { kind: 'received' as const, productId: 'pt-1', productName: 'Receta · Botella 1L', packages: '10' };
    });
    const { unitOfWork } = fakeUnitOfWork({
      orders: { lockAliveById, setStatus, setReservedAt },
      reservations: { consumeForOrder },
      recipes: scopeRecipes,
      finishedGoods: { receiveFromOrder },
    });
    const { recipes, products, units, findRefsIncludingDeleted } = catalogosGlobales();
    const transitionAliveById = createTransitionOrder({ unitOfWork, recipes, products, units });

    const resultado = await transitionAliveById('o-1', EMPRESA, 'EN_CURSO', 'ENTREGADO', 'actor-1', AHORA);

    expect(resultado).toEqual({
      kind: 'ok',
      finishedGoods: { productName: 'Receta · Botella 1L', packages: '10' },
    });
    // El importe guardado nunca pide el coste global -no hay nada que recalcular-.
    expect(orden).toEqual(['lockAliveById', 'consumeForOrder', 'setStatus', 'receiveFromOrder', 'setReservedAt']);
    expect(findRefsIncludingDeleted).toHaveBeenCalledWith(['r-1'], EMPRESA);
  });

  it('R42: sin importe guardado, se recalcula ANTES de consumir con el catalogo global', async () => {
    const { recipes: scopeRecipes } = catalogoDeRecetas();
    const orden: string[] = [];
    const lockAliveById = vi.fn(async () => {
      orden.push('lockAliveById');
      return filaBloqueada({ status: 'EN_CURSO', ingredientsCost: null, recipeId: 'r-9', quantity: '5.0000' });
    });
    const consumeForOrder = vi.fn(async () => {
      orden.push('consumeForOrder');
      return { kind: 'consumed' as const };
    });
    const setStatus = vi.fn(async () => 'ok' as const);
    const setReservedAt = vi.fn();
    const receiveFromOrder = vi.fn(async (input: { readonly lotCost: string }) => {
      orden.push('receiveFromOrder');
      expect(input.lotCost).toBe('7.0000');
      return { kind: 'received' as const, productId: 'pt-1', productName: 'Receta · Botella 1L', packages: '5' };
    });
    const { unitOfWork } = fakeUnitOfWork({
      orders: { lockAliveById, setStatus, setReservedAt },
      reservations: { consumeForOrder },
      recipes: scopeRecipes,
      finishedGoods: { receiveFromOrder },
    });
    const { recipes, products, units } = catalogosGlobales();
    // Receta con una linea al 100%, un lote con disponible 5 a 1.4000/kg -el resto de la lectura
    // ya la prueba `order-cost.test.ts`-: la resolucion no es el objeto de este archivo, solo su
    // MOMENTO. `5 (needed) x 1.4000 (coste) = 7.0000`.
    (recipes.findExecutionContentById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'r-9',
      name: 'Receta',
      isDeleted: false,
      steps: [],
      lines: [{ productId: 'p-9', productName: null, percentage: '100.00' }],
    });
    (products.findCostingBatches as ReturnType<typeof vi.fn>).mockResolvedValue([
      { productId: 'p-9', lot: 'L-1', stock: '5.0000', unitCost: '1.4000', unitId: 'u-1', purchaseDate: '2026-01-01', available: '5.0000' },
    ]);
    (products.findRefs as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'p-9', name: 'Acido', unitId: 'u-1', stockByUnit: [], type: 'PRODUCT' },
    ]);
    (units.findRefs as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'u-1', baseUnitId: null, factor: null },
    ]);

    const transitionAliveById = createTransitionOrder({ unitOfWork, recipes, products, units });

    const resultado = await transitionAliveById('o-1', EMPRESA, 'EN_CURSO', 'ENTREGADO', 'actor-1', AHORA);

    expect(resultado).toEqual({
      kind: 'ok',
      finishedGoods: { productName: 'Receta · Botella 1L', packages: '5' },
    });
    expect(orden).toEqual(['lockAliveById', 'consumeForOrder', 'receiveFromOrder']);
  });

  it('R10, R41: la produccion va DESPUES del consumo, con el contenido y la cantidad del pedido', async () => {
    const { recipes: scopeRecipes } = catalogoDeRecetas();
    const orden: string[] = [];
    const lockAliveById = vi.fn(async () => filaBloqueada({ status: 'EN_CURSO', ingredientsCost: '0.0000' }));
    const consumeForOrder = vi.fn(async () => {
      orden.push('consumeForOrder');
      return { kind: 'consumed' as const };
    });
    const setStatus = vi.fn(async () => {
      orden.push('setStatus');
      return 'ok' as const;
    });
    const setReservedAt = vi.fn(async () => {
      orden.push('setReservedAt');
    });
    const receiveFromOrder = vi.fn(async (input) => {
      orden.push('receiveFromOrder');
      expect(input).toEqual({
        orderId: 'o-1',
        companyId: EMPRESA,
        recipeId: 'r-1',
        recipeName: 'Desengrasante industrial',
        presentationId: 'p-1',
        orderQuantity: '10.0000',
        orderContent: '1.0000',
        lotCost: '0.0000',
        actorId: 'actor-1',
        now: AHORA,
      });
      return { kind: 'received' as const, productId: 'pt-1', productName: 'Desengrasante industrial · Botella 1L', packages: '10' };
    });
    const { unitOfWork } = fakeUnitOfWork({
      orders: { lockAliveById, setStatus, setReservedAt },
      reservations: { consumeForOrder },
      recipes: scopeRecipes,
      finishedGoods: { receiveFromOrder },
    });
    const { recipes, products, units } = catalogosGlobales();
    const transitionAliveById = createTransitionOrder({ unitOfWork, recipes, products, units });

    const resultado = await transitionAliveById('o-1', EMPRESA, 'EN_CURSO', 'ENTREGADO', 'actor-1', AHORA);

    expect(resultado).toEqual({
      kind: 'ok',
      finishedGoods: { productName: 'Desengrasante industrial · Botella 1L', packages: '10' },
    });
    expect(orden).toEqual(['consumeForOrder', 'setStatus', 'receiveFromOrder', 'setReservedAt']);
  });

  it('R18, R20: presentation_without_content del alta de inventario deshace la transaccion entera', async () => {
    const { recipes: scopeRecipes } = catalogoDeRecetas();
    const lockAliveById = vi.fn(async () => filaBloqueada({ status: 'EN_CURSO' }));
    const consumeForOrder = vi.fn(async () => ({ kind: 'consumed' as const }));
    const setStatus = vi.fn(async () => 'ok' as const);
    const setReservedAt = vi.fn();
    const receiveFromOrder = vi.fn(async () => ({ kind: 'presentation_without_content' as const }));
    const { orders, reservations, recipes: scope, finishedGoods } = fakeUnitOfWork({
      orders: { lockAliveById, setStatus, setReservedAt },
      reservations: { consumeForOrder },
      recipes: scopeRecipes,
      finishedGoods: { receiveFromOrder },
    });
    let vioLaExcepcion = false;
    const unitOfWork: OrderUnitOfWork = {
      run: async <T>(work: (scope: OrderTransactionScope) => Promise<T>) => {
        try {
          return await work({ orders, reservations, recipes: scope, finishedGoods });
        } catch (err) {
          vioLaExcepcion = true;
          throw err;
        }
      },
    };
    const { recipes, products, units } = catalogosGlobales();
    const transitionAliveById = createTransitionOrder({ unitOfWork, recipes, products, units });

    await expect(
      transitionAliveById('o-1', EMPRESA, 'EN_CURSO', 'ENTREGADO', 'actor-1', AHORA),
    ).resolves.toBe('presentation_without_content');

    expect(vioLaExcepcion).toBe(true);
    expect(setReservedAt).not.toHaveBeenCalled();
  });

  it('R19, R20: no_whole_package del alta de inventario deshace la transaccion entera', async () => {
    const { recipes: scopeRecipes } = catalogoDeRecetas();
    const lockAliveById = vi.fn(async () => filaBloqueada({ status: 'EN_CURSO' }));
    const consumeForOrder = vi.fn(async () => ({ kind: 'consumed' as const }));
    const setStatus = vi.fn(async () => 'ok' as const);
    const setReservedAt = vi.fn();
    const receiveFromOrder = vi.fn(async () => ({ kind: 'no_whole_package' as const }));
    const { unitOfWork } = fakeUnitOfWork({
      orders: { lockAliveById, setStatus, setReservedAt },
      reservations: { consumeForOrder },
      recipes: scopeRecipes,
      finishedGoods: { receiveFromOrder },
    });
    const { recipes, products, units } = catalogosGlobales();
    const transitionAliveById = createTransitionOrder({ unitOfWork, recipes, products, units });

    await expect(
      transitionAliveById('o-1', EMPRESA, 'EN_CURSO', 'ENTREGADO', 'actor-1', AHORA),
    ).resolves.toBe('no_whole_package');

    expect(setReservedAt).not.toHaveBeenCalled();
  });

  it('D24: recipe_not_found del alta de inventario deshace la transaccion entera', async () => {
    const { recipes: scopeRecipes } = catalogoDeRecetas();
    const lockAliveById = vi.fn(async () => filaBloqueada({ status: 'EN_CURSO' }));
    const consumeForOrder = vi.fn(async () => ({ kind: 'consumed' as const }));
    const setStatus = vi.fn(async () => 'ok' as const);
    const setReservedAt = vi.fn();
    const receiveFromOrder = vi.fn(async () => ({ kind: 'recipe_not_found' as const }));
    const { unitOfWork } = fakeUnitOfWork({
      orders: { lockAliveById, setStatus, setReservedAt },
      reservations: { consumeForOrder },
      recipes: scopeRecipes,
      finishedGoods: { receiveFromOrder },
    });
    const { recipes, products, units } = catalogosGlobales();
    const transitionAliveById = createTransitionOrder({ unitOfWork, recipes, products, units });

    await expect(
      transitionAliveById('o-1', EMPRESA, 'EN_CURSO', 'ENTREGADO', 'actor-1', AHORA),
    ).resolves.toBe('recipe_not_found');

    expect(setReservedAt).not.toHaveBeenCalled();
  });

  it('R30, R31, R51: material insuficiente deshace la transaccion entera', async () => {
    const { recipes } = catalogoDeRecetas();
    const lockAliveById = vi.fn(async () => filaBloqueada({ status: 'EN_CURSO' }));
    const setStatus = vi.fn(async () => 'ok' as const);
    const consumeForOrder = vi.fn(async () => ({ kind: 'insufficient' as const, productIds: ['p-1'] }));
    const setReservedAt = vi.fn();
    const receiveFromOrder = vi.fn();
    const { unitOfWork } = fakeUnitOfWork({
      orders: { lockAliveById, setStatus, setReservedAt },
      reservations: { consumeForOrder },
      recipes,
      finishedGoods: { receiveFromOrder },
    });
    const { recipes: globalRecipes, products, units } = catalogosGlobales();
    const transitionAliveById = createTransitionOrder({ unitOfWork, recipes: globalRecipes, products, units });

    await expect(
      transitionAliveById('o-1', EMPRESA, 'EN_CURSO', 'ENTREGADO', 'actor-1', AHORA),
    ).resolves.toBe('insufficient_material');

    // Si el consumo falla, ni el estado ni `finishedAt` quedan escritos, y el producto terminado
    // ni se intenta.
    expect(setStatus).not.toHaveBeenCalled();
    expect(setReservedAt).not.toHaveBeenCalled();
    expect(receiveFromOrder).not.toHaveBeenCalled();
  });

  it('R51: setStatus devuelve stale tras consumir y la unidad se deshace', async () => {
    const { recipes } = catalogoDeRecetas();
    const lockAliveById = vi.fn(async () => filaBloqueada({ status: 'EN_CURSO' }));
    const setStatus = vi.fn(async () => 'stale' as const);
    const consumeForOrder = vi.fn(async () => ({ kind: 'consumed' as const }));
    const setReservedAt = vi.fn();
    const receiveFromOrder = vi.fn();
    const { orders, reservations, recipes: scopeRecipes, finishedGoods } = fakeUnitOfWork({
      orders: { lockAliveById, setStatus, setReservedAt },
      reservations: { consumeForOrder },
      recipes,
      finishedGoods: { receiveFromOrder },
    });
    let vioLaExcepcion = false;
    const unitOfWork: OrderUnitOfWork = {
      run: async <T>(work: (scope: OrderTransactionScope) => Promise<T>) => {
        try {
          return await work({ orders, reservations, recipes: scopeRecipes, finishedGoods });
        } catch (err) {
          vioLaExcepcion = true;
          throw err;
        }
      },
    };
    const { recipes: globalRecipes, products, units } = catalogosGlobales();
    const transitionAliveById = createTransitionOrder({ unitOfWork, recipes: globalRecipes, products, units });

    await expect(
      transitionAliveById('o-1', EMPRESA, 'EN_CURSO', 'ENTREGADO', 'actor-1', AHORA),
    ).resolves.toBe('stale');

    expect(vioLaExcepcion).toBe(true);
    expect(consumeForOrder).toHaveBeenCalledTimes(1);
    expect(setReservedAt).not.toHaveBeenCalled();
    expect(receiveFromOrder).not.toHaveBeenCalled();
  });

  it('R50, R51: receta sin lineas y nada apartado deshace la transaccion entera', async () => {
    const { recipes } = catalogoDeRecetas();
    const lockAliveById = vi.fn(async () => filaBloqueada({ status: 'EN_CURSO' }));
    const setStatus = vi.fn(async () => 'ok' as const);
    const consumeForOrder = vi.fn(async () => ({ kind: 'nothing_to_consume' as const }));
    const setReservedAt = vi.fn();
    const receiveFromOrder = vi.fn();
    const { unitOfWork } = fakeUnitOfWork({
      orders: { lockAliveById, setStatus, setReservedAt },
      reservations: { consumeForOrder },
      recipes,
      finishedGoods: { receiveFromOrder },
    });
    const { recipes: globalRecipes, products, units } = catalogosGlobales();
    const transitionAliveById = createTransitionOrder({ unitOfWork, recipes: globalRecipes, products, units });

    await expect(
      transitionAliveById('o-1', EMPRESA, 'EN_CURSO', 'ENTREGADO', 'actor-1', AHORA),
    ).resolves.toBe('recipe_without_lines');

    // Si el consumo falla, ni el estado ni `finishedAt` quedan escritos.
    expect(setStatus).not.toHaveBeenCalled();
    expect(setReservedAt).not.toHaveBeenCalled();
    expect(receiveFromOrder).not.toHaveBeenCalled();
  });
});

/** `fakeFinishedGoodsIntake` explota si nadie lo configura: lo comprueba una sola vez, para
 *  dejar constancia de que el doble por defecto NO es un `undefined` silencioso. */
describe('fakeFinishedGoodsIntake', () => {
  it('explota si se le llama sin que el test lo configure', async () => {
    const doble = fakeFinishedGoodsIntake();
    await expect(
      doble.receiveFromOrder({
        orderId: 'o-1',
        companyId: EMPRESA,
        recipeId: 'r-1',
        recipeName: 'Receta',
        presentationId: 'p-1',
        orderQuantity: '10.0000',
        orderContent: '1.0000',
        lotCost: '0.0000',
        actorId: 'actor-1',
        now: AHORA,
      }),
    ).rejects.toThrow();
  });
});
