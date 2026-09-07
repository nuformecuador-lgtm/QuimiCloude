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
// QC-48 R5: la empresa viaja dentro del ticket desde `v3`, sale de la ficha del usuario y es
// obligatoria: no hay valor por defecto, porque una empresa por defecto seria una inventada.
const COMPANY_ID = '7c1e0f52-8a3d-4b6e-9f21-5d0c4a8e7b13';

describe('ticket de sesion', () => {
  // R11
  it('el ticket caduca a las 8 h', () => {
    const ticket = createSessionTicket(USER_ID, ROL, COMPANY_ID, AHORA);

    expect(ticket.expiresAt.getTime() - ticket.issuedAt.getTime()).toBe(SESSION_DURATION_MS);
    expect(SESSION_DURATION_MS).toBe(8 * 60 * 60 * 1000);
  });

  // R11
  it('con un now inyectado el ticket es determinista', () => {
    const ticket = createSessionTicket(USER_ID, ROL, COMPANY_ID, AHORA);

    expect(ticket.userId).toBe(USER_ID);
    expect(ticket.roleName).toBe(ROL);
    expect(ticket.companyId).toBe(COMPANY_ID);
    expect(ticket.issuedAt.getTime()).toBe(AHORA.getTime());
    expect(ticket.expiresAt.toISOString()).toBe('2026-09-01T16:00:00.000Z');
    expect(createSessionTicket(USER_ID, ROL, COMPANY_ID, AHORA)).toEqual(ticket);
  });

  // QC-48 R5 — la empresa que se le pasa es la que lleva el ticket, sin tocarla y sin ninguna
  // otra fuente: quien la resuelve es el caso de uso leyendo la ficha del usuario, y este
  // constructor no la inventa ni la deduce. Sin valor por defecto: omitirla no compila.
  it('el ticket propaga el companyId que se le pasa, sin tocarlo', () => {
    const otra = '0a9b8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d';

    expect(createSessionTicket(USER_ID, ROL, COMPANY_ID, AHORA).companyId).toBe(COMPANY_ID);
    expect(createSessionTicket(USER_ID, ROL, otra, AHORA).companyId).toBe(otra);
    // Y no se cuela en ningun otro campo del ticket.
    expect(createSessionTicket(USER_ID, ROL, otra, AHORA).userId).toBe(USER_ID);
    expect(createSessionTicket(USER_ID, ROL, otra, AHORA).roleName).toBe(ROL);
  });

  // R11 — mutar el `now` de quien llama no puede mover una sesion ya emitida.
  it('el ticket no comparte la instancia de fecha con quien lo pide', () => {
    const now = new Date(AHORA.getTime());
    const ticket = createSessionTicket(USER_ID, ROL, COMPANY_ID, now);

    now.setFullYear(2030);

    expect(ticket.issuedAt.getTime()).toBe(AHORA.getTime());
  });
});
