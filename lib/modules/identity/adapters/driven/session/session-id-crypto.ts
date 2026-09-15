// QC-23 T5 — Adaptador driven de `SessionIdFactory` (`design.md > 3`, R1, R2).
//
// Una funcion y nada mas. `crypto.randomUUID()` es la `crypto` GLOBAL de plataforma —la misma que
// `session-token.ts` ya usa para el HMAC con `crypto.subtle`—, no `node:crypto`: este archivo
// vive junto al codec, y depender de un modulo de Node aqui seria abrir la puerta a que el borde
// se quede sin cargar por un import transitivo (QC-9 R15). Tampoco se añade ninguna dependencia
// nueva a `package.json` (R47).
//
// POR QUE `randomUUID` Y NO UN SECRETO DE 256 BITS como el de QC-79: el `sid` **no es un
// secreto**. No autoriza por si solo: viaja DENTRO del contenido firmado, asi que quien no tenga
// el `SESSION_SECRET` no puede fabricar una cookie con un `sid` elegido. Lo unico que se le exige
// es ser UNICO —R2, y el indice unico de `revoked_sessions.session_id`—, y los 122 bits
// aleatorios de un UUIDv4 lo son con margen de sobra. Ademas tiene que tener forma de UUID
// porque acaba comparandose contra una columna `@db.Uuid`, y un base64url de 43 caracteres no la
// tendria.

import type { SessionIdFactory } from '../../../ports/session-id-factory';

/**
 * Un identificador de sesion recien generado, con forma de UUID. Cumple
 * `SessionIdFactory.newSessionId` (R1, R2).
 *
 * No recibe nada y no guarda estado: dos invocaciones seguidas devuelven valores distintos, que
 * es justo lo que R2 exige de dos emisiones en el mismo instante.
 */
export function newSessionId(): string {
  return crypto.randomUUID();
}

/**
 * El adaptador COMPLETO, listo para que `lib/composition` lo ate al puerto (T17). La funcion se
 * sigue exportando suelta porque el test la ejerce directa; esto solo la junta bajo el contrato.
 *
 * El `satisfies` es un ancla de compilacion: si el puerto gana o cambia un metodo, esta linea
 * deja de compilar en vez de descubrirse en `lib/composition`.
 */
export const sessionIdCrypto = {
  newSessionId,
} satisfies SessionIdFactory;
