// QC-71 T4 — el identificador de peticion, visto desde la respuesta del portero (R4, R5, R6).
//
// Se invoca el handler real con una `NextRequest` real y se afirma sobre el OBJETO DEVUELTO. No
// se levanta Next, no hay servidor y no hay red; la cookie se firma con el codec de verdad, como
// en `route-guard-middleware.test.ts`.
//
// ## El mecanismo que ancla este test, y que es INTERNO DE NEXT
//
// `NextResponse.next({ request: { headers } })` no devuelve las cabeceras reescritas como tales:
// las codifica en la propia respuesta con dos cabeceras internas, verificadas a mano contra
// **next@16.3.0** ejecutando este mismo montaje:
//
//   - `x-middleware-override-headers`: la LISTA de nombres de cabecera, separados por coma, con
//     los que Next va a reconstruir la peticion que llega al servidor.
//   - `x-middleware-request-<nombre>`: el VALOR de cada una. Para el identificador,
//     `x-middleware-request-x-request-id`.
//
// Que sea interno significa que puede cambiar de forma en una actualizacion de Next sin previo
// aviso. Por eso `tests/guards/guard-identificador-de-request.test.ts` lleva un centinela de
// version: si `next` sube, la guardia se pone roja y pide repetir la comprobacion manual
// registrada en `progress/impl_QC-71-identificador-de-request.md` (`design.md > 3`).
//
// Y la otra mitad, que es la que caza el error clasico: `response.headers.get('x-request-id')`
// tiene que ser `null`. Si alguien "arregla" esto poniendo la cabecera en la respuesta, el
// identificador se iria al navegador (R6) y la Server Action seguiria sin verlo.

import { NextRequest } from 'next/server';

import { middleware } from '@/lib/modules/identity/adapters/driving/route-guard-middleware';
import {
  SESSION_COOKIE_NAME,
  buildSessionValue,
} from '@/lib/modules/identity/adapters/driven/session/session-token';
import { createSessionTicket } from '@/lib/modules/identity/domain/session';

const SECRETO = 'secreto-de-pruebas-de-64-caracteres-para-firmar-la-sesion-qc9-ok';
const USER_ID = '3f2b1c9e-0d4a-4c8b-9e77-2a5f6c1d8b40';
const COMPANY_ID = '7c1e0f52-8a3d-4b6e-9f21-5d0c4a8e7b13';
// QC-23 R1: desde `v4` el contenido firmado lleva el identificador de ESTA sesion.
const SESSION_ID = '5b6f3d21-9c4e-4a7f-8b03-6d2e1f5a9c44';

const ORIGEN = 'https://quimicloude.test';

/** Cabeceras internas con las que Next transporta la peticion reescrita (next@16.3.0). */
const OVERRIDE_LIST = 'x-middleware-override-headers';
const OVERRIDE_PREFIX = 'x-middleware-request-';

/** UUID canonico de 36 caracteres, version 4. */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let secretoOriginal: string | undefined;

function cookieFirmada(): Promise<string> {
  return buildSessionValue(
    createSessionTicket(USER_ID, 'Administrador', COMPANY_ID, SESSION_ID, new Date()),
    SECRETO,
  );
}

function peticion(url: string, cookie?: string, extra?: Record<string, string>): NextRequest {
  const headers = new Headers(extra);
  if (cookie !== undefined) headers.set('cookie', `${SESSION_COOKIE_NAME}=${cookie}`);
  return new NextRequest(new URL(url, ORIGEN), { headers });
}

/** El valor que viajara en la cabecera de PETICION reescrita, o `null` si no viaja ninguno. */
function idEnLaPeticionReescrita(response: Response): string | null {
  const nombres = (response.headers.get(OVERRIDE_LIST) ?? '')
    .split(',')
    .map((nombre) => nombre.trim().toLowerCase())
    .filter((nombre) => nombre.length > 0);
  if (!nombres.includes('x-request-id')) return null;
  return response.headers.get(`${OVERRIDE_PREFIX}x-request-id`);
}

beforeEach(() => {
  secretoOriginal = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = SECRETO;
});

afterEach(() => {
  if (secretoOriginal === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = secretoOriginal;
  vi.restoreAllMocks();
});

describe('el identificador de peticion en el camino que deja pasar (R4)', () => {
  it('la peticion sigue hacia el servidor con x-request-id en sus cabeceras reescritas', async () => {
    const response = await middleware(peticion('/dashboard', await cookieFirmada()));

    // La respuesta es un `next()`, no un redirect.
    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
    // Y la peticion que llegara al servidor lleva el identificador.
    expect(idEnLaPeticionReescrita(response)).toMatch(UUID_V4);
  });

  it('no reescribe la peticion vaciandola: la cookie entrante sigue en la lista de override', async () => {
    // Si alguien construyera las cabeceras desde cero en vez de clonar `request.headers`, el
    // servidor perderia la cookie de sesion y todo dejaria de funcionar por debajo del portero.
    const response = await middleware(peticion('/dashboard', await cookieFirmada()));

    const nombres = (response.headers.get(OVERRIDE_LIST) ?? '').split(',').map((n) => n.trim());
    expect(nombres).toContain('cookie');
    expect(nombres).toContain('x-request-id');
  });

  it('cada peticion recibe el suyo: dos invocaciones dan identificadores distintos (R1)', async () => {
    const cookie = await cookieFirmada();

    const primera = await middleware(peticion('/inventario', cookie));
    const segunda = await middleware(peticion('/inventario', cookie));

    expect(idEnLaPeticionReescrita(primera)).not.toBe(idEnLaPeticionReescrita(segunda));
  });

  it('tambien lo pone en una ruta publica que se deja pasar', async () => {
    const response = await middleware(peticion('/login'));

    expect(idEnLaPeticionReescrita(response)).toMatch(UUID_V4);
  });
});

describe('el valor del cliente no se conserva (R5)', () => {
  it('sustituye el x-request-id entrante por uno nuevo', async () => {
    const response = await middleware(
      peticion('/dashboard', await cookieFirmada(), { 'x-request-id': 'valor-del-cliente' }),
    );

    const id = idEnLaPeticionReescrita(response);
    expect(id).not.toBe('valor-del-cliente');
    expect(id).toMatch(UUID_V4);
  });

  it('lo sustituye, no lo acumula: es `set` y no `append`', async () => {
    // Con `append`, el valor reescrito seria `valor-del-cliente, <uuid>` y el traductor acabaria
    // registrando entrada del usuario en la linea de log.
    const response = await middleware(
      peticion('/dashboard', await cookieFirmada(), { 'x-request-id': 'valor-del-cliente' }),
    );

    expect(idEnLaPeticionReescrita(response)).not.toContain('valor-del-cliente');
    expect(idEnLaPeticionReescrita(response)).toHaveLength(36);
    // Y el nombre no aparece dos veces en la lista de override.
    const nombres = (response.headers.get(OVERRIDE_LIST) ?? '').split(',').map((n) => n.trim());
    expect(nombres.filter((nombre) => nombre === 'x-request-id')).toHaveLength(1);
  });
});

describe('el identificador NO vuelve al navegador (R6)', () => {
  it('la respuesta del camino que deja pasar no lleva la cabecera x-request-id', async () => {
    const response = await middleware(peticion('/dashboard', await cookieFirmada()));

    // Este es el test que caza el error clasico: poner el id en `response.headers` lo manda al
    // navegador y la Server Action no lo ve nunca.
    expect(response.headers.get('x-request-id')).toBeNull();
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.cookies.getAll()).toHaveLength(0);
  });

  it('el camino que redirige sigue siendo un redirect y no gana ninguna cabecera con el id', async () => {
    const response = await middleware(peticion('/dashboard?pagina=2'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).not.toBeNull();
    expect(response.headers.get('x-request-id')).toBeNull();
    // Y tampoco reescribe la peticion: cuando el portero redirige no corre nada despues en el
    // servidor, asi que no hay quien lea ese identificador (`design.md > 2`).
    expect(response.headers.get(OVERRIDE_LIST)).toBeNull();
    expect(response.headers.get(`${OVERRIDE_PREFIX}x-request-id`)).toBeNull();
  });

  it('el redirect del login con sesion viva tampoco lo lleva', async () => {
    const response = await middleware(peticion('/login', await cookieFirmada()));

    expect(response.status).toBe(307);
    expect(response.headers.get('x-request-id')).toBeNull();
    expect(response.headers.get(`${OVERRIDE_PREFIX}x-request-id`)).toBeNull();
  });
});
