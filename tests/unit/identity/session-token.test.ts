// QC-9 T5 — El codec del valor de sesion: paridad byte a byte con `node:crypto` y comparacion en
// tiempo constante (R16, R17, y `design.md > 3.2`-`3.4`).
//
// POR QUE ESTE ARCHIVO IMPORTA `node:crypto` SIENDO LO QUE LA MIGRACION QUITA: porque es el
// ORACULO. La afirmacion de R16 no es "la firma WebCrypto valida", que se cumpliria igual con
// cualquier algoritmo consistente consigo mismo; es "la firma WebCrypto es EXACTAMENTE la que
// producia `createHmac('sha256', s).update(m).digest('base64url')`". Eso solo se puede afirmar
// calculando la referencia con la implementacion antigua, aqui, en un test. `tests/` esta exento
// de `guard-firma-sesion-unica` justo para esto.
//
// Si algun dia esta paridad deja de importar (por ejemplo, porque se cambie el algoritmo a
// proposito), este archivo se reescribe con la decision escrita, no se borra en silencio.

import { createHmac } from 'node:crypto';

import {
  SESSION_COOKIE_NAME,
  SESSION_VALUE_VERSION,
  buildSessionValue,
  equalsInConstantTime,
  hasCurrentVersion,
  readSessionSecret,
  signSessionValue,
  verifySessionValue,
} from '@/lib/modules/identity/adapters/driven/session/session-token';
import { createSessionTicket } from '@/lib/modules/identity/domain/session';

const SECRETO = 'secreto-de-pruebas-de-64-caracteres-para-firmar-la-sesion-qc9-ok';
const USER_ID = '3f2b1c9e-0d4a-4c8b-9e77-2a5f6c1d8b40';
const AHORA = new Date('2026-09-01T08:00:00.000Z');
const ROL = 'Administrador';
// QC-48 R6: desde `v3` el contenido firmado lleva tambien el UUID de la empresa, y nada mas de
// ella. Sale de la ficha del usuario, no de la entrada del login.
const COMPANY_ID = '7c1e0f52-8a3d-4b6e-9f21-5d0c4a8e7b13';

/** La referencia: exactamente lo que hacia `session-cookie.ts` antes de la migracion. */
function firmaDeReferencia(mensaje: string, secreto: string): string {
  return createHmac('sha256', secreto).update(mensaje).digest('base64url');
}

let secretoOriginal: string | undefined;

beforeEach(() => {
  secretoOriginal = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = SECRETO;
});

afterEach(() => {
  if (secretoOriginal === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = secretoOriginal;
  vi.restoreAllMocks();
});

describe('signSessionValue — paridad byte a byte con node:crypto (R16)', () => {
  const secretos = [
    SECRETO,
    'otro-secreto-distinto-de-mas-de-32-caracteres-para-la-prueba',
    // Secreto con caracteres no ASCII: ancla que la CLAVE se toma como bytes UTF-8, igual que
    // hacia `createHmac` con un string.
    'clave-con-enes-y-acentos-ñáéíóú-y-un-emoji-🔑-de-mas-de-32-chars',
  ];

  const mensajes = [
    'v1.eyJzdWIiOiJhYmMifQ',
    '',
    '.',
    'v1.' + 'A'.repeat(500),
    // Mensaje con caracteres no ASCII: ancla la codificacion UTF-8 del MENSAJE. Si el codec
    // usara latin1 o UTF-16, esta fila —y solo esta— se pondria roja.
    'v1.ñáéíóú-Ω-漢字-🔒-mensaje-no-ascii',
  ];

  for (const secreto of secretos) {
    for (const mensaje of mensajes) {
      it(`es igual a createHmac para secreto ${secreto.slice(0, 12)}… y mensaje ${mensaje.slice(0, 16)}…`, async () => {
        const obtenida = await signSessionValue(mensaje, secreto);

        // `toBe`, no "es valida": la afirmacion es de igualdad exacta (R16).
        expect(obtenida).toBe(firmaDeReferencia(mensaje, secreto));
      });
    }
  }

  it('la firma es base64url SIN relleno y de 43 caracteres (32 bytes de SHA-256)', async () => {
    const firma = await signSessionValue('v1.payload', SECRETO);

    expect(firma).toHaveLength(43);
    expect(firma).not.toContain('=');
    expect(firma).not.toContain('+');
    expect(firma).not.toContain('/');
    expect(firma).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('secretos distintos producen firmas distintas sobre el mismo mensaje', async () => {
    const [una, otra] = await Promise.all([
      signSessionValue('v1.payload', SECRETO),
      signSessionValue('v1.payload', `${SECRETO}-x`),
    ]);

    expect(una).not.toBe(otra);
  });
});

describe('equalsInConstantTime (R17)', () => {
  const REFERENCIA = 'aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789_-abcde';

  it('devuelve true para dos cadenas iguales', () => {
    expect(equalsInConstantTime(REFERENCIA, `${REFERENCIA}`)).toBe(true);
    expect(equalsInConstantTime('', '')).toBe(true);
  });

  it('devuelve false si la longitud difiere', () => {
    expect(equalsInConstantTime(REFERENCIA, `${REFERENCIA}x`)).toBe(false);
    expect(equalsInConstantTime(REFERENCIA, REFERENCIA.slice(0, -1))).toBe(false);
    expect(equalsInConstantTime('', 'a')).toBe(false);
  });

  it('devuelve false si difiere el PRIMER byte', () => {
    const alterada = `Z${REFERENCIA.slice(1)}`;

    expect(alterada).toHaveLength(REFERENCIA.length);
    expect(equalsInConstantTime(REFERENCIA, alterada)).toBe(false);
  });

  // El caso que un `===` con salida temprana resolveria en el peor tiempo posible, y el que
  // demuestra que la comparacion recorre TODOS los bytes en vez de cortar en el primero.
  it('devuelve false si difiere el ULTIMO byte', () => {
    const alterada = `${REFERENCIA.slice(0, -1)}Z`;

    expect(alterada).toHaveLength(REFERENCIA.length);
    expect(equalsInConstantTime(REFERENCIA, alterada)).toBe(false);
  });
});

describe('buildSessionValue / verifySessionValue', () => {
  it('lo que se firma se vuelve a leer con los mismos datos', async () => {
    const ticket = createSessionTicket(USER_ID, ROL, COMPANY_ID, AHORA);

    const valor = await buildSessionValue(ticket, SECRETO);
    const claims = await verifySessionValue(valor, SECRETO);

    expect(claims?.sub).toBe(USER_ID);
    expect(claims?.expiresAt.getTime()).toBe(Math.floor(ticket.expiresAt.getTime() / 1000) * 1000);
  });

  it('el valor emitido lleva la firma que produciria node:crypto (R16, de extremo a extremo)', async () => {
    const valor = await buildSessionValue(createSessionTicket(USER_ID, ROL, COMPANY_ID, AHORA), SECRETO);

    const [version, payload, firma] = valor.split('.');
    expect(version).toBe(SESSION_VALUE_VERSION);
    expect(firma).toBe(firmaDeReferencia(`${version}.${payload}`, SECRETO));
  });

  it('una firma alterada o de otro secreto resuelve null', async () => {
    const valor = await buildSessionValue(createSessionTicket(USER_ID, ROL, COMPANY_ID, AHORA), SECRETO);
    const [version, payload, firma] = valor.split('.');
    const alterada = firma.startsWith('A') ? `B${firma.slice(1)}` : `A${firma.slice(1)}`;

    await expect(verifySessionValue(`${version}.${payload}.${alterada}`, SECRETO)).resolves.toBeNull();
    await expect(verifySessionValue(valor, `${SECRETO}-otro`)).resolves.toBeNull();
  });

  it('un valor que no parte en tres trozos resuelve null sin lanzar', async () => {
    await expect(verifySessionValue('', SECRETO)).resolves.toBeNull();
    await expect(verifySessionValue('v1.solo-dos', SECRETO)).resolves.toBeNull();
    await expect(verifySessionValue('v1.a.b.c', SECRETO)).resolves.toBeNull();
  });

  it('un payload que no es base64url decodificable resuelve null sin lanzar', async () => {
    const payloadImposible = '@@@@';
    const signedPart = `${SESSION_VALUE_VERSION}.${payloadImposible}`;
    const valor = `${signedPart}.${firmaDeReferencia(signedPart, SECRETO)}`;

    await expect(verifySessionValue(valor, SECRETO)).resolves.toBeNull();
  });
});

// QC-9 T5-bis — El rechazo de la version anterior (R27).
//
// OJO AL SENTIDO: antes de que el humano derogara D3, aqui se afirmaba lo CONTRARIO —que un token
// emitido con el formato anterior seguia valiendo—. Ya no: `v1` se rechaza a proposito, sin
// compatibilidad hacia atras, aunque su firma y su `exp` sean impecables. Se aceptó porque no hay
// sesiones vivas que preservar, y porque mantener dos formatos serian dos caminos de verificacion
// vivos —uno de ellos sin rol— para siempre. Si este bloque se pone rojo, la pregunta no es "como
// lo hago pasar" sino "quien reabrio la compatibilidad".
describe('rechazo del formato anterior (R27)', () => {
  /** Un `v1` impecable, construido enteramente con `node:crypto` y con `exp` en el futuro. */
  function tokenV1Impecable(): string {
    const ahora = Math.floor(Date.now() / 1000);
    const payload = { sub: USER_ID, iat: ahora, exp: ahora + 8 * 60 * 60 };
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const signedPart = `v1.${encoded}`;

    return `${signedPart}.${firmaDeReferencia(signedPart, SECRETO)}`;
  }

  /**
   * Un `v2` impecable: el formato COMPLETO de QC-9 —con su rol y todo—, firmado con el secreto
   * bueno y con `exp` en el futuro. La unica pega que tiene es su version. QC-48 R8.
   */
  function tokenV2Impecable(): string {
    const ahora = Math.floor(Date.now() / 1000);
    const payload = { sub: USER_ID, iat: ahora, exp: ahora + 8 * 60 * 60, role: ROL };
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const signedPart = `v2.${encoded}`;

    return `${signedPart}.${firmaDeReferencia(signedPart, SECRETO)}`;
  }

  it('un v1 con firma correcta y exp futuro resuelve null', async () => {
    const valor = tokenV1Impecable();

    // Primero: que el token es impecable de verdad. Sin esto, el `null` de abajo podria venir de
    // una firma mal construida por el propio test y no probaria nada.
    const [version, payload, firma] = valor.split('.');
    expect(version).toBe('v1');
    expect(firma).toBe(firmaDeReferencia(`${version}.${payload}`, SECRETO));
    const contenido = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      exp: number;
    };
    expect(contenido.exp * 1000).toBeGreaterThan(Date.now());

    await expect(verifySessionValue(valor, SECRETO)).resolves.toBeNull();
  });

  it('y lo rechaza SIN verificar la firma: no se llama a crypto.subtle.sign', async () => {
    const sign = vi.spyOn(crypto.subtle, 'sign');

    await expect(verifySessionValue(tokenV1Impecable(), SECRETO)).resolves.toBeNull();

    // El corte de version va ANTES del HMAC: verificar la firma de un formato que ya no vale
    // seria trabajo para nada, y ademas es la forma de afirmar el "sin interpretarlo" de R27.
    expect(sign).not.toHaveBeenCalled();
  });

  // QC-48 R8 — el formato ANTERIOR INMEDIATO, que es el que de verdad hay desplegado. Un `v2`
  // con firma correcta y sin caducar se resuelve como "sin sesion": no se verifica, no se
  // interpreta y no se le añade ninguna rama de compatibilidad. Si este test se pone rojo, la
  // pregunta no es "como lo hago pasar" sino "quien reabrio la compatibilidad".
  it('un v2 con firma correcta y exp futuro resuelve null', async () => {
    const valor = tokenV2Impecable();

    // Primero: que el token es impecable de verdad —firma buena y `exp` futuro—. Sin esto, el
    // `null` de abajo podria venir de un token mal construido por el propio test.
    const [version, payload, firma] = valor.split('.');
    expect(version).toBe('v2');
    expect(firma).toBe(firmaDeReferencia(`${version}.${payload}`, SECRETO));
    const contenido = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      exp: number;
      role: string;
    };
    expect(contenido.exp * 1000).toBeGreaterThan(Date.now());
    expect(contenido.role).toBe(ROL);

    await expect(verifySessionValue(valor, SECRETO)).resolves.toBeNull();
  });

  // QC-48 R8 — y lo rechaza SIN verificar la firma: el corte por version va por encima del HMAC.
  it('y rechaza el v2 SIN verificar la firma: no se llama a crypto.subtle.sign', async () => {
    const sign = vi.spyOn(crypto.subtle, 'sign');

    await expect(verifySessionValue(tokenV2Impecable(), SECRETO)).resolves.toBeNull();

    expect(sign).not.toHaveBeenCalled();
  });

  // QC-48 R8 — "sin leer el secreto", visto desde este lado: al codec el secreto se le PASA, asi
  // que se le pasa uno que no firmo nada y con el que ninguna verificacion podria salir bien. El
  // resultado no cambia, porque el secreto no llega a usarse. La otra mitad —que
  // `readSessionClaims` no toca `SESSION_SECRET` del entorno— la afirma `session-cookie.test.ts`.
  it('el v2 se rechaza igual con un secreto que no es el suyo: el secreto no llega a usarse', async () => {
    await expect(verifySessionValue(tokenV2Impecable(), `${SECRETO}-otro`)).resolves.toBeNull();
  });

  it('el formato vigente si llega a verificar la firma (el contraste que da valor al test anterior)', async () => {
    const valor = await buildSessionValue(createSessionTicket(USER_ID, ROL, COMPANY_ID, new Date()), SECRETO);
    const sign = vi.spyOn(crypto.subtle, 'sign');

    await expect(verifySessionValue(valor, SECRETO)).resolves.not.toBeNull();

    expect(sign).toHaveBeenCalledTimes(1);
  });
});

// QC-9 T5-bis — El rol viaja firmado (R26).
describe('el rol dentro del contenido firmado (R26)', () => {
  it('el payload v3 lleva sub/iat/exp/role/cid y el rol se lee de vuelta', async () => {
    const valor = await buildSessionValue(createSessionTicket(USER_ID, ROL, COMPANY_ID, AHORA), SECRETO);

    const payload = JSON.parse(
      Buffer.from(valor.split('.')[1] ?? '', 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    expect(Object.keys(payload)).toEqual(['sub', 'iat', 'exp', 'role', 'cid']);
    expect(payload.role).toBe(ROL);

    const claims = await verifySessionValue(valor, SECRETO);
    expect(claims?.roleName).toBe(ROL);
  });

  it('el rol firmado es el del ticket, sea cual sea', async () => {
    const valor = await buildSessionValue(createSessionTicket(USER_ID, 'Operador', COMPANY_ID, AHORA), SECRETO);

    expect((await verifySessionValue(valor, SECRETO))?.roleName).toBe('Operador');
  });
});

// QC-48 T3 — La empresa viaja firmada (R6).
describe('la empresa dentro del contenido firmado (QC-48 R6)', () => {
  it('el payload v3 lleva el cid del ticket y la ida y vuelta conserva el companyId', async () => {
    const valor = await buildSessionValue(
      createSessionTicket(USER_ID, ROL, COMPANY_ID, AHORA),
      SECRETO,
    );

    const payload = JSON.parse(
      Buffer.from(valor.split('.')[1] ?? '', 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    expect(payload.cid).toBe(COMPANY_ID);

    const claims = await verifySessionValue(valor, SECRETO);
    expect(claims?.companyId).toBe(COMPANY_ID);
  });

  it('la empresa firmada es la del ticket, sea cual sea', async () => {
    const otra = '0a9b8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d';
    const valor = await buildSessionValue(
      createSessionTicket(USER_ID, ROL, otra, AHORA),
      SECRETO,
    );

    expect((await verifySessionValue(valor, SECRETO))?.companyId).toBe(otra);
  });

  // R6 — de la empresa viaja el IDENTIFICADOR y nada mas: ni nombre, ni normalizado, ni marcas
  // de tiempo, ni estado de baja. El nombre puede cambiar y una foto vieja mentiria durante 8 h.
  it('del ticket no se firma nada de la empresa que no sea su identificador', async () => {
    const valor = await buildSessionValue(
      createSessionTicket(USER_ID, ROL, COMPANY_ID, AHORA),
      SECRETO,
    );

    const payload = JSON.parse(
      Buffer.from(valor.split('.')[1] ?? '', 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    expect(Object.keys(payload).filter((clave) => clave !== 'cid')).toEqual([
      'sub',
      'iat',
      'exp',
      'role',
    ]);
  });
});

describe('hasCurrentVersion y readSessionSecret', () => {
  it('reconoce la version vigente y descarta cualquier otra, v1 y v2 incluidas', () => {
    expect(SESSION_VALUE_VERSION).toBe('v3');
    expect(hasCurrentVersion(`${SESSION_VALUE_VERSION}.payload.firma`)).toBe(true);
    expect(hasCurrentVersion('v1.payload.firma')).toBe(false);
    // QC-48 R8: el formato anterior inmediato se descarta como cualquier otro.
    expect(hasCurrentVersion('v2.payload.firma')).toBe(false);
    expect(hasCurrentVersion('v0.payload.firma')).toBe(false);
    expect(hasCurrentVersion('payload')).toBe(false);
    expect(hasCurrentVersion('')).toBe(false);
  });

  it('el nombre de la cookie no anuncia que ahi viaja la sesion', () => {
    expect(SESSION_COOKIE_NAME).toBe('qc_session');
  });

  it('falla cerrado sin secreto o con uno corto, y el mensaje no lo incluye', () => {
    expect(readSessionSecret()).toBe(SECRETO);

    delete process.env.SESSION_SECRET;
    expect(() => readSessionSecret()).toThrow(/SESSION_SECRET/);

    process.env.SESSION_SECRET = 'corto123';
    try {
      readSessionSecret();
      throw new Error('readSessionSecret tenia que lanzar');
    } catch (error) {
      expect((error as Error).message).not.toContain('corto123');
    }
  });
});
