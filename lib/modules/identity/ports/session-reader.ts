import type { SessionClaims } from '../domain/session-claims';

/**
 * Lo que el dominio necesita del mundo para leer la sesion en curso (`design.md > 2`). El
 * adaptador sabe COMO viaja (cookie, base64url, HMAC); este puerto solo entrega el contenido
 * ya verificado, o nada.
 */
export interface SessionReader {
  readClaims(): Promise<SessionClaims | null>;
  clear(): Promise<void>;
}
