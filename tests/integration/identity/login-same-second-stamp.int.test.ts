/**
 * QC-116 — el login en el mismo segundo que el sello de sesiones, de extremo a extremo contra
 * Postgres real: login real (`findActiveByUsername`, bcrypt, reloj inyectado) → firma y
 * verificacion reales de la cookie → resolucion real con `findActiveSessionUserById`.
 *
 * Todos los instantes son FIJOS y se pasan por parametro: ni `sleep` ni temporizadores falsos. El
 * sello se escribe por los dos caminos que existen: truncado al segundo por la aplicacion
 * (`stampAll`) y con fraccion de segundo por el `DEFAULT now()` de la base (alta).
 *
 * Fixture propio (rol, empresa y usuarios con sufijo aleatorio), limpiado por id en `afterAll`,
 * con el mismo patron que `login.int.test.ts`.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createVerifyCredentials,
  DOCUMENT_TYPE_CC,
  normalizeCompanyName,
  type SessionTicket,
} from '@/lib/modules/identity';
import { stampAll } from '@/lib/modules/identity/adapters/driven/persistence/session-revocation-prisma';
import { findActiveSessionUserById } from '@/lib/modules/identity/adapters/driven/persistence/session-user-prisma';
import {
  compareAndSetLoginAttempt,
  findActiveByUsername,
  setLoginAttempt,
} from '@/lib/modules/identity/adapters/driven/persistence/user-credentials-prisma';
import {
  createPasswordHash,
  verifyPasswordHash,
} from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { sessionIdCrypto } from '@/lib/modules/identity/adapters/driven/session/session-id-crypto';
import {
  buildSessionValue,
  SESSION_VALUE_VERSION,
  verifySessionValue,
} from '@/lib/modules/identity/adapters/driven/session/session-token';
import { createResolveSession } from '@/lib/modules/identity/domain/resolve-session';
import { createSessionTicket } from '@/lib/modules/identity/domain/session';
import { floorToSecond } from '@/lib/modules/identity/domain/session-revocation';
import { prisma } from '@/lib/shared/db/prisma';

const SECRETO_DE_PRUEBAS = 'secreto-de-integracion-de-64-caracteres-para-firmar-sesion-qc116';
const TIEMPO_HOLGADO = { timeout: 30_000 };
const CLAVE_CORRECTA = 'clave-de-prueba-QC116-#2026';

/** El segundo del sello truncado. Fijo: la prueba no depende del reloj de la maquina. */
const T = new Date('2026-10-10T10:00:00.000Z');
const ms = (base: Date, delta: number): Date => new Date(base.getTime() + delta);

const sufijo = randomUUID();
const nombreDeUsuario = `qc116_login_${sufijo}`;
const nombreDeUsuarioDelAlta = `qc116_alta_${sufijo}`;
const nombreDeEmpresa = `qc116-login-${sufijo}`;

let rolId = '';
let empresaId = '';
let usuarioId = '';
let usuarioDelAltaId = '';
let rolEnLaBase = '';

function datosDeUsuario(username: string, documento: string, passwordHash: string) {
  return {
    firstNames: 'Ana Maria',
    lastNames: 'Perez Gomez',
    birthDate: new Date('1990-05-17T00:00:00.000Z'),
    email: `${username}@example.test`,
    phone: '+57 300 111 2233',
    documentTypeCode: DOCUMENT_TYPE_CC,
    documentNumber: documento,
    username,
    passwordHash,
    roleId: rolId,
    companyId: empresaId,
    accountStatus: 'active' as const,
  };
}

/** Login real con el reloj fijado en `ahora`; devuelve el ticket que emitio. */
async function entrar(username: string, ahora: Date): Promise<SessionTicket> {
  const tickets: SessionTicket[] = [];
  const verificar = createVerifyCredentials({
    users: { findActiveByUsername },
    attempts: { compareAndSet: compareAndSetLoginAttempt, set: setLoginAttempt },
    hasher: { hash: createPasswordHash, verify: verifyPasswordHash },
    session: {
      startSession(ticket: SessionTicket): Promise<void> {
        tickets.push(ticket);
        return Promise.resolve();
      },
    },
    ids: sessionIdCrypto,
    now: () => ahora,
  });

  expect(await verificar({ username, password: CLAVE_CORRECTA })).toEqual({ ok: true });
  expect(tickets).toHaveLength(1);
  return tickets[0] as SessionTicket;
}

/** Firma el ticket como lo haria la cookie y resuelve la sesion en `ahora` contra la base. */
async function resolver(ticket: SessionTicket, ahora: Date) {
  const valor = await buildSessionValue(ticket, SECRETO_DE_PRUEBAS);
  const claims = await verifySessionValue(valor, SECRETO_DE_PRUEBAS);
  expect(claims).not.toBeNull();

  const resolveSession = createResolveSession({
    session: { readClaims: async () => claims },
    users: { findActiveById: findActiveSessionUserById },
    log: { log: () => undefined },
  });
  return { valor, resuelta: await resolveSession(ahora) };
}

async function sellarEn(validFrom: Date): Promise<void> {
  expect(await stampAll({ userId: usuarioId, companyId: empresaId, validFrom })).toBe('ok');
}

beforeAll(async () => {
  const rol = await prisma.role.create({
    data: { name: `qc116-login-${sufijo}`, description: 'Rol de prueba de QC-116' },
    select: { id: true, name: true },
  });
  rolId = rol.id;
  rolEnLaBase = rol.name;

  const empresa = await prisma.company.create({
    data: { name: nombreDeEmpresa, nameNormalized: normalizeCompanyName(nombreDeEmpresa) },
    select: { id: true },
  });
  empresaId = empresa.id;

  const hash = await createPasswordHash(CLAVE_CORRECTA);
  const documento = sufijo.replaceAll('-', '').slice(0, 18);

  usuarioId = (
    await prisma.user.create({
      data: datosDeUsuario(nombreDeUsuario, `11${documento}`, hash),
      select: { id: true },
    })
  ).id;

  // Sin `sessionsValidFrom` explicito: el sello lo pone el `DEFAULT now()` de la base, con
  // fraccion de segundo, como en un alta.
  usuarioDelAltaId = (
    await prisma.user.create({
      data: datosDeUsuario(nombreDeUsuarioDelAlta, `22${documento}`, hash),
      select: { id: true },
    })
  ).id;
}, 30_000);

afterAll(async () => {
  try {
    await prisma.revokedSession.deleteMany({
      where: { userId: { in: [usuarioId, usuarioDelAltaId] } },
    });
    await prisma.user.deleteMany({ where: { id: { in: [usuarioId, usuarioDelAltaId] } } });
  } finally {
    await prisma.role.deleteMany({ where: { id: rolId } });
    await prisma.company.deleteMany({ where: { id: empresaId } });
  }
});

describe('login en el mismo segundo que el sello, contra Postgres real', () => {
  it('R2: sello truncado por la aplicacion y login 16 ms despues → la primera resolucion devuelve a la persona', TIEMPO_HOLGADO, async () => {
    await sellarEn(T);

    const ticket = await entrar(nombreDeUsuario, ms(T, 16));
    expect(ticket.issuedAt.toISOString()).toBe('2026-10-10T10:00:01.000Z');

    const { resuelta } = await resolver(ticket, ms(T, 20));
    expect(resuelta?.user.id).toBe(usuarioId);
    expect(resuelta?.user.roleName).toBe(rolEnLaBase);
  });

  it('R2: sello con fraccion de segundo puesto por la base en el alta → la primera resolucion devuelve a la persona', TIEMPO_HOLGADO, async () => {
    const { sessionsValidFrom: sello } = await prisma.user.findUniqueOrThrow({
      where: { id: usuarioDelAltaId },
      select: { sessionsValidFrom: true },
    });
    // 16 ms despues del sello, sin salir de su segundo aunque el sello caiga al final de el.
    const ahora = new Date(Math.min(sello.getTime() + 16, floorToSecond(sello).getTime() + 999));

    const ticket = await entrar(nombreDeUsuarioDelAlta, ahora);
    expect(ticket.issuedAt.getTime()).toBe(floorToSecond(sello).getTime() + 1000);

    const { resuelta } = await resolver(ticket, ms(ahora, 4));
    expect(resuelta?.user.id).toBe(usuarioDelAltaId);
  });

  it('R9: una sesion emitida en el segundo del sello SIN adelanto sigue sin resolver', TIEMPO_HOLGADO, async () => {
    await sellarEn(T);

    const sinAdelanto = createSessionTicket(
      usuarioId,
      rolEnLaBase,
      empresaId,
      sessionIdCrypto.newSessionId(),
      ms(T, 16),
    );

    const { resuelta } = await resolver(sinAdelanto, ms(T, 20));
    expect(resuelta).toBeNull();
  });

  it('R10: sello previo de hace un minuto, login sin adelanto y sello nuevo en su segundo → no resuelve', TIEMPO_HOLGADO, async () => {
    await sellarEn(ms(T, -60_000));

    const ticket = await entrar(nombreDeUsuario, ms(T, 16));
    expect(ticket.issuedAt.getTime()).toBe(ms(T, 16).getTime());

    await sellarEn(T);
    const { resuelta } = await resolver(ticket, ms(T, 20));
    expect(resuelta).toBeNull();
  });

  it('R10: login adelantado por un sello de otro segundo y sello nuevo en el segundo emitido → no resuelve', TIEMPO_HOLGADO, async () => {
    await sellarEn(ms(T, -1_000));

    const ticket = await entrar(nombreDeUsuario, ms(T, -984));
    expect(ticket.issuedAt.getTime()).toBe(T.getTime());

    await sellarEn(T);
    const { resuelta } = await resolver(ticket, ms(T, 20));
    expect(resuelta).toBeNull();
  });

  it('R12: la cookie de una sesion adelantada sigue siendo de la version vigente', TIEMPO_HOLGADO, async () => {
    await sellarEn(T);

    const ticket = await entrar(nombreDeUsuario, ms(T, 16));
    const { valor } = await resolver(ticket, ms(T, 20));

    expect(SESSION_VALUE_VERSION).toBe('v4');
    expect(valor.startsWith('v4.')).toBe(true);
  });
});
