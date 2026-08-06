import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import PrivateLayout from '@/app/(private)/layout';
import { SIDEBAR_TOGGLE_LABEL } from '@/app/(private)/components';
import { SIDEBAR_PANEL_ID } from '@/components/private/app-sidebar';
import {
  BRAND_SHORT_LABEL,
  PRIVATE_NAV_ITEMS,
  type NavGroup,
} from '@/lib/navigation/private-nav';
import { DASHBOARD_ROUTE } from '@/lib/types/auth';
import { SIDEBAR_STATE_COOKIE } from '@/lib/utils/sidebar-state';

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

const { usePathnameMock, logoutActionMock, cookiesMock } = vi.hoisted(() => ({
  usePathnameMock: vi.fn<() => string>(),
  logoutActionMock: vi.fn<() => Promise<void>>(),
  cookiesMock: vi.fn<() => Promise<CookieStoreStub>>(),
}));

// Solo se sustituye `usePathname`; el resto del modulo se conserva porque `next/link`
// depende de el.
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: usePathnameMock,
}));

// Sin este mock el `<form>` del pie intentaria ejecutar la Server Action real.
vi.mock('@/lib/actions/logout', () => ({
  logoutAction: logoutActionMock,
}));

// El layout es Server Component y lee la cookie de preferencia de UI con `cookies()`.
vi.mock('next/headers', () => ({
  cookies: cookiesMock,
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
  user: ReturnType<typeof userEvent.setup>,
  esperado: 'expanded' | 'collapsed',
) {
  await user.click(screen.getByTestId(testId.toggle));
  await waitFor(() => expect(panelDeEscritorio()).toHaveAttribute('data-state', esperado));
}

beforeEach(() => {
  vi.clearAllMocks();
  usePathnameMock.mockReturnValue(RUTA_SIN_COINCIDENCIA);
  logoutActionMock.mockResolvedValue(undefined);
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
    const user = userEvent.setup();
    await renderLayout();

    const control = screen.getByTestId(testId.toggle);
    expect(screen.getByTestId(testId.brandLong)).toBeInTheDocument();
    expect(screen.queryByTestId(testId.brandShort)).toBeNull();
    expect(screen.getByTestId(testId.brandLink)).toHaveAttribute('href', DASHBOARD_ROUTE);

    await alternarBarra(user, 'collapsed');

    expect(panelDeEscritorio()).toHaveAttribute('data-collapsible', 'icon');
    expect(control).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId(testId.brandShort)).toHaveTextContent(BRAND_SHORT_LABEL);
    expect(screen.queryByTestId(testId.brandLong)).toBeNull();
    expect(screen.getByTestId(testId.brandLink)).toHaveAttribute('href', DASHBOARD_ROUTE);

    await alternarBarra(user, 'expanded');

    expect(panelDeEscritorio()).toHaveAttribute('data-collapsible', '');
    expect(control).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId(testId.brandLong)).toBeInTheDocument();
    expect(screen.queryByTestId(testId.brandShort)).toBeNull();
    expect(screen.getByTestId(testId.brandLink)).toHaveAttribute('href', DASHBOARD_ROUTE);
  });

  it('en modo icono cada entrada conserva su nombre accesible', async () => {
    // R25
    const user = userEvent.setup();
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
    const user = userEvent.setup();
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

  it('en modo icono el pie sigue ofreciendo el menu de usuario y el cierre de sesion', async () => {
    // R27
    const user = userEvent.setup();
    await renderLayout();

    await alternarBarra(user, 'collapsed');

    const disparador = screen.getByTestId(testId.userTrigger);
    expect(disparador).toHaveAccessibleName();
    expect(disparador).toHaveAttribute('aria-haspopup', 'menu');
    expect(disparador).toHaveAttribute('aria-expanded', 'false');

    await user.click(disparador);

    await waitFor(() => expect(disparador).toHaveAttribute('aria-expanded', 'true'));
    const formulario = await screen.findByTestId(testId.logoutForm);
    expect(formulario.tagName).toBe('FORM');
    expect(formulario).toContainElement(screen.getByTestId(testId.logout));
  });

  it('el modo colapsado se conserva al volver a montar el layout', async () => {
    // R28
    const user = userEvent.setup();
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
    const user = userEvent.setup();
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
});
