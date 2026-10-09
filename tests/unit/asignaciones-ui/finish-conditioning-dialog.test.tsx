import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CONDITIONING_ACTIONS_TEXTS,
  COUNTDOWN_GATED_BUTTON_TESTID,
  ConditioningActions,
  FINISH_CONDITIONING_DIALOG_TESTID,
  FINISH_CONDITIONING_ERROR_TESTID,
  FINISH_CONDITIONING_ORDER_ID_FIELD,
  FINISH_CONDITIONING_TEXTS,
} from '@/app/(private)/asignacion/acondicionamiento/[id]/components';
import type { FinishConditioningResult } from '@/lib/modules/asignaciones/adapters/driving/order-conditioning-actions';

const { finishConditioningActionMock } = vi.hoisted(() => ({
  finishConditioningActionMock:
    vi.fn<(prev: FinishConditioningResult, data: FormData) => Promise<FinishConditioningResult>>(),
}));

vi.mock('@/lib/modules/asignaciones/adapters/driving/order-conditioning-actions', () => ({
  startConditioningAction: vi.fn(),
  finishConditioningAction: finishConditioningActionMock,
}));

const ORDER_ID = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  vi.useFakeTimers();
  finishConditioningActionMock.mockImplementation(() => Promise.resolve({ status: 'success' }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.resetAllMocks();
});

function pintar() {
  return render(<ConditioningActions kind="finish" orderId={ORDER_ID} orderNumber="2026-0000040" />);
}

function abrir(): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: CONDITIONING_ACTIONS_TEXTS.finish }));
  return screen.getByTestId(FINISH_CONDITIONING_DIALOG_TESTID);
}

function avanzar(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function confirmar(): HTMLElement {
  return screen.getByTestId(COUNTDOWN_GATED_BUTTON_TESTID);
}

async function enviar(): Promise<void> {
  avanzar(5000);
  vi.useRealTimers();
  await act(async () => {
    fireEvent.click(confirmar());
  });
}

describe('el modal de Terminar', () => {
  it('R26: abre una confirmación con título, descripción, «Terminar» y «Cancelar»', () => {
    pintar();
    const dialogo = abrir();

    expect(dialogo).toHaveAttribute('role', 'alertdialog');
    expect(within(dialogo).getByText(FINISH_CONDITIONING_TEXTS.title)).toBeInTheDocument();
    expect(within(dialogo).getByText('El pedido 2026-0000040 pasará a Terminado.')).toBeInTheDocument();
    expect(confirmar()).toHaveTextContent(FINISH_CONDITIONING_TEXTS.confirm);
    expect(within(dialogo).getByRole('button', { name: FINISH_CONDITIONING_TEXTS.cancel })).toBeInTheDocument();
    expect(finishConditioningActionMock).not.toHaveBeenCalled();
  });

  it('R10: el confirmar empieza deshabilitado con «00:05» y se habilita a los 5 s', () => {
    pintar();
    abrir();

    expect(confirmar()).toBeDisabled();
    expect(within(confirmar()).getByRole('timer')).toHaveTextContent('00:05');
    avanzar(4000);
    expect(confirmar()).toBeDisabled();
    avanzar(1000);
    expect(confirmar()).toBeEnabled();
  });

  it('R10: al reabrir la cuenta empieza otra vez', () => {
    pintar();
    const dialogo = abrir();
    avanzar(5000);
    expect(confirmar()).toBeEnabled();

    fireEvent.click(within(dialogo).getByRole('button', { name: FINISH_CONDITIONING_TEXTS.cancel }));
    avanzar(1000);
    expect(screen.queryByTestId(FINISH_CONDITIONING_DIALOG_TESTID)).toBeNull();

    abrir();
    expect(confirmar()).toBeDisabled();
    expect(within(confirmar()).getByRole('timer')).toHaveTextContent('00:05');
  });

  it('R26: «Cancelar» cierra sin enviar', () => {
    pintar();
    const dialogo = abrir();
    avanzar(5000);

    fireEvent.click(within(dialogo).getByRole('button', { name: FINISH_CONDITIONING_TEXTS.cancel }));
    avanzar(1000);

    expect(screen.queryByTestId(FINISH_CONDITIONING_DIALOG_TESTID)).toBeNull();
    expect(finishConditioningActionMock).not.toHaveBeenCalled();
  });

  it('R27: confirmar envía solo el id del pedido', async () => {
    pintar();
    abrir();

    await enviar();

    expect(finishConditioningActionMock).toHaveBeenCalledTimes(1);
    const [, formData] = finishConditioningActionMock.mock.calls[0] ?? [];
    expect([...(formData?.keys() ?? [])]).toEqual([FINISH_CONDITIONING_ORDER_ID_FIELD]);
    expect(formData?.get(FINISH_CONDITIONING_ORDER_ID_FIELD)).toBe(ORDER_ID);
  });

  it('R28: si la acción falla, el modal sigue abierto con el mensaje en role="alert"', async () => {
    finishConditioningActionMock.mockImplementation(() =>
      Promise.resolve({
        status: 'error',
        code: 'order_conditioning_taken',
        message: 'Otra persona ya está acondicionando este pedido.',
      }),
    );
    pintar();
    const dialogo = abrir();

    await enviar();

    const alerta = await within(dialogo).findByRole('alert');
    expect(alerta).toHaveAttribute('data-testid', FINISH_CONDITIONING_ERROR_TESTID);
    expect(alerta).toHaveTextContent('Otra persona ya está acondicionando este pedido.');
    expect(screen.getByTestId(FINISH_CONDITIONING_DIALOG_TESTID)).toBeInTheDocument();
  });
});
