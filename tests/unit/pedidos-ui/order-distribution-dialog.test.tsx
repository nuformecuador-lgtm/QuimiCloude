// La edicion acotada «Reparto y unidad»: la accion de fila y su dialogo. Las Server Actions que
// el dialogo no debe tocar son dobles que fallan si se les llama.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BLOCKED_ORDER_CONFIRM_TESTID,
  BLOCKED_ORDER_DIALOG_TESTID,
  BLOCKED_ORDER_DISMISS_TESTID,
  BLOCKED_ORDER_MESSAGE_TESTID,
  ORDER_ACTION_DISTRIBUTION_TESTID,
  ORDER_DISTRIBUTION_AVAILABLE_TESTID,
  ORDER_DISTRIBUTION_DIALOG_ERROR_TESTID,
  ORDER_DISTRIBUTION_DIALOG_SUBMIT_TESTID,
  ORDER_DISTRIBUTION_LINE_PACKAGES_TESTID,
  ORDER_DISTRIBUTION_WARNING_TESTID,
  OrderDistributionDialog,
  OrderRowActions,
  OrderRowSheetActions,
} from '@/app/(private)/pedidos/components';
import {
  ORDER_STATUS_VALUES,
  formatOrderNumber,
  type OrderStatus,
  type OrderSummary,
} from '@/lib/modules/pedidos';
import type { OrderMutationFormState } from '@/lib/modules/pedidos/adapters/driving/order-actions';
import type { UnitView } from '@/lib/modules/unidades';
import { setupUser } from '../../helpers/user-event';

const { updateDistributionMock, quoteAvailabilityMock, routerMock } = vi.hoisted(() => ({
  updateDistributionMock:
    vi.fn<(id: string, input: unknown) => Promise<OrderMutationFormState>>(),
  quoteAvailabilityMock: vi.fn<(input: unknown) => Promise<unknown>>(),
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
    throw new Error(`${nombre} no debe invocarse desde la edicion de reparto y unidad`);
  };
  return {
    updateOrderDistributionAction: updateDistributionMock,
    quoteOrderPresentationAvailabilityAction: quoteAvailabilityMock,
    listOrdersAction: vi.fn(noDebeInvocarse('listOrdersAction')),
    getOrderAction: vi.fn(noDebeInvocarse('getOrderAction')),
    createOrderAction: vi.fn(noDebeInvocarse('createOrderAction')),
    updateOrderAction: vi.fn(noDebeInvocarse('updateOrderAction')),
    cancelOrderAction: vi.fn(noDebeInvocarse('cancelOrderAction')),
    deleteOrderAction: vi.fn(noDebeInvocarse('deleteOrderAction')),
  };
});

// `OrderRowSheetActions` monta tambien el panel de edicion general, que pide la receta.
vi.mock('@/lib/modules/recetas/adapters/driving/recipe-actions', () => ({
  getRecipeAction: vi.fn(async () => ({
    status: 'error' as const,
    code: 'recipe_not_found',
    message: 'sin receta en este test',
  })),
  listRecipesAction: vi.fn(() => {
    throw new Error('listRecipesAction no debe invocarse desde este archivo');
  }),
}));

vi.mock('@/lib/modules/inventario/adapters/driving/product-actions', () => ({
  listProductsAction: vi.fn(async () => ({
    status: 'success' as const,
    data: { items: [], page: 1, pageSize: 25, total: 0, totalPages: 1 },
  })),
}));

vi.mock('@/lib/modules/inventario/adapters/driving/presentation-actions', () => ({
  listPresentationsAction: vi.fn(async () => ({
    status: 'success' as const,
    data: { items: [], page: 1, pageSize: 25, total: 0, totalPages: 1 },
  })),
  createPresentationAction: vi.fn(() => {
    throw new Error('createPresentationAction no debe invocarse desde este archivo');
  }),
}));

const UNIDAD_ID = '33333333-3333-4333-8333-333333333333';
const PRESENTACION_ID = '44444444-4444-4444-8444-444444444444';
const ENVASE_ID = '55555555-5555-4555-8555-555555555555';

const UNIDADES: readonly UnitView[] = [
  { id: UNIDAD_ID, name: 'Litro', symbol: 'L', baseUnitId: null, factor: null, isSystem: true },
];

function pedido(status: OrderStatus = 'POR_EMPACAR', overrides: Partial<OrderSummary> = {}): OrderSummary {
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
    cancellationReason: status === 'CANCELADO' ? 'Cliente anuló el encargo' : null,
    ingredientsCost: null,
    createdAt: new Date('2026-01-15T10:00:00.000Z'),
    updatedAt: new Date('2026-01-15T10:00:00.000Z'),
    createdBy: null,
    updatedBy: null,
    presentationLines: [
      {
        presentationId: PRESENTACION_ID,
        presentationName: '20 L',
        packages: 2,
        packagingProductId: ENVASE_ID,
        packagingName: 'Bidón PET 20 L',
      },
    ],
    unitId: UNIDAD_ID,
    unitLabel: 'L',
    customer: null,
    ...overrides,
  };
}

const cerrar = vi.fn<(open: boolean) => void>();

function montarDialogo(order: OrderSummary = pedido()) {
  render(<OrderDistributionDialog order={order} units={UNIDADES} open onOpenChange={cerrar} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  updateDistributionMock.mockResolvedValue({ status: 'success' });
  quoteAvailabilityMock.mockResolvedValue({
    status: 'success',
    data: { kind: 'ok', available: '60' },
  });
});

afterEach(() => {
  cleanup();
  toast.dismiss();
  vi.restoreAllMocks();
});

describe('accion de fila «Reparto y unidad»', () => {
  it('R11: con permiso de modificar pedidos y en POR_EMPACAR se pinta', async () => {
    render(<OrderRowActions order={pedido('POR_EMPACAR')} canEditDistribution />);

    // La accion vive dentro del menu "de los 3 puntos" (RowActionsMenu): hay que abrir el
    // disparador antes de que el item exista en el documento (via portal).
    fireEvent.click(screen.getByTestId('order-row-actions'));
    expect(await screen.findByTestId(ORDER_ACTION_DISTRIBUTION_TESTID)).toBeInTheDocument();
  });

  it('R12: sin permiso de modificar pedidos no se pinta, tampoco en POR_EMPACAR', () => {
    render(<OrderRowActions order={pedido('POR_EMPACAR')} canEditDistribution={false} />);

    expect(screen.queryByTestId(ORDER_ACTION_DISTRIBUTION_TESTID)).toBeNull();
  });

  it.each(['EN_EMPAQUE', 'ENTREGADO', 'CANCELADO'] as const)(
    'R13: en %s no se pinta aunque haya permiso',
    (status) => {
      render(<OrderRowActions order={pedido(status)} canEditDistribution />);

      expect(screen.queryByTestId(ORDER_ACTION_DISTRIBUTION_TESTID)).toBeNull();
    },
  );

  it('R11: solo POR_EMPACAR de todos los estados del contrato la ofrece', () => {
    const conAccion = ORDER_STATUS_VALUES.filter((status) => {
      const { unmount } = render(<OrderRowActions order={pedido(status)} canEditDistribution />);
      // Abre el menu antes de mirar: el item solo existe en el documento (via portal) mientras
      // el disparador esta abierto.
      fireEvent.click(screen.getByTestId('order-row-actions'));
      const visible = screen.queryByTestId(ORDER_ACTION_DISTRIBUTION_TESTID) !== null;
      unmount();
      return visible;
    });

    expect(conAccion).toEqual(['POR_EMPACAR']);
  });

  it('R11: pulsarla abre el dialogo acotado de esa fila', async () => {
    const user = setupUser();
    render(
      <OrderRowSheetActions
        order={pedido('POR_EMPACAR')}
        recipes={{ items: [], totalPages: 1 }}
        units={UNIDADES}
        bridge={null}
        canEditDistribution
      />,
    );

    await user.click(screen.getByTestId('order-row-actions'));
    await user.click(await screen.findByTestId(ORDER_ACTION_DISTRIBUTION_TESTID));

    expect(await screen.findByTestId(ORDER_DISTRIBUTION_DIALOG_SUBMIT_TESTID)).toBeInTheDocument();
  });
});

describe('dialogo «Reparto y unidad»', () => {
  it('R46: guarda enviando solo unidad y reparto, y refresca la lista', async () => {
    const user = setupUser();
    montarDialogo();

    await waitFor(() =>
      expect(screen.getByTestId(ORDER_DISTRIBUTION_AVAILABLE_TESTID)).toHaveTextContent('60 L'),
    );
    await user.click(screen.getByTestId(ORDER_DISTRIBUTION_DIALOG_SUBMIT_TESTID));

    await waitFor(() => expect(updateDistributionMock).toHaveBeenCalledTimes(1));
    const [id, input] = updateDistributionMock.mock.calls[0] ?? [];
    expect(id).toBe(pedido().id);
    expect(input).toEqual({
      unitId: UNIDAD_ID,
      presentationLines: [{ packagingProductId: ENVASE_ID, packages: '2' }],
    });
    expect(Object.keys(input as object).sort()).toEqual(['presentationLines', 'unitId']);
    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalledTimes(1));
    expect(cerrar.mock.calls.some(([abierto]) => abierto === false)).toBe(true);
  });

  it('R46: el dialogo no pinta cantidad, receta, prioridad ni responsables', () => {
    montarDialogo();

    expect(document.querySelector('[name="quantity"]')).toBeNull();
    expect(document.querySelector('[name="recipeId"]')).toBeNull();
    expect(document.querySelector('[name="priority"]')).toBeNull();
    expect(screen.queryByTestId('order-responsibles')).toBeNull();
  });

  it('R39: si el reparto pasa del total avisa y deshabilita Guardar', async () => {
    const user = setupUser();
    quoteAvailabilityMock.mockResolvedValue({
      status: 'success',
      data: { kind: 'exceeds_quantity', available: '-20' },
    });
    montarDialogo();

    const disponible = screen.getByTestId(ORDER_DISTRIBUTION_AVAILABLE_TESTID);
    await waitFor(() => expect(disponible).toHaveTextContent('-20 L'));
    expect(screen.getByTestId(ORDER_DISTRIBUTION_WARNING_TESTID)).toHaveAttribute(
      'data-kind',
      'exceeds_quantity',
    );
    const guardar = screen.getByTestId(ORDER_DISTRIBUTION_DIALOG_SUBMIT_TESTID);
    expect(guardar).toBeDisabled();

    await user.click(guardar);
    expect(updateDistributionMock).not.toHaveBeenCalled();
  });

  it.each([
    'order_presentation_line_not_editable',
    'order_distribution_exceeds_quantity',
    'incompatible_units',
    'presentation_without_content',
    'unit_not_found',
    'order_without_unit',
    'unauthorized',
    'product_not_found',
    'insufficient_material',
  ] as const)('R13/R36/R12: el rechazo %s se pinta y se conserva lo escrito', async (code) => {
    const user = setupUser();
    updateDistributionMock.mockResolvedValue({
      status: 'error',
      code,
      message: `mensaje de ${code}`,
    });
    montarDialogo();

    const envases = screen.getByTestId(ORDER_DISTRIBUTION_LINE_PACKAGES_TESTID);
    await user.clear(envases);
    await user.type(envases, '3');
    await user.click(screen.getByTestId(ORDER_DISTRIBUTION_DIALOG_SUBMIT_TESTID));

    const region = await screen.findByTestId(ORDER_DISTRIBUTION_DIALOG_ERROR_TESTID);
    expect(region).toHaveAttribute('role', 'alert');
    expect(region).toHaveAttribute('data-code', code);
    expect(within(region).getByText(`mensaje de ${code}`)).toBeInTheDocument();
    expect(updateDistributionMock).toHaveBeenCalledWith(pedido().id, {
      unitId: UNIDAD_ID,
      presentationLines: [{ packagingProductId: ENVASE_ID, packages: '3' }],
    });
    expect(screen.getByTestId(ORDER_DISTRIBUTION_LINE_PACKAGES_TESTID)).toHaveValue(3);
    expect(routerMock.refresh).not.toHaveBeenCalled();
    expect(cerrar.mock.calls.some(([abierto]) => abierto === false)).toBe(false);
  });

  it('R35: una linea antigua se reenvia tal cual, por su presentacion', async () => {
    const user = setupUser();
    montarDialogo(
      pedido('POR_EMPACAR', {
        presentationLines: [
          { presentationId: PRESENTACION_ID, presentationName: 'Bidón 20L', packages: 2, packagingProductId: null, packagingName: null },
        ],
      }),
    );

    await waitFor(() =>
      expect(screen.getByTestId(ORDER_DISTRIBUTION_AVAILABLE_TESTID)).toHaveTextContent('60 L'),
    );
    await user.click(screen.getByTestId(ORDER_DISTRIBUTION_DIALOG_SUBMIT_TESTID));

    await waitFor(() => expect(updateDistributionMock).toHaveBeenCalledTimes(1));
    expect(updateDistributionMock.mock.calls[0]?.[1]).toEqual({
      unitId: UNIDAD_ID,
      presentationLines: [{ presentationId: PRESENTACION_ID, packages: '2' }],
    });
  });

  it('R18: insufficient_material se pinta como error y el dialogo no pide confirmar', async () => {
    const user = setupUser();
    updateDistributionMock.mockResolvedValue({
      status: 'error',
      code: 'insufficient_material',
      message: 'No hay envases suficientes.',
    });
    montarDialogo(pedido('EN_CURSO'));

    await user.click(screen.getByTestId(ORDER_DISTRIBUTION_DIALOG_SUBMIT_TESTID));

    const region = await screen.findByTestId(ORDER_DISTRIBUTION_DIALOG_ERROR_TESTID);
    expect(region).toHaveAttribute('data-code', 'insufficient_material');
    expect(screen.queryByTestId(BLOCKED_ORDER_DIALOG_TESTID)).toBeNull();
    expect(updateDistributionMock).toHaveBeenCalledTimes(1);
  });

  it('R42: sin unidad del pedido no se ofrece guardar', () => {
    montarDialogo(pedido('POR_EMPACAR', { unitId: null, unitLabel: null, presentationLines: [] }));

    expect(screen.getByTestId(ORDER_DISTRIBUTION_DIALOG_SUBMIT_TESTID)).toBeDisabled();
  });
});

describe('reabrir «Reparto y unidad» antes de que llegue el refresco', () => {
  function accionesDeFila(order: OrderSummary) {
    return (
      <OrderRowSheetActions
        order={order}
        recipes={{ items: [], totalPages: 1 }}
        units={UNIDADES}
        bridge={null}
        canEditDistribution
      />
    );
  }

  async function guardarEnvases(user: ReturnType<typeof setupUser>, envases: string) {
    await user.click(screen.getByTestId('order-row-actions'));
    await user.click(await screen.findByTestId(ORDER_ACTION_DISTRIBUTION_TESTID));
    const campo = await screen.findByTestId(ORDER_DISTRIBUTION_LINE_PACKAGES_TESTID);
    await user.clear(campo);
    await user.type(campo, envases);
    await user.click(screen.getByTestId(ORDER_DISTRIBUTION_DIALOG_SUBMIT_TESTID));
    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByTestId(ORDER_DISTRIBUTION_DIALOG_SUBMIT_TESTID)).toBeNull(),
    );
  }

  it('R11: con el mismo pedido aun en props, reabre con lo guardado y no con lo anterior', async () => {
    const user = setupUser();
    render(accionesDeFila(pedido()));

    await guardarEnvases(user, '5');
    await user.click(screen.getByTestId('order-row-actions'));
    await user.click(await screen.findByTestId(ORDER_ACTION_DISTRIBUTION_TESTID));

    expect(await screen.findByTestId(ORDER_DISTRIBUTION_LINE_PACKAGES_TESTID)).toHaveValue(5);
  });

  it('R11: guardar tras reabrir antes del refresco no reenvia los valores anteriores', async () => {
    const user = setupUser();
    render(accionesDeFila(pedido()));

    await guardarEnvases(user, '5');
    await user.click(screen.getByTestId('order-row-actions'));
    await user.click(await screen.findByTestId(ORDER_ACTION_DISTRIBUTION_TESTID));
    await user.click(await screen.findByTestId(ORDER_DISTRIBUTION_DIALOG_SUBMIT_TESTID));

    await waitFor(() => expect(updateDistributionMock).toHaveBeenCalledTimes(2));
    expect(updateDistributionMock.mock.calls[1]?.[1]).toEqual({
      unitId: UNIDAD_ID,
      presentationLines: [{ packagingProductId: ENVASE_ID, packages: '5' }],
    });
  });

  it('R11: cuando llega el refresco, reabre con el pedido nuevo y descarta lo guardado en local', async () => {
    const user = setupUser();
    const { rerender } = render(accionesDeFila(pedido()));

    await guardarEnvases(user, '5');
    rerender(
      accionesDeFila(
        pedido('POR_EMPACAR', {
          presentationLines: [
            {
              presentationId: PRESENTACION_ID,
              presentationName: '20 L',
              packages: 7,
              packagingProductId: ENVASE_ID,
              packagingName: 'Bidón PET 20 L',
            },
          ],
        }),
      ),
    );
    await user.click(screen.getByTestId('order-row-actions'));
    await user.click(await screen.findByTestId(ORDER_ACTION_DISTRIBUTION_TESTID));

    expect(await screen.findByTestId(ORDER_DISTRIBUTION_LINE_PACKAGES_TESTID)).toHaveValue(7);
  });
});

describe('«Reparto y unidad» con falta de envases (R17, R37)', () => {
  const AVISO = 'Falta material: el pedido quedará bloqueado.';

  beforeEach(() => {
    updateDistributionMock.mockResolvedValueOnce({
      status: 'error',
      code: 'order_would_block',
      message: AVISO,
    });
  });

  it('R37: el aviso order_would_block muestra la misma confirmacion que el formulario del pedido', async () => {
    const user = setupUser();
    montarDialogo(pedido('PENDIENTE'));

    await user.click(screen.getByTestId(ORDER_DISTRIBUTION_DIALOG_SUBMIT_TESTID));

    expect(await screen.findByTestId(BLOCKED_ORDER_DIALOG_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId(BLOCKED_ORDER_MESSAGE_TESTID)).toHaveTextContent(AVISO);
    expect(screen.queryByTestId(ORDER_DISTRIBUTION_DIALOG_ERROR_TESTID)).toBeNull();
    expect(updateDistributionMock).toHaveBeenCalledTimes(1);
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });

  it('R17/R37: confirmar reenvia el mismo reparto con confirmBlocked y cierra al guardar', async () => {
    const user = setupUser();
    montarDialogo(pedido('PENDIENTE'));

    await user.click(screen.getByTestId(ORDER_DISTRIBUTION_DIALOG_SUBMIT_TESTID));
    await user.click(await screen.findByTestId(BLOCKED_ORDER_CONFIRM_TESTID));

    await waitFor(() => expect(updateDistributionMock).toHaveBeenCalledTimes(2));
    expect(updateDistributionMock.mock.calls[0]?.[1]).toEqual({
      unitId: UNIDAD_ID,
      presentationLines: [{ packagingProductId: ENVASE_ID, packages: '2' }],
    });
    expect(updateDistributionMock.mock.calls[1]?.[1]).toEqual({
      unitId: UNIDAD_ID,
      presentationLines: [{ packagingProductId: ENVASE_ID, packages: '2' }],
      confirmBlocked: true,
    });
    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalledTimes(1));
    expect(cerrar.mock.calls.some(([abierto]) => abierto === false)).toBe(true);
  });

  it('R37: sin confirmar no se reenvia nada y el dialogo sigue abierto', async () => {
    const user = setupUser();
    montarDialogo(pedido('BLOQUEADO'));

    await user.click(screen.getByTestId(ORDER_DISTRIBUTION_DIALOG_SUBMIT_TESTID));
    await user.click(await screen.findByTestId(BLOCKED_ORDER_DISMISS_TESTID));

    await waitFor(() => expect(screen.queryByTestId(BLOCKED_ORDER_DIALOG_TESTID)).toBeNull());
    expect(updateDistributionMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId(ORDER_DISTRIBUTION_DIALOG_SUBMIT_TESTID)).toBeInTheDocument();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });
});
