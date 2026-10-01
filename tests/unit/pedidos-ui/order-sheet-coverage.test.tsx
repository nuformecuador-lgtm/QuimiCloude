// La etiqueta de cobertura DENTRO del panel que ya existe.
//
// Se ejercita la fila VIVA —desde `<OrderTable>`, con la factoria de columnas por dentro—, mismo
// criterio que `order-sheet-responsibles.test.tsx`: la hoja es el `SheetContent` que ya existe, no
// una pantalla nueva, y eso solo se demuestra montando la tabla entera.

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ORDER_SHEET_COVERAGE_TESTID,
  ORDER_SHEET_TESTID,
  OrderTable,
  type RecipePickerPage,
} from '@/app/(private)/pedidos/components';
import type { DataTableParams } from '@/components/shared/data-table';
import { formatOrderNumber, type OrderSummary } from '@/lib/modules/pedidos';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';

import { setupUser } from '../../helpers/user-event';
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
    throw new Error(`${nombre} no debe invocarse por abrir un panel`);
  };
  return {
    listOrdersAction: vi.fn(noDebeInvocarse('listOrdersAction')),
    getOrderAction: vi.fn(noDebeInvocarse('getOrderAction')),
    createOrderAction: vi.fn(noDebeInvocarse('createOrderAction')),
    updateOrderAction: vi.fn(noDebeInvocarse('updateOrderAction')),
    cancelOrderAction: vi.fn(noDebeInvocarse('cancelOrderAction')),
    deleteOrderAction: vi.fn(noDebeInvocarse('deleteOrderAction')),
    listOrderCoverageAction: vi.fn(noDebeInvocarse('listOrderCoverageAction')),
  };
});

vi.mock('@/lib/modules/asignaciones/adapters/driving/order-assignment-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse por abrir el panel`);
  };
  return {
    listOrderResponsiblesAction: vi.fn(noDebeInvocarse('listOrderResponsiblesAction')),
    listResponsiblesForOrdersAction: vi.fn(noDebeInvocarse('listResponsiblesForOrdersAction')),
    assignResponsiblesAction: vi.fn(noDebeInvocarse('assignResponsiblesAction')),
    unassignResponsibleAction: vi.fn(noDebeInvocarse('unassignResponsibleAction')),
    removeWorkGroupFromOrderAction: vi.fn(noDebeInvocarse('removeWorkGroupFromOrderAction')),
  };
});

vi.mock('@/lib/modules/recetas/adapters/driving/recipe-actions', () => ({
  listRecipesAction: vi.fn(() => {
    throw new Error('listRecipesAction no debe invocarse: la primera pagina llega por props');
  }),
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

const RECETA = { id: '22222222-2222-4222-8222-222222222222', name: 'Esmalte azul', imageUrl: null };
const RECETAS: RecipePickerPage = { items: [RECETA], totalPages: 1 };
const UNIDADES = [
  { id: 'u-1', name: 'Litro', symbol: 'L', baseUnitId: null, factor: null, isSystem: true },
];

const PEDIDO_ID = '11111111-1111-4111-8111-111111111111';

const PARAMS: DataTableParams = {
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  sort: null,
  filters: {},
  search: '',
};

function pedido(): OrderSummary {
  return {
    id: PEDIDO_ID,
    number: { year: 2026, sequence: 42 },
    numberText: formatOrderNumber({ year: 2026, sequence: 42 }),
    recipeId: RECETA.id,
    recipeName: RECETA.name,
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
  };
}

function montarLista(coverageByOrder: Readonly<Record<string, 'full' | 'partial' | 'none'>> = {}) {
  render(
    <OrderTable
      orders={[pedido()]}
      params={PARAMS}
      totalPages={1}
      recipes={RECETAS}
      units={UNIDADES}
      coverageByOrder={coverageByOrder}
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

describe('la hoja pinta la cobertura que la fila ya trajo (R35)', () => {
  it.each(['full', 'none', 'partial'] as const)(
    'editar abre el panel con la etiqueta de cobertura `%s` (R35)',
    async (coverage) => {
      const user = setupUser();
      montarLista({ [PEDIDO_ID]: coverage });

      await user.click(screen.getByTestId('order-action-edit'));

      const panel = await screen.findByTestId(ORDER_SHEET_TESTID);
      const etiqueta = within(panel).getByTestId(ORDER_SHEET_COVERAGE_TESTID);
      expect(within(etiqueta).getByTestId('order-coverage')).toHaveAttribute(
        'data-coverage',
        coverage,
      );
    },
  );

  it('sin entrada en el lote —fallo del lote— la hoja no pinta ninguna etiqueta (R20, R35)', async () => {
    const user = setupUser();
    montarLista({});

    await user.click(screen.getByTestId('order-action-edit'));

    const panel = await screen.findByTestId(ORDER_SHEET_TESTID);
    expect(within(panel).queryByTestId(ORDER_SHEET_COVERAGE_TESTID)).toBeNull();
  });

  it('el mismo panel abierto por «Responsables» tambien pinta la cobertura (R23, R35)', async () => {
    const user = setupUser();
    montarLista({ [PEDIDO_ID]: 'full' });

    await user.click(screen.getByTestId('order-action-responsibles'));

    const panel = await screen.findByTestId(ORDER_SHEET_TESTID);
    expect(within(panel).getByTestId('order-coverage')).toHaveAttribute('data-coverage', 'full');
  });
});
