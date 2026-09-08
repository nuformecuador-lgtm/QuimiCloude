import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import PrivateLayout from '@/app/(private)/layout';
import type { SessionUser } from '@/lib/modules/identity';
import { PERMISSIONS } from '@/lib/modules/identity';
import { PRIVATE_NAV_ITEMS, PRIVATE_NAV_LABEL } from '@/lib/shared/navigation/private-nav';

import {
  clearSidebarStateCookie,
  resetViewport,
  setViewportWidth,
  WIDE_VIEWPORT,
} from '../../helpers/viewport';

/**
 * QC-75 T7 — el layout privado arma el menu con los permisos de la sesion (R1, R2, R19).
 *
 * Se prueba **sobre el arbol renderizado** y por `data-testid`, nunca por clase CSS: R2 exige que
 * el item que no toca no exista en el HTML servido, no que este oculto. Un `queryByTestId` que
 * devuelve `null` es exactamente esa afirmacion; un `not.toBeVisible()` no lo seria.
 *
 * Tambien se afirma aqui que el pie con el control de cerrar sesion sigue presente con el menu
 * vacio (R9, R14): quien no tenga ningun permiso ve 404 en toda ruta privada, y la unica cosa que
 * no puede faltarle es la salida.
 *
 * El mockeo es el mismo de `tests/unit/private-layout.test.tsx` —proveedor de sesion, cookies,
 * `next/navigation` y la action de cerrar sesion—, copiado a proposito: aquel prueba el armazon,
 * este prueba el filtrado, y compartir el andamio por un helper acoplaria dos fichas distintas.
 */

type CookieStoreStub = {
  get: (name: string) => { name: string; value: string } | undefined;
};

const { usePathnameMock, redirectMock, logoutActionMock, cookiesMock, getSessionUserMock } =
  vi.hoisted(() => ({
    usePathnameMock: vi.fn<() => string>(),
    redirectMock: vi.fn<(ruta: string) => never>(),
    logoutActionMock: vi.fn<() => Promise<void>>(),
    cookiesMock: vi.fn<() => Promise<CookieStoreStub>>(),
    getSessionUserMock: vi.fn(),
  }));

class RedirectCentinela extends Error {
  constructor(public readonly ruta: string) {
    super(`REDIRECT:${ruta}`);
  }
}

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: usePathnameMock,
  redirect: redirectMock,
}));

vi.mock('@/lib/modules/identity/adapters/driving/logout-action', () => ({
  logoutAction: logoutActionMock,
}));

vi.mock('next/headers', () => ({
  cookies: cookiesMock,
}));

vi.mock('@/lib/composition', () => ({
  identity: {
    getSessionUser: getSessionUserMock,
    endSession: vi.fn<() => Promise<void>>(),
  },
}));

const RUTA_SIN_COINCIDENCIA = '/ruta-que-no-esta-en-la-navegacion';
const CHILD_TEST_ID = 'pantalla-de-prueba';

const testId = {
  sidebar: 'private-sidebar',
  user: 'private-user',
  userTrigger: 'private-user-trigger',
  logoutForm: 'private-logout-form',
  dashboard: 'nav-dashboard',
  inventario: 'nav-inventario',
  pedidos: 'nav-pedidos',
  proveedores: 'nav-proveedores',
  produccion: 'nav-produccion',
  recetas: 'nav-produccion-recetas',
} as const;

/** Los diez codigos del catalogo de QC-74, sin escribir ninguno a mano. */
const TODOS_LOS_PERMISOS: readonly string[] = PERMISSIONS.map((permiso) => permiso.code);

function sessionUser(permissions: readonly string[]): SessionUser {
  return {
    id: 'u-qc75',
    username: 'operador.prueba',
    displayName: 'Operador De Prueba',
    roleName: 'Operador',
    permissions: [...permissions],
  };
}

async function renderLayout(permissions: readonly string[]) {
  getSessionUserMock.mockResolvedValue(sessionUser(permissions));
  return render(await PrivateLayout({ children: <div data-testid={CHILD_TEST_ID} /> }));
}

beforeEach(() => {
  vi.clearAllMocks();
  usePathnameMock.mockReturnValue(RUTA_SIN_COINCIDENCIA);
  redirectMock.mockImplementation((ruta: string) => {
    throw new RedirectCentinela(ruta);
  });
  logoutActionMock.mockResolvedValue(undefined);
  cookiesMock.mockResolvedValue({ get: () => undefined });
  clearSidebarStateCookie();
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(() => {
  cleanup();
  resetViewport();
  clearSidebarStateCookie();
});

describe('el layout privado filtra el menu con los permisos de la sesion', () => {
  it('con solo `inventario.consultar`, ningun otro item aparece en el arbol', async () => {
    // R1, R2 — el caso del Operador del seed (QC-74 R9).
    await renderLayout(['inventario.consultar']);

    expect(screen.getByTestId(testId.inventario)).toBeInTheDocument();

    // `null`, no una clase CSS: el item que no toca **no esta en el HTML servido** (R2).
    expect(screen.queryByTestId(testId.dashboard)).toBeNull();
    expect(screen.queryByTestId(testId.pedidos)).toBeNull();
    expect(screen.queryByTestId(testId.proveedores)).toBeNull();
    // El grupo entero desaparece, no solo su hijo (R3).
    expect(screen.queryByTestId(testId.produccion)).toBeNull();
    expect(screen.queryByTestId(testId.recetas)).toBeNull();
  });

  it('con solo `inventario.consultar`, el control de cerrar sesion sigue presente', async () => {
    // R14 — cerrar sesion no exige ningun permiso del catalogo.
    const usuario = userEvent.setup();
    await renderLayout(['inventario.consultar']);

    expect(screen.getByTestId(testId.user)).toBeInTheDocument();

    await usuario.click(screen.getByTestId(testId.userTrigger));
    expect(await screen.findByTestId(testId.logoutForm)).toBeInTheDocument();
  });

  it('sin ningun permiso, el menu queda sin items y el pie con cerrar sesion sigue ahi', async () => {
    // R9, R14 — nadie se queda encerrado: menu vacio, pero salida presente.
    const usuario = userEvent.setup();
    await renderLayout([]);

    const navegacion = screen.getByRole('navigation', { name: PRIVATE_NAV_LABEL });
    expect(within(navegacion).queryAllByRole('link')).toHaveLength(0);

    for (const item of [
      testId.dashboard,
      testId.inventario,
      testId.pedidos,
      testId.proveedores,
      testId.produccion,
      testId.recetas,
    ]) {
      expect(screen.queryByTestId(item), `${item} no debe estar en el arbol`).toBeNull();
    }

    // La barra lateral sigue montada y el pie tambien: es la unica salida que le queda.
    expect(screen.getByTestId(testId.sidebar)).toBeInTheDocument();
    expect(screen.getByTestId(testId.user)).toBeInTheDocument();

    await usuario.click(screen.getByTestId(testId.userTrigger));
    expect(await screen.findByTestId(testId.logoutForm)).toBeInTheDocument();
  });

  it('con los diez permisos del catalogo estan los cinco items del menu', async () => {
    // R4 — el filtrado quita items, nunca los inventa ni los pierde: con todo el catalogo, el
    // arbol es el de `PRIVATE_NAV_ITEMS` entero.
    await renderLayout(TODOS_LOS_PERMISOS);

    for (const item of [
      testId.dashboard,
      testId.inventario,
      testId.pedidos,
      testId.proveedores,
      testId.produccion,
    ]) {
      expect(screen.getByTestId(item)).toBeInTheDocument();
    }
  });

  it('el layout hace una sola lectura de sesion para pintar el menu', async () => {
    // R19 — los permisos llegan en la MISMA lectura que ya existia; ninguna consulta nueva.
    await renderLayout(['inventario.consultar']);

    expect(getSessionUserMock).toHaveBeenCalledTimes(1);
  });

  it('ancla: el menu real tiene los cinco items que este test vigila', async () => {
    // Anti-vacuidad: si alguien renombra un `testId` de `PRIVATE_NAV_ITEMS`, los
    // `queryByTestId(...) === null` de arriba pasarian por buenos sin comprobar nada.
    const testIds = PRIVATE_NAV_ITEMS.map((item) => item.testId);

    expect(testIds).toEqual([
      testId.dashboard,
      testId.inventario,
      testId.pedidos,
      testId.produccion,
      testId.proveedores,
    ]);
  });
});
