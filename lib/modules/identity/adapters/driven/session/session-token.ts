// QC-9 T4 — El CODEC del valor de la cookie de sesion (`design.md > 3.1`-`3.4`).
//
// QC-48 T3 — el contenido firmado gana la EMPRESA (`cid`) y la version sube a `v3`
// (QC-48 `design.md > 2`). Sin compatibilidad hacia atras: un valor `v2` se rechaza sin
// verificar su firma y sin interpretarlo, exactamente como este archivo ya rechazaba `v1`.
//
// Este archivo es el UNICO dueño del algoritmo de firma en todo el repositorio (R14), y lo
// implementa con **WebCrypto** (`crypto.subtle`), que existe tanto en Node como en el runtime del
// borde. No importa `node:crypto` ni `next/*` a proposito: `middleware.ts` corre en el borde y
// cualquiera de esas dos dependencias lo dejaria sin cargar (R15).
//
// Lo que vive aqui es el FORMATO (troceado, version, base64url y HMAC). El transporte —leer y
// escribir la cookie con `cookies()` de `next/headers`— se quedo en `session-cookie.ts`, que
// delega en estas funciones y conserva sus tres firmas publicas intactas.
//
// Por que la salida es identica byte a byte a la de `createHmac('sha256', s).digest('base64url')`
// (R16, y `design.md > 3.2`): mismo algoritmo (HMAC-SHA-256), misma clave (los bytes UTF-8 del
// secreto), mismo mensaje (los bytes UTF-8 de la parte firmada) y misma codificacion de salida
// (base64url SIN relleno). `tests/unit/identity/session-token.test.ts` lo afirma con `toBe` contra
// `node:crypto`, y `tests/unit/identity/session-cookie.test.ts` lo ancla de extremo a extremo.

import type { SessionTicket } from '../../../domain/session';
import { parseSessionClaims, type SessionClaims } from '../../../domain/session-claims';

/**
 * Nombre de la cookie (QC-7 `design.md > 5.2`). Lleva el prefijo del producto y no dice
 * "auth" ni "token": no hace falta anunciar que ahi viaja la sesion.
 *
 * Vive aqui, con el resto del formato, y no en `session-cookie.ts`: quien lee la cookie en el
 * borde (`lib/composition/edge.ts`) necesita el nombre y no puede cargar `next/headers`.
 */
export const SESSION_COOKIE_NAME = 'qc_session';

/**
 * Version del formato del valor. Se rechaza sin interpretar lo que no empiece por aqui, sin
 * adivinar. Un solo dueño de esta constante: el escritor (`buildSessionValue`) y el lector
 * (`verifySessionValue`) no pueden desincronizarse.
 *
 * QC-9 (R27) — subio a `v2` porque el contenido firmado gano el ROL (R26). **No hay
 * compatibilidad hacia atras**: un valor `v1` se rechaza sin verificar su firma y sin
 * interpretarlo, ni aunque su firma y su `exp` fueran correctos. Se acepto a proposito (no hay
 * sesiones vivas que preservar); mantener dos formatos serian dos caminos de verificacion vivos,
 * uno de ellos sin rol, para siempre.
 *
 * QC-48 (R7, R8) — sube a `v3` porque el contenido firmado gana la EMPRESA (R6), y **tampoco
 * hay compatibilidad**: un valor `v2` se rechaza igual que un `v1`, aunque su firma sea correcta
 * y no haya caducado. No se añade ninguna rama de lectura de `v2`. **Consecuencia aceptada por
 * escrito (decision cerrada 7): al desplegar esto, todas las sesiones vivas caen** y quien este
 * dentro aparece en el login en su siguiente navegacion. La alternativa —una empresa opcional en
 * el contenido firmado— obligaria a decidir que hacer con una sesion sin empresa en cada punto
 * de uso, que es justo la puerta trasera que QC-48 venia a cerrar.
 *
 * QC-23 (R3, R4) — sube a `v4` porque el contenido firmado gana el IDENTIFICADOR DE SESION
 * (`sid`, R1), que es lo que permite cerrar un dispositivo y solo ese. **Tampoco hay
 * compatibilidad**: un valor `v3` se rechaza igual que un `v1` o un `v2`, aunque su firma sea
 * correcta y no haya caducado, y **no se añade ninguna rama de lectura de `v3`**. Consecuencia
 * aceptada por escrito (decision cerrada del 2026-09-03, «el identificador de sesion si sube la
 * version y las sesiones vivas se rompen»): al desplegar esto, quien tuviera sesion abierta
 * aparece en el login en su siguiente navegacion, por el camino de salida que ya existe — sin
 * mensaje, sin pantalla propia y sin borrar ninguna cookie (R4). La alternativa —un `sid`
 * opcional— obligaria a decidir que hacer con una sesion sin identificador en cada punto de uso,
 * y «sin identificador» solo puede significar «no revocable»: la puerta trasera de la ficha.
 *
 * **La firma no cambia** (R5): `signSessionValue` sigue siendo la unica implementacion del HMAC
 * en todo el repositorio. `sid` es contenido, no criptografia.
 */
export const SESSION_VALUE_VERSION = 'v4';

/** Longitud minima del secreto (QC-7 `design.md > 5.3`). Por debajo, el HMAC no vale nada. */
const MIN_SECRET_LENGTH = 32;

/**
 * Contenido firmado, formato `v4`: `{ sub, iat, exp, role, cid, sid }`. `role` es el NOMBRE del rol
 * (`'Administrador'`, `'Operador'`), el mismo texto que `roles.name`: firmar el `role_id`
 * obligaria al borde a traducir un identificador de base sin tener base.
 *
 * QC-48 (R6) — `cid` es el UUID de la empresa y NADA MAS de ella: ni su nombre, ni su nombre
 * normalizado, ni sus marcas de tiempo, ni su estado de baja. El nombre puede cambiar y una foto
 * vieja mentiria durante las 8 h que dura la sesion (decision cerrada 6); quien necesite
 * mostrarlo lo lee de la base, igual que ya se hace con el rol. Se abrevia `cid` como `sub`,
 * `iat` y `exp`, y `parseSessionClaims` lo traduce a `companyId`.
 *
 * Sigue sin viajar nada mas —ni nombre, ni correo, ni documento— porque este valor va en cada
 * peticion.
 */
type SessionPayload = {
  readonly sub: string;
  readonly iat: number;
  readonly exp: number;
  readonly role: string;
  readonly cid: string;
  /**
   * QC-23 (R1) — el UUID de ESTA sesion, y nada mas: no se deriva de `sub` ni de `iat`, porque
   * dos sesiones de la misma persona emitidas en el mismo segundo tienen que distinguirse (R2).
   * Se abrevia `sid` como `sub`, `iat`, `exp` y `cid` —este valor viaja en cada peticion—, y
   * `parseSessionClaims` lo traduce a `sessionId`.
   */
  readonly sid: string;
};

/**
 * Bytes -> base64url **sin relleno**, con `btoa` (global de plataforma, no `Buffer`: `Buffer` no
 * es API del borde y depender de que Next lo polirellene seria una suposicion, no un hecho).
 */
function bytesToBase64Url(bytes: Uint8Array): string {
  let binario = '';
  for (const byte of bytes) binario += String.fromCharCode(byte);

  return btoa(binario).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

/** base64url (con o sin relleno) -> bytes. Lanza si la entrada no es base64 valida. */
function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const relleno = '='.repeat((4 - (base64.length % 4)) % 4);
  const binario = atob(base64 + relleno);
  const bytes = new Uint8Array(binario.length);
  for (let indice = 0; indice < binario.length; indice += 1) bytes[indice] = binario.charCodeAt(indice);

  return bytes;
}

/** Texto -> base64url sobre sus bytes UTF-8. Es como se codifica el payload. */
function encodeBase64UrlText(text: string): string {
  return bytesToBase64Url(new TextEncoder().encode(text));
}

/**
 * base64url -> texto UTF-8, o `null` si la entrada no es base64url decodificable. Devolver `null`
 * y no lanzar es deliberado: un payload corrupto es entrada invalida, no un fallo del sistema.
 */
function decodeBase64UrlText(value: string): string | null {
  try {
    return new TextDecoder().decode(base64UrlToBytes(value));
  } catch {
    return null;
  }
}

/**
 * HMAC-SHA-256 en base64url sin relleno, con WebCrypto.
 *
 * Se exporta a proposito: emisor y verificador recomputan la firma con ESTA funcion. Si cada lado
 * la escribiera por su cuenta, un cambio de formato dejaria de romperse en un sitio y empezaria a
 * fallar en silencio en el otro (R14, y `guard-firma-sesion-unica` lo hace cumplir).
 *
 * Es asincrona porque `crypto.subtle.sign` lo es; sus dos llamadores ya viven dentro de funciones
 * `async`, asi que el cambio no sube a la superficie del modulo.
 */
export async function signSessionValue(signedPart: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPart)),
  );

  // 32 bytes -> 43 caracteres, sin '=': exactamente lo que produce digest('base64url').
  return bytesToBase64Url(mac);
}

/**
 * Compara dos cadenas en TIEMPO CONSTANTE (R17): primero la longitud y despues el XOR acumulado de
 * todos los bytes, **sin cortar en la primera diferencia**.
 *
 * Sustituye a `timingSafeEqual`, que es de `node:crypto` y no sobrevive al borde; WebCrypto no
 * ofrece equivalente. Son ocho lineas escritas a mano y `design.md > 3.4` explica por que no se
 * mete una dependencia por ellas: la unica implementacion del stack no existe en el runtime donde
 * hay que comparar.
 */
export function equalsInConstantTime(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let diferencia = 0;
  for (let indice = 0; indice < a.length; indice += 1) {
    diferencia |= a.charCodeAt(indice) ^ b.charCodeAt(indice);
  }

  return diferencia === 0;
}

/**
 * Lee el secreto **en la llamada** y no al cargar el modulo: en el import romperia el build de
 * Vercel (donde no hay entorno de ejecucion) y haria intestable el fallo cerrado.
 * Falla cerrado: sin secreto valido no se emite cookie y nadie queda autenticado.
 * El mensaje describe el problema sin incluir el valor (QC-7 R15).
 */
export function readSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;

  if (typeof secret !== 'string' || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `SESSION_SECRET ausente o mas corto de ${MIN_SECRET_LENGTH} caracteres: no se emite sesion.`,
    );
  }

  return secret;
}

/** Instantes en segundos epoch: es lo que se firma y lo que se comparara con el reloj. */
function toEpochSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

/**
 * ¿El valor crudo trae la version vigente del formato?
 *
 * Se exporta para que quien tenga que cortar ANTES de leer el secreto —`readSessionClaims`, que
 * lanza si `SESSION_SECRET` falta— pueda hacerlo sin duplicar el troceado ni la constante. El
 * conocimiento del formato se queda entero en este archivo.
 */
export function hasCurrentVersion(rawValue: string): boolean {
  return rawValue.split('.')[0] === SESSION_VALUE_VERSION;
}

/**
 * Construye `<version>.<payload-base64url>.<hmac-base64url>` (QC-7 `design.md > 5.1`).
 * El payload lleva **solo** `sub`, `iat`, `exp`, `role`, `cid` y `sid`: nada de nombre de
 * usuario, correo ni hash, porque este valor viaja en cada peticion (QC-8 R12, QC-9 R26,
 * QC-48 R6, QC-23 R1).
 */
export async function buildSessionValue(ticket: SessionTicket, secret: string): Promise<string> {
  const payload: SessionPayload = {
    sub: ticket.userId,
    iat: toEpochSeconds(ticket.issuedAt),
    exp: toEpochSeconds(ticket.expiresAt),
    role: ticket.roleName,
    cid: ticket.companyId,
    sid: ticket.sessionId,
  };
  const signedPart = `${SESSION_VALUE_VERSION}.${encodeBase64UrlText(JSON.stringify(payload))}`;

  return `${signedPart}.${await signSessionValue(signedPart, secret)}`;
}

/**
 * Verifica un valor crudo de cookie y devuelve su contenido firmado, o `null`. Orden exacto, sin
 * atajos (QC-8 `design.md > 4.1`):
 * 1. El valor no parte en exactamente tres trozos por `.` -> `null`.
 * 2. El primer trozo no es `SESSION_VALUE_VERSION` -> `null`, **sin verificar la firma y sin
 *    interpretar el resto** (QC-9 R27, QC-48 R8 y QC-23 R3: ahi caen `v1`, `v2` y `v3`, y por eso el corte va
 *    ANTES de tocar el HMAC; verificar la firma de un formato que ya no vale seria trabajo para
 *    nada).
 * 3. Se recomputa la firma con `signSessionValue()` —la misma funcion que la emite— y se compara
 *    en tiempo constante (R17).
 * 4. El payload decodificado se interpreta en el dominio (`parseSessionClaims`), que decide si es
 *    un `SessionClaims` valido.
 *
 * No lanza por entrada invalida en ningun paso. Si lanza es por el secreto, y de eso responde
 * quien se lo pasa.
 */
export async function verifySessionValue(
  rawValue: string,
  secret: string,
): Promise<SessionClaims | null> {
  const parts = rawValue.split('.');
  if (parts.length !== 3) return null;

  const [version, encodedPayload, receivedSignature] = parts;
  if (version !== SESSION_VALUE_VERSION) return null;

  const expectedSignature = await signSessionValue(`${version}.${encodedPayload}`, secret);
  if (!equalsInConstantTime(receivedSignature, expectedSignature)) return null;

  const rawJson = decodeBase64UrlText(encodedPayload);
  if (rawJson === null) return null;

  return parseSessionClaims(rawJson);
}
