// QC-67 T3 — El corte por permiso de la pantalla de usuarios y la decision `canModify`: R1, R4,
// R6 (mitad servidor), R8, R41.
//
// **La ubicacion se DERIVA de la constante** (R1): la ruta esperada se compone como
// `app/(private)${USERS_ROUTE}/page.tsx`. Nunca se escribe el literal de la URL.
//
// **Se mockea el PROVEEDOR DE SESION, no `requirePagePermission`.** Es la diferencia entre probar
// el corte y probar que se escribio una linea: con el doble en `@/lib/composition`, el corte se
// ejecuta de verdad —`assertPermission` incluido— y lo unico sustituido es de donde sale la sesion.
//
// **Nada se afirma por copy** (R41): la cabecera se busca por su ROL ARIA —`heading` de nivel 1—
// y los permisos se derivan del catalogo de `identity`. El `data-testid` del titulo tampoco se
// escribe a mano: desde T5 sale de `USERS_TITLE_TESTID`, la constante que declara `user-labels.ts`
// y que la propia pagina usa, importada **por el barrel de la ruta** y nunca por ruta profunda
// (R38).

import { cleanup, render, screen } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  USERS_TITLE_TESTID,
  USER_ROW_ACTIONS_TESTID,
} from '@/app/(private)/configuracion/usuarios/components';
import UsuariosPage from '@/app/(private)/configuracion/usuarios/page';
import { PERMISSIONS, type UserRow } from '@/lib/modules/identity';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';
import { LOGIN_ROUTE_SESSION_ENDED, USERS_ROUTE } from '@/lib/shared/routes';
import { WIDE_VIEWPORT, resetViewport, setViewportWidth } from '../../helpers/viewport';

const {
  getSessionUserMock,
  listUsersActionMock,
  listRolesActionMock,
  notFoundMock,
  redirectMock,
  routerMock,
} = vi.hoisted(() => ({
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
  // `notFound()` y `redirect()` estan tipadas `(): never` y LANZAN. Los dobles hacen lo mismo: si
  // no lanzaran, el corte seguiria ejecutandose y el test mediria otra cosa.
  notFoundMock: vi.fn<() => never>(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  redirectMock: vi.fn<(ruta: string) => never>(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => routerMock,
  notFound: notFoundMock,
  redirect: redirectMock,
}));

vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock, endSession: vi.fn<() => Promise<void>>() },
}));

// Las SEIS actions de usuarios. Las cuatro de escritura son dobles que FALLAN si se les llama:
// pintar la lista no muta nada.
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
// QC-101 T7 — La Server Action del CIERRE DE SESIONES, doble que FALLA si se la llama.
//
// Mismo motivo que el bloque de grupos: el panel de detalle monta ahora el dialogo del cierre de
// sesiones, y `session-actions.ts` lee `observabilidad` de `@/lib/composition` al cargarse —y el
// doble de composicion de este archivo declara solo `identity`—. Pintar la pantalla no cierra la
// sesion de nadie: si alguien la llamara, el caso se pondria rojo.
vi.mock('@/lib/modules/identity/adapters/driving/session-actions', () => ({
  endAllSessionsAction: vi.fn(() => {
    throw new Error('endAllSessionsAction no debe invocarse al pintar la pantalla');
  }),
}));

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

const RAIZ = join(__dirname, '..', '..', '..');
const RUTA_PAGINA = join(RAIZ, 'app', '(private)', ...USERS_ROUTE.split('/').filter(Boolean));

/** Fuente de la pagina sin comentarios: el JSDoc explica el corte y NOMBRA lo que prohibe. */
function fuenteDeLaPagina(): string {
  return readFileSync(join(RUTA_PAGINA, 'page.tsx'), 'utf8')
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ');
}

/** Los dos codigos del modulo `usuarios`, DERIVADOS del catalogo (R41): nunca escritos a mano. */
const CODIGOS_DE_USUARIOS: readonly string[] = PERMISSIONS.filter(
  (entrada) => entrada.module === 'usuarios',
).map((entrada) => entrada.code);

const PERMISO_DE_CONSULTA = 'usuarios.consultar';
const PERMISO_DE_ESCRITURA = 'usuarios.modificar';

function sesionCon(permissions: readonly string[]) {
  return {
    id: '99999999-9999-4999-8999-999999999999',
    username: 'admin.prueba',
    displayName: 'Admin De Prueba',
    roleName: 'Administrador',
    permissions,
  };
}

/** Una fila cualquiera: lo que la pantalla haga con ella depende SOLO de `canModify` (R6). */
const FILA: UserRow = {
  id: '11111111-1111-4111-8111-111111111111',
  displayName: 'Lopez Perez, Ana',
  username: 'ana.lopez',
  email: 'ana.lopez@example.com',
  roleName: 'Operador',
  accountStatus: 'active',
};

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
 * componente `async` —se queda suspendido para siempre—, asi que sin esto la lista no llegaria a
 * pintarse nunca. Lo que se conserva es el arbol REAL de `page.tsx`: la `<Suspense>`, su `key` y
 * su `fallback` siguen siendo los que declara la pagina. Copiado de `unit-page.test.tsx`.
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

/** Arbol que devuelve la pagina real, sin resolver: la seccion sigue siendo `async`. */
async function arbolDeLaPantalla(searchParams: Consulta = {}) {
  return UsuariosPage({ searchParams: Promise.resolve(searchParams) });
}

/** Monta la pantalla con la lista ya resuelta. */
async function renderPantalla(searchParams: Consulta = {}) {
  return render(await resolverServerComponents(await arbolDeLaPantalla(searchParams)));
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  // jsdom no implementa `window.matchMedia`, que la tabla compartida usa. Se stubea con el helper
  // HEREDADO (`tests/helpers/viewport.ts`), nunca con una copia local (R39).
  setViewportWidth(WIDE_VIEWPORT);
  getSessionUserMock.mockResolvedValue(sesionCon(CODIGOS_DE_USUARIOS));
  listUsersActionMock.mockResolvedValue(paginaCon([FILA]));
  listRolesActionMock.mockResolvedValue({ status: 'success', data: [] });
});

afterEach(() => {
  cleanup();
  resetViewport();
});

describe('ancla: el catalogo declara los dos codigos que este archivo usa', () => {
  it('usuarios.consultar y usuarios.modificar existen y son exactamente esos', () => {
    // Anti-vacuidad: si alguien renombrara un codigo, los casos de abajo estarian probando una
    // sesion con permisos inventados en vez del corte real.
    expect([...CODIGOS_DE_USUARIOS].sort()).toEqual([PERMISO_DE_CONSULTA, PERMISO_DE_ESCRITURA]);
  });
});

describe('la pantalla vive en la ruta DERIVADA de la constante (R1)', () => {
  it('existe `app/(private)${USERS_ROUTE}/page.tsx`, compuesto a partir de la constante', () => {
    expect(existsSync(join(RUTA_PAGINA, 'page.tsx'))).toBe(true);
  });
});

describe('la pantalla NO declara armazon propio: lo hereda del layout privado (R1, R39)', () => {
  it('no monta ningun landmark principal, ni barra lateral, ni cabecera de aplicacion', async () => {
    await renderPantalla();

    expect(screen.queryByRole('main')).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('banner')).toBeNull();
  });

  it('su fuente no monta la region de avisos ni el armazon: en la zona privada hay UNA sola', () => {
    const fuente = fuenteDeLaPagina();

    for (const prohibido of ['Toaster', 'SidebarProvider', 'AppSidebar', 'SidebarInset']) {
      expect(fuente, `page.tsx no debe montar ${prohibido}`).not.toContain(prohibido);
    }
  });
});

describe('el corte por permiso ocurre antes de leer o pintar nada (R4)', () => {
  it('sin sesion redirige al login, y NO responde 404: un anonimo no recibe 404', async () => {
    getSessionUserMock.mockResolvedValue(null);

    await expect(arbolDeLaPantalla()).rejects.toThrow();

    expect(redirectMock).toHaveBeenCalledWith(LOGIN_ROUTE_SESSION_ENDED);
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('con sesion pero sin `usuarios.consultar` responde 404, no redirige', async () => {
    // Lleva el OTRO permiso del modulo a proposito: QC-74 decidio que `modificar` NO concede
    // `consultar`, y este caso es lo que lo demuestra en la pantalla.
    getSessionUserMock.mockResolvedValue(sesionCon([PERMISO_DE_ESCRITURA]));

    await expect(arbolDeLaPantalla()).rejects.toThrow();

    expect(notFoundMock).toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('con una sesion sin ningun permiso responde 404 igual: falla cerrado', async () => {
    getSessionUserMock.mockResolvedValue(sesionCon([]));

    await expect(arbolDeLaPantalla()).rejects.toThrow();

    expect(notFoundMock).toHaveBeenCalled();
  });

  it('con `usuarios.consultar` la pantalla se sirve y pinta su cabecera', async () => {
    getSessionUserMock.mockResolvedValue(sesionCon([PERMISO_DE_CONSULTA]));

    await renderPantalla();

    expect(notFoundMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('el titulo se identifica por la constante exportada, no por un literal (R41)', async () => {
    getSessionUserMock.mockResolvedValue(sesionCon([PERMISO_DE_CONSULTA]));

    await renderPantalla();

    expect(screen.getByRole('heading', { level: 1 })).toBe(screen.getByTestId(USERS_TITLE_TESTID));
    // Y la pagina NO escribe el identificador a mano: lo importa del barrel de la ruta (R38).
    expect(fuenteDeLaPagina()).not.toContain(`"${USERS_TITLE_TESTID}"`);
    expect(fuenteDeLaPagina()).toContain('USERS_TITLE_TESTID');
  });

  it('el corte es UNO SOLO y es el de consultar: `modificar` no cierra la pantalla', async () => {
    // A diferencia de QC-39, cortar tambien por `usuarios.modificar` dejaria fuera a quien tiene
    // exactamente el permiso que la lista exige (`design.md > 3`).
    const llamadas = fuenteDeLaPagina().match(/requirePagePermission\(/g) ?? [];

    expect(llamadas).toHaveLength(1);
    expect(fuenteDeLaPagina()).toContain(`requirePagePermission('${PERMISO_DE_CONSULTA}')`);
  });

  it('la exigencia del permiso precede a cualquier lectura de la URL', async () => {
    // Desde T4 la pantalla SI resuelve `searchParams`, asi que el caso es incondicional: exige que
    // esa lectura exista y que el corte la preceda. Condicionarlo a que aparezca —como se escribio
    // en T3, cuando aun no existia— dejaba un aserto que un simple renombrado podia apagar en
    // silencio, sin un solo rojo. Si algun dia la pagina deja de resolver la URL, que se entere
    // este archivo.
    const fuente = fuenteDeLaPagina();
    const lectura = fuente.indexOf('await searchParams');

    expect(lectura, 'la pagina tiene que resolver `searchParams`').toBeGreaterThanOrEqual(0);

    const corte = fuente.indexOf(`requirePagePermission('${PERMISO_DE_CONSULTA}')`);
    expect(corte).toBeGreaterThanOrEqual(0);
    expect(corte, 'el permiso se exige DESPUES de leer la URL').toBeLessThan(lectura);

    // Y es la PRIMERA sentencia del cuerpo: nada se resuelve antes que el corte.
    const cuerpo = fuente.slice(fuente.indexOf('export default async function'));
    expect(cuerpo.indexOf('requirePagePermission(')).toBeLessThan(cuerpo.indexOf('canModify'));
  });
});

describe('`canModify` sale de assertPermission y de nada mas (R6, R8)', () => {
  // Desde T7 la decision tiene CONSUMIDOR REAL: baja por props hasta la celda de acciones, asi que
  // se afirma sobre lo que R6 promete —que se emite y que no se emite en el HTML servido— y ya no
  // sobre un atributo provisional en el contenedor de la pagina.
  it('con `usuarios.modificar` las acciones de fila se emiten', async () => {
    getSessionUserMock.mockResolvedValue(sesionCon(CODIGOS_DE_USUARIOS));

    await renderPantalla();

    expect(screen.getByTestId(USER_ROW_ACTIONS_TESTID)).toBeInTheDocument();
  });

  it('sin `usuarios.modificar` no se emite ninguna escritura, pero la pantalla se sirve', async () => {
    getSessionUserMock.mockResolvedValue(sesionCon([PERMISO_DE_CONSULTA]));

    await renderPantalla();

    // Ni disparador, ni boton deshabilitado, ni panel, ni dialogo: nada en el arbol servido (R6).
    expect(screen.queryByTestId(USER_ROW_ACTIONS_TESTID)).toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('la fuente NO compara el conjunto de permisos a mano', () => {
    // QC-74 R12 dejo `assertPermission` como la UNICA implementacion de «el actor tiene este
    // permiso». Una comparacion escrita aqui seria una segunda definicion de autorizacion, libre
    // de divergir de la primera en silencio.
    const fuente = fuenteDeLaPagina();

    expect(fuente.trim().length).toBeGreaterThan(0);
    expect(fuente).toContain('assertPermission');
    for (const prohibido of ['.includes(', '.some(', '.indexOf(', '.find(', '.filter(']) {
      expect(fuente, `page.tsx no debe comparar permisos con ${prohibido}`).not.toContain(
        prohibido,
      );
    }
  });

  it('R16 — QC-101: el `currentUserId` sale de la MISMA lectura de sesion que `canModify` y baja por props', () => {
    const fuente = fuenteDeLaPagina();

    // Una sola lectura de la sesion en la pagina: la que ya resolvia `canModify`.
    expect(fuente.match(/getSessionUser\(/g) ?? []).toHaveLength(1);
    // Y la seccion la recibe por props, sin que ningun componente de cliente la lea.
    expect(fuente).toMatch(/<UserListSection\b[^>]*\bcurrentUserId=\{currentUserId\}/);
  });

  it('la pantalla no se construye sus propios datos: nada de DB ni de fetch a rutas propias', () => {
    // El unico consumo de servidor que R8 permite aqui es la sesion, y viaja a los componentes de
    // cliente por props. El resto —lista y roles— llega por Server Actions en T7.
    const fuente = fuenteDeLaPagina();

    for (const prohibido of ['prisma', '@/db', "fetch('/api", 'next/headers']) {
      expect(fuente, `page.tsx no debe usar ${prohibido}`).not.toContain(prohibido);
    }
  });
});
