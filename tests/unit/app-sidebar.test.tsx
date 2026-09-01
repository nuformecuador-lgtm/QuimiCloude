import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AppSidebar } from '@/components/private/app-sidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import {
  BRAND_LABEL,
  PRIVATE_NAV_ITEMS,
  PRIVATE_NAV_LABEL,
  INVENTORY_ROUTE,
  SUPPLIERS_ROUTE,
  type NavGroup,
  type NavItem,
  type NavLink,
} from '@/lib/navigation/private-nav';
import { DASHBOARD_ROUTE } from '@/lib/types/auth';
import type { SessionUser } from '@/lib/types/session';

import { resetViewport, setViewportWidth, WIDE_VIEWPORT } from '../helpers/viewport';

const { usePathnameMock, logoutActionMock } = vi.hoisted(() => ({
  usePathnameMock: vi.fn<() => string>(),
  logoutActionMock: vi.fn<() => Promise<void>>(),
}));

// Solo se sustituye `usePathname` (R8, R12); el resto del modulo se conserva porque
// `next/link` depende de el.
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: usePathnameMock,
}));

// El pie de usuario se monta dentro de la barra: sin este mock, el `<form>` del logout
// intentaria ejecutar la Server Action real.
vi.mock('@/lib/actions/logout', () => ({
  logoutAction: logoutActionMock,
}));

/** Ruta que no coincide con ningun destino de la navegacion: nada arranca activo. */
const RUTA_SIN_COINCIDENCIA = '/ruta-que-no-esta-en-la-navegacion';

const testId = {
  sidebar: 'private-sidebar',
  brand: 'private-brand',
  brandLink: 'private-brand-link',
  brandLong: 'private-brand-long',
  nav: 'private-nav',
  user: 'private-user',
} as const;

/** Primer grupo de `PRIVATE_NAV_ITEMS`, tomado de la constante y no escrito a mano. */
function primerGrupo(): NavGroup {
  const grupo = PRIVATE_NAV_ITEMS.find((item): item is NavGroup => item.kind === 'group');
  if (!grupo) {
    throw new Error('PRIVATE_NAV_ITEMS no contiene ningun item con submenu');
  }
  return grupo;
}

/** Segundo grupo de `PRIVATE_NAV_ITEMS`. */
function segundoGrupo(): NavGroup {
  const grupos = PRIVATE_NAV_ITEMS.filter((item): item is NavGroup => item.kind === 'group');
  const segundo = grupos[1];
  if (!segundo) {
    throw new Error('PRIVATE_NAV_ITEMS no contiene un segundo item con submenu');
  }
  return segundo;
}

function sessionUser(): SessionUser {
  return {
    id: 'u-1',
    username: 'ana.perez',
    displayName: 'Ana Maria Perez',
    roleName: 'Jefa de planta',
  };
}

/** `AppSidebar` usa `useSidebar()`: sin el provider no monta. */
function renderSidebar(navItems: readonly NavItem[] = PRIVATE_NAV_ITEMS) {
  return render(
    <SidebarProvider>
      <AppSidebar user={sessionUser()} navItems={navItems} />
    </SidebarProvider>,
  );
}

/** Lista de `<li>` de primer nivel de la navegacion, en orden de DOM. */
function entradasDeNavegacion(): readonly HTMLLIElement[] {
  const menu = screen.getByTestId(testId.nav).querySelector('ul');
  if (!menu) {
    throw new Error('la navegacion no contiene ninguna lista');
  }
  return Array.from(menu.children).filter(
    (child): child is HTMLLIElement => child instanceof HTMLLIElement,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  usePathnameMock.mockReturnValue(RUTA_SIN_COINCIDENCIA);
  logoutActionMock.mockResolvedValue(undefined);
  // jsdom no trae `matchMedia`: hay que fijar el ancho ANTES de montar nada.
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(() => {
  cleanup();
  resetViewport();
});

describe('barra lateral privada', () => {
  it('la barra lateral expone sus tres regiones: marca, navegacion y pie de usuario', () => {
    // R2
    renderSidebar();

    const barra = screen.getByTestId(testId.sidebar);

    expect(within(barra).getByTestId(testId.brand)).toBeInTheDocument();
    expect(within(barra).getByTestId(testId.nav)).toBeInTheDocument();
    expect(within(barra).getByTestId(testId.user)).toBeInTheDocument();
  });

  it('la navegacion es un landmark de navegacion con nombre accesible', () => {
    // R3
    renderSidebar();

    const landmark = screen.getByRole('navigation', { name: PRIVATE_NAV_LABEL });

    expect(landmark).toBe(screen.getByTestId(testId.nav));
    // Distinguible de cualquier otro landmark de navegacion: hoy es el unico del arbol.
    expect(screen.getAllByRole('navigation')).toHaveLength(1);
  });

  it('la marca es un enlace a DASHBOARD_ROUTE con nombre accesible', () => {
    // R4
    renderSidebar();

    const enlace = screen.getByTestId(testId.brandLink);

    expect(screen.getByTestId(testId.brand)).toContainElement(enlace);
    expect(enlace).toHaveRole('link');
    expect(enlace).toHaveAttribute('href', DASHBOARD_ROUTE);
    expect(enlace).toHaveAccessibleName(BRAND_LABEL);
    // En viewport ancho y modo expandido se muestra la version larga de la marca.
    expect(screen.getByTestId(testId.brandLong)).toBeInTheDocument();
  });

  it('renderiza una entrada por cada item de PRIVATE_NAV_ITEMS y en su orden', () => {
    // R6
    renderSidebar();

    const entradas = entradasDeNavegacion();

    // Ni una entrada de menos ni una de mas.
    expect(entradas).toHaveLength(PRIVATE_NAV_ITEMS.length);

    const enDom = entradas.map((entrada) =>
      entrada.querySelector('[data-testid]')?.getAttribute('data-testid'),
    );
    const esperado = PRIVATE_NAV_ITEMS.map((item) => item.testId);

    expect(enDom).toEqual(esperado);
  });

  it('con una coleccion de navegacion vacia no renderiza entradas y el layout sigue en pie', () => {
    // R7
    renderSidebar([]);

    expect(screen.getByRole('navigation', { name: PRIVATE_NAV_LABEL })).toBeInTheDocument();
    expect(entradasDeNavegacion()).toHaveLength(0);

    // El resto del armazon no se rompe.
    expect(screen.getByTestId(testId.brandLink)).toBeInTheDocument();
    expect(screen.getByTestId(testId.user)).toBeInTheDocument();
  });

  it('marca con aria-current solo el enlace simple cuya ruta coincide con la activa', () => {
    // R8
    usePathnameMock.mockReturnValue(INVENTORY_ROUTE);
    renderSidebar();

    const activo = PRIVATE_NAV_ITEMS.find(
      (item): item is NavLink => item.kind === 'link' && item.href === INVENTORY_ROUTE,
    );
    if (!activo) {
      throw new Error('PRIVATE_NAV_ITEMS no contiene un item simple hacia INVENTORY_ROUTE');
    }

    expect(screen.getByTestId(activo.testId)).toHaveAttribute('aria-current', 'page');

    // Y solo ese: ningun otro elemento del arbol se declara actual.
    const marcados = Array.from(document.querySelectorAll('[aria-current]'));
    expect(marcados).toEqual([screen.getByTestId(activo.testId)]);
  });

  it('un item con hijos se renderiza como control de expansion, no como enlace, y es activable por teclado', async () => {
    // R9
    const user = userEvent.setup();
    const grupo = primerGrupo();
    renderSidebar();

    const control = screen.getByTestId(grupo.testId);

    expect(control.tagName).toBe('BUTTON');
    expect(control).toHaveRole('button');
    expect(control).not.toHaveAttribute('href');
    expect(screen.queryByRole('link', { name: grupo.label })).toBeNull();
    expect(control).toHaveAccessibleName(grupo.label);

    // Alcanzable con Tab desde la entrada anterior de la navegacion.
    const indiceGrupo = PRIVATE_NAV_ITEMS.indexOf(grupo);
    const anterior = PRIVATE_NAV_ITEMS[indiceGrupo - 1];
    if (!anterior) {
      throw new Error('el primer grupo no tiene ninguna entrada anterior');
    }
    // El foco directo abre el tooltip del item anterior (estado de React): dentro de `act`.
    await act(async () => {
      screen.getByTestId(anterior.testId).focus();
    });
    await user.tab();
    expect(control).toHaveFocus();

    // Y activable con Enter y con Espacio, no solo con raton.
    await user.keyboard('{Enter}');
    await waitFor(() => expect(control).toHaveAttribute('aria-expanded', 'true'));

    await user.keyboard(' ');
    await waitFor(() => expect(control).toHaveAttribute('aria-expanded', 'false'));
  });

  it('el submenu colapsado expone aria-expanded=false y no expone sus hijos; expandido los expone', async () => {
    // R10
    const user = userEvent.setup();
    const grupo = primerGrupo();
    renderSidebar();

    const control = screen.getByTestId(grupo.testId);

    expect(control).toHaveAttribute('aria-expanded', 'false');
    for (const hijo of grupo.items) {
      expect(screen.queryByTestId(hijo.testId)).toBeNull();
    }

    await user.click(control);

    await waitFor(() => expect(control).toHaveAttribute('aria-expanded', 'true'));
    for (const hijo of grupo.items) {
      const enlace = screen.getByTestId(hijo.testId);
      expect(enlace).toHaveRole('link');
      expect(enlace).toHaveAttribute('href', hijo.href);
    }
  });

  it('activar el control del submenu alterna entre expandido y colapsado', async () => {
    // R11
    const user = userEvent.setup();
    const grupo = primerGrupo();
    const primerHijo = grupo.items[0];
    if (!primerHijo) {
      throw new Error('el grupo no tiene hijos');
    }
    renderSidebar();

    const control = screen.getByTestId(grupo.testId);
    expect(control).toHaveAttribute('aria-expanded', 'false');

    await user.click(control);
    await waitFor(() => expect(control).toHaveAttribute('aria-expanded', 'true'));
    expect(screen.getByTestId(primerHijo.testId)).toBeInTheDocument();

    await user.click(control);
    await waitFor(() => expect(control).toHaveAttribute('aria-expanded', 'false'));
    await waitFor(() => expect(screen.queryByTestId(primerHijo.testId)).toBeNull());
  });

  it('si la ruta activa es la de un hijo, su submenu arranca expandido y el hijo queda marcado como actual', () => {
    // R12
    usePathnameMock.mockReturnValue(SUPPLIERS_ROUTE);
    const grupo = primerGrupo();
    const hijoActivo = grupo.items.find((hijo) => hijo.href === SUPPLIERS_ROUTE);
    if (!hijoActivo) {
      throw new Error('el primer grupo no contiene un hijo hacia SUPPLIERS_ROUTE');
    }
    renderSidebar();

    // Sin ninguna interaccion previa.
    expect(screen.getByTestId(grupo.testId)).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId(hijoActivo.testId)).toHaveAttribute('aria-current', 'page');

    // El otro submenu no se abre por contagio.
    expect(screen.getByTestId(segundoGrupo().testId)).toHaveAttribute('aria-expanded', 'false');
  });

  it('los destinos de la marca y de todas las entradas salen de las constantes exportadas', async () => {
    // R13
    const user = userEvent.setup();
    renderSidebar();

    // Los hijos solo existen en el DOM cuando su submenu esta abierto: se abren todos.
    for (const item of PRIVATE_NAV_ITEMS) {
      if (item.kind === 'group') {
        await user.click(screen.getByTestId(item.testId));
        await waitFor(() =>
          expect(screen.getByTestId(item.testId)).toHaveAttribute('aria-expanded', 'true'),
        );
      }
    }

    const esperados = new Set<string>([DASHBOARD_ROUTE]);
    for (const item of PRIVATE_NAV_ITEMS) {
      if (item.kind === 'link') {
        expect(screen.getByTestId(item.testId)).toHaveAttribute('href', item.href);
        esperados.add(item.href);
        continue;
      }
      for (const hijo of item.items) {
        expect(screen.getByTestId(hijo.testId)).toHaveAttribute('href', hijo.href);
        esperados.add(hijo.href);
      }
    }

    expect(screen.getByTestId(testId.brandLink)).toHaveAttribute('href', DASHBOARD_ROUTE);

    // Y ningun destino del arbol queda fuera del conjunto de constantes.
    const enDom = Array.from(document.querySelectorAll('a[href]')).map((enlace) =>
      enlace.getAttribute('href'),
    );
    expect(enDom.length).toBeGreaterThan(0);
    for (const href of enDom) {
      expect(esperados.has(href as string)).toBe(true);
    }
  });
});
