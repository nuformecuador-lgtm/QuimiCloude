import { createHmac } from 'node:crypto';
import { cookies } from 'next/headers';

import { SESSION_DURATION_MS, type SessionTicket } from '../../../domain/session';

// Implementa el puerto `SessionWriter` (`../../../ports/session-writer`):
// `startSession` cumple `startSession`. El cableado lo hace el punto de composicion.

/**
 * Nombre de la cookie (`design.md > 5.2`). Lleva el prefijo del producto y no dice
 * "auth" ni "token": no hace falta anunciar que ahi viaja la sesion.
 */
export const SESSION_COOKIE_NAME = 'qc_session';

/** Version del formato del valor. QC-8 rechaza lo que no empiece por aqui, sin adivinar. */
const SESSION_VALUE_VERSION = 'v1';

/** Longitud minima del secreto (`design.md > 5.3`). Por debajo, el HMAC no vale nada. */
const MIN_SECRET_LENGTH = 32;

type SessionPayload = {
  readonly sub: string;
  readonly iat: number;
  readonly exp: number;
};

/**
 * Se exporta a proposito: QC-8 recompone la firma con esta misma funcion para verificarla
 * en tiempo constante. Si cada lado la escribiera por su cuenta, un cambio de formato
 * dejaria de romperse en un sitio y empezaria a fallar en silencio en el otro.
 */
export function signSessionValue(signedPart: string, secret: string): string {
  return createHmac('sha256', secret).update(signedPart).digest('base64url');
}

/**
 * Lee el secreto **en la llamada** y no al cargar el modulo: en el import romperia el
 * build de Vercel (donde no hay entorno de ejecucion) y haria intestable R13.
 * Falla cerrado: sin secreto valido no se emite cookie y nadie queda autenticado.
 * El mensaje describe el problema sin incluir el valor (R15).
 */
function readSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;

  if (typeof secret !== 'string' || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `SESSION_SECRET ausente o mas corto de ${MIN_SECRET_LENGTH} caracteres: no se emite sesion.`,
    );
  }

  return secret;
}

/** Instantes en segundos epoch: es lo que se firma y lo que QC-8 comparara con el reloj. */
function toEpochSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

/**
 * Construye `v1.<payload-base64url>.<hmac-base64url>` (`design.md > 5.1`).
 * El payload lleva **solo** `sub`, `iat` y `exp`: nada de nombre de usuario, correo ni
 * hash, porque este valor viaja en cada peticion (R12).
 */
function buildSessionValue(ticket: SessionTicket, secret: string): string {
  const payload: SessionPayload = {
    sub: ticket.userId,
    iat: toEpochSeconds(ticket.issuedAt),
    exp: toEpochSeconds(ticket.expiresAt),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signedPart = `${SESSION_VALUE_VERSION}.${encodedPayload}`;

  return `${signedPart}.${signSessionValue(signedPart, secret)}`;
}

/**
 * Emite la cookie de sesion con los atributos de `design.md > 5.2`.
 *
 * `secure` depende del entorno porque en `localhost` sobre http una cookie `Secure` no se
 * guarda y el login local no funcionaria; `domain` no se declara para no ampliar la sesion
 * a subdominios. Solo se puede llamar desde una Server Action o un route handler, que es
 * donde `cookies()` permite escribir: el unico llamador es `loginAction`.
 */
export async function startSession(ticket: SessionTicket): Promise<void> {
  // Primero el secreto: si falta, se lanza antes de tocar la cookie (R13).
  const value = buildSessionValue(ticket, readSessionSecret());
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
