import type { SessionClaims } from '../domain/session-claims';

/**
 * Lo que el dominio necesita del mundo para leer la sesion en curso (`design.md > 2`). El
 * adaptador sabe COMO viaja (cookie, base64url, HMAC); este puerto solo entrega el contenido
 * ya verificado, o nada.
 *
 * No declara `clear()`: el puerto modela lo que el dominio necesita, y el dominio de QC-8
 * solo lee la sesion (`createResolveSessionUser` llama a `readClaims()` y nada mas). Cerrar
 * sesion no tiene caso de uso a proposito (`design.md > 2`) — borrar la cookie no encierra
 * ninguna decision de negocio —, asi que la composicion lo cablea directo al adaptador
 * (`endSession: clearSession`) y el `redirect` vive en el driving.
 */
export interface SessionReader {
  readClaims(): Promise<SessionClaims | null>;
}
