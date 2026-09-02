import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { redirect } from 'next/navigation';

import { loginAction } from '@/lib/modules/identity/adapters/driving/login-action';
import { DASHBOARD_ROUTE } from '@/lib/shared/routes';
import {
  GENERIC_CREDENTIALS_ERROR,
  LOGIN_INITIAL_STATE,
  type LoginFormState,
} from '@/lib/modules/identity/adapters/driving/login-form-state';

const { verifyCredentialsMock } = vi.hoisted(() => ({
  verifyCredentialsMock: vi.fn<(input: { username: string; password: string }) => Promise<{ ok: boolean }>>(),
}));

vi.mock('@/lib/composition', () => ({
  identity: { verifyCredentials: verifyCredentialsMock },
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

function formDataOf(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    formData.set(name, value);
  }
  return formData;
}

function submit(fields: Record<string, string>, prevState: LoginFormState = LOGIN_INITIAL_STATE) {
  return loginAction(prevState, formDataOf(fields));
}

beforeEach(() => {
  vi.clearAllMocks();
  // Doble explicito: la action se testea contra un doble, nunca contra el dominio real.
  // Por defecto rechaza; los tests que necesitan otro resultado lo sobreescriben.
  verifyCredentialsMock.mockResolvedValue({ ok: false });
});

describe('loginAction', () => {
  it('envia usuario y contrasena a la action al hacer submit', async () => {
    await submit({ username: 'ana.perez', password: ' clave con espacios ' });

    expect(verifyCredentialsMock).toHaveBeenCalledTimes(1);
    expect(verifyCredentialsMock).toHaveBeenCalledWith({
      username: 'ana.perez',
      password: ' clave con espacios ',
    });
  });

  it('devuelve error de campo obligatorio y no verifica credenciales si un campo esta vacio', async () => {
    const sinUsuario = await submit({ username: '   ', password: 'clave' });
    const sinContrasena = await submit({ username: 'ana.perez', password: '' });
    const ambosVacios = await submit({ username: '', password: '' });

    expect(sinUsuario.status).toBe('invalid');
    expect(sinContrasena.status).toBe('invalid');
    expect(ambosVacios.status).toBe('invalid');

    if (
      sinUsuario.status !== 'invalid' ||
      sinContrasena.status !== 'invalid' ||
      ambosVacios.status !== 'invalid'
    ) {
      throw new Error('estado inesperado');
    }

    expect(sinUsuario.fieldErrors.username).toBeTruthy();
    expect(sinUsuario.fieldErrors.password).toBeUndefined();

    expect(sinContrasena.fieldErrors.password).toBeTruthy();
    expect(sinContrasena.fieldErrors.username).toBeUndefined();

    expect(ambosVacios.fieldErrors.username).toBeTruthy();
    expect(ambosVacios.fieldErrors.password).toBeTruthy();

    expect(verifyCredentialsMock).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('usa el mismo mensaje para usuario inexistente y para contrasena incorrecta', async () => {
    verifyCredentialsMock.mockResolvedValue({ ok: false });

    const usuarioInexistente = await submit({ username: 'no.existe', password: 'clave' });
    const contrasenaIncorrecta = await submit({ username: 'ana.perez', password: 'incorrecta' });

    if (usuarioInexistente.status !== 'error' || contrasenaIncorrecta.status !== 'error') {
      throw new Error('estado inesperado');
    }

    expect(usuarioInexistente.message).toBe(GENERIC_CREDENTIALS_ERROR);
    expect(contrasenaIncorrecta.message).toBe(usuarioInexistente.message);
  });

  it('conserva el usuario escrito tras un intento rechazado', async () => {
    verifyCredentialsMock.mockResolvedValue({ ok: false });

    const rechazado = await submit({ username: 'ana.perez', password: 'clave' });
    const invalido = await submit({ username: 'ana.perez', password: '' });

    if (rechazado.status !== 'error' || invalido.status !== 'invalid') {
      throw new Error('estado inesperado');
    }

    expect(rechazado.username).toBe('ana.perez');
    expect(invalido.username).toBe('ana.perez');
  });

  it('el estado devuelto nunca contiene la contrasena', async () => {
    const secreto = 'zxq-secreto-9137';
    verifyCredentialsMock.mockResolvedValue({ ok: false });

    const rechazado = await submit({ username: 'ana.perez', password: secreto });
    const invalido = await submit({ username: '', password: secreto });

    for (const estado of [rechazado, invalido]) {
      const serializado = JSON.stringify(estado);
      expect(serializado).not.toContain(secreto);
      expect(Object.keys(estado)).not.toContain('password');
      expect(serializado).not.toMatch(/"password"/);
    }
  });

  it('redirige a /dashboard cuando las credenciales son aceptadas y no emite toast', async () => {
    verifyCredentialsMock.mockResolvedValue({ ok: true });

    const resultado = await submit({ username: 'ana.perez', password: 'clave' });

    expect(redirect).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith(DASHBOARD_ROUTE);
    // Sin estado de error, no hay nada de lo que el cliente pueda derivar un toast (R17).
    expect(resultado).toBeUndefined();
  });

  it('no accede a base de datos ni emite cookie', () => {
    const modulos = [
      'lib/modules/identity/adapters/driving/login-action.ts',
      'lib/modules/identity/domain/verify-credentials.ts',
    ];
    const prohibidos = [
      /(^|\/)next\/headers$/,
      /^@prisma\/client$/,
      /^\.{0,2}\/?.*\bprisma\b/i,
      /^@supabase\//,
      /supabase/i,
    ];

    for (const modulo of modulos) {
      const fuente = readFileSync(resolve(process.cwd(), modulo), 'utf8');
      const especificadores = [...fuente.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);

      expect(especificadores.length).toBeGreaterThan(0);
      for (const especificador of especificadores) {
        for (const prohibido of prohibidos) {
          expect(especificador).not.toMatch(prohibido);
        }
      }

      expect(fuente).not.toMatch(/\bcookies\s*\(/);
      expect(fuente).not.toMatch(/\bSet-Cookie\b/i);
      expect(fuente).not.toMatch(/\bprisma\b/i);
    }
  });

  it('genera un attemptId distinto por invocacion', async () => {
    verifyCredentialsMock.mockResolvedValue({ ok: false });

    const primero = await submit({ username: 'ana.perez', password: 'clave' });
    const segundo = await submit({ username: 'ana.perez', password: 'clave' });
    const invalido = await submit({ username: '', password: '' });

    if (primero.status !== 'error' || segundo.status !== 'error' || invalido.status !== 'invalid') {
      throw new Error('estado inesperado');
    }

    expect(primero.attemptId).toEqual(expect.any(String));
    expect(primero.attemptId).not.toBe(segundo.attemptId);
    expect(invalido.attemptId).not.toBe(primero.attemptId);
    expect(LOGIN_INITIAL_STATE).not.toHaveProperty('attemptId');
  });
});
