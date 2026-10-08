import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import PedidosPage from '@/app/(private)/pedidos/page';
import { errorMessage, type ErrorState } from '@/lib/modules/errores';
import { PERMISSIONS, type SessionUser } from '@/lib/modules/identity';
import { formatOrderNumber, type OrderSummary } from '@/lib/modules/pedidos';
import type { OrderListResult } from '@/lib/modules/pedidos/adapters/driving/order-actions';
import type { UnitView } from '@/lib/modules/unidades';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';
import { ORDERS_ROUTE } from '@/lib/shared/routes';

import { errorInesperado } from '../../helpers/identificador-de-request';
import {
  WIDE_VIEWPORT,
  clearSidebarStateCookie,
  resetViewport,
  setViewportWidth,
} from '../../helpers/viewport';
import { arbolAccesible, nuncaResuelve, resolverServerComponents } from './arbol-accesible';

/**
 * Paridad de la lista de pedidos. Sus vacio, error y esqueleto locales se conservan y pasan a
 * delegar en las piezas compartidas: este snapshot es el que tienen que seguir dando. Mocks de
 * `tests/unit/pedidos-ui/pedidos-viewport.test.tsx`, con ids y fechas fijos.
 */

type CookieStoreStub = { get: (name: string) => { name: string; value: string } | undefined };

const USUARIO: SessionUser = {
  id: 'u-paridad',
  username: 'carla.duarte',
  displayName: 'Carla Duarte Salas',
  roleName: 'Administrador',
  permissions: PERMISSIONS.map((permiso) => permiso.code),
};

const { routerMock, cookiesMock, getSessionUserMock, listOrdersActionMock, listRecipesActionMock, listUnitsActionMock } =
  vi.hoisted(() => ({
    routerMock: {
      push: vi.fn<(href: string) => void>(),
      replace: vi.fn<(href: string) => void>(),
      refresh: vi.fn<() => void>(),
      back: vi.fn<() => void>(),
      forward: vi.fn<() => void>(),
      prefetch: vi.fn<(href: string) => void>(),
    },
    cookiesMock: vi.fn<() => Promise<CookieStoreStub>>(),
    getSessionUserMock: vi.fn(),
    listOrdersActionMock: vi.fn<(query: unknown) => Promise<OrderListResult>>(),
    listRecipesActionMock: vi.fn(),
    listUnitsActionMock: vi.fn(),
  }));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => ORDERS_ROUTE,
  useRouter: () => routerMock,
  redirect: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: cookiesMock }));

vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock, endSession: vi.fn() },
}));

vi.mock('@/lib/modules/identity/adapters/driving/work-group-actions', () => ({
  listWorkGroupsAction: vi.fn(async () => ({
    status: 'success' as const,
    data: { items: [], total: 0, page: 1, pageSize: 25, totalPages: 1 },
  })),
}));

vi.mock('@/lib/modules/asignaciones/adapters/driving/order-assignment-actions', () => ({
  assignResponsiblesAction: vi.fn(),
  unassignResponsibleAction: vi.fn(),
  removeWorkGroupFromOrderAction: vi.fn(),
  listOrderResponsiblesAction: vi.fn(),
  listResponsiblesForOrdersAction: vi.fn(async () => ({ status: 'success', data: [] })),
  listResponsibleCandidatesAction: vi.fn(async () => ({ status: 'success', data: [] })),
}));

vi.mock('@/lib/modules/pedidos/adapters/driving/order-actions', () => ({
  listOrdersAction: listOrdersActionMock,
  createOrderAction: vi.fn(),
  updateOrderAction: vi.fn(),
  cancelOrderAction: vi.fn(),
  deleteOrderAction: vi.fn(),
  getOrderAction: vi.fn(),
  getOrderCustomerFilterOptionAction: vi.fn(),
  listOrderCoverageAction: vi.fn(async () => ({ status: 'success', data: [] })),
  quoteOrderCostAction: vi.fn(async () => ({ status: 'success', data: { ingredientsCost: null } })),
}));

vi.mock('@/lib/modules/recetas/adapters/driving/recipe-actions', () => ({
  listRecipeVersionsAction: vi.fn(async () => ({ status: 'success' as const, data: [] })),
  listRecipesAction: listRecipesActionMock,
  getRecipeAction: vi.fn(async () => ({
    status: 'success' as const,
    data: {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Esmalte azul',
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
      displayName: 'Esmalte azul',
    },
  })),
}));

vi.mock('@/lib/modules/unidades/adapters/driving/unit-actions', () => ({
  listUnitsAction: listUnitsActionMock,
  getMassVolumeBridgeAction: vi.fn(async () => ({ status: 'success', data: null })),
}));

vi.mock('@/lib/modules/inventario/adapters/driving/presentation-actions', () => ({
  listPresentationsAction: vi.fn(async () => ({
    status: 'success' as const,
    data: { items: [], page: 1, pageSize: 25, total: 0, totalPages: 1 },
  })),
  createPresentationAction: vi.fn(),
}));

vi.mock('@/lib/modules/inventario/adapters/driving/product-actions', () => ({
  listProductsAction: vi.fn(async () => ({
    status: 'success' as const,
    data: { items: [], page: 1, pageSize: 25, total: 0, totalPages: 1 },
  })),
}));

const RECETA = { id: '11111111-1111-4111-8111-111111111111', name: 'Esmalte azul', imageUrl: null };

const UNIDAD: UnitView = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Kilogramo',
  symbol: 'kg',
  baseUnitId: null,
  factor: null,
  isSystem: true,
};

function pedido(overrides: Partial<OrderSummary> = {}): OrderSummary {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    number: { year: 2026, sequence: 42 },
    numberText: formatOrderNumber({ year: 2026, sequence: 42 }),
    recipeId: RECETA.id,
    recipeName: RECETA.name,
    recipeVersion: null,
    quantity: '12.5000',
    priority: 'MEDIA',
    status: 'PENDIENTE',
    cancellationReason: null,
    ingredientsCost: null,
    createdAt: new Date('2026-01-15T10:00:00.000Z'),
    updatedAt: new Date('2026-01-15T10:00:00.000Z'),
    createdBy: null,
    updatedBy: null,
    presentationLines: [
      {
        presentationId: '44444444-4444-4444-8444-444444444444',
        presentationName: 'Bidón 20L',
        packages: 1,
        packagingProductId: null,
        packagingName: null,
      },
    ],
    unitId: null,
    unitLabel: null,
    customer: null,
    ...overrides,
  };
}

function paginaDePedidos(items: readonly OrderSummary[], page = 1): OrderListResult {
  return {
    status: 'success',
    data: {
      items,
      total: items.length,
      page,
      pageSize: DEFAULT_PAGE_SIZE,
      totalPages: Math.max(1, Math.ceil(items.length / DEFAULT_PAGE_SIZE)),
    },
  };
}

const ERROR_DE_CATALOGO: ErrorState = {
  status: 'error',
  code: 'unauthorized',
  message: errorMessage('unauthorized'),
};

type Consulta = Record<string, string | undefined>;

async function renderPantalla(consulta: Consulta = {}) {
  const arbol = await PedidosPage({ searchParams: Promise.resolve(consulta) });
  return render(<>{await resolverServerComponents(arbol)}</>);
}

async function renderCargando(consulta: Consulta = {}) {
  listOrdersActionMock.mockReturnValue(nuncaResuelve());
  const arbol = await PedidosPage({ searchParams: Promise.resolve(consulta) });
  return render(<>{arbol}</>);
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUserMock.mockResolvedValue(USUARIO);
  cookiesMock.mockResolvedValue({ get: () => undefined });
  listRecipesActionMock.mockResolvedValue({
    status: 'success',
    data: { items: [RECETA], total: 1, page: 1, pageSize: 100, totalPages: 1 },
  });
  listUnitsActionMock.mockResolvedValue({ status: 'success', data: [UNIDAD] });
  listOrdersActionMock.mockResolvedValue(
    paginaDePedidos([
      pedido(),
      pedido({
        id: '55555555-5555-4555-8555-555555555555',
        number: { year: 2026, sequence: 43 },
        numberText: formatOrderNumber({ year: 2026, sequence: 43 }),
        status: 'CANCELADO',
        cancellationReason: 'El cliente anulo el encargo.',
      }),
    ]),
  );
  clearSidebarStateCookie();
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(() => {
  cleanup();
  resetViewport();
  clearSidebarStateCookie();
});

describe('paridad de pedidos', () => {
  it('R1 R16-R18 — con filas', async () => {
    await renderPantalla();
    expect(screen.getByTestId('order-list')).toBeInTheDocument();
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R16 R20 — cargando, con tantas filas como el tamano de pagina', async () => {
    await renderCargando({ pageSize: '10' });
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R18 R20 — vacio, sin busqueda', async () => {
    listOrdersActionMock.mockResolvedValue(paginaDePedidos([]));
    await renderPantalla();
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R18 R20 — vacio en una pagina posterior, con la vuelta a la primera', async () => {
    listOrdersActionMock.mockResolvedValue(paginaDePedidos([], 3));
    await renderPantalla({ page: '3' });
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R18 — sin resultados, con busqueda activa', async () => {
    listOrdersActionMock.mockResolvedValue(paginaDePedidos([]));
    await renderPantalla({ q: 'inexistente' });
    expect(screen.getByTestId('order-list')).toBeInTheDocument();
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R2 R17 R20 — error de catalogo, y «Reintentar» hace lo de hoy', async () => {
    listOrdersActionMock.mockResolvedValue(ERROR_DE_CATALOGO);
    await renderPantalla();
    expect(arbolAccesible()).toMatchSnapshot();
    const reintentar = screen.getByRole('button', { name: 'Reintentar' });
    fireEvent.click(reintentar);
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
  });

  it('R1 R17 R20 — error inesperado, con su identificador', async () => {
    listOrdersActionMock.mockResolvedValue(errorInesperado());
    await renderPantalla();
    expect(arbolAccesible()).toMatchSnapshot();
  });
});
