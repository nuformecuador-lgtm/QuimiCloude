// tests/integration/identity/conditioning-role-migration.int.test.ts
/**
 * La migracion `db/migrations/*_conditioning_role/` contra Postgres real.
 *
 * Cada `it` corre dentro de `prisma.$transaction` y termina lanzando `RollbackSignal`: ninguna
 * fila escrita por un test sobrevive.
 *
 * El SQL se lee del archivo, no se copia: si alguien le quita un `ON CONFLICT` o reordena el
 * `down.sql`, este archivo lo nota aplicando el SQL real.
 *
 * «Base sembrada antes de la migracion» se simula dentro del `tx` borrando el rol, el permiso y
 * sus asignaciones; asi el resultado no depende de si la base local ya corrio la migracion o el
 * seed.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';

import {
  DOCUMENT_TYPE_CC,
  PERMISSIONS,
  ROLE_ACONDICIONAMIENTO,
  ROLE_ADMINISTRADOR,
  ROLE_EMPACADOR,
  ROLE_MAESTRO,
  ROLE_OPERADOR,
  SEED_ROLES,
  SEED_ROLE_PERMISSIONS,
  normalizeCompanyName,
} from '@/lib/modules/identity';
import { prisma } from '@/lib/shared/db/prisma';

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

const FOREIGN_KEY_VIOLATION = '23503';

function sqlStateOf(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const meta: unknown = error.meta;
    if (typeof meta === 'object' && meta !== null && 'code' in meta) {
      const code: unknown = (meta as { code: unknown }).code;
      if (typeof code === 'string') return code;
    }
    return error.code;
  }
  if (error instanceof Prisma.PrismaClientUnknownRequestError) return error.message;
  return error instanceof Error ? error.message : String(error);
}

/** Corre `run` esperando un rechazo de la base, dentro de un `SAVEPOINT` para poder seguir usando el `tx`. */
async function expectRejectedByDatabase(
  tx: Prisma.TransactionClient,
  run: () => Promise<unknown>,
  what: string,
): Promise<string> {
  savepointSeq += 1;
  const savepoint = `qc216_sp_${String(savepointSeq)}`;
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

function locateMigrationDir(): string {
  const migrationsDir = join(findRepoRoot(dirname(fileURLToPath(import.meta.url))), 'db', 'migrations');
  const carpetas = readdirSync(migrationsDir).filter((name) => /_conditioning_role$/.test(name));
  expect(carpetas, 'debe existir exactamente una migracion del rol de acondicionamiento').toHaveLength(1);
  return join(migrationsDir, carpetas[0] as string);
}

const migrationDir = locateMigrationDir();

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

const UP_STATEMENTS = statementsOf(readFileSync(join(migrationDir, 'migration.sql'), 'utf8'));
const DOWN_STATEMENTS = statementsOf(readFileSync(join(migrationDir, 'down.sql'), 'utf8'));

expect(UP_STATEMENTS, 'el UP de esta migracion son exactamente tres sentencias').toHaveLength(3);
expect(DOWN_STATEMENTS, 'el DOWN de esta migracion son exactamente cuatro sentencias').toHaveLength(4);

async function applyStatements(tx: Prisma.TransactionClient, statements: readonly string[]): Promise<void> {
  for (const statement of statements) {
    await tx.$executeRawUnsafe(statement);
  }
}

const CODIGO = 'acondicionamiento.modificar';
const OTROS_ROLES = [ROLE_ADMINISTRADOR, ROLE_OPERADOR, ROLE_EMPACADOR, ROLE_MAESTRO] as const;

const ROL_SEED_ROW = SEED_ROLES.find((role) => role.name === ROLE_ACONDICIONAMIENTO);
if (ROL_SEED_ROW === undefined) {
  throw new Error('SEED_ROLES no declara el rol de acondicionamiento: este archivo no puede afirmar sobre su fila');
}

const PERMISO = PERMISSIONS.find((permission) => permission.code === CODIGO);
if (PERMISO === undefined) {
  throw new Error('PERMISSIONS no declara acondicionamiento.modificar: este archivo no puede afirmar sobre su fila');
}

const CODIGOS_DEL_ROL = [...(SEED_ROLE_PERMISSIONS[ROLE_ACONDICIONAMIENTO] ?? [])].sort();
if (CODIGOS_DEL_ROL.length === 0) {
  throw new Error('SEED_ROLE_PERMISSIONS no declara el rol de acondicionamiento');
}

async function eraseFeatureRows(tx: Prisma.TransactionClient): Promise<void> {
  await tx.rolePermission.deleteMany({
    where: { OR: [{ permissionCode: CODIGO }, { role: { name: ROLE_ACONDICIONAMIENTO } }] },
  });
  await tx.permission.deleteMany({ where: { code: CODIGO } });
  await tx.role.deleteMany({ where: { name: ROLE_ACONDICIONAMIENTO } });
}

async function codigosDe(tx: Prisma.TransactionClient, roleName: string): Promise<readonly string[]> {
  const filas = await tx.rolePermission.findMany({
    where: { role: { name: roleName } },
    select: { permissionCode: true },
    orderBy: { permissionCode: 'asc' },
  });
  return filas.map((fila) => fila.permissionCode);
}

async function filasDeOtrosRoles(tx: Prisma.TransactionClient) {
  return tx.rolePermission.findMany({
    where: { role: { name: { in: [...OTROS_ROLES] } } },
    orderBy: [{ roleId: 'asc' }, { permissionCode: 'asc' }],
  });
}

async function snapshot(tx: Prisma.TransactionClient) {
  return {
    roles: await tx.role.findMany({ orderBy: { id: 'asc' } }),
    permissions: await tx.permission.findMany({ orderBy: { code: 'asc' } }),
    rolePermissions: await tx.rolePermission.findMany({
      orderBy: [{ roleId: 'asc' }, { permissionCode: 'asc' }],
    }),
  };
}

async function createUserWithRole(tx: Prisma.TransactionClient, roleId: string): Promise<string> {
  const name = `qc216-t11-${randomUUID()}`;
  const company = await tx.company.create({
    data: { name, nameNormalized: normalizeCompanyName(name) },
    select: { id: true },
  });
  const tag = randomUUID();
  const user = await tx.user.create({
    data: {
      firstNames: 'Ana Maria',
      lastNames: 'Perez Gomez',
      birthDate: new Date('1990-05-17T00:00:00.000Z'),
      email: `${tag}@example.com`,
      phone: '+57 300 111 2233',
      documentTypeCode: DOCUMENT_TYPE_CC,
      documentNumber: tag.replaceAll('-', '').slice(0, 15),
      username: tag,
      passwordHash: 'hash-de-prueba-no-es-un-algoritmo-real',
      roleId,
      companyId: company.id,
      accountStatus: 'active',
    },
    select: { id: true },
  });
  return user.id;
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('migracion conditioning_role contra Postgres real', () => {
  it('R21: el UP sobre una base sembrada antes de la feature crea el rol, el permiso y exactamente sus dos asignaciones; los otros cuatro roles quedan identicos', async () => {
    await inRolledBackTransaction(async (tx) => {
      await eraseFeatureRows(tx);
      expect(await tx.role.findUnique({ where: { name: ROLE_ACONDICIONAMIENTO } })).toBeNull();
      expect(await tx.permission.findUnique({ where: { code: CODIGO } })).toBeNull();

      const otrosAntes = await filasDeOtrosRoles(tx);
      expect(otrosAntes.length).toBeGreaterThan(0);
      const totalAntes = await tx.rolePermission.count();

      await applyStatements(tx, UP_STATEMENTS);

      const rol = await tx.role.findUnique({ where: { name: ROLE_ACONDICIONAMIENTO } });
      expect(rol?.description).toBe(ROL_SEED_ROW.description);

      expect(await tx.permission.findUnique({ where: { code: CODIGO } })).toMatchObject({
        code: PERMISO.code,
        module: PERMISO.module,
        action: PERMISO.action,
        description: PERMISO.description,
      });

      expect(await codigosDe(tx, ROLE_ACONDICIONAMIENTO)).toEqual(CODIGOS_DEL_ROL);
      expect(await tx.rolePermission.count()).toBe(totalAntes + CODIGOS_DEL_ROL.length);
      expect(await tx.rolePermission.findMany({ where: { permissionCode: CODIGO }, select: { roleId: true } })).toEqual([
        { roleId: rol?.id },
      ]);

      expect(await filasDeOtrosRoles(tx)).toEqual(otrosAntes);
      expect(await codigosDe(tx, ROLE_ADMINISTRADOR)).not.toContain(CODIGO);
    });
  });

  it('R22: aplicar el UP dos veces no falla, no duplica ni reescribe ninguna fila, updated_at incluido', async () => {
    await inRolledBackTransaction(async (tx) => {
      await applyStatements(tx, UP_STATEMENTS);
      const antes = await snapshot(tx);
      expect(antes.roles.some((role) => role.name === ROLE_ACONDICIONAMIENTO)).toBe(true);

      await applyStatements(tx, UP_STATEMENTS);

      expect(await snapshot(tx)).toEqual(antes);
    });
  });

  it('R22: si el rol ya existe con otra descripcion, el UP no la reescribe y solo anade las asignaciones que faltan', async () => {
    await inRolledBackTransaction(async (tx) => {
      await eraseFeatureRows(tx);
      const rolPrevio = await tx.role.create({
        data: { name: ROLE_ACONDICIONAMIENTO, description: 'Escrita a mano antes de la migracion.' },
      });

      await applyStatements(tx, UP_STATEMENTS);

      expect(await tx.role.findUnique({ where: { name: ROLE_ACONDICIONAMIENTO } })).toEqual(rolPrevio);
      expect(await codigosDe(tx, ROLE_ACONDICIONAMIENTO)).toEqual(CODIGOS_DEL_ROL);
    });
  });

  it('R25: el DOWN sin usuarios con el rol deja la base exactamente como antes de la migracion', async () => {
    await inRolledBackTransaction(async (tx) => {
      await eraseFeatureRows(tx);
      const antesDeLaMigracion = await snapshot(tx);

      await applyStatements(tx, UP_STATEMENTS);
      expect(await tx.role.findUnique({ where: { name: ROLE_ACONDICIONAMIENTO } })).not.toBeNull();

      await applyStatements(tx, DOWN_STATEMENTS);

      expect(await snapshot(tx)).toEqual(antesDeLaMigracion);
    });
  });

  it('R25: el DOWN retira el permiso de cualquier rol que lo tenga, no solo de las filas que puso el UP', async () => {
    await inRolledBackTransaction(async (tx) => {
      await applyStatements(tx, UP_STATEMENTS);
      const operador = await tx.role.findUniqueOrThrow({ where: { name: ROLE_OPERADOR } });
      await tx.rolePermission.create({ data: { roleId: operador.id, permissionCode: CODIGO } });
      const operadorSinElCodigo = (await codigosDe(tx, ROLE_OPERADOR)).filter((codigo) => codigo !== CODIGO);

      await applyStatements(tx, DOWN_STATEMENTS);

      expect(await tx.rolePermission.findMany({ where: { permissionCode: CODIGO } })).toEqual([]);
      expect(await codigosDe(tx, ROLE_OPERADOR)).toEqual(operadorSinElCodigo);
    });
  });

  it('R25: el DOWN con un usuario que tiene el rol falla con 23503 y no deja nada a medias', async () => {
    await inRolledBackTransaction(async (tx) => {
      await applyStatements(tx, UP_STATEMENTS);
      const rol = await tx.role.findUniqueOrThrow({ where: { name: ROLE_ACONDICIONAMIENTO } });
      await createUserWithRole(tx, rol.id);

      const antes = await snapshot(tx);

      const codigo = await expectRejectedByDatabase(
        tx,
        () => applyStatements(tx, DOWN_STATEMENTS),
        'DOWN de conditioning_role con un usuario del rol vivo',
      );

      expect(codigo).toBe(FOREIGN_KEY_VIOLATION);
      expect(await snapshot(tx)).toEqual(antes);
    });
  });
});
