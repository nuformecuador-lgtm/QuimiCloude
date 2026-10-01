// QC-35 T11 — El dialogo de cancelacion con motivo: R37, R35, R34, R44.
//
// **`cancelOrderAction` es un doble espia; las OTRAS CINCO actions son dobles que FALLAN si se
// les llama**: R37 exige que se invoque «esa operacion y ninguna otra», y la unica forma de
// afirmarlo sin depender de una lista de `expect(...).not.toHaveBeenCalled()` es que llamar a
// cualquier otra reviente el caso.
//
// **Ningun assert sobre el copy** (R44): controles y regiones se localizan por `data-testid`
// exportado o por rol accesible.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import {
  UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL,
  UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID,
} from '@/components/shared/unexpected-error-notice';
import {
  REFERENCIA_DEL_CASO,
  errorInesperado,
  esperarSinIdentificador,
} from '../../helpers/identificador-de-request';
import { setupUser } from '../../helpers/user-event';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CANCEL_ORDER_CONFIRM_TESTID,
  CANCEL_ORDER_DIALOG_TESTID,
  CANCEL_ORDER_ERROR_TESTID,
  CANCEL_ORDER_ID_FIELD,
  CANCEL_ORDER_ID_TESTID,
  CANCEL_ORDER_REASON_FIELD,
  CANCEL_ORDER_REASON_TESTID,
  CancelOrderDialog,
} from '@/app/(private)/pedidos/components';
import { formatOrderNumber, type OrderSummary } from '@/lib/modules/pedidos';
import type { OrderMutationFormState } from '@/lib/modules/pedidos/adapters/driving/order-actions';

const { cancelOrderActionMock, routerMock } = vi.hoisted(() => ({
  cancelOrderActionMock:
    vi.fn<(prev: OrderMutationFormState, data: FormData) => Promise<OrderMutationFormState>>(),
  routerMock: {
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    refresh: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => routerMock,
}));

vi.mock('@/lib/modules/pedidos/adapters/driving/order-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse desde el dialogo de cancelacion`);
  };
  return {
    cancelOrderAction: cancelOrderActionMock,
    listOrdersAction: vi.fn(noDebeInvocarse('listOrdersAction')),
    getOrderAction: vi.fn(noDebeInvocarse('getOrderAction')),
    createOrderAction: vi.fn(noDebeInvocarse('createOrderAction')),
    updateOrderAction: vi.fn(noDebeInvocarse('updateOrderAction')),
    deleteOrderAction: vi.fn(noDebeInvocarse('deleteOrderAction')),
  };
});

const MOTIVO = 'El cliente anuló el encargo';

function pedido(overrides: Partial<OrderSummary> = {}): OrderSummary {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    number: { year: 2026, sequence: 42 },
    numberText: formatOrderNumber({ year: 2026, sequence: 42 }),
    recipeId: '22222222-2222-4222-8222-222222222222',
    recipeName: 'Esmalte azul',
    quantity: '12.5000',
    priority: 'MEDIA',
    status: 'PENDIENTE',
    cancellationReason: null,
    ingredientsCost: null,
    createdAt: new Date('2026-01-15T10:00:00.000Z'),
    updatedAt: new Date('2026-01-15T10:00:00.000Z'),
    createdBy: null,
    updatedBy: null,
    presentationLines: [],
    unitId: null,
    unitLabel: null,
    ...overrides,
  };
}

const cerrar = vi.fn<(open: boolean) => void>();

/**
 * Si el dialogo pidio cerrarse. Se mira el PRIMER argumento y no la llamada entera: el primitivo
 * de Base UI acompana el `onOpenChange` con el evento y el motivo del cierre, y un
 * `toHaveBeenCalledWith(false)` fallaria por esos extras sin que nada este mal.
 */
function seCerro(): boolean {
  return cerrar.mock.calls.some(([abierto]) => abierto === false);
}

let toastExito: ReturnType<typeof vi.spyOn>;

function montar(order: OrderSummary = pedido()) {
  render(<CancelOrderDialog order={order} open onOpenChange={cerrar} />);
  return order;
}

beforeEach(() => {
  vi.clearAllMocks();
  cancelOrderActionMock.mockResolvedValue({ status: 'success' });
  toastExito = vi.spyOn(toast, 'success');
});

afterEach(() => {
  cleanup();
  toast.dismiss();
  vi.restoreAllMocks();
});

describe('mientras el motivo este vacio no se invoca la cancelacion (R37)', () => {
  it('el boton de confirmar esta deshabilitado y pulsarlo no llama a `cancelOrderAction`', async () => {
    const user = setupUser();
    montar();

    const confirmar = screen.getByTestId(CANCEL_ORDER_CONFIRM_TESTID);
    expect(confirmar).toBeDisabled();

    await user.click(confirmar);

    expect(cancelOrderActionMock).not.toHaveBeenCalled();
  });

  it('un motivo de solo espacios tampoco habilita la confirmacion ni invoca nada', async () => {
    // El motivo se mide RECORTADO, igual que lo mide `cancelOrderSchema` del contrato.
    const user = setupUser();
    montar();

    await user.type(screen.getByTestId(CANCEL_ORDER_REASON_TESTID), '   ');

    expect(screen.getByTestId(CANCEL_ORDER_CONFIRM_TESTID)).toBeDisabled();
    expect(cancelOrderActionMock).not.toHaveBeenCalled();
  });

  it('enviar el formulario sin motivo lo rechaza la validacion previa, sin llamar a la operacion', () => {
    // Segundo cierre: aunque el envio llegue por una via que no sea el boton (tecla, script), el
    // esquema del contrato lo para ANTES de la operacion.
    montar();

    const formulario = screen.getByTestId('cancel-order-form') as HTMLFormElement;
    formulario.requestSubmit();

    expect(cancelOrderActionMock).not.toHaveBeenCalled();
  });
});

describe('con motivo se invoca la cancelacion, y ninguna otra operacion (R37)', () => {
  it('llama a `cancelOrderAction` con el `id` del pedido y el motivo escrito', async () => {
    const user = setupUser();
    const elPedido = montar();

    expect(screen.getByTestId(CANCEL_ORDER_ID_TESTID)).toHaveValue(elPedido.id);

    await user.type(screen.getByTestId(CANCEL_ORDER_REASON_TESTID), MOTIVO);
    await user.click(screen.getByTestId(CANCEL_ORDER_CONFIRM_TESTID));

    await waitFor(() => expect(cancelOrderActionMock).toHaveBeenCalledTimes(1));
    const enviado = cancelOrderActionMock.mock.calls[0]?.[1] as FormData;
    expect(enviado.get(CANCEL_ORDER_ID_FIELD)).toBe(elPedido.id);
    expect(enviado.get(CANCEL_ORDER_REASON_FIELD)).toBe(MOTIVO);
    // Las otras cinco actions son dobles que lanzan: si alguna se hubiera llamado, el caso ya
    // habria fallado.
  });
});

describe('`not_cancellable` se pinta en la region del DIALOGO (R34)', () => {
  it('el dialogo sigue abierto, con su region de error y el codigo estable', async () => {
    const user = setupUser();
    cancelOrderActionMock.mockResolvedValue({
      status: 'error',
      code: 'not_cancellable',
      message: 'Este pedido ya no se puede cancelar.',
    });
    montar();

    await user.type(screen.getByTestId(CANCEL_ORDER_REASON_TESTID), MOTIVO);
    await user.click(screen.getByTestId(CANCEL_ORDER_CONFIRM_TESTID));

    const region = await screen.findByTestId(CANCEL_ORDER_ERROR_TESTID);
    expect(region).toHaveAttribute('data-code', 'not_cancellable');
    expect(region).toHaveAttribute('role', 'alert');
    // La region esta DENTRO del dialogo, no en el formulario de edicion ni en la lista.
    expect(screen.getByTestId(CANCEL_ORDER_DIALOG_TESTID)).toContainElement(region);
    // Y no se cierra ni se avisa de un exito que no ocurrio.
    expect(seCerro()).toBe(false);
    expect(toastExito).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
    // El motivo escrito sigue ahi.
    expect(screen.getByTestId(CANCEL_ORDER_REASON_TESTID)).toHaveValue(MOTIVO);
  });
});

describe('el exito aplica R35', () => {
  it('cierra el dialogo, avisa por toast y refresca la lista sin navegar', async () => {
    const user = setupUser();
    montar();

    await user.type(screen.getByTestId(CANCEL_ORDER_REASON_TESTID), MOTIVO);
    await user.click(screen.getByTestId(CANCEL_ORDER_CONFIRM_TESTID));

    await waitFor(() => expect(seCerro()).toBe(true));
    expect(toastExito).toHaveBeenCalledTimes(1);
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
    expect(screen.queryByTestId(CANCEL_ORDER_ERROR_TESTID)).toBeNull();
  });
});

/** QC-71 T9 — R17 y R18 en el dialogo de cancelacion de pedido. */
describe('el identificador del error inesperado (QC-71 R17, R18)', () => {
  it('el error inesperado ensena el identificador como texto, con su etiqueta', async () => {
    const user = setupUser();
    cancelOrderActionMock.mockResolvedValue(errorInesperado());
    montar();

    await user.type(screen.getByTestId(CANCEL_ORDER_REASON_TESTID), MOTIVO);
    await user.click(screen.getByTestId(CANCEL_ORDER_CONFIRM_TESTID));

    const region = await screen.findByTestId(CANCEL_ORDER_ERROR_TESTID);
    const referencia = screen.getByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID);
    expect(region).toContainElement(referencia);
    expect(referencia).toHaveTextContent(UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL);
    expect(screen.getByText(REFERENCIA_DEL_CASO)).toBeInTheDocument();
  });

  it('un error del catalogo no ensena identificador ninguno', async () => {
    const user = setupUser();
    cancelOrderActionMock.mockResolvedValue({
      status: 'error',
      code: 'not_cancellable',
      message: 'Este pedido ya no se puede cancelar.',
    });
    montar();

    await user.type(screen.getByTestId(CANCEL_ORDER_REASON_TESTID), MOTIVO);
    await user.click(screen.getByTestId(CANCEL_ORDER_CONFIRM_TESTID));

    const region = await screen.findByTestId(CANCEL_ORDER_ERROR_TESTID);
    expect(region).toHaveAttribute('data-code', 'not_cancellable');
    esperarSinIdentificador();
  });
});
