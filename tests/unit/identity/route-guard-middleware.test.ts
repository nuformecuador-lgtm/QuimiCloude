// QC-9 T13/T13-bis — El portero: traduccion `NextRequest` -> decision -> `NextResponse`
// (R2, R3, R4, R5, R7, R10, R11, R12, R13, R18, R26, R27, R30).
//
// Las peticiones se construyen A MANO con `NextRequest` real: no se levanta Next, no hay servidor
// y no hay red. La cookie se firma con el codec de verdad, asi que lo que se ejercita es la cadena
// completa —firma, version, caducidad y decision— y no un doble que ya diga que si.
//
// Lo unico que se sustituye es `ROUTE_ROLE_RULES`: las reglas ruta→rol se ejercitan aqui con
// reglas SINTETICAS, igual que en `route-access.test.ts`, para que lo que se afirme sea la
// TRADUCCION que hace el adaptador y no el contenido de la lista real. La lista real —que desde
// QC-22 tiene su primera fila— se afirma en `route-role-rules.test.ts` y en `route-access.test.ts`.
//
// QC-22 (2026-09-03) movio esa lista dos veces: de `domain/route-role-rules.ts` a
// `adapters/driving/`, y de ahi a `lib/composition/route-role-rules.ts`, donde vive hoy. Nombrar
// la ruta exige `lib/shared/routes` —vetado al dominio— y nombrar el rol exige el barrel de
// `inventario` **como valor** —reservado a `lib/composition`—. El doble se pone sobre ESE modulo,
// no sobre el barrel de `identity`, que nunca exporto la lista.
//
// **El doble aplica de verdad**, y se comprueba sin fe: las reglas sinteticas de abajo usan el
// prefijo `/dashboard/productos`, que la lista REAL no cubre (su unica fila es `/inventario`). Si
// `vi.mock` dejase de interceptar —por un especificador que ya no resuelve, por ejemplo—,
// `middleware` veria la lista real, `/dashboard/productos` no casaria con ninguna regla, el
// Operador pasaria y los dos casos de rol insuficiente se pondrian rojos. Comprobado el
// 2026-09-03 apuntando el `vi.mock` a una ruta inexistente: caen esos dos y solo esos dos.

import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { resolve } from 'node:path';

import { NextRequest } from 'next/server';

import { middleware } from '@/lib/modules/identity/adapters/driving/route-guard-middleware';
import {
  SESSION_COOKIE_NAME,
  buildSessionValue,
} from '@/lib/modules/identity/adapters/driven/session/session-token';
import { createSessionTicket } from '@/lib/modules/identity/domain/session';
import type { RouteRoleRule } from '@/lib/modules/identity/domain/route-role-rules';

// Caja mutable: `middleware` lee `ROUTE_ROLE_RULES` en cada llamada, asi que un getter permite
// cambiar las reglas por test sin volver a importar el modulo.
const { reglas } = vi.hoisted(() => ({ reglas: { actuales: [] as RouteRoleRule[] } }));

vi.mock('@/lib/composition/route-role-rules', () => ({
  get ROUTE_ROLE_RULES() {
    return reglas.actuales;
  },
}));

const SECRETO = 'secreto-de-pruebas-de-64-caracteres-para-firmar-la-sesion-qc9-ok';
const USER_ID = '3f2b1c9e-0d4a-4c8b-9e77-2a5f6c1d8b40';
const ORIGEN = 'https://quimicloude.test';
const ADAPTADOR = 'lib/modules/identity/adapters/driving/route-guard-middleware.ts';

let secretoOriginal: string | undefined;

/** Valor de cookie firmado con el codec real, con el rol y el instante que se le pidan. */
function cookieFirmada(rol = 'Administrador', emitidaEn = new Date()): Promise<string> {
  return buildSessionValue(createSessionTicket(USER_ID, rol, emitidaEn), SECRETO);
}

function peticion(url: string, cookie?: string): NextRequest {
  const headers = new Headers();
  if (cookie !== undefined) headers.set('cookie', `${SESSION_COOKIE_NAME}=${cookie}`);
  return new NextRequest(new URL(url, ORIGEN), { headers });
}

/** El destino de una redireccion, como ruta relativa al origen. */
function destino(response: Response): string {
  const location = response.headers.get('location');
  expect(location).not.toBeNull();
  const url = new URL(location as string, ORIGEN);
  return `${url.pathname}${url.search}`;
}

/** `true` si la respuesta deja pasar la peticion (`NextResponse.next()`). */
function dejaPasar(response: Response): boolean {
  return response.headers.get('location') === null && response.status < 300;
}

beforeEach(() => {
  reglas.actuales = [];
  secretoOriginal = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = SECRETO;
});

afterEach(() => {
  if (secretoOriginal === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = secretoOriginal;
  vi.restoreAllMocks();
});

describe('middleware de rutas privadas', () => {
  it('redirige al login con la ruta pedida cuando no hay cookie en una ruta privada (R2, R7)', async () => {
    const response = await middleware(peticion('/dashboard/reportes?desde=ayer'));

    expect(response.status).toBe(307);
    expect(destino(response)).toBe('/login?next=%2Fdashboard%2Freportes%3Fdesde%3Dayer');
  });

  it('deja pasar una ruta privada con cookie firmada valida', async () => {
    const response = await middleware(peticion('/dashboard', await cookieFirmada()));

    expect(dejaPasar(response)).toBe(true);
  });

  it('trata como sin sesion una cookie caducada y redirige al login (R3)', async () => {
    // Emitida hace 9 h: la sesion dura 8 h absolutas, asi que su `exp` firmado ya paso.
    const haceNueveHoras = new Date(Date.now() - 9 * 60 * 60 * 1000);
    const response = await middleware(
      peticion('/dashboard', await cookieFirmada('Administrador', haceNueveHoras)),
    );

    expect(response.status).toBe(307);
    expect(destino(response)).toBe('/login?next=%2Fdashboard');
  });

  it('trata como sin sesion una cookie con la firma manipulada y redirige al login (R3)', async () => {
    const valida = await cookieFirmada();
    const [version, payload, firma] = valida.split('.');
    // Se cambia UN caracter de la firma, conservando su longitud: si la comparacion en tiempo
    // constante mirase solo el largo, este test seria el que lo cazaria.
    const manipulada = `${version}.${payload}.${firma?.startsWith('A') ? 'B' : 'A'}${firma?.slice(1)}`;

    const response = await middleware(peticion('/dashboard', manipulada));

    expect(response.status).toBe(307);
    expect(destino(response)).toBe('/login?next=%2Fdashboard');
  });

  it('rechaza un token v1 aunque su firma sea correcta y su exp este en el futuro (R27)', async () => {
    // Construido enteramente con `node:crypto`, como lo habria emitido QC-8 antes de la
    // migracion: firma buena, caducidad buena, version vieja. No vale, y no hay rama de
    // compatibilidad que lo salve.
    const payload = Buffer.from(
      JSON.stringify({
        sub: USER_ID,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
      'utf8',
    ).toString('base64url');
    const parteFirmada = `v1.${payload}`;
    const firma = createHmac('sha256', SECRETO).update(parteFirmada).digest('base64url');

    const response = await middleware(peticion('/dashboard', `${parteFirmada}.${firma}`));

    expect(response.status).toBe(307);
    expect(destino(response)).toBe('/login?next=%2Fdashboard');
  });

  it('redirige al dashboard quien pide el login con sesion valida (R10)', async () => {
    const response = await middleware(peticion('/login', await cookieFirmada()));

    expect(response.status).toBe(307);
    expect(destino(response)).toBe('/dashboard');
  });

  it('sirve el login sin redireccion cuando no hay sesion (R11)', async () => {
    const response = await middleware(peticion('/login'));

    expect(dejaPasar(response)).toBe(true);
  });

  it('falla cerrado cuando falta SESSION_SECRET: redirige al login, no lanza y no filtra el secreto (R18)', async () => {
    const cookie = await cookieFirmada();
    delete process.env.SESSION_SECRET;
    const avisos = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const response = await middleware(peticion('/dashboard', cookie));

    expect(response.status).toBe(307);
    expect(destino(response)).toBe('/login?next=%2Fdashboard');
    // El `catch` no es vacio: registra por que se degrada a anonimo. Y lo que registra no
    // incluye el valor del secreto ni el de la cookie.
    expect(avisos).toHaveBeenCalledTimes(1);
    const registrado = String(avisos.mock.calls[0]?.[0]);
    expect(registrado).not.toContain(SECRETO);
    expect(registrado).not.toContain(cookie);
    expect(registrado).toContain('SESSION_SECRET');
  });

  it('no emite, reemite ni borra la cookie de sesion en ningun caso (R5)', async () => {
    const conSesion = peticion('/dashboard', await cookieFirmada());
    const sinSesion = peticion('/dashboard');
    const escrituras = [
      vi.spyOn(conSesion.cookies, 'set'),
      vi.spyOn(conSesion.cookies, 'delete'),
      vi.spyOn(sinSesion.cookies, 'set'),
      vi.spyOn(sinSesion.cookies, 'delete'),
    ];

    const respuestas = [await middleware(conSesion), await middleware(sinSesion)];

    for (const espia of escrituras) expect(espia).not.toHaveBeenCalled();
    for (const response of respuestas) {
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(response.cookies.getAll()).toHaveLength(0);
    }
    // Y en el codigo tampoco: un `set` sobre la respuesta no dejaria rastro en los espias de
    // arriba, asi que se afirma ademas sobre el archivo.
    const fuente = readFileSync(resolve(process.cwd(), ADAPTADOR), 'utf8');
    expect(fuente).not.toMatch(/cookies\s*\.\s*(set|delete)\s*\(/);
  });

  it('no importa la composicion Node ni ningun repositorio: el borde no consulta la base (R4)', () => {
    const fuente = readFileSync(resolve(process.cwd(), ADAPTADOR), 'utf8');

    expect(fuente).toContain("from '@/lib/composition/edge'");
    expect(fuente).not.toMatch(/from '@\/lib\/composition'/);
    expect(fuente).not.toContain('adapters/driven/persistence');
    expect(fuente).not.toContain('@prisma/client');
  });

  it('evalua las reglas ruta→rol con el rol FIRMADO en la cookie, sin consultar nada (R12, R13, R26)', async () => {
    reglas.actuales = [{ prefix: '/dashboard/productos', roles: ['Administrador'] }];

    const permitido = await middleware(
      peticion('/dashboard/productos', await cookieFirmada('Administrador')),
    );
    const denegado = await middleware(
      peticion('/dashboard/productos', await cookieFirmada('Operador')),
    );

    expect(dejaPasar(permitido)).toBe(true);
    // «No autorizado» no es «no autenticado»: al dashboard, nunca al login (R13).
    expect(denegado.status).toBe(307);
    expect(destino(denegado)).toBe('/dashboard');
  });
});

// ---------------------------------------------------------------------------
// CARACTERIZACION — el rol firmado envejece. Esto NO es una virtud (R30, D17)
// ---------------------------------------------------------------------------
//
// Lo que este bloque fija es un LIMITE CONOCIDO, no un comportamiento deseable: mientras no
// exista la revocacion de sesiones (QC-23), el rol que viaja en la cookie es una foto del
// instante del login y vale hasta 8 h. Un ascenso no surte efecto en el borde hasta que la
// sesion caduca, y esta ficha no lo simula: reemitir la cookie al leerla violaria R5.
//
// **QC-23 pondra este test rojo A PROPOSITO**, igual que QC-8 hizo con su R21. Cuando eso pase,
// no se parchea el test: se borra y se escribe el que afirme la invalidacion inmediata.
//
// El corte real sigue estando en el service (R29): que el borde deje pasar —o corte— no
// autoriza ni desautoriza nada sobre los datos.
describe('limite conocido: el rol firmado no se entera de un cambio de rol (R30)', () => {
  it('corta al Operador ascendido a Administrador hasta que caduque su sesion, porque el borde no consulta la base', async () => {
    reglas.actuales = [{ prefix: '/dashboard/productos', roles: ['Administrador'] }];
    // La base ya dice `Administrador`; la cookie, emitida antes del ascenso, dice `Operador`.
    // El middleware decide con la cookie porque no tiene base a la que preguntar (R4).
    const cookieDeAntesDelAscenso = await cookieFirmada('Operador');

    const response = await middleware(peticion('/dashboard/productos', cookieDeAntesDelAscenso));

    expect(response.status).toBe(307);
    expect(destino(response)).toBe('/dashboard');
  });
});
