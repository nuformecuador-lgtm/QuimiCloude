import type { SessionClaims } from '../domain/session-claims';

/**
 * T10 — Lo que el portero necesita del mundo para leer la sesion en el BORDE (`design.md > 5`).
 *
 * Es hermano de `SessionReader` y no lo sustituye: aquel lee la cookie por su cuenta con
 * `next/headers` (servidor Node) y por eso no recibe nada; este recibe el valor CRUDO, porque
 * en el middleware la cookie llega dentro de la `NextRequest` y quien la saca de ahi es el
 * adaptador driving. Lo unico que el puerto promete es traducir ese texto a contenido
 * verificado, o a nada.
 *
 * `cookieName` viaja en el puerto para que el driving pueda pedir la cookie por su nombre sin
 * importar el adaptador que sabe cual es (R21): el cableado vive solo en `lib/composition/**`.
 *
 * `verify` devuelve `null` —y no lanza— ante cualquier valor que no resuelva una sesion: version
 * no reconocida (R27), firma que no casa, o contenido que no decodifica a claims validos (R3,
 * R28). La caducidad NO se juzga aqui: de eso se encarga `isSessionExpired` en el dominio, que
 * es la unica nocion de «caducada» del repo.
 */
export interface SessionTokenVerifier {
  readonly cookieName: string;
  verify(raw: string): Promise<SessionClaims | null>;
}
