import { cookies } from 'next/headers';

import {
  SESSION_COOKIE_NAME,
  buildSessionValue,
  hasCurrentVersion,
  readSessionSecret,
  verifySessionValue,
} from './session-token';

import { SESSION_DURATION_MS, type SessionTicket } from '../../../domain/session';
import type { SessionClaims } from '../../../domain/session-claims';

// Implementa el puerto `SessionWriter` (`../../../ports/session-writer`):
// `startSession` cumple `startSession`. Tambien implementa `SessionReader`
// (`../../../ports/session-reader`) via `readSessionClaims` y `clearSession`.
// El cableado lo hace el punto de composicion.
//
// QC-9 T4: este archivo es solo TRANSPORTE. El formato y la firma —troceado, version, base64url y
// HMAC— viven enteros en `session-token.ts`, el unico dueño del algoritmo (R14), que se
// implementa con WebCrypto para poder correr tambien en el borde (R15). Aqui se queda lo que
// necesita `next/headers`, que es exactamente lo que el middleware no puede cargar.
// Las tres firmas publicas de este archivo (`startSession`, `readSessionClaims`, `clearSession`)
// no cambiaron con la extraccion: por eso `tests/unit/identity/session-cookie.test.ts` sigue
// verde sin tocar una linea, y es esa la red que hace segura la migracion (`design.md > 3.3`).

/**
 * El nombre de la cookie lo DECLARA el codec (`session-token.ts`), que es quien tiene que poder
 * leerse desde el borde; aqui solo se reexporta. No es una segunda declaracion: es el mismo
 * simbolo. Se conserva la reexportacion porque `tests/unit/identity/session-cookie.test.ts` —el
 * oraculo de la migracion (`design.md > 3.3`)— lo importa de aqui y no se toca ni una linea.
 */
export { SESSION_COOKIE_NAME };

/**
 * Emite la cookie de sesion con los atributos de QC-7 `design.md > 5.2`.
 *
 * `secure` depende del entorno porque en `localhost` sobre http una cookie `Secure` no se
 * guarda y el login local no funcionaria; `domain` no se declara para no ampliar la sesion
 * a subdominios. Solo se puede llamar desde una Server Action o un route handler, que es
 * donde `cookies()` permite escribir: el unico llamador es `loginAction`.
 */
export async function startSession(ticket: SessionTicket): Promise<void> {
  // Primero el secreto: si falta, se lanza antes de tocar la cookie (QC-7 R13).
  const value = await buildSessionValue(ticket, readSessionSecret());
  const cookieStore = await cookies();

  cookieStore.set({
    name: SESSION_COOKIE_NAME,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DURATION_MS / 1000,
  });
}

/**
 * Lee y verifica el contenido firmado de la cookie en curso, sin reemitirla ni prolongarla
 * (QC-8 R8). Solo hay dos decisiones propias aqui —hay cookie o no, y si su version es la
 * vigente—; el resto lo hace el codec.
 *
 * La comprobacion de version se hace ANTES de leer el secreto a proposito: un valor de una
 * version que ya no vale se descarta sin `SESSION_SECRET` en el entorno, y sin verificar nada.
 * Con un valor de la version vigente, en cambio, la ausencia del secreto SI lanza: no se puede
 * resolver la sesion y callarlo seria tratar un error de configuracion como "sin sesion".
 */
export async function readSessionClaims(): Promise<SessionClaims | null> {
  const cookieStore = await cookies();
  const rawValue = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (rawValue === undefined) return null;
  if (!hasCurrentVersion(rawValue)) return null;

  return verifySessionValue(rawValue, readSessionSecret());
}

/**
 * Retira la cookie de sesion desde el servidor (QC-8 R18). El `path` se repite a proposito: sin
 * el, el navegador no borraria una cookie emitida con `path: '/'`. **No lee el secreto**: el
 * cierre de sesion tiene que seguir funcionando aunque `SESSION_SECRET` este mal configurado
 * (QC-8 R9, segunda mitad).
 */
export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete({ name: SESSION_COOKIE_NAME, path: '/' });
}
