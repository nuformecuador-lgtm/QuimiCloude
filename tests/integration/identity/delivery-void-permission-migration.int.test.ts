// tests/integration/identity/delivery-void-permission-migration.int.test.ts
/**
 * La migracion `db/migrations/*_delivery_void_permission/` contra Postgres REAL.
 *
 * AISLAMIENTO — mismo patron que `execution-permission-migration.int.test.ts`: cada `it` corre
 * dentro de `prisma.$transaction` interactiva y termina lanzando `RollbackSignal`, asi que Prisma
 * emite `ROLLBACK` y ninguna fila escrita por un test sobrevive.
 *
 * El SQL se lee del archivo, no se copia a mano. "Base sembrada antes de esta migracion" se simula
 * dentro del `tx` borrando el permiso y sus asignaciones; los roles ya existen.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Prisma } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';

import {
  PERMISSIONS,
  ROLE_ACONDICIONAMIENTO,
  ROLE_ADMINISTRADOR,
  ROLE_EMPACADOR,
  ROLE_MAESTRO,
  ROLE_OPERADOR,
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

function locateDeliveryVoidPermissionMigrationDir(): string {
  const migrationsDir = join(findRepoRoot(dirname(fileURLToPath(import.meta.url))), 'db', 'migrations');
  const carpetas = readdirSync(migrationsDir).filter((name) => /^\d{14}_delivery_void_permission$/.test(name));
  expect(carpetas, 'debe existir exactamente una migracion del permiso de anulacion de entregas').toHaveLength(1);
  return join(migrationsDir, carpetas[0] as string);
}

const migrationDir = locateDeliveryVoidPermissionMigrationDir();

/** Quita comentarios y trocea en sentencias ejecutables, en el mismo orden del archivo. */
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

async function applyStatements(tx: Prisma.TransactionClient, statements: readonly string[]): Promise<void> {
  for (const statement of statements) {
    await tx.$executeRawUnsafe(statement);
  }
}

const ANULAR = 'entregas.anular';

const ANULAR_ENTRY = PERMISSIONS.find((permission) => permission.code === ANULAR);
if (ANULAR_ENTRY === undefined) {
  throw new Error('PERMISSIONS no declara entregas.anular: este archivo no puede afirmar sobre su fila');
}

const ROLES_SIN_EL_PERMISO = [ROLE_OPERADOR, ROLE_EMPACADOR, ROLE_MAESTRO, ROLE_ACONDICIONAMIENTO] as const;

async function eraseFeatureRows(tx: Prisma.TransactionClient): Promise<void> {
  await tx.rolePermission.deleteMany({ where: { permissionCode: ANULAR } });
  await tx.permission.deleteMany({ where: { code: ANULAR } });
}

async function codigosDe(tx: Prisma.TransactionClient, roleName: string): Promise<readonly string[]> {
  const filas = await tx.rolePermission.findMany({
    where: { role: { name: roleName } },
    select: { permissionCode: true },
    orderBy: { permissionCode: 'asc' },
  });
  return filas.map((fila) => fila.permissionCode);
}

/** Todo lo que la migracion NO debe tocar: permisos, asignaciones y roles ajenos a la anulacion. */
async function retratoAjeno(tx: Prisma.TransactionClient) {
  return {
    permisos: await tx.permission.findMany({
      where: { code: { not: ANULAR } },
      orderBy: { code: 'asc' },
    }),
    asignaciones: await tx.rolePermission.findMany({
      where: { permissionCode: { not: ANULAR } },
      orderBy: [{ roleId: 'asc' }, { permissionCode: 'asc' }],
    }),
    roles: await tx.role.findMany({ orderBy: { name: 'asc' } }),
  };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('migracion delivery_void_permission: el SQL contra las constantes de la app', () => {
  it('R1: el UP y el DOWN son exactamente dos sentencias cada uno, sin ALTER, DROP, UPDATE ni CASCADE', () => {
    expect(UP_STATEMENTS).toHaveLength(2);
    expect(DOWN_STATEMENTS).toHaveLength(2);
    for (const statement of [...UP_STATEMENTS, ...DOWN_STATEMENTS]) {
      expect(statement).not.toMatch(/\b(ALTER|DROP|UPDATE|CASCADE|TRUNCATE)\b/i);
    }
    expect(DOWN_STATEMENTS[0]).toMatch(/^DELETE FROM "role_permissions"/);
    expect(DOWN_STATEMENTS[1]).toMatch(/^DELETE FROM "permissions"/);
  });

  it('R1: los literales del SQL coinciden con PERMISSIONS y solo nombran al Administrador', () => {
    const [insertPermiso, insertAsignaciones] = UP_STATEMENTS;

    expect(insertPermiso).toContain(`'${ANULAR_ENTRY.code}'`);
    expect(insertPermiso).toContain(`'${ANULAR_ENTRY.module}'`);
    expect(insertPermiso).toContain(`'${ANULAR_ENTRY.action}'`);
    expect(insertPermiso).toContain(`'${ANULAR_ENTRY.description}'`);
    expect(insertAsignaciones).toContain(`'${ANULAR}'`);
    expect(insertAsignaciones).toContain(`'${ROLE_ADMINISTRADOR}'`);
    for (const rol of ROLES_SIN_EL_PERMISO) {
      expect(insertAsignaciones).not.toContain(`'${rol}'`);
    }
    for (const statement of DOWN_STATEMENTS) {
      expect(statement).toContain(`'${ANULAR}'`);
    }
  });
});

describe('migracion delivery_void_permission contra Postgres real', () => {
  it('R1: el UP sobre una base sembrada sin el permiso lo crea y lo asigna solo al Administrador, sin tocar ninguna otra fila', async () => {
    await inRolledBackTransaction(async (tx) => {
      for (const rol of [ROLE_ADMINISTRADOR, ...ROLES_SIN_EL_PERMISO]) {
        expect(await tx.role.findUnique({ where: { name: rol } }), rol).not.toBeNull();
      }
      await eraseFeatureRows(tx);
      expect(await tx.permission.findUnique({ where: { code: ANULAR } })).toBeNull();
      const antes = await retratoAjeno(tx);

      await applyStatements(tx, UP_STATEMENTS);

      expect(await tx.permission.findUnique({ where: { code: ANULAR } })).toMatchObject({
        code: ANULAR_ENTRY.code,
        module: ANULAR_ENTRY.module,
        action: ANULAR_ENTRY.action,
        description: ANULAR_ENTRY.description,
      });
      const asignadas = await tx.rolePermission.findMany({
        where: { permissionCode: ANULAR },
        select: { role: { select: { name: true } } },
      });
      expect(asignadas.map((fila) => fila.role.name)).toEqual([ROLE_ADMINISTRADOR]);
      for (const rol of ROLES_SIN_EL_PERMISO) {
        expect(await codigosDe(tx, rol), rol).not.toContain(ANULAR);
      }

      expect(await retratoAjeno(tx)).toEqual(antes);
    });
  });

  it('R1: aplicar el UP una segunda vez no duplica ni reescribe ninguna fila, updated_at incluido', async () => {
    await inRolledBackTransaction(async (tx) => {
      await applyStatements(tx, UP_STATEMENTS);
      const permisoAntes = await tx.permission.findUnique({ where: { code: ANULAR } });
      const asignacionesAntes = await tx.rolePermission.findMany({
        where: { permissionCode: ANULAR },
        orderBy: { roleId: 'asc' },
      });
      const ajenoAntes = await retratoAjeno(tx);
      expect(permisoAntes).not.toBeNull();
      expect(asignacionesAntes).toHaveLength(1);

      await applyStatements(tx, UP_STATEMENTS);

      expect(await tx.permission.findUnique({ where: { code: ANULAR } })).toEqual(permisoAntes);
      expect(
        await tx.rolePermission.findMany({ where: { permissionCode: ANULAR }, orderBy: { roleId: 'asc' } }),
      ).toEqual(asignacionesAntes);
      expect(await retratoAjeno(tx)).toEqual(ajenoAntes);
    });
  });

  it('R1: el DOWN retira el permiso y todas sus asignaciones, incluida una puesta a mano, sin tocar ninguna otra fila', async () => {
    await inRolledBackTransaction(async (tx) => {
      await applyStatements(tx, UP_STATEMENTS);
      const operador = await tx.role.findUniqueOrThrow({ where: { name: ROLE_OPERADOR } });
      await tx.rolePermission.create({ data: { roleId: operador.id, permissionCode: ANULAR } });
      expect(await tx.rolePermission.count({ where: { permissionCode: ANULAR } })).toBe(2);
      const antes = await retratoAjeno(tx);

      await applyStatements(tx, DOWN_STATEMENTS);

      expect(await tx.permission.findUnique({ where: { code: ANULAR } })).toBeNull();
      expect(await tx.rolePermission.findMany({ where: { permissionCode: ANULAR } })).toEqual([]);
      expect(await retratoAjeno(tx)).toEqual(antes);
    });
  });

  it('R1: aplicar el DOWN una segunda vez no falla y no cambia nada', async () => {
    await inRolledBackTransaction(async (tx) => {
      await applyStatements(tx, UP_STATEMENTS);
      await applyStatements(tx, DOWN_STATEMENTS);
      const antes = await retratoAjeno(tx);

      await applyStatements(tx, DOWN_STATEMENTS);

      expect(await tx.permission.findUnique({ where: { code: ANULAR } })).toBeNull();
      expect(await retratoAjeno(tx)).toEqual(antes);
    });
  });
});
