// QC-155 T6 — El corte por permiso de la pantalla de clientes y la decision `canModify`: R3, R5,
// R6, R8.
//
// **La ubicacion se DERIVA de la constante** (R1): la ruta esperada se compone como
// `app/(private)${CUSTOMERS_ROUTE}/page.tsx`.
//
// **Se mockea el PROVEEDOR DE SESION, no `requirePagePermission`.** Con el doble en
// `@/lib/composition`, el corte se ejecuta de verdad —`assertPermission` incluido— y lo unico
// sustituido es de donde sale la sesion. Copia de `usuarios-page.test.tsx`.
//
// **Nada se afirma por copy** (R40): la cabecera se busca por su ROL ARIA y los permisos se
// derivan del catalogo de `identity`.

import { cleanup, render, screen } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CUSTOMERS_TITLE_TESTID, CUSTOMER_ROW_ACTIONS_TESTID } from '@/app/(private)/clientes/components';
import ClientesPage from '@/app/(private)/clientes/page';
import type { CustomerView } from '@/lib/modules/clientes';
import {
  PERMISSIONS,
  ROLE_ADMINISTRADOR,
  ROLE_EMPACADOR,
  ROLE_OPERADOR,
  SEED_ROLE_PERMISSIONS,
} from '@/lib/modules/identity';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';
import { CUSTOMERS_ROUTE, LOGIN_ROUTE_SESSION_ENDED } from '@/lib/shared/routes';
import { WIDE_VIEWPORT, resetViewport, setViewportWidth } from '../../helpers/viewport';

const { getSessionUserMock, listCustomersActionMock, notFoundMock, redirectMock, routerMock } = vi.hoisted(
  () => ({
    getSessionUserMock: vi.fn<() => Promise<unknown>>(),
    listCustomersActionMock: vi.fn<(query: unknown) => Promise<unknown>>(),
    routerMock: {
      push: vi.fn<(href: string) => void>(),
      replace: vi.fn<(href: string) => void>(),
      refresh: vi.fn<() => void>(),
      back: vi.fn<() => void>(),
      forward: vi.fn<() => void>(),
      prefetch: vi.fn<(href: string) => void>(),
    },
    // `notFound()` y `redirect()` estan tipadas `(): never` y LANZAN. Los dobles hacen lo mismo:
    // si no lanzaran, el corte seguiria ejecutandose y el test mediria otra cosa.
    notFoundMock: vi.fn<() => never>(() => {
      throw new Error('NEXT_NOT_FOUND');
    }),
    redirectMock: vi.fn<(ruta: string) => never>(() => {
      throw new Error('NEXT_REDIRECT');
    }),
  }),
);

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => routerMock,
  notFound: notFoundMock,
  redirect: redirectMock,
}));

vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock },
}));

// Las CINCO actions de clientes. Las cuatro de escritura son dobles que FALLAN si se les llama:
// pintar la lista no muta nada.
vi.mock('@/lib/modules/clientes/adapters/driving/customer-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse al pintar la lista`);
  };
  return {
    listCustomersAction: listCustomersActionMock,
    getCustomerAction: vi.fn(noDebeInvocarse('getCustomerAction')),
    createCustomerAction: vi.fn(noDebeInvocarse('createCustomerAction')),
    updateCustomerAction: vi.fn(noDebeInvocarse('updateCustomerAction')),
    deleteCustomerAction: vi.fn(noDebeInvocarse('deleteCustomerAction')),
  };
});

const RAIZ = join(__dirname, '..', '..', '..');
const RUTA_PAGINA = join(RAIZ, 'app', '(private)', ...CUSTOMERS_ROUTE.split('/').filter(Boolean));

/** Fuente de la pagina sin comentarios: el JSDoc explica el corte y NOMBRA lo que prohibe. */
function fuenteDeLaPagina(): string {
  return readFileSync(join(RUTA_PAGINA, 'page.tsx'), 'utf8')
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ');
}

/** Los dos codigos del modulo `clientes`, DERIVADOS del catalogo (R40): nunca escritos a mano. */
const CODIGOS_DE_CLIENTES: readonly string[] = PERMISSIONS.filter(
  (entrada) => entrada.module === 'clientes',
).map((entrada) => entrada.code);

const PERMISO_DE_CONSULTA = 'clientes.consultar';
const PERMISO_DE_ESCRITURA = 'clientes.modificar';

function sesionCon(permissions: readonly string[], roleName: string = ROLE_ADMINISTRADOR) {
  return {
    id: '99999999-9999-4999-8999-999999999999',
    username: 'admin.prueba',
    displayName: 'Admin De Prueba',
    roleName,
    permissions,
  };
}

/** Un cliente cualquiera: lo que la pantalla haga con el depende SOLO de `canModify` (R5). */
const CLIENTE: CustomerView = {
  id: '11111111-1111-4111-8111-111111111111',
  firstNames: 'Ana',
  lastNames: 'Lopez',
  city: 'Bogota',
  phone: null,
  email: null,
  address: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  createdBy: null,
  updatedBy: null,
};

function paginaCon(items: readonly CustomerView[]) {
  return {
    status: 'success',
    data: { items, total: items.length, page: 1, pageSize: DEFAULT_PAGE_SIZE, totalPages: 1 },
  };
}

/**
 * Resuelve los Server Components `async` del arbol antes de entregarselo al renderer de cliente.
 * Copiado de `usuarios-page.test.tsx`.
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
  return ClientesPage({ searchParams: Promise.resolve(searchParams) });
}

/** Monta la pantalla con la lista ya resuelta. */
async function renderPantalla(searchParams: Consulta = {}) {
  return render(await resolverServerComponents(await arbolDeLaPantalla(searchParams)));
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  // jsdom no implementa `window.matchMedia`, que la tabla compartida usa. Se stubea con el helper
  // HEREDADO (`tests/helpers/viewport.ts`), nunca con una copia local.
  setViewportWidth(WIDE_VIEWPORT);
  getSessionUserMock.mockResolvedValue(sesionCon(CODIGOS_DE_CLIENTES));
  listCustomersActionMock.mockResolvedValue(paginaCon([CLIENTE]));
});

afterEach(() => {
  cleanup();
  resetViewport();
});

describe('ancla: el catalogo declara los dos codigos que este archivo usa', () => {
  it('clientes.consultar y clientes.modificar existen y son exactamente esos', () => {
    expect([...CODIGOS_DE_CLIENTES].sort()).toEqual([PERMISO_DE_CONSULTA, PERMISO_DE_ESCRITURA]);
  });
});

describe('la pantalla vive en la ruta DERIVADA de la constante (R1)', () => {
  it('existe `app/(private)${CUSTOMERS_ROUTE}/page.tsx`, compuesto a partir de la constante', () => {
    expect(existsSync(join(RUTA_PAGINA, 'page.tsx'))).toBe(true);
  });
});

describe('la pantalla NO declara armazon propio: lo hereda del layout privado (R1)', () => {
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

describe('el corte por permiso ocurre antes de leer o pintar nada (R3)', () => {
  it('sin sesion redirige al login, y NO responde 404: un anonimo no recibe 404', async () => {
    getSessionUserMock.mockResolvedValue(null);

    await expect(arbolDeLaPantalla()).rejects.toThrow();

    expect(redirectMock).toHaveBeenCalledWith(LOGIN_ROUTE_SESSION_ENDED);
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('con sesion pero sin `clientes.consultar` responde 404, no redirige', async () => {
    // Lleva el OTRO permiso del modulo a proposito: QC-74 decidio que `modificar` NO concede
    // `consultar`.
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

  it('con `clientes.consultar` la pantalla se sirve y pinta su cabecera', async () => {
    getSessionUserMock.mockResolvedValue(sesionCon([PERMISO_DE_CONSULTA]));

    await renderPantalla();

    expect(notFoundMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('el titulo se identifica por la constante exportada, no por un literal (R40)', async () => {
    getSessionUserMock.mockResolvedValue(sesionCon([PERMISO_DE_CONSULTA]));

    await renderPantalla();

    expect(screen.getByRole('heading', { level: 1 })).toBe(screen.getByTestId(CUSTOMERS_TITLE_TESTID));
    expect(fuenteDeLaPagina()).not.toContain(`"${CUSTOMERS_TITLE_TESTID}"`);
    expect(fuenteDeLaPagina()).toContain('CUSTOMERS_TITLE_TESTID');
  });

  it('el corte es UNO SOLO y es el de consultar: `modificar` no cierra la pantalla', async () => {
    const llamadas = fuenteDeLaPagina().match(/requirePagePermission\(/g) ?? [];

    expect(llamadas).toHaveLength(1);
    expect(fuenteDeLaPagina()).toContain(`requirePagePermission('${PERMISO_DE_CONSULTA}')`);
  });

  it('la exigencia del permiso precede a cualquier lectura de la URL', async () => {
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

describe('`canModify` sale de assertPermission y de nada mas (R5, R8)', () => {
  it('con `clientes.modificar` las acciones de fila se emiten', async () => {
    getSessionUserMock.mockResolvedValue(sesionCon(CODIGOS_DE_CLIENTES));

    await renderPantalla();

    expect(screen.getByTestId(CUSTOMER_ROW_ACTIONS_TESTID)).toBeInTheDocument();
  });

  it('sin `clientes.modificar` no se emite ninguna escritura, pero la pantalla se sirve', async () => {
    getSessionUserMock.mockResolvedValue(sesionCon([PERMISO_DE_CONSULTA]));

    await renderPantalla();

    // Ni disparador, ni boton deshabilitado, ni panel, ni dialogo: nada en el arbol servido (R5).
    expect(screen.queryByTestId(CUSTOMER_ROW_ACTIONS_TESTID)).toBeNull();
    expect(screen.queryByTestId('customer-create-open')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('la fuente NO compara el conjunto de permisos a mano', () => {
    const fuente = fuenteDeLaPagina();

    expect(fuente.trim().length).toBeGreaterThan(0);
    expect(fuente).toContain('assertPermission');
    for (const prohibido of ['.includes(', '.some(', '.indexOf(', '.find(', '.filter(']) {
      expect(fuente, `page.tsx no debe comparar permisos con ${prohibido}`).not.toContain(
        prohibido,
      );
    }
  });

  it('la pantalla no se construye sus propios datos: nada de DB ni de fetch a rutas propias', () => {
    const fuente = fuenteDeLaPagina();

    for (const prohibido of ['prisma', '@/db', "fetch('/api", 'next/headers']) {
      expect(fuente, `page.tsx no debe usar ${prohibido}`).not.toContain(prohibido);
    }
  });
});

describe('a nivel de pantalla, con los tres conjuntos de permisos del seed (R6)', () => {
  it.each([
    [ROLE_ADMINISTRADOR, SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]],
    [ROLE_OPERADOR, SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]],
    [ROLE_EMPACADOR, SEED_ROLE_PERMISSIONS[ROLE_EMPACADOR]],
  ])('%s: se sirve solo si trae clientes.consultar, y escribe solo si trae clientes.modificar', async (roleName, permissions) => {
    getSessionUserMock.mockResolvedValue(sesionCon(permissions ?? [], roleName));

    const puedeConsultar = (permissions ?? []).includes(PERMISO_DE_CONSULTA);
    const puedeEscribir = (permissions ?? []).includes(PERMISO_DE_ESCRITURA);

    if (!puedeConsultar) {
      await expect(arbolDeLaPantalla()).rejects.toThrow();
      expect(notFoundMock).toHaveBeenCalled();
      return;
    }

    await renderPantalla();

    expect(notFoundMock).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    if (puedeEscribir) {
      expect(screen.getByTestId(CUSTOMER_ROW_ACTIONS_TESTID)).toBeInTheDocument();
    } else {
      expect(screen.queryByTestId(CUSTOMER_ROW_ACTIONS_TESTID)).toBeNull();
      expect(screen.queryByTestId('customer-create-open')).toBeNull();
    }
  });
});
