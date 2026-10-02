import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import NuevaVersionPage from '@/app/(private)/produccion/formulas/[id]/versiones/nueva/page';
import EditarVersionPage from '@/app/(private)/produccion/formulas/[id]/versiones/[versionId]/page';
import { errorMessage } from '@/lib/modules/errores';
import type { SessionUser } from '@/lib/modules/identity';
import type { RecipeDetail, RecipeLineView } from '@/lib/modules/recetas';
import type { RecipeQueryResult } from '@/lib/modules/recetas/adapters/driving/recipe-actions';
import type { ProductListResult } from '@/lib/modules/inventario/adapters/driving/product-actions';
import type { UnitListResult } from '@/lib/modules/unidades/adapters/driving/unit-actions';
import { MAX_PAGE_SIZE } from '@/lib/shared/pagination';

const {
  getSessionUserMock,
  notFoundMock,
  redirectMock,
  routerMock,
  getRecipeActionMock,
  listProductsActionMock,
  listUnitsActionMock,
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn<() => Promise<unknown>>(),
  notFoundMock: vi.fn<() => never>(),
  redirectMock: vi.fn<(ruta: string) => never>(),
  routerMock: {
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    refresh: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
  getRecipeActionMock: vi.fn<(id: string) => Promise<RecipeQueryResult>>(),
  listProductsActionMock: vi.fn<(query: unknown) => Promise<ProductListResult>>(),
  listUnitsActionMock: vi.fn<() => Promise<UnitListResult>>(),
}));

vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock, endSession: vi.fn<() => Promise<void>>() },
  observabilidad: { readRequestIdHeader: vi.fn(async (): Promise<string | null> => null) },
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound: notFoundMock,
  redirect: redirectMock,
  useRouter: () => routerMock,
}));

vi.mock('@/lib/modules/recetas/adapters/driving/recipe-actions', () => ({
  getRecipeAction: getRecipeActionMock,
  createRecipeVersionAction: vi.fn(),
  updateRecipeVersionAction: vi.fn(),
}));

vi.mock('@/lib/modules/inventario/adapters/driving/product-actions', () => ({
  listProductsAction: listProductsActionMock,
}));

vi.mock('@/lib/modules/unidades/adapters/driving/unit-actions', () => ({
  listUnitsAction: listUnitsActionMock,
}));

vi.setConfig({ testTimeout: 30_000 });

const ORIGINAL_ID = '11111111-1111-4111-8111-111111111111';
const VERSION_ID = '22222222-2222-4222-8222-222222222222';
const OTRA_ORIGINAL_ID = '33333333-3333-4333-8333-333333333333';
const PRODUCT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PRODUCT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PRODUCT_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function lineView(id: string, productId: string, productName: string | null, percentage: string): RecipeLineView {
  return { id, productId, productName, percentage, productUnitId: null, productStock: null };
}

function detail(overrides: Partial<RecipeDetail>): RecipeDetail {
  return {
    id: ORIGINAL_ID,
    name: 'Jabón',
    description: null,
    imageUrl: null,
    stepCount: 0,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-02T00:00:00Z'),
    createdBy: null,
    updatedBy: null,
    steps: [],
    lines: [lineView('l-a', PRODUCT_A, 'Agua', '60.00'), lineView('l-b', PRODUCT_B, 'Sal', '40.00')],
    original: null,
    isUnderReview: false,
    displayName: 'Jabón',
    ...overrides,
  };
}

const ORIGINAL = detail({});

const VERSION = detail({
  id: VERSION_ID,
  name: 'Sin sal',
  lines: [lineView('v-a', PRODUCT_A, 'Agua', '70.00'), lineView('v-c', PRODUCT_C, null, '30.00')],
  original: { id: ORIGINAL_ID, name: 'Jabón' },
  displayName: 'Jabón · Sin sal',
});

const NO_ENCONTRADA: RecipeQueryResult = {
  status: 'error',
  code: 'recipe_not_found',
  message: errorMessage('recipe_not_found'),
};

const OTRO_ERROR: RecipeQueryResult = {
  status: 'error',
  code: 'unauthorized',
  message: errorMessage('unauthorized'),
};

function sesionCon(permissions: readonly string[]): SessionUser {
  return {
    id: 'u-test-174',
    username: 'carla.duarte',
    displayName: 'Carla Duarte Salas',
    roleName: 'Operador',
    permissions,
  };
}

/** `then` anota el acceso: asi se ve si la pagina llego a leer la URL. */
const accesoAParametros = vi.fn<() => void>();

function parametroEspia<T>(valor: T): Promise<T> {
  return {
    then: (resolve: (value: T) => unknown) => {
      accesoAParametros();
      return resolve(valor);
    },
  } as unknown as Promise<T>;
}

/** Cada id responde con su detalle; los no registrados, «no encontrada». */
function recetasPorId(porId: Record<string, RecipeQueryResult>) {
  getRecipeActionMock.mockImplementation(async (id) => porId[id] ?? NO_ENCONTRADA);
}

async function abrirAlta(id = ORIGINAL_ID) {
  render(await NuevaVersionPage({ params: parametroEspia({ id }) }));
}

async function abrirVersion(id = ORIGINAL_ID, versionId = VERSION_ID) {
  render(await EditarVersionPage({ params: parametroEspia({ id, versionId }) }));
}

function expectNoEncontradaSinFormulario() {
  expect(screen.getByTestId('recipe-not-found')).toHaveAttribute('role', 'alert');
  expect(screen.getByTestId('recipe-not-found-message')).toHaveTextContent(
    errorMessage('recipe_not_found'),
  );
  expect(screen.queryByTestId('recipe-version-form')).toBeNull();
}

beforeEach(() => {
  vi.clearAllMocks();
  notFoundMock.mockImplementation(() => {
    throw new Error('NEXT_NOT_FOUND');
  });
  redirectMock.mockImplementation(() => {
    throw new Error('NEXT_REDIRECT');
  });
  getSessionUserMock.mockResolvedValue(sesionCon(['recetas.consultar']));
  recetasPorId({
    [ORIGINAL_ID]: { status: 'success', data: ORIGINAL },
    [VERSION_ID]: { status: 'success', data: VERSION },
  });
  listProductsActionMock.mockResolvedValue({
    status: 'success',
    data: { items: [], total: 0, page: 1, pageSize: MAX_PAGE_SIZE, totalPages: 1 },
  });
  listUnitsActionMock.mockResolvedValue({ status: 'success', data: [] });
});

afterEach(() => {
  cleanup();
});

describe('R36 — las dos paginas exigen recetas.consultar antes de leer', () => {
  it.each([
    ['alta', () => NuevaVersionPage({ params: parametroEspia({ id: ORIGINAL_ID }) })],
    [
      'version',
      () => EditarVersionPage({ params: parametroEspia({ id: ORIGINAL_ID, versionId: VERSION_ID }) }),
    ],
  ])('R36: %s sin el permiso responde 404 sin leer params ni recetas', async (_nombre, invocar) => {
    getSessionUserMock.mockResolvedValue(sesionCon(['recetas.modificar']));

    await expect(invocar()).rejects.toThrow('NEXT_NOT_FOUND');

    expect(notFoundMock).toHaveBeenCalledTimes(1);
    expect(accesoAParametros).not.toHaveBeenCalled();
    expect(getRecipeActionMock).not.toHaveBeenCalled();
    expect(listUnitsActionMock).not.toHaveBeenCalled();
    expect(listProductsActionMock).not.toHaveBeenCalled();
  });

  it('R36: con recetas.consultar las dos paginas se sirven y leen params', async () => {
    await abrirAlta();
    cleanup();
    await abrirVersion();

    expect(notFoundMock).not.toHaveBeenCalled();
    expect(accesoAParametros).toHaveBeenCalledTimes(2);
  });
});

describe('R8 — alta de version', () => {
  it('R8: con una original viva pinta el formulario de alta con nombre vacio y las lineas de la original', async () => {
    await abrirAlta();

    expect(getRecipeActionMock).toHaveBeenCalledWith(ORIGINAL_ID);
    expect(screen.getByTestId('recipe-version-form')).toBeInTheDocument();
    expect(screen.getByTestId('recipe-version-page-title')).toHaveTextContent('Jabón');
    expect(screen.getByTestId('recipe-version-field-name')).toHaveValue('');
    const porcentajes = screen
      .getAllByTestId(/^recipe-line-percentage-\d+$/)
      .map((input) => (input as HTMLInputElement).value);
    expect(porcentajes).toEqual(['60,00', '40,00']);
    expect(screen.queryByTestId('recipe-not-found')).toBeNull();
  });
});

describe('R10 — alta con un [id] que no es una original viva de la empresa', () => {
  it('R10: [id] inexistente o de otra empresa (recipe_not_found) muestra «no encontrada» sin formulario', async () => {
    await abrirAlta(OTRA_ORIGINAL_ID);

    expectNoEncontradaSinFormulario();
  });

  it('R10: [id] que es una version muestra «no encontrada» sin formulario', async () => {
    await abrirAlta(VERSION_ID);

    expectNoEncontradaSinFormulario();
  });

  it('R10: otro error al leer la original pinta RecipeListError y no el formulario', async () => {
    recetasPorId({ [ORIGINAL_ID]: OTRO_ERROR });

    await abrirAlta();

    expect(screen.getByTestId('recipe-list-error')).toBeInTheDocument();
    expect(screen.queryByTestId('recipe-not-found')).toBeNull();
    expect(screen.queryByTestId('recipe-version-form')).toBeNull();
  });
});

describe('R9 — pagina de una version', () => {
  it('R9: titulo con displayName, nombre propio y sus lineas, incluida la de un producto de baja', async () => {
    await abrirVersion();

    expect(getRecipeActionMock).toHaveBeenCalledWith(VERSION_ID);
    expect(getRecipeActionMock).toHaveBeenCalledWith(ORIGINAL_ID);
    expect(screen.getByTestId('recipe-version-page-title')).toHaveTextContent('Jabón · Sin sal');
    expect(screen.getByTestId('recipe-version-form')).toBeInTheDocument();
    expect(screen.getByTestId('recipe-version-field-name')).toHaveValue('Sin sal');
    const porcentajes = screen
      .getAllByTestId(/^recipe-line-percentage-\d+$/)
      .map((input) => (input as HTMLInputElement).value);
    expect(porcentajes).toEqual(['70,00', '30,00']);
  });
});

describe('R10 — version que no cuelga de [id] o [id] que no es original', () => {
  it('R10: [versionId] inexistente o de otra empresa muestra «no encontrada» sin formulario', async () => {
    recetasPorId({ [ORIGINAL_ID]: { status: 'success', data: ORIGINAL } });

    await abrirVersion();

    expectNoEncontradaSinFormulario();
  });

  it('R10: [id] inexistente o de otra empresa, con las dos lecturas en recipe_not_found, muestra «no encontrada»', async () => {
    recetasPorId({});

    await abrirVersion(OTRA_ORIGINAL_ID, VERSION_ID);

    expectNoEncontradaSinFormulario();
  });

  it('R10: version cuyo original.id no es [id] muestra «no encontrada» sin formulario', async () => {
    recetasPorId({
      [OTRA_ORIGINAL_ID]: { status: 'success', data: detail({ id: OTRA_ORIGINAL_ID, name: 'Otra' }) },
      [VERSION_ID]: { status: 'success', data: VERSION },
    });

    await abrirVersion(OTRA_ORIGINAL_ID, VERSION_ID);

    expectNoEncontradaSinFormulario();
  });

  it('R10: [id] que es una version muestra «no encontrada» sin formulario', async () => {
    const otraVersion = detail({
      id: OTRA_ORIGINAL_ID,
      original: { id: ORIGINAL_ID, name: 'Jabón' },
      displayName: 'Jabón · Otra',
    });
    recetasPorId({
      [OTRA_ORIGINAL_ID]: { status: 'success', data: otraVersion },
      [VERSION_ID]: {
        status: 'success',
        data: { ...VERSION, original: { id: OTRA_ORIGINAL_ID, name: 'Jabón · Otra' } },
      },
    });

    await abrirVersion(OTRA_ORIGINAL_ID, VERSION_ID);

    expectNoEncontradaSinFormulario();
  });

  it('R10: [versionId] que es una original muestra «no encontrada» sin formulario', async () => {
    await abrirVersion(ORIGINAL_ID, ORIGINAL_ID);

    expectNoEncontradaSinFormulario();
  });

  it.each([
    ['la version', VERSION_ID],
    ['la original', ORIGINAL_ID],
  ])('R10: otro error al leer %s pinta RecipeListError y no el formulario', async (_quien, idConError) => {
    recetasPorId({
      [ORIGINAL_ID]: { status: 'success', data: ORIGINAL },
      [VERSION_ID]: { status: 'success', data: VERSION },
      [idConError]: OTRO_ERROR,
    });

    await abrirVersion();

    expect(screen.getByTestId('recipe-list-error')).toBeInTheDocument();
    expect(screen.queryByTestId('recipe-not-found')).toBeNull();
    expect(screen.queryByTestId('recipe-version-form')).toBeNull();
  });
});
