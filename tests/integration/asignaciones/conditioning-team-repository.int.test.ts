/**
 * `createConditioningTeamRepository` contra una base Postgres REAL, construido sobre la `tx` del
 * test: cada `it` corre en una transaccion interactiva que termina en `ROLLBACK`, y lo que se espera
 * que falle va en un SAVEPOINT.
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';

import { createConditioningTeamRepository } from '@/lib/modules/asignaciones/adapters/driven/persistence/conditioning-team-prisma';
import { normalizeCompanyName, normalizeWorkGroupName } from '@/lib/modules/identity';
import { prisma } from '@/lib/shared/db/prisma';

import type { NewConditioningTeamMember } from '@/lib/modules/asignaciones/ports/conditioning-team-repository';

class RollbackSignal extends Error {
  constructor() {
    super('rollback de aislamiento del test');
    this.name = 'RollbackSignal';
  }
}

async function inRolledBackTransaction(
  body: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<void> {
  try {
    await prisma.$transaction(
      async (tx) => {
        await body(tx);
        throw new RollbackSignal();
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
  } catch (error) {
    if (!(error instanceof RollbackSignal)) throw error;
  }
}

let savepointSeq = 0;

async function expectThrowsInSavepoint(
  tx: Prisma.TransactionClient,
  run: () => Promise<unknown>,
): Promise<unknown> {
  savepointSeq += 1;
  const savepoint = `sp_team_repo_${String(savepointSeq)}`;
  await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`);
  try {
    await run();
  } catch (error) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    return error;
  }
  await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`);
  throw new Error('se esperaba que la insercion lanzara, pero no lanzo');
}

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

async function createCompany(tx: Prisma.TransactionClient): Promise<string> {
  const name = `Empresa equipo ${token()}`;
  const company = await tx.company.create({
    data: { name, nameNormalized: normalizeCompanyName(name) },
    select: { id: true },
  });
  return company.id;
}

async function createUser(tx: Prisma.TransactionClient, companyId: string): Promise<string> {
  const marca = token();
  const documentType = await tx.documentType.create({
    data: { code: `DOC${marca.slice(0, 8)}`, name: 'Tipo de documento de prueba' },
    select: { code: true },
  });
  const role = await tx.role.create({
    data: { name: `rol-${marca}`, description: 'Rol de prueba' },
    select: { id: true },
  });
  const user = await tx.user.create({
    data: {
      firstNames: 'Ana',
      lastNames: `Perez ${marca.slice(0, 6)}`,
      birthDate: new Date('1990-05-17T00:00:00.000Z'),
      email: `ana.${marca}@quimicloude.test`,
      phone: '+57 300 111 2233',
      documentTypeCode: documentType.code,
      documentNumber: marca.slice(0, 12),
      username: `ana.${marca}`,
      passwordHash: 'hash-de-prueba-no-es-un-algoritmo-real',
      roleId: role.id,
      companyId,
    },
    select: { id: true },
  });
  return user.id;
}

let nextSequence = 840_000;

async function createOrder(tx: Prisma.TransactionClient, companyId: string): Promise<string> {
  const marca = token();
  const recipe = await tx.recipe.create({
    data: { name: `Receta ${marca}`, nameNormalized: `receta${marca}`, companyId },
    select: { id: true },
  });
  nextSequence += 1;
  const order = await tx.order.create({
    data: {
      companyId,
      orderYear: new Date().getUTCFullYear(),
      orderSequence: nextSequence,
      recipeId: recipe.id,
      quantity: new Prisma.Decimal('10'),
    },
    select: { id: true },
  });
  return order.id;
}

async function createGroup(tx: Prisma.TransactionClient, companyId: string, name: string): Promise<string> {
  const group = await tx.workGroup.create({
    data: { companyId, name, nameNormalized: normalizeWorkGroupName(name) },
    select: { id: true },
  });
  return group.id;
}

interface Scenario {
  readonly companyId: string;
  readonly orderId: string;
  readonly users: readonly [string, string, string];
  readonly groupId: string;
  readonly groupName: string;
}

async function seedScenario(tx: Prisma.TransactionClient): Promise<Scenario> {
  const companyId = await createCompany(tx);
  const groupName = `Turno ${token()}`;
  return {
    companyId,
    orderId: await createOrder(tx, companyId),
    users: [await createUser(tx, companyId), await createUser(tx, companyId), await createUser(tx, companyId)],
    groupId: await createGroup(tx, companyId, groupName),
    groupName,
  };
}

/** Una suelta y dos del grupo, en el orden de composicion. */
function teamOf(s: Scenario): readonly NewConditioningTeamMember[] {
  const base = { orderId: s.orderId, companyId: s.companyId };
  return [
    { ...base, userId: s.users[0], workGroupId: null, workGroupName: null, position: 0 },
    { ...base, userId: s.users[1], workGroupId: s.groupId, workGroupName: s.groupName, position: 1 },
    { ...base, userId: s.users[2], workGroupId: s.groupId, workGroupName: s.groupName, position: 2 },
  ];
}

type RawMember = {
  readonly user_id: string;
  readonly work_group_id: string | null;
  readonly work_group_name: string | null;
  readonly position: number;
  readonly created_at: Date;
};

async function rawTeam(tx: Prisma.TransactionClient, orderId: string): Promise<readonly RawMember[]> {
  return tx.$queryRaw<RawMember[]>`
    SELECT "user_id"::text AS "user_id", "work_group_id"::text AS "work_group_id", "work_group_name",
           "position", "created_at"
    FROM "order_conditioning_team_members" WHERE "order_id" = CAST(${orderId} AS uuid)
    ORDER BY "position"`;
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('createConditioningTeamRepository — insertAll y listByOrderInCompany', () => {
  it('R13: insertAll escribe una fila por persona y la lectura las devuelve por `position`', async () => {
    await inRolledBackTransaction(async (tx) => {
      const s = await seedScenario(tx);
      const repo = createConditioningTeamRepository(tx);
      const team = teamOf(s);

      // Se insertan desordenadas: el orden de lectura sale de `position`, no del de insercion.
      expect(await repo.insertAll([team[2]!, team[0]!, team[1]!])).toBe(3);

      expect(await repo.listByOrderInCompany(s.companyId, s.orderId)).toEqual([
        { userId: s.users[0], workGroupId: null, workGroupName: null },
        { userId: s.users[1], workGroupId: s.groupId, workGroupName: s.groupName },
        { userId: s.users[2], workGroupId: s.groupId, workGroupName: s.groupName },
      ]);
    });
  });

  it('R13: la lectura filtra por empresa y por pedido', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await seedScenario(tx);
      const b = await seedScenario(tx);
      const repo = createConditioningTeamRepository(tx);
      await repo.insertAll(teamOf(a));
      await repo.insertAll(teamOf(b).slice(0, 1));

      expect(await repo.listByOrderInCompany(b.companyId, a.orderId)).toEqual([]);
      expect(await repo.listByOrderInCompany(a.companyId, b.orderId)).toEqual([]);
      expect(await repo.listByOrderInCompany(b.companyId, b.orderId)).toHaveLength(1);
      expect(await repo.listByOrderInCompany(a.companyId, a.orderId)).toHaveLength(3);
    });
  });

  it('R13: un pedido sin equipo devuelve la lista vacia', async () => {
    await inRolledBackTransaction(async (tx) => {
      const s = await seedScenario(tx);
      expect(await createConditioningTeamRepository(tx).listByOrderInCompany(s.companyId, s.orderId)).toEqual([]);
    });
  });

  it('R13: una insercion con una persona duplicada lanza y no deja ninguna fila', async () => {
    await inRolledBackTransaction(async (tx) => {
      const s = await seedScenario(tx);
      const repo = createConditioningTeamRepository(tx);
      const team = teamOf(s);
      const duplicada = { ...team[0]!, position: 3 };

      const error = await expectThrowsInSavepoint(tx, () => repo.insertAll([...team, duplicada]));

      expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      expect((error as Prisma.PrismaClientKnownRequestError).code).toBe('P2002');
      expect(await rawTeam(tx, s.orderId)).toEqual([]);
    });
  });

  it('R13: una segunda insercion que repite a alguien ya guardado lanza y no toca lo guardado', async () => {
    await inRolledBackTransaction(async (tx) => {
      const s = await seedScenario(tx);
      const repo = createConditioningTeamRepository(tx);
      await repo.insertAll(teamOf(s).slice(0, 1));
      const antes = await rawTeam(tx, s.orderId);

      await expectThrowsInSavepoint(tx, () => repo.insertAll(teamOf(s).slice(0, 1)));

      expect(await rawTeam(tx, s.orderId)).toEqual(antes);
    });
  });
});

describe('el equipo guardado no cambia cuando cambian los grupos o las personas (R14)', () => {
  it('R14: renombrar el grupo, darlo de baja, sacar o meter miembros y dar de baja a una persona no cambia ninguna fila', async () => {
    await inRolledBackTransaction(async (tx) => {
      const s = await seedScenario(tx);
      const repo = createConditioningTeamRepository(tx);
      for (const userId of [s.users[1], s.users[2]]) {
        await tx.workGroupMember.create({ data: { companyId: s.companyId, workGroupId: s.groupId, userId } });
      }
      await repo.insertAll(teamOf(s));
      const antes = await rawTeam(tx, s.orderId);
      const leidoAntes = await repo.listByOrderInCompany(s.companyId, s.orderId);

      const nuevoNombre = `Renombrado ${token()}`;
      await tx.workGroup.update({
        where: { id: s.groupId },
        data: { name: nuevoNombre, nameNormalized: normalizeWorkGroupName(nuevoNombre) },
      });
      await tx.workGroupMember.delete({
        where: { workGroupId_userId: { workGroupId: s.groupId, userId: s.users[2] } },
      });
      const recienLlegado = await createUser(tx, s.companyId);
      await tx.workGroupMember.create({
        data: { companyId: s.companyId, workGroupId: s.groupId, userId: recienLlegado },
      });
      await tx.user.update({ where: { id: s.users[1] }, data: { deletedAt: new Date() } });
      await tx.workGroup.update({ where: { id: s.groupId }, data: { deletedAt: new Date() } });

      expect(await rawTeam(tx, s.orderId)).toEqual(antes);
      expect(await repo.listByOrderInCompany(s.companyId, s.orderId)).toEqual(leidoAntes);
      expect(antes.map((row) => row.work_group_name)).toEqual([null, s.groupName, s.groupName]);
    });
  });
});
