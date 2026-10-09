import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  resetIntersectionMocking,
  setupIntersectionMocking,
} from 'react-intersection-observer/test-utils';

import ProveedoresPage from '@/app/(private)/proveedores/page';
import { errorMessage, type ErrorState } from '@/lib/modules/errores';
import { PERMISSIONS, type SessionUser } from '@/lib/modules/identity';
import type { ShowcasePage, ShowcaseRow } from '@/lib/modules/proveedores';
import type { SupplierShowcaseResult } from '@/lib/modules/proveedores/adapters/driving/supplier-actions';
import { SUPPLIERS_ROUTE } from '@/lib/shared/routes';

import { errorInesperado } from '../../helpers/identificador-de-request';
import {
  WIDE_VIEWPORT,
  clearSidebarStateCookie,
  resetViewport,
  setViewportWidth,
} from '../../helpers/viewport';
import { arbolAccesible, nuncaResuelve, resolverServerComponents } from './arbol-accesible';

/**
 * Paridad de la vitrina de proveedores, que no tiene `DataTable`: su vacio y su error pasan a
 * ser las piezas compartidas directas y su esqueleto se queda. Mocks de
 * `tests/unit/proveedores-ui/supplier-showcase-page.test.tsx`, con ids fijos.
 */

type CookieStoreStub = { get: (name: string) => { name: string; value: string } | undefined };

const USUARIO: SessionUser = {
  id: 'u-paridad',
  username: 'carla.duarte',
  displayName: 'Carla Duarte Salas',
  roleName: 'Administrador',
  permissions: PERMISSIONS.map((permiso) => permiso.code),
};

const { routerMock, cookiesMock, getSessionUserMock, listSupplierShowcaseActionMock } = vi.hoisted(
  () => ({
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
    listSupplierShowcaseActionMock: vi.fn<(query: unknown) => Promise<SupplierShowcaseResult>>(),
  }),
);

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => SUPPLIERS_ROUTE,
  useRouter: () => routerMock,
  redirect: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: cookiesMock }));

vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock, endSession: vi.fn() },
}));

vi.mock('@/lib/modules/proveedores/adapters/driving/supplier-actions', () => ({
  listSupplierShowcaseAction: listSupplierShowcaseActionMock,
  listShowcaseLinesAction: vi.fn(),
  createSupplierAction: vi.fn(),
  updateSupplierAction: vi.fn(),
}));

function fila(id: string, name: string): ShowcaseRow {
  return {
    id,
    name,
    lines: [{ id: `${id}-linea`, name: 'Ácido cítrico anhidro', imageUrl: null }],
    hasMoreLines: false,
  };
}

function exito(items: readonly ShowcaseRow[], hasMore = false): SupplierShowcaseResult {
  const pagina: ShowcasePage = { items, page: 1, hasMore };
  return { status: 'success', data: pagina };
}

const ERROR_DE_CATALOGO: ErrorState = {
  status: 'error',
  code: 'unauthorized',
  message: errorMessage('unauthorized'),
};

type Consulta = Record<string, string | undefined>;

async function renderPantalla(consulta: Consulta = {}) {
  const arbol = await ProveedoresPage({ searchParams: Promise.resolve(consulta) });
  return render(<>{await resolverServerComponents(arbol)}</>);
}

async function renderCargando() {
  listSupplierShowcaseActionMock.mockReturnValue(nuncaResuelve());
  const arbol = await ProveedoresPage({ searchParams: Promise.resolve({}) });
  return render(<>{arbol}</>);
}

beforeAll(() => {
  setupIntersectionMocking(vi.fn);
});

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUserMock.mockResolvedValue(USUARIO);
  cookiesMock.mockResolvedValue({ get: () => undefined });
  listSupplierShowcaseActionMock.mockResolvedValue(
    exito([
      fila('11111111-1111-4111-8111-111111111111', 'Químicos del Norte'),
      fila('22222222-2222-4222-8222-222222222222', 'Distribuidora Andina'),
    ]),
  );
  clearSidebarStateCookie();
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(() => {
  cleanup();
  resetIntersectionMocking();
  resetViewport();
  clearSidebarStateCookie();
});

describe('paridad de la vitrina de proveedores (R20)', () => {
  it('R1 — con filas', async () => {
    await renderPantalla();
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 — cargando, con el esqueleto propio de la vitrina', async () => {
    await renderCargando();
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R20 — vacio, sin filtro', async () => {
    listSupplierShowcaseActionMock.mockResolvedValue(exito([]));
    await renderPantalla();
    expect(screen.getByTestId('supplier-list-empty')).toBeInTheDocument();
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 — sin resultados, con filtro activo', async () => {
    listSupplierShowcaseActionMock.mockResolvedValue(exito([]));
    await renderPantalla({ supplier: 'inexistente' });
    expect(screen.getByTestId('supplier-showcase-no-results')).toBeInTheDocument();
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R2 R20 — error de catalogo, y «Reintentar» hace lo de hoy', async () => {
    listSupplierShowcaseActionMock.mockResolvedValue(ERROR_DE_CATALOGO);
    await renderPantalla();
    expect(screen.getByTestId('supplier-list-error')).toBeInTheDocument();
    expect(arbolAccesible()).toMatchSnapshot();
    const reintentar = screen.getByRole('button', { name: 'Reintentar' });
    fireEvent.click(reintentar);
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
  });

  it('R1 R20 — error inesperado, con su identificador', async () => {
    listSupplierShowcaseActionMock.mockResolvedValue(errorInesperado());
    await renderPantalla();
    expect(arbolAccesible()).toMatchSnapshot();
  });
});
