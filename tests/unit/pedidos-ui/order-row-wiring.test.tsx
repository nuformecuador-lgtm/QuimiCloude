// QC-35 T11/T12 — El CABLEADO de la fila: R23, R24, R25, R37, R38.
//
// Este archivo existe por un agujero real: mientras las columnas fueron un array estatico, la
// celda de acciones no podia recibir los catalogos del panel y los tres botones de la fila **no
// abrian nada**. Aqui se ejercita la fila VIVA -desde `<OrderTable>`, con la factoria de columnas
// por dentro- y se comprueba que cada boton abre lo suyo, y que con el pedido en estado final no
// abre ninguno.
//
// **Las seis actions son dobles que FALLAN si se les llama**: abrir un panel o un dialogo no
// invoca ninguna operacion.

import { cleanup, render, screen } from '@testing-library/react';
import { setupUser } from '../../helpers/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CANCEL_ORDER_DIALOG_TESTID,
  DELETE_ORDER_DIALOG_TESTID,
  ORDER_FORM_TESTID,
  OrderTable,
  type RecipePickerPage,
} from '@/app/(private)/pedidos/components';
import type { DataTableParams } from '@/components/shared/data-table';
import { formatOrderNumber, type OrderStatus, type OrderSummary } from '@/lib/modules/pedidos';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';

import { WIDE_VIEWPORT, resetViewport, setViewportWidth } from '../../helpers/viewport';

const { routerMock } = vi.hoisted(() => ({
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
    throw new Error(`${nombre} no debe invocarse por abrir un panel o un dialogo`);
  };
  return {
    listOrdersAction: vi.fn(noDebeInvocarse('listOrdersAction')),
    getOrderAction: vi.fn(noDebeInvocarse('getOrderAction')),
    createOrderAction: vi.fn(noDebeInvocarse('createOrderAction')),
    updateOrderAction: vi.fn(noDebeInvocarse('updateOrderAction')),
    cancelOrderAction: vi.fn(noDebeInvocarse('cancelOrderAction')),
    deleteOrderAction: vi.fn(noDebeInvocarse('deleteOrderAction')),
  };
});

vi.mock('@/lib/modules/recetas/adapters/driving/recipe-actions', () => ({
  listRecipeVersionsAction: vi.fn(async () => ({ status: 'success' as const, data: [] })),
  listRecipesAction: vi.fn(() => {
    throw new Error('listRecipesAction no debe invocarse: la primera pagina llega por props');
  }),
  // El panel de edicion pide el detalle de la receta al montar (los ingredientes). Resuelve
  // vacio: abrir el panel no debe invocar una operacion, pero el fetch del detalle si ocurre.
  getRecipeAction: vi.fn(async (id: string) => ({
    status: 'success' as const,
    data: {
      id,
      name: 'Esmalte azul',
      description: null,
      imageUrl: null,
      stepCount: 0,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      createdBy: null,
      updatedBy: null,
      steps: [],
      lines: [],
    },
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

const RECETA = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Esmalte azul',
  imageUrl: null,
};
const RECETAS: RecipePickerPage = { items: [RECETA], totalPages: 1 };

const UNIDADES = [
  { id: 'u-1', name: 'Litro', symbol: 'L', baseUnitId: null, factor: null, isSystem: true },
];

function pedido(status: OrderStatus): OrderSummary {
  return {
    id: 'o1',
    number: { year: 2026, sequence: 42 },
    numberText: formatOrderNumber({ year: 2026, sequence: 42 }),
    recipeId: RECETA.id,
    recipeName: RECETA.name,
    recipeVersion: null,
    quantity: '12.5000',
    priority: 'MEDIA',
    status,
    cancellationReason: null,
    ingredientsCost: null,
    createdAt: new Date('2026-01-15T10:00:00.000Z'),
    updatedAt: new Date('2026-01-15T10:00:00.000Z'),
    createdBy: null,
    updatedBy: null,
    presentationId: null,
    presentationName: null,
  };
}

const PARAMS: DataTableParams = {
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  sort: null,
  filters: {},
  search: '',
};

/** Monta la LISTA entera: la celda de acciones es la que la factoria de columnas construye. */
function montarLista(status: OrderStatus = 'PENDIENTE') {
  render(
    <OrderTable
      orders={[pedido(status)]}
      params={PARAMS}
      totalPages={1}
      recipes={RECETAS}
      units={UNIDADES}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(() => {
  cleanup();
  resetViewport();
});

describe('desde una fila viva, cada accion abre lo suyo (R23, R25, R37, R38)', () => {
  it('la fila trae los tres controles y, cerrada, no monta ningun panel ni dialogo', () => {
    montarLista();

    expect(screen.getByTestId('order-row-actions')).toBeInTheDocument();
    expect(screen.getByTestId('order-action-edit')).toBeEnabled();
    expect(screen.getByTestId('order-action-cancel')).toBeEnabled();
    expect(screen.getByTestId('order-action-delete')).toBeEnabled();

    expect(screen.queryByTestId(ORDER_FORM_TESTID)).toBeNull();
    expect(screen.queryByTestId(CANCEL_ORDER_DIALOG_TESTID)).toBeNull();
    expect(screen.queryByTestId(DELETE_ORDER_DIALOG_TESTID)).toBeNull();
  });

  it('pulsar editar abre el panel lateral con el pedido precargado', async () => {
    const user = setupUser();
    montarLista();

    await user.click(screen.getByTestId('order-action-edit'));

    expect(await screen.findByTestId(ORDER_FORM_TESTID)).toBeInTheDocument();
    expect(screen.queryByTestId(CANCEL_ORDER_DIALOG_TESTID)).toBeNull();
    expect(screen.queryByTestId(DELETE_ORDER_DIALOG_TESTID)).toBeNull();
  });

  it('pulsar cancelar abre el dialogo de motivo, y solo ese', async () => {
    const user = setupUser();
    montarLista();

    await user.click(screen.getByTestId('order-action-cancel'));

    expect(await screen.findByTestId(CANCEL_ORDER_DIALOG_TESTID)).toBeInTheDocument();
    expect(screen.queryByTestId(ORDER_FORM_TESTID)).toBeNull();
    expect(screen.queryByTestId(DELETE_ORDER_DIALOG_TESTID)).toBeNull();
  });

  it('pulsar borrar abre la confirmacion, y solo esa', async () => {
    const user = setupUser();
    montarLista();

    await user.click(screen.getByTestId('order-action-delete'));

    expect(await screen.findByTestId(DELETE_ORDER_DIALOG_TESTID)).toBeInTheDocument();
    expect(screen.queryByTestId(ORDER_FORM_TESTID)).toBeNull();
    expect(screen.queryByTestId(CANCEL_ORDER_DIALOG_TESTID)).toBeNull();
  });
});

describe('con el pedido en estado final ninguna de las tres abre nada (R24)', () => {
  for (const status of ['ENTREGADO', 'CANCELADO'] as const) {
    it(`estado ${status}: los tres controles deshabilitados y ningun panel ni dialogo montado`, async () => {
      const user = setupUser();
      montarLista(status);

      for (const testId of ['order-action-edit', 'order-action-cancel', 'order-action-delete']) {
        const control = screen.getByTestId(testId);
        expect(control).toBeDisabled();
        await user.click(control);
      }

      expect(screen.getByTestId('order-row-actions-reason')).toBeInTheDocument();
      expect(screen.queryByTestId(ORDER_FORM_TESTID)).toBeNull();
      expect(screen.queryByTestId(CANCEL_ORDER_DIALOG_TESTID)).toBeNull();
      expect(screen.queryByTestId(DELETE_ORDER_DIALOG_TESTID)).toBeNull();
    });
  }
});
