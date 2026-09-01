// T8 — El login rechaza una contrasena mas larga que el maximo, con su mensaje de campo y
// sin intentar autenticar (R10).

import { loginAction } from '@/lib/actions/login';
import {
  CREDENTIAL_MAX_LENGTH,
  LOGIN_INITIAL_STATE,
  PASSWORD_TOO_LONG_ERROR,
  REQUIRED_FIELD_ERROR,
} from '@/lib/types/auth';

const { verifyCredentialsMock } = vi.hoisted(() => ({
  verifyCredentialsMock:
    vi.fn<(input: { username: string; password: string }) => Promise<{ ok: boolean }>>(),
}));

vi.mock('@/lib/services/login-stub', () => ({
  verifyCredentials: verifyCredentialsMock,
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

function submit(fields: { username: string; password: string }) {
  const formData = new FormData();
  formData.set('username', fields.username);
  formData.set('password', fields.password);
  return loginAction(LOGIN_INITIAL_STATE, formData);
}

beforeEach(() => {
  vi.clearAllMocks();
  verifyCredentialsMock.mockResolvedValue({ ok: false });
});

describe('maximo de longitud de la contrasena en el login', () => {
  it(`rechaza una contrasena de ${CREDENTIAL_MAX_LENGTH + 1} caracteres`, async () => {
    const estado = await submit({
      username: 'ana.perez',
      password: 'a'.repeat(CREDENTIAL_MAX_LENGTH + 1),
    });

    expect(estado.status).toBe('invalid');
    if (estado.status !== 'invalid') throw new Error('estado inesperado');
    expect(estado.fieldErrors.password).toBe(PASSWORD_TOO_LONG_ERROR);
  });

  it('no intenta autenticar cuando la contrasena excede el maximo', async () => {
    await submit({ username: 'ana.perez', password: 'a'.repeat(CREDENTIAL_MAX_LENGTH + 1) });

    expect(verifyCredentialsMock).not.toHaveBeenCalled();
  });

  it(`acepta una contrasena de exactamente ${CREDENTIAL_MAX_LENGTH} caracteres`, async () => {
    const estado = await submit({
      username: 'ana.perez',
      password: 'a'.repeat(CREDENTIAL_MAX_LENGTH),
    });

    expect(estado.status).not.toBe('invalid');
    if (estado.status === 'invalid') throw new Error('estado inesperado');
    expect(verifyCredentialsMock).toHaveBeenCalledTimes(1);
  });

  it('una contrasena vacia sigue dando el error de campo obligatorio', async () => {
    const estado = await submit({ username: 'ana.perez', password: '' });

    expect(estado.status).toBe('invalid');
    if (estado.status !== 'invalid') throw new Error('estado inesperado');
    expect(estado.fieldErrors.password).toBe(REQUIRED_FIELD_ERROR);
  });
});
