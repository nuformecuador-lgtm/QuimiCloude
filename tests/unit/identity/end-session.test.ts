// QC-23 T20 — El caso de uso de CERRAR ESTE DISPOSITIVO (`domain/end-session.ts`,
// `design.md > 5.1`). Cubre R20, R21, R22, R23, R24.
//
// Puertos falsos escritos aqui mismo, sin `vi.mock` de modulos reales, igual que
// `resolve-session.test.ts`. Y con una pieza mas: el doble del repositorio y el de la lectura de
// usuario comparten UN MISMO ESTADO en memoria, de modo que «cerrar esta sesion no toca las
// demas» (R20) y «el sello no sube» (R24) se puedan afirmar CONTRA LA CADENA REAL de
// `createResolveSession`, y no contra una promesa del test.

import { describe, expect, it, vi } from 'vitest';

import { createEndSession } from '@/lib/modules/identity/domain/end-session';
import { createResolveSession } from '@/lib/modules/identity/domain/resolve-session';

import type { SessionClaims } from '@/lib/modules/identity/domain/session-claims';
import type { SessionCheckLog } from '@/lib/modules/identity/ports/session-check-log';
import type { SessionEraser } from '@/lib/modules/identity/ports/session-eraser';
import type { SessionReader } from '@/lib/modules/identity/ports/session-reader';
import type { SessionRevocationRepository } from '@/lib/modules/identity/ports/session-revocation-repository';
import type {
  SessionUserReader,
  SessionUserRecord,
} from '@/lib/modules/identity/ports/session-user-reader';

const SUB = '3f2b1c9e-0d4a-4c8b-9e77-2a5f6c1d8b40';
const COMPANY_ID = '7c1e0f52-8a3d-4b6e-9f21-5d0c4a8e7b13';
/** El dispositivo que cierra sesion. */
const SID_MOVIL = '5b6f3d21-9c4e-4a7f-8b03-6d2e1f5a9c44';
/** El otro dispositivo de LA MISMA persona, el de la oficina: no se debe enterar (R20). */
const SID_OFICINA = 'a1c3e5f7-2b4d-4680-9ace-13579bdf2468';

const AHORA = new Date('2026-09-12T10:00:00.437Z');
/** Un sello viejisimo: ninguna de las dos sesiones cae por el corte 7. */
const SELLO_VIEJO = new Date('2026-01-01T00:00:00.000Z');

function claimsDe(sessionId: string): SessionClaims {
  return {
    sub: SUB,
    roleName: 'operador',
    companyId: COMPANY_ID,
    sessionId,
    issuedAt: new Date('2026-09-12T09:00:00.000Z'),
    expiresAt: new Date('2026-09-12T17:00:00.000Z'),
  };
}

/**
 * El estado compartido por los dos dobles: el sello de la persona y las sesiones ya cerradas.
 * Es la forma minima de la base que hace falta para poder preguntarle a la cadena REAL si una
 * sesion sigue resolviendo.
 */
function crearMundo(companyId: string | null = COMPANY_ID) {
  const estado = { sello: SELLO_VIEJO, cerradas: new Map<string, Date>() };

  const revokeSession = vi.fn(
    async (input: { sessionId: string; userId: string; expiresAt: Date; now: Date }) => {
      estado.cerradas.set(input.sessionId, input.now);
    },
  );
  // R24: existe en el doble justamente para poder afirmar que NADIE lo invoca.
  const stampAll = vi.fn(async () => 'ok' as const);
  const revocations: SessionRevocationRepository = { revokeSession, stampAll };

  const users: SessionUserReader = {
    findActiveById: async (id: string, sessionId: string): Promise<SessionUserRecord | null> => {
      if (id !== SUB) return null;
      return {
        id: SUB,
        username: 'ana.perez',
        firstNames: 'Ana Maria',
        lastNames: 'Perez Gomez',
        roleName: 'operador',
        companyId,
        companyDeletedAt: null,
        permissions: ['inventario.consultar'],
        accountStatus: 'active',
        lockedUntil: null,
        sessionsValidFrom: estado.sello,
        sessionRevokedAt: estado.cerradas.get(sessionId) ?? null,
      };
    },
  };

  return { estado, revokeSession, stampAll, revocations, users };
}

function crearDobles(claims: SessionClaims | null) {
  const readClaims = vi.fn(async () => claims);
  const session: SessionReader = { readClaims };
  const clear = vi.fn(async () => {});
  const cookie: SessionEraser = { clear };
  const log = vi.fn();
  const checkLog: SessionCheckLog = { log };

  return { readClaims, session, clear, cookie, log, checkLog };
}

describe('endSession — la firma y el caso «no hay sesion» (R21, R22)', () => {
  // R21: contrato congelado por QC-11. `logoutAction()` invoca `identity.endSession()` sin
  // argumentos, asi que el caso de uso tampoco puede pedir ninguno.
  it('no recibe ningun parametro', () => {
    const { revocations } = crearMundo();
    const { session, cookie, checkLog } = crearDobles(null);

    const endSession = createEndSession({ session, revocations, cookie, log: checkLog });

    expect(endSession).toHaveLength(0);
  });

  // Equivalente aqui del «test de permiso denegado ANTES de tocar el puerto» que piden T20 y
  // tasks.md: este caso de uso no tiene actor —cierra la sesion EN CURSO, no una elegida—, asi
  // que lo que se afirma es el otro camino que NO debe escribir nada: sin claims no hay `sid` que
  // registrar, y el doble del repositorio afirma CERO invocaciones.
  it('sin sesion legible no toca el repositorio, pero borra la cookie igual', async () => {
    const { revocations, revokeSession, stampAll } = crearMundo();
    const { session, cookie, clear, checkLog, log } = crearDobles(null);

    await createEndSession({ session, revocations, cookie, log: checkLog })();

    expect(revokeSession).not.toHaveBeenCalled();
    expect(stampAll).not.toHaveBeenCalled();
    expect(clear).toHaveBeenCalledTimes(1);
    // No hubo fallo: no hay nada que registrar.
    expect(log).not.toHaveBeenCalled();
  });
});

describe('endSession — el camino feliz (R20, R22)', () => {
  it('registra el cierre de ESE sid con la caducidad natural del token, y despues borra la cookie', async () => {
    const { revocations, revokeSession } = crearMundo();
    const claims = claimsDe(SID_MOVIL);
    const { session, cookie, clear, checkLog } = crearDobles(claims);

    await createEndSession({ session, revocations, cookie, log: checkLog, now: () => AHORA })();

    expect(revokeSession).toHaveBeenCalledTimes(1);
    expect(revokeSession).toHaveBeenCalledWith({
      sessionId: SID_MOVIL,
      userId: SUB,
      // La caducidad NATURAL del token cerrado (su `exp`): es lo que hace posible la purga de R39.
      expiresAt: claims.expiresAt,
      now: AHORA,
    });

    // El orden ES el requisito: primero se registra, despues se retira la cookie.
    const [ordenRevoke] = revokeSession.mock.invocationCallOrder;
    const [ordenClear] = clear.mock.invocationCallOrder;
    expect(ordenRevoke).toBeLessThan(ordenClear as number);
  });

  it('las demas sesiones vivas de esa misma persona siguen resolviendo (R20)', async () => {
    const mundo = crearMundo();
    const { session, cookie, checkLog } = crearDobles(claimsDe(SID_MOVIL));

    await createEndSession({
      session,
      revocations: mundo.revocations,
      cookie,
      log: checkLog,
      now: () => AHORA,
    })();

    // La cadena REAL, contra el MISMO estado que acaba de escribir el caso de uso.
    const resolveOficina = createResolveSession({
      session: { readClaims: async () => claimsDe(SID_OFICINA) },
      users: mundo.users,
      log: { log: vi.fn() },
    });
    const resolveMovil = createResolveSession({
      session: { readClaims: async () => claimsDe(SID_MOVIL) },
      users: mundo.users,
      log: { log: vi.fn() },
    });

    // Quien salio en el movil sigue dentro en la oficina.
    expect(await resolveOficina(AHORA)).not.toBeNull();
    // Y el movil, que es el que cerro, ya no resuelve: el corte 8 lo mata.
    expect(await resolveMovil(AHORA)).toBeNull();
  });

  it('NO sube el sello de esa persona (R24)', async () => {
    const mundo = crearMundo();
    const { session, cookie, checkLog } = crearDobles(claimsDe(SID_MOVIL));

    await createEndSession({
      session,
      revocations: mundo.revocations,
      cookie,
      log: checkLog,
      now: () => AHORA,
    })();

    expect(mundo.stampAll).not.toHaveBeenCalled();
    expect(mundo.estado.sello.getTime()).toBe(SELLO_VIEJO.getTime());
  });
});

describe('endSession — si el registro falla, el cierre NO se bloquea (R23)', () => {
  it('borra la cookie igual y deja la causa en el registro del servidor', async () => {
    const mundo = crearMundo();
    mundo.revokeSession.mockRejectedValueOnce(new Error('la base no responde'));
    const { session, cookie, clear, checkLog, log } = crearDobles(claimsDe(SID_MOVIL));

    // No lanza: fallar la operacion dejaria a la persona DENTRO, que es la salida mala.
    await expect(
      createEndSession({
        session,
        revocations: mundo.revocations,
        cookie,
        log: checkLog,
        now: () => AHORA,
      })(),
    ).resolves.toBeUndefined();

    expect(clear).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);

    // R23: la causa viaja. Y `design.md > 7`: el diagnostico NUNCA lleva el `sid` —material de
    // autenticacion— ni el `sub` ni PII.
    const [diagnostico] = log.mock.calls[0] as [string];
    expect(diagnostico).toContain('la base no responde');
    expect(diagnostico).not.toContain(SID_MOVIL);
    expect(diagnostico).not.toContain(SUB);
    expect(diagnostico).not.toContain('ana.perez');
  });

  it('borra la cookie igual si ni siquiera se pudieron leer los claims', async () => {
    const mundo = crearMundo();
    const readClaims = vi.fn(async (): Promise<SessionClaims | null> => {
      throw new Error('cookie ilegible');
    });
    const clear = vi.fn(async () => {});
    const log = vi.fn();

    await expect(
      createEndSession({
        session: { readClaims },
        revocations: mundo.revocations,
        cookie: { clear },
        log: { log },
      })(),
    ).resolves.toBeUndefined();

    expect(mundo.revokeSession).not.toHaveBeenCalled();
    expect(clear).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);
  });
});

describe('endSession — la sesion de quien no tiene empresa (QC-161)', () => {
  function claimsSinEmpresa(sessionId: string): SessionClaims {
    return { ...claimsDe(sessionId), roleName: 'Maestro', companyId: null };
  }

  it('QC-161 R35: con companyId null registra el cierre de ese sid, borra la cookie y la sesion deja de valer', async () => {
    const mundo = crearMundo(null);
    const claims = claimsSinEmpresa(SID_MOVIL);
    const { session, cookie, clear, checkLog, log } = crearDobles(claims);

    // Antes de cerrar, la sesion sin empresa resuelve: es una sesion de verdad.
    const resolveMovil = createResolveSession({
      session: { readClaims: async () => claims },
      users: mundo.users,
      log: { log: vi.fn() },
    });
    expect(await resolveMovil(AHORA)).not.toBeNull();

    await createEndSession({
      session,
      revocations: mundo.revocations,
      cookie,
      log: checkLog,
      now: () => AHORA,
    })();

    expect(mundo.revokeSession).toHaveBeenCalledTimes(1);
    expect(mundo.revokeSession).toHaveBeenCalledWith({
      sessionId: SID_MOVIL,
      userId: SUB,
      expiresAt: claims.expiresAt,
      now: AHORA,
    });
    expect(clear).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
    expect(mundo.stampAll).not.toHaveBeenCalled();
    // La sesion cerrada no vuelve a valer.
    expect(await resolveMovil(AHORA)).toBeNull();
  });
});
