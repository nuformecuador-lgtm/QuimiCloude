// `createTransitionOrder`: implementa `OrderCatalog['transitionAliveById']` sobre la unidad de
// trabajo compartida con `inventario`. Doble de `OrderUnitOfWork`, sin base de
// datos: lo que se prueba es el ORDEN de llamadas (permiso implicito en `assertTransition`
// antes de abrir la unidad, `lockAliveById` antes de `consumeForOrder`, `consumeForOrder` antes
// de `setStatus`: si falta material o la receta no tiene lineas, ni el estado ni `finishedAt`
// quedan escritos) y los CINCO resultados posibles.

import { describe, expect, it, vi } from 'vitest';

import { InvalidTransitionError } from '@/lib/modules/pedidos/domain/errors';
import { createTransitionOrder } from '@/lib/modules/pedidos/domain/transition-order';
import { fakeUnitOfWork } from '@/tests/helpers/order-unit-of-work-double';

import type { OrderRow } from '@/lib/modules/pedidos/domain/order-view';
import type { RecipeCatalog, RecipeExecutionLine } from '@/lib/modules/recetas';

const EMPRESA = 'c-1';
const AHORA = new Date('2026-09-23T12:00:00Z');

function filaBloqueada(overrides: Partial<OrderRow> = {}): OrderRow {
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
    presentationId: null,
    ...overrides,
  };
}

/** Con una sola linea al 100%, para no repetir la formula de `consumedQuantity` en cada test. */
function catalogoDeRecetas(lines: readonly RecipeExecutionLine[] = [{ productId: 'p-1', productName: null, percentage: '100.00' }]) {
  const findExecutionContentById = vi.fn(async (id: string) => ({
    id,
    name: 'Receta',
    isDeleted: false,
    steps: [],
    lines,
  }));
  return { recipes: { findExecutionContentById } as unknown as RecipeCatalog, findExecutionContentById };
}

describe('createTransitionOrder', () => {
  it('R21/R22: una transicion ilegal lanza InvalidTransitionError SIN abrir la unidad de trabajo', async () => {
    const { recipes } = catalogoDeRecetas();
    const lockAliveById = vi.fn();
    const { unitOfWork } = fakeUnitOfWork({ orders: { lockAliveById } });
    const transitionAliveById = createTransitionOrder({ unitOfWork, recipes });

    await expect(
      transitionAliveById('o-1', EMPRESA, 'ENTREGADO', 'EN_CURSO', 'actor-1', AHORA),
    ).rejects.toBeInstanceOf(InvalidTransitionError);

    expect(lockAliveById).not.toHaveBeenCalled();
  });

  it('not_found: el pedido no existe, esta borrado o es de otra empresa', async () => {
    const { recipes } = catalogoDeRecetas();
    const lockAliveById = vi.fn(async () => null);
    const { unitOfWork } = fakeUnitOfWork({ orders: { lockAliveById } });
    const transitionAliveById = createTransitionOrder({ unitOfWork, recipes });

    await expect(
      transitionAliveById('o-1', EMPRESA, 'PENDIENTE', 'EN_CURSO', 'actor-1', AHORA),
    ).resolves.toBe('not_found');
  });

  it('stale: la fila bloqueada ya no esta en el estado que dice el llamante', async () => {
    const { recipes } = catalogoDeRecetas();
    const lockAliveById = vi.fn(async () => filaBloqueada({ status: 'EN_CURSO' }));
    const setStatus = vi.fn();
    const { unitOfWork } = fakeUnitOfWork({ orders: { lockAliveById, setStatus } });
    const transitionAliveById = createTransitionOrder({ unitOfWork, recipes });

    await expect(
      transitionAliveById('o-1', EMPRESA, 'PENDIENTE', 'EN_CURSO', 'actor-1', AHORA),
    ).resolves.toBe('stale');

    expect(setStatus).not.toHaveBeenCalled();
  });

  it('ok, sin consumo: PENDIENTE -> EN_CURSO no toca la reserva', async () => {
    const { recipes, findExecutionContentById } = catalogoDeRecetas();
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
    });
    const transitionAliveById = createTransitionOrder({ unitOfWork, recipes });

    await expect(
      transitionAliveById('o-1', EMPRESA, 'PENDIENTE', 'EN_CURSO', 'actor-1', AHORA),
    ).resolves.toBe('ok');

    expect(orden).toEqual(['lockAliveById', 'setStatus']);
    expect(findExecutionContentById).not.toHaveBeenCalled();
    expect(consumeForOrder).not.toHaveBeenCalled();
    expect(setReservedAt).not.toHaveBeenCalled();
  });

  it('R27, R28: EN_CURSO -> ENTREGADO consume con la receta actual y libera reserved_at, en orden', async () => {
    const { recipes, findExecutionContentById } = catalogoDeRecetas();
    const orden: string[] = [];
    const lockAliveById = vi.fn(async () => {
      orden.push('lockAliveById');
      return filaBloqueada({ status: 'EN_CURSO', recipeId: 'r-9', quantity: '5.0000' });
    });
    const setStatus = vi.fn(async () => {
      orden.push('setStatus');
      return 'ok' as const;
    });
    const consumeForOrder = vi.fn(async (input) => {
      orden.push('consumeForOrder');
      expect(input).toEqual({
        orderId: 'o-1',
        companyId: EMPRESA,
        fallbackRequirement: [{ productId: 'p-1', quantity: '5' }],
        actorId: 'actor-1',
        now: AHORA,
      });
      return { kind: 'consumed' as const };
    });
    const setReservedAt = vi.fn(async () => {
      orden.push('setReservedAt');
    });
    const { unitOfWork } = fakeUnitOfWork({
      orders: { lockAliveById, setStatus, setReservedAt },
      reservations: { consumeForOrder },
    });
    const transitionAliveById = createTransitionOrder({ unitOfWork, recipes });

    await expect(
      transitionAliveById('o-1', EMPRESA, 'EN_CURSO', 'ENTREGADO', 'actor-1', AHORA),
    ).resolves.toBe('ok');

    expect(findExecutionContentById).toHaveBeenCalledWith('r-9', EMPRESA);
    expect(orden).toEqual(['lockAliveById', 'consumeForOrder', 'setStatus', 'setReservedAt']);
    expect(setReservedAt).toHaveBeenCalledWith('o-1', null, { companyId: EMPRESA });
  });

  it('R30, R31: material insuficiente deshace la transaccion entera', async () => {
    const { recipes } = catalogoDeRecetas();
    const lockAliveById = vi.fn(async () => filaBloqueada({ status: 'EN_CURSO' }));
    const setStatus = vi.fn(async () => 'ok' as const);
    const consumeForOrder = vi.fn(async () => ({ kind: 'insufficient' as const, productIds: ['p-1'] }));
    const setReservedAt = vi.fn();
    const { unitOfWork } = fakeUnitOfWork({
      orders: { lockAliveById, setStatus, setReservedAt },
      reservations: { consumeForOrder },
    });
    const transitionAliveById = createTransitionOrder({ unitOfWork, recipes });

    await expect(
      transitionAliveById('o-1', EMPRESA, 'EN_CURSO', 'ENTREGADO', 'actor-1', AHORA),
    ).resolves.toBe('insufficient_material');

    // R51: si el consumo falla, ni el estado ni `finishedAt` quedan escritos.
    expect(setStatus).not.toHaveBeenCalled();
    expect(setReservedAt).not.toHaveBeenCalled();
  });

  it('R50: receta sin lineas y nada apartado deshace la transaccion entera', async () => {
    const { recipes } = catalogoDeRecetas();
    const lockAliveById = vi.fn(async () => filaBloqueada({ status: 'EN_CURSO' }));
    const setStatus = vi.fn(async () => 'ok' as const);
    const consumeForOrder = vi.fn(async () => ({ kind: 'nothing_to_consume' as const }));
    const setReservedAt = vi.fn();
    const { unitOfWork } = fakeUnitOfWork({
      orders: { lockAliveById, setStatus, setReservedAt },
      reservations: { consumeForOrder },
    });
    const transitionAliveById = createTransitionOrder({ unitOfWork, recipes });

    await expect(
      transitionAliveById('o-1', EMPRESA, 'EN_CURSO', 'ENTREGADO', 'actor-1', AHORA),
    ).resolves.toBe('recipe_without_lines');

    // R51: si el consumo falla, ni el estado ni `finishedAt` quedan escritos.
    expect(setStatus).not.toHaveBeenCalled();
    expect(setReservedAt).not.toHaveBeenCalled();
  });
});
