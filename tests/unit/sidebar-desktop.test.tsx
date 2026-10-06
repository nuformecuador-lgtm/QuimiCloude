import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { setupUser } from '../helpers/user-event';

import PrivateLayout from '@/app/(private)/layout';
import { SIDEBAR_TOGGLE_LABEL } from '@/app/(private)/components';
import { SIDEBAR_PANEL_ID } from '@/components/private/app-sidebar';
import { PERMISSIONS, type SessionUser } from '@/lib/modules/identity';
import {
  BRAND_SHORT_LABEL,
  PRIVATE_NAV_ITEMS,
  type NavGroup,
} from '@/lib/shared/navigation/private-nav';
import { ASSIGNED_ORDERS_ROUTE, LOGIN_ROUTE_SESSION_ENDED } from '@/lib/shared/routes';
import { SIDEBAR_STATE_COOKIE } from '@/lib/shared/ui/sidebar-state';

import {
  WIDE_VIEWPORT,
  clearSidebarStateCookie,
  readSidebarStateCookie,
  resetViewport,
  setViewportWidth,
} from '../helpers/viewport';

/**
 * Mecanismo A — colapso a modo icono en viewport ANCHO (R23–R28, `design.md > 5.5`).
 *
 * Archivo separado del mecanismo B a proposito (D5): son dos comportamientos distintos y
 * mezclarlos en un solo archivo es como se acaba probando uno y creyendo que se probo el otro.
 */

type CookieStoreStub = {
  get: (name: string) => { name: string; value: string } | undefined;
};

/** `SessionUser` del test: nunca el valor de relleno del stub real. */
const USUARIO_DEL_TEST: SessionUser = {
  id: 'u-test-42',
  username: 'carla.duarte',
  displayName: 'Carla Duarte Salas',
  roleName: 'Analista de calidad',
  // QC-74 T8: `SessionUser` exige `permissions`. **Desde QC-75 T7 lleva el catalogo entero**
  // (derivado de `PERMISSIONS`, no escrito a mano): el layout privado filtra `PRIVATE_NAV_ITEMS`
  // con los permisos de la sesion, y este archivo prueba el ARMAZON de QC-11 —que todas las
  // entradas del menu se dibujan y se comportan—, no el filtrado. Con la lista vacia el menu
  // saldria vacio y estos casos dejarian de comprobar lo suyo. El filtrado tiene su propio test:
  // `tests/unit/navegacion/private-layout-menu.test.tsx`.
  permissions: PERMISSIONS.map((permiso) => permiso.code),
};

const { usePathnameMock, redirectMock, logoutActionMock, cookiesMock, getSessionUserMock } =
  vi.hoisted(() => ({
    usePathnameMock: vi.fn<() => string>(),
    redirectMock: vi.fn<(ruta: string) => never>(),
    logoutActionMock: vi.fn<() => Promise<void>>(),
    cookiesMock: vi.fn<() => Promise<CookieStoreStub>>(),
    getSessionUserMock: vi.fn(),
  }));

/** Centinela que imita el comportamiento real de `redirect`: no retorna, lanza. */
class RedirectCentinela extends Error {
  constructor(public readonly ruta: string) {
    super(`REDIRECT:${ruta}`);
  }
}

// Solo se sustituye `usePathname` y `redirect`; el resto del modulo se conserva porque
// `next/link` depende de el.
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: usePathnameMock,
  redirect: redirectMock,
}));

// Sin este mock el `<form>` del pie intentaria ejecutar la Server Action real.
vi.mock('@/lib/modules/identity/adapters/driving/logout-action', () => ({
  logoutAction: logoutActionMock,
}));

// El layout es Server Component y lee la cookie de preferencia de UI con `cookies()`.
vi.mock('next/headers', () => ({
  cookies: cookiesMock,
}));

// R16: el proveedor de sesion se sustituye por completo para poder darle a estos tests la
// sesion valida que antes les regalaba el stub, sin depender del cableado real.
vi.mock('@/lib/composition', () => ({
  identity: {
    getSessionUser: getSessionUserMock,
    endSession: vi.fn<() => Promise<void>>(),
  },
}));

/** Ruta que no coincide con ningun destino de la navegacion: nada arranca activo. */
const RUTA_SIN_COINCIDENCIA = '/ruta-que-no-esta-en-la-navegacion';

const testId = {
  sidebar: 'private-sidebar',
  brandLink: 'private-brand-link',
  brandLong: 'private-brand-long',
  brandShort: 'private-brand-short',
  toggle: 'private-sidebar-toggle',
  userTrigger: 'private-user-trigger',
  logout: 'private-logout',
  logoutForm: 'private-logout-form',
} as const;

/** El `cookies()` de servidor no ve nada: primer montaje sin preferencia guardada. */
function sinCookieDePreferencia(): void {
  cookiesMock.mockResolvedValue({ get: () => undefined });
}

/**
 * Puentea a mano la cookie que el cliente dejo en `document.cookie` hacia el `cookies()`
 * de servidor.
 *
 * **Por que hace falta y por que no es un atajo**: el `SidebarProvider` de
 * `components/ui/sidebar.tsx` **escribe** `sidebar_state` pero **nunca la lee** (su estado
 * inicial es `useState(defaultOpen)`). Quien cierra R28 es el layout de servidor, que lee la
 * cookie con `readSidebarOpenState` y la pasa como `defaultOpen`. En produccion ese salto lo
 * da el navegador (mandando la cookie en la peticion); en jsdom no hay peticion, asi que el
 * test tiene que darlo. Un test que solo comprobara `document.cookie` verificaria al
 * primitivo, no a R28: la persistencia seguiria rota si el layout dejara de leerla.
 */
function cookieDelDocumentoHaciaElServidor(): void {
  cookiesMock.mockResolvedValue({
    get: (name: string) => {
      if (name !== SIDEBAR_STATE_COOKIE) {
        return undefined;
      }
      const value = readSidebarStateCookie();
      return value === undefined ? undefined : { name, value };
    },
  });
}

async function renderLayout() {
  return render(await PrivateLayout({ children: <div data-testid="contenido-de-prueba" /> }));
}

/** Contenedor de escritorio del primitivo: es quien lleva `data-state`/`data-collapsible`. */
function panelDeEscritorio(): HTMLElement {
  const panel = document.querySelector<HTMLElement>('div[data-slot="sidebar"]');
  if (!panel) {
    throw new Error('el primitivo no monto el contenedor de escritorio de la barra lateral');
  }
  return panel;
}

/** Primer item con submenu de `PRIVATE_NAV_ITEMS`, tomado de la constante. */
function primerGrupo(): NavGroup {
  const grupo = PRIVATE_NAV_ITEMS.find((item): item is NavGroup => item.kind === 'group');
  if (!grupo) {
    throw new Error('PRIVATE_NAV_ITEMS no contiene ningun item con submenu');
  }
  return grupo;
}

/** Activa el control unico de colapso y espera al estado pedido. */
async function alternarBarra(
  user: ReturnType<typeof setupUser>,
  esperado: 'expanded' | 'collapsed',
) {
  await user.click(screen.getByTestId(testId.toggle));
  await waitFor(() => expect(panelDeEscritorio()).toHaveAttribute('data-state', esperado));
}

beforeEach(() => {
  vi.clearAllMocks();
  usePathnameMock.mockReturnValue(RUTA_SIN_COINCIDENCIA);
  redirectMock.mockImplementation((ruta: string) => {
    throw new RedirectCentinela(ruta);
  });
  logoutActionMock.mockResolvedValue(undefined);
  getSessionUserMock.mockResolvedValue(USUARIO_DEL_TEST);
  sinCookieDePreferencia();
  // Sin limpiar la cookie, un test que colapse contamina al siguiente con el modo del
  // anterior (`design.md > 10.11`). Por eso se limpia antes Y despues.
  clearSidebarStateCookie();
  // jsdom no trae `matchMedia`: hay que fijar el ancho ANTES de montar nada.
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(() => {
  cleanup();
  resetViewport();
  clearSidebarStateCookie();
});

describe('barra lateral privada en viewport ancho (modo icono)', () => {
  it('en viewport ancho la barra es persistente y el control declara aria-expanded y aria-controls', async () => {
    // R23
    await renderLayout();

    // Montada y visible sin ninguna interaccion previa.
    const panel = screen.getByTestId(testId.sidebar);
    expect(panel).toBeInTheDocument();
    expect(panel).toBeVisible();
    expect(panelDeEscritorio()).toHaveAttribute('data-state', 'expanded');
    expect(panelDeEscritorio()).toHaveAttribute('data-collapsible', '');

    const control = screen.getByTestId(testId.toggle);
    expect(control).toHaveAccessibleName(SIDEBAR_TOGGLE_LABEL);
    expect(control).toHaveAttribute('aria-controls', SIDEBAR_PANEL_ID);
    expect(control).toHaveAttribute('aria-expanded', 'true');

    // El `aria-controls` apunta a un elemento que existe de verdad.
    expect(document.getElementById(SIDEBAR_PANEL_ID)).toBe(panel);
  });

  it('activar el control alterna a modo icono y muestra la marca corta', async () => {
    // R24 (y R4 se conserva en los dos modos)
    const user = setupUser();
    await renderLayout();

    const control = screen.getByTestId(testId.toggle);
    expect(screen.getByTestId(testId.brandLong)).toBeInTheDocument();
    expect(screen.queryByTestId(testId.brandShort)).toBeNull();
    expect(screen.getByTestId(testId.brandLink)).toHaveAttribute('href', ASSIGNED_ORDERS_ROUTE);

    await alternarBarra(user, 'collapsed');

    expect(panelDeEscritorio()).toHaveAttribute('data-collapsible', 'icon');
    expect(control).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId(testId.brandShort)).toHaveTextContent(BRAND_SHORT_LABEL);
    expect(screen.queryByTestId(testId.brandLong)).toBeNull();
    expect(screen.getByTestId(testId.brandLink)).toHaveAttribute('href', ASSIGNED_ORDERS_ROUTE);

    await alternarBarra(user, 'expanded');

    expect(panelDeEscritorio()).toHaveAttribute('data-collapsible', '');
    expect(control).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId(testId.brandLong)).toBeInTheDocument();
    expect(screen.queryByTestId(testId.brandShort)).toBeNull();
    expect(screen.getByTestId(testId.brandLink)).toHaveAttribute('href', ASSIGNED_ORDERS_ROUTE);
  });

  it('en modo icono cada entrada conserva su nombre accesible', async () => {
    // R25
    const user = setupUser();
    await renderLayout();

    await alternarBarra(user, 'collapsed');

    // Se itera la constante: ni una entrada se comprueba a mano.
    expect(PRIVATE_NAV_ITEMS.length).toBeGreaterThan(0);
    for (const item of PRIVATE_NAV_ITEMS) {
      expect(screen.getByTestId(item.testId)).toHaveAccessibleName(item.label);
    }
  });

  it('en modo icono los hijos de un submenu siguen siendo alcanzables desde su control', async () => {
    // R26
    const user = setupUser();
    const grupo = primerGrupo();
    await renderLayout();

    await alternarBarra(user, 'collapsed');

    const control = screen.getByTestId(grupo.testId);
    expect(control).toHaveAccessibleName(grupo.label);
    for (const hijo of grupo.items) {
      expect(screen.queryByTestId(hijo.testId)).toBeNull();
    }

    // En modo icono el submenu se presenta como menu flotante anclado al icono.
    await user.click(control);

    const menu = await screen.findByRole('menu');
    for (const hijo of grupo.items) {
      const enlace = within(menu).getByTestId(hijo.testId);
      expect(enlace).toHaveRole('menuitem');
      expect(enlace).toHaveAttribute('href', hijo.href);
      expect(enlace).toHaveAccessibleName(hijo.label);
    }
  });

  it('en modo icono el cierre de sesion sigue alcanzable, ahora desde el encabezado', async () => {
    // R27, con la enmienda del 2026-09-07 (decision humana). Antes este caso abria el menu del
    // pie, que en modo icono era el UNICO camino al cierre de sesion; hoy no hay menu que abrir
    // -el control es un boton del encabezado- y lo que R27 protege sigue en pie: colapsar la
    // barra no puede dejar a nadie sin poder salir.
    const user = setupUser();
    await renderLayout();

    await alternarBarra(user, 'collapsed');

    expect(screen.queryByTestId(testId.userTrigger)).toBeNull();

    const formulario = screen.getByTestId(testId.logoutForm);
    const control = screen.getByTestId(testId.logout);

    expect(formulario.tagName).toBe('FORM');
    expect(formulario).toContainElement(control);
    expect(control).toHaveAccessibleName();
    // Y esta en el encabezado, no en el pie de la barra: es lo que hace que sobreviva al colapso.
    expect(screen.getByTestId('private-header')).toContainElement(control);
  });

  it('el modo colapsado se conserva al volver a montar el layout', async () => {
    // R28
    const user = setupUser();
    await renderLayout();

    expect(panelDeEscritorio()).toHaveAttribute('data-state', 'expanded');

    await alternarBarra(user, 'collapsed');

    // El cliente deja su preferencia escrita...
    expect(readSidebarStateCookie()).toBe('false');

    // ...se desmonta todo, como en una recarga o una navegacion...
    cleanup();
    expect(document.querySelector('div[data-slot="sidebar"]')).toBeNull();

    // ...y el servidor vuelve a montar leyendo esa cookie (ver comentario del helper).
    cookieDelDocumentoHaciaElServidor();
    await renderLayout();

    expect(panelDeEscritorio()).toHaveAttribute('data-state', 'collapsed');
    expect(panelDeEscritorio()).toHaveAttribute('data-collapsible', 'icon');
    expect(screen.getByTestId(testId.toggle)).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId(testId.brandShort)).toBeInTheDocument();
  });

  it('el modo expandido se conserva al volver a montar el layout', async () => {
    // R28 (el simetrico: partiendo de colapsado y expandiendo)
    const user = setupUser();
    cookiesMock.mockResolvedValue({
      get: (name: string) =>
        name === SIDEBAR_STATE_COOKIE ? { name, value: 'false' } : undefined,
    });
    await renderLayout();

    expect(panelDeEscritorio()).toHaveAttribute('data-state', 'collapsed');

    await alternarBarra(user, 'expanded');

    expect(readSidebarStateCookie()).toBe('true');

    cleanup();
    expect(document.querySelector('div[data-slot="sidebar"]')).toBeNull();

    cookieDelDocumentoHaciaElServidor();
    await renderLayout();

    expect(panelDeEscritorio()).toHaveAttribute('data-state', 'expanded');
    expect(panelDeEscritorio()).toHaveAttribute('data-collapsible', '');
    expect(screen.getByTestId(testId.toggle)).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId(testId.brandLong)).toBeInTheDocument();
  });

  it('sin sesion, el layout redirige al login y no pinta la barra lateral', async () => {
    // R16 — sin sesion valida, la zona privada redirige al login en lugar de pintarse.
    getSessionUserMock.mockResolvedValue(null);

    await expect(renderLayout()).rejects.toThrow(RedirectCentinela);

    expect(redirectMock).toHaveBeenCalledWith(LOGIN_ROUTE_SESSION_ENDED);
    expect(screen.queryByTestId(testId.sidebar)).not.toBeInTheDocument();
  });
});
