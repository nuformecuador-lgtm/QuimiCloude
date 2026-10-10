import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import PresentacionesPage from '@/app/(private)/configuracion/presentaciones/page';
import { errorMessage, type ErrorState } from '@/lib/modules/errores';
import type { PresentationView } from '@/lib/modules/inventario';
import type { PresentationListResult } from '@/lib/modules/inventario/adapters/driving/presentation-actions';
import type { UnitView } from '@/lib/modules/unidades';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';

import { errorInesperado } from '../../helpers/identificador-de-request';
import { WIDE_VIEWPORT, resetViewport, setViewportWidth } from '../../helpers/viewport';
import { arbolAccesible, nuncaResuelve, resolverServerComponents } from './arbol-accesible';

/**
 * Paridad de la lista de presentaciones, con el error previo de pagina (las unidades). Mocks de
 * `tests/unit/configuracion-ui/presentation-page.test.tsx`.
 */

const { routerMock, getSessionUserMock, listPresentationsActionMock, listUnitsActionMock } =
  vi.hoisted(() => ({
    routerMock: {
      push: vi.fn<(href: string) => void>(),
      replace: vi.fn<(href: string) => void>(),
      refresh: vi.fn<() => void>(),
      back: vi.fn<() => void>(),
      forward: vi.fn<() => void>(),
      prefetch: vi.fn<(href: string) => void>(),
    },
    getSessionUserMock: vi.fn(),
    listPresentationsActionMock: vi.fn<(query: unknown) => Promise<PresentationListResult>>(),
    listUnitsActionMock: vi.fn(),
  }));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => '/configuracion/presentaciones',
  useRouter: () => routerMock,
}));

vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock, endSession: vi.fn() },
}));

vi.mock('@/lib/modules/inventario/adapters/driving/presentation-actions', () => ({
  listPresentationsAction: listPresentationsActionMock,
  createPresentationAction: vi.fn(),
  updatePresentationAction: vi.fn(),
  deletePresentationAction: vi.fn(),
}));

vi.mock('@/lib/modules/unidades/adapters/driving/unit-actions', () => ({
  listUnitsAction: listUnitsActionMock,
}));

const UNIDADES: readonly UnitView[] = [
  {
    id: '44444444-4444-4444-8444-444444444444',
    name: 'Kilogramo',
    symbol: 'kg',
    baseUnitId: null,
    factor: null,
    isSystem: true,
  },
];

const PRESENTACION: PresentationView = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Bidón 20 L',
  nameNormalized: 'bidon 20 l',
  unitId: '44444444-4444-4444-8444-444444444444',
  content: '20',
  createdAt: new Date('2026-01-15T10:00:00.000Z'),
  updatedAt: new Date('2026-01-15T10:00:00.000Z'),
};

function pagina(items: readonly PresentationView[], page = 1): PresentationListResult {
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
  const arbol = await PresentacionesPage({ searchParams: Promise.resolve(consulta) });
  return render(<>{await resolverServerComponents(arbol)}</>);
}

async function renderCargando(consulta: Consulta = {}) {
  listPresentationsActionMock.mockReturnValue(nuncaResuelve());
  const arbol = await PresentacionesPage({ searchParams: Promise.resolve(consulta) });
  return render(<>{arbol}</>);
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUserMock.mockResolvedValue({
    id: '99999999-9999-4999-8999-999999999999',
    username: 'admin.prueba',
    displayName: 'Admin De Prueba',
    roleName: 'Administrador',
    permissions: ['inventario.consultar', 'inventario.modificar'],
  });
  listPresentationsActionMock.mockResolvedValue(pagina([PRESENTACION]));
  listUnitsActionMock.mockResolvedValue({ status: 'success', data: UNIDADES });
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(() => {
  cleanup();
  resetViewport();
});

describe('paridad de presentaciones', () => {
  it('R1 R16-R18 — con filas', async () => {
    await renderPantalla();
    expect(screen.getByTestId('presentation-list')).toBeInTheDocument();
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R16 — cargando, con tantas filas como el tamano de pagina', async () => {
    await renderCargando({ pageSize: '10' });
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R18 — vacio, sin busqueda', async () => {
    listPresentationsActionMock.mockResolvedValue(pagina([]));
    await renderPantalla();
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R18 — vacio en una pagina posterior, con la vuelta a la primera', async () => {
    listPresentationsActionMock.mockResolvedValue(pagina([], 3));
    await renderPantalla({ page: '3' });
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R18 — sin resultados, con busqueda activa', async () => {
    listPresentationsActionMock.mockResolvedValue(pagina([]));
    await renderPantalla({ q: 'inexistente' });
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R2 R17 — error de catalogo, y «Reintentar» hace lo de hoy', async () => {
    listPresentationsActionMock.mockResolvedValue(ERROR_DE_CATALOGO);
    await renderPantalla();
    expect(arbolAccesible()).toMatchSnapshot();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
  });

  it('R1 R17 — error inesperado, con su identificador', async () => {
    listPresentationsActionMock.mockResolvedValue(errorInesperado());
    await renderPantalla();
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R20 — error previo de pagina: las unidades fallan con un error de catalogo', async () => {
    listUnitsActionMock.mockResolvedValue(ERROR_DE_CATALOGO);
    await renderPantalla();
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R20 — error previo de pagina: las unidades fallan con el error inesperado', async () => {
    listUnitsActionMock.mockResolvedValue(errorInesperado());
    await renderPantalla();
    expect(arbolAccesible()).toMatchSnapshot();
  });
});
