import { cleanup, render, screen, within } from '@testing-library/react';
import { setupUser } from '../../helpers/user-event';

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
  userTrigger: 'private-user-trigger',
  logoutForm: 'private-logout-form',
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
  // QC-39 T4 (2026-09-08): el SEGUNDO item de la seccion «Configuración». Declara
  // `unidades.consultar`, que ningun rol del seed tiene salvo el Administrador, asi que es el
  // contraste limpio con el Operador (R9, R10).
  unidades: 'nav-unidades',
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
    // QC-45: `inventario.consultar` NO abre «Presentaciones», que exige `inventario.modificar`.
    // Es la unica pareja del menu que comparte modulo y difiere en la accion, asi que es donde un
    // filtrado que comparase por prefijo de modulo —o que diera por implicado `modificar` desde
    // `consultar`— se colaria sin que nada mas se pusiera rojo.
    expect(screen.queryByTestId(testId.presentaciones)).toBeNull();
    // TENSADO el 2026-09-08 (QC-39 T4, R10): «Unidades» exige `unidades.consultar`, que este
    // usuario no tiene, asi que tampoco puede estar en el HTML servido.
    expect(screen.queryByTestId(testId.unidades)).toBeNull();
  });

  it('con solo `inventario.consultar`, el control de cerrar sesion sigue presente', async () => {
    // R14 — cerrar sesion no exige ningun permiso del catalogo.
    const usuario = setupUser();
    await renderLayout(['inventario.consultar']);

    expect(screen.getByTestId(testId.user)).toBeInTheDocument();

    await usuario.click(screen.getByTestId(testId.userTrigger));
    expect(await screen.findByTestId(testId.logoutForm)).toBeInTheDocument();
  });

  it('sin ningun permiso, el menu queda sin items y el pie con cerrar sesion sigue ahi', async () => {
    // R9, R14 — nadie se queda encerrado: menu vacio, pero salida presente.
    const usuario = setupUser();
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

    // La barra lateral sigue montada y el pie tambien: es la unica salida que le queda.
    expect(screen.getByTestId(testId.sidebar)).toBeInTheDocument();
    expect(screen.getByTestId(testId.user)).toBeInTheDocument();

    await usuario.click(screen.getByTestId(testId.userTrigger));
    expect(await screen.findByTestId(testId.logoutForm)).toBeInTheDocument();
  });

  it('con todos los permisos del catalogo estan los siete items del menu', async () => {
    // R4 — el filtrado quita items, nunca los inventa ni los pierde: con todo el catalogo, el
    // arbol es el de `PRIVATE_NAV_ITEMS` entero.
    // TENSADO el 2026-09-08 (QC-39 T4, R9/R10/R47): de seis items a siete, con «Unidades». El
    // titulo deja de decir «diez permisos» porque el catalogo ya son once desde QC-38; el numero
    // no se escribe a mano en ningun sitio, sale de `PERMISSIONS`.
    await renderLayout(TODOS_LOS_PERMISOS);

    for (const item of [
      testId.dashboard,
      testId.inventario,
      testId.pedidos,
      testId.proveedores,
      testId.produccion,
      testId.presentaciones,
      testId.unidades,
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

  // QC-39 T4 (R9, R10 con el mecanismo de QC-75), 2026-09-08 — el mismo par que QC-45 escribio
  // para «Presentaciones», ahora para «Unidades»: sobre el ARBOL RENDERIZADO y con los conjuntos
  // de permisos que el seed asigna a cada rol, importados de `SEED_ROLE_PERMISSIONS` y nunca
  // escritos a mano. Quien puede entrar ve el enlace; quien recibiria un 404 al pulsarlo no lo ve.
  it('con los permisos del Administrador el layout pinta el item de unidades', async () => {
    const permisos = SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR];
    expect(permisos, 'el seed deberia asignar permisos al Administrador').toBeDefined();

    await renderLayout(permisos ?? []);

    expect(screen.getByTestId(testId.unidades)).toBeInTheDocument();
  });

  it('con los permisos del Operador el item de unidades no llega al arbol', async () => {
    const permisos = SEED_ROLE_PERMISSIONS[ROLE_OPERADOR];
    expect(permisos, 'el seed deberia asignar permisos al Operador').toBeDefined();

    await renderLayout(permisos ?? []);

    // El Operador SI ve inventario: lo que le falta es el modulo de unidades entero, no un matiz
    // de accion. Se afirma junto al positivo para que el `null` no pueda serlo por un layout roto.
    expect(screen.getByTestId(testId.inventario)).toBeInTheDocument();
    expect(screen.queryByTestId(testId.unidades)).toBeNull();
  });

  it('ancla: el menu real tiene los siete items que este test vigila', async () => {
    // Anti-vacuidad: si alguien renombra un `testId` de `PRIVATE_NAV_ITEMS`, los
    // `queryByTestId(...) === null` de arriba pasarian por buenos sin comprobar nada.
    // TENSADO el 2026-09-08 (QC-39 T4, R9/R10/R47): el ancla sube de seis a siete con
    // `nav-unidades`, ULTIMO del array y segundo item de la seccion «Configuración» que QC-45 ya
    // habia abierto -no se crea seccion ni se reordena el item de presentaciones-. Se tensa, no se
    // afloja: sigue siendo la lista EXACTA y en orden, nunca un «al menos N».
    const testIds = PRIVATE_NAV_ITEMS.map((item) => item.testId);

    expect(testIds).toEqual([
      testId.dashboard,
      testId.inventario,
      testId.pedidos,
      testId.produccion,
      testId.proveedores,
      testId.presentaciones,
      testId.unidades,
    ]);
  });
});
