import { cleanup, render, screen, within } from '@testing-library/react';
import { setupUser } from '../../helpers/user-event';

import PrivateLayout from '@/app/(private)/layout';
import { SIDEBAR_TOGGLE_LABEL } from '@/app/(private)/components';
import { SIDEBAR_EDGE_TOGGLE_LABEL, SIDEBAR_PANEL_ID } from '@/components/private/app-sidebar';
import { PERMISSIONS, type SessionUser } from '@/lib/modules/identity';

import {
  NARROW_VIEWPORT,
  WIDE_VIEWPORT,
  clearSidebarStateCookie,
  resetViewport,
  setViewportWidth,
} from '../../helpers/viewport';

/**
 * Control de la barra lateral: una sola flecha que gira en la pastilla del borde (escritorio)
 * y en «Alternar barra lateral» (cabecera movil), y el aspecto de los tres botones de la
 * cabecera. Se renderiza el layout privado entero para probar los controles donde viven.
 */

type CookieStoreStub = {
  get: (name: string) => { name: string; value: string } | undefined;
};

const USUARIO_DEL_TEST: SessionUser = {
  id: 'u-control-barra',
  username: 'control.barra',
  displayName: 'Control Barra',
  roleName: null,
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

const ARROW_ICON = 'lucide-chevron-left';
const ARROW_TURNED = 'rotate-180';
const ARROW_MOTION = [
  'transition-transform',
  'duration-(--dur-base)',
  'ease-(--ease-standard)',
];

const testId = {
  edge: 'private-sidebar-edge-toggle',
  toggle: 'private-sidebar-toggle',
  header: 'private-header',
  theme: 'theme-toggle-trigger',
  logout: 'private-logout',
} as const;

async function renderLayout() {
  return render(await PrivateLayout({ children: <div data-testid="contenido-de-prueba" /> }));
}

/** El unico icono del control. Falla si hay mas de uno: el control no alterna iconos. */
function arrowOf(control: HTMLElement): SVGElement {
  const icons = control.querySelectorAll('svg');
  expect(icons).toHaveLength(1);
  return icons[0] as SVGElement;
}

function classesOf(element: Element): string[] {
  return (element.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
}

function expectArrow(icon: SVGElement, turned: boolean) {
  const classes = classesOf(icon);
  expect(classes).toContain(ARROW_ICON);
  if (turned) {
    expect(classes).toContain(ARROW_TURNED);
  } else {
    expect(classes).not.toContain(ARROW_TURNED);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  usePathnameMock.mockReturnValue('/ruta-que-no-esta-en-la-navegacion');
  redirectMock.mockImplementation((ruta: string) => {
    throw new Error(`REDIRECT:${ruta}`);
  });
  logoutActionMock.mockResolvedValue(undefined);
  getSessionUserMock.mockResolvedValue(USUARIO_DEL_TEST);
  cookiesMock.mockResolvedValue({ get: () => undefined });
  clearSidebarStateCookie();
});

afterEach(() => {
  cleanup();
  resetViewport();
  clearSidebarStateCookie();
});

describe('pastilla del borde (viewport ancho)', () => {
  beforeEach(() => {
    setViewportWidth(WIDE_VIEWPORT);
  });

  it('R4 pinta la flecha a la izquierda con la barra expandida y girada 180 grados en modo icono', async () => {
    const user = setupUser();
    await renderLayout();
    const edge = screen.getByTestId(testId.edge);

    expect(edge).toHaveAttribute('aria-expanded', 'true');
    expectArrow(arrowOf(edge), false);

    await user.click(edge);

    expect(edge).toHaveAttribute('aria-expanded', 'false');
    expectArrow(arrowOf(edge), true);
  });

  it('R6 gira el mismo icono, sin sustituirlo, con la duracion y la curva de los tokens', async () => {
    const user = setupUser();
    await renderLayout();
    const edge = screen.getByTestId(testId.edge);
    const before = arrowOf(edge);

    for (const expected of ARROW_MOTION) {
      expect(classesOf(before)).toContain(expected);
    }

    await user.click(edge);
    expect(arrowOf(edge)).toBe(before);

    await user.click(edge);
    expect(arrowOf(edge)).toBe(before);
    expectArrow(before, false);
  });

  it('R8 conserva nombre, aria-expanded, aria-controls, data-testid y solo se muestra en ancho', async () => {
    await renderLayout();
    const edge = screen.getByTestId(testId.edge);

    expect(edge).toHaveAccessibleName(SIDEBAR_EDGE_TOGGLE_LABEL);
    expect(edge).toHaveAttribute('aria-expanded', 'true');
    expect(edge).toHaveAttribute('aria-controls', SIDEBAR_PANEL_ID);
    expect(classesOf(edge)).toEqual(expect.arrayContaining(['hidden', 'md:inline-flex']));
  });
});

describe('«Alternar barra lateral» de la cabecera (viewport angosto)', () => {
  beforeEach(() => {
    setViewportWidth(NARROW_VIEWPORT);
  });

  it('R5 pinta la flecha a la derecha con el panel cerrado y a la izquierda con el panel abierto', async () => {
    const user = setupUser();
    await renderLayout();
    const toggle = screen.getByTestId(testId.toggle);

    expectArrow(arrowOf(toggle), true);

    await user.click(toggle);
    await screen.findByRole('dialog');

    expectArrow(arrowOf(toggle), false);
  });

  it('R6 gira el mismo icono del boton movil con la duracion y la curva de los tokens', async () => {
    const user = setupUser();
    await renderLayout();
    const toggle = screen.getByTestId(testId.toggle);
    const before = arrowOf(toggle);

    for (const expected of ARROW_MOTION) {
      expect(classesOf(before)).toContain(expected);
    }

    await user.click(toggle);
    await screen.findByRole('dialog');

    expect(arrowOf(toggle)).toBe(before);
  });

  it('R8 conserva nombre, aria-expanded, aria-controls, data-testid y solo se muestra en angosto', async () => {
    const user = setupUser();
    await renderLayout();
    const toggle = screen.getByTestId(testId.toggle);

    expect(toggle).toHaveAccessibleName(SIDEBAR_TOGGLE_LABEL);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', SIDEBAR_PANEL_ID);
    expect(toggle.closest('.md\\:hidden')).not.toBeNull();

    await user.click(toggle);
    await screen.findByRole('dialog');

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('R9 la cabecera pone el control y el isotipo a la izquierda, y tema y cerrar sesion a la derecha, los tres de contorno y 44 px', async () => {
    await renderLayout();
    const header = screen.getByTestId(testId.header);
    const toggle = within(header).getByTestId(testId.toggle);
    const theme = within(header).getByTestId(testId.theme);
    const logout = within(header).getByTestId(testId.logout);

    const left = toggle.closest('.md\\:hidden') as HTMLElement;
    const isotipo = left.querySelector('img');
    expect(isotipo).not.toBeNull();
    expect(
      toggle.compareDocumentPosition(isotipo as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(left.contains(theme)).toBe(false);
    expect(
      left.compareDocumentPosition(theme) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      theme.compareDocumentPosition(logout) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    for (const button of [toggle, theme, logout]) {
      const classes = classesOf(button);
      expect(classes).toEqual(expect.arrayContaining(['border-border', 'bg-background', 'size-11']));
      expect(classes).not.toContain('size-7');
      expect(classes).not.toContain('size-8');
    }
  });
});
