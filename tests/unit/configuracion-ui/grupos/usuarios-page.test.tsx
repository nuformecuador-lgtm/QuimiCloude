// QC-85 T2 — La pagina con pestanas: R6 (la de personas sigue igual) y R8 (un solo corte).
//
// **No sustituye a `tests/unit/configuracion-ui/usuarios-page.test.tsx`, lo complementa**: aquel
// archivo es de QC-67 y esta feature NO lo toca. Aqui se afirma lo que QC-85 anade —que la pestana
// vigente decide QUE seccion se monta— y lo que QC-85 promete NO cambiar: que sin `tab` la pantalla
// de personas se sirve exactamente igual y que el corte por permiso sigue siendo uno solo, el de
// `usuarios.consultar`.
//
// **Se mockea el PROVEEDOR DE SESION, no `requirePagePermission`**: asi el corte se ejecuta de
// verdad —`assertPermission` incluido— y lo unico sustituido es de donde sale la sesion. Mismo
// criterio que el archivo hermano.
//
// **Ningun assert sobre copy** (R41): la cabecera por su rol ARIA, las secciones por las
// constantes exportadas del barrel de la ruta, y los permisos derivados del catalogo de `identity`.

import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  GROUPS_TAB,
  PAGE_PARAM,
  PAGE_SIZE_PARAM,
  SEARCH_PARAM,
  SORT_PARAM,
  TAB_PARAM,
  USERS_TAB,
  USERS_TITLE_TESTID,
  USER_TABLE_TESTID,
  USUARIOS_TABS_TESTID,
  WORK_GROUP_TABLE_TESTID,
  USUARIOS_TAB_TESTIDS,
  WORK_GROUP_SECTION_TESTID,
  parseUserListParams,
} from '@/app/(private)/configuracion/usuarios/components';
import UsuariosPage from '@/app/(private)/configuracion/usuarios/page';
import { PERMISSIONS, type UserRow, type WorkGroupRow } from '@/lib/modules/identity';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';
import { USERS_ROUTE } from '@/lib/shared/routes';
import { WIDE_VIEWPORT, resetViewport, setViewportWidth } from '../../../helpers/viewport';

const {
  getSessionUserMock,
  listUsersActionMock,
  listRolesActionMock,
  listWorkGroupsActionMock,
  notFoundMock,
  redirectMock,
} = vi.hoisted(() => ({
    getSessionUserMock: vi.fn<() => Promise<unknown>>(),
    listUsersActionMock: vi.fn<(query: unknown) => Promise<unknown>>(),
    listRolesActionMock: vi.fn<() => Promise<unknown>>(),
    listWorkGroupsActionMock: vi.fn<(query: unknown) => Promise<unknown>>(),
    notFoundMock: vi.fn<() => never>(() => {
      throw new Error('NEXT_NOT_FOUND');
    }),
    redirectMock: vi.fn<(ruta: string) => never>(() => {
      throw new Error('NEXT_REDIRECT');
    }),
  }));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    refresh: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  }),
  notFound: notFoundMock,
  redirect: redirectMock,
}));

vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock, endSession: vi.fn<() => Promise<void>>() },
}));

// Las SEIS actions de usuarios. Las cuatro de escritura FALLAN si se les llama: pintar una pestana
// no muta nada.
vi.mock('@/lib/modules/identity/adapters/driving/user-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse al pintar la pantalla`);
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
// Mismo motivo que el bloque de grupos: el panel de detalle de personas monta ahora el dialogo del
// cierre de sesiones, y `session-actions.ts` lee `observabilidad` de `@/lib/composition` al
// cargarse —y el doble de composicion de este archivo declara solo `identity`—. Ninguna pestana
// cierra la sesion de nadie al pintarse: si alguien la llamara, el caso se pondria rojo.
vi.mock('@/lib/modules/identity/adapters/driving/session-actions', () => ({
  endAllSessionsAction: vi.fn(() => {
    throw new Error('endAllSessionsAction no debe invocarse al pintar la pantalla');
  }),
}));

// Las SIETE Server Actions de GRUPOS. Solo la de listar responde: la pestana de grupos LEE, y las
// cinco mutaciones mas la lista de miembros FALLAN si se les llama, porque pintar una pestana no
// muta nada ni abre ningun panel (R36).
vi.mock('@/lib/modules/identity/adapters/driving/work-group-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse al pintar la pantalla`);
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

const RAIZ = join(__dirname, '..', '..', '..', '..');

/** La ruta de la pagina, DERIVADA de la constante: nunca el literal de la URL. */
const RUTA_PAGINA = join(RAIZ, 'app', '(private)', ...USERS_ROUTE.split('/').filter(Boolean));

/** Fuente de la pagina sin comentarios: el JSDoc explica el corte y NOMBRA lo que prohibe. */
function fuenteDeLaPagina(): string {
  return readFileSync(join(RUTA_PAGINA, 'page.tsx'), 'utf8')
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ');
}

/** Los codigos del modulo `usuarios`, DERIVADOS del catalogo (R41): nunca escritos a mano. */
const CODIGOS_DE_USUARIOS: readonly string[] = PERMISSIONS.filter(
  (entrada) => entrada.module === 'usuarios',
).map((entrada) => entrada.code);

const PERMISO_DE_CONSULTA = 'usuarios.consultar';
const PERMISO_DE_ESCRITURA = 'usuarios.modificar';

/** Todos los codigos del catalogo: la lista contra la que se mide «ningun permiso nuevo» (R8). */
const TODOS_LOS_CODIGOS: readonly string[] = PERMISSIONS.map((entrada) => entrada.code);

function sesionCon(permissions: readonly string[]) {
  return {
    id: '99999999-9999-4999-8999-999999999999',
    username: 'admin.prueba',
    displayName: 'Admin De Prueba',
    roleName: 'Administrador',
    permissions,
  };
}

const FILA: UserRow = {
  id: '11111111-1111-4111-8111-111111111111',
  displayName: 'Lopez Perez, Ana',
  username: 'ana.lopez',
  email: 'ana.lopez@example.com',
  roleName: 'Operador',
  accountStatus: 'active',
};

/** Una fila de grupo: `id`, `name` y `members` (R12). */
const GRUPO: WorkGroupRow = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Laboratorio',
  members: [],
};

function paginaDeGruposCon(items: readonly WorkGroupRow[]) {
  return {
    status: 'success',
    data: { items, total: items.length, page: 1, pageSize: DEFAULT_PAGE_SIZE, totalPages: 1 },
  };
}

function paginaCon(items: readonly UserRow[]) {
  return {
    status: 'success',
    data: { items, total: items.length, page: 1, pageSize: DEFAULT_PAGE_SIZE, totalPages: 1 },
  };
}

/**
 * Resuelve los Server Components `async` del arbol antes de entregarselo al renderer de cliente.
 *
 * **No es un atajo, es una limitacion real del entorno**: `react-dom` en jsdom no sabe ejecutar un
 * componente `async`. Es el mismo helper que ya usan `usuarios-page.test.tsx`, `unit-page.test.tsx`
 * y `presentation-page.test.tsx`; se copia su forma a proposito, sin inventar una segunda.
 */
async function resolverServerComponents(nodo: ReactNode): Promise<ReactNode> {
  if (Array.isArray(nodo)) {
    return Promise.all((nodo as ReactNode[]).map((hijo) => resolverServerComponents(hijo)));
  }
  if (!isValidElement(nodo)) return nodo;

  const elemento = nodo as ReactElement<{ children?: ReactNode }>;
  const tipo = elemento.type;

  if (typeof tipo === 'function' && tipo.constructor.name === 'AsyncFunction') {
    const producido = await (tipo as (props: unknown) => Promise<ReactNode>)(elemento.props);
    return resolverServerComponents(producido);
  }

  const hijos = elemento.props.children;
  if (hijos === undefined) return elemento;

  const resueltos = await resolverServerComponents(hijos);

  return Array.isArray(resueltos)
    ? cloneElement(elemento, undefined, ...(resueltos as ReactNode[]))
    : cloneElement(elemento, undefined, resueltos);
}

type Consulta = Record<string, string | string[] | undefined>;

async function arbolDeLaPantalla(searchParams: Consulta = {}) {
  return UsuariosPage({ searchParams: Promise.resolve(searchParams) });
}

async function renderPantalla(searchParams: Consulta = {}) {
  return render(await resolverServerComponents(await arbolDeLaPantalla(searchParams)));
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  setViewportWidth(WIDE_VIEWPORT);
  getSessionUserMock.mockResolvedValue(sesionCon(CODIGOS_DE_USUARIOS));
  listUsersActionMock.mockResolvedValue(paginaCon([FILA]));
  listRolesActionMock.mockResolvedValue({ status: 'success', data: [] });
  listWorkGroupsActionMock.mockResolvedValue(paginaDeGruposCon([GRUPO]));
});

afterEach(() => {
  cleanup();
  resetViewport();
});

describe('sin `tab` la pestana de personas se sirve EXACTAMENTE como antes (R6)', () => {
  it('monta la seccion de personas, su tabla y el conmutador, y nada de grupos', async () => {
    await renderPantalla();

    expect(screen.getByTestId(USUARIOS_TABS_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId(USER_TABLE_TESTID)).toBeInTheDocument();
    expect(screen.queryByTestId(WORK_GROUP_SECTION_TESTID)).toBeNull();
    expect(screen.getByTestId(USUARIOS_TAB_TESTIDS[USERS_TAB])).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('la lista se pide con los MISMOS parametros que el parser de siempre produce', async () => {
    const consulta: Consulta = {
      [PAGE_PARAM]: '2',
      [PAGE_SIZE_PARAM]: '25',
      [SORT_PARAM]: 'username:desc',
      [SEARCH_PARAM]: 'ana',
    };

    await renderPantalla(consulta);

    // El aserto se compara contra `parseUserListParams`, no contra un objeto escrito aqui: si el
    // significado de un parametro de lista cambiara, cambiaria en los dos sitios a la vez.
    expect(listUsersActionMock).toHaveBeenCalledTimes(1);
    expect(listUsersActionMock).toHaveBeenCalledWith(parseUserListParams(consulta));
  });

  it('`tab` NO contamina los parametros de lista de personas', async () => {
    const consulta: Consulta = { [TAB_PARAM]: USERS_TAB, [PAGE_PARAM]: '3' };

    await renderPantalla(consulta);

    expect(listUsersActionMock).toHaveBeenCalledWith(parseUserListParams(consulta));
    expect(screen.getByTestId(USER_TABLE_TESTID)).toBeInTheDocument();
  });

  it('un `tab` desconocido tampoco rompe nada: se sirve personas (R2, R6)', async () => {
    await renderPantalla({ [TAB_PARAM]: 'marciano' });

    expect(screen.getByTestId(USER_TABLE_TESTID)).toBeInTheDocument();
    expect(screen.queryByTestId(WORK_GROUP_SECTION_TESTID)).toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });
});

describe('con `tab=grupos` se monta UNA sola seccion, la de grupos (R1, R6)', () => {
  it('pinta la lista de grupos y NO la tabla de personas', async () => {
    await renderPantalla({ [TAB_PARAM]: GROUPS_TAB });

    expect(screen.getByTestId(WORK_GROUP_SECTION_TESTID)).toBeInTheDocument();
    // La seccion ya no es un hueco: dentro vive la tabla real de grupos (T6, T7).
    expect(screen.getByTestId(WORK_GROUP_TABLE_TESTID)).toBeInTheDocument();
    expect(listWorkGroupsActionMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId(USER_TABLE_TESTID)).toBeNull();
    expect(screen.getByTestId(USUARIOS_TAB_TESTIDS[GROUPS_TAB])).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('y NO consulta la lista de personas: la pestana que no se ve no se pide', async () => {
    await renderPantalla({ [TAB_PARAM]: GROUPS_TAB });

    expect(listUsersActionMock).not.toHaveBeenCalled();
  });

  it('y al reves: sin `tab`, la lista de GRUPOS no se consulta (R7)', async () => {
    await renderPantalla();

    expect(listWorkGroupsActionMock).not.toHaveBeenCalled();
  });

  it('la cabecera y el conmutador siguen ahi: la pantalla es la misma', async () => {
    await renderPantalla({ [TAB_PARAM]: GROUPS_TAB });

    expect(screen.getByRole('heading', { level: 1 })).toBe(screen.getByTestId(USERS_TITLE_TESTID));
    expect(screen.getByTestId(USUARIOS_TABS_TESTID)).toBeInTheDocument();
  });
});

describe('el corte por permiso sigue siendo UNO SOLO y el de siempre (R8)', () => {
  it('ancla: el catalogo declara los dos codigos que este archivo usa', () => {
    expect([...CODIGOS_DE_USUARIOS].sort()).toEqual([PERMISO_DE_CONSULTA, PERMISO_DE_ESCRITURA]);
  });

  it('la fuente llama a `requirePagePermission` una vez, con `usuarios.consultar`', () => {
    const fuente = fuenteDeLaPagina();
    const llamadas = fuente.match(/requirePagePermission\(/g) ?? [];

    expect(llamadas).toHaveLength(1);
    expect(fuente).toContain(`requirePagePermission('${PERMISO_DE_CONSULTA}')`);
  });

  it('y es la PRIMERA sentencia del cuerpo: la pestana se resuelve despues', () => {
    const fuente = fuenteDeLaPagina();
    const cuerpo = fuente.slice(fuente.indexOf('export default async function'));

    const corte = cuerpo.indexOf('requirePagePermission(');
    const lecturaDeLaUrl = cuerpo.indexOf('await searchParams');
    const pestana = cuerpo.indexOf('parseUsuariosTab(');

    expect(corte).toBeGreaterThanOrEqual(0);
    expect(lecturaDeLaUrl, 'la pagina tiene que resolver `searchParams`').toBeGreaterThan(corte);
    expect(pestana, 'la pestana se resuelve DESPUES del corte').toBeGreaterThan(corte);
  });

  it('la pestana de grupos no declara ningun codigo de permiso nuevo', () => {
    const fuente = fuenteDeLaPagina();
    const codigos = [...fuente.matchAll(/'([a-z_]+\.[a-z_]+)'/g)].map(
      (coincidencia) => coincidencia[1],
    );

    // Todo lo que parezca un codigo de permiso en la fuente tiene que ser del modulo `usuarios`:
    // ni «grupos.consultar» ni nada inventado.
    for (const codigo of codigos) {
      if (!TODOS_LOS_CODIGOS.includes(codigo)) continue;
      expect(CODIGOS_DE_USUARIOS).toContain(codigo);
    }
    expect(codigos).toContain(PERMISO_DE_CONSULTA);
  });

  it('con solo `usuarios.consultar`, la pestana de grupos SE SIRVE: no anade corte', async () => {
    getSessionUserMock.mockResolvedValue(sesionCon([PERMISO_DE_CONSULTA]));

    await renderPantalla({ [TAB_PARAM]: GROUPS_TAB });

    expect(notFoundMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(screen.getByTestId(WORK_GROUP_SECTION_TESTID)).toBeInTheDocument();
  });

  it('sin `usuarios.consultar` responde 404 tambien con `tab=grupos`: el corte precede', async () => {
    getSessionUserMock.mockResolvedValue(sesionCon([PERMISO_DE_ESCRITURA]));

    await expect(arbolDeLaPantalla({ [TAB_PARAM]: GROUPS_TAB })).rejects.toThrow();

    expect(notFoundMock).toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(listUsersActionMock).not.toHaveBeenCalled();
  });
});
