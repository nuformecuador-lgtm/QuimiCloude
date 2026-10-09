import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import UsuariosPage from '@/app/(private)/configuracion/usuarios/page';
import { errorMessage, type ErrorState } from '@/lib/modules/errores';
import { PERMISSIONS, type WorkGroupRow } from '@/lib/modules/identity';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';
import { USERS_ROUTE } from '@/lib/shared/routes';

import { errorInesperado } from '../../helpers/identificador-de-request';
import { WIDE_VIEWPORT, resetViewport, setViewportWidth } from '../../helpers/viewport';
import { arbolAccesible, nuncaResuelve, resolverServerComponents } from './arbol-accesible';

/**
 * Paridad de la pestana de grupos de trabajo de usuarios. Mocks de
 * `tests/unit/configuracion-ui/grupos/usuarios-page.test.tsx`.
 */

const { routerMock, getSessionUserMock, listWorkGroupsActionMock } = vi.hoisted(() => ({
  routerMock: {
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    refresh: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
  getSessionUserMock: vi.fn(),
  listWorkGroupsActionMock: vi.fn<(query: unknown) => Promise<unknown>>(),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => USERS_ROUTE,
  useRouter: () => routerMock,
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock, endSession: vi.fn() },
}));

vi.mock('@/lib/modules/identity/adapters/driving/user-actions', () => ({
  listUsersAction: vi.fn(),
  getUserAction: vi.fn(),
  createUserAction: vi.fn(),
  updateUserAction: vi.fn(),
  deleteUserAction: vi.fn(),
  setUserAccountStatusAction: vi.fn(),
}));

vi.mock('@/lib/modules/identity/adapters/driving/role-actions', () => ({
  listRolesAction: vi.fn(),
}));

vi.mock('@/lib/modules/identity/adapters/driving/session-actions', () => ({
  endAllSessionsAction: vi.fn(),
}));

vi.mock('@/lib/modules/identity/adapters/driving/work-group-actions', () => ({
  createWorkGroupAction: vi.fn(),
  renameWorkGroupAction: vi.fn(),
  deleteWorkGroupAction: vi.fn(),
  addWorkGroupMemberAction: vi.fn(),
  removeWorkGroupMemberAction: vi.fn(),
  listWorkGroupsAction: listWorkGroupsActionMock,
  listWorkGroupMembersAction: vi.fn(),
}));

const SESION = {
  id: '99999999-9999-4999-8999-999999999999',
  username: 'admin.prueba',
  displayName: 'Admin De Prueba',
  roleName: 'Administrador',
  permissions: PERMISSIONS.map((permiso) => permiso.code),
};

const GRUPOS: readonly WorkGroupRow[] = [
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Laboratorio',
    members: [{ id: '11111111-1111-4111-8111-111111111111', displayName: 'Lopez Perez, Ana' }],
  },
  { id: '33333333-3333-4333-8333-333333333333', name: 'Empaque', members: [] },
];

function pagina(items: readonly WorkGroupRow[], page = 1) {
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

const GRUPOS_TAB: Consulta = { tab: 'grupos' };

async function renderPantalla(consulta: Consulta = {}) {
  const arbol = await UsuariosPage({ searchParams: Promise.resolve({ ...GRUPOS_TAB, ...consulta }) });
  return render(<>{await resolverServerComponents(arbol)}</>);
}

async function renderCargando(consulta: Consulta = {}) {
  listWorkGroupsActionMock.mockReturnValue(nuncaResuelve());
  const arbol = await UsuariosPage({ searchParams: Promise.resolve({ ...GRUPOS_TAB, ...consulta }) });
  return render(<>{arbol}</>);
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUserMock.mockResolvedValue(SESION);
  listWorkGroupsActionMock.mockResolvedValue(pagina(GRUPOS));
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(() => {
  cleanup();
  resetViewport();
});

describe('paridad de usuarios — grupos de trabajo', () => {
  it('R1 R16-R18 — con filas', async () => {
    await renderPantalla();
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R16 — cargando, con tantas filas como el tamano de pagina', async () => {
    await renderCargando({ pageSize: '10' });
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R18 — vacio, sin busqueda', async () => {
    listWorkGroupsActionMock.mockResolvedValue(pagina([]));
    await renderPantalla();
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R18 — vacio en una pagina posterior, con la vuelta a la primera', async () => {
    listWorkGroupsActionMock.mockResolvedValue(pagina([], 3));
    await renderPantalla({ page: '3' });
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R18 — sin resultados, con busqueda activa', async () => {
    listWorkGroupsActionMock.mockResolvedValue(pagina([]));
    await renderPantalla({ q: 'inexistente' });
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R2 R17 — error de catalogo, y «Reintentar» hace lo de hoy', async () => {
    listWorkGroupsActionMock.mockResolvedValue(ERROR_DE_CATALOGO);
    await renderPantalla();
    expect(arbolAccesible()).toMatchSnapshot();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
  });

  it('R1 R17 — error inesperado, con su identificador', async () => {
    listWorkGroupsActionMock.mockResolvedValue(errorInesperado());
    await renderPantalla();
    expect(arbolAccesible()).toMatchSnapshot();
  });
});
