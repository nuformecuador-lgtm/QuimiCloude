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
 * catalogo de roles pueda quedar realmente vacio. Y antes de `users` hay que vaciar lo que
 * le apunta (`recipes`, `products`, `suppliers`, `orders`, `supplier_catalog_lines`, y lo
 * que cuelgue de ellas): esas FK de auditoria son `ON DELETE RESTRICT`. Como todo el `tx`
 * termina en `ROLLBACK`, este borrado nunca toca la base de verdad.
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
import { INITIAL_COMPANY_NAME } from '@/lib/modules/identity/domain/companies';
import { normalizeCompanyName } from '@/lib/modules/identity/domain/company-name';
import { DOCUMENT_TYPE_CC } from '@/lib/modules/identity/domain/document-type';
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
// QC-19 R18: el marcador de instalacion de estos tests cumple la politica real
// (mayuscula, minuscula, digito, simbolo, 8..64 y fuera de la lista de filtradas),
// porque el seed la evalua antes de hashear. Sigue siendo evidentemente ficticio.
const FAKE_ADMIN_CREDENTIAL = 'QC6-credencial-de-instalacion-de-prueba-no-real';
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

/** Una arista `child -> parent` del grafo de claves foraneas del esquema `public`. */
type ForeignKeyEdge = { readonly child: string; readonly parent: string };

/** Identificador de tabla admisible para interpolar en un `DELETE FROM`. */
const SAFE_TABLE_NAME = /^[a-z_][a-z0-9_]*$/;

/**
 * Devuelve las tablas que dependen de `users` (directa o transitivamente), ordenadas para
 * poder borrarlas de arriba a abajo sin violar ninguna FK: primero las hojas, al final las
 * que estan pegadas a `users`. `users` NO va en la lista; lo borra su llamador.
 *
 * Se lee del CATALOGO de Postgres, no de una lista escrita a mano, a proposito: cuando un
 * modulo nuevo añada una columna de auditoria hacia `users` (ya pasó con `recipes`,
 * `products`, `suppliers`, `orders` y `supplier_catalog_lines`), este helper lo recoge solo
 * y el archivo no vuelve a ponerse rojo por una tabla que nadie recordo listar aqui.
 */
async function tablesDependingOnUsers(tx: Prisma.TransactionClient): Promise<readonly string[]> {
  const edges = await tx.$queryRaw<ForeignKeyEdge[]>`
    SELECT hijo.relname::text AS child, padre.relname::text AS parent
    FROM pg_constraint con
    JOIN pg_class hijo ON hijo.oid = con.conrelid
    JOIN pg_class padre ON padre.oid = con.confrelid
    JOIN pg_namespace ns ON ns.oid = hijo.relnamespace
    WHERE con.contype = 'f' AND ns.nspname = 'public' AND hijo.relname <> padre.relname
  `;

  // Cierre transitivo hacia abajo desde `users`, sin incluir a `users`.
  const pending = new Set<string>();
  const queue: string[] = ['users'];
  while (queue.length > 0) {
    const parent = queue.shift() as string;
    for (const edge of edges) {
      if (edge.parent !== parent || pending.has(edge.child) || edge.child === 'users') continue;
      pending.add(edge.child);
      queue.push(edge.child);
    }
  }

  // Orden de borrado: en cada vuelta salen las tablas a las que ya no apunta ninguna otra
  // tabla pendiente. El grafo de este esquema es aciclico; si dejara de serlo, se avisa en
  // vez de emitir un DELETE que reventaria con un mensaje mucho peor.
  const ordered: string[] = [];
  while (pending.size > 0) {
    const leaves = [...pending].filter(
      (table) => !edges.some((edge) => edge.parent === table && pending.has(edge.child)),
    );
    if (leaves.length === 0) {
      throw new Error(
        `ciclo de claves foraneas entre las tablas dependientes de users: ${[...pending].join(', ')}`,
      );
    }
    for (const leaf of leaves.sort()) {
      ordered.push(leaf);
      pending.delete(leaf);
    }
  }
  return ordered;
}

/**
 * Deja, DENTRO del `tx`, un estado sin ningun usuario (vivo ni borrado) y sin los roles
 * `Administrador`/`Operador`. Necesario porque la base local YA trae 2 roles y 1
 * administrador vivo de una corrida anterior del seed real: sin este borrado, ningun
 * caso podria observar "primera corrida sobre base vacia".
 *
 * Antes de tocar `users` hay que vaciar lo que le apunta: las FK de auditoria
 * (`created_by`/`updated_by` de `recipes`, `products`, `suppliers`, `orders`,
 * `supplier_catalog_lines`) son `ON DELETE RESTRICT`, asi que basta UNA fila viva de
 * cualquiera de esas tablas para que `tx.user.deleteMany({})` reviente. Este archivo pasaba
 * "por suerte" mientras la base local no tenia productos ni recetas sembrados; en cuanto
 * alguien sembro datos, los 8 casos se pusieron rojos. Ahora el escenario se construye
 * entero y el test no depende de con que datos arranque la base local.
 *
 * TODO ESTO SIGUE DENTRO DEL `tx` QUE TERMINA EN ROLLBACK: no se pierde ni una fila real.
 */
async function resetIdentityToEmptyState(tx: Prisma.TransactionClient): Promise<void> {
  for (const table of await tablesDependingOnUsers(tx)) {
    if (!SAFE_TABLE_NAME.test(table)) {
      throw new Error(`nombre de tabla inesperado en el catalogo: ${table}`);
    }
    await tx.$executeRawUnsafe(`DELETE FROM "${table}"`);
  }
  await tx.user.deleteMany({});
  // QC-47: `memberships` ya cae en el barrido de arriba (es hija de `users` en el catalogo
  // de FK), pero `companies` NO apunta a `users`, asi que hay que vaciarla aparte para
  // poder observar de verdad "no existe ninguna empresa" (R18). Sigue dentro del `tx`.
  await tx.company.deleteMany({});
  await tx.role.deleteMany({ where: { name: { in: [ROLE_ADMINISTRADOR, ROLE_OPERADOR] } } });
}

async function seedRoleNames(tx: Prisma.TransactionClient): Promise<readonly string[]> {
  const roles = await tx.role.findMany({
    where: { name: { in: [ROLE_ADMINISTRADOR, ROLE_OPERADOR] } },
    select: { name: true },
  });
  return roles.map((role) => role.name);
}

/**
 * QC-47: el administrador vivo ya no se busca por `users.role_id` sino por su
 * PERTENENCIA. Es la misma pregunta que hace `countLiveUsersWithRole`, escrita aqui para
 * las aserciones del test.
 */
async function findLiveAdmin(tx: Prisma.TransactionClient) {
  return tx.user.findFirst({
    where: { deletedAt: null, memberships: { some: { role: { name: ROLE_ADMINISTRADOR } } } },
    include: { memberships: { include: { role: true, company: true } } },
  });
}

/** Nombre del rol con el que la persona figura en su unica pertenencia. */
function roleNameOf(admin: { memberships: readonly { role: { name: string } }[] }): string {
  expect(admin.memberships).toHaveLength(1);
  const first = admin.memberships[0];
  if (first === undefined) throw new Error('inalcanzable');
  return first.role.name;
}

/** Crea un usuario vivo con UNA pertenencia al rol y empresa dados. */
async function createUserWithMembership(
  tx: Prisma.TransactionClient,
  input: { username: string; email: string; documentNumber: string; roleId: string; companyId: string },
): Promise<{ id: string }> {
  return tx.user.create({
    data: {
      firstNames: 'Persona',
      lastNames: 'De Prueba',
      birthDate: new Date('1990-05-17T00:00:00.000Z'),
      email: input.email,
      phone: '+57 300 111 2233',
      documentTypeCode: DOCUMENT_TYPE_CC,
      documentNumber: input.documentNumber,
      username: input.username,
      passwordHash: 'hash-de-prueba-no-es-un-algoritmo-real',
      memberships: { create: { companyId: input.companyId, roleId: input.roleId } },
    },
    select: { id: true },
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
      expect(await tx.company.count()).toBe(0);
      expect(await tx.membership.count()).toBe(0);

      const repository = createInitialAccessRepository(tx);

      const first = await seedInitialAccess({
        repository,
        passwordHasher: identity.passwordHasher,
        // QC-19 R18: el seed evalua la politica antes de hashear. Aqui se le da la REAL,
        // la misma que expone la fachada: si el marcador de instalacion de estos tests
        // dejara de cumplirla, este archivo se pone rojo, que es lo que se quiere.
        checkCredentialPolicy: identity.checkCredentialPolicy,
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
      expect(roleNameOf(adminAfterFirst)).toBe(ROLE_ADMINISTRADOR);

      const usersAfterFirst = await tx.user.count();
      expect(usersAfterFirst).toBe(1);

      // QC-47 R18: UNA empresa, con el literal de la unica constante y su normalizado
      // calculado por la unica definicion de la normalizacion (R20), y UNA pertenencia
      // que une al administrador con ella.
      expect(first.createdCompany).toBe(INITIAL_COMPANY_NAME);
      const companiesAfterFirst = await tx.company.findMany();
      expect(companiesAfterFirst).toHaveLength(1);
      expect(companiesAfterFirst[0]?.name).toBe(INITIAL_COMPANY_NAME);
      expect(companiesAfterFirst[0]?.nameNormalized).toBe(normalizeCompanyName(INITIAL_COMPANY_NAME));
      const membershipsAfterFirst = await tx.membership.findMany();
      expect(membershipsAfterFirst).toHaveLength(1);
      expect(membershipsAfterFirst[0]?.userId).toBe(adminAfterFirst.id);
      expect(membershipsAfterFirst[0]?.companyId).toBe(companiesAfterFirst[0]?.id);

      // Segunda corrida: no debe duplicar ni modificar nada (R14, R15, R16).
      const second = await seedInitialAccess({
        repository,
        passwordHasher: identity.passwordHasher,
        // QC-19 R18: el seed evalua la politica antes de hashear. Aqui se le da la REAL,
        // la misma que expone la fachada: si el marcador de instalacion de estos tests
        // dejara de cumplirla, este archivo se pone rojo, que es lo que se quiere.
        checkCredentialPolicy: identity.checkCredentialPolicy,
        credentials: fakeCredentialsProvider,
      });
      expect(second.createdRoles).toEqual([]);
      expect(second.createdAdmin).toBe(false);
      expect(second.createdCompany).toBeNull();

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

      // QC-47 R19: sigue habiendo UNA empresa y UNA pertenencia, y son las mismas filas
      // (comparacion campo a campo, ids y timestamps incluidos: nada se reescribio).
      expect(await tx.company.findMany()).toEqual(companiesAfterFirst);
      expect(await tx.membership.findMany()).toEqual(membershipsAfterFirst);
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
        // QC-19 R18: el seed evalua la politica antes de hashear. Aqui se le da la REAL,
        // la misma que expone la fachada: si el marcador de instalacion de estos tests
        // dejara de cumplirla, este archivo se pone rojo, que es lo que se quiere.
        checkCredentialPolicy: identity.checkCredentialPolicy,
        credentials: fakeCredentialsProvider,
      });
      expect(outcome.createdAdmin).toBe(true);

      const admin = await findLiveAdmin(tx);
      expect(admin).not.toBeNull();
      if (admin === null) throw new Error('inalcanzable');
      expect(admin.mustChangeCredential).toBe(true);
      expect(roleNameOf(admin)).toBe(ROLE_ADMINISTRADOR);
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
        // QC-19 R18: el seed evalua la politica antes de hashear. Aqui se le da la REAL,
        // la misma que expone la fachada: si el marcador de instalacion de estos tests
        // dejara de cumplirla, este archivo se pone rojo, que es lo que se quiere.
        checkCredentialPolicy: identity.checkCredentialPolicy,
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
        // QC-19 R18: el seed evalua la politica antes de hashear. Aqui se le da la REAL,
        // la misma que expone la fachada: si el marcador de instalacion de estos tests
        // dejara de cumplirla, este archivo se pone rojo, que es lo que se quiere.
        checkCredentialPolicy: identity.checkCredentialPolicy,
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
        // QC-19 R18: el seed evalua la politica antes de hashear. Aqui se le da la REAL,
        // la misma que expone la fachada: si el marcador de instalacion de estos tests
        // dejara de cumplirla, este archivo se pone rojo, que es lo que se quiere.
        checkCredentialPolicy: identity.checkCredentialPolicy,
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
        // QC-19 R18: el seed evalua la politica antes de hashear. Aqui se le da la REAL,
        // la misma que expone la fachada: si el marcador de instalacion de estos tests
        // dejara de cumplirla, este archivo se pone rojo, que es lo que se quiere.
        checkCredentialPolicy: identity.checkCredentialPolicy,
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
        // QC-19 R18: el seed evalua la politica antes de hashear. Aqui se le da la REAL,
        // la misma que expone la fachada: si el marcador de instalacion de estos tests
        // dejara de cumplirla, este archivo se pone rojo, que es lo que se quiere.
        checkCredentialPolicy: identity.checkCredentialPolicy,
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
        // QC-19 R18: el seed evalua la politica antes de hashear. Aqui se le da la REAL,
        // la misma que expone la fachada: si el marcador de instalacion de estos tests
        // dejara de cumplirla, este archivo se pone rojo, que es lo que se quiere.
        checkCredentialPolicy: identity.checkCredentialPolicy,
        credentials: fakeCredentialsProvider,
      });
      expect(bootstrap.createdRoles.length).toBe(2);
      expect(bootstrap.createdAdmin).toBe(true);

      const outcome = await withSeedAdminEnvVarsCleared(() =>
        seedInitialAccess({
          repository,
          passwordHasher: identity.passwordHasher,
          checkCredentialPolicy: identity.checkCredentialPolicy,
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
            checkCredentialPolicy: identity.checkCredentialPolicy,
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
        // QC-19 R18: el seed evalua la politica antes de hashear. Aqui se le da la REAL,
        // la misma que expone la fachada: si el marcador de instalacion de estos tests
        // dejara de cumplirla, este archivo se pone rojo, que es lo que se quiere.
        checkCredentialPolicy: identity.checkCredentialPolicy,
        credentials: fakeCredentialsProvider,
      });
      expect(first.createdRoles.length).toBe(2);
      expect(first.createdAdmin).toBe(true);

      const second = await seedInitialAccess({
        repository,
        passwordHasher: identity.passwordHasher,
        // QC-19 R18: el seed evalua la politica antes de hashear. Aqui se le da la REAL,
        // la misma que expone la fachada: si el marcador de instalacion de estos tests
        // dejara de cumplirla, este archivo se pone rojo, que es lo que se quiere.
        checkCredentialPolicy: identity.checkCredentialPolicy,
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
// QC-47 — `countLiveUsersWithRole` contra la pertenencia (R19, `design.md > 9` riesgo 1)
// ---------------------------------------------------------------------------
//
// Este bloque existe porque la ficha declara ESTA traduccion como su riesgo numero 1: la
// lectura que decide `needsAdmin` paso de `users.role_id` a `memberships`, y si cuenta de
// mas o de menos el seed deja de ser idempotente y crea un segundo administrador en cada
// despliegue, con el E2E de login en verde. No basta con leer el resultado del seed: cada
// caso construye un escenario que DISTINGUE la traduccion correcta de las plausibles
// (contar pertenencias en vez de personas, olvidar `deleted_at`, ignorar el nombre del rol)
// y comprueba ademas que el seed se comporta en consecuencia.

describe('countLiveUsersWithRole cuenta PERSONAS VIVAS con ese rol en ALGUNA empresa (R19)', () => {
  it('tras la primera corrida devuelve 1, y una segunda corrida no crea segunda empresa, admin ni pertenencia', async () => {
    await inRolledBackTransaction(async (tx) => {
      await resetIdentityToEmptyState(tx);
      const repository = createInitialAccessRepository(tx);

      // Sobre la base vacia la cuenta es 0: sin esto, un `where` que devolviera siempre
      // un numero fijo pasaria el resto del caso.
      expect(await repository.countLiveUsersWithRole(ROLE_ADMINISTRADOR)).toBe(0);

      const first = await seedInitialAccess({
        repository,
        passwordHasher: identity.passwordHasher,
        checkCredentialPolicy: identity.checkCredentialPolicy,
        credentials: fakeCredentialsProvider,
      });
      expect(first.createdAdmin).toBe(true);
      expect(first.createdCompany).toBe(INITIAL_COMPANY_NAME);

      // La lectura ve al administrador POR SU PERTENENCIA.
      expect(await repository.countLiveUsersWithRole(ROLE_ADMINISTRADOR)).toBe(1);

      const second = await seedInitialAccess({
        repository,
        passwordHasher: identity.passwordHasher,
        checkCredentialPolicy: identity.checkCredentialPolicy,
        credentials: fakeCredentialsProvider,
      });
      expect(second.createdAdmin).toBe(false);
      expect(second.createdCompany).toBeNull();
      expect(second.createdRoles).toEqual([]);

      expect(await tx.company.count()).toBe(1);
      expect(await tx.user.count()).toBe(1);
      expect(await tx.membership.count()).toBe(1);
    });
  });

  it('una persona con DOS pertenencias de rol Administrador sigue contando UNA, y el seed no crea nada', async () => {
    await inRolledBackTransaction(async (tx) => {
      await resetIdentityToEmptyState(tx);
      const repository = createInitialAccessRepository(tx);

      const first = await seedInitialAccess({
        repository,
        passwordHasher: identity.passwordHasher,
        checkCredentialPolicy: identity.checkCredentialPolicy,
        credentials: fakeCredentialsProvider,
      });
      expect(first.createdAdmin).toBe(true);

      const admin = await findLiveAdmin(tx);
      if (admin === null) throw new Error('inalcanzable');
      const administradorRole = await tx.role.findUniqueOrThrow({ where: { name: ROLE_ADMINISTRADOR } });

      // Segunda empresa y segunda pertenencia de la MISMA persona (el modelo lo permite
      // desde el dia uno, R8). Una traduccion que contara `memberships` en vez de `users`
      // devolveria 2 aqui, y este caso es el unico que la caza.
      const otraEmpresa = await tx.company.create({
        data: { name: 'Otra Empresa QC-47', nameNormalized: normalizeCompanyName('Otra Empresa QC-47') },
      });
      await tx.membership.create({
        data: { userId: admin.id, companyId: otraEmpresa.id, roleId: administradorRole.id },
      });
      expect(await tx.membership.count()).toBe(2);

      expect(await repository.countLiveUsersWithRole(ROLE_ADMINISTRADOR)).toBe(1);

      const second = await seedInitialAccess({
        repository,
        passwordHasher: identity.passwordHasher,
        checkCredentialPolicy: identity.checkCredentialPolicy,
        credentials: fakeCredentialsProvider,
      });
      expect(second.createdAdmin).toBe(false);
      expect(second.createdCompany).toBeNull();
      expect(await tx.user.count()).toBe(1);
      expect(await tx.membership.count()).toBe(2);
    });
  });

  it('un administrador dado de baja NO cuenta, y entonces el seed vuelve a crear administrador reutilizando la empresa', async () => {
    await inRolledBackTransaction(async (tx) => {
      await resetIdentityToEmptyState(tx);
      const repository = createInitialAccessRepository(tx);

      const first = await seedInitialAccess({
        repository,
        passwordHasher: identity.passwordHasher,
        checkCredentialPolicy: identity.checkCredentialPolicy,
        credentials: fakeCredentialsProvider,
      });
      expect(first.createdAdmin).toBe(true);
      expect(await repository.countLiveUsersWithRole(ROLE_ADMINISTRADOR)).toBe(1);

      const admin = await findLiveAdmin(tx);
      if (admin === null) throw new Error('inalcanzable');
      // Baja LOGICA: la pertenencia sigue ahi. Si el `where` perdiera `deleted_at: null`,
      // seguiria contando 1 y este caso se pondria rojo.
      await tx.user.update({ where: { id: admin.id }, data: { deletedAt: new Date(), username: 'baja.qc47' } });
      expect(await tx.membership.count()).toBe(1);
      expect(await repository.countLiveUsersWithRole(ROLE_ADMINISTRADOR)).toBe(0);

      // Y el seed reacciona: crea un administrador nuevo, pero REUTILIZA la empresa que ya
      // existe (R19). Dos empresas aqui serian el fallo que describe `design.md > 9`.
      const second = await seedInitialAccess({
        repository,
        passwordHasher: identity.passwordHasher,
        checkCredentialPolicy: identity.checkCredentialPolicy,
        credentials: fakeCredentialsProvider,
      });
      expect(second.createdAdmin).toBe(true);
      expect(second.createdCompany).toBeNull();
      expect(await tx.company.count()).toBe(1);
      expect(await tx.membership.count()).toBe(2);
      expect(await repository.countLiveUsersWithRole(ROLE_ADMINISTRADOR)).toBe(1);
    });
  });

  it('una persona viva cuya unica pertenencia es de rol Operador no cuenta como Administrador', async () => {
    await inRolledBackTransaction(async (tx) => {
      await resetIdentityToEmptyState(tx);
      const repository = createInitialAccessRepository(tx);

      const first = await seedInitialAccess({
        repository,
        passwordHasher: identity.passwordHasher,
        checkCredentialPolicy: identity.checkCredentialPolicy,
        credentials: fakeCredentialsProvider,
      });
      expect(first.createdAdmin).toBe(true);

      const empresa = await tx.company.findFirstOrThrow();
      const operadorRole = await tx.role.findUniqueOrThrow({ where: { name: ROLE_OPERADOR } });
      await createUserWithMembership(tx, {
        username: 'operador.qc47.test',
        email: 'operador.qc47@example.test',
        documentNumber: '47000001',
        roleId: operadorRole.id,
        companyId: empresa.id,
      });

      // Dos personas vivas con pertenencia, pero solo UNA es Administrador. Un `where` que
      // ignorara el nombre del rol devolveria 2.
      expect(await tx.user.count({ where: { deletedAt: null } })).toBe(2);
      expect(await repository.countLiveUsersWithRole(ROLE_ADMINISTRADOR)).toBe(1);
      expect(await repository.countLiveUsersWithRole(ROLE_OPERADOR)).toBe(1);
    });
  });

  it('una persona viva SIN ninguna pertenencia no cuenta con ningun rol', async () => {
    await inRolledBackTransaction(async (tx) => {
      await resetIdentityToEmptyState(tx);
      const repository = createInitialAccessRepository(tx);

      const administradorRole = await tx.role.create({
        data: { name: ROLE_ADMINISTRADOR, description: 'rol de prueba QC-47' },
      });
      await tx.user.create({
        data: {
          firstNames: 'Sin',
          lastNames: 'Pertenencia',
          birthDate: new Date('1990-05-17T00:00:00.000Z'),
          email: 'sin.pertenencia.qc47@example.test',
          phone: '+57 300 111 2233',
          documentTypeCode: DOCUMENT_TYPE_CC,
          documentNumber: '47000002',
          username: 'sin.pertenencia.qc47',
          passwordHash: 'hash-de-prueba-no-es-un-algoritmo-real',
        },
      });

      expect(administradorRole.name).toBe(ROLE_ADMINISTRADOR);
      expect(await tx.user.count({ where: { deletedAt: null } })).toBe(1);
      // La persona existe y esta viva, pero no es nada en ninguna empresa: el `some` no
      // la ve. Es lo que hace que el seed le de a la instalacion su administrador (R17).
      expect(await repository.countLiveUsersWithRole(ROLE_ADMINISTRADOR)).toBe(0);
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
  // DEFENSA EN PROFUNDIDAD — esto NO reemplaza al `try/finally` de cada `it`: ese
  // `finally` sigue siendo quien limpia en la corrida normal y ante un `expect` fallido,
  // porque corre justo despues de cada caso. Este `afterAll` solo barre lo que quedaria
  // vivo si el proceso muriera de golpe (Ctrl-C, timeout del runner, kill) entre el
  // commit y el `finally` de una corrida ANTERIOR: en ese escenario el `finally` nunca
  // llega a ejecutarse y el rol `qc6-tx-*` queda huerfano en la base. Esa base de test es
  // COMPARTIDA ahora mismo por otras sesiones (QC-8, QC-12, QC-19, QC-20 tienen worktree
  // montado contra el mismo Postgres local), asi que ese residuo ya no seria solo
  // problema de esta feature.
  afterAll(async () => {
    await prisma.role.deleteMany({ where: { name: { startsWith: 'qc6-tx-' } } });
  });

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
