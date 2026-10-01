// tests/integration/identity/packing-permission-migration.int.test.ts
/**
 * La migracion `db/migrations/*_packing_permission/` contra Postgres REAL.
 *
 * AISLAMIENTO — mismo patron que `packer-role-migration.int.test.ts`: cada `it` corre dentro de
 * `prisma.$transaction` interactiva y termina lanzando `RollbackSignal`, asi que Prisma emite
 * `ROLLBACK` y ninguna fila escrita por un test sobrevive.
 *
 * EL SQL SE LEE DEL ARCHIVO, no se copia a mano: si alguien le quita un `ON CONFLICT`, este
 * archivo lo nota aplicando el SQL real, no una copia que ya no lo representa.
 *
 * "BASE SEMBRADA ANTES DE ESTA MIGRACION" se simula DENTRO del `tx`: se borra la asignacion y el
 * permiso que trae esta migracion, dejando intacto el rol Empacador -que ya existia por
 * `packer_role`- y el resto de la instalacion.
 *
 * Esta migracion, a diferencia de `packer_role`, no crea ningun rol: su DOWN no puede chocar con
 * una FK de usuario, asi que no hace falta SAVEPOINT.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Prisma } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';

import { PERMISSIONS, ROLE_ADMINISTRADOR, ROLE_EMPACADOR, ROLE_OPERADOR } from '@/lib/modules/identity';
import { prisma } from '@/lib/shared/db/prisma';

// ---------------------------------------------------------------------------
// Aislamiento (mismo patron que packer-role-migration.int.test.ts)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// El SQL, leido del archivo (no copiado)
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

function locatePackingPermissionMigrationDir(): string {
  const migrationsDir = join(findRepoRoot(dirname(fileURLToPath(import.meta.url))), 'db', 'migrations');
  const carpetas = readdirSync(migrationsDir).filter((name) => /_packing_permission$/.test(name));
  expect(carpetas, 'debe existir exactamente una migracion del permiso de empaque').toHaveLength(1);
  return join(migrationsDir, carpetas[0] as string);
}

const migrationDir = locatePackingPermissionMigrationDir();

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

expect(UP_STATEMENTS, 'el UP de esta migracion son exactamente dos sentencias').toHaveLength(2);
expect(DOWN_STATEMENTS, 'el DOWN de esta migracion son exactamente dos sentencias').toHaveLength(2);

async function applyStatements(tx: Prisma.TransactionClient, statements: readonly string[]): Promise<void> {
  for (const statement of statements) {
    await tx.$executeRawUnsafe(statement);
  }
}

// ---------------------------------------------------------------------------
// El escenario "antes de la migracion", simulado DENTRO del tx
// ---------------------------------------------------------------------------

const EMPAQUE_MODIFICAR = 'empaque.modificar';

/**
 * Borra exactamente lo que esta migracion trae: la asignacion y el permiso. Deja intacto el rol
 * Empacador -lo trae `packer_role`, no esta migracion- y todo lo demas.
 */
async function eraseFeatureRows(tx: Prisma.TransactionClient): Promise<void> {
  await tx.rolePermission.deleteMany({ where: { permissionCode: EMPAQUE_MODIFICAR } });
  await tx.permission.deleteMany({ where: { code: EMPAQUE_MODIFICAR } });
}

async function codigosDe(tx: Prisma.TransactionClient, roleName: string): Promise<readonly string[]> {
  const filas = await tx.rolePermission.findMany({
    where: { role: { name: roleName } },
    select: { permissionCode: true },
    orderBy: { permissionCode: 'asc' },
  });
  return filas.map((fila) => fila.permissionCode);
}

async function filasDe(tx: Prisma.TransactionClient, roleName: string) {
  return tx.rolePermission.findMany({
    where: { role: { name: roleName } },
    orderBy: { permissionCode: 'asc' },
  });
}

const EMPAQUE_MODIFICAR_ENTRY = PERMISSIONS.find((permission) => permission.code === EMPAQUE_MODIFICAR);
if (EMPAQUE_MODIFICAR_ENTRY === undefined) {
  throw new Error('PERMISSIONS no declara empaque.modificar: este archivo no puede afirmar sobre su fila');
}

// ---------------------------------------------------------------------------

afterAll(async () => {
  await prisma.$disconnect();
});

describe('migracion packing_permission contra Postgres real', () => {
  it('R37: el UP sobre una base sembrada antes de esta ficha crea el permiso y la asignacion del Empacador, y deja Administrador y Operador intactos', async () => {
    await inRolledBackTransaction(async (tx) => {
      const rolEmpacador = await tx.role.findUnique({ where: { name: ROLE_EMPACADOR } });
      expect(rolEmpacador, 'el rol Empacador ya deberia existir por packer_role').not.toBeNull();

      const administradorAntes = await filasDe(tx, ROLE_ADMINISTRADOR);
      const operadorAntes = await filasDe(tx, ROLE_OPERADOR);

      await eraseFeatureRows(tx);
      expect(await tx.permission.findUnique({ where: { code: EMPAQUE_MODIFICAR } })).toBeNull();

      await applyStatements(tx, UP_STATEMENTS);

      const permiso = await tx.permission.findUnique({ where: { code: EMPAQUE_MODIFICAR } });
      expect(permiso).not.toBeNull();
      expect(permiso).toMatchObject({
        code: EMPAQUE_MODIFICAR_ENTRY.code,
        module: EMPAQUE_MODIFICAR_ENTRY.module,
        action: EMPAQUE_MODIFICAR_ENTRY.action,
        description: EMPAQUE_MODIFICAR_ENTRY.description,
      });

      // Solo el Empacador gana el permiso nuevo.
      expect(await codigosDe(tx, ROLE_EMPACADOR)).toEqual(
        expect.arrayContaining([EMPAQUE_MODIFICAR]),
      );

      // Administrador y Operador, identicos fila a fila.
      expect(await filasDe(tx, ROLE_ADMINISTRADOR)).toEqual(administradorAntes);
      expect(await filasDe(tx, ROLE_OPERADOR)).toEqual(operadorAntes);
    });
  });

  it('R37: aplicar el UP una segunda vez no duplica ni reescribe ninguna fila, updated_at incluido', async () => {
    await inRolledBackTransaction(async (tx) => {
      // Idempotente por construccion (ON CONFLICT DO NOTHING): se aplica una vez para dejar el
      // escenario determinista sin importar si la base local ya lo tenia.
      await applyStatements(tx, UP_STATEMENTS);

      const permisoAntes = await tx.permission.findUnique({ where: { code: EMPAQUE_MODIFICAR } });
      const empacadorAntes = await filasDe(tx, ROLE_EMPACADOR);
      expect(permisoAntes).not.toBeNull();

      await applyStatements(tx, UP_STATEMENTS);

      const permisoDespues = await tx.permission.findUnique({ where: { code: EMPAQUE_MODIFICAR } });
      const empacadorDespues = await filasDe(tx, ROLE_EMPACADOR);

      // Comparacion campo a campo, updated_at incluido: un INSERT que reescribiera se veria aqui.
      expect(permisoDespues).toEqual(permisoAntes);
      expect(empacadorDespues).toEqual(empacadorAntes);
    });
  });

  it('R37: el DOWN retira el permiso y su asignacion sin tocar el rol Empacador ni ningun otro rol', async () => {
    await inRolledBackTransaction(async (tx) => {
      await applyStatements(tx, UP_STATEMENTS);
      expect(await tx.permission.findUnique({ where: { code: EMPAQUE_MODIFICAR } })).not.toBeNull();

      const operadorAntes = await filasDe(tx, ROLE_OPERADOR);
      const administradorAntes = await filasDe(tx, ROLE_ADMINISTRADOR);
      const empacadorCodigosAntes = await codigosDe(tx, ROLE_EMPACADOR);
      expect(empacadorCodigosAntes).toContain(EMPAQUE_MODIFICAR);

      await applyStatements(tx, DOWN_STATEMENTS);

      expect(await tx.permission.findUnique({ where: { code: EMPAQUE_MODIFICAR } })).toBeNull();
      expect(await tx.rolePermission.findMany({ where: { permissionCode: EMPAQUE_MODIFICAR } })).toEqual([]);
      // El rol sigue vivo: esta migracion no lo crea ni lo borra.
      expect(await tx.role.findUnique({ where: { name: ROLE_EMPACADOR } })).not.toBeNull();

      const empacadorCodigosDespues = await codigosDe(tx, ROLE_EMPACADOR);
      expect(empacadorCodigosDespues).toEqual(
        empacadorCodigosAntes.filter((codigo) => codigo !== EMPAQUE_MODIFICAR),
      );

      // Administrador y Operador, intactos.
      expect(await filasDe(tx, ROLE_ADMINISTRADOR)).toEqual(administradorAntes);
      expect(await filasDe(tx, ROLE_OPERADOR)).toEqual(operadorAntes);
    });
  });

  it('R37: aplicar el DOWN una segunda vez no falla y no cambia nada', async () => {
    await inRolledBackTransaction(async (tx) => {
      await applyStatements(tx, UP_STATEMENTS);
      await applyStatements(tx, DOWN_STATEMENTS);

      const permisoAntes = await tx.permission.findUnique({ where: { code: EMPAQUE_MODIFICAR } });
      const empacadorAntes = await filasDe(tx, ROLE_EMPACADOR);
      expect(permisoAntes).toBeNull();

      await applyStatements(tx, DOWN_STATEMENTS);

      expect(await tx.permission.findUnique({ where: { code: EMPAQUE_MODIFICAR } })).toBeNull();
      expect(await filasDe(tx, ROLE_EMPACADOR)).toEqual(empacadorAntes);
    });
  });
});
