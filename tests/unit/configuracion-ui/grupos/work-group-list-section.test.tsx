// QC-85 T6 — La seccion de la lista de grupos y sus tres estados: R11, R18, R19, R36.
//
// **La UNICA lectura esta mockeada** por su RUTA EXACTA —`work-group-actions`—, que es el borde del
// modulo `identity` y lo unico que permite ejercitar lista, vacio y error sin base de datos. El
// resto del arbol es el real: la seccion, la tabla compartida y las columnas.
//
// **La seccion se invoca como funcion `async`** (`await WorkGroupListSection({...})`) porque eso es
// lo que es: un Server Component. `react-dom` en jsdom no sabe ejecutar uno, asi que se resuelve
// antes de entregar el arbol al renderer.
//
// **Las seis operaciones restantes de grupos son dobles que FALLAN si se les llama**: pintar la
// lista no muta nada y no consulta miembros (R36).
//
// **Ningun assert sobre copy** (R41): los estados se distinguen por `data-testid` DISTINTOS y por
// constantes exportadas; las filas, por los `data-testid` publicos de la tabla compartida.

import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  WORK_GROUP_LIST_EMPTY_TESTID,
  WORK_GROUP_LIST_ERROR_CODE_TESTID,
  WORK_GROUP_LIST_ERROR_MESSAGE_TESTID,
  WORK_GROUP_LIST_ERROR_TESTID,
  WORK_GROUP_LIST_RETRY_TESTID,
  WORK_GROUP_LIST_TESTID,
  WORK_GROUP_TABLE_TESTID,
  WorkGroupListSection,
} from '@/app/(private)/configuracion/usuarios/components';
import {
  UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL,
  UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID,
} from '@/components/shared/unexpected-error-notice';
import type { DataTableParams } from '@/components/shared/data-table';
import type { WorkGroupRow } from '@/lib/modules/identity';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';
import {
  REFERENCIA_DEL_CASO,
  errorInesperado,
  esperarSinIdentificador,
} from '../../../helpers/identificador-de-request';
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

// Las SIETE de grupos: solo la de listar responde. Las otras seis FALLAN si se les llama, porque
// pintar la lista no muta nada y no consulta miembros (R36).
vi.mock('@/lib/modules/identity/adapters/driving/work-group-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse al pintar la lista`);
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

// Las de PERSONAS y las de ROLES entran en el grafo por el barrel de la ruta, que republica los
// veintitres componentes. Se aislan igual: la pestana de grupos no consulta ni escribe personas.
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

/**
 * Cadena **inconfundible** a proposito: el caso de `unauthorized` busca su ausencia en todo el
 * documento, y con un valor realista no distinguiria entre «no se muestra» y «se muestra pero
 * parece otra cosa».
 */
const DATO_QUE_NO_DEBE_VERSE = 'GRUPO-SECRETO-NO-VISIBLE';

function fila(overrides: Partial<WorkGroupRow> = {}): WorkGroupRow {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    name: DATO_QUE_NO_DEBE_VERSE,
    ...overrides,
  };
}

function paginaCon(items: readonly WorkGroupRow[], extra: { page?: number; totalPages?: number } = {}) {
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
  return render(await WorkGroupListSection({ params, canModify }));
}

/** Fuente de la seccion sin comentarios: el JSDoc NOMBRA lo que el codigo no debe hacer. */
function fuenteDeLaSeccion(): string {
  const ruta = join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    'app',
    '(private)',
    'configuracion',
    'usuarios',
    'components',
    'work-group-list-section.tsx',
  );
  return readFileSync(ruta, 'utf8')
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  // jsdom no implementa `window.matchMedia`, que la tabla compartida usa. Helper HEREDADO (R39).
  setViewportWidth(WIDE_VIEWPORT);
  listWorkGroupsActionMock.mockResolvedValue(paginaCon([fila()]));
});

afterEach(() => {
  cleanup();
  resetViewport();
});

describe('los tres estados son mutuamente excluyentes y se distinguen por data-testid (R41)', () => {
  it('lista: con grupos se pinta la tabla compartida y ninguno de los otros dos', async () => {
    await renderSeccion();

    expect(screen.getByTestId(WORK_GROUP_LIST_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId(WORK_GROUP_TABLE_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId('data-table')).toBeInTheDocument();
    expect(screen.queryByTestId(WORK_GROUP_LIST_EMPTY_TESTID)).toBeNull();
    expect(screen.queryByTestId(WORK_GROUP_LIST_ERROR_TESTID)).toBeNull();
  });

  it('vacio: con cero grupos se pinta el vacio y NO una tabla (R18)', async () => {
    listWorkGroupsActionMock.mockResolvedValue(paginaCon([]));

    await renderSeccion();

    expect(screen.getByTestId(WORK_GROUP_LIST_EMPTY_TESTID)).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByTestId(WORK_GROUP_LIST_TESTID)).toBeNull();
    expect(screen.queryByTestId(WORK_GROUP_LIST_ERROR_TESTID)).toBeNull();
  });

  it('error: mensaje DEVUELTO, codigo estable y accion de reintentar (R19)', async () => {
    listWorkGroupsActionMock.mockResolvedValue({
      status: 'error',
      code: 'invalid_input',
      message: 'La consulta no es válida.',
    });

    await renderSeccion();

    expect(screen.getByTestId(WORK_GROUP_LIST_ERROR_TESTID)).toHaveAttribute('role', 'alert');
    // El mensaje es el que devolvio la action: se compara con el que el doble entrego, no con copy
    // escrito en este archivo.
    expect(screen.getByTestId(WORK_GROUP_LIST_ERROR_MESSAGE_TESTID)).toHaveTextContent(
      'La consulta no es válida.',
    );
    expect(screen.getByTestId(WORK_GROUP_LIST_ERROR_CODE_TESTID)).toHaveTextContent('invalid_input');
    expect(screen.getByTestId(WORK_GROUP_LIST_RETRY_TESTID)).toBeEnabled();

    // Lo que R19 existe para impedir: confundir «fallo» con «no hay grupos».
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByTestId(WORK_GROUP_LIST_TESTID)).toBeNull();
    expect(screen.queryByTestId(WORK_GROUP_LIST_EMPTY_TESTID)).toBeNull();
  });
});

describe('los parametros llegan ENTEROS y sin traducir a la consulta (R17, R36)', () => {
  it('la seccion pasa el mismo objeto que recibio, sin una sola clave de mas', async () => {
    const params = parametros({
      page: 2,
      pageSize: 25,
      sort: { columnId: 'name', direction: 'desc' },
      search: 'laboratorio',
    });

    await renderSeccion(params);

    expect(listWorkGroupsActionMock).toHaveBeenCalledTimes(1);
    const consulta = listWorkGroupsActionMock.mock.calls[0]![0];
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

  it('es UNA sola lectura: aqui no hay catalogo que traer, a diferencia de personas', async () => {
    await renderSeccion();

    expect(listWorkGroupsActionMock).toHaveBeenCalledTimes(1);
  });
});

describe('la pantalla no autoriza nada por su cuenta (R11)', () => {
  it('en positivo: con la consulta resuelta, el nombre del grupo SI se pinta', async () => {
    const { container } = await renderSeccion();

    expect(container.textContent).toContain(DATO_QUE_NO_DEBE_VERSE);
  });

  it('con `unauthorized` se pinta el error y NI UN SOLO DATO de grupos', async () => {
    listWorkGroupsActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No tienes permiso para consultar grupos de trabajo.',
    });

    const { container } = await renderSeccion();

    expect(screen.getByTestId(WORK_GROUP_LIST_ERROR_CODE_TESTID)).toHaveTextContent('unauthorized');
    expect(container.textContent).not.toContain(DATO_QUE_NO_DEBE_VERSE);
    expect(screen.queryByTestId(WORK_GROUP_LIST_TESTID)).toBeNull();
    expect(screen.queryByTestId(WORK_GROUP_TABLE_TESTID)).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('la seccion no lee la sesion: su fuente no toca cookies, composicion ni permisos (R10)', () => {
    const fuente = fuenteDeLaSeccion();

    for (const prohibido of ['next/headers', 'cookies(', 'lib/composition', 'requirePermission']) {
      expect(fuente, `la seccion no debe usar ${prohibido}`).not.toContain(prohibido);
    }
  });
});

describe('toda lectura pasa por la Server Action, por su RUTA EXACTA (R36)', () => {
  it('la action entra por su archivo, nunca por el barrel del modulo', () => {
    const fuente = fuenteDeLaSeccion();

    expect(fuente).toContain('@/lib/modules/identity/adapters/driving/work-group-actions');
    // Del barrel del modulo solo puede entrar un `import type`, que TypeScript borra: un import de
    // VALOR arrastraria el `'use server'` del cierre transitivo y romperia a los componentes de
    // cliente que importen el contrato.
    expect(fuente).not.toMatch(/import\s+\{[^}]*\}\s+from\s+['"]@\/lib\/modules\/identity['"]/);
  });

  it('y no hay ningun `fetch` a una ruta propia ni ningun route handler', () => {
    const fuente = fuenteDeLaSeccion();

    expect(fuente).not.toMatch(/fetch\(\s*['"`]\//);
    expect(fuente).not.toMatch(/fetch\(\s*['"`]\.{1,2}\//);
  });
});

/** QC-71 — el identificador de peticion del error inesperado en esta lista. */
describe('lista de grupos — el identificador del error inesperado (QC-71)', () => {
  it('el error inesperado ensena el identificador como texto, con su etiqueta', async () => {
    listWorkGroupsActionMock.mockResolvedValue(errorInesperado());

    await renderSeccion();

    const referencia = screen.getByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID);
    expect(referencia).toHaveTextContent(UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL);
    expect(referencia).toHaveTextContent(REFERENCIA_DEL_CASO);
  });

  it('un error del catalogo no ensena identificador ninguno', async () => {
    listWorkGroupsActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No autorizado.',
    });

    await renderSeccion();

    expect(screen.getByTestId(WORK_GROUP_LIST_ERROR_CODE_TESTID)).toHaveTextContent('unauthorized');
    esperarSinIdentificador();
  });
});
