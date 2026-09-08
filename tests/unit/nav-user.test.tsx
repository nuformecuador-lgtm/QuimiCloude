import { cleanup, render, screen, within } from '@testing-library/react';

import { NavUser } from '@/components/private/nav-user';
import { SidebarProvider } from '@/components/ui/sidebar';
import type { SessionUser } from '@/lib/modules/identity';
import { getInitials } from '@/lib/shared/ui/initials';

import { resetViewport, setViewportWidth, WIDE_VIEWPORT } from '../helpers/viewport';

/**
 * Pie de usuario de la barra lateral privada (R14, R15 de QC-11).
 *
 * **ENMIENDA DEL 2026-09-07 (decision humana): el pie ya no abre ningun menu.** Los casos de
 * R17-R21 -disparador que declara `aria-haspopup`, Escape que cierra, el `<form>` del cierre de
 * sesion, la unica invocacion por activacion y el control deshabilitado mientras corre- vivian
 * aqui porque el cierre de sesion era el unico item del menu de este pie. El control se movio al
 * encabezado, junto al de tema, asi que esos casos **no se han borrado: se mudaron enteros** a
 * `tests/unit/logout-button.test.tsx`, que los afirma sobre el boton nuevo.
 *
 * Lo que queda aqui es la identidad, mas el caso EN NEGATIVO de que este pie ya no ofrece ni menu
 * ni cierre de sesion: sin el, el dia que alguien reponga el menu nadie se entera.
 *
 * Los asserts van sobre roles ARIA, `data-testid` y constantes exportadas, nunca sobre literales
 * de copy.
 */

const testId = {
  user: 'private-user',
  identity: 'private-user-identity',
  initials: 'private-user-initials',
  name: 'private-user-name',
  role: 'private-user-role',
  logout: 'private-logout',
  trigger: 'private-user-trigger',
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

beforeEach(() => {
  // jsdom no trae `matchMedia`: hay que fijar el ancho ANTES de montar nada.
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(() => {
  cleanup();
  resetViewport();
});

describe('pie de usuario de la barra lateral privada', () => {
  it('muestra nombre y rol recibidos por props', () => {
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
    // El pie sigue en pie: el nombre completo sigue disponible aunque no haya rol que pintar.
    expect(screen.getByTestId(testId.identity)).toHaveAttribute('title', user.displayName);
  });

  it('muestra las iniciales derivadas del nombre visible', () => {
    // R15 — el esperado sale del helper, no escrito a mano.
    const user = sessionUser({ displayName: 'Ana Maria Perez' });
    renderNavUser(user);

    const esperado = getInitials(user.displayName);

    expect(esperado).not.toBe('');
    expect(screen.getByTestId(testId.initials)).toHaveTextContent(esperado);
  });

  it('el pie NO ofrece menu de usuario ni cierre de sesion: son del encabezado', () => {
    // Enmienda del 2026-09-07 (decision humana), en negativo. El cierre de sesion se afirma en
    // `logout-button.test.tsx`; aqui se afirma que NO esta -y que no queda un disparador que abra
    // una lista vacia, que es lo que pasaria si alguien moviera el control y olvidara el menu-.
    renderNavUser();

    const pie = screen.getByTestId(testId.user);

    expect(screen.queryByTestId(testId.trigger)).toBeNull();
    expect(screen.queryByTestId(testId.logout)).toBeNull();
    expect(within(pie).queryByRole('button')).toBeNull();
    expect(pie.querySelector('[aria-haspopup="menu"]')).toBeNull();
  });
});
