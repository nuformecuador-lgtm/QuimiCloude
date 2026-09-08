import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '../helpers/user-event';

import { LOGOUT_LABEL, LogoutButton } from '@/app/(private)/components/logout-button';

/**
 * Cierre de sesion del encabezado privado.
 *
 * **Estos casos son los de R19, R20 y R21 de QC-11, mudados enteros** desde
 * `tests/unit/nav-user.test.tsx` el 2026-09-07 (decision humana): el control salio del menu del
 * pie de la barra lateral y paso a ser un boton propio junto al de tema. Lo que se afirma no
 * cambia -es un `<form>` real cuya accion es `logoutAction`, invoca una sola vez por activacion y
 * se deshabilita mientras corre-; cambia donde vive.
 *
 * Los asserts van sobre `data-testid` y la constante exportada, nunca sobre literales de copy.
 */

const { logoutActionMock } = vi.hoisted(() => ({
  logoutActionMock: vi.fn<() => Promise<void>>(),
}));

// Se mockea la action para (a) contar invocaciones (R20) y, sobre todo, (b) poder dejar la
// promesa PENDIENTE: es la unica forma de observar el estado deshabilitado (R21).
vi.mock('@/lib/modules/identity/adapters/driving/logout-action', () => ({
  logoutAction: logoutActionMock,
}));

const testId = {
  form: 'private-logout-form',
  logout: 'private-logout',
} as const;

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

beforeEach(() => {
  vi.clearAllMocks();
  logoutActionMock.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
});

describe('cierre de sesion del encabezado privado', () => {
  it('el control vive dentro de un form real cuya accion es logoutAction', async () => {
    // R19 + R20 (el envio real del form es lo que invoca la action; no hay `onClick`).
    const user = setupUser();
    render(<LogoutButton />);

    const formulario = screen.getByTestId(testId.form);
    const control = screen.getByTestId(testId.logout);

    expect(formulario.tagName).toBe('FORM');
    expect(formulario).toContainElement(control);
    // En modo icono el boton no tiene texto visible: el nombre accesible es lo unico que queda.
    expect(control).toHaveAccessibleName(LOGOUT_LABEL);

    await user.click(control);

    await waitFor(() => expect(logoutActionMock).toHaveBeenCalledTimes(1));
  });

  it('es alcanzable con el teclado y se activa con el', async () => {
    // R17 aplicado al control nuevo: ya no hay menu que abrir, asi que el propio boton es el que
    // tiene que estar en el orden de tabulacion y responder a la tecla.
    const user = setupUser();
    render(<LogoutButton />);

    await user.tab();

    expect(screen.getByTestId(testId.logout)).toHaveFocus();

    await user.keyboard('{Enter}');

    await waitFor(() => expect(logoutActionMock).toHaveBeenCalledTimes(1));
  });

  it('invoca la accion de cierre de sesion exactamente una vez por activacion', async () => {
    // R20
    const user = setupUser();
    const enCurso = pendingLogout();
    render(<LogoutButton />);

    await user.click(screen.getByTestId(testId.logout));
    await waitFor(() => expect(logoutActionMock).toHaveBeenCalledTimes(1));

    // Segunda activacion con el cierre todavia en curso: no dispara otra invocacion.
    await user.click(screen.getByTestId(testId.logout));
    expect(logoutActionMock).toHaveBeenCalledTimes(1);

    await enCurso.resolve();
  });

  it('deshabilita el control mientras el cierre de sesion esta en curso', async () => {
    // R21
    const user = setupUser();
    const enCurso = pendingLogout();
    render(<LogoutButton />);

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
