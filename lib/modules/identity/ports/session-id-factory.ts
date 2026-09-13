// QC-23 T5 — Puerto de la fabrica del identificador de sesion (`design.md > 3`, R1, R2).
//
// Puerto puro: este archivo no importa framework, Prisma, `lib/shared/**`, `lib/composition` ni
// las tripas de otro modulo. Tampoco `node:crypto` ni la `crypto` global: eso es del adaptador
// (`adapters/driven/session/session-id-crypto.ts`).

/**
 * Produce el identificador de UNA sesion.
 *
 * **Por que esto es un puerto y no un `crypto.randomUUID()` dentro del dominio**: el dominio no
 * puede tener fuentes de azar propias. Es exactamente lo que hace testeable R2 —«dos emisiones
 * para la misma persona, aunque ocurran en el mismo instante, producen `sid` distintos»— sin
 * espiar globales, y es el mismo reparto que ya tiene `CredentialSetupSecretFactory` (QC-79): la
 * entropia y su codificacion son obligacion del adaptador.
 *
 * **El metodo no recibe nada, y eso es R2 escrito en la firma.** El identificador no se deriva
 * del usuario, ni de su empresa, ni de ningun instante: sin parametros no hay nada de donde
 * derivarlo, y dos sesiones de la misma persona en el mismo segundo no pueden colisionar.
 *
 * El valor devuelto tiene forma de UUID porque acaba comparandose contra una columna `@db.Uuid`
 * (`revoked_sessions.session_id`) y porque `SESSION_CLAIMS_SCHEMA` lo exige con `.uuid()`.
 */
export interface SessionIdFactory {
  newSessionId(): string;
}
