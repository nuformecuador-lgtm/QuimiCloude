import { cleanup, render, screen, within } from '@testing-library/react';

import PrivateLayout from '@/app/(private)/layout';
import type { SessionUser } from '@/lib/modules/identity';
import {
  PERMISSIONS,
  ROLE_ADMINISTRADOR,
  ROLE_OPERADOR,
  SEED_ROLE_PERMISSIONS,
} from '@/lib/modules/identity';
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
  // ENMIENDA DEL 2026-09-07 (decision humana, ver `components/private/nav-user.tsx`): el pie
  // dejo de abrir un `DropdownMenu` cuyo unico item era cerrar sesion, y ese control se movio al
  // encabezado (`app/(private)/components/logout-button.tsx`). Con el desaparecio
  // `private-user-trigger`, asi que aqui NO se pulsa nada: el control ya esta en el arbol.
  logout: 'private-logout',
  logoutForm: 'private-logout-form',
  // Se conserva a proposito, para afirmar que sigue SIN existir.
  userTriggerRetirado: 'private-user-trigger',
  dashboard: 'nav-dashboard',
  inventario: 'nav-inventario',
  pedidos: 'nav-pedidos',
  proveedores: 'nav-proveedores',
  produccion: 'nav-produccion',
  recetas: 'nav-produccion-recetas',
  // QC-45 T2: el item de la seccion «Configuración». Declara `inventario.modificar`, que es el
  // permiso que el Operador del seed NO tiene teniendo `inventario.consultar`: por eso es el caso
  // interesante del primer test de este archivo.
  presentaciones: 'nav-presentaciones',
} as const;

/** Los codigos del catalogo de QC-74, sin escribir ninguno a mano. QC-38 lo dejo en ONCE al
 *  anadir `unidades.modificar`, por eso se derivan y no se cuentan. */
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
    // QC-45: `inventario.consultar` NO abre «Presentaciones», que exige `inventario.modificar`.
    // Es la unica pareja del menu que comparte modulo y difiere en la accion, asi que es donde un
    // filtrado que comparase por prefijo de modulo —o que diera por implicado `modificar` desde
    // `consultar`— se colaria sin que nada mas se pusiera rojo.
    expect(screen.queryByTestId(testId.presentaciones)).toBeNull();
  });

  it('con solo `inventario.consultar`, el control de cerrar sesion sigue presente', async () => {
    // R14 — cerrar sesion no exige ningun permiso del catalogo.
    await renderLayout(['inventario.consultar']);

    expect(screen.getByTestId(testId.user)).toBeInTheDocument();

    // Sin pulsar: el control vive en el encabezado desde la enmienda del 2026-09-07, no detras de
    // un menu. Se afirma tambien que el disparador retirado NO volvio.
    expect(screen.queryByTestId(testId.userTriggerRetirado)).toBeNull();
    expect(screen.getByTestId(testId.logout)).toBeInTheDocument();
    expect(screen.getByTestId(testId.logoutForm)).toBeInTheDocument();
  });

  it('sin ningun permiso, el menu queda sin items y la salida sigue ahi', async () => {
    // R9, R14 — nadie se queda encerrado: menu vacio, pero salida presente.
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
      testId.presentaciones,
    ]) {
      expect(screen.queryByTestId(item), `${item} no debe estar en el arbol`).toBeNull();
    }

    // La barra lateral sigue montada y el pie tambien, y la salida esta en el encabezado: es lo
    // unico que le queda a quien no tiene ningun permiso.
    expect(screen.getByTestId(testId.sidebar)).toBeInTheDocument();
    expect(screen.getByTestId(testId.user)).toBeInTheDocument();

    expect(screen.queryByTestId(testId.userTriggerRetirado)).toBeNull();
    expect(screen.getByTestId(testId.logout)).toBeInTheDocument();
    expect(screen.getByTestId(testId.logoutForm)).toBeInTheDocument();
  });

  it('con el catalogo entero de permisos estan los seis items del menu', async () => {
    // R4 — el filtrado quita items, nunca los inventa ni los pierde: con todo el catalogo, el
    // arbol es el de `PRIVATE_NAV_ITEMS` entero.
    await renderLayout(TODOS_LOS_PERMISOS);

    for (const item of [
      testId.dashboard,
      testId.inventario,
      testId.pedidos,
      testId.proveedores,
      testId.produccion,
      testId.presentaciones,
    ]) {
      expect(screen.getByTestId(item)).toBeInTheDocument();
    }
  });

  it('el layout hace una sola lectura de sesion para pintar el menu', async () => {
    // R19 — los permisos llegan en la MISMA lectura que ya existia; ninguna consulta nueva.
    await renderLayout(['inventario.consultar']);

    expect(getSessionUserMock).toHaveBeenCalledTimes(1);
  });

  // QC-45 T2 (R3, R4 con el mecanismo de QC-75) — el item de «Presentaciones» sobre el ARBOL
  // RENDERIZADO, con los conjuntos de permisos que el seed asigna a cada rol, importados de
  // `SEED_ROLE_PERMISSIONS` y nunca escritos a mano. Es el par que cierra la promesa: quien puede
  // entrar lo ve, y quien recibiria un 404 al pulsarlo no lo ve siquiera.
  it('con los permisos del Administrador el layout pinta el item de presentaciones', async () => {
    const permisos = SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR];
    expect(permisos, 'el seed deberia asignar permisos al Administrador').toBeDefined();

    await renderLayout(permisos ?? []);

    expect(screen.getByTestId(testId.presentaciones)).toBeInTheDocument();
  });

  it('con los permisos del Operador el item de presentaciones no llega al arbol', async () => {
    const permisos = SEED_ROLE_PERMISSIONS[ROLE_OPERADOR];
    expect(permisos, 'el seed deberia asignar permisos al Operador').toBeDefined();

    await renderLayout(permisos ?? []);

    // El Operador SI ve inventario: lo que le falta es `inventario.modificar`, no el modulo.
    expect(screen.getByTestId(testId.inventario)).toBeInTheDocument();
    expect(screen.queryByTestId(testId.presentaciones)).toBeNull();
  });

  it('ancla: el menu real tiene los seis items que este test vigila', async () => {
    // Anti-vacuidad: si alguien renombra un `testId` de `PRIVATE_NAV_ITEMS`, los
    // `queryByTestId(...) === null` de arriba pasarian por buenos sin comprobar nada.
    const testIds = PRIVATE_NAV_ITEMS.map((item) => item.testId);

    expect(testIds).toEqual([
      testId.dashboard,
      testId.inventario,
      testId.pedidos,
      testId.produccion,
      testId.proveedores,
      testId.presentaciones,
    ]);
  });
});
