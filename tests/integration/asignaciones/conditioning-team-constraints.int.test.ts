/**
 * Las restricciones de `order_conditioning_team_members` contra una base Postgres REAL, y la
 * reversion de su migracion.
 *
 * Lo que vigila el SQL escrito es el test de esquema de la migracion; aqui se comprueba lo que la
 * base HACE cuando alguien lo intenta.
 *
 * Cada `it` corre dentro de una transaccion interactiva que siempre termina en `ROLLBACK`, y cada
 * operacion que se espera rechazada va en un SAVEPOINT para poder seguir afirmando despues dentro
 * de la misma transaccion. Todo `INSERT` sobre la tabla es SQL crudo, y se afirma sobre el SQLSTATE,
 * nunca sobre el texto. Cada transaccion fabrica sus dos empresas efimeras: nada depende del seed.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Prisma } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';

import { normalizeCompanyName, normalizeWorkGroupName } from '@/lib/modules/identity';
import { prisma } from '@/lib/shared/db/prisma';

class RollbackSignal extends Error {
  constructor() {
    super('rollback de aislamiento del test');
    this.name = 'RollbackSignal';
  }
}

async function inRolledBackTransaction(
  body: (tx: Prisma.TransactionClient) => Promise<void>,
  isolationLevel?: Prisma.TransactionIsolationLevel,
): Promise<void> {
  try {
    await prisma.$transaction(
      async (tx) => {
        await body(tx);
        throw new RollbackSignal();
      },
      { maxWait: 10_000, timeout: 30_000, ...(isolationLevel === undefined ? {} : { isolationLevel }) },
    );
  } catch (error) {
    if (!(error instanceof RollbackSignal)) throw error;
  }
}

const TABLE = 'order_conditioning_team_members';
const CHECK_VIOLATION = '23514';
const FOREIGN_KEY_VIOLATION = '23503';
const UNIQUE_VIOLATION = '23505';
const DEPENDENT_OBJECTS_STILL_EXIST = '2BP01';

let savepointSeq = 0;

function sqlStateOf(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const meta: unknown = error.meta;
    if (typeof meta === 'object' && meta !== null && 'code' in meta) {
      const code: unknown = (meta as { code: unknown }).code;
      if (typeof code === 'string') return code;
    }
    return error.code;
  }
  return error instanceof Error ? error.message : String(error);
}

async function expectRejectedByDatabase(
  tx: Prisma.TransactionClient,
  run: () => Promise<unknown>,
  what: string,
): Promise<string> {
  savepointSeq += 1;
  const savepoint = `sp_team_${String(savepointSeq)}`;
  await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`);
  try {
    await run();
  } catch (error) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    return sqlStateOf(error);
  }
  await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`);
  throw new Error(`se esperaba que la base rechazara la operacion, pero la acepto: ${what}`);
}

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

async function createCompany(tx: Prisma.TransactionClient, label: string): Promise<string> {
  const name = `Empresa ${label} ${token()}`;
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
      firstNames: 'Ana Maria',
      lastNames: 'Perez Gomez',
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

let nextSequence = 830_000;

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

async function createGroup(tx: Prisma.TransactionClient, companyId: string): Promise<string> {
  const name = `Turno ${token()}`;
  const group = await tx.workGroup.create({
    data: { companyId, name, nameNormalized: normalizeWorkGroupName(name) },
    select: { id: true },
  });
  return group.id;
}

interface Company {
  readonly companyId: string;
  readonly orderId: string;
  readonly userId: string;
  readonly otherUserId: string;
  readonly groupId: string;
}

interface Fixtures {
  readonly a: Company;
  readonly b: Company;
}

async function seedCompany(tx: Prisma.TransactionClient, label: string): Promise<Company> {
  const companyId = await createCompany(tx, label);
  return {
    companyId,
    orderId: await createOrder(tx, companyId),
    userId: await createUser(tx, companyId),
    otherUserId: await createUser(tx, companyId),
    groupId: await createGroup(tx, companyId),
  };
}

async function seedFixtures(tx: Prisma.TransactionClient): Promise<Fixtures> {
  return { a: await seedCompany(tx, 'A'), b: await seedCompany(tx, 'B') };
}

interface MemberValues {
  readonly companyId: string;
  readonly orderId: string;
  readonly userId: string;
  readonly workGroupId: string | null;
  readonly workGroupName: string | null;
  readonly position: number;
}

function rawInsertMember(tx: Prisma.TransactionClient, v: MemberValues): Promise<number> {
  return tx.$executeRaw`
    INSERT INTO "order_conditioning_team_members"
      ("company_id", "order_id", "user_id", "work_group_id", "work_group_name", "position")
    VALUES (
      CAST(${v.companyId} AS uuid),
      CAST(${v.orderId} AS uuid),
      CAST(${v.userId} AS uuid),
      CAST(${v.workGroupId} AS uuid),
      CAST(${v.workGroupName} AS text),
      CAST(${v.position} AS integer)
    )`;
}

/** Fila valida y suelta de la empresa A; cada caso cambia solo lo que quiere forzar. */
function memberOf(f: Fixtures, overrides: Partial<MemberValues> = {}): MemberValues {
  return {
    companyId: f.a.companyId,
    orderId: f.a.orderId,
    userId: f.a.userId,
    workGroupId: null,
    workGroupName: null,
    position: 0,
    ...overrides,
  };
}

async function countMembers(tx: Prisma.TransactionClient, orderId: string): Promise<number> {
  const rows = await tx.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM "order_conditioning_team_members" WHERE "order_id" = CAST(${orderId} AS uuid)`;
  return rows[0]?.n ?? 0;
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('order_conditioning_team_members — empresa de la fila (R23)', () => {
  it('R23: rechaza persona, grupo o pedido de la empresa B en una fila de la A, con SQLSTATE 23503', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx);

      const personaAjena = await expectRejectedByDatabase(
        tx,
        () => rawInsertMember(tx, memberOf(f, { userId: f.b.userId })),
        'persona de la empresa B',
      );
      expect(personaAjena).toBe(FOREIGN_KEY_VIOLATION);

      const grupoAjeno = await expectRejectedByDatabase(
        tx,
        () => rawInsertMember(tx, memberOf(f, { workGroupId: f.b.groupId, workGroupName: 'Turno B' })),
        'grupo de la empresa B',
      );
      expect(grupoAjeno).toBe(FOREIGN_KEY_VIOLATION);

      const pedidoAjeno = await expectRejectedByDatabase(
        tx,
        () => rawInsertMember(tx, memberOf(f, { orderId: f.b.orderId })),
        'pedido de la empresa B',
      );
      expect(pedidoAjeno).toBe(FOREIGN_KEY_VIOLATION);

      expect(await countMembers(tx, f.a.orderId)).toBe(0);
      expect(await countMembers(tx, f.b.orderId)).toBe(0);
    });
  });

  it('R23: acepta persona suelta y persona con grupo de la misma empresa, en la A y en la B', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx);
      expect(await rawInsertMember(tx, memberOf(f))).toBe(1);
      expect(
        await rawInsertMember(
          tx,
          memberOf(f, { userId: f.a.otherUserId, workGroupId: f.a.groupId, workGroupName: 'Turno A', position: 1 }),
        ),
      ).toBe(1);
      expect(
        await rawInsertMember(tx, {
          ...memberOf(f),
          companyId: f.b.companyId,
          orderId: f.b.orderId,
          userId: f.b.userId,
          workGroupId: f.b.groupId,
          workGroupName: 'Turno B',
        }),
      ).toBe(1);
      expect(await countMembers(tx, f.a.orderId)).toBe(2);
      expect(await countMembers(tx, f.b.orderId)).toBe(1);
    });
  });
});

describe('order_conditioning_team_members_work_group_name_matches_group (R23)', () => {
  it('R23: rechaza grupo sin nombre y nombre sin grupo, con SQLSTATE 23514', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx);

      const grupoSinNombre = await expectRejectedByDatabase(
        tx,
        () => rawInsertMember(tx, memberOf(f, { workGroupId: f.a.groupId, workGroupName: null })),
        'grupo sin nombre',
      );
      expect(grupoSinNombre).toBe(CHECK_VIOLATION);

      const nombreSinGrupo = await expectRejectedByDatabase(
        tx,
        () => rawInsertMember(tx, memberOf(f, { workGroupId: null, workGroupName: 'Turno A' })),
        'nombre sin grupo',
      );
      expect(nombreSinGrupo).toBe(CHECK_VIOLATION);

      expect(await countMembers(tx, f.a.orderId)).toBe(0);
    });
  });
});

describe('order_conditioning_team_members — persona y posicion unicas (R23)', () => {
  it('R23: rechaza la misma persona dos veces en el mismo pedido, con SQLSTATE 23505', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx);
      expect(await rawInsertMember(tx, memberOf(f))).toBe(1);

      const repetida = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsertMember(
            tx,
            memberOf(f, { workGroupId: f.a.groupId, workGroupName: 'Turno A', position: 1 }),
          ),
        'persona repetida por otro camino',
      );
      expect(repetida).toBe(UNIQUE_VIOLATION);
      expect(await countMembers(tx, f.a.orderId)).toBe(1);
    });
  });

  it('R23: rechaza una posicion negativa (23514) y una posicion repetida en el pedido (23505)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx);

      const negativa = await expectRejectedByDatabase(
        tx,
        () => rawInsertMember(tx, memberOf(f, { position: -1 })),
        'posicion -1',
      );
      expect(negativa).toBe(CHECK_VIOLATION);

      expect(await rawInsertMember(tx, memberOf(f, { position: 0 }))).toBe(1);
      const repetida = await expectRejectedByDatabase(
        tx,
        () => rawInsertMember(tx, memberOf(f, { userId: f.a.otherUserId, position: 0 })),
        'posicion 0 repetida',
      );
      expect(repetida).toBe(UNIQUE_VIOLATION);

      expect(await rawInsertMember(tx, memberOf(f, { userId: f.a.otherUserId, position: 1 }))).toBe(1);
      expect(await countMembers(tx, f.a.orderId)).toBe(2);
    });
  });
});

describe('order_conditioning_team_members — RLS (R32)', () => {
  it('R32: la RLS esta activada y forzada, sin policies', async () => {
    await inRolledBackTransaction(async (tx) => {
      const rls = await tx.$queryRaw<{ relrowsecurity: boolean; relforcerowsecurity: boolean }[]>`
        SELECT relrowsecurity, relforcerowsecurity FROM pg_class
        WHERE relname = 'order_conditioning_team_members' AND relkind = 'r'`;
      expect(rls).toEqual([{ relrowsecurity: true, relforcerowsecurity: true }]);

      const policies = await tx.$queryRaw<{ n: number }[]>`
        SELECT COUNT(*)::int AS n FROM pg_policies WHERE tablename = 'order_conditioning_team_members'`;
      expect(policies).toEqual([{ n: 0 }]);
    });
  });
});

// ---------------------------------------------------------------------------
// La migracion, leida de sus archivos y aplicada dentro de una transaccion revertida
// ---------------------------------------------------------------------------

function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (;;) {
    try {
      readFileSync(join(dir, 'package.json'));
      return dir;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) throw new Error(`no se encontro package.json subiendo desde ${startDir}`);
      dir = parent;
    }
  }
}

function statementsOf(sql: string): readonly string[] {
  return sql
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

const migrationDir = join(
  findRepoRoot(dirname(fileURLToPath(import.meta.url))),
  'db',
  'migrations',
  '20261008150000_order_conditioning_team',
);
const UP_STATEMENTS = statementsOf(readFileSync(join(migrationDir, 'migration.sql'), 'utf8'));
const DOWN_STATEMENTS = statementsOf(readFileSync(join(migrationDir, 'down.sql'), 'utf8'));

async function applyStatements(tx: Prisma.TransactionClient, statements: readonly string[]): Promise<void> {
  for (const statement of statements) {
    await tx.$executeRawUnsafe(statement);
  }
}

/** El catalogo de la base que la migracion podria tocar, y la huella de las filas de los padres. */
async function schemaSnapshot(tx: Prisma.TransactionClient) {
  const tables = await tx.$queryRaw<{ name: string }[]>`
    SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'i', 'S', 'v') ORDER BY c.relname`;
  const constraints = await tx.$queryRaw<{ name: string; owner: string; def: string }[]>`
    SELECT con.conname AS name, cls.relname AS owner, pg_get_constraintdef(con.oid) AS def
    FROM pg_constraint con JOIN pg_class cls ON cls.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = cls.relnamespace
    WHERE n.nspname = 'public' ORDER BY cls.relname, con.conname`;
  const rows = await tx.$queryRaw<{ orders: string | null; users: string | null; work_groups: string | null }[]>`
    SELECT
      (SELECT md5(string_agg(o::text, ',' ORDER BY o.id)) FROM "orders" o) AS orders,
      (SELECT md5(string_agg(u::text, ',' ORDER BY u.id)) FROM "users" u) AS users,
      (SELECT md5(string_agg(g::text, ',' ORDER BY g.id)) FROM "work_groups" g) AS work_groups`;
  return { tables, constraints, rows };
}

async function tableExists(tx: Prisma.TransactionClient): Promise<boolean> {
  const rows = await tx.$queryRaw<{ found: boolean }[]>`
    SELECT to_regclass('public.order_conditioning_team_members') IS NOT NULL AS found`;
  return rows[0]?.found ?? false;
}

describe('migracion order_conditioning_team — UP sin tocar filas, DOWN limpio (R32)', () => {
  it('R32: el DOWN, leido del archivo, borra la tabla entera y deja la base como antes del UP', async () => {
    await inRolledBackTransaction(async (tx) => {
      await applyStatements(tx, DOWN_STATEMENTS);
      expect(await tableExists(tx)).toBe(false);
      const antesDelUp = await schemaSnapshot(tx);

      await applyStatements(tx, UP_STATEMENTS);
      expect(await tableExists(tx)).toBe(true);
      const tras = await schemaSnapshot(tx);
      // El UP no toca ninguna fila existente ni ninguna restriccion ajena: lo unico nuevo es suyo.
      expect(tras.rows).toEqual(antesDelUp.rows);
      expect(tras.constraints.filter((c) => c.owner !== TABLE)).toEqual(antesDelUp.constraints);
      const ningunEquipo = await tx.$queryRaw<{ n: number }[]>`
        SELECT COUNT(*)::int AS n FROM "order_conditioning_team_members"`;
      expect(ningunEquipo).toEqual([{ n: 0 }]);

      await applyStatements(tx, DOWN_STATEMENTS);
      expect(await tableExists(tx)).toBe(false);
      expect(await schemaSnapshot(tx)).toEqual(antesDelUp);
      // Otros archivos de la corrida escriben a la vez: la foto fija es la que hace estable la huella.
    }, Prisma.TransactionIsolationLevel.RepeatableRead);
  });

  it('R32: control: el DOWN sin CASCADE falla si algo posterior depende de la tabla', async () => {
    await inRolledBackTransaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `CREATE VIEW "qc_probe_team_view" AS SELECT "order_id" FROM "order_conditioning_team_members"`,
      );
      const estado = await expectRejectedByDatabase(
        tx,
        () => applyStatements(tx, DOWN_STATEMENTS),
        'DROP TABLE con una vista que depende',
      );
      expect(estado).toBe(DEPENDENT_OBJECTS_STILL_EXIST);
      expect(await tableExists(tx)).toBe(true);
    });
  });
});
