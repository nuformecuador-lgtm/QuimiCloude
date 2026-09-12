// QC-85 T5 — El estado vacio de la lista de grupos: R3, R18, R40, R41.
//
// **Los destinos se afirman contra `workGroupListHref`**, no contra una URL escrita aqui: la
// constante de ruta es la unica fuente, y comparar con el resultado de la funcion es lo que prueba
// que la pantalla no compone la cadena a mano (R3).
//
// **Las dos salidas son condicionales**: limpiar la busqueda solo se ofrece si la habia, y volver a
// la primera pagina solo si la pedida era mayor que el total (R18). Por eso cada caso monta la
// SECCION real con unos parametros concretos: el reparto lo decide ella.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FIRST_PAGE,
  GROUPS_TAB,
  TAB_PARAM,
  WORK_GROUP_LIST_CLEAR_SEARCH_TESTID,
  WORK_GROUP_LIST_EMPTY_MESSAGE_TESTID,
  WORK_GROUP_LIST_EMPTY_TESTID,
  WORK_GROUP_LIST_FIRST_PAGE_TESTID,
  WORK_GROUP_LIST_TESTID,
  WorkGroupListEmpty,
  WorkGroupListSection,
  workGroupListHref,
} from '@/app/(private)/configuracion/usuarios/components';
import type { DataTableParams } from '@/components/shared/data-table';
import type { WorkGroupRow } from '@/lib/modules/identity';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';
import { USERS_ROUTE } from '@/lib/shared/routes';
import { WIDE_VIEWPORT, resetViewport, setViewportWidth } from '../../../helpers/viewport';

const { listWorkGroupsActionMock, routerMock } = vi.hoisted(() => ({
  listWorkGroupsActionMock: vi.fn<(query: unknown) => Promise<unknown>>(),
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

vi.mock('@/lib/modules/identity/adapters/driving/work-group-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse al pintar el vacio`);
  };
  return {
    createWorkGroupAction: vi.fn(noDebeInvocarse('createWorkGroupAction')),
    renameWorkGroupAction: vi.fn(noDebeInvocarse('renameWorkGroupAction')),
    deleteWorkGroupAction: vi.fn(noDebeInvocarse('deleteWorkGroupAction')),
    addWorkGroupMemberAction: vi.fn(noDebeInvocarse('addWorkGroupMemberAction')),
    removeWorkGroupMemberAction: vi.fn(noDebeInvocarse('removeWorkGroupMemberAction')),
    listWorkGroupsAction: listWorkGroupsActionMock,
    listWorkGroupMembersAction: vi.fn(noDebeInvocarse('listWorkGroupMembersAction')),
  };
});

vi.mock('@/lib/modules/identity/adapters/driving/user-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse desde la pestana de grupos`);
  };
  return {
    listUsersAction: vi.fn(noDebeInvocarse('listUsersAction')),
    getUserAction: vi.fn(noDebeInvocarse('getUserAction')),
    createUserAction: vi.fn(noDebeInvocarse('createUserAction')),
    updateUserAction: vi.fn(noDebeInvocarse('updateUserAction')),
    deleteUserAction: vi.fn(noDebeInvocarse('deleteUserAction')),
    setUserAccountStatusAction: vi.fn(noDebeInvocarse('setUserAccountStatusAction')),
  };
});

vi.mock('@/lib/modules/identity/adapters/driving/role-actions', () => ({
  listRolesAction: vi.fn(() => {
    throw new Error('listRolesAction no debe invocarse desde la pestana de grupos');
  }),
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
      items: [] as readonly WorkGroupRow[],
      total: 0,
      page: extra.page ?? FIRST_PAGE,
      pageSize: DEFAULT_PAGE_SIZE,
      totalPages: extra.totalPages ?? 1,
    },
  };
}

async function renderSeccion(params: DataTableParams) {
  return render(await WorkGroupListSection({ params, canModify: true }));
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  setViewportWidth(WIDE_VIEWPORT);
  listWorkGroupsActionMock.mockResolvedValue(paginaVacia());
});

afterEach(() => {
  cleanup();
  resetViewport();
});

describe('el vacio es identificable y no finge que haya lista (R18)', () => {
  it('se pinta su region y ninguna tabla', async () => {
    await renderSeccion(parametros());

    expect(screen.getByTestId(WORK_GROUP_LIST_EMPTY_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId(WORK_GROUP_LIST_EMPTY_MESSAGE_TESTID)).toBeInTheDocument();
    expect(screen.queryByTestId(WORK_GROUP_LIST_TESTID)).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('sin termino y en la primera pagina no se ofrece ninguna salida', async () => {
    await renderSeccion(parametros());

    // Ofrecer «limpiar» lo que no se ha ensuciado seria ruido, no ayuda.
    expect(screen.queryByTestId(WORK_GROUP_LIST_CLEAR_SEARCH_TESTID)).toBeNull();
    expect(screen.queryByTestId(WORK_GROUP_LIST_FIRST_PAGE_TESTID)).toBeNull();
  });

  it('NO ofrece crear el primer grupo: el disparador del alta ya esta arriba (R18)', async () => {
    await renderSeccion(parametros());

    const vacio = screen.getByTestId(WORK_GROUP_LIST_EMPTY_TESTID);
    // Ningun control mas que las salidas de navegacion, que aqui no aplican.
    expect(vacio.querySelectorAll('button')).toHaveLength(0);
    expect(vacio.querySelectorAll('a')).toHaveLength(0);
  });
});

describe('las salidas del vacio derivan de la constante de ruta y conservan la pestana (R3, R18)', () => {
  it('con termino de busqueda se ofrece limpiarlo, y el destino se queda sin `q`', async () => {
    const params = parametros({ search: 'inexistente' });

    await renderSeccion(params);

    const enlace = screen.getByTestId(WORK_GROUP_LIST_CLEAR_SEARCH_TESTID);
    expect(enlace).toHaveAttribute(
      'href',
      workGroupListHref({ ...params, search: '', page: FIRST_PAGE }),
    );
    expect(enlace.getAttribute('href')!.startsWith(`${USERS_ROUTE}?`)).toBe(true);
    expect(enlace.getAttribute('href')).not.toContain('q=');
    // Y sigue siendo la pestana de grupos: limpiar la busqueda no devuelve a personas (R3, R7).
    expect(enlace.getAttribute('href')).toContain(`${TAB_PARAM}=${GROUPS_TAB}`);
  });

  it('con la pagina pedida mayor que el total se ofrece volver a la primera', async () => {
    const params = parametros({ page: 4 });
    listWorkGroupsActionMock.mockResolvedValue(paginaVacia({ page: 4, totalPages: 2 }));

    await renderSeccion(params);

    const enlace = screen.getByTestId(WORK_GROUP_LIST_FIRST_PAGE_TESTID);
    expect(enlace).toHaveAttribute('href', workGroupListHref({ ...params, page: FIRST_PAGE }));
    expect(enlace.getAttribute('href')).toContain(`page=${FIRST_PAGE}`);
    expect(enlace.getAttribute('href')).toContain(`${TAB_PARAM}=${GROUPS_TAB}`);
  });

  it('y en la primera pagina, aunque haya termino, NO se ofrece volver a la primera', async () => {
    await renderSeccion(parametros({ search: 'inexistente' }));

    expect(screen.getByTestId(WORK_GROUP_LIST_CLEAR_SEARCH_TESTID)).toBeInTheDocument();
    expect(screen.queryByTestId(WORK_GROUP_LIST_FIRST_PAGE_TESTID)).toBeNull();
  });
});

describe('las salidas son enlaces reales y alcanzables con el dedo (R40, R41)', () => {
  it('son `<a>` con destino, no botones disfrazados, y miden al menos 44x44', () => {
    // Aqui el componente se monta SOLO, con las dos salidas presentes: es el unico caso en el que
    // las dos coinciden, y lo que se mira es su forma, no cuando se ofrecen.
    render(<WorkGroupListEmpty clearSearchHref="/a?x=1" firstPageHref="/b?y=2" />);

    for (const testid of [
      WORK_GROUP_LIST_CLEAR_SEARCH_TESTID,
      WORK_GROUP_LIST_FIRST_PAGE_TESTID,
    ]) {
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
