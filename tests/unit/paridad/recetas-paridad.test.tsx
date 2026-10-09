import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import FormulasPage from '@/app/(private)/produccion/formulas/page';
import EditarRecetaPage from '@/app/(private)/produccion/formulas/[id]/page';
import NuevaRecetaPage from '@/app/(private)/produccion/formulas/nueva/page';
import NuevaVersionPage from '@/app/(private)/produccion/formulas/[id]/versiones/nueva/page';
import EditarVersionPage from '@/app/(private)/produccion/formulas/[id]/versiones/[versionId]/page';
import { errorMessage, type ErrorState } from '@/lib/modules/errores';
import { PERMISSIONS, type SessionUser } from '@/lib/modules/identity';
import type { RecipeSummary } from '@/lib/modules/recetas';
import type { RecipeListResult } from '@/lib/modules/recetas/adapters/driving/recipe-actions';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';
import { FORMULAS_ROUTE } from '@/lib/shared/routes';

import { errorInesperado } from '../../helpers/identificador-de-request';
import {
  WIDE_VIEWPORT,
  clearSidebarStateCookie,
  resetViewport,
  setViewportWidth,
} from '../../helpers/viewport';
import { arbolAccesible, nuncaResuelve, resolverServerComponents } from './arbol-accesible';

/**
 * Paridad de formulas: la lista con sus estados y las cuatro paginas de formulario en su estado
 * de error (`recipe-list-error*`). Mocks de `tests/unit/recetas-ui/recipe-page.test.tsx` y
 * `recipe-version-pages.test.tsx`, con ids y fechas fijos.
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
  listRecipesActionMock,
  getRecipeActionMock,
  listRecipeVersionsActionMock,
  listProductsActionMock,
  listUnitsActionMock,
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
  listRecipesActionMock: vi.fn<(query: unknown) => Promise<RecipeListResult>>(),
  getRecipeActionMock: vi.fn(),
  listRecipeVersionsActionMock: vi.fn(),
  listProductsActionMock: vi.fn(),
  listUnitsActionMock: vi.fn(),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => FORMULAS_ROUTE,
  useRouter: () => routerMock,
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: cookiesMock }));

vi.mock('@/lib/composition', () => ({
  observabilidad: { readRequestIdHeader: vi.fn(async () => null) },
  identity: { getSessionUser: getSessionUserMock, endSession: vi.fn() },
}));

vi.mock('@/lib/modules/recetas/adapters/driving/recipe-actions', () => ({
  listRecipesAction: listRecipesActionMock,
  getRecipeAction: getRecipeActionMock,
  deleteRecipeAction: vi.fn(),
  listRecipeVersionsAction: listRecipeVersionsActionMock,
  createRecipeVersionAction: vi.fn(),
  updateRecipeVersionAction: vi.fn(),
}));

vi.mock('@/lib/modules/inventario/adapters/driving/product-actions', () => ({
  listProductsAction: listProductsActionMock,
}));

vi.mock('@/lib/modules/unidades/adapters/driving/unit-actions', () => ({
  listUnitsAction: listUnitsActionMock,
}));

const ORIGINAL_ID = '11111111-1111-4111-8111-111111111111';
const VERSION_ID = '22222222-2222-4222-8222-222222222222';

function receta(overrides: Partial<RecipeSummary> = {}): RecipeSummary {
  return {
    id: 'receta-a',
    name: 'Detergente industrial',
    description: 'Descripcion',
    imageUrl: 'https://storage.example.com/recetas/detergente.png',
    stepCount: 3,
    createdAt: new Date('2026-01-15T10:20:30.000Z'),
    updatedAt: new Date('2026-02-20T08:00:00.000Z'),
    createdBy: null,
    updatedBy: null,
    ...overrides,
  };
}

function paginaDeRecetas(items: readonly RecipeSummary[], page = 1): RecipeListResult {
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

async function renderLista(consulta: Consulta = {}) {
  const arbol = await FormulasPage({ searchParams: Promise.resolve(consulta) });
  return render(<>{await resolverServerComponents(arbol)}</>);
}

async function renderListaCargando(consulta: Consulta = {}) {
  listRecipesActionMock.mockReturnValue(nuncaResuelve());
  const arbol = await FormulasPage({ searchParams: Promise.resolve(consulta) });
  return render(<>{arbol}</>);
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUserMock.mockResolvedValue(USUARIO);
  cookiesMock.mockResolvedValue({ get: () => undefined });
  listRecipesActionMock.mockResolvedValue(
    paginaDeRecetas([
      receta({ id: 'receta-a', name: 'Amoniaco' }),
      receta({ id: 'receta-b', name: 'Borax', imageUrl: null }),
    ]),
  );
  listRecipeVersionsActionMock.mockResolvedValue({ status: 'success', data: [] });
  listProductsActionMock.mockResolvedValue({
    status: 'success',
    data: { items: [], total: 0, page: 1, pageSize: 100, totalPages: 1 },
  });
  listUnitsActionMock.mockResolvedValue({ status: 'success', data: [] });
  clearSidebarStateCookie();
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(() => {
  cleanup();
  resetViewport();
  clearSidebarStateCookie();
});

describe('paridad de formulas — lista', () => {
  it('R1 R16-R18 — con filas', async () => {
    await renderLista();
    expect(screen.getByTestId('recipe-list')).toBeInTheDocument();
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R16 — cargando, con tantas filas como el tamano de pagina', async () => {
    await renderListaCargando({ pageSize: '10' });
    expect(screen.getByTestId('recipe-table-skeleton')).toBeInTheDocument();
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R18 — vacio, sin busqueda ni filtro', async () => {
    listRecipesActionMock.mockResolvedValue(paginaDeRecetas([]));
    await renderLista();
    expect(screen.getByTestId('recipe-list-empty')).toBeInTheDocument();
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R18 — vacio en una pagina posterior, con la vuelta a la primera', async () => {
    listRecipesActionMock.mockResolvedValue(paginaDeRecetas([], 3));
    await renderLista({ page: '3' });
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R18 — sin resultados, con busqueda activa', async () => {
    listRecipesActionMock.mockResolvedValue(paginaDeRecetas([]));
    await renderLista({ q: 'inexistente' });
    expect(screen.getByTestId('data-table')).toBeInTheDocument();
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R2 R17 — error de catalogo, y «Reintentar» vuelve a pedir la pagina', async () => {
    listRecipesActionMock.mockResolvedValue(ERROR_DE_CATALOGO);
    await renderLista();
    expect(arbolAccesible()).toMatchSnapshot();
    fireEvent.click(screen.getByTestId('recipe-list-retry'));
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
  });

  it('R1 R17 — error inesperado, con su identificador', async () => {
    listRecipesActionMock.mockResolvedValue(errorInesperado());
    await renderLista();
    expect(arbolAccesible()).toMatchSnapshot();
  });
});

const ERRORES: readonly (readonly [string, () => ErrorState])[] = [
  ['error de catalogo', () => ERROR_DE_CATALOGO],
  ['error inesperado', errorInesperado],
];

describe('paridad de formulas — paginas de formulario sin tabla (R20)', () => {
  it.each(ERRORES)('R1 R20 — nueva formula, %s', async (_nombre, error) => {
    listUnitsActionMock.mockResolvedValue(error());
    render(<>{await NuevaRecetaPage()}</>);
    expect(screen.getByTestId('recipe-list-error')).toBeInTheDocument();
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it.each(ERRORES)('R1 R20 — editar formula, %s', async (_nombre, error) => {
    getRecipeActionMock.mockResolvedValue(error());
    render(<>{await EditarRecetaPage({ params: Promise.resolve({ id: ORIGINAL_ID }) })}</>);
    expect(screen.getByTestId('recipe-list-error')).toBeInTheDocument();
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it.each(ERRORES)('R1 R20 — nueva version, %s', async (_nombre, error) => {
    getRecipeActionMock.mockResolvedValue(error());
    render(<>{await NuevaVersionPage({ params: Promise.resolve({ id: ORIGINAL_ID }) })}</>);
    expect(screen.getByTestId('recipe-list-error')).toBeInTheDocument();
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it.each(ERRORES)('R1 R20 — editar version, %s', async (_nombre, error) => {
    getRecipeActionMock.mockResolvedValue(error());
    render(
      <>
        {await EditarVersionPage({
          params: Promise.resolve({ id: ORIGINAL_ID, versionId: VERSION_ID }),
        })}
      </>,
    );
    expect(screen.getByTestId('recipe-list-error')).toBeInTheDocument();
    expect(arbolAccesible()).toMatchSnapshot();
  });
});
