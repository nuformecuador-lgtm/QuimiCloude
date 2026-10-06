// T1 — Ticket de sesion: quien entra, desde cuando y hasta cuando (`design.md > 5.4`).
// Dominio puro: sin framework, sin Prisma, sin `lib/shared`. Quien transporta el ticket
// (cookie firmada) es un adaptador; aqui solo se decide la sesion.

/**
 * Duracion de la sesion: 8 h, caducidad **absoluta** desde la emision (D10).
 *
 * No va por variable de entorno a proposito: no cambia entre entornos, es una decision de
 * producto (una jornada de trabajo de un ERP interno). No hay renovacion deslizante ni
 * "recordarme": la caducidad absoluta es la que se puede razonar y testear sin ambiguedad.
 */
export const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

export type SessionTicket = {
  readonly userId: string;
  /**
   * Nombre del rol que esa persona tiene en la base EN EL INSTANTE de emitir (QC-9 R26). Viaja
   * firmado dentro de la cookie desde `v2` para que el middleware pueda decidir en el borde sin
   * consultar la base. Es una foto: no envejece bien y no pretende hacerlo (QC-9 R30, y QC-23).
   */
  readonly roleName: string;
  /**
   * Empresa a la que pertenece esa persona en el instante de emitir. Sale de su propia ficha
   * (`users.company_id`, leida por la misma consulta que autentica) y jamas de la entrada del
   * login: la empresa no se pregunta ni se elige. Viaja firmada como `cid` y es solo el
   * identificador. `null` solo para el Maestro, que no pertenece a ninguna empresa: la base
   * impide que cualquier otro rol quede sin ella.
   */
  readonly companyId: string | null;
  /**
   * QC-23 T4 (R1, R2) — IDENTIFICADOR de ESTA sesion, con forma de UUID. Viaja firmado dentro de
   * la cookie desde `v4` como `sid`, igual que el rol desde `v2` y la empresa desde `v3`.
   *
   * Es lo que permite cerrar UN dispositivo y solo ese (R20): el registro de sesiones cerradas
   * guarda `sid`, no usuarios. Dos emisiones para la misma persona, aunque ocurran en el mismo
   * instante, tienen `sid` distintos — y por eso NO se deriva de `userId` ni de `issuedAt`.
   *
   * Quien lo genera es un puerto (`SessionIdFactory`), no este archivo: el dominio no puede tener
   * fuentes de azar propias, que es justo lo que hace testeable R2.
   */
  readonly sessionId: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
};

/**
 * `now` entra como parametro en vez de leerse dentro con `new Date()` sin salida: es lo que
 * hace el ticket determinista en un test sin montar un puerto de reloj (`design.md > 2`).
 *
 * `roleName` es obligatorio y va sin valor por defecto a proposito: un rol por defecto seria un
 * rol inventado, y QC-9 R26 exige que salga de la base o que no haya sesion.
 *
 * `companyId` es obligatorio y va sin valor por defecto por el mismo motivo: una empresa por
 * defecto seria una empresa inventada. `null` es un valor explicito —la ficha no tiene
 * empresa—, nunca una omision. Va posicional y no en un objeto para que `strict` marque uno a
 * uno los sitios de llamada.
 *
 * `sessionId` es obligatorio, posicional y **sin valor por defecto** (QC-23 R1, R2): un `sid`
 * inventado aqui dentro seria un `sid` no aleatorio —y, peor, derivable de lo que el resto del
 * ticket ya dice—. Lo produce `SessionIdFactory` y entra desde fuera, exactamente como el rol y
 * la empresa entran desde la ficha de la persona. Posicional para que `strict` marque uno a uno
 * los sitios de llamada.
 */
export function createSessionTicket(
  userId: string,
  roleName: string,
  companyId: string | null,
  sessionId: string,
  now: Date = new Date(),
): SessionTicket {
  const issuedAt = new Date(now.getTime());

  return {
    userId,
    roleName,
    companyId,
    sessionId,
    issuedAt,
    expiresAt: new Date(issuedAt.getTime() + SESSION_DURATION_MS),
  };
}
