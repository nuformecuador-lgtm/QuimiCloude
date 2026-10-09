// El campo «Cliente» del formulario de pedido: que viaja en el `FormData` en el alta y en la
// edicion. Las actions son dobles; la de opciones devuelve una pagina fija.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ORDER_CUSTOMER_FIELD,
  ORDER_FORM_SUBMIT_TESTID,
  OrderForm,
  RECIPE_PICKER_TESTID,
  type RecipePickerPage,
} from '@/app/(private)/pedidos/components';
import { Sheet } from '@/components/ui/sheet';
import { formatOrderNumber, type OrderCustomer, type OrderSummary } from '@/lib/modules/pedidos';
import type {
  CreateOrderFormState,
  OrderCustomerOptionsResult,
  OrderMutationFormState,
} from '@/lib/modules/pedidos/adapters/driving/order-actions';
import type { RecipeDetail } from '@/lib/modules/recetas';
import type { UnitView } from '@/lib/modules/unidades';
import { esperarInteractiva, setupUser } from '../../helpers/user-event';

const { createOrderActionMock, updateOrderActionMock, searchCustomersMock, prohibida } = vi.hoisted(() => ({
  createOrderActionMock: vi.fn<(prev: CreateOrderFormState, data: FormData) => Promise<CreateOrderFormState>>(),
  updateOrderActionMock:
    vi.fn<(id: string, prev: OrderMutationFormState, data: FormData) => Promise<OrderMutationFormState>>(),
  searchCustomersMock: vi.fn<(query: unknown, purpose: string) => Promise<OrderCustomerOptionsResult>>(),
  prohibida: (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse desde el formulario`);
  },
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock('@/lib/modules/asignaciones/adapters/driving/order-assignment-actions', () => ({
  assignResponsiblesAction: vi.fn(prohibida('assignResponsiblesAction')),
  unassignResponsibleAction: vi.fn(prohibida('unassignResponsibleAction')),
  removeWorkGroupFromOrderAction: vi.fn(prohibida('removeWorkGroupFromOrderAction')),
  listOrderResponsiblesAction: vi.fn(prohibida('listOrderResponsiblesAction')),
  listResponsiblesForOrdersAction: vi.fn(prohibida('listResponsiblesForOrdersAction')),
}));

vi.mock('@/lib/modules/pedidos/adapters/driving/order-actions', () => ({
  createOrderAction: createOrderActionMock,
  updateOrderAction: updateOrderActionMock,
  searchOrderCustomersAction: searchCustomersMock,
  setOrderCustomerAction: vi.fn(prohibida('setOrderCustomerAction')),
  cancelOrderAction: vi.fn(prohibida('cancelOrderAction')),
  deleteOrderAction: vi.fn(prohibida('deleteOrderAction')),
  listOrdersAction: vi.fn(prohibida('listOrdersAction')),
  getOrderAction: vi.fn(prohibida('getOrderAction')),
  quoteOrderCostAction: vi.fn(() => Promise.resolve({ status: 'success', data: { ingredientsCost: null } })),
  quoteOrderPresentationAvailabilityAction: vi.fn(() =>
    Promise.resolve({ status: 'success', data: { kind: 'ok', available: '10' } }),
  ),
}));

const RECETA = { id: crypto.randomUUID(), name: 'Esmalte azul', imageUrl: null };
const RECETAS: RecipePickerPage = { items: [RECETA], totalPages: 1 };
const UNIDAD: UnitView = { id: crypto.randomUUID(), name: 'Litro', symbol: 'L', baseUnitId: null, factor: null, isSystem: true };

vi.mock('@/lib/modules/recetas/adapters/driving/recipe-actions', () => ({
  listRecipeVersionsAction: vi.fn(async () => ({ status: 'success', data: [] })),
  listRecipesAction: vi.fn(prohibida('listRecipesAction')),
  getRecipeAction: vi.fn(async () => ({ status: 'success', data: recetaDetalle() })),
}));

vi.mock('@/lib/modules/inventario/adapters/driving/presentation-actions', () => ({
  listPresentationsAction: vi.fn(async () => ({
    status: 'success',
    data: { items: [], page: 1, pageSize: 25, total: 0, totalPages: 1 },
  })),
  createPresentationAction: vi.fn(prohibida('createPresentationAction')),
}));

vi.mock('@/lib/modules/inventario/adapters/driving/product-actions', () => ({
  listProductsAction: vi.fn(async () => ({
    status: 'success',
    data: { items: [], page: 1, pageSize: 25, total: 0, totalPages: 1 },
  })),
}));

function recetaDetalle(): RecipeDetail {
  return {
    id: RECETA.id,
    name: RECETA.name,
    description: null,
    imageUrl: null,
    stepCount: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdBy: null,
    updatedBy: null,
    steps: [],
    packingSteps: [],
    lines: [],
    tools: [],
    original: null,
    isUnderReview: false,
    displayName: RECETA.name,
  };
}

const CLIENTE: OrderCustomer = { id: '6f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f601', name: 'Ana Garcia', isDeleted: false };

function pedido(overrides: Partial<OrderSummary> = {}): OrderSummary {
  return {
    id: crypto.randomUUID(),
    number: { year: 2026, sequence: 42 },
    numberText: formatOrderNumber({ year: 2026, sequence: 42 }),
    recipeId: RECETA.id,
    recipeName: RECETA.name,
    recipeVersion: null,
    quantity: '10.0000',
    priority: 'ALTA',
    status: 'EN_CURSO',
    cancellationReason: null,
    ingredientsCost: null,
    createdAt: new Date('2026-01-15T10:00:00.000Z'),
    updatedAt: new Date('2026-01-15T10:00:00.000Z'),
    createdBy: null,
    updatedBy: null,
    presentationLines: [],
    unitId: UNIDAD.id,
    unitLabel: UNIDAD.symbol,
    customer: null,
    ...overrides,
  };
}

function renderFormulario(order?: OrderSummary) {
  return render(
    <Sheet open>
      <OrderForm order={order} recipes={RECETAS} units={[UNIDAD]} bridge={null} onSaved={vi.fn()} />
    </Sheet>,
  );
}

function campoCliente(): HTMLElement {
  return screen.getByRole('combobox', { name: 'Cliente' });
}

async function rellenarAlta(user: ReturnType<typeof setupUser>) {
  await user.click(screen.getByTestId(RECIPE_PICKER_TESTID));
  await user.click(await esperarInteractiva(await screen.findByTestId(`${RECIPE_PICKER_TESTID}-option`)));
  await user.click(screen.getByTestId('presentation-unit-select'));
  await user.click(await esperarInteractiva(await screen.findByTestId('presentation-unit-option')));
  await user.type(screen.getByTestId('order-field-quantity'), '10');
}

beforeEach(() => {
  vi.clearAllMocks();
  createOrderActionMock.mockResolvedValue({
    status: 'success',
    id: crypto.randomUUID(),
    numberText: formatOrderNumber({ year: 2026, sequence: 43 }),
  });
  updateOrderActionMock.mockResolvedValue({ status: 'success' });
  searchCustomersMock.mockResolvedValue({
    status: 'success',
    data: { items: [CLIENTE], total: 1, page: 1, pageSize: 10, totalPages: 1 },
  });
});

afterEach(() => {
  cleanup();
});

describe('el campo «Cliente» del alta', () => {
  it('R31: sin elegir cliente el alta envia customerId vacio', async () => {
    const user = setupUser();
    renderFormulario();

    await rellenarAlta(user);
    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(createOrderActionMock).toHaveBeenCalledTimes(1));
    const enviado = createOrderActionMock.mock.calls[0]?.[1] as FormData;
    expect(enviado.get(ORDER_CUSTOMER_FIELD)).toBe('');
    expect(searchCustomersMock).not.toHaveBeenCalled();
  });

  it('R31: eligiendo un cliente el alta envia su id, y lo busca solo entre los vivos', async () => {
    const user = setupUser();
    renderFormulario();

    await rellenarAlta(user);
    await user.click(campoCliente());
    await user.click(await screen.findByText('Ana Garcia'));
    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(createOrderActionMock).toHaveBeenCalledTimes(1));
    const enviado = createOrderActionMock.mock.calls[0]?.[1] as FormData;
    expect(enviado.get(ORDER_CUSTOMER_FIELD)).toBe(CLIENTE.id);
    expect(searchCustomersMock).toHaveBeenCalledWith(expect.anything(), 'assign');
  });
});

describe('el campo «Cliente» de la edicion', () => {
  it('R31: viene precargado con el cliente actual y lo reenvia', async () => {
    const user = setupUser();
    renderFormulario(pedido({ customer: CLIENTE }));

    expect(campoCliente()).toHaveValue('Ana Garcia');
    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(updateOrderActionMock).toHaveBeenCalledTimes(1));
    const enviado = updateOrderActionMock.mock.calls[0]?.[2] as FormData;
    expect(enviado.get(ORDER_CUSTOMER_FIELD)).toBe(CLIENTE.id);
  });

  it('R31: precargado con un cliente dado de baja, muestra el sufijo y conserva su id', async () => {
    const user = setupUser();
    renderFormulario(pedido({ customer: { ...CLIENTE, isDeleted: true } }));

    expect(campoCliente()).toHaveValue('Ana Garcia (eliminado)');
    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(updateOrderActionMock).toHaveBeenCalledTimes(1));
    const enviado = updateOrderActionMock.mock.calls[0]?.[2] as FormData;
    expect(enviado.get(ORDER_CUSTOMER_FIELD)).toBe(CLIENTE.id);
  });

  it('R31: vaciar el campo envia customerId vacio', async () => {
    const user = setupUser();
    renderFormulario(pedido({ customer: CLIENTE }));

    await user.clear(campoCliente());
    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(updateOrderActionMock).toHaveBeenCalledTimes(1));
    const enviado = updateOrderActionMock.mock.calls[0]?.[2] as FormData;
    expect(enviado.get(ORDER_CUSTOMER_FIELD)).toBe('');
  });

  it('R31: sin cliente en el pedido, la edicion arranca vacia y envia vacio', async () => {
    const user = setupUser();
    renderFormulario(pedido());

    expect(campoCliente()).toHaveValue('');
    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(updateOrderActionMock).toHaveBeenCalledTimes(1));
    const enviado = updateOrderActionMock.mock.calls[0]?.[2] as FormData;
    expect(enviado.get(ORDER_CUSTOMER_FIELD)).toBe('');
  });
});
