// QC-67 T7 — El estado vacio de la lista de usuarios: R1, R11, R18, R40, R41.
//
// **Los destinos se afirman contra `userListHref`**, no contra una URL escrita aqui: la constante
// de ruta es la unica fuente, y comparar con el resultado de la funcion es lo que prueba que la
// pantalla no compone la cadena a mano (R1).
//
// **Las dos salidas son condicionales**: limpiar la busqueda o el filtro solo se ofrece si habia
// alguno activo, y volver a la primera pagina solo si la pedida era mayor que el total (R18). Por
// eso cada caso monta la SECCION real con unos parametros concretos: el reparto lo decide ella.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ACCOUNT_STATUS_COLUMN_ID,
  FIRST_PAGE,
  USER_LIST_CLEAR_SEARCH_TESTID,
  USER_LIST_EMPTY_MESSAGE_TESTID,
  USER_LIST_EMPTY_TESTID,
  USER_LIST_FIRST_PAGE_TESTID,
  USER_LIST_TESTID,
  UserListEmpty,
  UserListSection,
  userListHref,
} from '@/app/(private)/configuracion/usuarios/components';
import type { DataTableParams } from '@/components/shared/data-table';
import type { UserRow } from '@/lib/modules/identity';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';
import { USERS_ROUTE } from '@/lib/shared/routes';
import { WIDE_VIEWPORT, resetViewport, setViewportWidth } from '../../helpers/viewport';

const { listRolesActionMock, listUsersActionMock, routerMock } = vi.hoisted(() => ({
  listUsersActionMock: vi.fn<(query: unknown) => Promise<unknown>>(),
  listRolesActionMock: vi.fn<() => Promise<unknown>>(),
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
  useRouter: () => routerMock,
}));

vi.mock('@/lib/modules/identity/adapters/driving/user-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse al pintar el vacio`);
  };
  return {
    listUsersAction: listUsersActionMock,
    getUserAction: vi.fn(noDebeInvocarse('getUserAction')),
    createUserAction: vi.fn(noDebeInvocarse('createUserAction')),
    updateUserAction: vi.fn(noDebeInvocarse('updateUserAction')),
    deleteUserAction: vi.fn(noDebeInvocarse('deleteUserAction')),
    setUserAccountStatusAction: vi.fn(noDebeInvocarse('setUserAccountStatusAction')),
  };
});

vi.mock('@/lib/modules/identity/adapters/driving/role-actions', () => ({
  listRolesAction: listRolesActionMock,
}));

function parametros(overrides: Partial<DataTableParams> = {}): DataTableParams {
  return {
    page: FIRST_PAGE,
    pageSize: DEFAULT_PAGE_SIZE,
    sort: null,
    filters: {},
    search: '',
    ...overrides,
  };
}

function paginaVacia(extra: { page?: number; totalPages?: number } = {}) {
  return {
    status: 'success',
    data: {
      items: [] as readonly UserRow[],
      total: 0,
      page: extra.page ?? FIRST_PAGE,
      pageSize: DEFAULT_PAGE_SIZE,
      totalPages: extra.totalPages ?? 1,
    },
  };
}

async function renderSeccion(params: DataTableParams) {
  return render(await UserListSection({ params, canModify: true, currentUserId: null }));
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  setViewportWidth(WIDE_VIEWPORT);
  listUsersActionMock.mockResolvedValue(paginaVacia());
  listRolesActionMock.mockResolvedValue({ status: 'success', data: [] });
});

afterEach(() => {
  cleanup();
  resetViewport();
});

describe('el vacio es identificable y no finge que haya lista (R18)', () => {
  it('se pinta su region y ninguna tabla', async () => {
    await renderSeccion(parametros());

    expect(screen.getByTestId(USER_LIST_EMPTY_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId(USER_LIST_EMPTY_MESSAGE_TESTID)).toBeInTheDocument();
    expect(screen.queryByTestId(USER_LIST_TESTID)).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('sin termino, sin filtro y en la primera pagina no se ofrece ninguna salida', async () => {
    await renderSeccion(parametros());

    // Ofrecer «limpiar» lo que no se ha ensuciado seria ruido, no ayuda.
    expect(screen.queryByTestId(USER_LIST_CLEAR_SEARCH_TESTID)).toBeNull();
    expect(screen.queryByTestId(USER_LIST_FIRST_PAGE_TESTID)).toBeNull();
  });

  it('NO ofrece crear el primer usuario: la sesion que lo ve ya es uno (R11, R18)', async () => {
    await renderSeccion(parametros());

    const vacio = screen.getByTestId(USER_LIST_EMPTY_TESTID);
    // Ningun control mas que las salidas de navegacion, que aqui no aplican.
    expect(vacio.querySelectorAll('button')).toHaveLength(0);
    expect(vacio.querySelectorAll('a')).toHaveLength(0);
  });
});

describe('las salidas del vacio derivan de la constante de ruta (R1, R18)', () => {
  it('con termino de busqueda se ofrece limpiarlo, y el destino se queda sin `q`', async () => {
    const params = parametros({ search: 'inexistente' });

    await renderSeccion(params);

    const enlace = screen.getByTestId(USER_LIST_CLEAR_SEARCH_TESTID);
    expect(enlace).toHaveAttribute(
      'href',
      userListHref({ ...params, search: '', filters: {}, page: FIRST_PAGE }),
    );
    expect(enlace.getAttribute('href')!.startsWith(`${USERS_ROUTE}?`)).toBe(true);
    expect(enlace.getAttribute('href')).not.toContain('q=');
  });

  it('con el filtro de estado activo tambien se ofrece limpiarlo (R13, R18)', async () => {
    const params = parametros({
      filters: { [ACCOUNT_STATUS_COLUMN_ID]: { kind: 'select', values: ['pending'] } },
    });

    await renderSeccion(params);

    const enlace = screen.getByTestId(USER_LIST_CLEAR_SEARCH_TESTID);
    expect(enlace).toHaveAttribute(
      'href',
      userListHref({ ...params, search: '', filters: {}, page: FIRST_PAGE }),
    );
    expect(enlace.getAttribute('href')).not.toContain('status=');
  });

  it('con la pagina pedida mayor que el total se ofrece volver a la primera', async () => {
    const params = parametros({ page: 4 });
    listUsersActionMock.mockResolvedValue(paginaVacia({ page: 4, totalPages: 2 }));

    await renderSeccion(params);

    const enlace = screen.getByTestId(USER_LIST_FIRST_PAGE_TESTID);
    expect(enlace).toHaveAttribute('href', userListHref({ ...params, page: FIRST_PAGE }));
    expect(enlace.getAttribute('href')).toContain(`page=${FIRST_PAGE}`);
  });
});

describe('las salidas son enlaces reales y alcanzables con el dedo (R40, R41)', () => {
  it('son `<a>` con destino, no botones disfrazados, y miden al menos 44x44', () => {
    // Aqui el componente se monta SOLO, con las dos salidas presentes: es el unico caso en el que
    // las dos coinciden, y lo que se mira es su forma, no cuando se ofrecen.
    render(<UserListEmpty clearSearchHref="/a?x=1" firstPageHref="/b?y=2" />);

    for (const testid of [USER_LIST_CLEAR_SEARCH_TESTID, USER_LIST_FIRST_PAGE_TESTID]) {
      const enlace = screen.getByTestId(testid);
      expect(enlace.tagName).toBe('A');
      expect(enlace).toHaveAttribute('href');
      // `role="button"` sobre un `<a>` mentiria sobre lo que el control hace: esto navega.
      expect(enlace).not.toHaveAttribute('role', 'button');
      expect(enlace.className).toContain('min-h-11');
      expect(enlace.className).toContain('min-w-11');
    }
  });
});
