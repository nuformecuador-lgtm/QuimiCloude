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
 *
 * ANOTACION DE QC-23 (T11, `design.md > 5.1`): **el parrafo de arriba ya no es cierto, y se deja
 * escrito en vez de disimularlo.** Cerrar sesion SI tiene caso de uso desde esta ficha
 * (`domain/end-session.ts`), porque ya no es «borrar la cookie»: hay que leer el `sid` de la
 * sesion en curso, registrar su cierre —y purgar de paso las filas caducadas de esa persona— y
 * DESPUES retirar la cookie, siempre, tambien si el registro fallo (R20, R22, R23). Ese orden, y
 * que el cierre no se bloquee cuando la base no responde, son decisiones de negocio.
 *
 * Lo que NO cambia: este puerto sigue SIN declarar `clear()`. Retirar la cookie entra por un
 * puerto propio, `SessionEraser`, porque son dos capacidades distintas del mundo y el caso de uso
 * pide cada una a quien la tiene. Y la clave de la fachada sigue llamandose `endSession`, asi que
 * `logoutAction()` no cambia ni una linea (R21, congelada por QC-11): lo que cambia es QUE se
 * cablea en `lib/composition`, no quien lo invoca.
 */
export interface SessionReader {
  readClaims(): Promise<SessionClaims | null>;
}
