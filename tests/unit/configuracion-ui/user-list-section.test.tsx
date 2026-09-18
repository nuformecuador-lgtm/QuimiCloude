// QC-67 T7 — La seccion de la lista de usuarios y sus tres estados: R7, R11, R18, R19, R24.
//
// **Las DOS lecturas estan mockeadas** por su RUTA EXACTA —`user-actions` y `role-actions`—, que
// es el borde del modulo `identity` y lo unico que permite ejercitar lista, vacio, error y
// degradado sin base de datos. El resto del arbol es el real: la seccion, la tabla compartida y
// las columnas.
//
// **La seccion se invoca como funcion `async`** (`await UserListSection({...})`) porque eso es lo
// que es: un Server Component. `react-dom` en jsdom no sabe ejecutar uno, asi que se resuelve
// antes de entregar el arbol al renderer. El caso del esqueleto se apoya justo en lo contrario:
// renderiza el arbol de la PAGINA sin resolver, y `<Suspense>` pinta su `fallback`.
//
// **Ningun assert sobre copy** (R41): los estados se distinguen por `data-testid` DISTINTOS y por
// constantes exportadas; las filas, por los `data-testid` publicos de la tabla compartida.

import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  USER_COLUMN_COUNT,
  USER_CREATE_OPEN_TESTID,
  USER_LIST_EMPTY_TESTID,
  USER_LIST_ERROR_CODE_TESTID,
  USER_LIST_ERROR_MESSAGE_TESTID,
  USER_LIST_ERROR_TESTID,
  USER_LIST_RETRY_TESTID,
  USER_LIST_SKELETON_TESTID,
  USER_LIST_TESTID,
  USER_ROW_SKELETON_TESTID,
  USER_SKELETON_COLUMN_COUNT,
  UserListSection,
  buildUserListQuery,
  parseUserListParams,
} from '@/app/(private)/configuracion/usuarios/components';
import UsuariosPage from '@/app/(private)/configuracion/usuarios/page';
import type { DataTableParams } from '@/components/shared/data-table';
import {
  UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL,
  UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID,
} from '@/components/shared/unexpected-error-notice';
import type { UserRow } from '@/lib/modules/identity';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';
import {
  REFERENCIA_DEL_CASO,
  errorInesperado,
  esperarSinIdentificador,
} from '../../helpers/identificador-de-request';
import { WIDE_VIEWPORT, resetViewport, setViewportWidth } from '../../helpers/viewport';

const { getSessionUserMock, listRolesActionMock, listUsersActionMock, routerMock } = vi.hoisted(
  () => ({
    getSessionUserMock: vi.fn<() => Promise<unknown>>(),
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
  }),
);

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => routerMock,
}));

vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock, endSession: vi.fn<() => Promise<void>>() },
}));

// Las cuatro de escritura son dobles que FALLAN si se les llama: pintar la lista no muta nada.
vi.mock('@/lib/modules/identity/adapters/driving/user-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse al pintar la lista`);
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

// QC-101 T7 — La Server Action del CIERRE DE SESIONES, doble que FALLA si se la llama.
//
// Mismo motivo que el bloque de grupos: el panel de detalle monta ahora el dialogo del cierre de
// sesiones, y `session-actions.ts` lee `observabilidad` de `@/lib/composition` al cargarse —y el
// doble de composicion de este archivo declara solo `identity`—. Pintar la lista no cierra la
// sesion de nadie: si alguien la llamara, el caso se pondria rojo.
vi.mock('@/lib/modules/identity/adapters/driving/session-actions', () => ({
  endAllSessionsAction: vi.fn(() => {
    throw new Error('endAllSessionsAction no debe invocarse al pintar la lista');
  }),
}));

// QC-85 T7 — Las SIETE Server Actions de GRUPOS, dobles que FALLAN si se les llama.
//
// **No es un cambio de guion de este archivo**: no toca ni un `test(...)`, ni un selector, ni una
// asercion. Desde que la pantalla de usuarios sirve DOS pestanas, su barrel arrastra
// `work-group-actions.ts`, que lee `observabilidad` de `@/lib/composition` **al cargarse** —y el
// doble de composicion de este archivo declara solo `identity`—. Aislar ese borde es exactamente
// lo que este archivo ya hacia con `user-actions` y `role-actions`.
//
// Que las SIETE lancen **TENSA** lo que el archivo afirma —la pestana de personas no consulta ni
// escribe NADA de grupos— en vez de relajarlo (QC-85 R6).
vi.mock('@/lib/modules/identity/adapters/driving/work-group-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse desde la pestana de personas`);
  };
  return {
    createWorkGroupAction: vi.fn(noDebeInvocarse('createWorkGroupAction')),
    renameWorkGroupAction: vi.fn(noDebeInvocarse('renameWorkGroupAction')),
    deleteWorkGroupAction: vi.fn(noDebeInvocarse('deleteWorkGroupAction')),
    addWorkGroupMemberAction: vi.fn(noDebeInvocarse('addWorkGroupMemberAction')),
    removeWorkGroupMemberAction: vi.fn(noDebeInvocarse('removeWorkGroupMemberAction')),
    listWorkGroupsAction: vi.fn(noDebeInvocarse('listWorkGroupsAction')),
    listWorkGroupMembersAction: vi.fn(noDebeInvocarse('listWorkGroupMembersAction')),
  };
});

/**
 * Cadena **inconfundible** a proposito: el caso de `unauthorized` busca su ausencia en todo el
 * documento, y con un valor realista no distinguiria entre «no se muestra» y «se muestra pero
 * parece otra cosa».
 */
const DATO_QUE_NO_DEBE_VERSE = 'USUARIO-SECRETO-NO-VISIBLE';

function fila(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    displayName: DATO_QUE_NO_DEBE_VERSE,
    username: 'ana.lopez',
    email: 'ana.lopez@example.com',
    roleName: 'Operador',
    accountStatus: 'active',
    ...overrides,
  };
}

function paginaCon(items: readonly UserRow[], extra: { page?: number; totalPages?: number } = {}) {
  return {
    status: 'success',
    data: {
      items,
      total: items.length,
      page: extra.page ?? 1,
      pageSize: DEFAULT_PAGE_SIZE,
      totalPages: extra.totalPages ?? 1,
    },
  };
}

const ROLES_OK = { status: 'success', data: [{ id: 'r1', name: 'Operador' }] };

function parametros(overrides: Partial<DataTableParams> = {}): DataTableParams {
  return {
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    sort: null,
    filters: {},
    search: '',
    ...overrides,
  };
}

/** Monta la seccion REAL, resolviendo antes el Server Component `async`. */
async function renderSeccion(params: DataTableParams = parametros(), canModify = true) {
  return render(await UserListSection({ params, canModify, currentUserId: null }));
}

/** Fuente de la seccion sin comentarios: el JSDoc NOMBRA lo que el codigo no debe hacer. */
function fuenteDeLaSeccion(): string {
  const ruta = join(
    __dirname,
    '..',
    '..',
    '..',
    'app',
    '(private)',
    'configuracion',
    'usuarios',
    'components',
    'user-list-section.tsx',
  );
  return readFileSync(ruta, 'utf8')
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
}

function sesionCon(permissions: readonly string[]) {
  return {
    id: '99999999-9999-4999-8999-999999999999',
    username: 'admin.prueba',
    displayName: 'Admin De Prueba',
    roleName: 'Administrador',
    permissions,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  // jsdom no implementa `window.matchMedia`, que la tabla compartida usa. Helper HEREDADO (R39).
  setViewportWidth(WIDE_VIEWPORT);
  getSessionUserMock.mockResolvedValue(sesionCon(['usuarios.consultar', 'usuarios.modificar']));
  listUsersActionMock.mockResolvedValue(paginaCon([fila()]));
  listRolesActionMock.mockResolvedValue(ROLES_OK);
});

afterEach(() => {
  cleanup();
  resetViewport();
});

describe('los tres estados son mutuamente excluyentes y se distinguen por data-testid (R41)', () => {
  it('lista: con usuarios se pinta la tabla compartida y ninguno de los otros dos', async () => {
    await renderSeccion();

    expect(screen.getByTestId(USER_LIST_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId('data-table')).toBeInTheDocument();
    expect(screen.queryByTestId(USER_LIST_EMPTY_TESTID)).toBeNull();
    expect(screen.queryByTestId(USER_LIST_ERROR_TESTID)).toBeNull();
    expect(screen.queryByTestId(USER_LIST_SKELETON_TESTID)).toBeNull();
  });

  it('vacio: se pinta el estado de «no encontro nada» y NO una tabla (R18)', async () => {
    listUsersActionMock.mockResolvedValue(paginaCon([]));

    await renderSeccion();

    expect(screen.getByTestId(USER_LIST_EMPTY_TESTID)).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByTestId(USER_LIST_TESTID)).toBeNull();
    expect(screen.queryByTestId(USER_LIST_ERROR_TESTID)).toBeNull();
  });

  it('EL ALTA SOBREVIVE AL VACIO: con cero filas el disparador sigue ahi (2026-09-17)', async () => {
    // La regresion que este caso existe para cerrar. El listado EXCLUYE al actor (R11), asi que una
    // instalacion recien sembrada —un unico usuario, el que esta mirando la pantalla— ve la lista
    // vacia con el catalogo lleno. Con el boton dentro de la tabla, ese vacio no tenia ninguna
    // salida: no habia forma de crear al segundo usuario desde la interfaz.
    listUsersActionMock.mockResolvedValue(paginaCon([]));

    await renderSeccion();

    expect(screen.getByTestId(USER_LIST_EMPTY_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId(USER_CREATE_OPEN_TESTID)).toBeEnabled();
  });

  it('y con filas tambien: el alta no depende del estado de la lista', async () => {
    await renderSeccion();

    expect(screen.getByTestId(USER_LIST_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId(USER_CREATE_OPEN_TESTID)).toBeEnabled();
  });

  it('sin `usuarios.modificar` no hay alta, ni con filas ni sin ellas (R6)', async () => {
    await renderSeccion(parametros(), false);
    expect(screen.queryByTestId(USER_CREATE_OPEN_TESTID)).toBeNull();

    cleanup();
    listUsersActionMock.mockResolvedValue(paginaCon([]));
    await renderSeccion(parametros(), false);
    expect(screen.queryByTestId(USER_CREATE_OPEN_TESTID)).toBeNull();
  });

  it('error: mensaje DEVUELTO, codigo estable y accion de reintentar (R19)', async () => {
    listUsersActionMock.mockResolvedValue({
      status: 'error',
      code: 'invalid_input',
      message: 'La consulta no es válida.',
    });

    await renderSeccion();

    expect(screen.getByTestId(USER_LIST_ERROR_TESTID)).toHaveAttribute('role', 'alert');
    // El mensaje es el que devolvio la action: se compara con el que el doble entrego, no con copy
    // escrito en este archivo.
    expect(screen.getByTestId(USER_LIST_ERROR_MESSAGE_TESTID)).toHaveTextContent(
      'La consulta no es válida.',
    );
    expect(screen.getByTestId(USER_LIST_ERROR_CODE_TESTID)).toHaveTextContent('invalid_input');
    expect(screen.getByTestId(USER_LIST_RETRY_TESTID)).toBeEnabled();

    // Lo que R19 existe para impedir: confundir «fallo» con «no hay usuarios».
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByTestId(USER_LIST_TESTID)).toBeNull();
    expect(screen.queryByTestId(USER_LIST_EMPTY_TESTID)).toBeNull();
  });

  it('cargando: mientras la lista esta en vuelo, la pagina pinta el esqueleto (R19)', async () => {
    // Sin resolver el Server Component `async`, `<Suspense>` pinta su `fallback`.
    render(await UsuariosPage({ searchParams: Promise.resolve({ pageSize: '25' }) }));

    const esqueleto = screen.getByTestId(USER_LIST_SKELETON_TESTID);
    expect(esqueleto).toHaveAttribute('aria-busy', 'true');
    // Tantas filas como el tamano de pagina PEDIDO: el esqueleto dice la verdad sobre la consulta.
    expect(screen.getAllByTestId(USER_ROW_SKELETON_TESTID)).toHaveLength(25);

    expect(screen.queryByTestId(USER_LIST_TESTID)).toBeNull();
    expect(screen.queryByTestId(USER_LIST_EMPTY_TESTID)).toBeNull();
    expect(screen.queryByTestId(USER_LIST_ERROR_TESTID)).toBeNull();
  });

  it('el esqueleto pinta tantas celdas como columnas declara la tabla', () => {
    // El esqueleto lo renderiza un Server Component y por eso no importa el modulo de cliente de
    // las columnas. Este ancla es lo que impide que el numero se quede atras en silencio.
    expect(USER_SKELETON_COLUMN_COUNT).toBe(USER_COLUMN_COUNT);
  });

  it('la `key` del <Suspense> son los parametros: el esqueleto reaparece en CADA cambio (R19)', async () => {
    const consulta = { page: '3', pageSize: '25', q: 'lopez' };
    const arbol = (await UsuariosPage({ searchParams: Promise.resolve(consulta) })) as ReactElement<{
      children: readonly ReactElement[];
    }>;

    const limite = arbol.props.children.at(-1)!;
    expect(limite.key).toBe(buildUserListQuery(parseUserListParams(consulta)));
  });
});

describe('los parametros llegan ENTEROS y sin traducir a la consulta (R17, R36)', () => {
  it('la seccion pasa el mismo objeto que recibio, sin una sola clave de mas', async () => {
    const params = parametros({
      page: 2,
      pageSize: 25,
      sort: { columnId: 'username', direction: 'desc' },
      filters: { accountStatus: { kind: 'select', values: ['pending', 'blocked'] } },
      search: 'lopez',
    });

    await renderSeccion(params);

    expect(listUsersActionMock).toHaveBeenCalledTimes(1);
    const consulta = listUsersActionMock.mock.calls[0]![0];
    // `createListQuerySchema()` es un `strictObject`: una clave de mas romperia el `parse`.
    expect(Object.keys(consulta as object).sort()).toEqual([
      'filters',
      'page',
      'pageSize',
      'search',
      'sort',
    ]);
    expect(consulta).toBe(params);
  });

  it('la consulta de roles se pide SIN argumentos: el catalogo es cerrado y entero', async () => {
    await renderSeccion();

    expect(listRolesActionMock).toHaveBeenCalledTimes(1);
    expect(listRolesActionMock.mock.calls[0]).toEqual([]);
  });
});

describe('la pantalla no autoriza nada por su cuenta (R7)', () => {
  it('en positivo: con la consulta resuelta, el dato del usuario SI se pinta', async () => {
    const { container } = await renderSeccion();

    expect(container.textContent).toContain(DATO_QUE_NO_DEBE_VERSE);
  });

  it('con `unauthorized` se pinta el error y NI UN SOLO DATO de usuarios', async () => {
    listUsersActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No tienes permiso para consultar usuarios.',
    });

    const { container } = await renderSeccion();

    expect(screen.getByTestId(USER_LIST_ERROR_CODE_TESTID)).toHaveTextContent('unauthorized');
    expect(container.textContent).not.toContain(DATO_QUE_NO_DEBE_VERSE);
    expect(screen.queryByTestId(USER_LIST_TESTID)).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('la seccion no lee la sesion: su fuente no toca cookies, composicion ni permisos', () => {
    const fuente = fuenteDeLaSeccion();

    for (const prohibido of ['next/headers', 'cookies(', 'lib/composition', 'requirePermission']) {
      expect(fuente, `la seccion no debe usar ${prohibido}`).not.toContain(prohibido);
    }
    // Y las actions entran por su RUTA EXACTA, nunca por el barrel del modulo (R36).
    expect(fuente).toContain('@/lib/modules/identity/adapters/driving/user-actions');
    expect(fuente).toContain('@/lib/modules/identity/adapters/driving/role-actions');
    // Del barrel del modulo solo puede entrar un `import type`, que TypeScript borra: un import de
    // VALOR arrastraria el `'use server'` del cierre transitivo y romperia a los componentes de
    // cliente que importen el contrato (R36, alternativa E del diseno).
    expect(fuente).not.toMatch(/import\s+\{[^}]*\}\s+from\s+['"]@\/lib\/modules\/identity['"]/);
  });
});

describe('el actor no se ve, y su ausencia NO se compensa (R11)', () => {
  it('se pintan exactamente las filas que devolvio la consulta, ni una mas', async () => {
    const filas = [
      fila({ id: 'u1', displayName: 'Lopez, Ana' }),
      fila({ id: 'u2', displayName: 'Perez, Beto' }),
    ];
    listUsersActionMock.mockResolvedValue(paginaCon(filas));

    await renderSeccion();

    for (const usuario of filas) {
      expect(screen.getByTestId(`data-table-row-${usuario.id}`)).toBeInTheDocument();
    }
    // Cabecera + las dos filas devueltas: no se anade ninguna fila del actor.
    expect(screen.getAllByRole('row')).toHaveLength(filas.length + 1);
  });

  it('no se anuncia que falte nadie: ninguna region de aviso acompana a la lista', async () => {
    await renderSeccion();

    expect(screen.getByTestId(USER_LIST_TESTID)).toBeInTheDocument();
    // Ni aviso, ni nota al pie: la ausencia del actor no se compensa de ninguna forma (R11).
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('y la fuente de la seccion no menciona al actor ni su sesion en ninguna forma', () => {
    const fuente = fuenteDeLaSeccion();

    for (const prohibido of ['actor', 'Actor', 'sessionUser', 'getSessionUser']) {
      expect(fuente, `la seccion no debe nombrar ${prohibido}`).not.toContain(prohibido);
    }
  });
});

describe('si la consulta de ROLES falla, la lista se pinta igual (R24, degradado)', () => {
  it('la lista NO cae al estado de error por no poder rellenar el selector', async () => {
    listRolesActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No tienes permiso para consultar roles.',
    });

    await renderSeccion();

    expect(screen.getByTestId(USER_LIST_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId('data-table')).toBeInTheDocument();
    expect(screen.queryByTestId(USER_LIST_ERROR_TESTID)).toBeNull();
  });

  it('y al reves, un fallo del LISTADO si decide el estado aunque los roles esten bien', async () => {
    listUsersActionMock.mockResolvedValue({
      status: 'error',
      code: 'unexpected',
      message: 'Ha ocurrido un error inesperado.',
      reference: REFERENCIA_DEL_CASO,
    });

    await renderSeccion();

    expect(screen.getByTestId(USER_LIST_ERROR_TESTID)).toBeInTheDocument();
    expect(screen.queryByTestId(USER_LIST_TESTID)).toBeNull();
  });
});

/** QC-71 — el identificador de peticion del error inesperado en esta lista. */
describe('lista de usuarios — el identificador del error inesperado (QC-71)', () => {
  it('el error inesperado ensena el identificador como texto, con su etiqueta', async () => {
    listUsersActionMock.mockResolvedValue(errorInesperado());

    await renderSeccion();

    const referencia = screen.getByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID);
    expect(referencia).toHaveTextContent(UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL);
    expect(referencia).toHaveTextContent(REFERENCIA_DEL_CASO);
  });

  it('un error del catalogo no ensena identificador ninguno', async () => {
    listUsersActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No autorizado.',
    });

    await renderSeccion();

    expect(screen.getByTestId(USER_LIST_ERROR_CODE_TESTID)).toHaveTextContent('unauthorized');
    esperarSinIdentificador();
  });
});
