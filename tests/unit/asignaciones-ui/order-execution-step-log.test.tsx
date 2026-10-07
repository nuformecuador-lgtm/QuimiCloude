import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ORDER_EXECUTION_FINISH_CONFIRM_TESTID,
  ORDER_EXECUTION_STEP_POSITION_FIELD,
  OrderExecutionScreen,
} from '@/app/(private)/asignacion/[id]/components';
import type { StartedOrderExecution } from '@/lib/modules/asignaciones';

const { finishAssignedOrderActionMock, recordStepMoveActionMock } = vi.hoisted(() => ({
  finishAssignedOrderActionMock: vi.fn(),
  recordStepMoveActionMock: vi.fn(),
}));

vi.mock('@/lib/modules/asignaciones/adapters/driving/order-execution-actions', () => ({
  finishAssignedOrderAction: finishAssignedOrderActionMock,
  recordStepMoveAction: recordStepMoveActionMock,
  cancelAssignedOrderAction: vi.fn(),
}));

beforeEach(() => {
  vi.useFakeTimers();
  recordStepMoveActionMock.mockResolvedValue({ status: 'success' });
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.resetAllMocks();
});

const MIN_STEP_MS = 5000;

function paso(texto: string) {
  return { blocks: [{ kind: 'paragraph' as const, spans: [{ text: texto }] }] };
}

const EXECUTION: StartedOrderExecution = {
  orderId: 'order-1',
  numberText: 'PED-0007',
  status: 'EN_CURSO',
  recipeName: 'Barniz acrílico',
  orderQuantity: '250',
  steps: [paso('Paso uno'), paso('Paso dos'), paso('Paso tres'), paso('Paso cuatro')],
  lines: [],
  tools: [],
  presentationLines: [],
  unitId: null,
  unitLabel: null,
  resumeStepPosition: null,
};

async function esperarMinimo(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(MIN_STEP_MS);
  });
}

async function vaciarMicrotareas(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function siguiente(): Promise<void> {
  await esperarMinimo();
  fireEvent.click(screen.getByTestId('step-reader-next'));
}

function posicionVisible(): string {
  return screen.getByTestId('step-reader-position').textContent ?? '';
}

describe('pantalla de ejecucion — anotacion de cada cambio de paso', () => {
  it('R17 — Siguiente dos veces anota avanzar con 2 y despues con 3, en el orden de los clics', async () => {
    let resolverPrimera: (value: { status: 'success' }) => void = () => undefined;
    recordStepMoveActionMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolverPrimera = resolve;
        }),
    );
    render(<OrderExecutionScreen execution={EXECUTION} />);

    await siguiente();
    await siguiente();
    await vaciarMicrotareas();

    expect(posicionVisible()).toContain('Paso 3 de 4');
    expect(recordStepMoveActionMock).toHaveBeenCalledTimes(1);

    resolverPrimera({ status: 'success' });
    await vaciarMicrotareas();

    expect(recordStepMoveActionMock.mock.calls).toEqual([
      [{ orderId: 'order-1', direction: 'advance', stepPosition: 2 }],
      [{ orderId: 'order-1', direction: 'advance', stepPosition: 3 }],
    ]);
  });

  it('R18 — Anterior anota retroceder con la posicion del paso al que se llega', async () => {
    render(<OrderExecutionScreen execution={{ ...EXECUTION, resumeStepPosition: 3 }} />);

    fireEvent.click(screen.getByTestId('step-reader-previous'));
    await vaciarMicrotareas();

    expect(posicionVisible()).toContain('Paso 2 de 4');
    expect(recordStepMoveActionMock.mock.calls).toEqual([
      [{ orderId: 'order-1', direction: 'go_back', stepPosition: 2 }],
    ]);
  });

  it('R19 — si la anotacion rechaza, el paso cambia igual, sin alerta y sin reintento', async () => {
    recordStepMoveActionMock.mockReset();
    recordStepMoveActionMock.mockRejectedValue(new Error('red caida'));
    render(<OrderExecutionScreen execution={EXECUTION} />);

    await siguiente();
    await vaciarMicrotareas();
    await esperarMinimo();

    expect(posicionVisible()).toContain('Paso 2 de 4');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(recordStepMoveActionMock).toHaveBeenCalledTimes(1);
  });

  it('R19 — si la anotacion lanza, el paso cambia igual, sin alerta y sin reintento', async () => {
    recordStepMoveActionMock.mockReset();
    recordStepMoveActionMock.mockImplementation(() => {
      throw new Error('fallo sincrono');
    });
    render(<OrderExecutionScreen execution={EXECUTION} />);

    await siguiente();
    await vaciarMicrotareas();
    await esperarMinimo();

    expect(posicionVisible()).toContain('Paso 2 de 4');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(recordStepMoveActionMock).toHaveBeenCalledTimes(1);
  });

  it('R19 — un error de la accion devuelto como estado tampoco se pinta', async () => {
    recordStepMoveActionMock.mockResolvedValue({
      status: 'error',
      code: 'order_not_found',
      message: 'No existe.',
    });
    render(<OrderExecutionScreen execution={EXECUTION} />);

    await siguiente();
    await vaciarMicrotareas();

    expect(posicionVisible()).toContain('Paso 2 de 4');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(recordStepMoveActionMock).toHaveBeenCalledTimes(1);
  });

  it('R13 — con resumeStepPosition 3 la pantalla abre en «Paso 3 de 4» sin anotar nada', async () => {
    render(<OrderExecutionScreen execution={{ ...EXECUTION, resumeStepPosition: 3 }} />);
    await vaciarMicrotareas();

    expect(posicionVisible()).toContain('Paso 3 de 4');
    expect(recordStepMoveActionMock).not.toHaveBeenCalled();
  });

  it('R14 — una posicion anotada mayor que los pasos de hoy abre en el ultimo paso', () => {
    render(<OrderExecutionScreen execution={{ ...EXECUTION, resumeStepPosition: 9 }} />);

    expect(posicionVisible()).toContain('Paso 4 de 4');
  });

  it('R21 — Finalizar envia la posicion del ultimo paso', async () => {
    finishAssignedOrderActionMock.mockResolvedValue({ status: 'success' });
    render(<OrderExecutionScreen execution={{ ...EXECUTION, resumeStepPosition: 3 }} />);

    await siguiente();
    await esperarMinimo();
    fireEvent.click(screen.getByTestId('step-reader-finish'));
    await act(async () => {
      fireEvent.click(screen.getByTestId(ORDER_EXECUTION_FINISH_CONFIRM_TESTID));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(finishAssignedOrderActionMock).toHaveBeenCalledTimes(1);
    const formData = finishAssignedOrderActionMock.mock.calls[0]![1] as FormData;
    expect(formData.get(ORDER_EXECUTION_STEP_POSITION_FIELD)).toBe('4');
    expect(formData.get('orderId')).toBe('order-1');
  });
});
