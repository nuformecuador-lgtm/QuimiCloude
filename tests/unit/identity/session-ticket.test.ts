// T1 — El ticket de sesion es puro y determinista: la caducidad sale de la duracion del
// dominio y del `now` que se le inyecta, no de un reloj escondido (R11, parte de dominio).

import {
  SESSION_DURATION_MS,
  createSessionTicket,
} from '@/lib/modules/identity/domain/session';

const AHORA = new Date('2026-09-01T08:00:00.000Z');
const USER_ID = '3f2b1c9e-0d4a-4c8b-9e77-2a5f6c1d8b40';
// QC-9 R26: el rol viaja dentro del ticket desde `v2`, y sale de la base.
const ROL = 'Administrador';

describe('ticket de sesion', () => {
  // R11
  it('el ticket caduca a las 8 h', () => {
    const ticket = createSessionTicket(USER_ID, ROL, AHORA);

    expect(ticket.expiresAt.getTime() - ticket.issuedAt.getTime()).toBe(SESSION_DURATION_MS);
    expect(SESSION_DURATION_MS).toBe(8 * 60 * 60 * 1000);
  });

  // R11
  it('con un now inyectado el ticket es determinista', () => {
    const ticket = createSessionTicket(USER_ID, ROL, AHORA);

    expect(ticket.userId).toBe(USER_ID);
    expect(ticket.roleName).toBe(ROL);
    expect(ticket.issuedAt.getTime()).toBe(AHORA.getTime());
    expect(ticket.expiresAt.toISOString()).toBe('2026-09-01T16:00:00.000Z');
    expect(createSessionTicket(USER_ID, ROL, AHORA)).toEqual(ticket);
  });

  // R11 — mutar el `now` de quien llama no puede mover una sesion ya emitida.
  it('el ticket no comparte la instancia de fecha con quien lo pide', () => {
    const now = new Date(AHORA.getTime());
    const ticket = createSessionTicket(USER_ID, ROL, now);

    now.setFullYear(2030);

    expect(ticket.issuedAt.getTime()).toBe(AHORA.getTime());
  });
});
