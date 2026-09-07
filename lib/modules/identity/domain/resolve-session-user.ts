// T4 — Caso de uso: resolver quien es el usuario de la sesion en curso, o que no hay sesion
// (`design.md > 2.1`). Encadena cuatro cortes —sin contenido, caducado, sin usuario activo, y
// solo entonces compone el `SessionUser`— y ese encadenado ES la politica (R1, R10-R14, R23):
// no delega, decide en que orden se corta y cuando NO hace falta tocar la base.
//
// QC-48 (T7, `design.md > 4.2`): la cadena ya no vive aqui. Se mudo entera a `resolve-session.ts`
// —que le anadio dos cortes mas, empresa que no casa y empresa muerta— porque esta ficha necesita
// DOS proyecciones de la misma politica y dos copias serian dos definiciones de «hay sesion»
// (R21). Este archivo se queda con lo que siempre fue su contrato: la proyeccion de usuario.

import { createResolveSession } from './resolve-session';

import type { SessionUser } from './session-user';
import type { ResolveSessionDeps } from './resolve-session';

export type ResolveSessionUserDeps = ResolveSessionDeps;

/**
 * Misma firma publica que en QC-8 —`(now?) => Promise<SessionUser | null>`— y a proposito: asi
 * ni el puerto `SessionProvider`, ni `lib/composition`, ni el layout privado, ni los tests de
 * QC-8 cambian de forma. Lo unico que cambia es de donde sale la decision.
 *
 * `now` sigue entrando como parametro con valor por defecto, igual que `createSessionTicket`
 * (QC-7): es lo que hace testeable la caducidad sin reloj falso ni `sleep`.
 */
export function createResolveSessionUser(
  deps: ResolveSessionUserDeps,
): (now?: Date) => Promise<SessionUser | null> {
  const resolveSession = createResolveSession(deps);

  return async function resolveSessionUser(now: Date = new Date()): Promise<SessionUser | null> {
    // El ternario y no `resolved?.user`: sin sesion hay que devolver `null`, y `undefined` no es
    // lo mismo que `null` para quien consume esta firma desde QC-8.
    const resolved = await resolveSession(now);

    return resolved === null ? null : resolved.user;
  };
}
