// T5 — El adaptador de cookie de sesion: que se escribe, con que atributos y que pasa si
// falta el secreto (R9-R13, R15). Se mockea `next/headers` y se afirma sobre los argumentos
// con los que se llamo a `set`: el valor firmado se **recomputa** con `createHmac`, nunca se
// compara contra un literal copiado que envejeceria con el formato.

import { createHmac } from 'node:crypto';

import {
  SESSION_COOKIE_NAME,
  clearSession,
  readSessionClaims,
  startSession,
} from '@/lib/modules/identity/adapters/driven/session/session-cookie';
import { SESSION_DURATION_MS, createSessionTicket } from '@/lib/modules/identity/domain/session';

// `vi.mock` se iza al principio del archivo: los dobles se crean con `vi.hoisted` para
// que existan antes que la fabrica del mock.
const { cookiesMock, setMock, getMock, deleteMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  setMock: vi.fn(),
  getMock: vi.fn(),
  deleteMock: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: cookiesMock,
}));

const AHORA = new Date('2026-09-01T08:00:00.000Z');
const USER_ID = '3f2b1c9e-0d4a-4c8b-9e77-2a5f6c1d8b40';
const SECRETO = 'secreto-de-pruebas-de-64-caracteres-para-firmar-la-sesion-qc7-ok';

/** El `.env` del worktree trae `SESSION_SECRET`: se guarda y se restaura por test. */
let secretoOriginal: string | undefined;

type CookieOptions = {
  readonly name: string;
  readonly value: string;
  readonly httpOnly: boolean;
  readonly secure: boolean;
  readonly sameSite: string;
  readonly path: string;
  readonly maxAge: number;
  readonly domain?: string;
};

function cookieEmitida(): CookieOptions {
  expect(setMock).toHaveBeenCalledTimes(1);
  return setMock.mock.calls[0]?.[0] as CookieOptions;
}

function decodificarPayload(value: string): Record<string, unknown> {
  const [, encodedPayload] = value.split('.');
  return JSON.parse(Buffer.from(encodedPayload ?? '', 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
}

beforeEach(() => {
  setMock.mockReset();
  getMock.mockReset();
  deleteMock.mockReset();
  cookiesMock.mockReset();
  cookiesMock.mockResolvedValue({ set: setMock, get: getMock, delete: deleteMock });
  secretoOriginal = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = SECRETO;
});

afterEach(() => {
  if (secretoOriginal === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = secretoOriginal;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('cookie de sesion', () => {
  // R9
  it('la cookie se emite httpOnly', async () => {
    await startSession(createSessionTicket(USER_ID, AHORA));

    const cookie = cookieEmitida();
    expect(cookie.name).toBe(SESSION_COOKIE_NAME);
    expect(cookie.httpOnly).toBe(true);
  });

  // R10
  it('sameSite lax, path / y secure solo en produccion', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await startSession(createSessionTicket(USER_ID, AHORA));

    const enProduccion = cookieEmitida();
    expect(enProduccion.sameSite).toBe('lax');
    expect(enProduccion.path).toBe('/');
    expect(enProduccion.secure).toBe(true);
    // `domain` no se declara: declararlo ampliaria la sesion a todos los subdominios.
    expect(enProduccion.domain).toBeUndefined();

    vi.stubEnv('NODE_ENV', 'development');
    setMock.mockReset();
    await startSession(createSessionTicket(USER_ID, AHORA));

    const fueraDeProduccion = cookieEmitida();
    expect(fueraDeProduccion.secure).toBe(false);
    expect(fueraDeProduccion.sameSite).toBe('lax');
    expect(fueraDeProduccion.path).toBe('/');
  });

  // R11
  it('maxAge y exp coinciden con la duracion', async () => {
    const ticket = createSessionTicket(USER_ID, AHORA);
    await startSession(ticket);

    const cookie = cookieEmitida();
    expect(cookie.maxAge).toBe(SESSION_DURATION_MS / 1000);

    const payload = decodificarPayload(cookie.value);
    expect(payload.exp).toBe(Math.floor(ticket.expiresAt.getTime() / 1000));
    expect(payload.iat).toBe(Math.floor(ticket.issuedAt.getTime() / 1000));
    // La caducidad que vale es la firmada: el `maxAge` lo controla el navegador.
    expect((payload.exp as number) - (payload.iat as number)).toBe(SESSION_DURATION_MS / 1000);
  });

  // R12
  it('el valor va firmado con HMAC y solo lleva sub/iat/exp', async () => {
    await startSession(createSessionTicket(USER_ID, AHORA));

    const { value } = cookieEmitida();
    const [version, encodedPayload, firma] = value.split('.');
    expect(version).toBe('v1');

    const esperada = createHmac('sha256', SECRETO)
      .update(`${version}.${encodedPayload}`)
      .digest('base64url');
    expect(firma).toBe(esperada);

    const payload = decodificarPayload(value);
    expect(Object.keys(payload)).toEqual(['sub', 'iat', 'exp']);
    expect(payload.sub).toBe(USER_ID);
    expect(value).not.toContain(SECRETO);
  });

  // R13
  it('sin secreto valido lanza y no escribe cookie', async () => {
    delete process.env.SESSION_SECRET;
    await expect(startSession(createSessionTicket(USER_ID, AHORA))).rejects.toThrow(
      /SESSION_SECRET/,
    );
    expect(setMock).not.toHaveBeenCalled();

    process.env.SESSION_SECRET = 'corto123';
    await expect(startSession(createSessionTicket(USER_ID, AHORA))).rejects.toThrow(
      /SESSION_SECRET/,
    );
    expect(setMock).not.toHaveBeenCalled();
  });

  // R15 — solo el tercio del requisito que pasa por aqui: el valor de la cookie y el secreto
  // que la firma. La contrasena y el hash no cruzan nunca esta funcion, y su clausula la
  // ejercita `verify-credentials.test.ts` ("no se registra la contrasena ni el hash...").
  it('no se registra el valor de la cookie ni el secreto que la firma', async () => {
    const espias = (['log', 'info', 'warn', 'error', 'debug'] as const).map((metodo) =>
      vi.spyOn(console, metodo).mockImplementation(() => {}),
    );

    await startSession(createSessionTicket(USER_ID, AHORA));
    const { value } = cookieEmitida();

    // Emitir la cookie no escribe en ningun registro de salida, ni siquiera algo inocuo. La
    // asercion por contenido sobraria detras de esta: si nada se registra, no hay cadena que
    // inspeccionar. Se afirma lo fuerte y se deja el contenido al test que si tiene llamadas.
    for (const espia of espias) expect(espia).not.toHaveBeenCalled();
    expect(value).not.toContain(SECRETO);
  });
});

// T5 — lectura y borrado (`design.md > 4.1`, `requirements.md` R2-R5, R8, R9, R18). El caso
// feliz se construye llamando a `startSession` y capturando lo que escribio en `set`: es el
// unico punto donde escritor y lector se cruzan de verdad, y evita repetir el error del
// bloque 1 (unidades de `iat`/`exp` distintas entre quien firma y quien construye el test).
describe('lectura y borrado de la cookie de sesion', () => {
  async function valorValidoDeCookie(): Promise<string> {
    const ticket = createSessionTicket(USER_ID, AHORA);
    await startSession(ticket);
    const { value } = cookieEmitida();
    setMock.mockClear();
    return value;
  }

  // R2
  it('sin cookie devuelve null', async () => {
    getMock.mockReturnValue(undefined);

    await expect(readSessionClaims()).resolves.toBeNull();
  });

  // R3
  it('prefijo v0. devuelve null sin interpretar el resto', async () => {
    const valor = await valorValidoDeCookie();
    const [, encodedPayload, firma] = valor.split('.');
    getMock.mockReturnValue({ value: `v0.${encodedPayload}.${firma}` });

    await expect(readSessionClaims()).resolves.toBeNull();
  });

  // R4
  it('firma alterada en un byte (misma longitud) devuelve null', async () => {
    const valor = await valorValidoDeCookie();
    const [version, encodedPayload, firma] = valor.split('.');
    const firmaAlterada = firma.startsWith('A') ? `B${firma.slice(1)}` : `A${firma.slice(1)}`;
    getMock.mockReturnValue({ value: `${version}.${encodedPayload}.${firmaAlterada}` });

    await expect(readSessionClaims()).resolves.toBeNull();
  });

  // R4
  it('firma de longitud distinta devuelve null sin lanzar', async () => {
    const valor = await valorValidoDeCookie();
    const [version, encodedPayload, firma] = valor.split('.');
    getMock.mockReturnValue({ value: `${version}.${encodedPayload}.${firma}xx` });

    await expect(readSessionClaims()).resolves.toBeNull();
  });

  // R6
  it('payload que no es JSON devuelve null', async () => {
    const valor = await valorValidoDeCookie();
    const [version] = valor.split('.');
    const payloadNoJson = Buffer.from('esto-no-es-json', 'utf8').toString('base64url');
    const signedPart = `${version}.${payloadNoJson}`;
    const firma = createHmac('sha256', SECRETO).update(signedPart).digest('base64url');
    getMock.mockReturnValue({ value: `${signedPart}.${firma}` });

    await expect(readSessionClaims()).resolves.toBeNull();
  });

  // R6
  it('sub que no es UUID devuelve null', async () => {
    const version = 'v1';
    const payload = { sub: 'no-es-un-uuid', iat: 1, exp: 2 };
    const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const signedPart = `${version}.${encodedPayload}`;
    const firma = createHmac('sha256', SECRETO).update(signedPart).digest('base64url');
    getMock.mockReturnValue({ value: `${signedPart}.${firma}` });

    await expect(readSessionClaims()).resolves.toBeNull();
  });

  // R9
  it('sin SESSION_SECRET la lectura lanza sin exponer el secreto, y clearSession sigue funcionando', async () => {
    const valor = await valorValidoDeCookie();
    getMock.mockReturnValue({ value: valor });
    delete process.env.SESSION_SECRET;

    await expect(readSessionClaims()).rejects.toThrow(/SESSION_SECRET/);
    try {
      await readSessionClaims();
      throw new Error('readSessionClaims tenia que lanzar');
    } catch (error) {
      expect((error as Error).message).not.toContain(SECRETO);
    }

    await clearSession();
    expect(deleteMock).toHaveBeenCalledWith({ name: SESSION_COOKIE_NAME, path: '/' });
  });

  // R8
  it('leer una sesion valida no reemite ni prolonga la cookie', async () => {
    const valor = await valorValidoDeCookie();
    getMock.mockReturnValue({ value: valor });

    const claims = await readSessionClaims();

    expect(claims).not.toBeNull();
    expect(setMock).not.toHaveBeenCalled();
  });

  // El caso feliz: lo leido coincide con el ticket que se le paso a `startSession`.
  it('el valor valido emitido por startSession se lee de vuelta con los mismos datos', async () => {
    const ticket = createSessionTicket(USER_ID, AHORA);
    await startSession(ticket);
    const { value } = cookieEmitida();
    setMock.mockClear();
    getMock.mockReturnValue({ value });

    const claims = await readSessionClaims();

    expect(claims).not.toBeNull();
    expect(claims?.sub).toBe(ticket.userId);
    expect(claims?.issuedAt.getTime()).toBe(
      Math.floor(ticket.issuedAt.getTime() / 1000) * 1000,
    );
    expect(claims?.expiresAt.getTime()).toBe(
      Math.floor(ticket.expiresAt.getTime() / 1000) * 1000,
    );
  });

  // R18
  it('clearSession borra con el mismo nombre y path: /', async () => {
    await clearSession();

    expect(deleteMock).toHaveBeenCalledWith({ name: SESSION_COOKIE_NAME, path: '/' });
  });
});
