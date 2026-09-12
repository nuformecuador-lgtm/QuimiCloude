// QC-79 T8 — La vida del enlace (R8, R12). Dominio puro, sin dobles y sin base.
//
// Lo que se prueba aqui es la REGLA -7 dias, y las tres formas de morir-, con objetos planos. Que
// la base aplique el mismo predicado en una sola escritura atomica lo prueba el test de
// integracion de `design.md > 9.1`; lo que este archivo fija es el BORDE, que es donde un plazo se
// equivoca siempre: por un lado o por el otro.

import {
  CREDENTIAL_SETUP_LINK_TTL_DAYS,
  CREDENTIAL_SETUP_LINK_TTL_MS,
  credentialSetupLinkExpiresAt,
  evaluateLink,
  isCredentialSetupLinkLive,
  type CredentialSetupLink,
} from '@/lib/modules/identity/domain/credential-setup-link';

/** Instante de emision fijo: el reloj entra por parametro, nunca del sistema. */
const EMISION = new Date('2026-09-11T10:00:00.000Z');

/** Caducidad que corresponde a `EMISION`, calculada A MANO y no con la funcion bajo prueba. */
const CADUCIDAD = new Date('2026-09-18T10:00:00.000Z');

function enlace(overrides: Partial<CredentialSetupLink> = {}): CredentialSetupLink {
  return {
    userId: '11111111-1111-4111-8111-111111111111',
    digest: 'a'.repeat(64),
    createdAt: EMISION,
    expiresAt: CADUCIDAD,
    consumedAt: null,
    supersededAt: null,
    ...overrides,
  };
}

describe('la vida del enlace — el plazo de 7 dias (R8)', () => {
  it('el plazo es de 7 dias y su equivalente en milisegundos se deriva de el', () => {
    expect(CREDENTIAL_SETUP_LINK_TTL_DAYS).toBe(7);
    expect(CREDENTIAL_SETUP_LINK_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('la caducidad son exactamente 7 dias despues de la emision', () => {
    // La expectativa es una fecha escrita a mano: si la funcion cambiara de plazo, comparar contra
    // la propia constante no lo notaria.
    expect(credentialSetupLinkExpiresAt(EMISION)).toEqual(CADUCIDAD);
  });

  it('el plazo se cuenta desde el instante que recibe, no desde ningun otro (R16)', () => {
    const reenvio = new Date('2026-09-15T08:30:00.000Z');

    expect(credentialSetupLinkExpiresAt(reenvio)).toEqual(new Date('2026-09-22T08:30:00.000Z'));
  });
});

describe('la vida del enlace — el borde exacto de la caducidad (R8)', () => {
  it('un milisegundo ANTES de la caducidad el enlace sigue vivo', () => {
    const now = new Date(CADUCIDAD.getTime() - 1);

    expect(evaluateLink(enlace(), now)).toBe('live');
    expect(isCredentialSetupLinkLive(enlace(), now)).toBe(true);
  });

  it('en el instante EXACTO de la caducidad el enlace ya no vale', () => {
    // Mismo borde que el `expires_at > $now` del UPDATE de `design.md > 4.6`: iguales => no vale.
    const now = new Date(CADUCIDAD.getTime());

    expect(evaluateLink(enlace(), now)).toBe('expired');
    expect(isCredentialSetupLinkLive(enlace(), now)).toBe(false);
  });

  it('un milisegundo DESPUES de la caducidad el enlace esta caducado', () => {
    const now = new Date(CADUCIDAD.getTime() + 1);

    expect(evaluateLink(enlace(), now)).toBe('expired');
  });

  it('recien emitido, y a lo largo de los 7 dias, el enlace vale', () => {
    expect(evaluateLink(enlace(), EMISION)).toBe('live');
    expect(evaluateLink(enlace(), new Date('2026-09-17T23:59:59.999Z'))).toBe('live');
  });

  it('no hay forma de prolongar un enlace emitido: la caducidad es un dato de la fila (R8)', () => {
    // Extender es emitir uno nuevo (R16). `evaluateLink` solo lee `expiresAt`; no existe ningun
    // parametro con el que ablandar el plazo.
    const viejo = enlace({ expiresAt: new Date(CADUCIDAD.getTime()) });

    expect(evaluateLink(viejo, new Date(CADUCIDAD.getTime() + 60_000))).toBe('expired');
  });
});

describe('la vida del enlace — consumido y sustituido (R11, R12)', () => {
  it('un enlace consumido no vale, aunque el plazo siga corriendo', () => {
    const consumido = enlace({ consumedAt: new Date('2026-09-12T09:00:00.000Z') });

    expect(evaluateLink(consumido, new Date('2026-09-12T09:00:01.000Z'))).toBe('consumed');
    expect(isCredentialSetupLinkLive(consumido, EMISION)).toBe(false);
  });

  it('un enlace sustituido por un reenvio no vale, aunque el plazo siga corriendo', () => {
    const sustituido = enlace({ supersededAt: new Date('2026-09-12T09:00:00.000Z') });

    expect(evaluateLink(sustituido, new Date('2026-09-12T09:00:01.000Z'))).toBe('superseded');
    expect(isCredentialSetupLinkLive(sustituido, EMISION)).toBe(false);
  });

  it('consumido manda sobre sustituido y sobre caducado: el estado dice que le paso a la fila', () => {
    const todo = enlace({
      consumedAt: new Date('2026-09-12T09:00:00.000Z'),
      supersededAt: new Date('2026-09-13T09:00:00.000Z'),
    });

    expect(evaluateLink(todo, new Date('2027-01-01T00:00:00.000Z'))).toBe('consumed');
  });

  it('sustituido manda sobre caducado', () => {
    const sustituido = enlace({ supersededAt: new Date('2026-09-13T09:00:00.000Z') });

    expect(evaluateLink(sustituido, new Date('2027-01-01T00:00:00.000Z'))).toBe('superseded');
  });
});
