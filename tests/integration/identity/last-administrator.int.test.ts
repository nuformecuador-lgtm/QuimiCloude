/**
 * QC-66 T17 — la carrera del ultimo administrador contra Postgres REAL (R22, R23, R24).
 *
 * Es el unico requisito de la feature que un doble NO puede demostrar: lo que se prueba aqui es
 * que `SELECT … FOR UPDATE` de `lockActiveAdministratorIds` serializa de verdad dos transacciones
 * que confirman, no que el adaptador «tiene un if».
 *
 * DOS CONEXIONES DE VERDAD, y esto es el nucleo del archivo (`design.md > 14`, `tasks.md > T17`).
 * Un `Promise.all` de dos llamadas sobre el MISMO `PrismaClient` puede serializarse en el pool y
 * dejar el test verde sin haber probado ninguna carrera. Asi que se instancian DOS `PrismaClient`
 * distintos —cada uno con su propio pool— y se importa DOS VECES el adaptador de produccion, cada
 * copia con `@/lib/shared/db/prisma` doblado a su cliente (`importAdapterBoundTo`). No se copia ni
 * se reescribe una linea de SQL: el codigo que corre es exactamente
 * `lib/modules/identity/adapters/driven/persistence/user-admin-prisma.ts`. Que las dos conexiones
 * sean reales y distintas no se da por supuesto: el primer caso lo demuestra con dos
 * `pg_backend_pid()` leidos desde dos transacciones que se SOLAPAN a proposito (si fueran la misma
 * conexion, la segunda no podria ni empezar) y comprobando que los dos modulos del adaptador son
 * instancias distintas.
 *
 * AQUI NO SE PUEDE USAR EL PATRON DE `$transaction` + ROLLBACK de `identity-seed.int.test.ts` ni de
 * `identity-constraints.int.test.ts`: la carrera necesita dos transacciones que CONFIRMEN. Asi que
 * el aislamiento es por construccion y limpieza propia: cada caso fabrica su PROPIA empresa con
 * nombre irrepetible y sus PROPIOS usuarios (correo, nombre de usuario y documento aleatorios), y la
 * borra al terminar en `finally`. La base queda exactamente como estaba.
 *
 * EL ORDEN DE LA LIMPIEZA NO ES LIBRE: `users_account_status_changed_by_fkey` es
 * `ON DELETE RESTRICT` (QC-65 R12), asi que antes de borrar las filas hay que vaciar la referencia
 * al autor del cambio de estado; despues los usuarios, y solo entonces la empresa
 * (`users_company_id_fkey`, tambien RESTRICT). Es el mismo orden que razona
 * `resetIdentityToEmptyState` en `identity-seed.int.test.ts`.
 *
 * LA BASE LOCAL NO ESTA VACIA: trae la instalacion del seed (dos roles, la empresa inicial y su
 * administrador). Este archivo NO afirma sobre el estado global de ninguna tabla —los de
 * integracion corren en serie pero no aislados entre archivos (`vitest.config.mts`,
 * `fileParallelism: false`)—: solo afirma sobre SUS propias filas. Los dos roles se REUTILIZAN, no
 * se crean: `Administrador` es el del conjunto que la guarda protege y `Operador` es el «otro rol
 * distinto del administrador» que R22 nombra.
 *
 * R24: el nombre del rol administrador que viaja en `adminRoleName` sale de `ROLE_ADMINISTRADOR`
 * IMPORTADO de `lib/modules/identity/domain/roles.ts`. Ni un literal escrito a mano — lo vigila
 * ademas `tests/guards/guard-rol-administrador-unico.test.ts`.
 *
 * NINGUNA CREDENCIAL REAL: `FAKE_CREDENTIAL_HASH` es un marcador evidentemente ficticio; esta
 * guarda no lee ni escribe credenciales.
 */
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { DOCUMENT_TYPE_CC, normalizeCompanyName } from '@/lib/modules/identity';
import { PERMISSIONS } from '@/lib/modules/identity/domain/permissions';
import { clearedLockState } from '@/lib/modules/identity/domain/effective-account-status';
import { ROLE_ADMINISTRADOR, ROLE_OPERADOR } from '@/lib/modules/identity/domain/roles';
import { prisma } from '@/lib/shared/db/prisma';

import type { UserAccountStatus } from '@/lib/modules/identity/domain/account-status';
import type { NewUser } from '@/lib/modules/identity/ports/user-admin-repository';

// ---------------------------------------------------------------------------
// Las dos conexiones de verdad
// ---------------------------------------------------------------------------

const ADAPTER_PATH = '@/lib/modules/identity/adapters/driven/persistence/user-admin-prisma';

type UserAdminAdapter = typeof import('@/lib/modules/identity/adapters/driven/persistence/user-admin-prisma');

/**
 * Devuelve una instancia NUEVA del adaptador de produccion cuyo `prisma` es `client`. El doble de
 * `@/lib/shared/db/prisma` es imprescindible: ese modulo cachea su unica instancia en `globalThis`,
 * asi que reimportarlo sin doblarlo devolveria siempre el mismo cliente y las dos «conexiones»
 * serian una.
 *
 * Se COMPRUEBA que el doble quedo en vigor antes de devolver el adaptador: si fallara en silencio,
 * el test de la carrera saldria verde sobre un solo pool, que es exactamente la forma de hacerlo mal
 * que `design.md > 14` advierte.
 */
async function importAdapterBoundTo(client: PrismaClient): Promise<UserAdminAdapter> {
  vi.resetModules();
  vi.doMock('@/lib/shared/db/prisma', () => ({ prisma: client }));
  const bound = await import('@/lib/shared/db/prisma');
  if (bound.prisma !== client) {
    throw new Error(
      'el doble de `@/lib/shared/db/prisma` no quedo en vigor: el adaptador no estaria atado a su ' +
        'propia conexion y la carrera no se probaria',
    );
  }
  return import(ADAPTER_PATH);
}

/** `pg_backend_pid()` de una transaccion interactiva, leido mientras `hold` sigue pendiente. */
async function backendPidWhileHolding(client: PrismaClient, arrive: () => Promise<void>): Promise<number> {
  return client.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<ReadonlyArray<{ pid: number }>>`SELECT pg_backend_pid()::int AS pid`;
      const pid = rows[0]?.pid;
      if (pid === undefined) throw new Error('pg_backend_pid() no devolvio ninguna fila');
      await arrive();
      return pid;
    },
    { maxWait: 10_000, timeout: 10_000 },
  );
}

/** Puerta que se abre cuando los `expected` participantes han llegado. */
function createBarrier(expected: number): () => Promise<void> {
  let pending = expected;
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return async () => {
    pending -= 1;
    if (pending === 0) open();
    await opened;
  };
}

// ---------------------------------------------------------------------------
// El escenario: empresa propia, administradores propios, limpieza propia
// ---------------------------------------------------------------------------

/** Marcador de prueba, evidentemente ficticio: ninguna operacion de esta guarda lee credenciales. */
const FAKE_CREDENTIAL_HASH = '$2b$10$marcador.de.prueba.qc66.t17.no.es.un.hash.real';

const ACTIVE: UserAccountStatus = 'active';

type Scenario = {
  readonly companyId: string;
  /** Administradores VIVOS y en `active` de la empresa, en el orden en que se crearon. */
  readonly adminIds: readonly string[];
  /**
   * Autor de los cambios de estado (R25): un `Operador` activo de la misma empresa, que NO pertenece
   * al conjunto que la guarda protege, asi que su existencia no cambia ninguna decision.
   */
  readonly actorId: string;
};

let administradorRoleId = '';
let operadorRoleId = '';

/** Las empresas que este archivo creo, para comprobar en `afterAll` que no quedo ninguna. */
const createdCompanyIds = new Set<string>();

async function createScenarioUser(
  companyId: string,
  roleId: string,
  lastNames: string,
): Promise<string> {
  const tag = randomUUID();
  const created = await prisma.user.create({
    data: {
      firstNames: 'QC66T17',
      lastNames,
      birthDate: new Date('1990-01-01T00:00:00.000Z'),
      email: `qc66.t17.${tag}@example.test`,
      phone: '000000000',
      documentTypeCode: DOCUMENT_TYPE_CC,
      documentNumber: tag.replaceAll('-', '').slice(0, 20),
      username: `qc66.t17.${tag}`,
      passwordHash: FAKE_CREDENTIAL_HASH,
      roleId,
      companyId,
      accountStatus: ACTIVE,
    },
    select: { id: true },
  });
  return created.id;
}

/** Empresa nueva con `administrators` administradores vivos en `active`, mas el actor. */
async function createScenario(administrators: number): Promise<Scenario> {
  const name = `QC66 T17 ${randomUUID()}`;
  const company = await prisma.company.create({
    data: { name, nameNormalized: normalizeCompanyName(name) },
    select: { id: true },
  });
  createdCompanyIds.add(company.id);

  const adminIds: string[] = [];
  for (let index = 0; index < administrators; index += 1) {
    adminIds.push(await createScenarioUser(company.id, administradorRoleId, `Admin${index + 1}`));
  }
  const actorId = await createScenarioUser(company.id, operadorRoleId, 'Actor');
  return { companyId: company.id, adminIds, actorId };
}

/** Borra el escenario en el unico orden que respetan las FK `RESTRICT` (ver cabecera). */
async function dropScenario(scenario: Scenario): Promise<void> {
  await prisma.user.updateMany({
    where: { companyId: scenario.companyId },
    data: { accountStatusChangedBy: null },
  });
  await prisma.user.deleteMany({ where: { companyId: scenario.companyId } });
  await prisma.company.delete({ where: { id: scenario.companyId } });
  createdCompanyIds.delete(scenario.companyId);
}

async function withScenario(
  administrators: number,
  body: (scenario: Scenario) => Promise<void>,
): Promise<void> {
  const scenario = await createScenario(administrators);
  try {
    await body(scenario);
  } finally {
    await dropScenario(scenario);
  }
}

/** Cuantos administradores VIVOS y en `active` le quedan a la empresa: leido de la base. */
async function countActiveAdministrators(companyId: string): Promise<number> {
  return prisma.user.count({
    where: { companyId, roleId: administradorRoleId, accountStatus: ACTIVE, deletedAt: null },
  });
}

/** Foto de la fila con todo lo que las tres operaciones guardadas podrian escribir. */
async function snapshotUser(id: string) {
  return prisma.user.findUniqueOrThrow({
    where: { id },
    select: {
      roleId: true,
      accountStatus: true,
      accountStatusChangedAt: true,
      accountStatusChangedBy: true,
      deletedAt: true,
      updatedAt: true,
      firstNames: true,
      lastNames: true,
      email: true,
      username: true,
    },
  });
}

/** Los nueve campos editables de la fila tal como estan hoy, con el `roleId` que se quiera pedir. */
async function editableDataOf(id: string, roleId: string): Promise<NewUser> {
  const row = await prisma.user.findUniqueOrThrow({
    where: { id },
    select: {
      firstNames: true,
      lastNames: true,
      birthDate: true,
      email: true,
      phone: true,
      documentTypeCode: true,
      documentNumber: true,
      username: true,
    },
  });
  return { ...row, roleId };
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

let clientA: PrismaClient;
let clientB: PrismaClient;
let adapterA: UserAdminAdapter;
let adapterB: UserAdminAdapter;

/** Los codigos de permiso que la migracion de T4 tiene que haber dejado en el catalogo. */
const USER_PERMISSION_CODES = PERMISSIONS.filter((entry) => entry.module === 'usuarios').map(
  (entry) => entry.code,
);

beforeAll(async () => {
  // La migracion de datos del catalogo (T4). Si falta, el mensaje dice QUE hacer.
  const presentes = await prisma.permission.findMany({
    where: { code: { in: [...USER_PERMISSION_CODES] } },
    select: { code: true },
  });
  if (presentes.length !== USER_PERMISSION_CODES.length) {
    const faltan = USER_PERMISSION_CODES.filter(
      (code) => !presentes.some((fila) => fila.code === code),
    );
    throw new Error(
      `falta la migracion del catalogo de permisos de QC-66 (T4): no estan en \`permissions\` ` +
        `${faltan.join(', ')}. Corre \`pnpm run db:migrate\` contra la base de esta feature antes ` +
        `de correr este archivo.`,
    );
  }

  const roles = await prisma.role.findMany({
    where: { name: { in: [ROLE_ADMINISTRADOR, ROLE_OPERADOR] } },
    select: { id: true, name: true },
  });
  const administrador = roles.find((role) => role.name === ROLE_ADMINISTRADOR);
  const operador = roles.find((role) => role.name === ROLE_OPERADOR);
  if (administrador === undefined || operador === undefined) {
    throw new Error(
      `faltan los roles base (${ROLE_ADMINISTRADOR} / ${ROLE_OPERADOR}) en la base: corre ` +
        '`pnpm run db:seed` antes de correr este archivo.',
    );
  }
  administradorRoleId = administrador.id;
  operadorRoleId = operador.id;

  clientA = new PrismaClient();
  clientB = new PrismaClient();
  adapterA = await importAdapterBoundTo(clientA);
  adapterB = await importAdapterBoundTo(clientB);
  vi.doUnmock('@/lib/shared/db/prisma');
});

afterAll(async () => {
  // Ninguna fila propia sobrevive: si algun `finally` no hubiera corrido, esto lo dice.
  expect([...createdCompanyIds]).toEqual([]);
  await clientA.$disconnect();
  await clientB.$disconnect();
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// R23 — la carrera
// ---------------------------------------------------------------------------

describe('QC-66 T17 — la guarda del ultimo administrador contra Postgres real', () => {
  it('R23 — las dos conexiones son reales y distintas: dos `pg_backend_pid()` solapados y dos instancias del adaptador', async () => {
    expect(clientA).not.toBe(clientB);
    // Dos instancias distintas del MISMO archivo de produccion, cada una con su cliente doblado.
    expect(adapterA).not.toBe(adapterB);
    expect(adapterA.applyGuardedChange).not.toBe(adapterB.applyGuardedChange);

    // Las dos transacciones se solapan a proposito: cada una lee su pid y espera a que la otra
    // llegue. Si las dos llamadas compartieran una sola conexion, la segunda no podria ni empezar
    // y esto se quedaria en el plazo en vez de comparar dos numeros.
    const arrive = createBarrier(2);
    const [pidA, pidB] = await Promise.all([
      backendPidWhileHolding(clientA, arrive),
      backendPidWhileHolding(clientB, arrive),
    ]);
    expect(pidA).not.toBe(pidB);
  });

  // Tres corridas seguidas: una carrera que pasa una vez de tres no esta cerrada (`tasks.md > T17`).
  it.each([1, 2, 3])(
    'R23 — corrida %i: dos conexiones apagando dos administradores distintos a la vez, al menos una falla con `last_administrator` y la empresa conserva >= 1 administrador en `active`',
    async () => {
      await withScenario(2, async (scenario) => {
        const [primero, segundo] = scenario.adminIds;
        expect(primero).toBeDefined();
        expect(segundo).toBeDefined();
        const now = new Date();

        const apagar = (adapter: UserAdminAdapter, id: string) =>
          adapter.applyGuardedChange({
            kind: 'account_status',
            companyId: scenario.companyId,
            id,
            adminRoleName: ROLE_ADMINISTRADOR,
            now,
            accountStatus: 'inactive',
            changedBy: scenario.actorId,
            lockState: clearedLockState(),
          });

        const resultados = await Promise.all([
          apagar(adapterA, primero as string),
          apagar(adapterB, segundo as string),
        ]);

        // Al menos una rechazada, y ninguna con un resultado que no sea uno de los dos posibles.
        expect(resultados).toContain('last_administrator');
        for (const resultado of resultados) {
          expect(['ok', 'last_administrator']).toContain(resultado);
        }
        // Y la propiedad que de verdad importa, leida de la base: la empresa no se quedo sin
        // administrador activo.
        expect(await countActiveAdministrators(scenario.companyId)).toBeGreaterThanOrEqual(1);
      });
    },
  );

  it('R23 (simetrico) — con TRES administradores activos, dos apagados simultaneos terminan LOS DOS en `ok` y queda uno activo', async () => {
    await withScenario(3, async (scenario) => {
      const [primero, segundo] = scenario.adminIds;
      const now = new Date();

      const apagar = (adapter: UserAdminAdapter, id: string) =>
        adapter.applyGuardedChange({
          kind: 'account_status',
          companyId: scenario.companyId,
          id,
          adminRoleName: ROLE_ADMINISTRADOR,
          now,
          accountStatus: 'inactive',
          changedBy: scenario.actorId,
          lockState: clearedLockState(),
        });

      const resultados = await Promise.all([
        apagar(adapterA, primero as string),
        apagar(adapterB, segundo as string),
      ]);

      // Sin este caso, un adaptador que rechazase SIEMPRE pasaria el caso de arriba.
      expect(resultados).toEqual(['ok', 'ok']);
      expect(await countActiveAdministrators(scenario.companyId)).toBe(1);
    });
  });
});

// ---------------------------------------------------------------------------
// R22 — el unico administrador activo, operacion por operacion
// ---------------------------------------------------------------------------

describe('R22 — el UNICO administrador activo de la empresa no puede dejar de serlo', () => {
  it.each<UserAccountStatus>(['pending', 'inactive', 'blocked'])(
    'mover su estado a `%s` responde `last_administrator` y NO escribe nada',
    async (destino) => {
      await withScenario(1, async (scenario) => {
        const [unico] = scenario.adminIds;
        const antes = await snapshotUser(unico as string);

        const resultado = await adapterA.applyGuardedChange({
          kind: 'account_status',
          companyId: scenario.companyId,
          id: unico as string,
          adminRoleName: ROLE_ADMINISTRADOR,
          now: new Date(),
          accountStatus: destino,
          changedBy: scenario.actorId,
          lockState: destino === 'blocked' ? null : clearedLockState(),
        });

        expect(resultado).toBe('last_administrator');
        expect(await snapshotUser(unico as string)).toEqual(antes);
        expect(await countActiveAdministrators(scenario.companyId)).toBe(1);
      });
    },
  );

  it('cambiarle el rol a otro distinto del administrador responde `last_administrator` y NO escribe nada', async () => {
    await withScenario(1, async (scenario) => {
      const [unico] = scenario.adminIds;
      const antes = await snapshotUser(unico as string);

      // El cambio de rol viaja por `updateAliveInCompany` (R19 es reemplazo completo).
      const resultado = await adapterA.updateAliveInCompany(
        scenario.companyId,
        unico as string,
        await editableDataOf(unico as string, operadorRoleId),
        new Date(),
      );

      expect(resultado).toBe('last_administrator');
      expect(await snapshotUser(unico as string)).toEqual(antes);
      expect(await countActiveAdministrators(scenario.companyId)).toBe(1);
    });
  });

  it('borrarlo responde `last_administrator` y NO escribe nada', async () => {
    await withScenario(1, async (scenario) => {
      const [unico] = scenario.adminIds;
      const antes = await snapshotUser(unico as string);

      const resultado = await adapterA.applyGuardedChange({
        kind: 'delete',
        companyId: scenario.companyId,
        id: unico as string,
        adminRoleName: ROLE_ADMINISTRADOR,
        now: new Date(),
      });

      expect(resultado).toBe('last_administrator');
      expect(await snapshotUser(unico as string)).toEqual(antes);
      expect(await countActiveAdministrators(scenario.companyId)).toBe(1);
    });
  });

  it('moverlo de `active` a `active` NO se rechaza: no lo saca del conjunto', async () => {
    await withScenario(1, async (scenario) => {
      const [unico] = scenario.adminIds;

      const resultado = await adapterA.applyGuardedChange({
        kind: 'account_status',
        companyId: scenario.companyId,
        id: unico as string,
        adminRoleName: ROLE_ADMINISTRADOR,
        now: new Date(),
        accountStatus: ACTIVE,
        changedBy: scenario.actorId,
        lockState: clearedLockState(),
      });

      expect(resultado).toBe('ok');
      expect(await countActiveAdministrators(scenario.companyId)).toBe(1);
    });
  });

  it('cambiarle el rol administrador se rechaza con `action_not_allowed` sin escribir nada', async () => {
    await withScenario(1, async (scenario) => {
      const [unico] = scenario.adminIds;
      const antes = await snapshotUser(unico as string);

      const resultado = await adapterA.updateAliveInCompany(
        scenario.companyId,
        unico as string,
        await editableDataOf(unico as string, administradorRoleId),
        new Date(),
      );

      // Fix directo (2026-09-22): el rol administrador ya no se concede por la edicion, ni siquiera
      // a quien ya lo es. El corte ocurre ANTES de la guardia de R22 y antes de escribir nada.
      expect(resultado).toBe('action_not_allowed');
      expect(await snapshotUser(unico as string)).toEqual(antes);
      expect(await countActiveAdministrators(scenario.companyId)).toBe(1);
    });
  });
});

describe('R22 (simetrico) — con DOS administradores activos las tres operaciones pasan', () => {
  it('mover el estado de uno a `inactive` termina en `ok`', async () => {
    await withScenario(2, async (scenario) => {
      const [primero] = scenario.adminIds;

      const resultado = await adapterA.applyGuardedChange({
        kind: 'account_status',
        companyId: scenario.companyId,
        id: primero as string,
        adminRoleName: ROLE_ADMINISTRADOR,
        now: new Date(),
        accountStatus: 'inactive',
        changedBy: scenario.actorId,
        lockState: clearedLockState(),
      });

      expect(resultado).toBe('ok');
      expect(await countActiveAdministrators(scenario.companyId)).toBe(1);
    });
  });

  it('cambiarle el rol a uno de ellos termina en `ok`', async () => {
    await withScenario(2, async (scenario) => {
      const [primero] = scenario.adminIds;

      const resultado = await adapterA.updateAliveInCompany(
        scenario.companyId,
        primero as string,
        await editableDataOf(primero as string, operadorRoleId),
        new Date(),
      );

      expect(resultado).toBe('ok');
      expect(await countActiveAdministrators(scenario.companyId)).toBe(1);
    });
  });

  it('borrar a uno de ellos termina en `ok`', async () => {
    await withScenario(2, async (scenario) => {
      const [primero] = scenario.adminIds;

      const resultado = await adapterA.applyGuardedChange({
        kind: 'delete',
        companyId: scenario.companyId,
        id: primero as string,
        adminRoleName: ROLE_ADMINISTRADOR,
        now: new Date(),
      });

      expect(resultado).toBe('ok');
      expect(await countActiveAdministrators(scenario.companyId)).toBe(1);
    });
  });
});

describe('R24 — el nombre del rol administrador sale de la constante, no de un literal', () => {
  it('`ROLE_ADMINISTRADOR` importado es el nombre del rol que existe en la base y es el que viaja en `adminRoleName`', async () => {
    const role = await prisma.role.findUniqueOrThrow({
      where: { id: administradorRoleId },
      select: { name: true },
    });
    // Si alguien escribiera el nombre a mano en los casos de arriba, este archivo seguiria verde;
    // lo que lo hace comprobable es que `adminRoleName` es SIEMPRE esta constante y que la
    // constante es el nombre real del rol cuyo conjunto protege la guarda.
    expect(role.name).toBe(ROLE_ADMINISTRADOR);
  });
});
