import { cleanup, render, screen } from '@testing-library/react';

import ClientesPage from '@/app/(private)/clientes/page';
import type { CustomerView } from '@/lib/modules/clientes';
import { errorMessage, type ErrorState } from '@/lib/modules/errores';
import { PERMISSIONS } from '@/lib/modules/identity';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';
import { CUSTOMERS_ROUTE } from '@/lib/shared/routes';

import { errorInesperado } from '../../helpers/identificador-de-request';
import { WIDE_VIEWPORT, resetViewport, setViewportWidth } from '../../helpers/viewport';
import { arbolAccesible, nuncaResuelve, resolverServerComponents } from './arbol-accesible';

/**
 * Paridad de la lista de clientes, con su reintento por enlace. Mocks de
 * `tests/unit/clientes-ui/clientes-page.test.tsx`.
 */

const { getSessionUserMock, listCustomersActionMock, routerMock } = vi.hoisted(() => ({
  getSessionUserMock: vi.fn<() => Promise<unknown>>(),
  listCustomersActionMock: vi.fn<(query: unknown) => Promise<unknown>>(),
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
  usePathname: () => CUSTOMERS_ROUTE,
  useRouter: () => routerMock,
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock },
}));

vi.mock('@/lib/modules/clientes/adapters/driving/customer-actions', () => ({
  listCustomersAction: listCustomersActionMock,
  getCustomerAction: vi.fn(),
  createCustomerAction: vi.fn(),
  updateCustomerAction: vi.fn(),
  deleteCustomerAction: vi.fn(),
}));

const SESION = {
  id: '99999999-9999-4999-8999-999999999999',
  username: 'admin.prueba',
  displayName: 'Admin De Prueba',
  roleName: 'Administrador',
  permissions: PERMISSIONS.map((permiso) => permiso.code),
};

const CLIENTE: CustomerView = {
  id: '11111111-1111-4111-8111-111111111111',
  firstNames: 'Ana',
  lastNames: 'Lopez',
  city: 'Bogota',
  phone: '3001234567',
  email: null,
  address: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  createdBy: null,
  updatedBy: null,
};

function pagina(items: readonly CustomerView[], page = 1) {
  return {
    status: 'success',
    data: { items, total: items.length, page, pageSize: DEFAULT_PAGE_SIZE, totalPages: 1 },
  };
}

const ERROR_DE_CATALOGO: ErrorState = {
  status: 'error',
  code: 'unauthorized',
  message: errorMessage('unauthorized'),
};

type Consulta = Record<string, string | undefined>;

async function renderPantalla(consulta: Consulta = {}) {
  const arbol = await ClientesPage({ searchParams: Promise.resolve(consulta) });
  return render(<>{await resolverServerComponents(arbol)}</>);
}

async function renderCargando(consulta: Consulta = {}) {
  listCustomersActionMock.mockReturnValue(nuncaResuelve());
  const arbol = await ClientesPage({ searchParams: Promise.resolve(consulta) });
  return render(<>{arbol}</>);
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUserMock.mockResolvedValue(SESION);
  listCustomersActionMock.mockResolvedValue(pagina([CLIENTE]));
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(() => {
  cleanup();
  resetViewport();
});

describe('paridad de clientes', () => {
  it('R1 R16-R18 — con filas', async () => {
    await renderPantalla();
    expect(screen.getByTestId('data-table')).toBeInTheDocument();
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R16 — cargando, con tantas filas como el tamano de pagina', async () => {
    await renderCargando({ pageSize: '10' });
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R18 — vacio, sin busqueda ni filtro', async () => {
    listCustomersActionMock.mockResolvedValue(pagina([]));
    await renderPantalla();
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R18 — vacio en una pagina posterior, con la vuelta a la primera', async () => {
    listCustomersActionMock.mockResolvedValue(pagina([], 3));
    await renderPantalla({ page: '3' });
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R18 — sin resultados, con busqueda activa', async () => {
    listCustomersActionMock.mockResolvedValue(pagina([]));
    await renderPantalla({ q: 'inexistente' });
    expect(screen.getByTestId('data-table')).toBeInTheDocument();
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R18 — sin resultados en una pagina posterior, con busqueda activa', async () => {
    listCustomersActionMock.mockResolvedValue(pagina([], 3));
    await renderPantalla({ q: 'inexistente', page: '3' });
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R2 R17 — error de catalogo, con el reintento por enlace a la misma consulta', async () => {
    listCustomersActionMock.mockResolvedValue(ERROR_DE_CATALOGO);
    await renderPantalla({ q: 'ana', page: '2' });
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R17 — error inesperado, con su identificador', async () => {
    listCustomersActionMock.mockResolvedValue(errorInesperado());
    await renderPantalla();
    expect(arbolAccesible()).toMatchSnapshot();
  });
});
