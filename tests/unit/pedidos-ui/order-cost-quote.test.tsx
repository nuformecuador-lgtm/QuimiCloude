// El estado de la cotizacion (`useOrderCostQuote`) y el bloque que lo pinta (`OrderCostQuote`):
// R9-R11, R13-R19, R21.

import { act, cleanup, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { OrderCostQuoteResult } from '@/lib/modules/pedidos/adapters/driving/order-actions';

const { quoteOrderCostActionMock } = vi.hoisted(() => ({
  quoteOrderCostActionMock: vi.fn<(input: unknown) => Promise<OrderCostQuoteResult>>(),
}));

vi.mock('@/lib/modules/pedidos/adapters/driving/order-actions', () => ({
  quoteOrderCostAction: quoteOrderCostActionMock,
}));

import {
  ORDER_COST_QUOTE_ERROR_TESTID,
  ORDER_COST_QUOTE_QUOTING_TESTID,
  ORDER_COST_QUOTE_TESTID,
  ORDER_COST_QUOTE_VALUE_TESTID,
  OrderCostQuote,
  useOrderCostQuote,
  type OrderCostQuoteState,
} from '@/app/(private)/pedidos/components';
import { UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID } from '@/components/shared/unexpected-error-notice';

const RECIPE_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

type Handlers = {
  onRecipeChange: (recipeId: string | null, quantity: string) => void;
  onQuantityChange: (recipeId: string | null, quantity: string) => void;
};

/** Monta el hook y el bloque a la vez, con las manejadoras accesibles desde el test. */
function Harness({
  initial,
  handlersRef,
}: {
  readonly initial: string | null;
  readonly handlersRef: { current: Handlers | null };
}) {
  const { state, onRecipeChange, onQuantityChange } = useOrderCostQuote(initial);
  useEffect(() => {
    handlersRef.current = { onRecipeChange, onQuantityChange };
  }, [handlersRef, onRecipeChange, onQuantityChange]);
  return <OrderCostQuote {...state} />;
}

function mount(initial: string | null = null) {
  const handlersRef: { current: Handlers | null } = { current: null };
  render(<Harness initial={initial} handlersRef={handlersRef} />);
  return handlersRef;
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function successResult(ingredientsCost: string | null): OrderCostQuoteResult {
  return { status: 'success', data: { ingredientsCost } };
}

beforeEach(() => {
  vi.useFakeTimers();
  quoteOrderCostActionMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useOrderCostQuote — cuando pide y cuando no (R9, R13, R14)', () => {
  it('sin receta o cantidad no valida: guion y ninguna llamada, tambien tras 1s (R9)', async () => {
    const handlers = mount(null);

    act(() => handlers.current!.onQuantityChange(null, '5'));
    act(() => handlers.current!.onQuantityChange(RECIPE_ID, ''));
    act(() => handlers.current!.onQuantityChange(RECIPE_ID, '0'));
    act(() => handlers.current!.onQuantityChange(RECIPE_ID, 'abc'));
    act(() => handlers.current!.onRecipeChange(null, '5'));

    await advance(1000);

    expect(quoteOrderCostActionMock).not.toHaveBeenCalled();
    expect(screen.getByTestId(ORDER_COST_QUOTE_VALUE_TESTID).textContent).toBe('—');
  });

  it('la cantidad pide una sola cotizacion 500 ms tras la ultima tecla, con la ultima cantidad (R13)', async () => {
    quoteOrderCostActionMock.mockResolvedValue(successResult('40.0000'));
    const handlers = mount(null);

    act(() => handlers.current!.onQuantityChange(RECIPE_ID, '1'));
    await advance(100);
    act(() => handlers.current!.onQuantityChange(RECIPE_ID, '12'));
    await advance(100);
    act(() => handlers.current!.onQuantityChange(RECIPE_ID, '125'));

    await advance(499);
    expect(quoteOrderCostActionMock).not.toHaveBeenCalled();

    await advance(1);
    expect(quoteOrderCostActionMock).toHaveBeenCalledTimes(1);
    expect(quoteOrderCostActionMock).toHaveBeenCalledWith({ recipeId: RECIPE_ID, quantity: '125' });
  });

  it('elegir receta pide de inmediato, sin esperar la ventana (R14)', async () => {
    quoteOrderCostActionMock.mockResolvedValue(successResult('40.0000'));
    const handlers = mount(null);

    await act(async () => {
      handlers.current!.onRecipeChange(RECIPE_ID, '5');
      await Promise.resolve();
    });

    expect(quoteOrderCostActionMock).toHaveBeenCalledTimes(1);
  });
});

describe('useOrderCostQuote — respuestas (R10, R11, R15)', () => {
  it('«sin importe» pinta el guion y nunca un cero (R10)', async () => {
    quoteOrderCostActionMock.mockResolvedValue(successResult(null));
    const handlers = mount(null);

    await act(async () => {
      handlers.current!.onRecipeChange(RECIPE_ID, '5');
      await Promise.resolve();
    });

    const valor = screen.getByTestId(ORDER_COST_QUOTE_VALUE_TESTID);
    expect(valor.textContent).toBe('—');
    expect(valor.textContent).not.toContain('0');
  });

  it('arranca con el importe guardado y no pide nada al montar, tampoco tras 1s (R11)', async () => {
    mount('12752.5512');

    expect(screen.getByTestId(ORDER_COST_QUOTE_VALUE_TESTID).textContent).toBe('$ 12,752.55');
    await advance(1000);
    expect(quoteOrderCostActionMock).not.toHaveBeenCalled();
  });

  it('una respuesta superada por otra mas nueva se descarta (R15)', async () => {
    const resolvers: Array<(result: OrderCostQuoteResult) => void> = [];
    quoteOrderCostActionMock.mockImplementation(
      () =>
        new Promise<OrderCostQuoteResult>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const handlers = mount(null);

    act(() => handlers.current!.onRecipeChange(RECIPE_ID, '5'));
    act(() => handlers.current!.onRecipeChange(RECIPE_ID, '6'));
    expect(resolvers).toHaveLength(2);

    await act(async () => {
      resolvers[1]!(successResult('20.0000'));
      await Promise.resolve();
    });
    expect(screen.getByTestId(ORDER_COST_QUOTE_VALUE_TESTID).textContent).toBe('$ 20.00');

    await act(async () => {
      resolvers[0]!(successResult('10.0000'));
      await Promise.resolve();
    });
    expect(screen.getByTestId(ORDER_COST_QUOTE_VALUE_TESTID).textContent).toBe('$ 20.00');
  });

  it('una peticion en vuelo superada por un paso al guion se descarta al resolverse (R15)', async () => {
    let responder: ((result: OrderCostQuoteResult) => void) | undefined;
    quoteOrderCostActionMock.mockImplementation(
      () =>
        new Promise<OrderCostQuoteResult>((resolve) => {
          responder = resolve;
        }),
    );
    const handlers = mount(null);

    act(() => handlers.current!.onRecipeChange(RECIPE_ID, '5'));
    act(() => handlers.current!.onQuantityChange(RECIPE_ID, ''));

    await act(async () => {
      responder?.(successResult('10.0000'));
      await Promise.resolve();
    });

    expect(screen.getByTestId(ORDER_COST_QUOTE_VALUE_TESTID).textContent).toBe('—');
  });
});

describe('OrderCostQuote — mientras cotiza (R16, R17)', () => {
  it('con cifra visible, la mantiene atenuada junto a «cotizando…» (R16)', async () => {
    let responder: ((result: OrderCostQuoteResult) => void) | undefined;
    quoteOrderCostActionMock.mockImplementation(
      () => new Promise<OrderCostQuoteResult>((resolve) => (responder = resolve)),
    );
    const handlers = mount('40.0000');

    act(() => handlers.current!.onRecipeChange(RECIPE_ID, '5'));

    expect(screen.getByTestId(ORDER_COST_QUOTE_TESTID)).toHaveAttribute('data-state', 'quoting');
    expect(screen.getByTestId(ORDER_COST_QUOTE_VALUE_TESTID).textContent).toBe('$ 40.00');
    expect(screen.getByTestId(ORDER_COST_QUOTE_QUOTING_TESTID)).toBeInTheDocument();

    await act(async () => {
      responder?.(successResult('40.0000'));
      await Promise.resolve();
    });
  });

  it('sin cifra visible, solo pinta «cotizando…»: ni guion ni $ (R17)', () => {
    quoteOrderCostActionMock.mockImplementation(() => new Promise<OrderCostQuoteResult>(() => {}));
    const handlers = mount(null);

    act(() => handlers.current!.onRecipeChange(RECIPE_ID, '5'));

    expect(screen.queryByTestId(ORDER_COST_QUOTE_VALUE_TESTID)).not.toBeInTheDocument();
    expect(screen.getByTestId(ORDER_COST_QUOTE_QUOTING_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId(ORDER_COST_QUOTE_TESTID).textContent).not.toContain('$');
    expect(screen.getByTestId(ORDER_COST_QUOTE_TESTID).textContent).not.toContain('—');
  });
});

describe('OrderCostQuote — formato (R19)', () => {
  it('lleva title cuando el valor exacto difiere de lo pintado, y no lo lleva cuando coincide', () => {
    const conDiferencia: OrderCostQuoteState = { amount: '12752.5512', quoting: false, error: null };
    const { unmount } = render(<OrderCostQuote {...conDiferencia} />);
    expect(screen.getByTestId(ORDER_COST_QUOTE_VALUE_TESTID)).toHaveAttribute('title', '12752.5512');
    unmount();

    const sinDiferencia: OrderCostQuoteState = { amount: '40.0000', quoting: false, error: null };
    render(<OrderCostQuote {...sinDiferencia} />);
    expect(screen.getByTestId(ORDER_COST_QUOTE_VALUE_TESTID)).not.toHaveAttribute('title');
  });
});

describe('useOrderCostQuote — cuando la cotizacion falla (R21)', () => {
  it('pinta el mensaje del catalogo, ni guion ni cifra, y Guardar no se toca aqui', async () => {
    quoteOrderCostActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No tienes permiso.',
    });
    const handlers = mount(null);

    await act(async () => {
      handlers.current!.onRecipeChange(RECIPE_ID, '5');
      await Promise.resolve();
    });

    const bloque = screen.getByTestId(ORDER_COST_QUOTE_TESTID);
    expect(screen.getByTestId(ORDER_COST_QUOTE_ERROR_TESTID).textContent).toContain('No tienes permiso.');
    expect(screen.queryByTestId(ORDER_COST_QUOTE_VALUE_TESTID)).not.toBeInTheDocument();
    expect(bloque.textContent).not.toContain('$');
    expect(bloque.textContent).not.toContain('—');
  });

  it('un error inesperado se pinta con `UnexpectedErrorNotice` y su identificador', async () => {
    quoteOrderCostActionMock.mockResolvedValue({
      status: 'error',
      code: 'unexpected',
      message: 'Ha ocurrido un error inesperado.',
      reference: 'req-123',
    });
    const handlers = mount(null);

    await act(async () => {
      handlers.current!.onRecipeChange(RECIPE_ID, '5');
      await Promise.resolve();
    });

    expect(screen.getByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID).textContent).toContain('req-123');
  });

  it('una cotizacion posterior que responde bien quita el mensaje de error', async () => {
    quoteOrderCostActionMock.mockResolvedValueOnce({
      status: 'error',
      code: 'unauthorized',
      message: 'No tienes permiso.',
    });
    const handlers = mount(null);

    await act(async () => {
      handlers.current!.onRecipeChange(RECIPE_ID, '5');
      await Promise.resolve();
    });
    expect(screen.getByTestId(ORDER_COST_QUOTE_ERROR_TESTID)).toBeInTheDocument();

    quoteOrderCostActionMock.mockResolvedValueOnce(successResult('40.0000'));
    await act(async () => {
      handlers.current!.onRecipeChange(RECIPE_ID, '6');
      await Promise.resolve();
    });

    expect(screen.queryByTestId(ORDER_COST_QUOTE_ERROR_TESTID)).not.toBeInTheDocument();
    expect(screen.getByTestId(ORDER_COST_QUOTE_VALUE_TESTID).textContent).toBe('$ 40.00');
  });

  it('la accion rechazada (fallo de transporte) pasa a error, sin guion ni «cotizando…»', async () => {
    quoteOrderCostActionMock.mockRejectedValue(new Error('fetch failed'));
    const handlers = mount(null);

    await act(async () => {
      handlers.current!.onRecipeChange(RECIPE_ID, '5');
      await Promise.resolve();
    });

    const bloque = screen.getByTestId(ORDER_COST_QUOTE_TESTID);
    expect(screen.getByTestId(ORDER_COST_QUOTE_ERROR_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID)).toBeInTheDocument();
    expect(screen.queryByTestId(ORDER_COST_QUOTE_VALUE_TESTID)).not.toBeInTheDocument();
    expect(screen.queryByTestId(ORDER_COST_QUOTE_QUOTING_TESTID)).not.toBeInTheDocument();
    expect(bloque.textContent).not.toContain('—');
  });

  it('con el error visible, la siguiente peticion en vuelo pinta solo «cotizando…» (R17)', async () => {
    quoteOrderCostActionMock.mockResolvedValueOnce({
      status: 'error',
      code: 'unauthorized',
      message: 'No tienes permiso.',
    });
    const handlers = mount(null);

    await act(async () => {
      handlers.current!.onRecipeChange(RECIPE_ID, '5');
      await Promise.resolve();
    });
    expect(screen.getByTestId(ORDER_COST_QUOTE_ERROR_TESTID)).toBeInTheDocument();

    quoteOrderCostActionMock.mockImplementation(() => new Promise<OrderCostQuoteResult>(() => {}));
    act(() => handlers.current!.onRecipeChange(RECIPE_ID, '7'));

    expect(screen.queryByTestId(ORDER_COST_QUOTE_ERROR_TESTID)).not.toBeInTheDocument();
    expect(screen.queryByTestId(ORDER_COST_QUOTE_VALUE_TESTID)).not.toBeInTheDocument();
    expect(screen.getByTestId(ORDER_COST_QUOTE_QUOTING_TESTID)).toBeInTheDocument();
  });
});
