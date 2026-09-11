// QC-79 T19 — La pantalla publica donde una persona establece su contrasena.
//
// Cubre **R24** (ningun dato del usuario en pantalla, en ningun instante) y **R25** (la regla
// multiplataforma de `docs/architecture.md`: `dvh` y nunca `100vh`, 16 px en los campos de
// contrasena, objetivos tactiles de 44 x 44 px y ninguna accion alcanzable solo con `:hover`), y
// ejerce los **cinco** estados de `SetCredentialFormState`.
//
// La Server Action se mockea: importarla de verdad arrastraria `'use server'` y el punto de
// composicion —o sea Prisma y la configuracion de correo— a un test de interfaz. Mismo patron que
// `tests/unit/login-form.test.tsx` con `loginAction`.

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';

import CredentialSetupPage from '@/app/(public)/establecer-contrasena/[token]/page';
import {
  SET_CREDENTIAL_LABELS,
  SetCredentialForm,
} from '@/app/(public)/establecer-contrasena/[token]/components';
import { CREDENTIAL_RULE_LABELS } from '@/components/shared/credential-rule-labels';
import type { SetCredentialFormState } from '@/lib/modules/identity/adapters/driving/credential-setup-actions';
import { CREDENTIAL_SETUP_ROUTE, LOGIN_ROUTE, credentialSetupRoute } from '@/lib/shared/routes';

import { setupUser } from '../../helpers/user-event';

const { setCredentialWithLinkActionMock } = vi.hoisted(() => ({
  setCredentialWithLinkActionMock:
    vi.fn<
      (prevState: SetCredentialFormState, formData: FormData) => Promise<SetCredentialFormState>
    >(),
}));

vi.mock('@/lib/modules/identity/adapters/driving/credential-setup-actions', () => ({
  setCredentialWithLinkAction: setCredentialWithLinkActionMock,
}));

const testId = {
  screen: 'set-credential-screen',
  form: 'set-credential-form',
  secret: 'set-credential-secret',
  credential: 'set-credential-credential',
  confirmation: 'set-credential-confirmation',
  submit: 'set-credential-submit',
  unmet: 'set-credential-unmet',
  mismatch: 'set-credential-mismatch',
  error: 'set-credential-error',
  reference: 'set-credential-error-reference',
  success: 'set-credential-success',
  loginLink: 'set-credential-login-link',
} as const;

/** Un secreto con la pinta del real: 43 caracteres base64url (32 bytes). Ver `design.md > 4.2`. */
const SECRETO = 'n5q7Yx0Zt1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r';

/**
 * Los datos que la pantalla NO puede pintar en ningun instante (R24). Se afirman contra el texto
 * renderizado ENTERO, no contra un elemento concreto: lo que prohibe el requisito es que aparezcan,
 * no que aparezcan en un sitio.
 */
const DATOS_DEL_USUARIO = [
  'ana.perez',
  'Ana Pérez',
  'ana.perez@quimicloude.test',
  'Administrador',
  'Quimicloude SA',
] as const;

/** La pagina es un Server Component `async`: se invoca, se espera su arbol y se renderiza. */
async function renderPagina(token = SECRETO) {
  return render(await CredentialSetupPage({ params: Promise.resolve({ token }) }));
}

/** Deja el formulario en el estado que devuelve la action y espera a que React lo pinte. */
async function enviarCon(estado: SetCredentialFormState) {
  setCredentialWithLinkActionMock.mockResolvedValue(estado);
  const user = setupUser();
  render(<SetCredentialForm secret={SECRETO} />);
  await user.click(screen.getByTestId(testId.submit));
  // La accion es asincrona: se espera a que React salga del estado «enviando» antes de afirmar
  // nada, o se afirmaria sobre el formulario a medio camino.
  await waitFor(() => {
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
  });
  return user;
}

/** Todos los elementos con clases, para las afirmaciones de estilo de R25. */
function clasesDelArbol(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[class]')).map(
    (elemento) => elemento.className,
  );
}

beforeEach(() => {
  setCredentialWithLinkActionMock.mockReset();
  setCredentialWithLinkActionMock.mockResolvedValue({ status: 'idle' });
});

afterEach(() => {
  cleanup();
});

describe('R24 — la pantalla no pinta ningun dato del usuario', () => {
  it('no muestra nombre, correo, nombre de usuario, rol ni empresa antes de escribir nada', async () => {
    await renderPagina();

    const texto = document.body.textContent ?? '';
    for (const dato of DATOS_DEL_USUARIO) {
      expect(texto).not.toContain(dato);
    }
    // Ninguna direccion de correo, sea de quien sea: la arroba no aparece en la pantalla.
    expect(texto).not.toContain('@');
  });

  it('tampoco los muestra despues de establecerla: el exito no dice de quien es la cuenta', async () => {
    await enviarCon({ status: 'success' });

    const texto = document.body.textContent ?? '';
    for (const dato of DATOS_DEL_USUARIO) {
      expect(texto).not.toContain(dato);
    }
    expect(texto).not.toContain('@');
  });

  it('la pagina no consulta nada ni recibe datos de usuario: su unica entrada es el segmento', async () => {
    await renderPagina();

    // El formulario existe sin que nadie haya leido la base: si la pagina validara el enlace al
    // pintarse (descartado en `design.md > 11.4`) este render habria necesitado un doble.
    expect(screen.getByTestId(testId.form)).toBeInTheDocument();
    expect(setCredentialWithLinkActionMock).not.toHaveBeenCalled();
  });
});

describe('el secreto del enlace', () => {
  it('viaja en un campo OCULTO del formulario, con el valor del segmento de la URL', async () => {
    await renderPagina();

    const campo = screen.getByTestId(testId.secret);
    expect(campo).toHaveAttribute('type', 'hidden');
    expect(campo).toHaveAttribute('name', 'secret');
    expect(campo).toHaveValue(SECRETO);
  });

  it('no se pinta como texto ni se reescribe en ningun enlace de la pantalla', async () => {
    await renderPagina();

    expect(document.body.textContent ?? '').not.toContain(SECRETO);
    const enlaces = Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(enlaces.some((href) => href?.includes(SECRETO))).toBe(false);
  });

  it('el helper de la ruta compone el camino que la pagina sirve', () => {
    expect(credentialSetupRoute(SECRETO)).toBe(`${CREDENTIAL_SETUP_ROUTE}/${SECRETO}`);
  });
});

describe('R25 — multiplataforma', () => {
  it('el alto de pantalla usa `dvh` y en ningun sitio `100vh`', async () => {
    await renderPagina();

    expect(screen.getByTestId(testId.screen).className).toContain('min-h-dvh');

    const clases = clasesDelArbol().join(' ');
    expect(clases).not.toContain('100vh');
    expect(clases).not.toContain('min-h-screen');
    expect(clases).not.toMatch(/(^|[\s:])h-screen/);
  });

  it('los campos de contrasena miden 16 px, tambien por encima del breakpoint `md`', async () => {
    await renderPagina();

    for (const id of [testId.credential, testId.confirmation]) {
      const campo = screen.getByTestId(id);
      expect(campo.className).toContain('text-base');
      // El primitivo trae `md:text-sm` (14 px), que es lo que hace a iOS ampliar al enfocar: la
      // pantalla lo sobrescribe y la clase no puede quedar en el resultado.
      expect(campo.className).not.toContain('md:text-sm');
      expect(campo.className).not.toMatch(/(^|\s)text-(sm|xs)(\s|$)/);
    }
  });

  it('los botones son objetivos tactiles de al menos 44 x 44 px', async () => {
    await renderPagina();

    const botones = screen.getAllByRole('button');
    expect(botones.length).toBeGreaterThan(0);
    for (const boton of botones) {
      const clases = boton.className;
      const alto = /(^|\s)(min-h-11|h-11|size-11)(\s|$)/.test(clases);
      const ancho = /(^|\s)(min-w-11|w-11|size-11|w-full)(\s|$)/.test(clases);
      expect(alto, `alto del boton: ${clases}`).toBe(true);
      expect(ancho, `ancho del boton: ${clases}`).toBe(true);
    }
  });

  it('mostrar/ocultar la contrasena es un BOTON y no depende de `:hover`', async () => {
    const user = setupUser();
    await renderPagina();

    const campo = screen.getByTestId(testId.credential);
    const toggle = screen.getByTestId(`${testId.credential}-toggle`);

    expect(toggle.tagName).toBe('BUTTON');
    expect(toggle).toHaveAttribute('type', 'button');
    expect(toggle).toHaveAccessibleName();
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    expect(campo).toHaveAttribute('type', 'password');
    await user.click(toggle);
    expect(campo).toHaveAttribute('type', 'text');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await user.click(toggle);
    expect(campo).toHaveAttribute('type', 'password');
  });

  it('ninguna clase esconde o revela algo solo con el puntero encima', async () => {
    await renderPagina();

    const clases = clasesDelArbol().join(' ');
    // `hover:` para color o fondo es decoracion y no es la unica via de nada; lo prohibido es que
    // la VISIBILIDAD dependa del puntero, que en un movil no existe.
    expect(clases).not.toMatch(/hover:(block|flex|inline|visible|opacity-100)/);
    expect(clases).not.toMatch(/group-hover:/);
  });
});

describe('ningun recurso de terceros (design.md > 4.4)', () => {
  it('la pantalla no carga nada de un origen externo y declara `referrer: no-referrer`', async () => {
    await renderPagina();

    const meta = document.querySelector('meta[name="referrer"]');
    expect(meta).not.toBeNull();
    expect(meta?.getAttribute('content')).toBe('no-referrer');

    const externos = Array.from(document.querySelectorAll('[src], link[href]')).filter((nodo) => {
      const url = nodo.getAttribute('src') ?? nodo.getAttribute('href') ?? '';
      return /^(https?:)?\/\//.test(url);
    });
    expect(externos).toHaveLength(0);
  });
});

describe('los cinco estados de SetCredentialFormState', () => {
  it('idle: formulario limpio, sin ningun aviso', async () => {
    await renderPagina();

    expect(screen.getByTestId(testId.form)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByTestId(testId.success)).toBeNull();
  });

  it('success: no se inicia sesion, se ofrece un ENLACE al login (design.md > 11.5)', async () => {
    await enviarCon({ status: 'success' });

    expect(screen.getByTestId(testId.success)).toBeInTheDocument();
    // El formulario desaparece: no hay nada mas que establecer.
    expect(screen.queryByTestId(testId.form)).toBeNull();

    const enlace = screen.getByTestId(testId.loginLink);
    expect(enlace.tagName).toBe('A');
    expect(enlace).toHaveAttribute('href', LOGIN_ROUTE);
    // Retensado: no basta con que sea un `<a href>`. Tiene que EXPONERSE como enlace, asi que se
    // afirma el rol accesible y que nadie le ha puesto encima `role="button"` para callar el aviso
    // de `nativeButton` de Base UI -que es exactamente lo que hace `nativeButton={false}`-.
    expect(screen.getByRole('link', { name: SET_CREDENTIAL_LABELS.goToLogin })).toBe(enlace);
    expect(enlace).not.toHaveAttribute('role');
    expect(screen.queryByRole('button')).toBeNull();
    // El objetivo tactil de 44 px de R25 sigue en el propio `<a>`, que es lo que se toca.
    expect(enlace.className).toContain('min-h-11');
    expect(enlace.className).toContain('w-full');
  });

  it('invalid_credential: la UI compone el texto de CADA regla incumplida con su codigo', async () => {
    await enviarCon({ status: 'invalid_credential', unmet: ['min_length', 'no_digit', 'breached'] });

    const lista = screen.getByTestId(testId.unmet);
    const puntos = within(lista).getAllByRole('listitem');
    expect(puntos.map((punto) => punto.getAttribute('data-rule'))).toEqual([
      'min_length',
      'no_digit',
      'breached',
    ]);
    expect(puntos.map((punto) => punto.textContent)).toEqual([
      CREDENTIAL_RULE_LABELS.min_length,
      CREDENTIAL_RULE_LABELS.no_digit,
      CREDENTIAL_RULE_LABELS.breached,
    ]);

    // El aviso se anuncia y el campo lo cita: el canal no es solo el color (R25 y WAI-ARIA).
    const aviso = screen.getByRole('alert');
    expect(screen.getByTestId(testId.credential)).toHaveAttribute('aria-describedby', aviso.id);

    // El enlace sigue vivo: el formulario se puede reintentar sin recargar (R23).
    expect(screen.getByTestId(testId.secret)).toHaveValue(SECRETO);
    expect(screen.getByTestId(testId.submit)).toBeEnabled();
  });

  it('mismatch: se dice que no coinciden y no se dice nada mas de la contrasena', async () => {
    await enviarCon({ status: 'mismatch' });

    const aviso = screen.getByTestId(testId.mismatch);
    expect(aviso).toHaveAttribute('role', 'alert');
    expect(screen.getByTestId(testId.confirmation)).toHaveAttribute('aria-describedby', aviso.id);
    expect(screen.queryByTestId(testId.unmet)).toBeNull();
  });

  it('error: pinta el mensaje del catalogo, y la referencia de QC-71 cuando es el inesperado', async () => {
    await enviarCon({
      status: 'error',
      code: 'credential_link_invalid',
      message: 'El enlace ya no sirve.',
    });

    expect(screen.getByTestId(testId.error)).toHaveTextContent('El enlace ya no sirve.');
    expect(screen.queryByTestId(testId.reference)).toBeNull();

    cleanup();

    await enviarCon({
      status: 'error',
      code: 'unexpected',
      message: 'Ha ocurrido un error inesperado.',
      reference: 'req-abc-123',
    });

    expect(screen.getByTestId(testId.error)).toHaveTextContent('Ha ocurrido un error inesperado.');
    expect(screen.getByTestId(testId.reference)).toHaveTextContent('req-abc-123');
  });
});
