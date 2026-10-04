// tests/integration/identity/execution-permission-migration.int.test.ts
/**
 * La migracion `db/migrations/*_execution_permission/` contra Postgres REAL.
 *
 * AISLAMIENTO — mismo patron que `packing-permission-migration.int.test.ts`: cada `it` corre dentro
 * de `prisma.$transaction` interactiva y termina lanzando `RollbackSignal`, asi que Prisma emite
 * `ROLLBACK` y ninguna fila escrita por un test sobrevive.
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

function locateExecutionPermissionMigrationDir(): string {
  const migrationsDir = join(findRepoRoot(dirname(fileURLToPath(import.meta.url))), 'db', 'migrations');
  const carpetas = readdirSync(migrationsDir).filter((name) => /_execution_permission$/.test(name));
  expect(carpetas, 'debe existir exactamente una migracion del permiso de ejecucion').toHaveLength(1);
  return join(migrationsDir, carpetas[0] as string);
}

const migrationDir = locateExecutionPermissionMigrationDir();

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

const EJECUTAR = 'asignaciones.ejecutar';

const EJECUTAR_ENTRY = PERMISSIONS.find((permission) => permission.code === EJECUTAR);
if (EJECUTAR_ENTRY === undefined) {
  throw new Error('PERMISSIONS no declara asignaciones.ejecutar: este archivo no puede afirmar sobre su fila');
}

async function eraseFeatureRows(tx: Prisma.TransactionClient): Promise<void> {
  await tx.rolePermission.deleteMany({ where: { permissionCode: EJECUTAR } });
  await tx.permission.deleteMany({ where: { code: EJECUTAR } });
}

async function codigosDe(tx: Prisma.TransactionClient, roleName: string): Promise<readonly string[]> {
  const filas = await tx.rolePermission.findMany({
    where: { role: { name: roleName } },
    select: { permissionCode: true },
    orderBy: { permissionCode: 'asc' },
  });
  return filas.map((fila) => fila.permissionCode);
}

/** Todo lo que la migracion NO debe tocar: permisos, asignaciones y roles ajenos a `ejecutar`. */
async function retratoAjeno(tx: Prisma.TransactionClient) {
  return {
    permisos: await tx.permission.findMany({
      where: { code: { not: EJECUTAR } },
      orderBy: { code: 'asc' },
    }),
    asignaciones: await tx.rolePermission.findMany({
      where: { permissionCode: { not: EJECUTAR } },
      orderBy: [{ roleId: 'asc' }, { permissionCode: 'asc' }],
    }),
    roles: await tx.role.findMany({ orderBy: { name: 'asc' } }),
  };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('migracion execution_permission: el SQL contra las constantes de la app', () => {
  it('R12: el UP y el DOWN son exactamente dos sentencias cada uno, sin ALTER, DROP, UPDATE ni CASCADE', () => {
    expect(UP_STATEMENTS).toHaveLength(2);
    expect(DOWN_STATEMENTS).toHaveLength(2);
    for (const statement of [...UP_STATEMENTS, ...DOWN_STATEMENTS]) {
      expect(statement).not.toMatch(/\b(ALTER|DROP|UPDATE|CASCADE|TRUNCATE)\b/i);
    }
    expect(DOWN_STATEMENTS[0]).toMatch(/^DELETE FROM "role_permissions"/);
    expect(DOWN_STATEMENTS[1]).toMatch(/^DELETE FROM "permissions"/);
  });

  it('R12: los literales del SQL coinciden con PERMISSIONS y con los nombres de rol de la app', () => {
    const [insertPermiso, insertAsignaciones] = UP_STATEMENTS;

    expect(insertPermiso).toContain(`'${EJECUTAR_ENTRY.code}'`);
    expect(insertPermiso).toContain(`'${EJECUTAR_ENTRY.module}'`);
    expect(insertPermiso).toContain(`'${EJECUTAR_ENTRY.action}'`);
    expect(insertPermiso).toContain(`'${EJECUTAR_ENTRY.description}'`);
    expect(insertAsignaciones).toContain(`'${EJECUTAR}'`);
    expect(insertAsignaciones).toContain(`'${ROLE_ADMINISTRADOR}'`);
    expect(insertAsignaciones).toContain(`'${ROLE_OPERADOR}'`);
    expect(insertAsignaciones).not.toContain(`'${ROLE_EMPACADOR}'`);
    expect(insertAsignaciones).not.toContain(`'${ROLE_MAESTRO}'`);
    for (const statement of DOWN_STATEMENTS) {
      expect(statement).toContain(`'${EJECUTAR}'`);
    }
  });
});

describe('migracion execution_permission contra Postgres real', () => {
  it('R12: el UP sobre una base sembrada antes de esta ficha crea el permiso y lo asigna a Administrador y Operador, sin tocar ninguna otra fila', async () => {
    await inRolledBackTransaction(async (tx) => {
      for (const rol of [ROLE_ADMINISTRADOR, ROLE_OPERADOR, ROLE_EMPACADOR]) {
        expect(await tx.role.findUnique({ where: { name: rol } }), rol).not.toBeNull();
      }
      await eraseFeatureRows(tx);
      expect(await tx.permission.findUnique({ where: { code: EJECUTAR } })).toBeNull();
      const antes = await retratoAjeno(tx);

      await applyStatements(tx, UP_STATEMENTS);

      expect(await tx.permission.findUnique({ where: { code: EJECUTAR } })).toMatchObject({
        code: EJECUTAR_ENTRY.code,
        module: EJECUTAR_ENTRY.module,
        action: EJECUTAR_ENTRY.action,
        description: EJECUTAR_ENTRY.description,
      });
      const asignadas = await tx.rolePermission.findMany({
        where: { permissionCode: EJECUTAR },
        select: { role: { select: { name: true } } },
      });
      expect(asignadas.map((fila) => fila.role.name).sort()).toEqual(
        [ROLE_ADMINISTRADOR, ROLE_OPERADOR].sort(),
      );
      expect(await codigosDe(tx, ROLE_EMPACADOR)).not.toContain(EJECUTAR);
      expect(await codigosDe(tx, ROLE_MAESTRO)).not.toContain(EJECUTAR);

      expect(await retratoAjeno(tx)).toEqual(antes);
    });
  });

  it('R12: aplicar el UP una segunda vez no duplica ni reescribe ninguna fila, updated_at incluido', async () => {
    await inRolledBackTransaction(async (tx) => {
      await applyStatements(tx, UP_STATEMENTS);
      const permisoAntes = await tx.permission.findUnique({ where: { code: EJECUTAR } });
      const asignacionesAntes = await tx.rolePermission.findMany({
        where: { permissionCode: EJECUTAR },
        orderBy: { roleId: 'asc' },
      });
      const ajenoAntes = await retratoAjeno(tx);
      expect(permisoAntes).not.toBeNull();
      expect(asignacionesAntes).toHaveLength(2);

      await applyStatements(tx, UP_STATEMENTS);

      expect(await tx.permission.findUnique({ where: { code: EJECUTAR } })).toEqual(permisoAntes);
      expect(
        await tx.rolePermission.findMany({ where: { permissionCode: EJECUTAR }, orderBy: { roleId: 'asc' } }),
      ).toEqual(asignacionesAntes);
      expect(await retratoAjeno(tx)).toEqual(ajenoAntes);
    });
  });

  it('R13: el DOWN retira el permiso y todas sus asignaciones, incluida una puesta a mano, sin tocar ninguna otra fila', async () => {
    await inRolledBackTransaction(async (tx) => {
      await applyStatements(tx, UP_STATEMENTS);
      const empacador = await tx.role.findUniqueOrThrow({ where: { name: ROLE_EMPACADOR } });
      await tx.rolePermission.create({ data: { roleId: empacador.id, permissionCode: EJECUTAR } });
      expect(await tx.rolePermission.count({ where: { permissionCode: EJECUTAR } })).toBe(3);
      const antes = await retratoAjeno(tx);

      await applyStatements(tx, DOWN_STATEMENTS);

      expect(await tx.permission.findUnique({ where: { code: EJECUTAR } })).toBeNull();
      expect(await tx.rolePermission.findMany({ where: { permissionCode: EJECUTAR } })).toEqual([]);
      expect(await retratoAjeno(tx)).toEqual(antes);
    });
  });

  it('R13: aplicar el DOWN una segunda vez no falla y no cambia nada', async () => {
    await inRolledBackTransaction(async (tx) => {
      await applyStatements(tx, UP_STATEMENTS);
      await applyStatements(tx, DOWN_STATEMENTS);
      const antes = await retratoAjeno(tx);

      await applyStatements(tx, DOWN_STATEMENTS);

      expect(await tx.permission.findUnique({ where: { code: EJECUTAR } })).toBeNull();
      expect(await retratoAjeno(tx)).toEqual(antes);
    });
  });
});
