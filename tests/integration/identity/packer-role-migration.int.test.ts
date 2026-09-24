// tests/integration/identity/packer-role-migration.int.test.ts
/**
 * La migracion `db/migrations/*_packer_role/` contra Postgres REAL.
 *
 * AISLAMIENTO — mismo patron que `identity-seed.int.test.ts`: cada `it` corre dentro de
 * `prisma.$transaction` interactiva y termina lanzando `RollbackSignal`, asi que Prisma emite
 * `ROLLBACK` y ninguna fila escrita por un test sobrevive.
 *
 * EL SQL SE LEE DEL ARCHIVO, no se copia a mano (patron de `identity-seed.int.test.ts:327-350`):
 * si alguien le quita un `ON CONFLICT` o reordena el `down.sql`, este archivo lo nota aplicando
 * el SQL real, no una copia que ya no lo representa.
 *
 * "BASE SEMBRADA ANTES DE LA MIGRACION" se simula DENTRO del `tx`: se borran las tres
 * asignaciones, el permiso y el rol que trae esta migracion, dejando el resto de la instalacion
 * (incluido el Operador) intacto. Es la unica forma de observar "antes de esta migracion" sin
 * depender de en que orden hayan corrido las tareas anteriores sobre la base local.
 *
 * SAVEPOINTS — el DOWN con un usuario Empacador vivo aborta la transaccion de Postgres con un
 * error de FK; se envuelve en `SAVEPOINT`/`ROLLBACK TO SAVEPOINT` para poder seguir consultando
 * y comprobar que no quedo nada a medias, sin perder el resto del `tx`.
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
  ROLE_ADMINISTRADOR,
  ROLE_EMPACADOR,
  ROLE_OPERADOR,
  SEED_ROLES,
  SEED_ROLE_PERMISSIONS,
  normalizeCompanyName,
} from '@/lib/modules/identity';
import { prisma } from '@/lib/shared/db/prisma';

// ---------------------------------------------------------------------------
// Aislamiento (mismo patron que identity-seed.int.test.ts / identity-constraints.int.test.ts)
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

let savepointSeq = 0;

/** SQLSTATE de Postgres relevante aqui: RESTRICT en una FK. Estable, no depende del idioma. */
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

/**
 * Corre `run` esperando que la base lo rechace, envuelto en `SAVEPOINT`: deja el `tx` utilizable
 * para seguir comprobando que no quedo nada a medias (patron de `identity-constraints.int.test.ts`).
 */
async function expectRejectedByDatabase(
  tx: Prisma.TransactionClient,
  run: () => Promise<unknown>,
  what: string,
): Promise<string> {
  savepointSeq += 1;
  const savepoint = `qc144_sp_${String(savepointSeq)}`;
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

function locatePackerRoleMigrationDir(): string {
  const migrationsDir = join(findRepoRoot(dirname(fileURLToPath(import.meta.url))), 'db', 'migrations');
  const carpetas = readdirSync(migrationsDir).filter((name) => /_packer_role$/.test(name));
  expect(carpetas, 'debe existir exactamente una migracion del rol Empacador').toHaveLength(1);
  return join(migrationsDir, carpetas[0] as string);
}

const migrationDir = locatePackerRoleMigrationDir();

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

expect(UP_STATEMENTS, 'el UP de esta migracion son exactamente cuatro sentencias').toHaveLength(4);
expect(DOWN_STATEMENTS, 'el DOWN de esta migracion son exactamente cuatro sentencias').toHaveLength(4);

async function applyStatements(tx: Prisma.TransactionClient, statements: readonly string[]): Promise<void> {
  for (const statement of statements) {
    await tx.$executeRawUnsafe(statement);
  }
}

// ---------------------------------------------------------------------------
// El escenario "antes de la migracion", simulado DENTRO del tx
// ---------------------------------------------------------------------------

const TERMINADOS_CONSULTAR = 'terminados.consultar';

/**
 * Borra exactamente lo que esta migracion trae: las tres asignaciones nuevas, el permiso y el
 * rol. Deja intacto todo lo demas -Administrador y Operador, con el resto de su catalogo-. Es lo
 * unico que hace falta para que "aplicar el UP" sea observable, sin importar si la base local ya
 * corrio esta migracion o el seed en una tarea anterior.
 */
async function eraseFeatureRows(tx: Prisma.TransactionClient): Promise<void> {
  await tx.rolePermission.deleteMany({
    where: { OR: [{ permissionCode: TERMINADOS_CONSULTAR }, { role: { name: ROLE_EMPACADOR } }] },
  });
  await tx.permission.deleteMany({ where: { code: TERMINADOS_CONSULTAR } });
  await tx.role.deleteMany({ where: { name: ROLE_EMPACADOR } });
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

const EMPACADOR_SEED_ROW = SEED_ROLES.find((role) => role.name === ROLE_EMPACADOR);
if (EMPACADOR_SEED_ROW === undefined) {
  throw new Error('SEED_ROLES no declara al Empacador: este archivo no puede afirmar sobre su fila');
}

const TERMINADOS_CONSULTAR_ENTRY = PERMISSIONS.find((permission) => permission.code === TERMINADOS_CONSULTAR);
if (TERMINADOS_CONSULTAR_ENTRY === undefined) {
  throw new Error('PERMISSIONS no declara terminados.consultar: este archivo no puede afirmar sobre su fila');
}

const CODIGOS_DEL_EMPACADOR = [...(SEED_ROLE_PERMISSIONS[ROLE_EMPACADOR] ?? [])].sort();
if (CODIGOS_DEL_EMPACADOR.length === 0) {
  throw new Error('SEED_ROLE_PERMISSIONS no declara al Empacador: este archivo no puede afirmar sobre sus permisos');
}

// ---------------------------------------------------------------------------
// Un usuario con el rol Empacador (solo para el caso (d))
// ---------------------------------------------------------------------------

async function createCompany(tx: Prisma.TransactionClient): Promise<string> {
  const name = `qc144-t12-${randomUUID()}`;
  const company = await tx.company.create({
    data: { name, nameNormalized: normalizeCompanyName(name) },
    select: { id: true },
  });
  return company.id;
}

async function createEmpacadorUser(tx: Prisma.TransactionClient, roleId: string): Promise<string> {
  const companyId = await createCompany(tx);
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
      companyId,
      accountStatus: 'active',
    },
    select: { id: true },
  });
  return user.id;
}

// ---------------------------------------------------------------------------

afterAll(async () => {
  await prisma.$disconnect();
});

describe('migracion packer_role contra Postgres real', () => {
  it('R17: el UP sobre una base sembrada antes de QC-144 crea el rol, el permiso y las tres asignaciones exactas, y deja al Operador identico', async () => {
    await inRolledBackTransaction(async (tx) => {
      const operadorAntes = await filasDe(tx, ROLE_OPERADOR);
      expect(operadorAntes.length).toBeGreaterThan(0);

      await eraseFeatureRows(tx);
      expect(await tx.role.findUnique({ where: { name: ROLE_EMPACADOR } })).toBeNull();
      expect(await tx.permission.findUnique({ where: { code: TERMINADOS_CONSULTAR } })).toBeNull();

      await applyStatements(tx, UP_STATEMENTS);

      const rolEmpacador = await tx.role.findUnique({ where: { name: ROLE_EMPACADOR } });
      expect(rolEmpacador).not.toBeNull();
      expect(rolEmpacador?.description).toBe(EMPACADOR_SEED_ROW.description);

      const permiso = await tx.permission.findUnique({ where: { code: TERMINADOS_CONSULTAR } });
      expect(permiso).not.toBeNull();
      expect(permiso).toMatchObject({
        code: TERMINADOS_CONSULTAR_ENTRY.code,
        module: TERMINADOS_CONSULTAR_ENTRY.module,
        action: TERMINADOS_CONSULTAR_ENTRY.action,
        description: TERMINADOS_CONSULTAR_ENTRY.description,
      });

      // Las tres asignaciones exactas: Administrador->terminados.consultar,
      // Empacador->asignaciones.consultar, Empacador->terminados.consultar.
      expect(await codigosDe(tx, ROLE_ADMINISTRADOR)).toEqual(
        expect.arrayContaining([TERMINADOS_CONSULTAR]),
      );
      expect(await codigosDe(tx, ROLE_EMPACADOR)).toEqual(CODIGOS_DEL_EMPACADOR);

      // El Operador no cambio: las mismas filas, createdAt incluido.
      expect(await filasDe(tx, ROLE_OPERADOR)).toEqual(operadorAntes);
    });
  });

  it('R18: aplicar el UP una segunda vez sobre la base ya sembrada no duplica ni reescribe ninguna fila, updated_at incluido', async () => {
    await inRolledBackTransaction(async (tx) => {
      // Idempotente por construccion (ON CONFLICT DO NOTHING): se aplica una vez para dejar el
      // escenario determinista sin importar si la base local ya lo tenia.
      await applyStatements(tx, UP_STATEMENTS);

      const rolAntes = await tx.role.findUnique({ where: { name: ROLE_EMPACADOR } });
      const permisoAntes = await tx.permission.findUnique({ where: { code: TERMINADOS_CONSULTAR } });
      const empacadorAntes = await filasDe(tx, ROLE_EMPACADOR);
      const administradorAntes = await filasDe(tx, ROLE_ADMINISTRADOR);
      expect(rolAntes).not.toBeNull();
      expect(permisoAntes).not.toBeNull();

      await applyStatements(tx, UP_STATEMENTS);

      const rolDespues = await tx.role.findUnique({ where: { name: ROLE_EMPACADOR } });
      const permisoDespues = await tx.permission.findUnique({ where: { code: TERMINADOS_CONSULTAR } });
      const empacadorDespues = await filasDe(tx, ROLE_EMPACADOR);
      const administradorDespues = await filasDe(tx, ROLE_ADMINISTRADOR);

      // Comparacion campo a campo, updated_at incluido: un INSERT que reescribiera se veria aqui.
      expect(rolDespues).toEqual(rolAntes);
      expect(permisoDespues).toEqual(permisoAntes);
      expect(empacadorDespues).toEqual(empacadorAntes);
      expect(administradorDespues).toEqual(administradorAntes);
      expect(empacadorDespues).toHaveLength(CODIGOS_DEL_EMPACADOR.length);
    });
  });

  it('R21: el DOWN sin ningun usuario Empacador retira el permiso, sus asignaciones y el rol, sin tocar nada mas', async () => {
    await inRolledBackTransaction(async (tx) => {
      await applyStatements(tx, UP_STATEMENTS);
      expect(await tx.role.findUnique({ where: { name: ROLE_EMPACADOR } })).not.toBeNull();

      const operadorAntes = await filasDe(tx, ROLE_OPERADOR);
      const administradorCodigosAntes = await codigosDe(tx, ROLE_ADMINISTRADOR);
      expect(administradorCodigosAntes).toContain(TERMINADOS_CONSULTAR);

      await applyStatements(tx, DOWN_STATEMENTS);

      expect(await tx.role.findUnique({ where: { name: ROLE_EMPACADOR } })).toBeNull();
      expect(await tx.permission.findUnique({ where: { code: TERMINADOS_CONSULTAR } })).toBeNull();
      expect(await tx.rolePermission.findMany({ where: { permissionCode: TERMINADOS_CONSULTAR } })).toEqual([]);

      // El Administrador pierde exactamente ese permiso, ninguno mas.
      const administradorCodigosDespues = await codigosDe(tx, ROLE_ADMINISTRADOR);
      expect(administradorCodigosDespues).toEqual(
        administradorCodigosAntes.filter((codigo) => codigo !== TERMINADOS_CONSULTAR),
      );

      // El Operador, intacto.
      expect(await filasDe(tx, ROLE_OPERADOR)).toEqual(operadorAntes);
    });
  });

  it('R21: el DOWN con un usuario que tiene el rol Empacador falla con el SQLSTATE de una FK RESTRICT, y no borra nada', async () => {
    await inRolledBackTransaction(async (tx) => {
      await applyStatements(tx, UP_STATEMENTS);
      const rolEmpacador = await tx.role.findUniqueOrThrow({ where: { name: ROLE_EMPACADOR } });

      await createEmpacadorUser(tx, rolEmpacador.id);

      const rolAntes = rolEmpacador;
      const permisoAntes = await tx.permission.findUnique({ where: { code: TERMINADOS_CONSULTAR } });
      const empacadorFilasAntes = await filasDe(tx, ROLE_EMPACADOR);
      const totalRolePermissionsAntes = await tx.rolePermission.count();
      const totalRolesAntes = await tx.role.count();
      const totalPermissionsAntes = await tx.permission.count();

      // Los tres primeros DELETE del DOWN suceden dentro del SAVEPOINT antes de que el cuarto
      // falle: se afirma que el fallo deshizo TODO, no solo el ultimo DELETE.
      const codigo = await expectRejectedByDatabase(
        tx,
        () => applyStatements(tx, DOWN_STATEMENTS),
        'DOWN de packer_role con un usuario Empacador vivo',
      );

      // Nota para quien lea el fallo: `docs/verification.md` documenta que en Postgres 18.6 el
      // RESTRICT de una FK reporta 23001 (restrict_violation) donde 17 -el objetivo del
      // proyecto- reporta 23503 (foreign_key_violation). Se afirma el codigo objetivo.
      expect(codigo).toBe(FOREIGN_KEY_VIOLATION);

      // Nada a medias: rol, permiso y asignaciones exactamente como antes del intento.
      expect(await tx.role.findUnique({ where: { name: ROLE_EMPACADOR } })).toEqual(rolAntes);
      expect(await tx.permission.findUnique({ where: { code: TERMINADOS_CONSULTAR } })).toEqual(permisoAntes);
      expect(await filasDe(tx, ROLE_EMPACADOR)).toEqual(empacadorFilasAntes);
      expect(await tx.rolePermission.count()).toBe(totalRolePermissionsAntes);
      expect(await tx.role.count()).toBe(totalRolesAntes);
      expect(await tx.permission.count()).toBe(totalPermissionsAntes);
    });
  });
});
