// QC-9 T13/T13-bis · QC-75 T11 — El portero: traduccion `NextRequest` -> decision ->
// `NextResponse` (R16, R17, R18).
//
// Las peticiones se construyen A MANO con `NextRequest` real: no se levanta Next, no hay servidor
// y no hay red. La cookie se firma con el codec de verdad, asi que lo que se ejercita es la cadena
// completa —firma, version, caducidad y decision— y no un doble que ya diga que si.
//
// **QC-75 retiro la lista ruta→rol.** Con ella se fue el `vi.mock` que la sustituia y todos los
// casos que afirmaban «este rol entra y este otro no»: el middleware ya no lee `roleName` y
// ninguna de sus decisiones depende del rol (R16). En su lugar hay un bloque que afirma lo
// contrario —una ruta privada con sesion valida pasa, sea cual sea el rol—, que es lo que se
// pondria rojo si alguien reintrodujera el corte.
//
// Lo que NO cambio y se sigue afirmando aqui: firma, version, caducidad, el esquema del contenido
// firmado (la empresa incluida), el fallo cerrado sin `SESSION_SECRET`, que no se toca la cookie
// y que no se importa nada que consulte la base (R17, R18).

import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { resolve } from 'node:path';

import { NextRequest } from 'next/server';

import { middleware } from '@/lib/modules/identity/adapters/driving/route-guard-middleware';
import {
  SESSION_COOKIE_NAME,
  SESSION_VALUE_VERSION,
  buildSessionValue,
} from '@/lib/modules/identity/adapters/driven/session/session-token';
import { createSessionTicket } from '@/lib/modules/identity/domain/session';

const SECRETO = 'secreto-de-pruebas-de-64-caracteres-para-firmar-la-sesion-qc9-ok';
const USER_ID = '3f2b1c9e-0d4a-4c8b-9e77-2a5f6c1d8b40';
// QC-48 R6: desde `v3` el contenido firmado lleva tambien el UUID de la empresa. Aqui es solo
// material de fixture: el portero de rutas NO decide con el (R12), y por eso todos los casos que
// ya existian siguen firmando la misma.
const COMPANY_ID = '7c1e0f52-8a3d-4b6e-9f21-5d0c4a8e7b13';
// QC-23 R1: desde `v4` el contenido firmado lleva el identificador de ESTA sesion.
const SESSION_ID = '5b6f3d21-9c4e-4a7f-8b03-6d2e1f5a9c44';

// QC-48 R12: la segunda empresa existe solo para comparar decisiones entre dos sesiones que se
// diferencian UNICAMENTE en este valor.
const OTRA_EMPRESA = 'b0d94f7a-6c25-4e18-8a3f-1e7b2c9d0456';
const ORIGEN = 'https://quimicloude.test';
const ADAPTADOR = 'lib/modules/identity/adapters/driving/route-guard-middleware.ts';

let secretoOriginal: string | undefined;

/** Valor de cookie firmado con el codec real, con el rol, la empresa y el instante que se le pidan. */
function cookieFirmada(
  rol = 'Administrador',
  emitidaEn = new Date(),
  empresa = COMPANY_ID,
): Promise<string> {
  return buildSessionValue(createSessionTicket(USER_ID, rol, empresa, SESSION_ID, emitidaEn), SECRETO);
}

/**
 * Valor de cookie de la version VIGENTE firmado sobre un contenido CRUDO, para poder construir
 * payloads que el emisor real ya no sabe producir: uno sin `cid`, o con un `cid` que no tiene
 * forma de UUID. Se firma con `node:crypto` —byte a byte lo mismo que `signSessionValue`, y el
 * test de `session-token.ts` lo ancla—, asi que lo que se ejercita sigue siendo la cadena real:
 * la firma casa y la caducidad esta en el futuro, de modo que lo unico que puede cortar es el
 * ESQUEMA del contenido firmado.
 */
function cookieConPayload(claims: Record<string, unknown>): string {
  const ahora = Math.floor(Date.now() / 1000);
  // QC-23 R1: desde `v4` el contenido firmado lleva el identificador de sesion. Va en la base
  // del payload —y no en cada caso— para que los casos sigan hablando de lo suyo; quien quiera
  // probar un `sid` malo lo pisa por `claims`.
  const payload = { sub: USER_ID, iat: ahora, exp: ahora + 3600, sid: SESSION_ID, ...claims };
  const codificado = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const parteFirmada = `${SESSION_VALUE_VERSION}.${codificado}`;
  const firma = createHmac('sha256', SECRETO).update(parteFirmada).digest('base64url');

  return `${parteFirmada}.${firma}`;
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
  secretoOriginal = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = SECRETO;
});

afterEach(() => {
  if (secretoOriginal === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = secretoOriginal;
  vi.restoreAllMocks();
});

describe('middleware de rutas privadas', () => {
  it('redirige al login con la ruta pedida cuando no hay cookie en una ruta privada (R17)', async () => {
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

  it('no lee el rol del contenido firmado ni nombra ninguna lista ruta→rol (R16)', () => {
    const fuente = readFileSync(resolve(process.cwd(), ADAPTADOR), 'utf8');

    expect(fuente).not.toContain('claims.roleName');
    expect(fuente).not.toContain('route-role-rules');
    expect(fuente).not.toMatch(/\brules\b/);
  });
});

// ---------------------------------------------------------------------------
// QC-75 T11 — una ruta privada con sesion valida pasa, sea cual sea el rol (R16)
// ---------------------------------------------------------------------------
//
// Este bloque sustituye a los que cortaban por rol. La cookie se firma con DOS roles distintos y
// se afirma el MISMO resultado en cada ruta privada real: si alguien volviera a colar un corte
// por rol en el borde, las dos columnas dejarian de coincidir y esto se pondria rojo.
//
// Que pase por aqui no autoriza nada: quien no tenga el permiso de esa pantalla recibe su 404 en
// la pagina (`requirePagePermission`), y el corte sobre los datos lo pone el service.
describe('el rol firmado ya no decide nada en el borde (R16)', () => {
  const RUTAS_PRIVADAS = [
    '/dashboard',
    '/inventario',
    '/inventario/nuevo',
    '/pedidos',
    '/proveedores',
    '/produccion/formulas',
  ] as const;

  it.each(RUTAS_PRIVADAS)('deja pasar %s tanto al Administrador como al Operador', async (ruta) => {
    const comoAdministrador = await middleware(peticion(ruta, await cookieFirmada('Administrador')));
    const comoOperador = await middleware(peticion(ruta, await cookieFirmada('Operador')));

    expect(dejaPasar(comoAdministrador)).toBe(true);
    expect(dejaPasar(comoOperador)).toBe(true);
  });

  it('toma la misma decision con un rol que no existe en el seed', async () => {
    const response = await middleware(peticion('/inventario', await cookieFirmada('Vendedor')));

    expect(dejaPasar(response)).toBe(true);
  });

  // Y lo que si sigue cortando, para que el bloque no diga «todo pasa»: sin sesion, al login.
  it('pero sin sesion esas mismas rutas siguen redirigiendo al login (R17)', async () => {
    for (const ruta of RUTAS_PRIVADAS) {
      const response = await middleware(peticion(ruta));

      expect(response.status).toBe(307);
      expect(destino(response)).toBe(`/login?next=${encodeURIComponent(ruta)}`);
    }
  });
});

// ---------------------------------------------------------------------------
// QC-48 T9 — la empresa firmada, vista desde el portero (R10, R12, R23)
// ---------------------------------------------------------------------------
//
// Lo que este bloque demuestra es que el borde NO gano ni un `if` con QC-48 (`design.md > 7`):
// quien corta es el ESQUEMA del contenido firmado —`parseSessionClaims` devuelve `null`,
// `verifySessionValue` propaga ese `null` y el adaptador lo traduce a `{ kind: 'anonymous' }` con
// el `if` que ya existia desde QC-9—. Por eso estos tests se escriben contra `middleware` y no
// contra el esquema: afirman la CONSECUENCIA visible en la ruta, que es lo que R10 pide.
//
// Y la otra mitad: la empresa entra en la sesion pero NO entra en la decision de ruta (R12). El
// dia que alguien haga depender una redireccion de la empresa firmada, el tercer test de aqui se
// pone rojo.
describe('la empresa firmada y el portero de rutas (QC-48)', () => {
  it('redirige al login con la ruta pedida cuando el contenido firmado no lleva empresa (R10)', async () => {
    // Firma buena, `exp` en el futuro, version vigente y rol correcto: lo unico que falta es
    // `cid`. No hay rama en el middleware que mire eso; el corte lo hace el esquema.
    const sinEmpresa = cookieConPayload({ role: 'Administrador' });

    const response = await middleware(peticion('/dashboard/reportes?desde=ayer', sinEmpresa));

    expect(response.status).toBe(307);
    expect(destino(response)).toBe('/login?next=%2Fdashboard%2Freportes%3Fdesde%3Dayer');
  });

  it('redirige al login cuando la empresa firmada esta mal formada (R10)', async () => {
    // Tres formas de estarlo: texto que no es UUID, cadena vacia y un tipo que no es texto. Las
    // tres acaban en el mismo sitio, y ninguna llega a la base.
    for (const cid of ['acme', '', 42]) {
      const response = await middleware(
        peticion(
          '/dashboard/reportes?desde=ayer',
          cookieConPayload({ role: 'Administrador', cid }),
        ),
      );

      expect(response.status).toBe(307);
      expect(destino(response)).toBe('/login?next=%2Fdashboard%2Freportes%3Fdesde%3Dayer');
    }
  });

  it('toma la MISMA decision para dos sesiones identicas salvo por su empresa (R12)', async () => {
    const privada = '/dashboard/reportes?pagina=2';

    const conSesionA = await middleware(
      peticion(privada, await cookieFirmada('Administrador', new Date(), COMPANY_ID)),
    );
    const conSesionB = await middleware(
      peticion(privada, await cookieFirmada('Administrador', new Date(), OTRA_EMPRESA)),
    );
    // Y el mismo par en el otro camino, el que si redirige, para que la igualdad no se cumpla
    // solo porque «todo pasa».
    const enLoginA = await middleware(
      peticion('/login', await cookieFirmada('Administrador', new Date(), COMPANY_ID)),
    );
    const enLoginB = await middleware(
      peticion('/login', await cookieFirmada('Administrador', new Date(), OTRA_EMPRESA)),
    );

    expect(dejaPasar(conSesionA)).toBe(true);
    expect(dejaPasar(conSesionB)).toBe(dejaPasar(conSesionA));
    expect(enLoginB.status).toBe(enLoginA.status);
    expect(destino(enLoginB)).toBe(destino(enLoginA));
  });

  it('la ausencia de rol en el contenido firmado sigue siendo anonima, no un rol por defecto (R28 de QC-9)', async () => {
    // El rol ya no decide nada en el borde (QC-75 R16), pero el ESQUEMA del contenido firmado no
    // se toco: un payload sin `role` no es una sesion valida, y por eso acaba en el login. Que
    // esto siga rojo el dia que alguien afloje el esquema es justamente el punto.
    const sinRol = await middleware(
      peticion('/dashboard/reportes', cookieConPayload({ cid: COMPANY_ID })),
    );
    const conRol = await middleware(
      peticion('/dashboard/reportes', cookieConPayload({ role: 'Operador', cid: OTRA_EMPRESA })),
    );

    expect(sinRol.status).toBe(307);
    expect(destino(sinRol)).toBe('/login?next=%2Fdashboard%2Freportes');
    expect(dejaPasar(conRol)).toBe(true);
  });
});

// La sesion de quien no tiene empresa se firma con `cid: null` explicito. El borde la reconoce
// como sesion: deja pasar las rutas privadas y saca del login, igual que con empresa.
describe('la sesion sin empresa y el portero de rutas (QC-161)', () => {
  it('QC-161 R31: una cookie firmada por el emisor real con cid null deja pasar una ruta privada', async () => {
    const sinEmpresa = await buildSessionValue(
      createSessionTicket(USER_ID, 'Maestro', null, SESSION_ID, new Date()),
      SECRETO,
    );
    const payload = JSON.parse(
      Buffer.from(sinEmpresa.split('.')[1] ?? '', 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    // La version no sube: es la vigente, y el `cid` va presente y a `null`.
    expect(sinEmpresa.startsWith(`${SESSION_VALUE_VERSION}.`)).toBe(true);
    expect(SESSION_VALUE_VERSION).toBe('v4');
    expect(payload).toHaveProperty('cid', null);

    const privada = await middleware(peticion('/dashboard/reportes?pagina=2', sinEmpresa));
    const login = await middleware(peticion('/login', sinEmpresa));

    expect(dejaPasar(privada)).toBe(true);
    expect(login.status).toBe(307);
    expect(destino(login)).toBe('/dashboard');
  });

  it('QC-161 R32: con cid ausente sigue siendo anonima; solo el null explicito vale', async () => {
    const ausente = await middleware(
      peticion('/dashboard/reportes', cookieConPayload({ role: 'Maestro' })),
    );
    const nulo = await middleware(
      peticion('/dashboard/reportes', cookieConPayload({ role: 'Maestro', cid: null })),
    );

    expect(ausente.status).toBe(307);
    expect(destino(ausente)).toBe('/login?next=%2Fdashboard%2Freportes');
    expect(dejaPasar(nulo)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// QC-78 T22 — el adaptador declara la marca de sesion cortada (R29, R30 b)
// ---------------------------------------------------------------------------
//
// `sessionEndedParam` es OPCIONAL en la entrada del dominio (`design.md > 10.2`), y ese es
// justamente el riesgo: si el adaptador se olvida de pasarla, nada deja de compilar y el bucle de
// redirecciones vuelve en silencio. Este bloque ES la red que compensa esa decision, y por eso el
// primer caso se ejercita por COMPORTAMIENTO —peticion real, cookie firmada de verdad— y no
// mirando el fuente: borrar la linea del adaptador lo pone rojo.
describe('la marca de sesion cortada, vista desde el portero (QC-78)', () => {
  it('sirve /login con la marca aunque la cookie firmada siga siendo valida', async () => {
    // Esta es la peticion que antes rebotaba a `/dashboard`, donde el layout volvia a cortar y a
    // redirigir al login: el bucle. Ahora se sirve el login, con UNA sola redireccion en total.
    const response = await middleware(peticion('/login?sesion=fin', await cookieFirmada()));

    expect(dejaPasar(response)).toBe(true);
    expect(response.headers.get('location')).toBeNull();
  });

  // El contraste que impide que el caso de arriba pase «porque todo pasa»: sin la marca, la misma
  // peticion con la misma cookie sigue redirigiendo (R17).
  it('sin la marca, /login con la misma cookie valida sigue redirigiendo al dashboard', async () => {
    const response = await middleware(peticion('/login', await cookieFirmada()));

    expect(response.status).toBe(307);
    expect(destino(response)).toBe('/dashboard');
  });

  // R30 (b) desde el borde: la marca no deja entrar a nadie. Escrita a mano en una ruta privada
  // sin cookie, la decision es la de siempre.
  it('la marca no deja entrar a un anonimo en una ruta privada', async () => {
    const response = await middleware(peticion('/dashboard?sesion=fin'));

    expect(response.status).toBe(307);
    expect(destino(response)).toBe('/login?next=%2Fdashboard%3Fsesion%3Dfin');
  });

  it('la marca en una ruta privada con cookie valida se decide igual que sin ella: pasa', async () => {
    const conMarca = await middleware(peticion('/dashboard?sesion=fin', await cookieFirmada()));
    const sinMarca = await middleware(peticion('/dashboard', await cookieFirmada()));

    expect(dejaPasar(conMarca)).toBe(dejaPasar(sinMarca));
    expect(dejaPasar(conMarca)).toBe(true);
  });

  // Y que el nombre de la marca salga de la constante compartida y no de un literal suelto: dos
  // textos que mantener sincronizados es como se desincronizan.
  it('el nombre de la marca sale de la constante compartida, no de un literal en el adaptador', () => {
    const fuente = readFileSync(resolve(process.cwd(), ADAPTADOR), 'utf8');

    expect(fuente).toContain('sessionEndedParam: SESSION_ENDED_PARAM');
    expect(fuente).toMatch(/SESSION_ENDED_PARAM,?\s*\n?\s*}\s*from '@\/lib\/shared\/routes'/);
  });
});
