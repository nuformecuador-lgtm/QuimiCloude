/**
 * T18 — el seed de acceso inicial contra una base Postgres REAL, con la migracion
 * `20260902132253_user_must_change_credential` aplicada (verificada a mano en T17).
 * Cubre R1, R2, R4, R5, R7, R8, R9, R12, R13, R14, R15, R16, R17.
 *
 * AISLAMIENTO — igual patron que `identity-constraints.int.test.ts`: cada `it` corre
 * dentro de `prisma.$transaction` interactiva y termina lanzando `RollbackSignal`, lo
 * que hace que Prisma emita `ROLLBACK`. Ninguna fila escrita por un test sobrevive. El
 * repositorio del seed se construye sobre el `tx` (`createInitialAccessRepository(tx)`,
 * design.md > 5.3), nunca sobre el `prisma` compartido: es lo que permite correr el seed
 * dos veces por test sin que la segunda corrida vea commits reales de la primera.
 *
 * LA BASE LOCAL NO ESTA VACIA — ya trae los 2 roles y 1 usuario vivo con rol
 * Administrador de una corrida anterior de `pnpm run db:seed`. Los casos que describen
 * "sobre base vacia" tienen que CONSTRUIR ese escenario ellos mismos, dentro de su propia
 * transaccion y antes de invocar el seed: `resetIdentityToEmptyState` borra (dentro del
 * `tx`, nunca fuera) todos los usuarios y los dos roles del seed. Es un borrado FISICO
 * (no logico) a proposito: un usuario borrado logicamente sigue bloqueando el borrado de
 * su rol (`ON DELETE RESTRICT`, ya probado en `identity-constraints.int.test.ts`), y aqui
 * hace falta reproducir "no existe ningun usuario, ni vivo ni borrado" para que el
 * catalogo de roles pueda quedar realmente vacio. Como todo el `tx` termina en
 * `ROLLBACK`, este borrado nunca toca la base de verdad.
 *
 * NINGUNA CREDENCIAL REAL — los valores de `FAKE_ADMIN_*` son marcadores de instalacion
 * de test, evidentemente ficticios, y solo existen en memoria durante la transaccion.
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';

import { identity } from '@/lib/composition';
import { readInitialAdminCredentialsFromEnv } from '@/lib/modules/identity/adapters/driven/config/initial-access-credentials-env';
import {
  createInitialAccessRepository,
  withInitialAccessTransaction,
} from '@/lib/modules/identity/adapters/driven/persistence/initial-access-repository-prisma';
import { ROLE_ADMINISTRADOR, ROLE_OPERADOR } from '@/lib/modules/identity/domain/roles';
import { seedInitialAccess } from '@/lib/modules/identity/domain/seed-initial-access';
import { prisma } from '@/lib/shared/db/prisma';

import type { InitialAdminCredentialsProvider } from '@/lib/modules/identity/ports/initial-access-credentials';

// ---------------------------------------------------------------------------
// Aislamiento (mismo patron que identity-constraints.int.test.ts)
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
// Credenciales de test — marcadores evidentemente ficticios, nunca reales.
// ---------------------------------------------------------------------------

const FAKE_ADMIN_USERNAME = 'qc6.instalacion.test';
const FAKE_ADMIN_CREDENTIAL = 'qc6-credencial-de-instalacion-de-prueba-no-real';
const FAKE_ADMIN_EMAIL = 'qc6.instalacion.test@example.test';

const fakeCredentialsProvider: InitialAdminCredentialsProvider = () => ({
  username: FAKE_ADMIN_USERNAME,
  credential: FAKE_ADMIN_CREDENTIAL,
  email: FAKE_ADMIN_EMAIL,
});

/** Las tres variables que lee el adaptador de entorno (`design.md > 6`). */
const SEED_ADMIN_ENV_VAR_NAMES = ['SEED_ADMIN_USERNAME', 'SEED_ADMIN_PASSWORD', 'SEED_ADMIN_EMAIL'] as const;

/**
 * Ejecuta `run` con las tres `SEED_ADMIN_*` borradas del entorno del proceso de test, y
 * las restaura exactamente como estaban al terminar (existan o no). Es lo que hace
 * "honesta" la comprobacion de los casos 6 y 7: usan el proveedor REAL de entorno, no uno
 * local, y el entorno del test es el unico que se toca.
 */
async function withSeedAdminEnvVarsCleared<T>(run: () => Promise<T>): Promise<T> {
  const saved = new Map(SEED_ADMIN_ENV_VAR_NAMES.map((name) => [name, process.env[name]]));
  for (const name of SEED_ADMIN_ENV_VAR_NAMES) delete process.env[name];
  try {
    return await run();
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

// ---------------------------------------------------------------------------
// Construccion determinista del escenario "base vacia" (ver cabecera del archivo)
// ---------------------------------------------------------------------------

/**
 * Deja, DENTRO del `tx`, un estado sin ningun usuario (vivo ni borrado) y sin los roles
 * `Administrador`/`Operador`. Necesario porque la base local YA trae 2 roles y 1
 * administrador vivo de una corrida anterior del seed real: sin este borrado, ningun
 * caso podria observar "primera corrida sobre base vacia".
 */
async function resetIdentityToEmptyState(tx: Prisma.TransactionClient): Promise<void> {
  await tx.user.deleteMany({});
  await tx.role.deleteMany({ where: { name: { in: [ROLE_ADMINISTRADOR, ROLE_OPERADOR] } } });
}

async function seedRoleNames(tx: Prisma.TransactionClient): Promise<readonly string[]> {
  const roles = await tx.role.findMany({
    where: { name: { in: [ROLE_ADMINISTRADOR, ROLE_OPERADOR] } },
    select: { name: true },
  });
  return roles.map((role) => role.name);
}

async function findLiveAdmin(tx: Prisma.TransactionClient) {
  return tx.user.findFirst({
    where: { deletedAt: null, role: { name: ROLE_ADMINISTRADOR } },
    include: { role: true },
  });
}

// ---------------------------------------------------------------------------

afterAll(async () => {
  await prisma.$disconnect();
});

describe('seedInitialAccess contra base real — la doble corrida', () => {
  // Caso 1 (R1, R2, R3, R4, R7, R14, R16): doble corrida sobre base vacia.
  it('la primera corrida sobre base vacia crea los dos roles y el administrador; la segunda no cambia nada', async () => {
    await inRolledBackTransaction(async (tx) => {
      await resetIdentityToEmptyState(tx);
      expect(await seedRoleNames(tx)).toEqual([]);
      expect(await findLiveAdmin(tx)).toBeNull();

      const repository = createInitialAccessRepository(tx);

      const first = await seedInitialAccess({
        repository,
        passwordHasher: identity.passwordHasher,
        credentials: fakeCredentialsProvider,
      });

      // Se afirma PRIMERO que la primera corrida encontro/creo algo real.
      expect(first.createdRoles.slice().sort()).toEqual([ROLE_ADMINISTRADOR, ROLE_OPERADOR].sort());
      expect(first.createdAdmin).toBe(true);

      const rolesAfterFirst = await tx.role.findMany({
        where: { name: { in: [ROLE_ADMINISTRADOR, ROLE_OPERADOR] } },
      });
      expect(rolesAfterFirst).toHaveLength(2);

      const adminAfterFirst = await findLiveAdmin(tx);
      expect(adminAfterFirst).not.toBeNull();
      if (adminAfterFirst === null) throw new Error('inalcanzable');
      expect(adminAfterFirst.role.name).toBe(ROLE_ADMINISTRADOR);

      const usersAfterFirst = await tx.user.count();
      expect(usersAfterFirst).toBe(1);

      // Segunda corrida: no debe duplicar ni modificar nada (R14, R15, R16).
      const second = await seedInitialAccess({
        repository,
        passwordHasher: identity.passwordHasher,
        credentials: fakeCredentialsProvider,
      });
      expect(second.createdRoles).toEqual([]);
      expect(second.createdAdmin).toBe(false);

      const rolesAfterSecond = await tx.role.findMany({
        where: { name: { in: [ROLE_ADMINISTRADOR, ROLE_OPERADOR] } },
        orderBy: { name: 'asc' },
      });
      expect(rolesAfterSecond).toHaveLength(2);
      expect(rolesAfterSecond).toEqual(
        [...rolesAfterFirst].sort((a, b) => a.name.localeCompare(b.name)),
      );

      const adminAfterSecond = await findLiveAdmin(tx);
      expect(adminAfterSecond).not.toBeNull();
      // Comparacion campo a campo de la fila entera releida, id/password_hash/updated_at
      // y must_change_credential incluidos (design.md > 11).
      expect(adminAfterSecond).toEqual(adminAfterFirst);

      expect(await tx.user.count()).toBe(1);
      expect(await tx.role.count({ where: { name: { in: [ROLE_ADMINISTRADOR, ROLE_OPERADOR] } } })).toBe(2);
    });
  });

  // Caso 2 (R9): el usuario inicial nace obligado a cambiar la contrasena.
  it('el usuario inicial nace con must_change_credential en true y rol Administrador', async () => {
    await inRolledBackTransaction(async (tx) => {
      await resetIdentityToEmptyState(tx);
      const repository = createInitialAccessRepository(tx);

      const outcome = await seedInitialAccess({
        repository,
        passwordHasher: identity.passwordHasher,
        credentials: fakeCredentialsProvider,
      });
      expect(outcome.createdAdmin).toBe(true);

      const admin = await findLiveAdmin(tx);
      expect(admin).not.toBeNull();
      if (admin === null) throw new Error('inalcanzable');
      expect(admin.mustChangeCredential).toBe(true);
      expect(admin.role.name).toBe(ROLE_ADMINISTRADOR);
    });
  });

  // Caso 3 (R8): la contrasena quedo hasheada por el puerto, nunca en claro.
  it('la contrasena del administrador inicial quedo hasheada por el puerto PasswordHasher', async () => {
    await inRolledBackTransaction(async (tx) => {
      await resetIdentityToEmptyState(tx);
      const repository = createInitialAccessRepository(tx);

      const outcome = await seedInitialAccess({
        repository,
        passwordHasher: identity.passwordHasher,
        credentials: fakeCredentialsProvider,
      });
      expect(outcome.createdAdmin).toBe(true);

      const admin = await findLiveAdmin(tx);
      expect(admin).not.toBeNull();
      if (admin === null) throw new Error('inalcanzable');

      // Nada de comparar textos: se pasa por `verify`.
      const matches = await identity.passwordHasher.verify(FAKE_ADMIN_CREDENTIAL, admin.passwordHash);
      expect(matches).toBe(true);
      expect(admin.passwordHash).not.toBe(FAKE_ADMIN_CREDENTIAL);
    });
  });

  // Caso 4 (R15): lo cambiado a mano sobrevive a la segunda corrida.
  it('los datos cambiados a mano tras la primera corrida sobreviven intactos a la segunda', async () => {
    await inRolledBackTransaction(async (tx) => {
      await resetIdentityToEmptyState(tx);
      const repository = createInitialAccessRepository(tx);

      const first = await seedInitialAccess({
        repository,
        passwordHasher: identity.passwordHasher,
        credentials: fakeCredentialsProvider,
      });
      expect(first.createdAdmin).toBe(true);
      expect(first.createdRoles.length).toBe(2);

      const adminBeforeEdit = await findLiveAdmin(tx);
      expect(adminBeforeEdit).not.toBeNull();
      if (adminBeforeEdit === null) throw new Error('inalcanzable');

      const handEditedPasswordHash = 'hash-editado-a-mano-no-lo-toques';
      await tx.user.update({
        where: { id: adminBeforeEdit.id },
        data: { passwordHash: handEditedPasswordHash, mustChangeCredential: false },
      });
      const administradorRole = await tx.role.findUniqueOrThrow({ where: { name: ROLE_ADMINISTRADOR } });
      const handEditedDescription = 'descripcion editada a mano, no la reescribas';
      await tx.role.update({ where: { id: administradorRole.id }, data: { description: handEditedDescription } });

      const adminAfterEdit = await tx.user.findUniqueOrThrow({ where: { id: adminBeforeEdit.id } });
      const roleAfterEdit = await tx.role.findUniqueOrThrow({ where: { id: administradorRole.id } });

      const second = await seedInitialAccess({
        repository,
        passwordHasher: identity.passwordHasher,
        credentials: fakeCredentialsProvider,
      });
      expect(second.createdRoles).toEqual([]);
      expect(second.createdAdmin).toBe(false);

      const adminAfterSecondRun = await tx.user.findUniqueOrThrow({ where: { id: adminBeforeEdit.id } });
      const roleAfterSecondRun = await tx.role.findUniqueOrThrow({ where: { id: administradorRole.id } });

      expect(adminAfterSecondRun).toEqual(adminAfterEdit);
      expect(adminAfterSecondRun.passwordHash).toBe(handEditedPasswordHash);
      expect(adminAfterSecondRun.mustChangeCredential).toBe(false);
      expect(roleAfterSecondRun).toEqual(roleAfterEdit);
      expect(roleAfterSecondRun.description).toBe(handEditedDescription);
    });
  });

  // Caso 5 (R2): solo falta un rol.
  it('si solo falta el rol Operador, la corrida crea unicamente ese y deja Administrador intacto', async () => {
    await inRolledBackTransaction(async (tx) => {
      await resetIdentityToEmptyState(tx);
      const repository = createInitialAccessRepository(tx);

      const first = await seedInitialAccess({
        repository,
        passwordHasher: identity.passwordHasher,
        credentials: fakeCredentialsProvider,
      });
      expect(first.createdRoles.length).toBe(2);
      expect(first.createdAdmin).toBe(true);

      const administradorBeforeDelete = await tx.role.findUniqueOrThrow({ where: { name: ROLE_ADMINISTRADOR } });
      // Operador no tiene usuarios asignados: es borrable (ya probado en
      // identity-constraints.int.test.ts > "permite borrar un rol sin usuarios asignados").
      await tx.role.delete({ where: { name: ROLE_OPERADOR } });
      expect(await tx.role.findUnique({ where: { name: ROLE_OPERADOR } })).toBeNull();

      const second = await seedInitialAccess({
        repository,
        passwordHasher: identity.passwordHasher,
        credentials: fakeCredentialsProvider,
      });
      expect(second.createdRoles).toEqual([ROLE_OPERADOR]);
      expect(second.createdAdmin).toBe(false);

      const operadorAfter = await tx.role.findUnique({ where: { name: ROLE_OPERADOR } });
      expect(operadorAfter).not.toBeNull();

      const administradorAfter = await tx.role.findUniqueOrThrow({ where: { name: ROLE_ADMINISTRADOR } });
      expect(administradorAfter).toEqual(administradorBeforeDelete);
    });
  });

  // Caso 6 (R12): admin presente y variables ausentes -> exito, nada creado.
  it('si el administrador ya existe y faltan las SEED_ADMIN_*, termina con exito sin crear nada', async () => {
    await inRolledBackTransaction(async (tx) => {
      await resetIdentityToEmptyState(tx);
      const repository = createInitialAccessRepository(tx);

      const bootstrap = await seedInitialAccess({
        repository,
        passwordHasher: identity.passwordHasher,
        credentials: fakeCredentialsProvider,
      });
      expect(bootstrap.createdRoles.length).toBe(2);
      expect(bootstrap.createdAdmin).toBe(true);

      const outcome = await withSeedAdminEnvVarsCleared(() =>
        seedInitialAccess({
          repository,
          passwordHasher: identity.passwordHasher,
          credentials: readInitialAdminCredentialsFromEnv,
        }),
      );

      expect(outcome.createdRoles).toEqual([]);
      expect(outcome.createdAdmin).toBe(false);
      expect(await tx.user.count()).toBe(1);
      expect(await tx.role.count({ where: { name: { in: [ROLE_ADMINISTRADOR, ROLE_OPERADOR] } } })).toBe(2);
    });
  });

  // Caso 7 (R13): admin ausente y variables ausentes -> lanza, nada creado.
  it('si el administrador no existe y faltan las SEED_ADMIN_*, lanza nombrando la variable y no crea ningun rol', async () => {
    await inRolledBackTransaction(async (tx) => {
      await resetIdentityToEmptyState(tx);
      expect(await seedRoleNames(tx)).toEqual([]);
      const roleCountBefore = await tx.role.count();

      const repository = createInitialAccessRepository(tx);

      await expect(
        withSeedAdminEnvVarsCleared(() =>
          seedInitialAccess({
            repository,
            passwordHasher: identity.passwordHasher,
            credentials: readInitialAdminCredentialsFromEnv,
          }),
        ),
      ).rejects.toThrow(/SEED_ADMIN_/);

      // Ni los roles quedan creados (R13): el conteo sigue siendo el de antes de invocar.
      expect(await tx.role.count()).toBe(roleCountBefore);
      expect(await seedRoleNames(tx)).toEqual([]);
      expect(await tx.user.count()).toBe(0);
    });
  });

  // Caso 8 (R17): document_types intacto tras la doble corrida.
  it('document_types queda exactamente igual, en conteo y en filas, tras la doble corrida', async () => {
    await inRolledBackTransaction(async (tx) => {
      const documentTypesBefore = await tx.documentType.findMany({ orderBy: { code: 'asc' } });
      expect(documentTypesBefore.length).toBeGreaterThan(0);

      await resetIdentityToEmptyState(tx);
      const repository = createInitialAccessRepository(tx);

      const first = await seedInitialAccess({
        repository,
        passwordHasher: identity.passwordHasher,
        credentials: fakeCredentialsProvider,
      });
      expect(first.createdRoles.length).toBe(2);
      expect(first.createdAdmin).toBe(true);

      const second = await seedInitialAccess({
        repository,
        passwordHasher: identity.passwordHasher,
        credentials: fakeCredentialsProvider,
      });
      expect(second.createdRoles).toEqual([]);
      expect(second.createdAdmin).toBe(false);

      const documentTypesAfter = await tx.documentType.findMany({ orderBy: { code: 'asc' } });
      expect(documentTypesAfter).toHaveLength(documentTypesBefore.length);
      expect(documentTypesAfter).toEqual(documentTypesBefore);
    });
  });
});

// ---------------------------------------------------------------------------
// `withInitialAccessTransaction` — la garantia de `design.md > 5.2` (R13, B-2)
// ---------------------------------------------------------------------------
//
// OJO: estos dos casos NO pueden ir dentro de `inRolledBackTransaction`, porque
// `prisma.$transaction` no se anida sobre un `Prisma.TransactionClient` (el `tx` de
// `inRolledBackTransaction` ya ES una transaccion). Corren contra el cliente
// COMPARTIDO, y cada uno se limpia solo: el caso positivo borra lo que creo con
// exito; el caso negativo confia en que la transaccion revierte y solo verifica.
// Nombres de rol IRREPETIBLES (`randomUUID()`) para no depender de lo que ya haya en la
// base ni tocar `Administrador`/`Operador`.
describe('withInitialAccessTransaction — commitea en exito y revierte en fallo (R13)', () => {
  it('mitad positiva: si `run` termina bien, lo escrito queda commiteado de verdad', async () => {
    const roleName = `qc6-tx-commit-${randomUUID()}`;
    try {
      await withInitialAccessTransaction(async (repository) => {
        await repository.createRole({ name: roleName, description: 'rol de prueba de commit (QC-6)' });
      });

      const created = await prisma.role.findUnique({ where: { name: roleName } });
      expect(created).not.toBeNull();
    } finally {
      await prisma.role.deleteMany({ where: { name: roleName } });
    }
  });

  it('mitad negativa: si `run` lanza, lo escrito antes del fallo NO queda commiteado', async () => {
    const roleName = `qc6-tx-rollback-${randomUUID()}`;
    const mensajeDeError = 'fallo simulado dentro de withInitialAccessTransaction (QC-6)';
    try {
      await expect(
        withInitialAccessTransaction(async (repository) => {
          await repository.createRole({ name: roleName, description: 'rol de prueba de rollback (QC-6)' });
          throw new Error(mensajeDeError);
        }),
      ).rejects.toThrow(mensajeDeError);

      const found = await prisma.role.findUnique({ where: { name: roleName } });
      expect(found).toBeNull();
    } finally {
      await prisma.role.deleteMany({ where: { name: roleName } });
    }
  });
});
