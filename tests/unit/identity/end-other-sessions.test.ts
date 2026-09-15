// QC-23 T20 — El caso de uso de CERRAR TODAS MENOS LA ACTUAL (`domain/end-other-sessions.ts`,
// `design.md > 5.3`). Cubre R27, R28, R30, R31, R32, R49.
//
// Igual que `end-session.test.ts`, los dobles comparten UN MISMO ESTADO en memoria —el sello de
// la persona— para que «la cookie vieja queda invalida y la nueva vale» y «una sesion ajena
// emitida en el mismo segundo del sello queda invalida» se afirmen contra la CADENA REAL de
// `createResolveSession`, y no contra una promesa del test.

import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { createEndOtherSessions } from '@/lib/modules/identity/domain/end-other-sessions';
import { createResolveSession } from '@/lib/modules/identity/domain/resolve-session';
import { UnauthorizedError, UserNotFoundError } from '@/lib/modules/identity/domain/errors';
import { SESSION_DURATION_MS } from '@/lib/modules/identity/domain/session';
import { floorToSecond } from '@/lib/modules/identity/domain/session-revocation';

import type { Actor } from '@/lib/modules/identity/domain/actor';
import type { CurrentSession } from '@/lib/modules/identity/domain/end-other-sessions';
import type { SessionTicket } from '@/lib/modules/identity/domain/session';
import type { SessionClaims } from '@/lib/modules/identity/domain/session-claims';
import type { SessionRevocationRepository } from '@/lib/modules/identity/ports/session-revocation-repository';
import type {
  SessionUserReader,
  SessionUserRecord,
} from '@/lib/modules/identity/ports/session-user-reader';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const COMPANY_ID = '99999999-9999-4999-8999-999999999999';
/** El `sid` de la sesion desde la que se invoca: el mismo dispositivo, la cookie VIEJA. */
const SID_VIEJO = '5b6f3d21-9c4e-4a7f-8b03-6d2e1f5a9c44';
/** El `sid` NUEVO que produce la fabrica (R2): distinto del viejo, y no derivado de nada. */
const SID_NUEVO = 'a1c3e5f7-2b4d-4680-9ace-13579bdf2468';

/** El instante de la operacion, con milisegundos «sucios» a proposito. */
const AHORA = new Date('2026-09-12T10:00:00.437Z');
/** Como se guarda el sello: truncado al segundo (`design.md > 2.3`). */
const SELLO = floorToSecond(AHORA);
/** Un sello viejisimo: antes de la operacion no corta nada. */
const SELLO_VIEJO = new Date('2026-01-01T00:00:00.000Z');

const ACTOR: Actor = { id: ACTOR_ID, companyId: COMPANY_ID, permissions: [] };
const ACTUAL: CurrentSession = {
  roleName: 'operador',
  companyId: COMPANY_ID,
  sessionId: SID_VIEJO,
};

/** La cookie vieja del MISMO dispositivo: emitida una hora antes del sello. */
const CLAIMS_VIEJOS: SessionClaims = {
  sub: ACTOR_ID,
  roleName: 'operador',
  companyId: COMPANY_ID,
  sessionId: SID_VIEJO,
  issuedAt: new Date('2026-09-12T09:00:00.000Z'),
  expiresAt: new Date('2026-09-12T17:00:00.000Z'),
};

/**
 * Otro dispositivo de la misma persona, emitido EN EL MISMO SEGUNDO que el sello. Es la fila del
 * medio de la tabla de `design.md > 2.3`, y la que justifica que la comparacion sea `<=`.
 */
const CLAIMS_DEL_MISMO_SEGUNDO: SessionClaims = {
  ...CLAIMS_VIEJOS,
  sessionId: 'c0ffee00-0000-4000-8000-000000000001',
  issuedAt: SELLO,
  expiresAt: new Date(SELLO.getTime() + SESSION_DURATION_MS),
};

/** Traduce el ticket emitido a los claims que viajarian en la cookie nueva. */
function claimsDelTicket(ticket: SessionTicket): SessionClaims {
  return {
    sub: ticket.userId,
    roleName: ticket.roleName,
    companyId: ticket.companyId,
    sessionId: ticket.sessionId,
    issuedAt: ticket.issuedAt,
    expiresAt: ticket.expiresAt,
  };
}

function crearMundo(resultado: 'ok' | 'not_found' = 'ok') {
  const estado = { sello: SELLO_VIEJO };

  const stampAll = vi.fn(async (input: { userId: string; companyId: string; validFrom: Date }) => {
    if (resultado === 'ok') estado.sello = input.validFrom;
    return resultado;
  });
  const revokeSession = vi.fn(async () => {});
  const revocations: SessionRevocationRepository = { stampAll, revokeSession };

  const emitidos: SessionTicket[] = [];
  const startSession = vi.fn(async (ticket: SessionTicket) => {
    emitidos.push(ticket);
  });

  const newSessionId = vi.fn(() => SID_NUEVO);

  const users: SessionUserReader = {
    findActiveById: async (id: string): Promise<SessionUserRecord | null> => {
      if (id !== ACTOR_ID) return null;
      return {
        id: ACTOR_ID,
        username: 'ana.perez',
        firstNames: 'Ana Maria',
        lastNames: 'Perez Gomez',
        roleName: 'operador',
        companyId: COMPANY_ID,
        companyDeletedAt: null,
        permissions: ['inventario.consultar'],
        accountStatus: 'active',
        lockedUntil: null,
        sessionsValidFrom: estado.sello,
        // Este caso de uso NO registra ninguna sesion una a una: el sello lo cubre todo.
        sessionRevokedAt: null,
      };
    },
  };

  const resolverCon = (claims: SessionClaims) =>
    createResolveSession({
      session: { readClaims: async () => claims },
      users,
      log: { log: vi.fn() },
    });

  return { estado, revocations, stampAll, revokeSession, startSession, newSessionId, emitidos, resolverCon };
}

function crearCaso(mundo: ReturnType<typeof crearMundo>) {
  return createEndOtherSessions({
    revocations: mundo.revocations,
    sessions: { startSession: mundo.startSession },
    ids: { newSessionId: mundo.newSessionId },
    now: () => AHORA,
  });
}

describe('endOtherSessions — autorizacion sobre UNO MISMO, en la primera linea (R27)', () => {
  for (const [caso, actor] of [
    ['actor ausente (null)', null],
    ['actor ausente (undefined)', undefined],
  ] as ReadonlyArray<readonly [string, Actor | null | undefined]>) {
    it(`rechaza ${caso} sin tocar el puerto, sin pedir sid y sin emitir nada`, async () => {
      const mundo = crearMundo();

      await expect(crearCaso(mundo)(actor, ACTUAL)).rejects.toBeInstanceOf(UnauthorizedError);

      // El doble del repositorio afirma CERO invocaciones (`tasks.md > T20`).
      expect(mundo.stampAll).not.toHaveBeenCalled();
      expect(mundo.revokeSession).not.toHaveBeenCalled();
      expect(mundo.newSessionId).not.toHaveBeenCalled();
      expect(mundo.startSession).not.toHaveBeenCalled();
    });
  }

  // No exige ningun codigo: cerrar las PROPIAS sesiones no lo pide (R27), y por eso el actor de
  // todos los demas casos de este archivo trae el conjunto VACIO.
  it('un actor sin ningun permiso puede cerrar sus otras sesiones', async () => {
    const mundo = crearMundo();

    await expect(crearCaso(mundo)(ACTOR, ACTUAL)).resolves.toBeUndefined();

    expect(mundo.stampAll).toHaveBeenCalledTimes(1);
  });
});

describe('endOtherSessions — el sello sube y la sesion actual se reemite (R30, R31)', () => {
  it('sube el sello del actor, en su empresa y truncado al segundo', async () => {
    const mundo = crearMundo();

    await crearCaso(mundo)(ACTOR, ACTUAL);

    expect(mundo.stampAll).toHaveBeenCalledWith({
      userId: ACTOR_ID,
      companyId: COMPANY_ID,
      validFrom: SELLO,
    });
  });

  it('la cookie VIEJA del mismo dispositivo queda invalida y la NUEVA vale', async () => {
    const mundo = crearMundo();

    await crearCaso(mundo)(ACTOR, ACTUAL);

    const [ticket] = mundo.emitidos;
    expect(ticket).toBeDefined();
    // R2, R31: `sid` NUEVO, y pedido a la fabrica exactamente una vez.
    expect(mundo.newSessionId).toHaveBeenCalledTimes(1);
    expect((ticket as SessionTicket).sessionId).toBe(SID_NUEVO);
    expect((ticket as SessionTicket).sessionId).not.toBe(SID_VIEJO);

    // El instante de la comprobacion es posterior al sello y anterior a cualquier caducidad.
    const despues = new Date(SELLO.getTime() + 60_000);
    expect(await mundo.resolverCon(CLAIMS_VIEJOS)(despues)).toBeNull();
    expect(await mundo.resolverCon(claimsDelTicket(ticket as SessionTicket))(despues)).not.toBeNull();
  });

  it('una sesion AJENA emitida en el MISMO SEGUNDO del sello queda invalida (R9)', async () => {
    const mundo = crearMundo();

    await crearCaso(mundo)(ACTOR, ACTUAL);

    const despues = new Date(SELLO.getTime() + 60_000);
    expect(await mundo.resolverCon(CLAIMS_DEL_MISMO_SEGUNDO)(despues)).toBeNull();
  });

  it('la sesion nueva nace en el PRIMER instante posterior al sello y dura 8 h absolutas (R49)', async () => {
    const mundo = crearMundo();

    await crearCaso(mundo)(ACTOR, ACTUAL);

    const [ticket] = mundo.emitidos as [SessionTicket];
    expect(ticket.issuedAt.getTime()).toBe(SELLO.getTime() + 1000);
    // La ventana NO cambia: 8 h absolutas desde la emision, sin renovacion deslizante.
    expect(ticket.expiresAt.getTime() - ticket.issuedAt.getTime()).toBe(SESSION_DURATION_MS);
    // El rol se reemite TAL CUAL: esta operacion cierra sesiones, no revisa roles.
    expect(ticket.userId).toBe(ACTOR_ID);
    expect(ticket.roleName).toBe(ACTUAL.roleName);
    expect(ticket.companyId).toBe(COMPANY_ID);
  });

  it('la empresa con la que se SELLA y con la que se REEMITE es UNA, y es la del actor', async () => {
    // Un solo dato para las dos cosas. Hoy `actor.companyId` y `current.companyId` coinciden por
    // construccion —los alimenta la misma sesion resuelta—, asi que la unica forma de anclar la
    // eleccion es hacerlos DIVERGIR a proposito y ver cual gana. Gana el del actor, porque es
    // quien trae el ambito de autorizacion: sellar una empresa y reemitir otra entregaria una
    // cookie fuera de lo que se acaba de autorizar.
    const OTRA_EMPRESA = '77777777-7777-4777-8777-777777777777';
    const mundo = crearMundo();

    await crearCaso(mundo)(ACTOR, { ...ACTUAL, companyId: OTRA_EMPRESA });

    expect(mundo.stampAll).toHaveBeenCalledWith(
      expect.objectContaining({ userId: ACTOR_ID, companyId: COMPANY_ID }),
    );
    const [ticket] = mundo.emitidos as [SessionTicket];
    expect(ticket.companyId).toBe(COMPANY_ID);
    expect(ticket.companyId).not.toBe(OTRA_EMPRESA);
  });

  it('ninguna peticion ordinaria reemite ni prolonga nada (R49)', async () => {
    const mundo = crearMundo();

    await crearCaso(mundo)(ACTOR, ACTUAL);
    const emitidosTrasLaOperacion = mundo.startSession.mock.calls.length;

    const resolver = mundo.resolverCon(claimsDelTicket(mundo.emitidos[0] as SessionTicket));
    const despues = new Date(SELLO.getTime() + 60_000);
    await resolver(despues);
    await resolver(despues);
    await resolver(despues);

    // La unica reemision fuera del login es la de R31, y ya ocurrio: resolver no emite.
    expect(mundo.startSession).toHaveBeenCalledTimes(emitidosTrasLaOperacion);
    expect(emitidosTrasLaOperacion).toBe(1);

    // Y no puede emitir: la cadena de resolucion no conoce ningun escritor de sesiones.
    const fuente = readFileSync(
      resolvePath(process.cwd(), 'lib/modules/identity/domain/resolve-session.ts'),
      'utf8',
    )
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/.*$/gm, ' ');
    expect(fuente).not.toMatch(/startSession/);
    expect(fuente).not.toMatch(/SessionWriter/);
  });
});

describe('endOtherSessions — fallo cerrado (R28, `design.md > 5.3`)', () => {
  it('si el sello no pudo subir no se reemite ninguna sesion, y el error es user_not_found', async () => {
    const mundo = crearMundo('not_found');

    const error = await crearCaso(mundo)(ACTOR, ACTUAL).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UserNotFoundError);
    expect((error as UserNotFoundError).code).toBe('user_not_found');
    expect(mundo.startSession).not.toHaveBeenCalled();
  });

  it('si la reemision falla, el actor tambien acaba en el login: el sello YA subio', async () => {
    const mundo = crearMundo();
    mundo.startSession.mockRejectedValueOnce(new Error('la cookie no se pudo escribir'));

    await expect(crearCaso(mundo)(ACTOR, ACTUAL)).rejects.toThrow('la cookie no se pudo escribir');

    // Los pasos 2 y 3 no son atomicos entre si y no pueden serlo: uno escribe en Postgres y el
    // otro en una cookie. El lado por el que se cae es el cerrado, que es el correcto.
    expect(mundo.estado.sello.getTime()).toBe(SELLO.getTime());
    const despues = new Date(SELLO.getTime() + 60_000);
    expect(await mundo.resolverCon(CLAIMS_VIEJOS)(despues)).toBeNull();
  });
});
