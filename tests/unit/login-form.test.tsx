import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';

import LoginPage from '@/app/(public)/login/page';
import { LoginForm } from '@/app/(public)/login/components';
import { Toaster } from '@/components/ui/sonner';
import { DASHBOARD_ROUTE, FORGOT_PASSWORD_ROUTE } from '@/lib/shared/routes';
import {
  GENERIC_CREDENTIALS_ERROR,
  REQUIRED_FIELD_ERROR,
  type LoginFormState,
} from '@/lib/modules/identity/adapters/driving/login-form-state';

const { loginActionMock } = vi.hoisted(() => ({
  loginActionMock:
    vi.fn<(prevState: LoginFormState, formData: FormData) => Promise<LoginFormState>>(),
}));

// Se mockea la action para controlar el estado devuelto y, sobre todo, para poder dejar la
// promesa PENDIENTE: es la unica forma de observar el estado «enviando» (R6, R7).
vi.mock('@/lib/modules/identity/adapters/driving/login-action', () => ({
  loginAction: loginActionMock,
}));

// Los asserts van sobre roles ARIA, `data-testid` y constantes exportadas, nunca sobre
// literales de copy (S4/D3).
const testId = {
  form: 'login-form',
  username: 'login-username',
  password: 'login-password',
  submit: 'login-submit',
  usernameError: 'login-username-error',
  passwordError: 'login-password-error',
  forgotPassword: 'login-forgot-password',
  next: 'login-next',
} as const;

/**
 * QC-9: la pagina es un Server Component `async` (Next 16 entrega `searchParams` como promesa),
 * asi que no se renderiza como elemento: se invoca, se espera su arbol y se renderiza el
 * resultado. Es la forma estandar de ejercitar un Server Component sin levantar Next.
 */
async function renderLoginPage(searchParams: Record<string, string | string[] | undefined> = {}) {
  return render(await LoginPage({ searchParams: Promise.resolve(searchParams) }));
}

let errorSpy: ReturnType<typeof vi.spyOn>;

function errorState(attemptId: string, username = 'ana.perez'): LoginFormState {
  return { status: 'error', attemptId, username, message: GENERIC_CREDENTIALS_ERROR };
}

function invalidState(
  attemptId: string,
  fieldErrors: { username?: string; password?: string },
  username = '',
): LoginFormState {
  return { status: 'invalid', attemptId, username, fieldErrors };
}

/** Deja la action colgada y devuelve el resolvedor, para observar el estado «enviando». */
function pendingAction() {
  let resolver!: (state: LoginFormState) => void;
  loginActionMock.mockImplementation(
    () =>
      new Promise<LoginFormState>((resolve) => {
        resolver = resolve;
      }),
  );
  return {
    resolve: async (state: LoginFormState) => {
      await act(async () => {
        resolver(state);
      });
    },
  };
}

async function fillAndSubmit(
  user: ReturnType<typeof userEvent.setup>,
  credentials: { username: string; password: string } = {
    username: 'ana.perez',
    password: 'clave-secreta',
  },
) {
  await user.type(screen.getByTestId(testId.username), credentials.username);
  await user.type(screen.getByTestId(testId.password), credentials.password);
  await user.click(screen.getByTestId(testId.submit));
}

beforeEach(() => {
  vi.clearAllMocks();
  loginActionMock.mockResolvedValue(errorState('intento-1'));
  // `spyOn` (que llama al original por defecto) en vez de mockear el modulo entero: asi el
  // test de R16 puede montar el `<Toaster />` real y seguir observando `toast.error`.
  errorSpy = vi.spyOn(toast, 'error');
});

afterEach(() => {
  cleanup();
  toast.dismiss();
  errorSpy.mockRestore();
});

describe('pantalla de login', () => {
  it('la pantalla de login se renderiza sin sesion', async () => {
    await renderLoginPage();

    expect(screen.getByTestId(testId.form)).toBeInTheDocument();
    expect(screen.getByTestId(testId.submit)).toBeInTheDocument();
  });

  it('muestra campo de usuario, campo de contrasena enmascarado y boton dentro de un form', () => {
    render(<LoginForm />);

    const form = screen.getByTestId(testId.form);
    expect(form.tagName).toBe('FORM');

    const usuario = within(form).getByTestId(testId.username);
    const contrasena = within(form).getByTestId(testId.password);
    const boton = within(form).getByTestId(testId.submit);

    expect(usuario).toHaveAttribute('name', 'username');
    expect(usuario).toHaveAccessibleName();
    expect(contrasena).toHaveAttribute('name', 'password');
    expect(contrasena).toHaveAttribute('type', 'password');
    expect(contrasena).toHaveAccessibleName();
    expect(boton).toHaveRole('button');
  });

  it('en estado inicial no muestra errores, no emite toast y los campos estan vacios', () => {
    render(<LoginForm />);

    expect(screen.getByTestId(testId.username)).toHaveValue('');
    expect(screen.getByTestId(testId.password)).toHaveValue('');
    expect(screen.queryByTestId(testId.usernameError)).not.toBeInTheDocument();
    expect(screen.queryByTestId(testId.passwordError)).not.toBeInTheDocument();
    expect(screen.getByTestId(testId.username)).not.toHaveAttribute('aria-invalid');
    expect(screen.getByTestId(testId.password)).not.toHaveAttribute('aria-invalid');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('activar la etiqueta enfoca su campo', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    const usuario = screen.getByTestId(testId.username);
    const contrasena = screen.getByTestId(testId.password);

    const etiquetaUsuario = document.querySelector<HTMLLabelElement>(`label[for="${usuario.id}"]`);
    const etiquetaContrasena = document.querySelector<HTMLLabelElement>(
      `label[for="${contrasena.id}"]`,
    );
    expect(etiquetaUsuario).not.toBeNull();
    expect(etiquetaContrasena).not.toBeNull();

    await user.click(etiquetaUsuario as HTMLLabelElement);
    expect(usuario).toHaveFocus();

    await user.click(etiquetaContrasena as HTMLLabelElement);
    expect(contrasena).toHaveFocus();
  });

  it('deshabilita el boton mientras el envio esta en curso', async () => {
    const user = userEvent.setup();
    const enCurso = pendingAction();
    render(<LoginForm />);

    await fillAndSubmit(user);

    expect(screen.getByTestId(testId.submit)).toBeDisabled();

    await enCurso.resolve(errorState('intento-1'));
  });

  it('marca aria-busy mientras el envio esta en curso', async () => {
    const user = userEvent.setup();
    const enCurso = pendingAction();
    render(<LoginForm />);

    expect(screen.getByTestId(testId.submit)).toHaveAttribute('aria-busy', 'false');

    await fillAndSubmit(user);

    expect(screen.getByTestId(testId.submit)).toHaveAttribute('aria-busy', 'true');

    await enCurso.resolve(errorState('intento-1'));
  });

  it('rehabilita el boton cuando el envio termina con error', async () => {
    const user = userEvent.setup();
    const enCurso = pendingAction();
    render(<LoginForm />);

    await fillAndSubmit(user);
    expect(screen.getByTestId(testId.submit)).toBeDisabled();

    await enCurso.resolve(errorState('intento-1'));

    await waitFor(() => expect(screen.getByTestId(testId.submit)).toBeEnabled());
    expect(screen.getByTestId(testId.submit)).toHaveAttribute('aria-busy', 'false');
  });

  it('muestra el error de campo inline, marca aria-invalid y lo vincula con aria-describedby', async () => {
    const user = userEvent.setup();
    loginActionMock.mockResolvedValue(
      invalidState('intento-1', {
        username: REQUIRED_FIELD_ERROR,
        password: REQUIRED_FIELD_ERROR,
      }),
    );
    render(<LoginForm />);

    await user.click(screen.getByTestId(testId.submit));

    const mensajeUsuario = await screen.findByTestId(testId.usernameError);
    const mensajeContrasena = await screen.findByTestId(testId.passwordError);
    const usuario = screen.getByTestId(testId.username);
    const contrasena = screen.getByTestId(testId.password);

    expect(mensajeUsuario).toHaveTextContent(REQUIRED_FIELD_ERROR);
    expect(mensajeContrasena).toHaveTextContent(REQUIRED_FIELD_ERROR);

    expect(usuario).toHaveAttribute('aria-invalid', 'true');
    expect(usuario).toHaveAttribute('aria-describedby', mensajeUsuario.id);
    expect(contrasena).toHaveAttribute('aria-invalid', 'true');
    expect(contrasena).toHaveAttribute('aria-describedby', mensajeContrasena.id);

    // Inline: el mensaje vive dentro del formulario, junto a su campo.
    expect(screen.getByTestId(testId.form)).toContainElement(mensajeUsuario);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('emite un toast de error cuando las credenciales no son aceptadas', async () => {
    const user = userEvent.setup();
    loginActionMock.mockResolvedValue(errorState('intento-1'));
    render(<LoginForm />);

    await fillAndSubmit(user);

    await waitFor(() => expect(errorSpy).toHaveBeenCalledTimes(1));
    expect(errorSpy).toHaveBeenCalledWith(GENERIC_CREDENTIALS_ERROR);
    // El error generico NO se pinta inline.
    expect(screen.queryByTestId(testId.usernameError)).not.toBeInTheDocument();
  });

  it('conserva el usuario escrito tras un intento rechazado', async () => {
    const user = userEvent.setup();
    loginActionMock.mockResolvedValue(errorState('intento-1', 'ana.perez'));
    render(<LoginForm />);

    await fillAndSubmit(user);

    await waitFor(() => expect(screen.getByTestId(testId.username)).toHaveValue('ana.perez'));
  });

  it('deja el campo de contrasena vacio tras un intento rechazado', async () => {
    const user = userEvent.setup();
    loginActionMock.mockResolvedValue(errorState('intento-1', 'ana.perez'));
    render(<LoginForm />);

    await fillAndSubmit(user);

    await waitFor(() => expect(screen.getByTestId(testId.username)).toHaveValue('ana.perez'));
    expect(screen.getByTestId(testId.password)).toHaveValue('');
  });

  it('el toast de error se anuncia por region live sin mover el foco', async () => {
    const user = userEvent.setup();
    loginActionMock.mockResolvedValue(errorState('intento-1'));
    render(
      <>
        <LoginForm />
        <Toaster />
      </>,
    );

    await fillAndSubmit(user);

    const focoAntes = document.activeElement;

    const anuncio = await screen.findByText(GENERIC_CREDENTIALS_ERROR);
    const regionLive = anuncio.closest('[aria-live]');

    expect(regionLive).not.toBeNull();
    expect(regionLive).toHaveAttribute('aria-live');
    expect(regionLive).toHaveTextContent(GENERIC_CREDENTIALS_ERROR);

    // El anuncio no roba el foco: sigue donde lo dejo el envio (R16).
    expect(document.activeElement).toBe(focoAntes);
    expect(regionLive?.contains(document.activeElement)).toBe(false);
  });

  it('envia el formulario al pulsar Enter dentro de un campo', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByTestId(testId.username), 'ana.perez');
    await user.type(screen.getByTestId(testId.password), 'clave-secreta{Enter}');

    await waitFor(() => expect(loginActionMock).toHaveBeenCalledTimes(1));
    const formData = loginActionMock.mock.calls[0][1];
    expect(formData.get('username')).toBe('ana.perez');
    expect(formData.get('password')).toBe('clave-secreta');
  });

  it('no emite toast al montar', () => {
    render(<LoginForm />);

    expect(errorSpy).not.toHaveBeenCalled();
    expect(loginActionMock).not.toHaveBeenCalled();
  });

  it('no reemite el toast en un re-render del mismo intento', async () => {
    const user = userEvent.setup();
    loginActionMock.mockResolvedValue(errorState('intento-1'));
    const { rerender } = render(<LoginForm />);

    await fillAndSubmit(user);
    await waitFor(() => expect(errorSpy).toHaveBeenCalledTimes(1));

    rerender(<LoginForm />);
    await user.type(screen.getByTestId(testId.password), 'otra-cosa');
    rerender(<LoginForm />);

    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('emite un toast nuevo por cada intento rechazado, aunque la entrada sea identica', async () => {
    const user = userEvent.setup();
    loginActionMock
      .mockResolvedValueOnce(errorState('intento-1'))
      .mockResolvedValueOnce(errorState('intento-2'));
    render(<LoginForm />);

    await fillAndSubmit(user);
    await waitFor(() => expect(errorSpy).toHaveBeenCalledTimes(1));

    // Exactamente la misma entrada: el estado resultante es estructuralmente identico salvo
    // por el `attemptId`, que es justo lo que permite reemitir (R21).
    await user.type(screen.getByTestId(testId.password), 'clave-secreta');
    await user.click(screen.getByTestId(testId.submit));

    await waitFor(() => expect(errorSpy).toHaveBeenCalledTimes(2));
    expect(loginActionMock).toHaveBeenCalledTimes(2);
  });

  it('muestra el enlace de recuperacion apuntando a FORGOT_PASSWORD_ROUTE y accesible por teclado', async () => {
    const user = userEvent.setup();
    await renderLoginPage();

    const enlace = screen.getByTestId(testId.forgotPassword);
    expect(enlace).toHaveRole('link');
    expect(enlace).toHaveAttribute('href', FORGOT_PASSWORD_ROUTE);
    expect(enlace).toHaveAccessibleName();

    // Fuera del formulario (design.md > 5.4).
    expect(screen.getByTestId(testId.form)).not.toContainElement(enlace);

    // Alcanzable con teclado: llega el foco tabulando desde el ultimo control del formulario.
    screen.getByTestId(testId.submit).focus();
    await user.tab();
    expect(enlace).toHaveFocus();
  });

  it('muestra la marca del producto como titulo de la tarjeta', async () => {
    await renderLoginPage();

    const titulo = document.querySelector('[data-slot="card-title"]');
    expect(titulo).not.toBeNull();
    expect(titulo).toHaveTextContent('QuimiCloude');
  });
});

describe('destino de vuelta (QC-9 R7, R8, R9)', () => {
  it('la pagina pinta el destino pedido en un campo oculto del formulario', async () => {
    await renderLoginPage({ next: '/dashboard/reportes?desde=ayer' });

    const oculto = screen.getByTestId(testId.next);
    expect(oculto).toHaveAttribute('name', 'next');
    expect(oculto).toHaveValue('/dashboard/reportes?desde=ayer');
    expect(screen.getByTestId(testId.form)).toContainElement(oculto);
  });

  it('sin parametro de vuelta el campo oculto lleva el dashboard', async () => {
    await renderLoginPage();

    expect(screen.getByTestId(testId.next)).toHaveValue(DASHBOARD_ROUTE);
  });

  it('descarta un destino externo y cae al dashboard', async () => {
    await renderLoginPage({ next: 'https://evil.example/robo' });

    expect(screen.getByTestId(testId.next)).toHaveValue(DASHBOARD_ROUTE);
  });

  it('descarta un parametro repetido, que llega como lista y no como texto', async () => {
    await renderLoginPage({ next: ['/dashboard/reportes', 'https://evil.example'] });

    expect(screen.getByTestId(testId.next)).toHaveValue(DASHBOARD_ROUTE);
  });

  it('el campo oculto viaja en el FormData que recibe la Server Action', async () => {
    const user = userEvent.setup();
    await renderLoginPage({ next: '/dashboard/reportes' });

    await fillAndSubmit(user);

    await waitFor(() => expect(loginActionMock).toHaveBeenCalledTimes(1));
    expect(loginActionMock.mock.calls[0][1].get('next')).toBe('/dashboard/reportes');
  });

  it('no introduce ningun cambio visual', async () => {
    await renderLoginPage({ next: '/dashboard/reportes' });

    const form = screen.getByTestId(testId.form);
    const oculto = screen.getByTestId(testId.next);

    // Oculto de verdad: ni se ve, ni se anuncia, ni se tabula.
    expect(oculto).toHaveAttribute('type', 'hidden');
    expect(oculto).not.toBeVisible();
    expect(oculto).not.toHaveAccessibleName();

    // Los controles visibles del formulario siguen siendo los tres de QC-7: usuario,
    // contrasena y boton de envio.
    expect(within(form).getAllByRole('textbox')).toHaveLength(1);
    expect(within(form).getAllByRole('button')).toHaveLength(1);
    expect(within(form).getByTestId(testId.password)).toBeVisible();
  });

  it('el formulario montado sin destino de vuelta lleva el dashboard en el campo oculto', () => {
    render(<LoginForm />);

    expect(screen.getByTestId(testId.next)).toHaveValue(DASHBOARD_ROUTE);
  });
});
