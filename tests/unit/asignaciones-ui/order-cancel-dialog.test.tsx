import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ORDER_CANCEL_DISMISS_TESTID,
  ORDER_CANCEL_ERROR_TESTID,
  ORDER_CANCEL_ORDER_ID_FIELD,
  ORDER_CANCEL_REASON_FIELD,
  ORDER_CANCEL_REASON_TESTID,
  ORDER_CANCEL_STEP_POSITION_FIELD,
  ORDER_CANCEL_TEXTS,
  ORDER_CANCEL_TRIGGER_TESTID,
  ORDER_EXECUTION_SCREEN_TESTID,
  OrderExecutionScreen,
} from '@/app/(private)/asignacion/[id]/components';
import type { StartedOrderExecution } from '@/lib/modules/asignaciones';
import type { CancelAssignedOrderResult } from '@/lib/modules/asignaciones/adapters/driving/order-execution-actions';

import { errorInesperado, REFERENCIA_DEL_CASO } from '../../helpers/identificador-de-request';
import { esperarInteractiva, setupUser } from '../../helpers/user-event';

const { cancelAssignedOrderActionMock, recordStepMoveActionMock, finishAssignedOrderActionMock } =
  vi.hoisted(() => ({
    cancelAssignedOrderActionMock:
      vi.fn<(prev: CancelAssignedOrderResult, data: FormData) => Promise<CancelAssignedOrderResult>>(),
    recordStepMoveActionMock: vi.fn(),
    finishAssignedOrderActionMock: vi.fn(),
  }));

vi.mock('@/lib/modules/asignaciones/adapters/driving/order-execution-actions', () => ({
  cancelAssignedOrderAction: cancelAssignedOrderActionMock,
  recordStepMoveAction: recordStepMoveActionMock,
  finishAssignedOrderAction: finishAssignedOrderActionMock,
}));

beforeEach(() => {
  recordStepMoveActionMock.mockResolvedValue({ status: 'success' });
  // Una promesa que no resuelve dejaria pendiente la transicion de React para los casos siguientes.
  cancelAssignedOrderActionMock.mockImplementation(() => Promise.resolve({ status: 'success' }));
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

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
  resumeStepPosition: 3,
};

function disparador(): HTMLElement {
  return screen.getByRole('button', { name: ORDER_CANCEL_TEXTS.trigger });
}

async function abrir(user: ReturnType<typeof setupUser>): Promise<HTMLElement> {
  await user.click(disparador());
  return screen.findByRole('alertdialog');
}

function confirmar(dialogo: HTMLElement): HTMLElement {
  return within(dialogo).getByRole('button', { name: ORDER_CANCEL_TEXTS.confirm });
}

async function tabularHasta(user: ReturnType<typeof setupUser>, destino: HTMLElement): Promise<void> {
  for (let i = 0; i < 10 && document.activeElement !== destino; i++) await user.tab();
  expect(document.activeElement).toBe(destino);
}

function motivo(dialogo: HTMLElement): HTMLElement {
  return within(dialogo).getByRole('textbox', { name: /motivo/i });
}

describe('dialogo de cancelar — sin motivo no se envia', () => {
  it('R9 — confirmar sin motivo no llama a la accion y el rechazo es texto visible', async () => {
    const user = setupUser();
    render(<OrderExecutionScreen execution={EXECUTION} />);
    const dialogo = await abrir(user);

    await user.click(await esperarInteractiva(confirmar(dialogo)));

    const error = await within(dialogo).findByRole('alert');
    expect(error).toHaveTextContent(ORDER_CANCEL_TEXTS.reasonRequired);
    expect(error.closest('[title]')).toBeNull();
    expect(motivo(dialogo)).toHaveAttribute('aria-invalid', 'true');
    expect(cancelAssignedOrderActionMock).not.toHaveBeenCalled();
  });

  it('R9 — un motivo de solo espacios tampoco se envia', async () => {
    const user = setupUser();
    render(<OrderExecutionScreen execution={EXECUTION} />);
    const dialogo = await abrir(user);

    await user.type(motivo(dialogo), '    ');
    await user.click(await esperarInteractiva(confirmar(dialogo)));

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(
      ORDER_CANCEL_TEXTS.reasonRequired,
    );
    expect(cancelAssignedOrderActionMock).not.toHaveBeenCalled();
  });
});

describe('dialogo de cancelar — envio', () => {
  it('R22, R23 — envia orderId, la posicion del paso mostrado y el motivo recortado', async () => {
    const user = setupUser();
    render(<OrderExecutionScreen execution={EXECUTION} />);
    const dialogo = await abrir(user);

    await user.type(motivo(dialogo), '   Se acabó el reactivo  ');
    await user.click(await esperarInteractiva(confirmar(dialogo)));

    await waitFor(() => expect(cancelAssignedOrderActionMock).toHaveBeenCalledTimes(1));
    const formData = cancelAssignedOrderActionMock.mock.calls[0]![1];
    expect(formData.get(ORDER_CANCEL_ORDER_ID_FIELD)).toBe('order-1');
    expect(formData.get(ORDER_CANCEL_STEP_POSITION_FIELD)).toBe('3');
    expect(formData.get(ORDER_CANCEL_REASON_FIELD)).toBe('Se acabó el reactivo');
  });

  it('R22 — tras retroceder, envia la posicion del paso al que se llego', async () => {
    const user = setupUser();
    render(<OrderExecutionScreen execution={EXECUTION} />);
    fireEvent.click(screen.getByTestId('step-reader-previous'));
    expect(screen.getByTestId('step-reader-position')).toHaveTextContent('Paso 2 de 4');

    const dialogo = await abrir(user);
    await user.type(motivo(dialogo), 'Sin envases');
    await user.click(await esperarInteractiva(confirmar(dialogo)));

    await waitFor(() => expect(cancelAssignedOrderActionMock).toHaveBeenCalledTimes(1));
    const formData = cancelAssignedOrderActionMock.mock.calls[0]![1];
    expect(formData.get(ORDER_CANCEL_STEP_POSITION_FIELD)).toBe('2');
  });

  it('R22 — el boton esta en el primer y en el ultimo paso, fuera del lector de pasos', () => {
    const { unmount } = render(
      <OrderExecutionScreen execution={{ ...EXECUTION, resumeStepPosition: 1 }} />,
    );
    expect(disparador()).toBeVisible();
    expect(within(screen.getByTestId(ORDER_EXECUTION_SCREEN_TESTID)).queryByTestId(ORDER_CANCEL_TRIGGER_TESTID)).toBeNull();
    unmount();

    render(<OrderExecutionScreen execution={{ ...EXECUTION, resumeStepPosition: 4 }} />);
    expect(disparador()).toBeVisible();
  });

  it('Volver cierra el dialogo sin llamar a la accion', async () => {
    const user = setupUser();
    render(<OrderExecutionScreen execution={EXECUTION} />);
    const dialogo = await abrir(user);

    await user.type(motivo(dialogo), 'Me equivoqué');
    await user.click(
      await esperarInteractiva(within(dialogo).getByTestId(ORDER_CANCEL_DISMISS_TESTID)),
    );

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(cancelAssignedOrderActionMock).not.toHaveBeenCalled();
  });
});

describe('dialogo de cancelar — error de la accion', () => {
  it('R24 — el error devuelto por la accion se pinta y el dialogo sigue abierto con el motivo', async () => {
    cancelAssignedOrderActionMock.mockImplementation(() =>
      Promise.resolve({
        status: 'error',
        code: 'order_not_found',
        message: 'El pedido ya no está disponible.',
      }),
    );
    const user = setupUser();
    render(<OrderExecutionScreen execution={EXECUTION} />);
    const dialogo = await abrir(user);

    await user.type(motivo(dialogo), 'Sin envases');
    await user.click(await esperarInteractiva(confirmar(dialogo)));

    const error = await within(dialogo).findByTestId(ORDER_CANCEL_ERROR_TESTID);
    expect(error).toHaveAttribute('role', 'alert');
    expect(error).toHaveTextContent('El pedido ya no está disponible.');
    expect(error).toHaveAttribute('data-code', 'order_not_found');
    expect(motivo(dialogo)).toHaveValue('Sin envases');
  });

  it('R24 — un error inesperado se pinta con su referencia', async () => {
    cancelAssignedOrderActionMock.mockImplementation(() => Promise.resolve(errorInesperado()));
    const user = setupUser();
    render(<OrderExecutionScreen execution={EXECUTION} />);
    const dialogo = await abrir(user);

    await user.type(motivo(dialogo), 'Sin envases');
    await user.click(await esperarInteractiva(confirmar(dialogo)));

    const error = await within(dialogo).findByTestId(ORDER_CANCEL_ERROR_TESTID);
    expect(error).toHaveTextContent(REFERENCIA_DEL_CASO);
  });
});

describe('dialogo de cancelar — multiplataforma', () => {
  it('R36 — objetivos tactiles de 44 px, campo a 16 px y nada en title', async () => {
    const user = setupUser();
    render(<OrderExecutionScreen execution={EXECUTION} />);
    expect(disparador()).toHaveClass('min-h-11', 'min-w-11');

    const dialogo = await abrir(user);
    expect(confirmar(dialogo)).toHaveClass('min-h-11', 'min-w-11');
    expect(within(dialogo).getByTestId(ORDER_CANCEL_DISMISS_TESTID)).toHaveClass('min-h-11', 'min-w-11');
    expect(within(dialogo).getByTestId(ORDER_CANCEL_REASON_TESTID)).toHaveClass('text-base');
    expect(disparador().closest('[title]')).toBeNull();
    expect(dialogo.querySelector('[title]')).toBeNull();
  });

  it('R36 — se abre, se escribe y se confirma solo con teclado', async () => {
    const user = setupUser();
    render(<OrderExecutionScreen execution={EXECUTION} />);

    disparador().focus();
    await user.keyboard('{Enter}');
    const dialogo = await screen.findByRole('alertdialog');

    const campo = motivo(dialogo);
    await waitFor(() => expect(dialogo.contains(document.activeElement)).toBe(true));
    await tabularHasta(user, campo);
    await user.keyboard('Sin envases');
    await tabularHasta(user, confirmar(dialogo));
    await user.keyboard('{Enter}');

    await waitFor(() => expect(cancelAssignedOrderActionMock).toHaveBeenCalledTimes(1));
    expect(cancelAssignedOrderActionMock.mock.calls[0]![1].get(ORDER_CANCEL_REASON_FIELD)).toBe(
      'Sin envases',
    );
  });

  it('R11 — retroceder no abre ningun dialogo ni pide motivo', () => {
    render(<OrderExecutionScreen execution={EXECUTION} />);

    fireEvent.click(screen.getByTestId('step-reader-previous'));

    expect(screen.getByTestId('step-reader-position')).toHaveTextContent('Paso 2 de 4');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByRole('textbox', { name: /motivo/i })).toBeNull();
    expect(cancelAssignedOrderActionMock).not.toHaveBeenCalled();
  });
});
