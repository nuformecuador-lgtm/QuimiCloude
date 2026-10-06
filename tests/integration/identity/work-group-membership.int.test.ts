/**
 * QC-84 T15 — las PERTENENCIAS de un grupo de trabajo contra Postgres REAL (R19, R20, R21, R28,
 * R29, R30, R31, R32, R34, R35, R36, R51, R52, R53).
 *
 * QUE SE EJERCITA: los casos de uso ya cableados —`identity.addWorkGroupMember`,
 * `removeWorkGroupMember`, `listWorkGroupMembers`— con un ACTOR de verdad, contra la base. Es el
 * unico sitio donde se pueden contestar las tres preguntas que un doble no contesta: que la fila
 * de pertenencia SOLO se crea para quien tiene estado efectivo activo (R28, enmienda 2026-10-05),
 * que la de mas NO PUEDE existir
 * aunque dos intentos corran a la vez (R32), y que sacar BORRA la fila de verdad (R34).
 *
 * AISLAMIENTO: CONSTRUCCION PROPIA + LIMPIEZA PROPIA, igual que `work-group-crud.int.test.ts` y
 * por el mismo motivo: el adaptador de produccion habla con el cliente Prisma GLOBAL, asi que
 * envolver los casos en una `$transaction` del test seria un aislamiento de mentira —correrian
 * en otra conexion del pool— y ademas bloquearia a los tres metodos que abren su propia
 * transaccion. Cada caso fabrica su empresa efimera (`randomUUID`) y la borra en un `finally`,
 * asi que el archivo es REPETIBLE: correrlo tres veces seguidas da el mismo verde.
 *
 * EL RELOJ ENTRA POR PARAMETRO, Y ES LO QUE HACE COMPROBABLE R21 — «la cuenta bloqueada vuelve
 * sola al vencer el plazo» se demuestra llamando DOS VECES a la misma consulta con el MISMO dato
 * en la base y solo moviendo el `now`. Si hiciera falta un `UPDATE` para que la persona
 * reapareciera, el requisito estaria mal implementado; por eso el caso afirma ademas que ni la
 * fila de la persona ni la de la pertenencia cambiaron entre las dos lecturas (R23).
 *
 * LOS CUATRO ESTADOS DE CUENTA — `pending`, `active`, `inactive` y `blocked` se siembran
 * DIRECTAMENTE con Prisma y no por el alta de QC-66, que nace siempre `pending`: sembrar el
 * escenario a mano es lo que hace que estos casos no dependan de ningun otro flujo. El
 * `blocked` se escribe en sus DOS formas, que son dos casos distintos: el administrativo
 * (`locked_until` nulo, no vuelve solo) y el de la politica de intentos (`locked_until` con
 * plazo, que vence).
 *
 * LOS ERRORES: se afirma sobre el `code` ESTABLE del catalogo unico de QC-70, nunca sobre el
 * texto —ni el de la aplicacion ni el de Postgres, que en esta maquina responde en espanol—.
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { identity } from '@/lib/composition';
import { DOCUMENT_TYPE_CC, normalizeCompanyName, ROLE_OPERADOR } from '@/lib/modules/identity';
import { prisma } from '@/lib/shared/db/prisma';

import type { UserAccountStatus } from '@/lib/modules/identity/domain/account-status';
import type { Actor } from '@/lib/modules/identity/domain/actor';

// ---------------------------------------------------------------------------
// Escenario: empresas propias, personas propias, limpieza propia
// ---------------------------------------------------------------------------

/** Marcador de prueba, evidentemente ficticio: ninguna operacion de aqui lee credenciales. */
const FAKE_CREDENTIAL_HASH = '$2b$10$marcador.de.prueba.qc84.t15.no.es.un.hash.real';

/** Rol del que cuelgan las personas. Se REUTILIZA el del seed, no se crea ninguno. */
let operadorRoleId = '';

const createdCompanyIds = new Set<string>();

async function createCompany(): Promise<string> {
  const name = `QC84 T15 ${randomUUID()}`;
  const company = await prisma.company.create({
    data: { name, nameNormalized: normalizeCompanyName(name) },
    select: { id: true },
  });
  createdCompanyIds.add(company.id);
  return company.id;
}

/** Mismo orden de limpieza que `work-group-crud.int.test.ts`: es el unico que respetan las FK. */
async function dropCompany(companyId: string): Promise<void> {
  await prisma.workGroupMember.deleteMany({ where: { companyId } });
  await prisma.workGroup.deleteMany({ where: { companyId } });
  await prisma.user.updateMany({ where: { companyId }, data: { accountStatusChangedBy: null } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
  createdCompanyIds.delete(companyId);
}

async function withCompany(body: (companyId: string) => Promise<void>): Promise<void> {
  const companyId = await createCompany();
  try {
    await body(companyId);
  } finally {
    await dropCompany(companyId);
  }
}

/** DOS empresas propias: es lo que hace comprobable la mitad ajena de R29. */
async function withTwoCompanies(
  body: (companyA: string, companyB: string) => Promise<void>,
): Promise<void> {
  const companyA = await createCompany();
  const companyB = await createCompany();
  try {
    await body(companyA, companyB);
  } finally {
    await dropCompany(companyB);
    await dropCompany(companyA);
  }
}

/**
 * Actor con los DOS permisos. La autorizacion tiene su archivo unitario y aqui no se remide: lo
 * que importa es que la EMPRESA sale del actor y ninguna firma acepta otra (R8).
 */
function actorOf(companyId: string): Actor {
  return {
    id: randomUUID(),
    companyId,
    permissions: ['usuarios.consultar', 'usuarios.modificar'],
  };
}

/** La consulta generica de QC-57 con lo minimo. Los defectos los pone el propio esquema. */
function listInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { page: 1, sort: null, filters: {}, search: '', ...overrides };
}

/**
 * Una persona de esa empresa con el estado de cuenta y el plazo que pida el caso. Se siembra con
 * Prisma y no por el alta de QC-66 porque aquella nace siempre `pending` y no elige los nombres:
 * `lastNames` y `firstNames` son justamente lo que ordena la lista de miembros (R22).
 */
async function seedUser(
  companyId: string,
  fields: Partial<{
    firstNames: string;
    lastNames: string;
    accountStatus: UserAccountStatus;
    lockedUntil: Date | null;
    deletedAt: Date | null;
  }> = {},
): Promise<string> {
  const tag = randomUUID();
  const created = await prisma.user.create({
    data: {
      firstNames: fields.firstNames ?? 'Ana',
      lastNames: fields.lastNames ?? `Apellido${tag.slice(0, 8)}`,
      birthDate: new Date('1990-01-01T00:00:00.000Z'),
      email: `qc84.t15.${tag}@example.test`,
      phone: '000000000',
      documentTypeCode: DOCUMENT_TYPE_CC,
      documentNumber: tag.replaceAll('-', '').slice(0, 20),
      username: `qc84.t15.${tag}`,
      passwordHash: FAKE_CREDENTIAL_HASH,
      roleId: operadorRoleId,
      companyId,
      accountStatus: fields.accountStatus ?? 'active',
      lockedUntil: fields.lockedUntil ?? null,
      deletedAt: fields.deletedAt ?? null,
    },
    select: { id: true },
  });
  return created.id;
}

/** El `code` del error que lanzo la operacion, o el fallo del test si no lanzo ninguno. */
async function codeOfRejection(operation: Promise<unknown>): Promise<string> {
  try {
    await operation;
  } catch (error) {
    const code: unknown = (error as { code?: unknown }).code;
    if (typeof code !== 'string') throw error;
    return code;
  }
  throw new Error('se esperaba que la operacion fuera rechazada, y termino bien');
}

/** Las pertenencias de un grupo, tal cual estan en la tabla. Es lo que mide R34 y R38. */
async function membershipsOf(workGroupId: string): Promise<ReadonlyArray<{ userId: string }>> {
  return prisma.workGroupMember.findMany({
    where: { workGroupId },
    select: { userId: true },
    orderBy: { userId: 'asc' },
  });
}

/** La fila CRUDA de la persona: es donde se ve que una lectura no escribio nada (R23). */
type RawUserRow = {
  readonly id: string;
  readonly account_status: string;
  readonly locked_until: Date | null;
  readonly deleted_at: Date | null;
  readonly updated_at: Date;
};

async function rawUser(id: string): Promise<RawUserRow> {
  const rows = await prisma.$queryRaw<ReadonlyArray<RawUserRow>>(Prisma.sql`
    SELECT "id"::text AS "id", "account_status"::text AS "account_status",
           "locked_until", "deleted_at", "updated_at"
    FROM "users" WHERE "id" = ${id}::uuid
  `);
  const row = rows[0];
  if (row === undefined) throw new Error(`no existe ninguna fila de \`users\` con id ${id}`);
  return row;
}

/**
 * Mete a una persona SEA CUAL SEA su estado, para preparar escenarios de lectura. Desde la enmienda
 * de R28 (2026-10-05) solo entra quien esta efectivamente activa, asi que se la activa un momento,
 * se la mete por el caso de uso real y se le devuelve su estado y su plazo originales.
 */
async function meter(actor: Actor, workGroupId: string, userId: string): Promise<void> {
  const original = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { accountStatus: true, lockedUntil: true },
  });
  await prisma.user.update({
    where: { id: userId },
    data: { accountStatus: 'active', lockedUntil: null },
  });
  await identity.addWorkGroupMember(actor, { workGroupId, userId });
  await prisma.user.update({ where: { id: userId }, data: original });
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

beforeAll(async () => {
  const tablas = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename IN ('work_groups', 'work_group_members')`;
  if (tablas.length !== 2) {
    throw new Error(
      'la base de pruebas no tiene aplicada la migracion de grupos de trabajo (QC-83): faltan ' +
        '`work_groups` y/o `work_group_members`. Corre `pnpm exec prisma migrate deploy` y ' +
        '`pnpm exec prisma generate` contra la base de ESTA feature antes de estos tests.',
    );
  }

  const operador = await prisma.role.findFirst({
    where: { name: ROLE_OPERADOR },
    select: { id: true },
  });
  if (operador === null) {
    throw new Error(
      `falta el rol base \`${ROLE_OPERADOR}\` en la base: corre \`pnpm run db:seed\` contra la ` +
        'base de esta feature antes de correr este archivo.',
    );
  }
  operadorRoleId = operador.id;
});

afterAll(async () => {
  expect([...createdCompanyIds]).toEqual([]);
});

// ---------------------------------------------------------------------------
// R28 (enmienda 2026-10-05) — solo entra quien tiene estado EFECTIVO activo
// ---------------------------------------------------------------------------

describe('R28 (enmienda 2026-10-05) — solo se puede meter a una persona con estado EFECTIVO activo', () => {
  it('pendiente, inactiva, bloqueada sin plazo, bloqueada con plazo vigente y `active` con plazo vigente se rechazan con `work_group_member_not_active` y no dejan fila', async () => {
    await withCompany(async (companyId) => {
      const actor = actorOf(companyId);
      const { id: grupo } = await identity.createWorkGroup(actor, { name: 'Turno noche' });
      const vigente = new Date(Date.now() + 3_600_000);

      const rechazadas = [
        await seedUser(companyId, { accountStatus: 'pending' }),
        await seedUser(companyId, { accountStatus: 'inactive' }),
        await seedUser(companyId, { accountStatus: 'blocked', lockedUntil: null }),
        await seedUser(companyId, { accountStatus: 'blocked', lockedUntil: vigente }),
        // Bloqueo por intentos: la columna dice `active` y lo que manda es el plazo (QC-78 R11).
        await seedUser(companyId, { accountStatus: 'active', lockedUntil: vigente }),
      ];

      for (const userId of rechazadas) {
        expect(
          await codeOfRejection(
            identity.addWorkGroupMember(actor, { workGroupId: grupo, userId }),
          ),
        ).toBe('work_group_member_not_active');
      }

      expect(await membershipsOf(grupo)).toEqual([]);
    });
  });

  it('la `active` y la `blocked` con el plazo YA VENCIDO entran y dejan su fila', async () => {
    await withCompany(async (companyId) => {
      const actor = actorOf(companyId);
      const { id: grupo } = await identity.createWorkGroup(actor, { name: 'Turno noche' });
      const activa = await seedUser(companyId, { accountStatus: 'active' });
      const vencida = await seedUser(companyId, {
        accountStatus: 'blocked',
        lockedUntil: new Date(Date.now() - 60_000),
      });

      for (const userId of [activa, vencida]) {
        await identity.addWorkGroupMember(actor, { workGroupId: grupo, userId });
      }

      expect((await membershipsOf(grupo)).map((fila) => fila.userId).sort()).toEqual(
        [activa, vencida].sort(),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// R19 + R20 + R21 — la lista de miembros ensena SOLO a las efectivamente `active`
// ---------------------------------------------------------------------------

describe('R19 + R20 — con las cuatro cuentas dentro, la lista devuelve SOLO la `active`', () => {
  it('`pending`, `inactive` y `blocked` no salen, y de la que sale vienen `id` y `displayName` y nada mas', async () => {
    await withCompany(async (companyId) => {
      const actor = actorOf(companyId);
      const { id: grupo } = await identity.createWorkGroup(actor, { name: 'Turno noche' });
      const pendiente = await seedUser(companyId, { accountStatus: 'pending' });
      const activa = await seedUser(companyId, { accountStatus: 'active', firstNames: 'Beatriz' });
      const inactiva = await seedUser(companyId, { accountStatus: 'inactive' });
      const bloqueada = await seedUser(companyId, { accountStatus: 'blocked' });
      for (const userId of [pendiente, activa, inactiva, bloqueada]) {
        await meter(actor, grupo, userId);
      }

      const pagina = await identity.listWorkGroupMembers(
        actor,
        grupo,
        listInput({ pageSize: 25 }),
        new Date(),
      );

      expect(pagina.items.map((fila) => fila.id)).toEqual([activa]);
      expect(pagina.total).toBe(1);
      expect(Object.keys(pagina.items[0] ?? {}).sort()).toEqual(['displayName', 'id']);
      expect(pagina.items[0]?.displayName).toContain('Beatriz');
      // Y las CUATRO filas de pertenencia siguen ahi: el filtro de R19 es de LECTURA (R23).
      expect(await membershipsOf(grupo)).toHaveLength(4);
    });
  });

  it('R20 — la persona `pending` reaparece en TODOS sus grupos en cuanto su cuenta pasa a `active`, sin ninguna escritura sobre la pertenencia', async () => {
    await withCompany(async (companyId) => {
      const actor = actorOf(companyId);
      const uno = await identity.createWorkGroup(actor, { name: 'Turno noche' });
      const dos = await identity.createWorkGroup(actor, { name: 'Turno tarde' });
      const userId = await seedUser(companyId, { accountStatus: 'pending' });
      await meter(actor, uno.id, userId);
      await meter(actor, dos.id, userId);
      const pertenenciasAntes = await prisma.workGroupMember.findMany({ where: { userId } });

      const ahora = new Date();
      expect(
        (await identity.listWorkGroupMembers(actor, uno.id, listInput(), ahora)).total,
      ).toBe(0);

      // Lo unico que cambia es la CUENTA. Nadie toca la pertenencia.
      await prisma.user.update({ where: { id: userId }, data: { accountStatus: 'active' } });

      for (const grupo of [uno, dos]) {
        const pagina = await identity.listWorkGroupMembers(actor, grupo.id, listInput(), ahora);
        expect(pagina.items.map((fila) => fila.id)).toEqual([userId]);
        expect(pagina.total).toBe(1);
      }
      expect(await prisma.workGroupMember.findMany({ where: { userId } })).toEqual(
        pertenenciasAntes,
      );
    });
  });

  it('R21 — la cuenta bloqueada por la politica de intentos VUELVE SOLA al vencer el plazo: lo unico que se mueve es el `now`, y ninguna fila cambia', async () => {
    await withCompany(async (companyId) => {
      const actor = actorOf(companyId);
      const { id: grupo } = await identity.createWorkGroup(actor, { name: 'Turno noche' });
      const plazo = new Date('2026-09-11T12:00:00.000Z');
      const userId = await seedUser(companyId, {
        accountStatus: 'blocked',
        lockedUntil: plazo,
      });
      await meter(actor, grupo, userId);
      const personaAntes = await rawUser(userId);
      const pertenenciaAntes = await membershipsOf(grupo);

      const durante = await identity.listWorkGroupMembers(
        actor,
        grupo,
        listInput(),
        new Date(plazo.getTime() - 60_000),
      );
      const despues = await identity.listWorkGroupMembers(
        actor,
        grupo,
        listInput(),
        new Date(plazo.getTime() + 60_000),
      );

      expect(durante.items).toEqual([]);
      expect(durante.total).toBe(0);
      expect(despues.items.map((fila) => fila.id)).toEqual([userId]);
      expect(despues.total).toBe(1);
      // Sin NINGUNA escritura: ni sobre la persona ni sobre la pertenencia (R21, R23).
      expect(await rawUser(userId)).toEqual(personaAntes);
      expect(await membershipsOf(grupo)).toEqual(pertenenciaAntes);
    });
  });

  it('R21 — la bloqueada ADMINISTRATIVAMENTE (sin plazo) no vuelve por mucho que avance el reloj', async () => {
    await withCompany(async (companyId) => {
      const actor = actorOf(companyId);
      const { id: grupo } = await identity.createWorkGroup(actor, { name: 'Turno noche' });
      const userId = await seedUser(companyId, { accountStatus: 'blocked', lockedUntil: null });
      await meter(actor, grupo, userId);

      const dentroDeUnAno = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      const pagina = await identity.listWorkGroupMembers(actor, grupo, listInput(), dentroDeUnAno);

      expect(pagina.items).toEqual([]);
      expect(pagina.total).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// R29 — la persona inexistente, borrada o de otra empresa: el MISMO caso
// ---------------------------------------------------------------------------

describe('R29 — la persona de OTRA empresa y la persona dada de baja son «no encontrada»', () => {
  it('las tres formas de no existir responden `user_not_found` y no crean ninguna fila', async () => {
    await withTwoCompanies(async (companyA, companyB) => {
      const actor = actorOf(companyA);
      const { id: grupo } = await identity.createWorkGroup(actor, { name: 'Turno noche' });
      const ajena = await seedUser(companyB);
      const borrada = await seedUser(companyA, { deletedAt: new Date() });

      for (const userId of [randomUUID(), ajena, borrada]) {
        expect(
          await codeOfRejection(
            identity.addWorkGroupMember(actor, { workGroupId: grupo, userId }),
          ),
        ).toBe('user_not_found');
      }

      expect(await membershipsOf(grupo)).toEqual([]);
      // Y no se revelo nada de la ajena: sigue viva en su empresa, intacta.
      expect((await rawUser(ajena)).deleted_at).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// R30 + R31 — los CUATRO caminos del duplicado de pertenencia, contra datos reales
// ---------------------------------------------------------------------------

describe('R30 + R31 — meter a quien ya pertenece: un `code` por motivo, y ninguno repite', () => {
  it('la que SE VE da `work_group_member_exists`; las tres que el filtro oculta dan su propio `code`', async () => {
    await withCompany(async (companyId) => {
      const actor = actorOf(companyId);
      const { id: grupo } = await identity.createWorkGroup(actor, { name: 'Turno noche' });
      const casos: ReadonlyArray<{ estado: UserAccountStatus; code: string }> = [
        { estado: 'active', code: 'work_group_member_exists' },
        { estado: 'pending', code: 'work_group_member_exists_pending' },
        { estado: 'inactive', code: 'work_group_member_exists_inactive' },
        { estado: 'blocked', code: 'work_group_member_exists_blocked' },
      ];

      const obtenidos: string[] = [];
      for (const caso of casos) {
        const userId = await seedUser(companyId, { accountStatus: caso.estado });
        await meter(actor, grupo, userId);
        obtenidos.push(
          await codeOfRejection(
            identity.addWorkGroupMember(actor, { workGroupId: grupo, userId }),
          ),
        );
      }

      expect(obtenidos).toEqual(casos.map((caso) => caso.code));
      // Cuatro codigos distintos: el de R30 solo lo da la que se ve.
      expect(new Set(obtenidos).size).toBe(4);
      // Y el segundo intento no duplico ninguna fila.
      expect(await membershipsOf(grupo)).toHaveLength(4);
    });
  });
});

// ---------------------------------------------------------------------------
// R32 — la carrera: dos CONEXIONES de verdad, una sola fila
// ---------------------------------------------------------------------------

describe('R32 — dos inserciones CONCURRENTES de la misma persona acaban en UNA SOLA fila', () => {
  it('las dos llamadas salen a la vez por dos conexiones distintas del pool: una crea y la otra responde el duplicado', async () => {
    await withCompany(async (companyId) => {
      const actor = actorOf(companyId);
      const { id: grupo } = await identity.createWorkGroup(actor, { name: 'Turno noche' });
      const userId = await seedUser(companyId, { accountStatus: 'active' });

      // DOS CONEXIONES DE VERDAD: cada `addWorkGroupMember` abre su PROPIA `$transaction` sobre
      // una conexion propia del pool de Prisma. No son dos promesas sobre la misma transaccion
      // —eso compartiria conexion y la carrera no existiria—; son dos transacciones que compiten
      // por la MISMA clave primaria `(work_group_id, user_id)`, que es la unica garantia de R32.
      const resultados = await Promise.allSettled([
        identity.addWorkGroupMember(actor, { workGroupId: grupo, userId }),
        identity.addWorkGroupMember(actor, { workGroupId: grupo, userId }),
      ]);

      const cumplidas = resultados.filter((r) => r.status === 'fulfilled');
      const rechazadas = resultados.filter((r) => r.status === 'rejected');
      expect(cumplidas).toHaveLength(1);
      expect(rechazadas).toHaveLength(1);

      const razon: unknown = rechazadas[0]?.reason;
      expect((razon as { code?: unknown }).code).toBe('work_group_member_exists');

      // LO QUE DE VERDAD IMPORTA: la tabla queda con UNA sola fila. El mensaje puede llegar por
      // dos caminos (la lectura previa o el 23505); la fila de mas no puede existir por ninguno.
      expect(await membershipsOf(grupo)).toEqual([{ userId }]);
    });
  });
});

// ---------------------------------------------------------------------------
// R34 + R35 + R36 — sacar borra la fila DE VERDAD, y no toca nada mas
// ---------------------------------------------------------------------------

describe('R34 + R35 — sacar a una persona borra su fila de pertenencia y NADA mas', () => {
  it('la fila desaparece de la tabla (no queda marcada), la persona sigue viva y sus OTROS grupos no se tocan', async () => {
    await withCompany(async (companyId) => {
      const actor = actorOf(companyId);
      const uno = await identity.createWorkGroup(actor, { name: 'Turno noche' });
      const dos = await identity.createWorkGroup(actor, { name: 'Turno tarde' });
      const userId = await seedUser(companyId, { accountStatus: 'active' });
      const otra = await seedUser(companyId, { accountStatus: 'active' });
      for (const grupo of [uno, dos]) {
        await identity.addWorkGroupMember(actor, { workGroupId: grupo.id, userId });
      }
      await identity.addWorkGroupMember(actor, { workGroupId: uno.id, userId: otra });
      const personaAntes = await rawUser(userId);

      await identity.removeWorkGroupMember(actor, { workGroupId: uno.id, userId });

      // R34: BORRADO FISICO. No queda ninguna fila, ni marcada ni de ninguna otra forma.
      expect(
        await prisma.workGroupMember.count({ where: { workGroupId: uno.id, userId } }),
      ).toBe(0);
      // R35: ni la persona, ni su OTRO grupo, ni el grupo del que salio.
      expect(await rawUser(userId)).toEqual(personaAntes);
      expect(await membershipsOf(dos.id)).toEqual([{ userId }]);
      expect(await membershipsOf(uno.id)).toEqual([{ userId: otra }]);
      expect(await prisma.workGroup.count({ where: { id: uno.id, deletedAt: null } })).toBe(1);
    });
  });

  it('R35 — sacar al ULTIMO miembro no da de baja el grupo: sigue vivo y vacio', async () => {
    await withCompany(async (companyId) => {
      const actor = actorOf(companyId);
      const { id: grupo } = await identity.createWorkGroup(actor, { name: 'Turno noche' });
      const userId = await seedUser(companyId, { accountStatus: 'active' });
      await identity.addWorkGroupMember(actor, { workGroupId: grupo, userId });

      await identity.removeWorkGroupMember(actor, { workGroupId: grupo, userId });

      expect(await membershipsOf(grupo)).toEqual([]);
      const pagina = await identity.listWorkGroupMembers(actor, grupo, listInput(), new Date());
      expect(pagina.total).toBe(0);
      expect(pagina.items).toEqual([]);
    });
  });
});

describe('R36 — sacar a quien NO pertenece se rechaza diciendolo, y no modifica ninguna fila', () => {
  it('responde `work_group_member_not_found`, tanto si la persona existe como si no, y las demas pertenencias siguen', async () => {
    await withCompany(async (companyId) => {
      const actor = actorOf(companyId);
      const { id: grupo } = await identity.createWorkGroup(actor, { name: 'Turno noche' });
      const dentro = await seedUser(companyId, { accountStatus: 'active' });
      const fuera = await seedUser(companyId, { accountStatus: 'active' });
      await identity.addWorkGroupMember(actor, { workGroupId: grupo, userId: dentro });

      for (const userId of [fuera, randomUUID()]) {
        expect(
          await codeOfRejection(
            identity.removeWorkGroupMember(actor, { workGroupId: grupo, userId }),
          ),
        ).toBe('work_group_member_not_found');
      }

      expect(await membershipsOf(grupo)).toEqual([{ userId: dentro }]);
    });
  });
});

// ---------------------------------------------------------------------------
// R51 + R52 + R53 — la paginacion de los miembros, contra datos reales
// ---------------------------------------------------------------------------

describe('R51 + R52 + R53 — la lista de miembros se pagina sobre el conjunto YA FILTRADO', () => {
  it('un grupo con 23 personas visibles y 5 ocultas: `total` es 23, la pagina es de 10 y recorrer las tres devuelve a cada una EXACTAMENTE una vez', async () => {
    await withCompany(async (companyId) => {
      const actor = actorOf(companyId);
      const { id: grupo } = await identity.createWorkGroup(actor, { name: 'Turno noche' });
      const ahora = new Date();

      // 23 visibles, con apellidos que ordenan de forma previsible y DOS HOMONIMAS exactas
      // (misma pareja de nombres): el desempate por identificador es lo unico que impide que se
      // intercambien entre paginas (R53).
      const visibles: string[] = [];
      for (let i = 0; i < 23; i += 1) {
        const homonima = i === 9 || i === 10;
        visibles.push(
          await seedUser(companyId, {
            accountStatus: 'active',
            firstNames: homonima ? 'Ana' : `Nombre${String(i).padStart(2, '0')}`,
            lastNames: homonima ? 'Homonima' : `Apellido${String(i).padStart(2, '0')}`,
          }),
        );
      }
      // 5 ocultas, una por cada forma de estarlo.
      const ocultas = [
        await seedUser(companyId, { accountStatus: 'pending' }),
        await seedUser(companyId, { accountStatus: 'inactive' }),
        await seedUser(companyId, { accountStatus: 'blocked' }),
        await seedUser(companyId, {
          accountStatus: 'blocked',
          lockedUntil: new Date(ahora.getTime() + 3_600_000),
        }),
        await seedUser(companyId, { accountStatus: 'pending' }),
      ];
      for (const userId of [...visibles, ...ocultas]) {
        await meter(actor, grupo, userId);
      }

      const paginas = [];
      for (const page of [1, 2, 3]) {
        paginas.push(await identity.listWorkGroupMembers(actor, grupo, listInput({ page }), ahora));
      }

      // R52: el total cuenta SOLO a las filtradas. Las 5 ocultas no suman, aunque su fila exista.
      expect(paginas.map((pagina) => pagina.total)).toEqual([23, 23, 23]);
      expect(await membershipsOf(grupo)).toHaveLength(28);
      // R51: 10 por defecto.
      expect(paginas.map((pagina) => pagina.items.length)).toEqual([10, 10, 3]);
      expect(paginas[0]?.pageSize).toBe(10);
      expect(paginas[0]?.totalPages).toBe(3);

      // R53: ni se repite ni se pierde nadie, y ninguna oculta se cuela.
      const recorrido = paginas.flatMap((pagina) => pagina.items.map((fila) => fila.id));
      expect(recorrido).toHaveLength(23);
      expect(new Set(recorrido).size).toBe(23);
      expect([...recorrido].sort()).toEqual([...visibles].sort());
      for (const userId of ocultas) expect(recorrido).not.toContain(userId);
    });
  });

  it('R51 — pedir 100 devuelve 25 (acotado, no un error), y pedir menos devuelve lo pedido', async () => {
    await withCompany(async (companyId) => {
      const actor = actorOf(companyId);
      const { id: grupo } = await identity.createWorkGroup(actor, { name: 'Turno noche' });
      for (let i = 0; i < 27; i += 1) {
        const userId = await seedUser(companyId, {
          accountStatus: 'active',
          lastNames: `Apellido${String(i).padStart(2, '0')}`,
        });
        await identity.addWorkGroupMember(actor, { workGroupId: grupo, userId });
      }

      const cien = await identity.listWorkGroupMembers(
        actor,
        grupo,
        listInput({ pageSize: 100 }),
        new Date(),
      );
      const tres = await identity.listWorkGroupMembers(
        actor,
        grupo,
        listInput({ pageSize: 3 }),
        new Date(),
      );

      expect(cien.items).toHaveLength(25);
      expect(cien.pageSize).toBe(25);
      expect(cien.total).toBe(27);
      expect(tres.items).toHaveLength(3);
      expect(tres.pageSize).toBe(3);
      expect(tres.total).toBe(27);
    });
  });
});

// ---------------------------------------------------------------------------
// Candidatos a grupo (R28 enmendado, 2026-10-05) — solo estado EFECTIVO activo, total correcto
// ---------------------------------------------------------------------------

describe('R28 (enmienda 2026-10-05) — los candidatos a grupo son solo las personas efectivamente activas', () => {
  it('excluye pendiente, inactiva, bloqueadas vigentes, dadas de baja y de otra empresa; el total cuenta solo a las que salen', async () => {
    await withTwoCompanies(async (companyA, companyB) => {
      const actor = actorOf(companyA);
      const ahora = new Date();
      const vigente = new Date(ahora.getTime() + 3_600_000);

      const activas: string[] = [];
      for (let i = 0; i < 7; i += 1) {
        activas.push(
          await seedUser(companyA, {
            accountStatus: 'active',
            lastNames: `Candidata${String(i).padStart(2, '0')}`,
          }),
        );
      }
      const vencida = await seedUser(companyA, {
        accountStatus: 'blocked',
        lockedUntil: new Date(ahora.getTime() - 60_000),
        lastNames: 'Candidata99',
      });
      const ocultas = [
        await seedUser(companyA, { accountStatus: 'pending', lastNames: 'Candidata50' }),
        await seedUser(companyA, { accountStatus: 'inactive', lastNames: 'Candidata51' }),
        await seedUser(companyA, { accountStatus: 'blocked', lastNames: 'Candidata52' }),
        await seedUser(companyA, {
          accountStatus: 'blocked',
          lockedUntil: vigente,
          lastNames: 'Candidata53',
        }),
        await seedUser(companyA, {
          accountStatus: 'active',
          lockedUntil: vigente,
          lastNames: 'Candidata54',
        }),
        await seedUser(companyA, { deletedAt: new Date(), lastNames: 'Candidata55' }),
        await seedUser(companyB, { lastNames: 'Candidata56' }),
      ];

      const uno = await identity.listWorkGroupCandidates(
        actor,
        listInput({ pageSize: 5 }),
        ahora,
      );
      const dos = await identity.listWorkGroupCandidates(
        actor,
        listInput({ page: 2, pageSize: 5 }),
        ahora,
      );

      expect(uno.total).toBe(8);
      expect(uno.totalPages).toBe(2);
      expect(uno.items).toHaveLength(5);
      expect(dos.items).toHaveLength(3);
      const recorrido = [...uno.items, ...dos.items].map((fila) => fila.id);
      expect(recorrido).toEqual([...activas, vencida]);
      for (const userId of ocultas) expect(recorrido).not.toContain(userId);
      expect(Object.keys(uno.items[0] ?? {}).sort()).toEqual(['displayName', 'id', 'roleName']);
    });
  });

  it('la busqueda acota por nombre y el total sigue contando solo a las activas que casan', async () => {
    await withCompany(async (companyId) => {
      const actor = actorOf(companyId);
      const ahora = new Date();
      const buscada = await seedUser(companyId, { firstNames: 'Zoraida', accountStatus: 'active' });
      await seedUser(companyId, { firstNames: 'Zoraida', accountStatus: 'pending' });
      await seedUser(companyId, { firstNames: 'Beatriz', accountStatus: 'active' });

      const pagina = await identity.listWorkGroupCandidates(
        actor,
        listInput({ search: 'zorai' }),
        ahora,
      );

      expect(pagina.items.map((fila) => fila.id)).toEqual([buscada]);
      expect(pagina.total).toBe(1);
    });
  });
});

// ---------------------------------------------------------------------------
// Enmienda 2026-10-05 — nadie puede meterse a si mismo en un grupo
// ---------------------------------------------------------------------------

describe('enmienda 2026-10-05 — nadie puede meterse a si mismo en un grupo', () => {
  it('el actor activo que se mete a si mismo recibe `work_group_member_self`, no deja fila y no sale como candidato', async () => {
    await withCompany(async (companyId) => {
      const yo = await seedUser(companyId, { accountStatus: 'active', firstNames: 'Yo' });
      const otra = await seedUser(companyId, { accountStatus: 'active', firstNames: 'Otra' });
      const actor: Actor = { ...actorOf(companyId), id: yo };
      const { id: grupo } = await identity.createWorkGroup(actor, { name: 'Turno noche' });

      expect(
        await codeOfRejection(identity.addWorkGroupMember(actor, { workGroupId: grupo, userId: yo })),
      ).toBe('work_group_member_self');
      expect(await membershipsOf(grupo)).toEqual([]);

      const candidatos = await identity.listWorkGroupCandidates(actor, listInput(), new Date());
      expect(candidatos.items.map((fila) => fila.id)).toEqual([otra]);
      expect(candidatos.total).toBe(1);
    });
  });
});
