// T4 — Caso de uso: resolver quien es el usuario de la sesion en curso, o que no hay sesion
// (`design.md > 2.1`). Encadena cuatro cortes —sin contenido, caducado, sin usuario activo, y
// solo entonces compone el `SessionUser`— y ese encadenado ES la politica (R1, R10-R14, R23):
// no delega, decide en que orden se corta y cuando NO hace falta tocar la base.

import { buildDisplayName } from './display-name';
import { isSessionExpired } from './session-claims';

import type { SessionReader } from '../ports/session-reader';
import type { SessionUserReader } from '../ports/session-user-reader';
import type { SessionUser } from './session-user';

export type ResolveSessionUserDeps = {
  readonly session: SessionReader;
  readonly users: SessionUserReader;
};

/**
 * `now` entra como parametro con valor por defecto, igual que `createSessionTicket` (QC-7): es
 * lo que hace testeable la caducidad sin reloj falso ni `sleep`.
 */
export function createResolveSessionUser(
  deps: ResolveSessionUserDeps,
): (now?: Date) => Promise<SessionUser | null> {
  return async function resolveSessionUser(now: Date = new Date()): Promise<SessionUser | null> {
    const claims = await deps.session.readClaims();
    // Sin cookie, prefijo invalido, firma que no casa o contenido que no valida: el lector ya
    // lo resolvio como "nada" (R2-R6). No se toca el lector de usuario.
    if (claims === null) return null;

    // Caducada: tampoco justifica una consulta a la base (R7).
    if (isSessionExpired(claims, now)) return null;

    // Solo aqui, con una sesion con forma valida y sin caducar, se consulta por el `sub`
    // en cada peticion (R10): el rol y el estado activo son siempre los actuales.
    const record = await deps.users.findActiveById(claims.sub);
    // No existe, o esta dado de baja (`deleted_at`): sin sesion aunque la firma y la
    // caducidad fueran impecables (R11).
    if (record === null) return null;

    return {
      id: record.id,
      username: record.username,
      displayName: buildDisplayName(record.firstNames, record.lastNames, record.username),
      roleName: record.roleName,
    };
  };
}
