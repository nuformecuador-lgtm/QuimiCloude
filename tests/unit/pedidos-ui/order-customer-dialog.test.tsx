// El dialogo «Cliente» de la fila: guardar, quitar, exito y error, y que solo se monta abierto.
// Las Server Actions que no le tocan son dobles que fallan si se les llama.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ORDER_ACTION_CUSTOMER_TESTID,
  ORDER_CUSTOMER_DIALOG_ERROR_TESTID,
  ORDER_CUSTOMER_DIALOG_REMOVE_TESTID,
  ORDER_CUSTOMER_DIALOG_SUBMIT_TESTID,
  ORDER_CUSTOMER_DIALOG_TESTID,
  ORDER_CUSTOMER_DIALOG_TOUCH_TARGET,
  OrderCustomerDialog,
  OrderRowSheetActions,
} from '@/app/(private)/pedidos/components';
import { errorMessage } from '@/lib/modules/errores';
import {
  formatOrderNumber,
  type OrderCustomer,
  type OrderStatus,
  type OrderSummary,
} from '@/lib/modules/pedidos';
import type {
  OrderCustomerOptionsResult,
  OrderMutationFormState,
} from '@/lib/modules/pedidos/adapters/driving/order-actions';
import { setupUser } from '../../helpers/user-event';

const { setCustomerMock, searchCustomersMock, routerMock } = vi.hoisted(() => ({
  setCustomerMock: vi.fn<(id: string, input: unknown) => Promise<OrderMutationFormState>>(),
  searchCustomersMock: vi.fn<(query: unknown, purpose: string) => Promise<OrderCustomerOptionsResult>>(),
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
    throw new Error(`${nombre} no debe invocarse desde el cambio de cliente`);
  };
  return {
    setOrderCustomerAction: setCustomerMock,
    searchOrderCustomersAction: searchCustomersMock,
    getOrderCustomerFilterOptionAction: vi.fn(noDebeInvocarse('getOrderCustomerFilterOptionAction')),
    updateOrderDistributionAction: vi.fn(noDebeInvocarse('updateOrderDistributionAction')),
    quoteOrderPresentationAvailabilityAction: vi.fn(noDebeInvocarse('quoteOrderPresentationAvailabilityAction')),
    listOrdersAction: vi.fn(noDebeInvocarse('listOrdersAction')),
    getOrderAction: vi.fn(noDebeInvocarse('getOrderAction')),
    createOrderAction: vi.fn(noDebeInvocarse('createOrderAction')),
    updateOrderAction: vi.fn(noDebeInvocarse('updateOrderAction')),
    cancelOrderAction: vi.fn(noDebeInvocarse('cancelOrderAction')),
    deleteOrderAction: vi.fn(noDebeInvocarse('deleteOrderAction')),
  };
});

vi.mock('@/lib/modules/recetas/adapters/driving/recipe-actions', () => ({
  getRecipeAction: vi.fn(async () => ({ status: 'error', code: 'recipe_not_found', message: 'sin receta' })),
  listRecipesAction: vi.fn(() => {
    throw new Error('listRecipesAction no debe invocarse desde este archivo');
  }),
}));

vi.mock('@/lib/modules/inventario/adapters/driving/presentation-actions', () => ({
  listPresentationsAction: vi.fn(() => {
    throw new Error('listPresentationsAction no debe invocarse desde este archivo');
  }),
  createPresentationAction: vi.fn(() => {
    throw new Error('createPresentationAction no debe invocarse desde este archivo');
  }),
}));

const ACTUAL: OrderCustomer = { id: '6f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f601', name: 'Ana Garcia', isDeleted: false };
const OTRO: OrderCustomer = { id: '6f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f603', name: 'Carla Martinez', isDeleted: false };

function pedido(status: OrderStatus = 'ENTREGADO', overrides: Partial<OrderSummary> = {}): OrderSummary {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    number: { year: 2026, sequence: 42 },
    numberText: formatOrderNumber({ year: 2026, sequence: 42 }),
    recipeId: '22222222-2222-4222-8222-222222222222',
    recipeName: 'Esmalte azul',
    recipeVersion: null,
    quantity: '100.0000',
    priority: 'MEDIA',
    status,
    cancellationReason: null,
    ingredientsCost: null,
    createdAt: new Date('2026-01-15T10:00:00.000Z'),
    updatedAt: new Date('2026-01-15T10:00:00.000Z'),
    createdBy: null,
    updatedBy: null,
    presentationLines: [],
    unitId: null,
    unitLabel: null,
    customer: ACTUAL,
    ...overrides,
  };
}

const cerrar = vi.fn<(open: boolean) => void>();

function montarDialogo(order: OrderSummary = pedido()) {
  render(<OrderCustomerDialog order={order} open onOpenChange={cerrar} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  setCustomerMock.mockResolvedValue({ status: 'success' });
  searchCustomersMock.mockResolvedValue({
    status: 'success',
    data: { items: [ACTUAL, OTRO], total: 2, page: 1, pageSize: 10, totalPages: 1 },
  });
});

afterEach(() => {
  cleanup();
  toast.dismiss();
});

describe('dialogo «Cliente»', () => {
  it('R31: arranca con el cliente actual en el campo', () => {
    montarDialogo();

    expect(screen.getByRole('combobox', { name: 'Cliente' })).toHaveValue('Ana Garcia');
  });

  it('R14/R33: guardar envia solo el cliente elegido, cierra, avisa y refresca', async () => {
    const user = setupUser();
    const exito = vi.spyOn(toast, 'success');
    montarDialogo();

    const campo = screen.getByRole('combobox', { name: 'Cliente' });
    await user.clear(campo);
    await user.click(campo);
    await user.click(await screen.findByText('Carla Martinez'));
    await user.click(screen.getByTestId(ORDER_CUSTOMER_DIALOG_SUBMIT_TESTID));

    await waitFor(() => expect(setCustomerMock).toHaveBeenCalledTimes(1));
    expect(setCustomerMock).toHaveBeenCalledWith(pedido().id, { customerId: OTRO.id });
    expect(searchCustomersMock).toHaveBeenCalledWith(expect.anything(), 'assign');
    await waitFor(() => expect(cerrar).toHaveBeenCalledWith(false));
    expect(exito).toHaveBeenCalledWith('Cliente actualizado.');
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
  });

  it('R14: «Quitar cliente» envia customerId null', async () => {
    const user = setupUser();
    montarDialogo();

    await user.click(screen.getByTestId(ORDER_CUSTOMER_DIALOG_REMOVE_TESTID));

    await waitFor(() => expect(setCustomerMock).toHaveBeenCalledTimes(1));
    expect(setCustomerMock).toHaveBeenCalledWith(pedido().id, { customerId: null });
    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalledTimes(1));
  });

  it('R14: vaciar el campo y guardar tambien quita el cliente', async () => {
    const user = setupUser();
    montarDialogo();

    await user.clear(screen.getByRole('combobox', { name: 'Cliente' }));
    await user.click(screen.getByTestId(ORDER_CUSTOMER_DIALOG_SUBMIT_TESTID));

    await waitFor(() => expect(setCustomerMock).toHaveBeenCalledTimes(1));
    expect(setCustomerMock).toHaveBeenCalledWith(pedido().id, { customerId: null });
  });

  it('sin cliente actual, «Quitar cliente» esta deshabilitado', () => {
    montarDialogo(pedido('PENDIENTE', { customer: null }));

    expect(screen.getByTestId(ORDER_CUSTOMER_DIALOG_REMOVE_TESTID)).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Cliente' })).toHaveValue('');
  });

  it('R33: con error muestra el mensaje del catalogo y sigue abierto, sin refrescar', async () => {
    const user = setupUser();
    const mensaje = errorMessage('customer_not_found');
    setCustomerMock.mockResolvedValue({ status: 'error', code: 'customer_not_found', message: mensaje });
    montarDialogo();

    await user.click(screen.getByTestId(ORDER_CUSTOMER_DIALOG_SUBMIT_TESTID));

    const alerta = await screen.findByTestId(ORDER_CUSTOMER_DIALOG_ERROR_TESTID);
    expect(alerta).toHaveAttribute('data-code', 'customer_not_found');
    expect(alerta).toHaveTextContent(mensaje);
    expect(cerrar).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
    expect(screen.getByTestId(ORDER_CUSTOMER_DIALOG_TESTID)).toBeInTheDocument();
  });

  it('R35: los tres botones miden al menos 44 px', () => {
    montarDialogo();

    expect(ORDER_CUSTOMER_DIALOG_TOUCH_TARGET).toContain('min-h-11');
    for (const testId of [ORDER_CUSTOMER_DIALOG_SUBMIT_TESTID, ORDER_CUSTOMER_DIALOG_REMOVE_TESTID]) {
      expect(screen.getByTestId(testId).className).toContain('min-h-11');
      expect(screen.getByTestId(testId).className).toContain('min-w-11');
    }
  });
});

describe('montaje desde la fila', () => {
  it('R39: solo se monta mientras esta abierto, y la accion lo abre en un pedido TERMINADO, cerrado a la edicion', async () => {
    const user = setupUser();
    render(
      <OrderRowSheetActions
        order={pedido('TERMINADO')}
        recipes={{ items: [], totalPages: 1 }}
        units={[]}
        bridge={null}
        canEditCustomer
      />,
    );

    expect(screen.queryByTestId(ORDER_CUSTOMER_DIALOG_TESTID)).toBeNull();

    await user.click(screen.getByTestId('order-row-actions'));
    await user.click(await screen.findByTestId(ORDER_ACTION_CUSTOMER_TESTID));

    expect(await screen.findByTestId(ORDER_CUSTOMER_DIALOG_TESTID)).toBeInTheDocument();
  });
});
