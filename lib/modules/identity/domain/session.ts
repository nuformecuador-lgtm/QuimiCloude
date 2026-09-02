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
  readonly issuedAt: Date;
  readonly expiresAt: Date;
};

/**
 * `now` entra como parametro en vez de leerse dentro con `new Date()` sin salida: es lo que
 * hace el ticket determinista en un test sin montar un puerto de reloj (`design.md > 2`).
 *
 * `roleName` es obligatorio y va sin valor por defecto a proposito: un rol por defecto seria un
 * rol inventado, y QC-9 R26 exige que salga de la base o que no haya sesion.
 */
export function createSessionTicket(
  userId: string,
  roleName: string,
  now: Date = new Date(),
): SessionTicket {
  const issuedAt = new Date(now.getTime());

  return {
    userId,
    roleName,
    issuedAt,
    expiresAt: new Date(issuedAt.getTime() + SESSION_DURATION_MS),
  };
}
