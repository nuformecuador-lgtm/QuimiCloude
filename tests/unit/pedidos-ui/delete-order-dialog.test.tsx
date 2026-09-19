// QC-35 T12 — La confirmacion de borrado: R38, R35, R44.
//
// **`deleteOrderAction` es un doble espia; las otras cinco actions FALLAN si se les llama.**
//
// **El correlativo del assert se DERIVA del contrato** (`formatOrderNumber`), no se escribe a
// mano: si manana cambia el formato, el test sigue diciendo la verdad. Lo que si se afirma en
// negativo, y es lo que importa, es que el identificador tecnico **no** aparece.

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
  DELETE_ORDER_CONFIRM_TESTID,
  DELETE_ORDER_DIALOG_TESTID,
  DELETE_ORDER_DISMISS_TESTID,
  DELETE_ORDER_ERROR_TESTID,
  DELETE_ORDER_ID_FIELD,
  DELETE_ORDER_ID_TESTID,
  DELETE_ORDER_MESSAGE_TESTID,
  DeleteOrderDialog,
} from '@/app/(private)/pedidos/components';
import { formatOrderNumber, type OrderSummary } from '@/lib/modules/pedidos';
import type { OrderMutationFormState } from '@/lib/modules/pedidos/adapters/driving/order-actions';

const { deleteOrderActionMock, routerMock } = vi.hoisted(() => ({
  deleteOrderActionMock:
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
    throw new Error(`${nombre} no debe invocarse desde el dialogo de borrado`);
  };
  return {
    deleteOrderAction: deleteOrderActionMock,
    listOrdersAction: vi.fn(noDebeInvocarse('listOrdersAction')),
    getOrderAction: vi.fn(noDebeInvocarse('getOrderAction')),
    createOrderAction: vi.fn(noDebeInvocarse('createOrderAction')),
    updateOrderAction: vi.fn(noDebeInvocarse('updateOrderAction')),
    cancelOrderAction: vi.fn(noDebeInvocarse('cancelOrderAction')),
  };
});

const NUMERO = { year: 2026, sequence: 42 } as const;

function pedido(overrides: Partial<OrderSummary> = {}): OrderSummary {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    number: NUMERO,
    numberText: formatOrderNumber(NUMERO),
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
  render(<DeleteOrderDialog order={order} open onOpenChange={cerrar} />);
  return order;
}

beforeEach(() => {
  vi.clearAllMocks();
  deleteOrderActionMock.mockResolvedValue({ status: 'success' });
  toastExito = vi.spyOn(toast, 'success');
});

afterEach(() => {
  cleanup();
  toast.dismiss();
  vi.restoreAllMocks();
});

describe('el dialogo nombra el pedido por su correlativo (R38)', () => {
  it('el texto de confirmacion contiene el correlativo derivado del contrato', () => {
    montar();

    expect(screen.getByTestId(DELETE_ORDER_MESSAGE_TESTID)).toHaveTextContent(
      formatOrderNumber(NUMERO),
    );
  });

  it('en negativo: el identificador tecnico NO aparece en ninguna parte del dialogo', () => {
    const elPedido = montar();

    const dialogo = screen.getByTestId(DELETE_ORDER_DIALOG_TESTID);
    expect(dialogo.textContent ?? '').not.toContain(elPedido.id);
    // El uuid viaja donde tiene que viajar: en el campo oculto que la operacion lee.
    expect(screen.getByTestId(DELETE_ORDER_ID_TESTID)).toHaveValue(elPedido.id);
  });
});

describe('mientras el usuario no confirme no se invoca el borrado (R38)', () => {
  it('abrir el dialogo no llama a `deleteOrderAction`', () => {
    montar();

    expect(screen.getByTestId(DELETE_ORDER_DIALOG_TESTID)).toBeInTheDocument();
    expect(deleteOrderActionMock).not.toHaveBeenCalled();
  });

  it('volver atras cierra sin borrar nada', async () => {
    const user = setupUser();
    montar();

    await user.click(screen.getByTestId(DELETE_ORDER_DISMISS_TESTID));

    expect(deleteOrderActionMock).not.toHaveBeenCalled();
    await waitFor(() => expect(seCerro()).toBe(true));
    expect(toastExito).not.toHaveBeenCalled();
  });
});

describe('al confirmar se invoca el borrado y se aplica R35', () => {
  it('llama a `deleteOrderAction` con el `id` y luego cierra, avisa y refresca', async () => {
    const user = setupUser();
    const elPedido = montar();

    await user.click(screen.getByTestId(DELETE_ORDER_CONFIRM_TESTID));

    await waitFor(() => expect(deleteOrderActionMock).toHaveBeenCalledTimes(1));
    const enviado = deleteOrderActionMock.mock.calls[0]?.[1] as FormData;
    expect(enviado.get(DELETE_ORDER_ID_FIELD)).toBe(elPedido.id);

    await waitFor(() => expect(seCerro()).toBe(true));
    expect(toastExito).toHaveBeenCalledTimes(1);
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });
});

describe('`not_deletable` se pinta en la region del DIALOGO (R34)', () => {
  it('el dialogo sigue abierto con su region de error y el codigo estable', async () => {
    const user = setupUser();
    deleteOrderActionMock.mockResolvedValue({
      status: 'error',
      code: 'not_deletable',
      message: 'Este pedido ya no se puede eliminar.',
    });
    montar();

    await user.click(screen.getByTestId(DELETE_ORDER_CONFIRM_TESTID));

    const region = await screen.findByTestId(DELETE_ORDER_ERROR_TESTID);
    expect(region).toHaveAttribute('data-code', 'not_deletable');
    expect(region).toHaveAttribute('role', 'alert');
    expect(screen.getByTestId(DELETE_ORDER_DIALOG_TESTID)).toContainElement(region);
    expect(seCerro()).toBe(false);
    expect(toastExito).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });
});

/** QC-71 T9 — R17 y R18 en el dialogo de borrado de pedido. */
describe('el identificador del error inesperado (QC-71 R17, R18)', () => {
  it('el error inesperado ensena el identificador como texto, con su etiqueta', async () => {
    const user = setupUser();
    deleteOrderActionMock.mockResolvedValue(errorInesperado());
    montar();

    await user.click(screen.getByTestId(DELETE_ORDER_CONFIRM_TESTID));

    const region = await screen.findByTestId(DELETE_ORDER_ERROR_TESTID);
    const referencia = screen.getByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID);
    expect(region).toContainElement(referencia);
    expect(referencia).toHaveTextContent(UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL);
    expect(screen.getByText(REFERENCIA_DEL_CASO)).toBeInTheDocument();
  });

  it('un error del catalogo no ensena identificador ninguno', async () => {
    const user = setupUser();
    deleteOrderActionMock.mockResolvedValue({
      status: 'error',
      code: 'not_deletable',
      message: 'Este pedido ya no se puede eliminar.',
    });
    montar();

    await user.click(screen.getByTestId(DELETE_ORDER_CONFIRM_TESTID));

    const region = await screen.findByTestId(DELETE_ORDER_ERROR_TESTID);
    expect(region).toHaveAttribute('data-code', 'not_deletable');
    esperarSinIdentificador();
  });
});
