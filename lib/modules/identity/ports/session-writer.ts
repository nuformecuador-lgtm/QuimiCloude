import type { SessionTicket } from '../domain/session';

/**
 * El dominio decide **que** sesion se abre; el adaptador sabe **como** se transporta (cookie
 * firmada). Puede lanzar si el transporte no esta configurado (secreto ausente, R13): en ese
 * caso no se da por autenticado a nadie.
 */
export interface SessionWriter {
  startSession(ticket: SessionTicket): Promise<void>;
}
