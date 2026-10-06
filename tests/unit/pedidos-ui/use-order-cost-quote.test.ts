// @vitest-environment jsdom
// La unidad del pedido en la cotizacion: viaja en la peticion, cambiarla recotiza y sin ella no
// se pide nada. Un `.test.ts` cae en el proyecto `node`; el hook necesita DOM, de ahi el docblock.

import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { OrderCostQuoteResult } from '@/lib/modules/pedidos/adapters/driving/order-actions';

const { quoteOrderCostActionMock } = vi.hoisted(() => ({
  quoteOrderCostActionMock: vi.fn<(input: unknown) => Promise<OrderCostQuoteResult>>(),
}));

vi.mock('@/lib/modules/pedidos/adapters/driving/order-actions', () => ({
  quoteOrderCostAction: quoteOrderCostActionMock,
}));

import {
  MISSING_VALUE_MARK,
  ORDER_COST_QUOTE_VALUE_TESTID,
  OrderCostQuote,
  useOrderCostQuote,
} from '@/app/(private)/pedidos/components';

const RECIPE_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const GRAMO = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const KILO = '9b2f4a1e-3c5d-4e6f-8a7b-1c2d3e4f5a6b';

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  quoteOrderCostActionMock.mockReset();
  quoteOrderCostActionMock.mockResolvedValue({ status: 'success', data: { ingredientsCost: '40.0000' } });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useOrderCostQuote — la unidad del pedido', () => {
  it('R8 la peticion lleva unitId', async () => {
    const { result } = renderHook(() => useOrderCostQuote(null));

    await act(async () => {
      result.current.onRecipeChange(RECIPE_ID, '5', GRAMO);
      await Promise.resolve();
    });
    expect(quoteOrderCostActionMock).toHaveBeenLastCalledWith({
      recipeId: RECIPE_ID,
      quantity: '5',
      unitId: GRAMO,
    });

    act(() => result.current.onQuantityChange(RECIPE_ID, '8', GRAMO));
    await advance(500);
    expect(quoteOrderCostActionMock).toHaveBeenLastCalledWith({
      recipeId: RECIPE_ID,
      quantity: '8',
      unitId: GRAMO,
    });

    act(() => result.current.onDistributionChange(RECIPE_ID, '8', KILO, []));
    await advance(500);
    expect(quoteOrderCostActionMock).toHaveBeenLastCalledWith({
      recipeId: RECIPE_ID,
      quantity: '8',
      unitId: KILO,
    });
  });

  it('R8 cambiar la unidad pide una cotizacion nueva', async () => {
    const { result } = renderHook(() => useOrderCostQuote(null));

    await act(async () => {
      result.current.onRecipeChange(RECIPE_ID, '5', GRAMO);
      await Promise.resolve();
    });
    expect(quoteOrderCostActionMock).toHaveBeenCalledTimes(1);

    quoteOrderCostActionMock.mockResolvedValue({ status: 'success', data: { ingredientsCost: '0.0400' } });
    await act(async () => {
      result.current.onUnitChange(RECIPE_ID, '5', KILO);
      await Promise.resolve();
    });

    expect(quoteOrderCostActionMock).toHaveBeenCalledTimes(2);
    expect(quoteOrderCostActionMock).toHaveBeenLastCalledWith({
      recipeId: RECIPE_ID,
      quantity: '5',
      unitId: KILO,
    });
    expect(result.current.state.amount).toBe('0.0400');
  });

  it('R19 sin unidad no se cotiza y queda el guion', async () => {
    const { result } = renderHook(() => useOrderCostQuote(null));

    await act(async () => {
      result.current.onRecipeChange(RECIPE_ID, '5', GRAMO);
      await Promise.resolve();
    });
    expect(result.current.state.amount).toBe('40.0000');
    quoteOrderCostActionMock.mockClear();

    act(() => result.current.onUnitChange(RECIPE_ID, '5', ''));
    act(() => result.current.onRecipeChange(RECIPE_ID, '5', ''));
    act(() => result.current.onQuantityChange(RECIPE_ID, '6', ''));
    act(() => result.current.onDistributionChange(RECIPE_ID, '6', '', []));
    await advance(1000);

    expect(quoteOrderCostActionMock).not.toHaveBeenCalled();
    expect(result.current.state.amount).toBeNull();
    render(createElement(OrderCostQuote, result.current.state));
    expect(screen.getByTestId(ORDER_COST_QUOTE_VALUE_TESTID).textContent).toBe(MISSING_VALUE_MARK);
  });
});
