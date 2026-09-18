// El freno se ejercita con `NextRequest` reales y el contador EN MEMORIA de verdad: solo se
// sustituye `rateLimitEdge.check` por un espia que, por defecto, LLAMA al de verdad — asi las
// aserciones de conteo corren contra el adaptador real, y el espia solo hace falta para forzar,
// en un puñado de casos, el veredicto `degraded` que un contador en memoria nunca produce por si
// solo.
//
// Cada caso usa un origen `x-forwarded-for` distinto (rango de documentacion, RFC 5737): el
// contador en memoria vive en un `Map` compartido por todo el archivo, y sin esto un caso
// heredaria el consumo de cuota del anterior.

import { NextRequest } from 'next/server';

import { identityEdge } from '@/lib/composition/edge';
import {
  SESSION_COOKIE_NAME,
  buildSessionValue,
} from '@/lib/modules/identity/adapters/driven/session/session-token';
import { createSessionTicket } from '@/lib/modules/identity/domain/session';
import { RATE_LIMITED_MESSAGE } from '@/lib/modules/rate-limit';

const { checkMock } = vi.hoisted(() => ({ checkMock: vi.fn() }));

vi.mock('@/lib/composition/edge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/composition/edge')>();
  checkMock.mockImplementation((input: Parameters<typeof actual.rateLimitEdge.check>[0]) =>
    actual.rateLimitEdge.check(input),
  );
  return { ...actual, rateLimitEdge: { ...actual.rateLimitEdge, check: checkMock } };
});

const { middleware } = await import('@/lib/modules/identity/adapters/driving/route-guard-middleware');

const SECRETO = 'secreto-de-pruebas-de-64-caracteres-para-firmar-la-sesion-qc9-ok';
const USER_ID = '3f2b1c9e-0d4a-4c8b-9e77-2a5f6c1d8b40';
const COMPANY_ID = '7c1e0f52-8a3d-4b6e-9f21-5d0c4a8e7b13';
const SESSION_ID = '5b6f3d21-9c4e-4a7f-8b03-6d2e1f5a9c44';
const ORIGEN = 'https://quimicloude.test';

let secretoOriginal: string | undefined;
let contadorOrigenes = 0;

/** Un origen `x-forwarded-for` nuevo por llamada, para que ningun caso comparta cuota con otro. */
function origenNuevo(): string {
  contadorOrigenes += 1;
  return `198.51.100.${contadorOrigenes}`;
}

function cookieFirmada(): Promise<string> {
  return buildSessionValue(
    createSessionTicket(USER_ID, 'Administrador', COMPANY_ID, SESSION_ID, new Date()),
    SECRETO,
  );
}

interface PeticionOpciones {
  readonly forwardedFor?: string;
  readonly cookie?: string;
  readonly method?: string;
  readonly headers?: Record<string, string>;
}

function peticion(url: string, opciones: PeticionOpciones = {}): NextRequest {
  const headers = new Headers(opciones.headers);
  if (opciones.forwardedFor !== undefined) headers.set('x-forwarded-for', opciones.forwardedFor);
  if (opciones.cookie !== undefined) headers.set('cookie', `${SESSION_COOKIE_NAME}=${opciones.cookie}`);
  return new NextRequest(new URL(url, ORIGEN), { headers, method: opciones.method });
}

/** Cabeceras con las que Next transporta la peticion reescrita hacia el servidor (ver route-guard-request-id.test.ts). */
function llevaCabeceraReescrita(response: Response, nombre: string): boolean {
  const lista = (response.headers.get('x-middleware-override-headers') ?? '')
    .split(',')
    .map((n) => n.trim().toLowerCase());
  return lista.includes(nombre.toLowerCase());
}

beforeEach(() => {
  secretoOriginal = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = SECRETO;
  checkMock.mockClear();
});

afterEach(() => {
  if (secretoOriginal === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = secretoOriginal;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('el freno cuenta cada forma de peticion contra el origen (R1, R2, R3)', () => {
  it('una navegacion y una Server Action al mismo origen comparten la cuota GENERAL', async () => {
    vi.stubEnv('RATE_LIMIT_GENERAL_MAX', '2');
    const origen = origenNuevo();

    const navegacion = await middleware(peticion('/dashboard', { forwardedFor: origen }));
    const serverAction = await middleware(
      peticion('/dashboard', {
        forwardedFor: origen,
        method: 'POST',
        headers: { 'next-action': 'accion-1' },
      }),
    );
    const tercera = await middleware(peticion('/dashboard', { forwardedFor: origen }));

    expect(navegacion.status).not.toBe(429);
    expect(serverAction.status).not.toBe(429);
    expect(tercera.status).toBe(429);
  });

  it('el login cuenta en su PROPIA cuota, separada de la general del mismo origen', async () => {
    vi.stubEnv('RATE_LIMIT_LOGIN_MAX', '1');
    vi.stubEnv('RATE_LIMIT_GENERAL_MAX', '600');
    const origen = origenNuevo();

    // Gasta casi toda la cuota general sin tocar /login.
    await middleware(peticion('/dashboard', { forwardedFor: origen }));
    await middleware(peticion('/', { forwardedFor: origen }));

    const primerLogin = await middleware(peticion('/login', { forwardedFor: origen }));
    const segundoLogin = await middleware(peticion('/login', { forwardedFor: origen }));

    expect(primerLogin.status).not.toBe(429);
    expect(segundoLogin.status).toBe(429);
  });

  it('dos origenes distintos no comparten cuota: agotar la de uno no frena al otro (R4)', async () => {
    vi.stubEnv('RATE_LIMIT_GENERAL_MAX', '1');
    const origenA = origenNuevo();
    const origenB = origenNuevo();

    await middleware(peticion('/dashboard', { forwardedFor: origenA }));
    const segundaDeA = await middleware(peticion('/dashboard', { forwardedFor: origenA }));
    const primeraDeB = await middleware(peticion('/dashboard', { forwardedFor: origenB }));

    expect(segundaDeA.status).toBe(429);
    expect(primeraDeB.status).not.toBe(429);
  });
});

describe('la peticion que agota la cuota se frena antes de tocar la sesion (R8, R9)', () => {
  it('la peticion max+1 da 429, no verifica la cookie y no lleva x-request-id reescrito', async () => {
    vi.stubEnv('RATE_LIMIT_GENERAL_MAX', '1');
    const origen = origenNuevo();
    const cookie = await cookieFirmada();
    const verifySpy = vi.spyOn(identityEdge.sessionTokenVerifier, 'verify');

    const primera = await middleware(peticion('/dashboard', { forwardedFor: origen, cookie }));
    expect(primera.status).not.toBe(429);
    expect(verifySpy).toHaveBeenCalledTimes(1);

    const segunda = await middleware(peticion('/dashboard', { forwardedFor: origen, cookie }));

    expect(segunda.status).toBe(429);
    // Sigue en 1: la peticion frenada no llega a `readSession`.
    expect(verifySpy).toHaveBeenCalledTimes(1);
    expect(llevaCabeceraReescrita(segunda, 'x-request-id')).toBe(false);
    expect(segunda.headers.get('x-middleware-next')).toBeNull();
  });
});

describe('las dos formas de la respuesta de freno (R10, R11)', () => {
  it('una navegacion frenada es una pantalla HTML con el mensaje neutro', async () => {
    vi.stubEnv('RATE_LIMIT_GENERAL_MAX', '1');
    const origen = origenNuevo();
    await middleware(peticion('/dashboard', { forwardedFor: origen }));

    const response = await middleware(peticion('/dashboard', { forwardedFor: origen }));
    const cuerpo = await response.text();

    expect(response.status).toBe(429);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(cuerpo).toContain(RATE_LIMITED_MESSAGE);
  });

  it('una Server Action frenada lleva content-type EXACTAMENTE text/plain y el cuerpo exacto', async () => {
    vi.stubEnv('RATE_LIMIT_GENERAL_MAX', '1');
    const origen = origenNuevo();
    const opciones: PeticionOpciones = {
      forwardedFor: origen,
      method: 'POST',
      headers: { 'next-action': 'accion-2' },
    };
    await middleware(peticion('/dashboard', opciones));

    const response = await middleware(peticion('/dashboard', opciones));
    const cuerpo = await response.text();

    expect(response.status).toBe(429);
    // Igualdad estricta: `text/plain;charset=UTF-8` (lo que pondria un `Response` por defecto)
    // NO vale, porque el cliente de Next solo reconoce el canal con esta cabecera exacta.
    expect(response.headers.get('content-type')).toBe('text/plain');
    expect(cuerpo).toBe(RATE_LIMITED_MESSAGE);
  });
});

describe('la respuesta de freno no revela cuanto falta y es igual para cualquier sesion o ruta (R13, R14, R16)', () => {
  async function respuestaFrenada(url: string, opciones: PeticionOpciones = {}): Promise<Response> {
    const origen = origenNuevo();
    await middleware(peticion(url, { ...opciones, forwardedFor: origen }));
    return middleware(peticion(url, { ...opciones, forwardedFor: origen }));
  }

  it('sin retry-after ni cabeceras x-ratelimit-*, y con cache-control: no-store', async () => {
    vi.stubEnv('RATE_LIMIT_GENERAL_MAX', '1');
    const response = await respuestaFrenada('/dashboard');

    expect(response.headers.get('retry-after')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('no-store');
    for (const [nombre] of response.headers.entries()) {
      expect(nombre.toLowerCase().startsWith('x-ratelimit')).toBe(false);
    }
  });

  it('la respuesta es identica en una ruta privada y en una publica, con y sin cookie valida', async () => {
    vi.stubEnv('RATE_LIMIT_GENERAL_MAX', '1');
    const cookie = await cookieFirmada();

    const privadaSinSesion = await respuestaFrenada('/dashboard');
    const privadaConSesion = await respuestaFrenada('/dashboard', { cookie });
    const publicaSinSesion = await respuestaFrenada('/');
    const publicaConSesion = await respuestaFrenada('/', { cookie });

    const forma = async (response: Response) => ({
      status: response.status,
      contentType: response.headers.get('content-type'),
      cacheControl: response.headers.get('cache-control'),
      cuerpo: await response.text(),
    });

    const formas = await Promise.all(
      [privadaSinSesion, privadaConSesion, publicaSinSesion, publicaConSesion].map(forma),
    );

    expect(formas[1]).toEqual(formas[0]);
    expect(formas[2]).toEqual(formas[0]);
    expect(formas[3]).toEqual(formas[0]);
  });
});

describe('cuando el contador esta degradado, la peticion sigue el camino de hoy (R21-R24)', () => {
  it('un timeout deja pasar la peticion, con la sesion verificada y su x-request-id', async () => {
    checkMock.mockResolvedValueOnce({ outcome: 'degraded', reason: 'timeout' });
    const avisos = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const cookie = await cookieFirmada();

    const response = await middleware(peticion('/dashboard', { forwardedFor: origenNuevo(), cookie }));

    expect(response.status).not.toBe(429);
    expect(llevaCabeceraReescrita(response, 'x-request-id')).toBe(true);
    const linea = avisos.mock.calls.map((llamada) => String(llamada[0])).find((m) => m.includes('[rate-limit]'));
    expect(linea).toBe('[rate-limit] contador no disponible, se deja pasar (cuota=general, motivo=timeout)');
  });

  it('un contador que falla tambien deja pasar, sin la IP en el aviso ni un mensaje de error', async () => {
    checkMock.mockResolvedValueOnce({ outcome: 'degraded', reason: 'error:TypeError' });
    const avisos = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const origen = origenNuevo();

    const response = await middleware(peticion('/dashboard', { forwardedFor: origen }));

    expect(response.status).not.toBe(429);
    const linea = avisos.mock.calls.map((llamada) => String(llamada[0])).find((m) => m.includes('[rate-limit]'));
    expect(linea).toBe('[rate-limit] contador no disponible, se deja pasar (cuota=general, motivo=error:TypeError)');
    expect(linea).not.toContain(origen);
  });

  it('degradado en /login redirige igual que sin limite: la marca es su cuota, no una ausencia de freno', async () => {
    checkMock.mockResolvedValueOnce({ outcome: 'degraded', reason: 'timeout' });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const cookie = await cookieFirmada();

    const response = await middleware(peticion('/login', { forwardedFor: origenNuevo(), cookie }));

    // Con sesion valida, /login redirige al dashboard: el camino de siempre sigue intacto.
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/dashboard');
  });
});
