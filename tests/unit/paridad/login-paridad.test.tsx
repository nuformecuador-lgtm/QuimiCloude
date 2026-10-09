import { act, cleanup, render, screen } from '@testing-library/react';

import LoginPage from '@/app/(public)/login/page';
import type { LoginFormState } from '@/lib/modules/identity/adapters/driving/login-form-state';

import { setupUser } from '../../helpers/user-event';
import { arbolAccesible } from './arbol-accesible';

/**
 * Paridad del login, en reposo y enviando. Es la pantalla de la unica excepcion declarada: su
 * boton de envio gana las clases de la talla tactil, y ese cambio se aplica a mano sobre este
 * snapshot en su propio commit. Mocks de `tests/unit/login-form.test.tsx`.
 */

const { loginActionMock } = vi.hoisted(() => ({
  loginActionMock:
    vi.fn<(prevState: LoginFormState, formData: FormData) => Promise<LoginFormState>>(),
}));

vi.mock('@/lib/modules/identity/adapters/driving/login-action', () => ({
  loginAction: loginActionMock,
}));

async function renderLogin() {
  return render(await LoginPage({ searchParams: Promise.resolve({}) }));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('paridad del login', () => {
  it('R1 — en reposo', async () => {
    await renderLogin();
    expect(screen.getByTestId('login-submit')).toHaveAttribute('aria-busy', 'false');
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R2 — enviando', async () => {
    let resolver!: (state: LoginFormState) => void;
    loginActionMock.mockImplementation(
      () =>
        new Promise<LoginFormState>((resolve) => {
          resolver = resolve;
        }),
    );
    const user = setupUser();
    await renderLogin();

    await user.type(screen.getByTestId('login-username'), 'ana.perez');
    await user.type(screen.getByTestId('login-password'), 'clave-secreta');
    await user.click(screen.getByTestId('login-submit'));

    expect(screen.getByTestId('login-submit')).toHaveAttribute('aria-busy', 'true');
    expect(arbolAccesible()).toMatchSnapshot();

    await act(async () => {
      resolver({
        status: 'error',
        attemptId: 'intento-1',
        username: 'ana.perez',
        message: 'Credenciales no validas.',
      });
    });
  });
});
