// `createTransitionOrder`: implementa `OrderCatalog['transitionAliveById']` sobre la unidad de
// trabajo compartida con `inventario`. Doble de `OrderUnitOfWork`, sin base de datos: lo que se
// prueba es el ORDEN de llamadas (permiso implicito en `assertTransition` antes de abrir la
// unidad, `lockAliveById` antes de `consumeForOrder`, `consumeForOrder` antes de `setStatus`: si
// falta material o la receta no tiene lineas, ni el estado ni `finishedAt` quedan escritos) y
// los resultados posibles.
//
// R15, R16: Finalizar (`EN_CURSO -> POR_EMPACAR`) ya NO da de alta ningun lote de
// producto terminado -eso se traslada a Terminar el empaque (T14)-, asi que `TransitionOrderDeps`
// se queda solo con `unitOfWork` y este archivo ya no dobla `recipes`/`products`/`units`
// globales ni `scope.finishedGoods`.

import { describe, expect, it, vi } from 'vitest';

import { InvalidTransitionError } from '@/lib/modules/pedidos/domain/errors';
import { createTransitionOrder } from '@/lib/modules/pedidos/domain/transition-order';
import { fakeUnitOfWork } from '@/tests/helpers/order-unit-of-work-double';

import type { LockedOrderRow } from '@/lib/modules/pedidos/ports/order-write-repository';
import type { OrderTransactionScope, OrderUnitOfWork } from '@/lib/modules/pedidos/ports/order-unit-of-work';
import type { RecipeExecutionLine } from '@/lib/modules/recetas';

const EMPRESA = 'c-1';
const AHORA = new Date('2026-09-23T12:00:00Z');

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
    presentationLines: [],
    unitId: null,
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

describe('createTransitionOrder', () => {
  it('R21/R22: una transicion ilegal lanza InvalidTransitionError SIN abrir la unidad de trabajo', async () => {
    const lockAliveById = vi.fn();
    const { unitOfWork } = fakeUnitOfWork({ orders: { lockAliveById } });
    const transitionAliveById = createTransitionOrder({ unitOfWork });

    await expect(
      transitionAliveById('o-1', EMPRESA, 'ENTREGADO', 'EN_CURSO', 'actor-1', AHORA),
    ).rejects.toBeInstanceOf(InvalidTransitionError);

    expect(lockAliveById).not.toHaveBeenCalled();
  });

  it('R2: rechaza EN_EMPAQUE como destino, aunque la matriz lo admita, SIN abrir la unidad de trabajo', async () => {
    const lockAliveById = vi.fn();
    const { unitOfWork } = fakeUnitOfWork({ orders: { lockAliveById } });
    const transitionAliveById = createTransitionOrder({ unitOfWork });

    await expect(
      transitionAliveById('o-1', EMPRESA, 'POR_EMPACAR', 'EN_EMPAQUE', 'actor-1', AHORA),
    ).rejects.toBeInstanceOf(InvalidTransitionError);

    expect(lockAliveById).not.toHaveBeenCalled();
  });

  it('R2: rechaza ENTREGADO como destino, aunque la matriz lo admita, SIN abrir la unidad de trabajo', async () => {
    const lockAliveById = vi.fn();
    const { unitOfWork } = fakeUnitOfWork({ orders: { lockAliveById } });
    const transitionAliveById = createTransitionOrder({ unitOfWork });

    await expect(
      transitionAliveById('o-1', EMPRESA, 'EN_EMPAQUE', 'ENTREGADO', 'actor-1', AHORA),
    ).rejects.toBeInstanceOf(InvalidTransitionError);

    expect(lockAliveById).not.toHaveBeenCalled();
  });

  it('not_found: el pedido no existe, esta borrado o es de otra empresa', async () => {
    const lockAliveById = vi.fn(async () => null);
    const { unitOfWork } = fakeUnitOfWork({ orders: { lockAliveById } });
    const transitionAliveById = createTransitionOrder({ unitOfWork });

    await expect(
      transitionAliveById('o-1', EMPRESA, 'PENDIENTE', 'EN_CURSO', 'actor-1', AHORA),
    ).resolves.toBe('not_found');
  });

  it('stale: la fila bloqueada ya no esta en el estado que dice el llamante', async () => {
    const lockAliveById = vi.fn(async () => filaBloqueada({ status: 'EN_CURSO' }));
    const setStatus = vi.fn();
    const { unitOfWork } = fakeUnitOfWork({ orders: { lockAliveById, setStatus } });
    const transitionAliveById = createTransitionOrder({ unitOfWork });

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
    const { unitOfWork } = fakeUnitOfWork({
      orders: { lockAliveById, setStatus, setReservedAt },
      reservations: { consumeForOrder },
      recipes: scopeRecipes,
    });
    const transitionAliveById = createTransitionOrder({ unitOfWork });

    await expect(
      transitionAliveById('o-1', EMPRESA, 'PENDIENTE', 'EN_CURSO', 'actor-1', AHORA),
    ).resolves.toBe('ok');

    expect(orden).toEqual(['lockAliveById', 'setStatus']);
    expect(findExecutionContentById).not.toHaveBeenCalled();
    expect(consumeForOrder).not.toHaveBeenCalled();
    expect(setReservedAt).not.toHaveBeenCalled();
  });

  it('R15: POR_EMPACAR consume el material sin exigir presentacion ni receta viva, y no da de alta ningun lote', async () => {
    const { recipes: scopeRecipes } = catalogoDeRecetas();
    const orden: string[] = [];
    // Sin presentacion ni contenido: antes esto rechazaba con
    // `presentation_without_content`; ahora Finalizar ni lo mira (R15, R16).
    const lockAliveById = vi.fn(async () => filaBloqueada({ status: 'EN_CURSO', presentationLines: [] }));
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
    const { unitOfWork } = fakeUnitOfWork({
      orders: { lockAliveById, setStatus, setReservedAt },
      reservations: { consumeForOrder },
      recipes: scopeRecipes,
    });
    const transitionAliveById = createTransitionOrder({ unitOfWork });

    await expect(
      transitionAliveById('o-1', EMPRESA, 'EN_CURSO', 'POR_EMPACAR', 'actor-1', AHORA),
    ).resolves.toBe('ok');

    expect(orden).toEqual(['consumeForOrder', 'setStatus', 'setReservedAt']);
  });

  it('R44 retirado: un pedido con `unit_id NULL` y sin reparto SI finaliza y queda POR_EMPACAR', async () => {
    // [D2']/[D3']: el pedido sin unidad ya no queda varado -quien tiene
    // `pedidos.modificar` la asigna en la edicion acotada de `POR_EMPACAR`-, asi que Finalizar
    // no gana ninguna condicion nueva. `LockedOrderRow` de esta tanda todavia no tiene
    // `unitId` (T7/T23 lo agregan): este caso documenta que, cuando lo tenga, Finalizar sigue
    // sin mirarlo -nadie reintroduce la condicion retirada-.
    const { recipes: scopeRecipes } = catalogoDeRecetas();
    const lockAliveById = vi.fn(async () => filaBloqueada({ status: 'EN_CURSO' }));
    const consumeForOrder = vi.fn(async () => ({ kind: 'consumed' as const }));
    const setStatus = vi.fn(async () => 'ok' as const);
    const setReservedAt = vi.fn();
    const { unitOfWork } = fakeUnitOfWork({
      orders: { lockAliveById, setStatus, setReservedAt },
      reservations: { consumeForOrder },
      recipes: scopeRecipes,
    });
    const transitionAliveById = createTransitionOrder({ unitOfWork });

    await expect(
      transitionAliveById('o-1', EMPRESA, 'EN_CURSO', 'POR_EMPACAR', 'actor-1', AHORA),
    ).resolves.toBe('ok');
    expect(setReservedAt).toHaveBeenCalledTimes(1);
  });

  it('R30: el ciclo de reserva no cambia -`setReservedAt(null)` sigue llamandose tras consumir-', async () => {
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
    const setReservedAt = vi.fn(async (id: string, reservedAt: Date | null) => {
      orden.push('setReservedAt');
      expect(reservedAt).toBeNull();
    });
    const { unitOfWork } = fakeUnitOfWork({
      orders: { lockAliveById, setStatus, setReservedAt },
      reservations: { consumeForOrder },
      recipes: scopeRecipes,
    });
    const transitionAliveById = createTransitionOrder({ unitOfWork });

    await expect(
      transitionAliveById('o-1', EMPRESA, 'EN_CURSO', 'POR_EMPACAR', 'actor-1', AHORA),
    ).resolves.toBe('ok');
    expect(orden).toEqual(['consumeForOrder', 'setStatus', 'setReservedAt']);
  });

  it('R30, R31, R51: material insuficiente deshace la transaccion entera', async () => {
    const { recipes } = catalogoDeRecetas();
    const lockAliveById = vi.fn(async () => filaBloqueada({ status: 'EN_CURSO' }));
    const setStatus = vi.fn(async () => 'ok' as const);
    const consumeForOrder = vi.fn(async () => ({ kind: 'insufficient' as const, productIds: ['p-1'] }));
    const setReservedAt = vi.fn();
    const { unitOfWork } = fakeUnitOfWork({
      orders: { lockAliveById, setStatus, setReservedAt },
      reservations: { consumeForOrder },
      recipes,
    });
    const transitionAliveById = createTransitionOrder({ unitOfWork });

    await expect(
      transitionAliveById('o-1', EMPRESA, 'EN_CURSO', 'POR_EMPACAR', 'actor-1', AHORA),
    ).resolves.toBe('insufficient_material');

    // Si el consumo falla, ni el estado ni `finishedAt` quedan escritos.
    expect(setStatus).not.toHaveBeenCalled();
    expect(setReservedAt).not.toHaveBeenCalled();
  });

  it('R51: setStatus devuelve stale tras consumir y la unidad se deshace', async () => {
    const { recipes } = catalogoDeRecetas();
    const lockAliveById = vi.fn(async () => filaBloqueada({ status: 'EN_CURSO' }));
    const setStatus = vi.fn(async () => 'stale' as const);
    const consumeForOrder = vi.fn(async () => ({ kind: 'consumed' as const }));
    const setReservedAt = vi.fn();
    const { orders, reservations, recipes: scopeRecipes, finishedGoods } = fakeUnitOfWork({
      orders: { lockAliveById, setStatus, setReservedAt },
      reservations: { consumeForOrder },
      recipes,
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
    const transitionAliveById = createTransitionOrder({ unitOfWork });

    await expect(
      transitionAliveById('o-1', EMPRESA, 'EN_CURSO', 'POR_EMPACAR', 'actor-1', AHORA),
    ).resolves.toBe('stale');

    expect(vioLaExcepcion).toBe(true);
    expect(consumeForOrder).toHaveBeenCalledTimes(1);
    expect(setReservedAt).not.toHaveBeenCalled();
  });

  it('R50, R51: receta sin lineas y nada apartado deshace la transaccion entera', async () => {
    const { recipes } = catalogoDeRecetas();
    const lockAliveById = vi.fn(async () => filaBloqueada({ status: 'EN_CURSO' }));
    const setStatus = vi.fn(async () => 'ok' as const);
    const consumeForOrder = vi.fn(async () => ({ kind: 'nothing_to_consume' as const }));
    const setReservedAt = vi.fn();
    const { unitOfWork } = fakeUnitOfWork({
      orders: { lockAliveById, setStatus, setReservedAt },
      reservations: { consumeForOrder },
      recipes,
    });
    const transitionAliveById = createTransitionOrder({ unitOfWork });

    await expect(
      transitionAliveById('o-1', EMPRESA, 'EN_CURSO', 'POR_EMPACAR', 'actor-1', AHORA),
    ).resolves.toBe('recipe_without_lines');

    // Si el consumo falla, ni el estado ni `finishedAt` quedan escritos.
    expect(setStatus).not.toHaveBeenCalled();
    expect(setReservedAt).not.toHaveBeenCalled();
  });
});

describe('QC-195 — pasar a POR_EMPACAR consume solo la receta', () => {
  it('R26: consumeForOrder recibe como productIds los productos de la receta, no los envases del reparto', async () => {
    const { recipes } = catalogoDeRecetas([
      { productId: 'p-1', productName: null, percentage: '60.00' },
      { productId: 'p-2', productName: null, percentage: '40.00' },
    ]);
    const lockAliveById = vi.fn(async () =>
      filaBloqueada({
        status: 'EN_CURSO',
        presentationLines: [{ presentationId: 'pres-1', packages: 40, packagingProductId: 'envase-1' }],
      }),
    );
    const consumeForOrder = vi.fn(async () => ({ kind: 'consumed' as const }));
    const { unitOfWork } = fakeUnitOfWork({
      orders: { lockAliveById, setStatus: vi.fn(async () => 'ok' as const), setReservedAt: vi.fn() },
      reservations: { consumeForOrder },
      recipes,
    });

    await expect(
      createTransitionOrder({ unitOfWork })('o-1', EMPRESA, 'EN_CURSO', 'POR_EMPACAR', 'actor-1', AHORA),
    ).resolves.toBe('ok');

    expect(consumeForOrder).toHaveBeenCalledTimes(1);
    expect(consumeForOrder).toHaveBeenCalledWith(expect.objectContaining({ productIds: ['p-1', 'p-2'] }));
    const entrada = (consumeForOrder.mock.calls[0] as unknown as readonly [{ fallbackRequirement: readonly { productId: string }[] }])[0];
    expect(entrada.fallbackRequirement.map((line) => line.productId)).toEqual(['p-1', 'p-2']);
  });
});
