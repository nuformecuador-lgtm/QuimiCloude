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
    const ticket = createSessionTicket(USER_ID, AHORA);

    const valor = await buildSessionValue(ticket, SECRETO);
    const claims = await verifySessionValue(valor, SECRETO);

    expect(claims?.sub).toBe(USER_ID);
    expect(claims?.expiresAt.getTime()).toBe(Math.floor(ticket.expiresAt.getTime() / 1000) * 1000);
  });

  it('el valor emitido lleva la firma que produciria node:crypto (R16, de extremo a extremo)', async () => {
    const valor = await buildSessionValue(createSessionTicket(USER_ID, AHORA), SECRETO);

    const [version, payload, firma] = valor.split('.');
    expect(version).toBe(SESSION_VALUE_VERSION);
    expect(firma).toBe(firmaDeReferencia(`${version}.${payload}`, SECRETO));
  });

  it('una firma alterada o de otro secreto resuelve null', async () => {
    const valor = await buildSessionValue(createSessionTicket(USER_ID, AHORA), SECRETO);
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

describe('hasCurrentVersion y readSessionSecret', () => {
  it('reconoce la version vigente y descarta cualquier otra', () => {
    expect(hasCurrentVersion(`${SESSION_VALUE_VERSION}.payload.firma`)).toBe(true);
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
