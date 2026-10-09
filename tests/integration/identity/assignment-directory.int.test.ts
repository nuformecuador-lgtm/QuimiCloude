/**
 * QC-87 T3 — `PeopleDirectory` y `WorkGroupDirectory` contra Postgres REAL (R6, R19, R20, R21,
 * R25, R37).
 *
 * QUE SE EJERCITA: el adaptador `assignment-directory-prisma`, que es el que `asignaciones` va a
 * consumir para no tocar `users`, `work_groups` ni `work_group_members`. Es el unico sitio donde
 * se puede contestar la pregunta que un doble no contesta: que la lista de miembros que se va a
 * asignar sale de `listMembersAliveInCompany` + `effectiveAccountStatus` —las MISMAS dos piezas
 * que alimentan la pantalla de miembros del grupo— y no de un `WHERE account_status = 'active'`.
 *
 * EL CASO QUE VALE POR TODOS (R21): la cuenta bloqueada cuyo PLAZO YA VENCIO vuelve a contar como
 * miembro activo **moviendo solo el reloj** —el parametro `now`— y **sin escribir nada en la
 * base**. El caso lo demuestra llamando DOS VECES a la misma consulta con el MISMO dato y ademas
 * comparando la fila CRUDA de `users` antes y despues: si hiciera falta un `UPDATE` para que la
 * persona reapareciera, el requisito estaria mal implementado. Su gemelo es la cuenta que dice
 * `active` en la columna con un plazo TODAVIA VIGENTE (QC-78 R11), que NO debe volver: entre los
 * dos, un filtro por columna no puede pasar este archivo en verde.
 *
 * AISLAMIENTO — CONSTRUCCION PROPIA + LIMPIEZA PROPIA, igual que `work-group-membership.int.
 * test.ts` y por el mismo motivo: el adaptador bajo prueba habla con el cliente Prisma GLOBAL, asi
 * que envolver sus llamadas en una `$transaction` del test seria un aislamiento de mentira —
 * correrian en otra conexion del pool y no verian ni una fila del fixture—. Cada caso fabrica su
 * empresa efimera (`randomUUID`) y la borra en un `finally`, asi que el archivo es REPETIBLE.
 *
 * LOS ESTADOS DE CUENTA se siembran DIRECTAMENTE con Prisma y no por el alta de QC-66, que nace
 * siempre `pending` y no elige el plazo de bloqueo: sembrar el escenario a mano es lo que hace que
 * estos casos no dependan de ningun otro flujo.
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  findAliveRefsInCompany,
  findRefsIncludingDeletedInCompany,
  findSnapshotAliveInCompany,
  listAliveInCompany,
  listSnapshotsAliveInCompany,
} from '@/lib/modules/identity/adapters/driven/persistence/assignment-directory-prisma';
import {
  DOCUMENT_TYPE_CC,
  normalizeCompanyName,
  normalizeWorkGroupName,
  ROLE_ADMINISTRADOR,
  ROLE_OPERADOR,
  SEED_ROLE_PERMISSIONS,
} from '@/lib/modules/identity';
import { prisma } from '@/lib/shared/db/prisma';

import type { UserAccountStatus } from '@/lib/modules/identity/domain/account-status';

// ---------------------------------------------------------------------------
// El reloj del escenario: TRES instantes fijos, ninguno `new Date()` dentro del adaptador
// ---------------------------------------------------------------------------

/** El «ahora» de casi todos los casos. */
const AHORA = new Date('2026-09-13T12:00:00.000Z');
/** Plazo que en `AHORA` sigue VIGENTE: la cuenta esta bloqueada de verdad (QC-78 R10, R11). */
const PLAZO_VIGENTE = new Date('2026-09-13T12:30:00.000Z');
/** Un instante POSTERIOR a `PLAZO_VIGENTE`: el mismo dato, otro reloj (QC-78 R8). */
const DESPUES_DEL_PLAZO = new Date('2026-09-13T13:00:00.000Z');

/** Marcador de prueba, evidentemente ficticio: ninguna operacion de aqui lee credenciales. */
const FAKE_CREDENTIAL_HASH = '$2b$10$marcador.de.prueba.qc87.t3.no.es.un.hash.real';

// ---------------------------------------------------------------------------
// Escenario: empresas propias, personas propias, limpieza propia
// ---------------------------------------------------------------------------

/** Roles de los que cuelgan las personas. Se REUTILIZAN los del seed, no se crea ninguno. */
let operadorRoleId = '';
let administradorRoleId = '';

const createdCompanyIds = new Set<string>();

async function createCompany(): Promise<string> {
  const name = `QC87 T3 ${randomUUID()}`;
  const company = await prisma.company.create({
    data: { name, nameNormalized: normalizeCompanyName(name) },
    select: { id: true },
  });
  createdCompanyIds.add(company.id);
  return company.id;
}

/** Mismo orden de limpieza que `work-group-membership.int.test.ts`: es el que respetan las FK. */
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

/** DOS empresas propias: es lo que hace comprobable la mitad ajena de R6 y de R25. */
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

type SeedUserFields = Partial<{
  firstNames: string;
  lastNames: string;
  accountStatus: UserAccountStatus;
  lockedUntil: Date | null;
  deletedAt: Date | null;
  roleId: string;
}>;

/** Una persona de esa empresa con el estado y el plazo que pida el caso. */
async function seedUser(companyId: string, fields: SeedUserFields = {}): Promise<string> {
  const tag = randomUUID();
  const created = await prisma.user.create({
    data: {
      firstNames: fields.firstNames ?? 'Ana',
      lastNames: fields.lastNames ?? `Apellido${tag.slice(0, 8)}`,
      birthDate: new Date('1990-01-01T00:00:00.000Z'),
      email: `qc87.t3.${tag}@example.test`,
      phone: '000000000',
      documentTypeCode: DOCUMENT_TYPE_CC,
      documentNumber: tag.replaceAll('-', '').slice(0, 20),
      username: `qc87.t3.${tag}`,
      passwordHash: FAKE_CREDENTIAL_HASH,
      roleId: fields.roleId ?? operadorRoleId,
      companyId,
      accountStatus: fields.accountStatus ?? 'active',
      lockedUntil: fields.lockedUntil ?? null,
      deletedAt: fields.deletedAt ?? null,
    },
    select: { id: true },
  });
  return created.id;
}

/** Un grupo vivo de esa empresa, con el nombre que el caso necesite. */
async function seedGroup(companyId: string, name: string): Promise<string> {
  const created = await prisma.workGroup.create({
    data: { companyId, name, nameNormalized: normalizeWorkGroupName(name) },
    select: { id: true },
  });
  return created.id;
}

async function addMember(companyId: string, workGroupId: string, userId: string): Promise<void> {
  await prisma.workGroupMember.create({
    data: { companyId, workGroupId, userId },
    select: { workGroupId: true },
  });
}

/** La fila CRUDA de la persona: es donde se ve que una lectura no escribio nada. */
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

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

beforeAll(async () => {
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

  const administrador = await prisma.role.findFirst({
    where: { name: ROLE_ADMINISTRADOR },
    select: { id: true },
  });
  if (administrador === null) {
    throw new Error(
      `falta el rol base \`${ROLE_ADMINISTRADOR}\` en la base: corre \`pnpm run db:seed\` contra la ` +
        'base de esta feature antes de correr este archivo.',
    );
  }
  administradorRoleId = administrador.id;
});

afterAll(async () => {
  expect([...createdCompanyIds]).toEqual([]);
});

// ---------------------------------------------------------------------------
// WorkGroupDirectory — quien entra en `activeMemberIds` (R19, R20, R21)
// ---------------------------------------------------------------------------

describe('findSnapshotAliveInCompany — el filtro es el estado EFECTIVO, no la columna', () => {
  it('deja fuera a `pending`, `inactive` y `blocked` con plazo vigente, y trae al activo (R19, R20)', async () => {
    await withCompany(async (companyId) => {
      const groupId = await seedGroup(companyId, `Turno ${randomUUID()}`);

      const activo = await seedUser(companyId, { lastNames: 'Aaa', accountStatus: 'active' });
      const pendiente = await seedUser(companyId, { lastNames: 'Bbb', accountStatus: 'pending' });
      const inactivo = await seedUser(companyId, { lastNames: 'Ccc', accountStatus: 'inactive' });
      const bloqueado = await seedUser(companyId, {
        lastNames: 'Ddd',
        accountStatus: 'blocked',
        lockedUntil: PLAZO_VIGENTE,
      });
      // El caso de QC-78 R11: la COLUMNA dice `active` y el plazo sigue vigente. Es la mitad del
      // par que hace imposible pasar este archivo con un `WHERE account_status = 'active'`.
      const activoConPlazoVigente = await seedUser(companyId, {
        lastNames: 'Eee',
        accountStatus: 'active',
        lockedUntil: PLAZO_VIGENTE,
      });
      // Bloqueo ADMINISTRATIVO (sin plazo): no caduca nunca (QC-78 R9).
      const bloqueadoSinPlazo = await seedUser(companyId, {
        lastNames: 'Fff',
        accountStatus: 'blocked',
        lockedUntil: null,
      });

      for (const userId of [
        activo,
        pendiente,
        inactivo,
        bloqueado,
        activoConPlazoVigente,
        bloqueadoSinPlazo,
      ]) {
        await addMember(companyId, groupId, userId);
      }

      const snapshot = await findSnapshotAliveInCompany(companyId, groupId, AHORA);

      expect(snapshot).not.toBeNull();
      expect(snapshot?.activeMemberIds).toEqual([activo]);
    });
  });

  it('la persona dada de BAJA no es miembro vivo, aunque su cuenta diga `active` (R19)', async () => {
    await withCompany(async (companyId) => {
      const groupId = await seedGroup(companyId, `Turno ${randomUUID()}`);
      const viva = await seedUser(companyId, { lastNames: 'Aaa' });
      const deBaja = await seedUser(companyId, { lastNames: 'Bbb', deletedAt: AHORA });
      await addMember(companyId, groupId, viva);
      await addMember(companyId, groupId, deBaja);

      const snapshot = await findSnapshotAliveInCompany(companyId, groupId, AHORA);

      expect(snapshot?.activeMemberIds).toEqual([viva]);
    });
  });

  it('la cuenta bloqueada cuyo plazo VENCIO vuelve sola: solo se mueve el reloj, no la base (R21)', async () => {
    await withCompany(async (companyId) => {
      const groupId = await seedGroup(companyId, `Turno ${randomUUID()}`);
      const bloqueado = await seedUser(companyId, {
        lastNames: 'Zzz',
        accountStatus: 'blocked',
        lockedUntil: PLAZO_VIGENTE,
      });
      await addMember(companyId, groupId, bloqueado);

      const antes = await rawUser(bloqueado);

      // 1) Con el plazo todavia vigente, no cuenta como miembro activo.
      const conPlazoVigente = await findSnapshotAliveInCompany(companyId, groupId, AHORA);
      expect(conPlazoVigente?.activeMemberIds).toEqual([]);

      // 2) MISMO dato, MISMA consulta, otro `now`: vuelve. Ninguna escritura por medio.
      const vencido = await findSnapshotAliveInCompany(companyId, groupId, DESPUES_DEL_PLAZO);
      expect(vencido?.activeMemberIds).toEqual([bloqueado]);

      // 3) La prueba de que no hubo `UPDATE`: la fila cruda es IDENTICA, columna por columna.
      const despues = await rawUser(bloqueado);
      expect(despues).toEqual(antes);
      expect(despues.account_status).toBe('blocked');
      expect(despues.locked_until?.getTime()).toBe(PLAZO_VIGENTE.getTime());
    });
  });

  it('trae el nombre de AHORA del grupo, que es el que se congela (R19)', async () => {
    await withCompany(async (companyId) => {
      const nombre = `Turno ${randomUUID()}`;
      const groupId = await seedGroup(companyId, nombre);

      const snapshot = await findSnapshotAliveInCompany(companyId, groupId, AHORA);

      expect(snapshot).toEqual({ id: groupId, name: nombre, activeMemberIds: [] });
    });
  });

  it('un grupo VIVO sin ningun miembro activo devuelve la lista vacia, no `null` (R26)', async () => {
    await withCompany(async (companyId) => {
      const groupId = await seedGroup(companyId, `Turno ${randomUUID()}`);
      await addMember(companyId, groupId, await seedUser(companyId, { accountStatus: 'pending' }));

      const snapshot = await findSnapshotAliveInCompany(companyId, groupId, AHORA);

      expect(snapshot).not.toBeNull();
      expect(snapshot?.activeMemberIds).toEqual([]);
    });
  });

  it('grupo inexistente, dado de baja o de OTRA empresa: los tres, `null` (R25)', async () => {
    await withTwoCompanies(async (companyA, companyB) => {
      const inexistente = randomUUID();

      const deBaja = await seedGroup(companyA, `Turno ${randomUUID()}`);
      await prisma.workGroup.update({ where: { id: deBaja }, data: { deletedAt: AHORA } });

      const ajeno = await seedGroup(companyB, `Turno ${randomUUID()}`);
      await addMember(companyB, ajeno, await seedUser(companyB));

      expect(await findSnapshotAliveInCompany(companyA, inexistente, AHORA)).toBeNull();
      expect(await findSnapshotAliveInCompany(companyA, deBaja, AHORA)).toBeNull();
      // El grupo existe y tiene un miembro activo: lo unico que falla es la empresa.
      expect(await findSnapshotAliveInCompany(companyA, ajeno, AHORA)).toBeNull();
      expect((await findSnapshotAliveInCompany(companyB, ajeno, AHORA))?.activeMemberIds).toHaveLength(1);
    });
  });
});

// ---------------------------------------------------------------------------
// PeopleDirectory — R6 y R37
// ---------------------------------------------------------------------------

describe('PeopleDirectory — quien vuelve y con que `isActive`', () => {
  it('inexistente, de baja o de otra empresa: simplemente no vuelve (R6)', async () => {
    await withTwoCompanies(async (companyA, companyB) => {
      const viva = await seedUser(companyA);
      const deBaja = await seedUser(companyA, { deletedAt: AHORA });
      const ajena = await seedUser(companyB);
      const inexistente = randomUUID();

      const refs = await findAliveRefsInCompany(
        companyA,
        [viva, deBaja, ajena, inexistente],
        AHORA,
      );

      expect(refs.map((ref) => ref.id)).toEqual([viva]);
    });
  });

  it('la persona de baja, inactiva o bloqueada SIGUE volviendo en la consulta (R37)', async () => {
    await withTwoCompanies(async (companyA, companyB) => {
      const deBaja = await seedUser(companyA, {
        firstNames: 'Ana Maria',
        lastNames: 'Perez Gomez',
        deletedAt: AHORA,
      });
      const inactiva = await seedUser(companyA, { accountStatus: 'inactive' });
      const bloqueadaConPlazo = await seedUser(companyA, {
        accountStatus: 'blocked',
        lockedUntil: PLAZO_VIGENTE,
      });
      const ajena = await seedUser(companyB);

      const refs = await findRefsIncludingDeletedInCompany(
        companyA,
        [deBaja, inactiva, bloqueadaConPlazo, ajena],
        AHORA,
      );
      const byId = new Map(refs.map((ref) => [ref.id, ref]));

      // Las tres de la empresa vuelven; la ajena no (R7).
      expect([...byId.keys()].sort()).toEqual([deBaja, inactiva, bloqueadaConPlazo].sort());
      // El nombre mostrable lo compone `buildDisplayName`: primer nombre + primer apellido.
      expect(byId.get(deBaja)?.displayName).toBe('Ana Perez');
      expect(byId.get(inactiva)?.isActive).toBe(false);
      expect(byId.get(bloqueadaConPlazo)?.isActive).toBe(false);
    });
  });

  it('`isActive` depende del RELOJ tambien aqui: el mismo dato, dos respuestas (R21)', async () => {
    await withCompany(async (companyId) => {
      const bloqueada = await seedUser(companyId, {
        accountStatus: 'blocked',
        lockedUntil: PLAZO_VIGENTE,
      });

      const conPlazo = await findAliveRefsInCompany(companyId, [bloqueada], AHORA);
      const vencido = await findAliveRefsInCompany(companyId, [bloqueada], DESPUES_DEL_PLAZO);

      expect(conPlazo[0]?.isActive).toBe(false);
      expect(vencido[0]?.isActive).toBe(true);
    });
  });

  it('la lista vacia no consulta nada y devuelve vacio', async () => {
    await withCompany(async (companyId) => {
      expect(await findAliveRefsInCompany(companyId, [], AHORA)).toEqual([]);
      expect(await findRefsIncludingDeletedInCompany(companyId, [], AHORA)).toEqual([]);
    });
  });

  it('R32, R33 — `permissions` trae exactamente los codigos que el seed asigna al rol de la persona', async () => {
    await withCompany(async (companyId) => {
      const operador = await seedUser(companyId, { lastNames: 'Aaa', roleId: operadorRoleId });
      const administrador = await seedUser(companyId, {
        lastNames: 'Bbb',
        roleId: administradorRoleId,
      });

      const refs = await findAliveRefsInCompany(companyId, [operador, administrador], AHORA);
      const byId = new Map(refs.map((ref) => [ref.id, ref]));

      expect([...(byId.get(operador)?.permissions ?? [])].sort()).toEqual(
        [...SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]].sort(),
      );
      expect([...(byId.get(administrador)?.permissions ?? [])].sort()).toEqual(
        [...SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]].sort(),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// PeopleDirectory — `listAliveInCompany`
// ---------------------------------------------------------------------------

describe('listAliveInCompany — personas vivas de la empresa, ordenadas y acotadas', () => {
  it('trae solo las personas VIVAS de esa empresa, con sus permisos', async () => {
    await withTwoCompanies(async (companyA, companyB) => {
      const viva = await seedUser(companyA, { lastNames: 'Aaa', roleId: operadorRoleId });
      await seedUser(companyA, { lastNames: 'Bbb', deletedAt: AHORA });
      await seedUser(companyB, { lastNames: 'Ccc' });

      const refs = await listAliveInCompany(companyA, AHORA, 25);

      expect(refs.map((ref) => ref.id)).toEqual([viva]);
      expect([...refs[0]!.permissions].sort()).toEqual([...SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]].sort());
    });
  });

  it('ordena por `last_names, first_names, id`', async () => {
    await withCompany(async (companyId) => {
      const zzz = await seedUser(companyId, { firstNames: 'Zoe', lastNames: 'Zeta' });
      const aaa = await seedUser(companyId, { firstNames: 'Ana', lastNames: 'Alfa' });
      const mismoApellidoA = await seedUser(companyId, { firstNames: 'Bea', lastNames: 'Alfa' });

      const refs = await listAliveInCompany(companyId, AHORA, 25);

      const ordenEsperado = [aaa, mismoApellidoA].sort();
      expect(refs.slice(0, 2).map((ref) => ref.id).sort()).toEqual(ordenEsperado);
      expect(refs.map((ref) => ref.id)).toContain(zzz);
      expect(refs.map((ref) => ref.id).indexOf(zzz)).toBe(2);
    });
  });

  it('respeta el tope: con mas de 25 personas vivas, devuelve exactamente 25', async () => {
    await withCompany(async (companyId) => {
      for (let i = 0; i < 30; i += 1) {
        await seedUser(companyId, { lastNames: `Persona${String(i).padStart(2, '0')}` });
      }

      const refs = await listAliveInCompany(companyId, AHORA, 25);

      expect(refs).toHaveLength(25);
    });
  });

  it('con `accountStatus: [\'active\']` filtra por estado EFECTIVO, no por la columna', async () => {
    await withCompany(async (companyId) => {
      const activa = await seedUser(companyId, { lastNames: 'Aaa', accountStatus: 'active' });
      // Efectivamente activa aunque la columna diga `blocked`: el plazo ya vencio (QC-78 R8).
      const vencida = await seedUser(companyId, {
        lastNames: 'Bbb',
        accountStatus: 'blocked',
        lockedUntil: new Date('2026-09-13T11:00:00.000Z'),
      });
      await seedUser(companyId, { lastNames: 'Ccc', accountStatus: 'inactive' });
      await seedUser(companyId, { lastNames: 'Ddd', accountStatus: 'pending' });
      await seedUser(companyId, {
        lastNames: 'Eee',
        accountStatus: 'blocked',
        lockedUntil: PLAZO_VIGENTE,
      });
      // El gemelo de QC-78 R11: la columna dice `active` pero el plazo sigue vigente.
      await seedUser(companyId, {
        lastNames: 'Fff',
        accountStatus: 'active',
        lockedUntil: PLAZO_VIGENTE,
      });

      const refs = await listAliveInCompany(companyId, AHORA, 25, { accountStatus: ['active'] });

      // Ordenadas por `last_names`: la activa y la vencida, y nadie mas. Un `WHERE
      // account_status = 'active'` a secas traeria a `Fff` y dejaria fuera a `Bbb`.
      expect(refs.map((ref) => ref.id)).toEqual([activa, vencida]);
    });
  });

  it('con varios estados trae la union, y sin filtro o con array vacio trae todas las vivas', async () => {
    await withCompany(async (companyId) => {
      const activa = await seedUser(companyId, { lastNames: 'Aaa', accountStatus: 'active' });
      const pendiente = await seedUser(companyId, { lastNames: 'Bbb', accountStatus: 'pending' });
      await seedUser(companyId, { lastNames: 'Ccc', accountStatus: 'inactive' });

      const union = await listAliveInCompany(companyId, AHORA, 25, {
        accountStatus: ['active', 'pending'],
      });
      expect(union.map((ref) => ref.id)).toEqual([activa, pendiente]);

      const sinFiltro = await listAliveInCompany(companyId, AHORA, 25);
      expect(sinFiltro).toHaveLength(3);

      const vacio = await listAliveInCompany(companyId, AHORA, 25, { accountStatus: [] });
      expect(vacio).toHaveLength(3);
    });
  });

  it('los literales desconocidos se descartan; si no queda ninguno, el filtro se omite', async () => {
    await withCompany(async (companyId) => {
      await seedUser(companyId, { lastNames: 'Aaa', accountStatus: 'active' });
      await seedUser(companyId, { lastNames: 'Bbb', accountStatus: 'inactive' });

      const refs = await listAliveInCompany(companyId, AHORA, 25, {
        accountStatus: ['inexistente' as UserAccountStatus, 'active'],
      });
      expect(refs.map((ref) => ref.displayName)).toHaveLength(1);

      const soloBasura = await listAliveInCompany(companyId, AHORA, 25, {
        accountStatus: ['inexistente' as UserAccountStatus],
      });
      expect(soloBasura).toHaveLength(2);
    });
  });

  it('el `take` va antes del filtro: con filtro la respuesta puede traer menos del tope', async () => {
    await withCompany(async (companyId) => {
      // Las dos primeras por orden estan inactivas: el `take: 2` las trae a ellas y el
      // filtro las saca a las dos, aunque mas abajo haya una activa.
      await seedUser(companyId, { lastNames: 'Aaa', accountStatus: 'inactive' });
      await seedUser(companyId, { lastNames: 'Bbb', accountStatus: 'inactive' });
      await seedUser(companyId, { lastNames: 'Ccc', accountStatus: 'active' });

      const refs = await listAliveInCompany(companyId, AHORA, 2, { accountStatus: ['active'] });

      expect(refs).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// WorkGroupDirectory.listSnapshotsAliveInCompany — los grupos del selector del equipo
// ---------------------------------------------------------------------------

describe('listSnapshotsAliveInCompany — grupos vivos de la empresa con sus miembros activos', () => {
  it('R7: trae solo los grupos VIVOS de esa empresa', async () => {
    await withTwoCompanies(async (companyA, companyB) => {
      const vivo = await seedGroup(companyA, `Turno ${randomUUID()}`);
      const deBaja = await seedGroup(companyA, `Turno ${randomUUID()}`);
      await prisma.workGroup.update({ where: { id: deBaja }, data: { deletedAt: AHORA } });
      const ajeno = await seedGroup(companyB, `Turno ${randomUUID()}`);

      const deA = await listSnapshotsAliveInCompany(companyA, AHORA, 25);
      const deB = await listSnapshotsAliveInCompany(companyB, AHORA, 25);

      expect(deA.map((group) => group.id)).toEqual([vivo]);
      expect(deB.map((group) => group.id)).toEqual([ajeno]);
    });
  });

  it('R7: ordena por nombre normalizado, sin distinguir mayusculas ni tildes', async () => {
    await withCompany(async (companyId) => {
      const charlie = await seedGroup(companyId, 'Charlie');
      const alfa = await seedGroup(companyId, 'alfa');
      const bravo = await seedGroup(companyId, 'Bravo');
      const eco = await seedGroup(companyId, 'Éco');
      const delta = await seedGroup(companyId, 'delta');

      const snapshots = await listSnapshotsAliveInCompany(companyId, AHORA, 25);

      expect(snapshots.map((group) => group.id)).toEqual([alfa, bravo, charlie, delta, eco]);
      expect(snapshots.map((group) => group.name)).toEqual(['alfa', 'Bravo', 'Charlie', 'delta', 'Éco']);
    });
  });

  it('R7: respeta el tope, cortando por el orden de nombre', async () => {
    await withCompany(async (companyId) => {
      const tercero = await seedGroup(companyId, 'Ccc');
      const primero = await seedGroup(companyId, 'Aaa');
      const segundo = await seedGroup(companyId, 'Bbb');

      const snapshots = await listSnapshotsAliveInCompany(companyId, AHORA, 2);

      expect(snapshots.map((group) => group.id)).toEqual([primero, segundo]);
      expect(snapshots.map((group) => group.id)).not.toContain(tercero);
    });
  });

  it('R7: `activeMemberIds` sigue el estado EFECTIVO, igual que la foto de un solo grupo', async () => {
    await withCompany(async (companyId) => {
      const turno = await seedGroup(companyId, 'Aaa turno');
      const vacio = await seedGroup(companyId, 'Bbb vacio');
      const otro = await seedGroup(companyId, 'Ccc otro');

      const activoB = await seedUser(companyId, { lastNames: 'Bbb', accountStatus: 'active' });
      const activoA = await seedUser(companyId, { lastNames: 'Aaa', accountStatus: 'active' });
      const pendiente = await seedUser(companyId, { lastNames: 'Ccc', accountStatus: 'pending' });
      const inactivo = await seedUser(companyId, { lastNames: 'Ddd', accountStatus: 'inactive' });
      const bloqueado = await seedUser(companyId, {
        lastNames: 'Eee',
        accountStatus: 'blocked',
        lockedUntil: PLAZO_VIGENTE,
      });
      const activoConPlazoVigente = await seedUser(companyId, {
        lastNames: 'Fff',
        accountStatus: 'active',
        lockedUntil: PLAZO_VIGENTE,
      });
      const deBaja = await seedUser(companyId, { lastNames: 'Ggg', deletedAt: AHORA });

      for (const userId of [activoB, activoA, pendiente, inactivo, bloqueado, activoConPlazoVigente, deBaja]) {
        await addMember(companyId, turno, userId);
      }
      await addMember(companyId, otro, activoA);
      await addMember(companyId, otro, bloqueado);

      const ahora = await listSnapshotsAliveInCompany(companyId, AHORA, 25);
      expect(ahora).toEqual([
        { id: turno, name: 'Aaa turno', activeMemberIds: [activoA, activoB] },
        { id: vacio, name: 'Bbb vacio', activeMemberIds: [] },
        { id: otro, name: 'Ccc otro', activeMemberIds: [activoA] },
      ]);
      for (const snapshot of ahora) {
        expect(snapshot).toEqual(await findSnapshotAliveInCompany(companyId, snapshot.id, AHORA));
      }

      // Mismo dato, otro reloj: los dos bloqueos con plazo vencen y vuelven, sin escribir nada.
      const despues = await listSnapshotsAliveInCompany(companyId, DESPUES_DEL_PLAZO, 25);
      expect(despues[0]?.activeMemberIds).toEqual([activoA, activoB, bloqueado, activoConPlazoVigente]);
      expect(despues[2]?.activeMemberIds).toEqual([activoA, bloqueado]);
    });
  });

  it('R7: hace exactamente dos consultas, sea cual sea el numero de grupos', async () => {
    await withCompany(async (companyId) => {
      for (const nombre of ['Aaa', 'Bbb', 'Ccc', 'Ddd']) {
        const groupId = await seedGroup(companyId, nombre);
        await addMember(companyId, groupId, await seedUser(companyId));
        await addMember(companyId, groupId, await seedUser(companyId));
      }

      const espias = [
        vi.spyOn(prisma.workGroup, 'findMany'),
        vi.spyOn(prisma.workGroup, 'findFirst'),
        vi.spyOn(prisma.workGroupMember, 'findMany'),
        vi.spyOn(prisma.user, 'findMany'),
        vi.spyOn(prisma, '$queryRaw'),
        vi.spyOn(prisma, '$queryRawUnsafe'),
      ];
      try {
        const snapshots = await listSnapshotsAliveInCompany(companyId, AHORA, 25);
        expect(snapshots).toHaveLength(4);
        expect(snapshots.every((snapshot) => snapshot.activeMemberIds.length === 2)).toBe(true);

        const llamadas = espias.reduce((total, espia) => total + espia.mock.calls.length, 0);
        expect(llamadas).toBe(2);
        expect(espias[0]?.mock.calls).toHaveLength(1);
        expect(espias[4]?.mock.calls).toHaveLength(1);
      } finally {
        for (const espia of espias) espia.mockRestore();
      }
    });
  });
});
