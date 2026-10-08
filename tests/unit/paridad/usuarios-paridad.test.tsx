import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import UsuariosPage from '@/app/(private)/configuracion/usuarios/page';
import { errorMessage, type ErrorState } from '@/lib/modules/errores';
import { PERMISSIONS, type UserRow } from '@/lib/modules/identity';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';
import { USERS_ROUTE } from '@/lib/shared/routes';

import { errorInesperado } from '../../helpers/identificador-de-request';
import { WIDE_VIEWPORT, resetViewport, setViewportWidth } from '../../helpers/viewport';
import { arbolAccesible, nuncaResuelve, resolverServerComponents } from './arbol-accesible';

/**
 * Paridad de la pestana de personas de usuarios. Mocks de
 * `tests/unit/configuracion-ui/usuarios-page.test.tsx`.
 */

const { routerMock, getSessionUserMock, listUsersActionMock, listRolesActionMock } = vi.hoisted(
  () => ({
    routerMock: {
      push: vi.fn<(href: string) => void>(),
      replace: vi.fn<(href: string) => void>(),
      refresh: vi.fn<() => void>(),
      back: vi.fn<() => void>(),
      forward: vi.fn<() => void>(),
      prefetch: vi.fn<(href: string) => void>(),
    },
    getSessionUserMock: vi.fn(),
    listUsersActionMock: vi.fn<(query: unknown) => Promise<unknown>>(),
    listRolesActionMock: vi.fn(),
  }),
);

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
  listUsersAction: listUsersActionMock,
  getUserAction: vi.fn(),
  createUserAction: vi.fn(),
  updateUserAction: vi.fn(),
  deleteUserAction: vi.fn(),
  setUserAccountStatusAction: vi.fn(),
}));

vi.mock('@/lib/modules/identity/adapters/driving/role-actions', () => ({
  listRolesAction: listRolesActionMock,
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
  listWorkGroupsAction: vi.fn(),
  listWorkGroupMembersAction: vi.fn(),
}));

const SESION = {
  id: '99999999-9999-4999-8999-999999999999',
  username: 'admin.prueba',
  displayName: 'Admin De Prueba',
  roleName: 'Administrador',
  permissions: PERMISSIONS.map((permiso) => permiso.code),
};

const FILAS: readonly UserRow[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    displayName: 'Lopez Perez, Ana',
    username: 'ana.lopez',
    email: 'ana.lopez@example.com',
    roleName: 'Operador',
    accountStatus: 'active',
  },
  {
    id: SESION.id,
    displayName: 'Admin De Prueba',
    username: 'admin.prueba',
    email: null,
    roleName: 'Administrador',
    accountStatus: 'active',
  },
] as readonly UserRow[];

function pagina(items: readonly UserRow[], page = 1) {
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
  const arbol = await UsuariosPage({ searchParams: Promise.resolve(consulta) });
  return render(<>{await resolverServerComponents(arbol)}</>);
}

async function renderCargando(consulta: Consulta = {}) {
  listUsersActionMock.mockReturnValue(nuncaResuelve());
  const arbol = await UsuariosPage({ searchParams: Promise.resolve(consulta) });
  return render(<>{arbol}</>);
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUserMock.mockResolvedValue(SESION);
  listRolesActionMock.mockResolvedValue({ status: 'success', data: [] });
  listUsersActionMock.mockResolvedValue(pagina(FILAS));
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(() => {
  cleanup();
  resetViewport();
});

describe('paridad de usuarios — personas', () => {
  it('R1 R16-R18 — con filas', async () => {
    await renderPantalla();
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R16 — cargando, con tantas filas como el tamano de pagina', async () => {
    await renderCargando({ pageSize: '10' });
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R18 — vacio, sin busqueda', async () => {
    listUsersActionMock.mockResolvedValue(pagina([]));
    await renderPantalla();
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R18 — vacio en una pagina posterior, con la vuelta a la primera', async () => {
    listUsersActionMock.mockResolvedValue(pagina([], 3));
    await renderPantalla({ page: '3' });
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R18 — sin resultados, con busqueda activa', async () => {
    listUsersActionMock.mockResolvedValue(pagina([]));
    await renderPantalla({ q: 'inexistente' });
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R2 R17 — error de catalogo, y «Reintentar» hace lo de hoy', async () => {
    listUsersActionMock.mockResolvedValue(ERROR_DE_CATALOGO);
    await renderPantalla();
    expect(arbolAccesible()).toMatchSnapshot();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
  });

  it('R1 R17 — error inesperado, con su identificador', async () => {
    listUsersActionMock.mockResolvedValue(errorInesperado());
    await renderPantalla();
    expect(arbolAccesible()).toMatchSnapshot();
  });
});
