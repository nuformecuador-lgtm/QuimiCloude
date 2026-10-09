import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import InventarioPage from '@/app/(private)/inventario/page';
import { errorMessage } from '@/lib/modules/errores';
import { PERMISSIONS, type SessionUser } from '@/lib/modules/identity';
import { PRODUCT_TYPES, type FinishedStockRow, type ProductView } from '@/lib/modules/inventario';
import type {
  FinishedStockListResult,
  ProductListResult,
} from '@/lib/modules/inventario/adapters/driving/product-actions';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';
import { INVENTORY_ROUTE } from '@/lib/shared/routes';

import { errorInesperado } from '../../helpers/identificador-de-request';
import {
  WIDE_VIEWPORT,
  clearSidebarStateCookie,
  resetViewport,
  setViewportWidth,
} from '../../helpers/viewport';
import { arbolAccesible, nuncaResuelve, resolverServerComponents } from './arbol-accesible';

/**
 * Paridad de la pantalla de inventario (productos y producto terminado): congela el arbol
 * accesible de cada estado de la lista antes de que la tabla pinte sus propios estados. Los
 * mocks son los de `tests/unit/inventario/product-page.test.tsx`, con ids y fechas fijos.
 */

type CookieStoreStub = { get: (name: string) => { name: string; value: string } | undefined };

const USUARIO: SessionUser = {
  id: 'u-paridad',
  username: 'carla.duarte',
  displayName: 'Carla Duarte Salas',
  roleName: 'Administrador',
  permissions: PERMISSIONS.map((permiso) => permiso.code),
};

const {
  routerMock,
  cookiesMock,
  getSessionUserMock,
  listProductsActionMock,
  listFinishedStockActionMock,
  listUnitsActionMock,
  listProductFormUnitsActionMock,
} = vi.hoisted(() => ({
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
  listProductsActionMock: vi.fn<(query: unknown) => Promise<ProductListResult>>(),
  listFinishedStockActionMock: vi.fn<(query: unknown) => Promise<FinishedStockListResult>>(),
  listUnitsActionMock: vi.fn(),
  listProductFormUnitsActionMock: vi.fn(),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => INVENTORY_ROUTE,
  useRouter: () => routerMock,
  redirect: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: cookiesMock }));

vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock, endSession: vi.fn() },
}));

vi.mock('@/lib/modules/inventario/adapters/driving/product-actions', () => ({
  listProductsAction: listProductsActionMock,
  listFinishedStockAction: listFinishedStockActionMock,
  createProductAction: vi.fn(),
  updateProductAction: vi.fn(),
  deleteProductAction: vi.fn(),
  listProductFormUnitsAction: listProductFormUnitsActionMock,
}));

vi.mock('@/lib/modules/inventario/adapters/driving/presentation-actions', () => ({
  listPresentationsAction: vi.fn(),
  createPresentationAction: vi.fn(),
}));

vi.mock('@/lib/modules/unidades/adapters/driving/unit-actions', () => ({
  listUnitsAction: listUnitsActionMock,
}));

vi.mock('@/lib/modules/inventario/adapters/driving/batch-actions', () => ({
  listProductBatchesAction: vi.fn(),
  listOrderBatchesAction: vi.fn(),
  listBatchMovementsAction: vi.fn(),
  adjustBatchStockAction: vi.fn(),
}));

const UNIDAD = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Litro',
  symbol: 'L',
  baseUnitId: null,
  factor: null,
  isSystem: true,
};

function producto(overrides: Partial<ProductView> = {}): ProductView {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Hidróxido de sodio',
    imagePath: null,
    stock: '12',
    unitId: UNIDAD.id,
    qtyAlert: '5',
    type: PRODUCT_TYPES.PRODUCT,
    createdAt: new Date('2026-01-15T10:20:30.000Z'),
    updatedAt: new Date('2026-02-20T08:00:00.000Z'),
    ...overrides,
  };
}

function pagina<T>(items: readonly T[], page = 1) {
  return {
    status: 'success' as const,
    data: {
      items,
      total: items.length,
      page,
      pageSize: DEFAULT_PAGE_SIZE,
      totalPages: Math.max(1, Math.ceil(items.length / DEFAULT_PAGE_SIZE)),
    },
  };
}

function filaTerminada(): FinishedStockRow {
  const terminado = producto({
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Desengrasante 5 L',
    type: PRODUCT_TYPES.FINISHED_PRODUCT,
  });
  return {
    kind: 'order',
    key: 'order-1',
    orderId: 'order-1',
    orderNumber: { year: 2026, sequence: 1 },
    numberText: '2026-0001',
    recipeName: 'Desengrasante industrial',
    packagedStock: null,
    products: [{ product: terminado, stock: terminado.stock, packagedStock: null }],
  };
}

const ERROR_DE_CATALOGO = {
  status: 'error' as const,
  code: 'invalid_input' as const,
  message: errorMessage('invalid_input'),
};

type Consulta = Record<string, string | undefined>;

async function renderPantalla(consulta: Consulta = {}) {
  const arbol = await InventarioPage({ searchParams: Promise.resolve(consulta) });
  return render(<>{await resolverServerComponents(arbol)}</>);
}

async function renderCargando(consulta: Consulta = {}) {
  listProductsActionMock.mockReturnValue(nuncaResuelve());
  listFinishedStockActionMock.mockReturnValue(nuncaResuelve());
  const arbol = await InventarioPage({ searchParams: Promise.resolve(consulta) });
  return render(<>{arbol}</>);
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUserMock.mockResolvedValue(USUARIO);
  cookiesMock.mockResolvedValue({ get: () => undefined });
  listUnitsActionMock.mockResolvedValue({ status: 'success', data: [UNIDAD] });
  listProductFormUnitsActionMock.mockResolvedValue({ status: 'success', data: [UNIDAD] });
  listProductsActionMock.mockResolvedValue(pagina([producto()]));
  listFinishedStockActionMock.mockResolvedValue(pagina([filaTerminada()]));
  clearSidebarStateCookie();
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(() => {
  cleanup();
  resetViewport();
  clearSidebarStateCookie();
});

describe('paridad de inventario — productos', () => {
  it('R1 R16-R18 — con filas', async () => {
    await renderPantalla();
    expect(screen.getByTestId('product-list')).toBeInTheDocument();
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R16 — cargando, con tantas filas como el tamano de pagina', async () => {
    await renderCargando({ pageSize: '10' });
    expect(screen.getByTestId('product-table-skeleton')).toBeInTheDocument();
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R18 — vacio, sin busqueda ni filtro', async () => {
    listProductsActionMock.mockResolvedValue(pagina<ProductView>([]));
    await renderPantalla();
    expect(screen.getByTestId('product-list-empty')).toBeInTheDocument();
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R18 — vacio en una pagina posterior, con la vuelta a la primera', async () => {
    listProductsActionMock.mockResolvedValue(pagina<ProductView>([], 3));
    await renderPantalla({ page: '3' });
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R18 — sin resultados, con busqueda activa', async () => {
    listProductsActionMock.mockResolvedValue(pagina<ProductView>([]));
    await renderPantalla({ q: 'inexistente' });
    expect(screen.getByTestId('data-table')).toBeInTheDocument();
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R2 R17 — error de catalogo, y «Reintentar» vuelve a pedir la pagina', async () => {
    listProductsActionMock.mockResolvedValue(ERROR_DE_CATALOGO);
    await renderPantalla();
    expect(arbolAccesible()).toMatchSnapshot();
    fireEvent.click(screen.getByTestId('product-list-retry'));
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
  });

  it('R1 R17 — error inesperado, con su identificador', async () => {
    listProductsActionMock.mockResolvedValue(errorInesperado());
    await renderPantalla();
    expect(arbolAccesible()).toMatchSnapshot();
  });
});

describe('paridad de inventario — producto terminado', () => {
  const TERMINADO = { type: PRODUCT_TYPES.FINISHED_PRODUCT };

  it('R1 R16-R18 — con filas', async () => {
    await renderPantalla(TERMINADO);
    expect(screen.getByTestId('product-list')).toBeInTheDocument();
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R16 — cargando', async () => {
    await renderCargando({ ...TERMINADO, pageSize: '10' });
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R18 — vacio', async () => {
    listFinishedStockActionMock.mockResolvedValue(pagina<FinishedStockRow>([]));
    await renderPantalla(TERMINADO);
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R18 — sin resultados, con busqueda activa', async () => {
    listFinishedStockActionMock.mockResolvedValue(pagina<FinishedStockRow>([]));
    await renderPantalla({ ...TERMINADO, q: 'inexistente' });
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R17 — error de catalogo', async () => {
    listFinishedStockActionMock.mockResolvedValue(ERROR_DE_CATALOGO);
    await renderPantalla(TERMINADO);
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R17 — error inesperado', async () => {
    listFinishedStockActionMock.mockResolvedValue(errorInesperado());
    await renderPantalla(TERMINADO);
    expect(arbolAccesible()).toMatchSnapshot();
  });
});
