// T1 — Que forma tiene el contenido firmado para ser interpretable, y cuando caduca
// (`design.md > 4.3`). Dominio puro: sin framework, sin Prisma, sin `lib/shared`. Quien
// decodifica base64url y verifica la firma es el adaptador (`session-cookie.ts`); aqui solo
// se decide si el JSON resultante es un `SessionClaims` valido y si ya caduco.

import { z } from 'zod';

/**
 * Esquema del contenido firmado de la cookie (R6). `sub` tiene que tener forma de UUID: es lo
 * que evita que un `sub` con formato invalido llegue a `SessionUserReader.findActiveById`, que
 * usa `id` como clave primaria `@db.Uuid` (`design.md > 4.2`). `iat`/`exp` son enteros positivos
 * que viajan como **epoch en SEGUNDOS**: el emisor (`session-cookie.ts` de QC-7, `toEpochSeconds`)
 * firma en segundos, no en milisegundos, y esa unidad es una decision cerrada del 2026-09-01
 * (`design.md > 4.3`) que este modulo no puede reinterpretar. Aqui solo se exige que sean numeros
 * enteros y positivos; la conversion a `Date` (multiplicando por 1000) es responsabilidad de este
 * mismo modulo, una sola vez, en el borde.
 */
const SESSION_CLAIMS_SCHEMA = z.object({
  sub: z.string().uuid(),
  iat: z.number().int().positive(),
  exp: z.number().int().positive(),
});

/**
 * Contenido ya verificado de la sesion (R6). `iat`/`exp` llegan como `Date`: el resto del
 * dominio razona con fechas, no con epochs (`docs/architecture.md > Principios 2`).
 */
export type SessionClaims = {
  readonly sub: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
};

/**
 * Interpreta el contenido firmado ya decodificado (el JSON, no el valor completo de la cookie).
 * Devuelve `null` ante cualquier entrada invalida: JSON mal formado, campos ausentes, `sub` sin
 * forma de UUID o `iat`/`exp` que no sean enteros positivos. No lanza en ningun caso: un
 * payload que no es JSON es entrada invalida, no un fallo, y el `try` que lo cubre esta acotado
 * exactamente a la linea de `JSON.parse` (R6).
 */
export function parseSessionClaims(rawJson: string): SessionClaims | null {
  let candidato: unknown;
  try {
    candidato = JSON.parse(rawJson);
  } catch {
    return null;
  }

  const resultado = SESSION_CLAIMS_SCHEMA.safeParse(candidato);
  if (!resultado.success) return null;

  return {
    sub: resultado.data.sub,
    // iat/exp son epoch en SEGUNDOS (QC-7, `toEpochSeconds`): `Date` espera milisegundos.
    issuedAt: new Date(resultado.data.iat * 1000),
    expiresAt: new Date(resultado.data.exp * 1000),
  };
}

/**
 * Una sesion caduca EN su `exp`, no despues (R7): se usa `>=`, asi que en el instante exacto de
 * `expiresAt` la sesion ya no vale. Eleccion arbitraria pero fijada, y su test la ancla.
 */
export function isSessionExpired(claims: SessionClaims, now: Date): boolean {
  return now.getTime() >= claims.expiresAt.getTime();
}
