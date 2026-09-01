import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MockInstance } from 'vitest';

import { LoginForm } from '@/app/(public)/login/components';
import {
  GENERIC_CREDENTIALS_ERROR,
  type LoginFormState,
} from '@/lib/modules/identity/adapters/driving/login-form-state';

/**
 * Regresion del aviso de Base UI:
 *
 *   «A component is changing the default value state of an uncontrolled FieldControl
 *    after being initialized.»
 *
 * Vive en su PROPIO archivo a proposito. El helper `error()` de `@base-ui/utils` deduplica
 * los avisos en un `Set` a nivel de modulo: dentro de un mismo archivo de test, el primer
 * caso que dispare el aviso se lo come y cualquier assert posterior veria la consola limpia
 * aunque el bug siguiera ahi. Vitest aisla el registro de modulos por archivo, asi que aqui
 * el aviso es observable siempre, sin depender del orden de los tests.
 */

const { loginActionMock } = vi.hoisted(() => ({
  loginActionMock:
    vi.fn<(prevState: LoginFormState, formData: FormData) => Promise<LoginFormState>>(),
}));

vi.mock('@/lib/modules/identity/adapters/driving/login-action', () => ({
  loginAction: loginActionMock,
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), dismiss: vi.fn() },
}));

const testId = {
  username: 'login-username',
  password: 'login-password',
  submit: 'login-submit',
} as const;

/** Fragmento estable del aviso, independiente del copy exacto del resto del mensaje. */
const AVISO_NO_CONTROLADO = 'uncontrolled FieldControl';

let consoleErrorSpy: MockInstance<(...args: unknown[]) => void>;

function avisosDeBaseUi(): string[] {
  return consoleErrorSpy.mock.calls
    .map(([primero]) => (typeof primero === 'string' ? primero : ''))
    .filter((mensaje) => mensaje.includes(AVISO_NO_CONTROLADO));
}

beforeEach(() => {
  vi.clearAllMocks();
  // `spyOn` sin `mockImplementation`: sigue llamando al original, no silencia nada.
  consoleErrorSpy = vi.spyOn(console, 'error');
});

afterEach(() => {
  cleanup();
  consoleErrorSpy.mockRestore();
});

describe('campo de usuario no controlado', () => {
  // Un unico test cubre los dos saltos de `defaultValue` (idle -> fallo y fallo -> fallo)
  // porque, por la deduplicacion descrita arriba, solo el primer test del archivo puede
  // observar el aviso: partirlo en dos daria un segundo test que jamas podria fallar.
  it('no avisa por cambiar el defaultValue en intentos rechazados sucesivos', async () => {
    const user = userEvent.setup();
    loginActionMock
      .mockResolvedValueOnce({
        status: 'error',
        attemptId: 'intento-1',
        username: 'ana.perez',
        message: GENERIC_CREDENTIALS_ERROR,
      })
      .mockResolvedValueOnce({
        status: 'error',
        attemptId: 'intento-2',
        username: 'luis.gomez',
        message: GENERIC_CREDENTIALS_ERROR,
      });
    render(<LoginForm />);

    // Primer fallo: el `defaultValue` salta de '' a lo escrito y el campo se rehidrata (R13).
    await user.type(screen.getByTestId(testId.username), 'ana.perez');
    await user.type(screen.getByTestId(testId.password), 'clave-secreta');
    await user.click(screen.getByTestId(testId.submit));
    await waitFor(() => expect(screen.getByTestId(testId.username)).toHaveValue('ana.perez'));

    // Segundo fallo con otro usuario: el `defaultValue` vuelve a cambiar.
    await user.clear(screen.getByTestId(testId.username));
    await user.type(screen.getByTestId(testId.username), 'luis.gomez');
    await user.type(screen.getByTestId(testId.password), 'otra-clave');
    await user.click(screen.getByTestId(testId.submit));
    await waitFor(() => expect(screen.getByTestId(testId.username)).toHaveValue('luis.gomez'));

    expect(avisosDeBaseUi()).toEqual([]);
  });

  it('el remontaje no roba el foco al enviar con el boton', async () => {
    const user = userEvent.setup();
    loginActionMock.mockResolvedValue({
      status: 'error',
      attemptId: 'intento-1',
      username: 'ana.perez',
      message: GENERIC_CREDENTIALS_ERROR,
    });
    render(<LoginForm />);

    await user.type(screen.getByTestId(testId.username), 'ana.perez');
    await user.type(screen.getByTestId(testId.password), 'clave-secreta');
    await user.click(screen.getByTestId(testId.submit));
    await waitFor(() => expect(screen.getByTestId(testId.username)).toHaveValue('ana.perez'));

    // El foco se queda en el boton de envio, igual que antes del arreglo: el input que se
    // remonta es el de usuario, que no lo tenia.
    expect(screen.getByTestId(testId.submit)).toHaveFocus();
  });

  it('el remontaje no roba el foco al enviar con Enter desde la contrasena', async () => {
    const user = userEvent.setup();
    loginActionMock.mockResolvedValue({
      status: 'error',
      attemptId: 'intento-1',
      username: 'ana.perez',
      message: GENERIC_CREDENTIALS_ERROR,
    });
    render(<LoginForm />);

    await user.type(screen.getByTestId(testId.username), 'ana.perez');
    await user.type(screen.getByTestId(testId.password), 'clave-secreta{Enter}');
    await waitFor(() => expect(screen.getByTestId(testId.username)).toHaveValue('ana.perez'));

    // Enviando con Enter desde la contrasena, el foco sigue en la contrasena: solo se remonta
    // el campo de usuario, que no tenia el foco.
    expect(screen.getByTestId(testId.password)).toHaveFocus();
  });

  it('un reintento con el mismo usuario no remonta y conserva el foco en el campo', async () => {
    const user = userEvent.setup();
    loginActionMock
      .mockResolvedValueOnce({
        status: 'error',
        attemptId: 'intento-1',
        username: 'ana.perez',
        message: GENERIC_CREDENTIALS_ERROR,
      })
      .mockResolvedValueOnce({
        status: 'error',
        attemptId: 'intento-2',
        username: 'ana.perez',
        message: GENERIC_CREDENTIALS_ERROR,
      });
    render(<LoginForm />);

    await user.type(screen.getByTestId(testId.password), 'clave-secreta');
    await user.type(screen.getByTestId(testId.username), 'ana.perez{Enter}');
    await waitFor(() => expect(loginActionMock).toHaveBeenCalledTimes(1));

    // Segundo intento con el MISMO usuario: la clave no cambia, no hay remontaje. Esta es la
    // razon de derivar la clave del `username` y no del `attemptId` (que cambia siempre).
    await user.type(screen.getByTestId(testId.password), 'otra-clave');
    screen.getByTestId(testId.username).focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(loginActionMock).toHaveBeenCalledTimes(2));

    expect(screen.getByTestId(testId.username)).toHaveFocus();
  });
});
