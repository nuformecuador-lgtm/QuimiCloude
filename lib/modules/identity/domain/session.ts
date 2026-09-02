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
  readonly issuedAt: Date;
  readonly expiresAt: Date;
};

/**
 * `now` entra como parametro en vez de leerse dentro con `new Date()` sin salida: es lo que
 * hace el ticket determinista en un test sin montar un puerto de reloj (`design.md > 2`).
 */
export function createSessionTicket(userId: string, now: Date = new Date()): SessionTicket {
  const issuedAt = new Date(now.getTime());

  return {
    userId,
    issuedAt,
    expiresAt: new Date(issuedAt.getTime() + SESSION_DURATION_MS),
  };
}
