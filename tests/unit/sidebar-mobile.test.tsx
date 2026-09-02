import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import PrivateLayout from '@/app/(private)/layout';
import { SIDEBAR_TOGGLE_LABEL } from '@/app/(private)/components';
import { SIDEBAR_PANEL_ID } from '@/components/private/app-sidebar';
import type { SessionUser } from '@/lib/modules/identity';
import {
  PRIVATE_NAV_ITEMS,
  type NavGroup,
  type NavLink,
} from '@/lib/shared/navigation/private-nav';
import { LOGIN_ROUTE } from '@/lib/shared/routes';
import { SIDEBAR_STATE_COOKIE } from '@/lib/shared/ui/sidebar-state';

import {
  NARROW_VIEWPORT,
  clearSidebarStateCookie,
  resetViewport,
  setViewportWidth,
} from '../helpers/viewport';

/**
 * Mecanismo B — panel superpuesto en viewport ANGOSTO (R29–R34, `design.md > 5.6`).
 *
 * Archivo separado del mecanismo A a proposito (D5). En angosto el primitivo monta la barra
 * dentro de un `Sheet`, que es un `Dialog` de **Base UI** (no Radix).
 *
 * Nota verificada sobre la modalidad: este `Dialog` **no emite `aria-modal`**. Base UI la
 * impone marcando el resto del documento con `aria-hidden="true"` + `data-base-ui-inert`, de
 * modo que fuera del panel no queda nada expuesto al arbol de accesibilidad (ni siquiera el
 * `main`). Los asserts van sobre eso, que es lo real, y no sobre un atributo que no existe.
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
  brandLong: 'private-brand-long',
  brandShort: 'private-brand-short',
  toggle: 'private-sidebar-toggle',
} as const;

async function renderLayout() {
  return render(await PrivateLayout({ children: <div data-testid="contenido-de-prueba" /> }));
}

/** Primer item simple de `PRIVATE_NAV_ITEMS`, tomado de la constante. */
function primerEnlaceSimple(): NavLink {
  const enlace = PRIVATE_NAV_ITEMS.find((item): item is NavLink => item.kind === 'link');
  if (!enlace) {
    throw new Error('PRIVATE_NAV_ITEMS no contiene ningun item simple');
  }
  return enlace;
}

/** Primer item con submenu de `PRIVATE_NAV_ITEMS`. */
function primerGrupo(): NavGroup {
  const grupo = PRIVATE_NAV_ITEMS.find((item): item is NavGroup => item.kind === 'group');
  if (!grupo) {
    throw new Error('PRIVATE_NAV_ITEMS no contiene ningun item con submenu');
  }
  return grupo;
}

async function abrirPanel(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  await user.click(screen.getByTestId(testId.toggle));
  return screen.findByRole('dialog');
}

beforeEach(() => {
  vi.clearAllMocks();
  usePathnameMock.mockReturnValue(RUTA_SIN_COINCIDENCIA);
  redirectMock.mockImplementation((ruta: string) => {
    throw new RedirectCentinela(ruta);
  });
  logoutActionMock.mockResolvedValue(undefined);
  getSessionUserMock.mockResolvedValue(USUARIO_DEL_TEST);
  cookiesMock.mockResolvedValue({ get: () => undefined });
  clearSidebarStateCookie();
  // El ancho se fija ANTES de renderizar: el hook de viewport se evalua al montar.
  setViewportWidth(NARROW_VIEWPORT);
});

afterEach(() => {
  cleanup();
  resetViewport();
  clearSidebarStateCookie();
});

describe('barra lateral privada en viewport angosto (panel superpuesto)', () => {
  it('en viewport angosto la barra arranca oculta y ofrece el control de apertura', async () => {
    // R29
    await renderLayout();

    // Sin interaccion no hay panel ni dialogo: ni siquiera montados en el DOM.
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByTestId(testId.sidebar)).toBeNull();
    expect(document.getElementById(SIDEBAR_PANEL_ID)).toBeNull();

    const control = screen.getByTestId(testId.toggle);
    expect(control).toBeInTheDocument();
    expect(control).toHaveAccessibleName(SIDEBAR_TOGGLE_LABEL);
  });

  it('al abrir en viewport angosto muestra un dialogo modal y mueve el foco dentro', async () => {
    // R30
    const user = userEvent.setup();
    await renderLayout();

    const dialogo = await abrirPanel(user);

    expect(dialogo).toHaveAttribute('data-mobile', 'true');

    // Modalidad real de Base UI: el resto del documento queda inerte y oculto al arbol de
    // accesibilidad. Con el panel abierto ni el `main` del contenido esta expuesto.
    const inerte = screen.getByTestId(testId.toggle).closest('[data-base-ui-inert]');
    expect(inerte).not.toBeNull();
    expect(inerte).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('main')).toBeNull();

    // Y el foco se traslada dentro del panel.
    const panel = within(dialogo).getByTestId(testId.sidebar);
    expect(document.activeElement).not.toBe(document.body);
    expect(panel.contains(document.activeElement)).toBe(true);
  });

  it('el control refleja el estado con aria-expanded y referencia el panel con aria-controls', async () => {
    // R31
    const user = userEvent.setup();
    await renderLayout();

    const control = screen.getByTestId(testId.toggle);
    expect(control).toHaveAttribute('aria-expanded', 'false');
    expect(control).toHaveAttribute('aria-controls', SIDEBAR_PANEL_ID);

    const dialogo = await abrirPanel(user);

    await waitFor(() => expect(control).toHaveAttribute('aria-expanded', 'true'));
    expect(control).toHaveAttribute('aria-controls', SIDEBAR_PANEL_ID);
    // El `aria-controls` apunta a un elemento que existe de verdad mientras esta abierto.
    expect(document.getElementById(SIDEBAR_PANEL_ID)).toBe(
      within(dialogo).getByTestId(testId.sidebar),
    );
  });

  it('Escape cierra el panel superpuesto y devuelve el foco al control de apertura', async () => {
    // R32
    const user = userEvent.setup();
    await renderLayout();

    const control = screen.getByTestId(testId.toggle);
    await abrirPanel(user);

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(control).toHaveAttribute('aria-expanded', 'false');
    expect(control).toHaveFocus();
  });

  it('activar un enlace, simple o de submenu, cierra el panel superpuesto', async () => {
    // R33 — los dos casos, porque el cierre lo tiene que hacer tambien el hijo de submenu.
    const user = userEvent.setup();
    await renderLayout();

    // Caso 1: enlace simple.
    const dialogoSimple = await abrirPanel(user);
    const simple = primerEnlaceSimple();
    await user.click(within(dialogoSimple).getByTestId(simple.testId));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByTestId(testId.toggle)).toHaveAttribute('aria-expanded', 'false');

    // Caso 2: hijo de submenu, expandiendo antes el submenu.
    const dialogoGrupo = await abrirPanel(user);
    const grupo = primerGrupo();
    const control = within(dialogoGrupo).getByTestId(grupo.testId);
    await user.click(control);
    await waitFor(() => expect(control).toHaveAttribute('aria-expanded', 'true'));

    const primerHijo = grupo.items[0];
    if (!primerHijo) {
      throw new Error('el primer grupo no tiene hijos');
    }
    await user.click(await screen.findByTestId(primerHijo.testId));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByTestId(testId.toggle)).toHaveAttribute('aria-expanded', 'false');
  });

  it('en viewport angosto no se aplica el modo icono', async () => {
    // R34 — y se parte de la cookie de escritorio en modo icono (`sidebar_state=false`)
    // precisamente para fijar que en angosto ese estado se ignora: es lo que impide
    // romper R34 mezclando los dos mecanismos.
    const user = userEvent.setup();
    cookiesMock.mockResolvedValue({
      get: (name: string) =>
        name === SIDEBAR_STATE_COOKIE ? { name, value: 'false' } : undefined,
    });
    await renderLayout();

    const dialogo = await abrirPanel(user);

    // El panel movil no lleva el estado de colapso de escritorio.
    expect(dialogo).not.toHaveAttribute('data-collapsible');
    expect(dialogo).not.toHaveAttribute('data-state', 'collapsed');
    expect(document.querySelector('[data-collapsible="icon"]')).toBeNull();

    // Las etiquetas de texto siguen visibles: marca larga, no la corta.
    expect(within(dialogo).getByTestId(testId.brandLong)).toBeInTheDocument();
    expect(screen.queryByTestId(testId.brandShort)).toBeNull();

    // Y los hijos de submenu siguen siendo alcanzables inline, no por menu flotante.
    const grupo = primerGrupo();
    const control = within(dialogo).getByTestId(grupo.testId);
    expect(control).not.toHaveAttribute('aria-haspopup', 'menu');

    await user.click(control);
    await waitFor(() => expect(control).toHaveAttribute('aria-expanded', 'true'));

    expect(screen.queryByRole('menu')).toBeNull();
    for (const hijo of grupo.items) {
      const enlace = within(dialogo).getByTestId(hijo.testId);
      expect(enlace).toHaveRole('link');
      expect(enlace).toHaveAttribute('href', hijo.href);
      expect(enlace).toHaveAccessibleName(hijo.label);
    }
  });

  it('sin sesion, el layout redirige al login y no pinta la barra lateral', async () => {
    // R16 — sin sesion valida, la zona privada redirige al login en lugar de pintarse.
    getSessionUserMock.mockResolvedValue(null);

    await expect(renderLayout()).rejects.toThrow(RedirectCentinela);

    expect(redirectMock).toHaveBeenCalledWith(LOGIN_ROUTE);
    expect(screen.queryByTestId(testId.sidebar)).not.toBeInTheDocument();
  });
});
