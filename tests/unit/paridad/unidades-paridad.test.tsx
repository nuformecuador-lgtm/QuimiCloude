import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import UnidadesPage from '@/app/(private)/configuracion/unidades/page';
import { errorMessage, type ErrorState } from '@/lib/modules/errores';
import { PERMISSIONS } from '@/lib/modules/identity';
import type { UnitView } from '@/lib/modules/unidades';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';

import { errorInesperado } from '../../helpers/identificador-de-request';
import { WIDE_VIEWPORT, resetViewport, setViewportWidth } from '../../helpers/viewport';
import { arbolAccesible, nuncaResuelve, resolverServerComponents } from './arbol-accesible';

/**
 * Paridad de la lista de unidades. `listUnitsAction` responde a dos consultas: sin argumentos es
 * el catalogo entero, con parametros es la pagina. Mocks de
 * `tests/unit/configuracion-ui/unit-page.test.tsx`.
 */

const { routerMock, getSessionUserMock, listUnitsActionMock } = vi.hoisted(() => ({
  routerMock: {
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    refresh: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
  getSessionUserMock: vi.fn(),
  listUnitsActionMock: vi.fn<(query?: unknown) => Promise<unknown>>(),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => '/configuracion/unidades',
  useRouter: () => routerMock,
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock, endSession: vi.fn() },
}));

vi.mock('@/lib/modules/unidades/adapters/driving/unit-actions', () => ({
  listUnitsAction: listUnitsActionMock,
  createUnitAction: vi.fn(),
  updateUnitAction: vi.fn(),
  deleteUnitAction: vi.fn(),
}));

const KILOGRAMO: UnitView = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Kilogramo',
  symbol: 'kg',
  baseUnitId: null,
  factor: null,
  isSystem: true,
};

const GRAMO: UnitView = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Gramo',
  symbol: 'g',
  baseUnitId: KILOGRAMO.id,
  factor: '0.001',
  isSystem: false,
};

const CATALOGO = { status: 'success', data: [KILOGRAMO, GRAMO] };

function pagina(items: readonly UnitView[], page = 1) {
  return {
    status: 'success',
    data: { items, total: items.length, page, pageSize: DEFAULT_PAGE_SIZE, totalPages: 1 },
  };
}

function conPagina(resultado: unknown) {
  listUnitsActionMock.mockImplementation(async (query?: unknown) =>
    query === undefined ? CATALOGO : resultado,
  );
}

const ERROR_DE_CATALOGO: ErrorState = {
  status: 'error',
  code: 'unauthorized',
  message: errorMessage('unauthorized'),
};

type Consulta = Record<string, string | undefined>;

async function renderPantalla(consulta: Consulta = {}) {
  const arbol = await UnidadesPage({ searchParams: Promise.resolve(consulta) });
  return render(<>{await resolverServerComponents(arbol)}</>);
}

async function renderCargando(consulta: Consulta = {}) {
  listUnitsActionMock.mockImplementation((query?: unknown) =>
    query === undefined ? Promise.resolve(CATALOGO) : nuncaResuelve(),
  );
  const arbol = await UnidadesPage({ searchParams: Promise.resolve(consulta) });
  return render(<>{arbol}</>);
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUserMock.mockResolvedValue({
    id: 'u-paridad',
    username: 'carla.duarte',
    displayName: 'Carla Duarte Salas',
    roleName: 'Administrador',
    permissions: PERMISSIONS.map((permiso) => permiso.code),
  });
  conPagina(pagina([KILOGRAMO, GRAMO]));
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(() => {
  cleanup();
  resetViewport();
});

describe('paridad de unidades', () => {
  it('R1 R16-R18 — con filas', async () => {
    await renderPantalla();
    expect(screen.getByTestId('unit-list')).toBeInTheDocument();
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R16 — cargando, con tantas filas como el tamano de pagina', async () => {
    await renderCargando({ pageSize: '10' });
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R18 — vacio, sin busqueda', async () => {
    conPagina(pagina([]));
    await renderPantalla();
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R18 — vacio en una pagina posterior, con la vuelta a la primera', async () => {
    conPagina(pagina([], 3));
    await renderPantalla({ page: '3' });
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R18 — sin resultados, con busqueda activa', async () => {
    conPagina(pagina([]));
    await renderPantalla({ q: 'inexistente' });
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R2 R17 — error de catalogo, y «Reintentar» hace lo de hoy', async () => {
    conPagina(ERROR_DE_CATALOGO);
    await renderPantalla();
    expect(arbolAccesible()).toMatchSnapshot();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
  });

  it('R1 R17 — error inesperado, con su identificador', async () => {
    conPagina(errorInesperado());
    await renderPantalla();
    expect(arbolAccesible()).toMatchSnapshot();
  });
});
