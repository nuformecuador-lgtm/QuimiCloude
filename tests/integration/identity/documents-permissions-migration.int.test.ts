// tests/integration/identity/documents-permissions-migration.int.test.ts
/**
 * La migracion `db/migrations/*_documents_permissions/` contra Postgres REAL.
 *
 * AISLAMIENTO — mismo patron que `packer-role-migration.int.test.ts`: cada `it` corre dentro de
 * `prisma.$transaction` interactiva y termina lanzando `RollbackSignal`, asi que Prisma emite
 * `ROLLBACK` y ninguna fila escrita por un test sobrevive.
 *
 * EL SQL SE LEE DEL ARCHIVO, no se copia a mano: si alguien le quita un `ON CONFLICT` o reordena
 * el `down.sql`, este archivo lo nota aplicando el SQL real, no una copia que ya no lo representa.
 *
 * "BASE ANTES DE LA MIGRACION" se simula DENTRO del `tx`: se borran las dos filas del catalogo y
 * todas las asignaciones a esos dos codigos, dejando el resto de la instalacion (Administrador,
 * Operador, Empacador y cualquier rol efimero de otro test) intacto.
 *
 * ROLES EFIMEROS — para R6/R7 se crean, dentro del `tx`, un rol con `proveedores.modificar` y
 * otro sin el: la migracion resuelve la herencia por PERMISO, nunca por nombre de rol, y estos
 * dos roles no existen en ningun seed.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';

import {
  PERMISSIONS,
  ROLE_ADMINISTRADOR,
  ROLE_EMPACADOR,
  ROLE_OPERADOR,
  SEED_ROLE_PERMISSIONS,
} from '@/lib/modules/identity';
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

function locateDocumentsPermissionsMigrationDir(): string {
  const migrationsDir = join(findRepoRoot(dirname(fileURLToPath(import.meta.url))), 'db', 'migrations');
  const carpetas = readdirSync(migrationsDir).filter((name) => /_documents_permissions$/.test(name));
  expect(carpetas, 'debe existir exactamente una migracion de permisos de documentos').toHaveLength(1);
  return join(migrationsDir, carpetas[0] as string);
}

const migrationDir = locateDocumentsPermissionsMigrationDir();

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

expect(UP_STATEMENTS, 'el UP de esta migracion son exactamente tres sentencias').toHaveLength(3);
expect(DOWN_STATEMENTS, 'el DOWN de esta migracion son exactamente dos sentencias').toHaveLength(2);

async function applyStatements(tx: Prisma.TransactionClient, statements: readonly string[]): Promise<void> {
  for (const statement of statements) {
    await tx.$executeRawUnsafe(statement);
  }
}

// ---------------------------------------------------------------------------
// El escenario "antes de la migracion", simulado DENTRO del tx
// ---------------------------------------------------------------------------

const DOCUMENTOS_CONSULTAR = 'documentos.consultar';
const DOCUMENTOS_MODIFICAR = 'documentos.modificar';
const PROVEEDORES_MODIFICAR = 'proveedores.modificar';

/**
 * Borra exactamente lo que esta migracion trae: las asignaciones de los dos codigos, a cualquier
 * rol, y las dos filas del catalogo. Deja intacto todo lo demas.
 */
async function eraseFeatureRows(tx: Prisma.TransactionClient): Promise<void> {
  await tx.rolePermission.deleteMany({
    where: { permissionCode: { in: [DOCUMENTOS_CONSULTAR, DOCUMENTOS_MODIFICAR] } },
  });
  await tx.permission.deleteMany({ where: { code: { in: [DOCUMENTOS_CONSULTAR, DOCUMENTOS_MODIFICAR] } } });
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

/**
 * Un rol efimero, sin usuarios, con exactamente los codigos que se le pasen. Ninguno existe en
 * ningun seed: la herencia se resuelve por PERMISO y este rol lo demuestra.
 */
async function createEphemeralRole(tx: Prisma.TransactionClient, codes: readonly string[]): Promise<string> {
  const name = `qc142_it_${randomUUID()}`;
  const role = await tx.role.create({
    data: {
      name,
      description: 'Rol efimero de integracion, sin usuarios.',
      permissions: { create: codes.map((code) => ({ permissionCode: code })) },
    },
    select: { id: true },
  });
  return role.id;
}

const DOCUMENTOS_CONSULTAR_ENTRY = PERMISSIONS.find((permission) => permission.code === DOCUMENTOS_CONSULTAR);
if (DOCUMENTOS_CONSULTAR_ENTRY === undefined) {
  throw new Error('PERMISSIONS no declara documentos.consultar: este archivo no puede afirmar sobre su fila');
}
const DOCUMENTOS_MODIFICAR_ENTRY = PERMISSIONS.find((permission) => permission.code === DOCUMENTOS_MODIFICAR);
if (DOCUMENTOS_MODIFICAR_ENTRY === undefined) {
  throw new Error('PERMISSIONS no declara documentos.modificar: este archivo no puede afirmar sobre su fila');
}

// ---------------------------------------------------------------------------

afterAll(async () => {
  await prisma.$disconnect();
});

describe('migracion documents_permissions contra Postgres real', () => {
  it('R4: el UP crea las dos filas del catalogo, iguales a PERMISSIONS', async () => {
    await inRolledBackTransaction(async (tx) => {
      await eraseFeatureRows(tx);
      expect(await tx.permission.findUnique({ where: { code: DOCUMENTOS_CONSULTAR } })).toBeNull();
      expect(await tx.permission.findUnique({ where: { code: DOCUMENTOS_MODIFICAR } })).toBeNull();

      await applyStatements(tx, UP_STATEMENTS);

      const consultar = await tx.permission.findUnique({ where: { code: DOCUMENTOS_CONSULTAR } });
      const modificar = await tx.permission.findUnique({ where: { code: DOCUMENTOS_MODIFICAR } });
      expect(consultar).toMatchObject({
        code: DOCUMENTOS_CONSULTAR_ENTRY.code,
        module: DOCUMENTOS_CONSULTAR_ENTRY.module,
        action: DOCUMENTOS_CONSULTAR_ENTRY.action,
        description: DOCUMENTOS_CONSULTAR_ENTRY.description,
      });
      expect(modificar).toMatchObject({
        code: DOCUMENTOS_MODIFICAR_ENTRY.code,
        module: DOCUMENTOS_MODIFICAR_ENTRY.module,
        action: DOCUMENTOS_MODIFICAR_ENTRY.action,
        description: DOCUMENTOS_MODIFICAR_ENTRY.description,
      });
    });
  });

  it('R5: el UP deja al Administrador con documentos.consultar y documentos.modificar', async () => {
    await inRolledBackTransaction(async (tx) => {
      await eraseFeatureRows(tx);

      await applyStatements(tx, UP_STATEMENTS);

      const codigos = await codigosDe(tx, ROLE_ADMINISTRADOR);
      expect(codigos).toContain(DOCUMENTOS_CONSULTAR);
      expect(codigos).toContain(DOCUMENTOS_MODIFICAR);
    });
  });

  it('R6, R7: un rol efimero con proveedores.modificar gana SOLO documentos.modificar', async () => {
    await inRolledBackTransaction(async (tx) => {
      await eraseFeatureRows(tx);
      const conProveedoresModificar = await createEphemeralRole(tx, [PROVEEDORES_MODIFICAR]);

      await applyStatements(tx, UP_STATEMENTS);

      const asignados = await tx.rolePermission.findMany({
        where: { roleId: conProveedoresModificar },
        select: { permissionCode: true },
      });
      const codigos = asignados.map((fila) => fila.permissionCode);
      expect(codigos).toContain(DOCUMENTOS_MODIFICAR);
      expect(codigos).not.toContain(DOCUMENTOS_CONSULTAR);
    });
  });

  it('R7: un rol efimero SIN proveedores.modificar, y Operador y Empacador, no ganan ningun documentos.*', async () => {
    await inRolledBackTransaction(async (tx) => {
      await eraseFeatureRows(tx);
      const sinProveedoresModificar = await createEphemeralRole(tx, ['proveedores.consultar']);

      const operadorAntes = await codigosDe(tx, ROLE_OPERADOR);
      const empacadorAntes = await codigosDe(tx, ROLE_EMPACADOR);
      expect(operadorAntes.length).toBeGreaterThan(0);
      expect(empacadorAntes.length).toBeGreaterThan(0);

      await applyStatements(tx, UP_STATEMENTS);

      // El rol efimero se busca por id, no por nombre.
      const asignadosDelEfimero = await tx.rolePermission.findMany({
        where: { roleId: sinProveedoresModificar },
        select: { permissionCode: true },
      });
      expect(asignadosDelEfimero.map((fila) => fila.permissionCode)).not.toContain(DOCUMENTOS_MODIFICAR);
      expect(asignadosDelEfimero.map((fila) => fila.permissionCode)).not.toContain(DOCUMENTOS_CONSULTAR);

      const delOperador = await codigosDe(tx, ROLE_OPERADOR);
      const delEmpacador = await codigosDe(tx, ROLE_EMPACADOR);
      expect(delOperador).not.toContain(DOCUMENTOS_MODIFICAR);
      expect(delOperador).not.toContain(DOCUMENTOS_CONSULTAR);
      expect(delEmpacador).not.toContain(DOCUMENTOS_MODIFICAR);
      expect(delEmpacador).not.toContain(DOCUMENTOS_CONSULTAR);
      // Y sus asignaciones previas, exactamente igual que antes de la migracion.
      expect(SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]).not.toContain(DOCUMENTOS_MODIFICAR);
      expect(delOperador).toEqual(operadorAntes);
      expect(delEmpacador).toEqual(empacadorAntes);
    });
  });

  it('R8: ninguna asignacion previa desaparece, incluida proveedores.modificar del Administrador', async () => {
    await inRolledBackTransaction(async (tx) => {
      await eraseFeatureRows(tx);
      const administradorAntes = await filasDe(tx, ROLE_ADMINISTRADOR);
      expect(administradorAntes.map((fila) => fila.permissionCode)).toContain(PROVEEDORES_MODIFICAR);

      await applyStatements(tx, UP_STATEMENTS);

      const administradorDespues = await filasDe(tx, ROLE_ADMINISTRADOR);
      const codigosDespues = administradorDespues.map((fila) => fila.permissionCode);
      for (const filaAntes of administradorAntes) {
        expect(codigosDespues).toContain(filaAntes.permissionCode);
      }
    });
  });

  it('R9: aplicar el UP dos veces no duplica ni reescribe ninguna fila', async () => {
    await inRolledBackTransaction(async (tx) => {
      await eraseFeatureRows(tx);
      await applyStatements(tx, UP_STATEMENTS);

      const permisosAntes = [
        await tx.permission.findUnique({ where: { code: DOCUMENTOS_CONSULTAR } }),
        await tx.permission.findUnique({ where: { code: DOCUMENTOS_MODIFICAR } }),
      ];
      const administradorAntes = await filasDe(tx, ROLE_ADMINISTRADOR);

      await applyStatements(tx, UP_STATEMENTS);

      const permisosDespues = [
        await tx.permission.findUnique({ where: { code: DOCUMENTOS_CONSULTAR } }),
        await tx.permission.findUnique({ where: { code: DOCUMENTOS_MODIFICAR } }),
      ];
      const administradorDespues = await filasDe(tx, ROLE_ADMINISTRADOR);

      expect(permisosDespues).toEqual(permisosAntes);
      expect(administradorDespues).toEqual(administradorAntes);
    });
  });

  it('R9: aplicar el UP sobre una base ya sembrada (seed corrido) no falla ni duplica', async () => {
    await inRolledBackTransaction(async (tx) => {
      // La base local ya trae el seed corrido: NO se borra nada aqui, se aplica directo.
      const administradorAntes = await filasDe(tx, ROLE_ADMINISTRADOR);

      await expect(applyStatements(tx, UP_STATEMENTS)).resolves.not.toThrow();

      const administradorDespues = await filasDe(tx, ROLE_ADMINISTRADOR);
      expect(administradorDespues).toEqual(administradorAntes);
    });
  });

  it('R10: el DOWN retira los dos permisos y sus asignaciones de cualquier rol, y deja el resto identico', async () => {
    await inRolledBackTransaction(async (tx) => {
      await eraseFeatureRows(tx);
      const conProveedoresModificar = await createEphemeralRole(tx, [PROVEEDORES_MODIFICAR]);
      await applyStatements(tx, UP_STATEMENTS);

      const asignadosAntes = await tx.rolePermission.findMany({ where: { roleId: conProveedoresModificar } });
      expect(asignadosAntes.map((fila) => fila.permissionCode)).toContain(DOCUMENTOS_MODIFICAR);

      const operadorAntes = await filasDe(tx, ROLE_OPERADOR);
      const empacadorAntes = await filasDe(tx, ROLE_EMPACADOR);
      const administradorCodigosAntes = await codigosDe(tx, ROLE_ADMINISTRADOR);
      expect(administradorCodigosAntes).toContain(DOCUMENTOS_CONSULTAR);
      expect(administradorCodigosAntes).toContain(DOCUMENTOS_MODIFICAR);

      await applyStatements(tx, DOWN_STATEMENTS);

      expect(await tx.permission.findUnique({ where: { code: DOCUMENTOS_CONSULTAR } })).toBeNull();
      expect(await tx.permission.findUnique({ where: { code: DOCUMENTOS_MODIFICAR } })).toBeNull();
      expect(
        await tx.rolePermission.findMany({
          where: { permissionCode: { in: [DOCUMENTOS_CONSULTAR, DOCUMENTOS_MODIFICAR] } },
        }),
      ).toEqual([]);

      // El rol efimero pierde exactamente el permiso heredado, ninguno mas.
      const asignadosDespues = await tx.rolePermission.findMany({ where: { roleId: conProveedoresModificar } });
      expect(asignadosDespues.map((fila) => fila.permissionCode)).toEqual([PROVEEDORES_MODIFICAR]);

      // El Administrador pierde exactamente esos dos codigos, ninguno mas.
      const administradorCodigosDespues = await codigosDe(tx, ROLE_ADMINISTRADOR);
      expect(administradorCodigosDespues).toEqual(
        administradorCodigosAntes.filter(
          (codigo) => codigo !== DOCUMENTOS_CONSULTAR && codigo !== DOCUMENTOS_MODIFICAR,
        ),
      );

      // El Operador y el Empacador, intactos.
      expect(await filasDe(tx, ROLE_OPERADOR)).toEqual(operadorAntes);
      expect(await filasDe(tx, ROLE_EMPACADOR)).toEqual(empacadorAntes);
    });
  });
});
