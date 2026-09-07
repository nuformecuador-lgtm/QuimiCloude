import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { NavUser } from '@/components/private/nav-user';
import { SidebarProvider } from '@/components/ui/sidebar';
import type { SessionUser } from '@/lib/modules/identity';
import { getInitials } from '@/lib/shared/ui/initials';

import { resetViewport, setViewportWidth, WIDE_VIEWPORT } from '../helpers/viewport';

const { logoutActionMock } = vi.hoisted(() => ({
  logoutActionMock: vi.fn<() => Promise<void>>(),
}));

// Se mockea la action para (a) contar invocaciones (R20) y, sobre todo, (b) poder dejar la
// promesa PENDIENTE: es la unica forma de observar el estado deshabilitado (R21).
vi.mock('@/lib/modules/identity/adapters/driving/logout-action', () => ({
  logoutAction: logoutActionMock,
}));

// Los asserts van sobre roles ARIA, `data-testid` y constantes exportadas, nunca sobre
// literales de copy.
const testId = {
  user: 'private-user',
  trigger: 'private-user-trigger',
  initials: 'private-user-initials',
  name: 'private-user-name',
  role: 'private-user-role',
  logoutForm: 'private-logout-form',
  logout: 'private-logout',
} as const;

/** `SessionUser` construido en el test: nunca el valor de relleno del stub. */
function sessionUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: 'u-1',
    username: 'ana.perez',
    displayName: 'Ana Maria Perez',
    roleName: 'Jefa de planta',
    // QC-74 T8: `SessionUser` exige `permissions`. Vacio: este test no autoriza nada.
    permissions: [],
    ...overrides,
  };
}

/** `NavUser` usa `useSidebar()`: sin el provider no monta. */
function renderNavUser(user: SessionUser = sessionUser()) {
  return render(
    <SidebarProvider>
      <NavUser user={user} />
    </SidebarProvider>,
  );
}

/** Deja la action colgada y devuelve el resolvedor, para observar el estado «en curso». */
function pendingLogout() {
  let resolver!: () => void;
  logoutActionMock.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        resolver = () => resolve();
      }),
  );
  return {
    resolve: async () => {
      await act(async () => {
        resolver();
      });
    },
  };
}

async function openUserMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId(testId.trigger));
  return screen.findByTestId(testId.logoutForm);
}

beforeEach(() => {
  vi.clearAllMocks();
  logoutActionMock.mockResolvedValue(undefined);
  // jsdom no trae `matchMedia`: hay que fijar el ancho ANTES de montar nada.
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(() => {
  cleanup();
  resetViewport();
});

describe('pie de usuario de la barra lateral privada', () => {
  it('muestra nombre y rol recibidos por props', async () => {
    // R14
    const user = sessionUser();
    renderNavUser(user);

    const pie = screen.getByTestId(testId.user);

    expect(within(pie).getByTestId(testId.name)).toHaveTextContent(user.displayName);
    expect(within(pie).getByTestId(testId.role)).toHaveTextContent(user.roleName as string);
  });

  it('omite la linea de rol cuando no viene informado', () => {
    // R14
    const user = sessionUser({ roleName: null });
    renderNavUser(user);

    expect(screen.getByTestId(testId.name)).toHaveTextContent(user.displayName);
    expect(screen.queryByTestId(testId.role)).toBeNull();
    // El pie sigue en pie: el disparador conserva su nombre accesible.
    expect(screen.getByTestId(testId.trigger)).toHaveAccessibleName(user.displayName);
  });

  it('muestra las iniciales derivadas del nombre visible', () => {
    // R15 — el esperado sale del helper, no escrito a mano.
    const user = sessionUser({ displayName: 'Ana Maria Perez' });
    renderNavUser(user);

    const esperado = getInitials(user.displayName);

    expect(esperado).not.toBe('');
    expect(screen.getByTestId(testId.initials)).toHaveTextContent(esperado);
  });

  it('el pie ofrece un menu desplegable con disparador accesible por teclado que declara que abre un menu', async () => {
    // R17
    const user = userEvent.setup();
    const sesion = sessionUser();
    renderNavUser(sesion);

    const disparador = screen.getByTestId(testId.trigger);

    expect(disparador).toHaveAccessibleName(sesion.displayName);
    expect(disparador).toHaveAttribute('aria-haspopup', 'menu');
    expect(disparador).toHaveAttribute('aria-expanded', 'false');

    // Alcanzable con teclado: es el primer control del pie.
    await user.tab();
    expect(disparador).toHaveFocus();

    // Y se abre con teclado, no solo con raton.
    await user.keyboard('{Enter}');

    await waitFor(() => expect(disparador).toHaveAttribute('aria-expanded', 'true'));
    expect(await screen.findByRole('menu')).toBeInTheDocument();
  });

  it('Escape cierra el menu de usuario y devuelve el foco a su disparador', async () => {
    // R18
    const user = userEvent.setup();
    renderNavUser();

    const disparador = screen.getByTestId(testId.trigger);
    await openUserMenu(user);
    expect(disparador).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByTestId(testId.logout)).toBeNull());
    expect(disparador).toHaveAttribute('aria-expanded', 'false');
    expect(disparador).toHaveFocus();
  });

  it('el cierre de sesion vive dentro de un form real cuya accion es logoutAction', async () => {
    // R19 + R20 (el envio real del form es lo que invoca la action; no hay `onClick`).
    const user = userEvent.setup();
    renderNavUser();

    const formulario = await openUserMenu(user);
    const control = screen.getByTestId(testId.logout);

    expect(formulario.tagName).toBe('FORM');
    expect(formulario).toContainElement(control);
    expect(control).toHaveAccessibleName();

    await user.click(control);

    await waitFor(() => expect(logoutActionMock).toHaveBeenCalledTimes(1));
  });

  it('invoca la accion de cierre de sesion exactamente una vez por activacion', async () => {
    // R20
    const user = userEvent.setup();
    const enCurso = pendingLogout();
    renderNavUser();

    await openUserMenu(user);
    const control = screen.getByTestId(testId.logout);

    await user.click(control);
    await waitFor(() => expect(logoutActionMock).toHaveBeenCalledTimes(1));

    // Segunda activacion con el cierre todavia en curso: no dispara otra invocacion.
    await user.click(screen.getByTestId(testId.logout));
    expect(logoutActionMock).toHaveBeenCalledTimes(1);

    await enCurso.resolve();
  });

  it('deshabilita el control mientras el cierre de sesion esta en curso', async () => {
    // R21
    const user = userEvent.setup();
    const enCurso = pendingLogout();
    renderNavUser();

    await openUserMenu(user);
    const control = screen.getByTestId(testId.logout);

    expect(control).toBeEnabled();
    expect(control).toHaveAttribute('aria-busy', 'false');

    await user.click(control);

    await waitFor(() => expect(screen.getByTestId(testId.logout)).toBeDisabled());
    expect(screen.getByTestId(testId.logout)).toHaveAttribute('aria-busy', 'true');

    await enCurso.resolve();

    await waitFor(() => expect(screen.getByTestId(testId.logout)).toBeEnabled());
    expect(screen.getByTestId(testId.logout)).toHaveAttribute('aria-busy', 'false');
  });
});
