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
 *
 * QC-47 (T19) — este fixture no crea usuarios a mano: los crea el propio seed, que ahora los
 * mete DENTRO de la empresa inicial (R20). Lo que si cambia es el escenario «base vacia»:
 * `resetIdentityToEmptyState` borra tambien `companies` —despues de `users`, que es el unico
 * orden que respeta `users_company_id_fkey`— para que la primera corrida tenga que CREAR la
 * empresa en vez de reutilizar la que dejo la instalacion. Sigue todo dentro del `tx` que
 * termina en ROLLBACK.
 *
 * QC-49 — esa ficha colgo el inventario (`units`, `products`, `presentations`,
 * `product_batches`) de `companies`, no de `users`, y el barrido previo solo recorria el
 * cierre de `users`: esas tablas sobrevivian al reset y el borrado de `companies` moria con
 * `Foreign key constraint violated`. Desde ahora el cierre se calcula desde AMBOS origenes.
 */
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Prisma } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';

import { identity } from '@/lib/composition';
import {
  readInitialAdminCredentialsFromEnv,
  readInitialMaestroCredentialsFromEnv,
} from '@/lib/modules/identity/adapters/driven/config/initial-access-credentials-env';
import {
  createInitialAccessRepository,
  withInitialAccessTransaction,
} from '@/lib/modules/identity/adapters/driven/persistence/initial-access-repository-prisma';
import {
  INITIAL_COMPANY_NAME,
  INITIAL_USER_ACCOUNT_STATUS,
  SEED_ADMIN_ACCOUNT_STATUS,
  normalizeCompanyName,
} from '@/lib/modules/identity';
import { PERMISSIONS, SEED_ROLE_PERMISSIONS } from '@/lib/modules/identity/domain/permissions';
import { ROLE_ADMINISTRADOR, ROLE_EMPACADOR, ROLE_OPERADOR, SEED_ROLES } from '@/lib/modules/identity/domain/roles';
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

const FAKE_MAESTRO_USERNAME = 'qc161.maestro.test';
const FAKE_MAESTRO_CREDENTIAL = 'QC161-credencial-del-maestro-de-prueba-no-real';
const FAKE_MAESTRO_EMAIL = 'qc161.maestro.test@example.test';

const fakeMaestroCredentialsProvider: InitialAdminCredentialsProvider = () => ({
  username: FAKE_MAESTRO_USERNAME,
  credential: FAKE_MAESTRO_CREDENTIAL,
  email: FAKE_MAESTRO_EMAIL,
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

/** Los nombres de los roles de semilla, derivados de `SEED_ROLES` y nunca copiados a mano: asi el
 *  reset y la lectura de "que roles de semilla hay" siguen correctos aunque el catalogo de roles
 *  gane uno mas. */
const SEED_ROLE_NAMES = SEED_ROLES.map((role) => role.name);

/**
 * Las tablas que el llamador borra por su cuenta y que, por tanto, nunca deben aparecer en
 * la lista que devuelve `tablesDependingOn`: son los ORIGENES del recorrido.
 *
 * QC-49 — antes el unico origen era `users`. Esa ficha colgo el inventario (`units`,
 * `products`, `presentations`, `product_batches`) directamente de `companies`, no de
 * `users`, asi que el cierre transitivo desde `users` no las visitaba nunca: sobrevivian al
 * reset y hacian reventar el `tx.company.deleteMany({})` del final con
 * `Foreign key constraint violated`. Con `companies` tambien como origen, esas tablas entran
 * en el recorrido y se van antes que la empresa que las sostiene.
 */
const RESET_ROOT_TABLES = ['users', 'companies'] as const;

/**
 * Devuelve las tablas que dependen de cualquiera de los `roots` (directa o transitivamente),
 * ordenadas para poder borrarlas de arriba a abajo sin violar ninguna FK: primero las hojas,
 * al final las que estan pegadas a un origen. Los propios `roots` NO van en la lista; los
 * borra su llamador (`tx.user.deleteMany` y `tx.company.deleteMany`).
 *
 * El ORDEN sale del mismo recorrido de siempre y sirve tal cual para varios origenes: el
 * cierre se calcula hacia ABAJO (de padre a hijo) sobre un unico conjunto `pending`, y luego
 * se emite por capas sacando en cada vuelta las tablas a las que ya no apunta ninguna otra
 * tabla pendiente. O sea que los hijos salen SIEMPRE antes que sus padres, incluso cuando
 * padre e hijo vienen de ramas distintas (`presentations` y `product_batches` cuelgan de
 * `products`, y `products` cuelga a la vez de `users` y de `companies`): al mezclarlo todo en
 * un solo conjunto, la dependencia se respeta sin tener que invertir nada.
 *
 * Se lee del CATALOGO de Postgres, no de una lista escrita a mano, a proposito: cuando un
 * modulo nuevo añada una columna de auditoria hacia `users` (ya pasó con `recipes`,
 * `products`, `suppliers`, `orders` y `supplier_catalog_lines`) o cuelgue una tabla de
 * `companies` (ya pasó con QC-49), este helper lo recoge solo y el archivo no vuelve a
 * ponerse rojo por una tabla que nadie recordo listar aqui.
 */
async function tablesDependingOn(
  tx: Prisma.TransactionClient,
  roots: readonly string[],
): Promise<readonly string[]> {
  const edges = await tx.$queryRaw<ForeignKeyEdge[]>`
    SELECT hijo.relname::text AS child, padre.relname::text AS parent
    FROM pg_constraint con
    JOIN pg_class hijo ON hijo.oid = con.conrelid
    JOIN pg_class padre ON padre.oid = con.confrelid
    JOIN pg_namespace ns ON ns.oid = hijo.relnamespace
    WHERE con.contype = 'f' AND ns.nspname = 'public' AND hijo.relname <> padre.relname
  `;

  // Cierre transitivo hacia abajo desde cada origen, sin incluir a los propios origenes.
  const rootSet = new Set(roots);
  const pending = new Set<string>();
  const queue: string[] = [...roots];
  while (queue.length > 0) {
    const parent = queue.shift() as string;
    for (const edge of edges) {
      if (edge.parent !== parent || pending.has(edge.child) || rootSet.has(edge.child)) continue;
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
        `ciclo de claves foraneas entre las tablas dependientes de ${roots.join('/')}: ${[...pending].join(', ')}`,
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
 * QC-49 — y lo mismo vale para `companies`: el inventario cuelga de la empresa, no del
 * usuario, asi que el barrido se hace desde los DOS origenes (`RESET_ROOT_TABLES`) en una
 * sola pasada ordenada. Si se hiciera en dos pasadas independientes, `products` —hijo de
 * ambos— podria intentar borrarse antes que `presentations`.
 *
 * TODO ESTO SIGUE DENTRO DEL `tx` QUE TERMINA EN ROLLBACK: no se pierde ni una fila real.
 */
async function resetIdentityToEmptyState(tx: Prisma.TransactionClient): Promise<void> {
  for (const table of await tablesDependingOn(tx, RESET_ROOT_TABLES)) {
    if (!SAFE_TABLE_NAME.test(table)) {
      throw new Error(`nombre de tabla inesperado en el catalogo: ${table}`);
    }
    await tx.$executeRawUnsafe(`DELETE FROM "${table}"`);
  }
  await tx.user.deleteMany({});
  // QC-74: `role_permissions` apunta a `roles` con ON DELETE RESTRICT, asi que las
  // asignaciones tienen que irse ANTES que los roles; y el catalogo, despues de ellas,
  // para que «base vacia» incluya de verdad a `permissions`. Sin esto, una base que ya
  // corrio el seed nuevo haria imposible observar la primera corrida.
  await tx.rolePermission.deleteMany({});
  await tx.permission.deleteMany({});
  await tx.role.deleteMany({ where: { name: { in: SEED_ROLE_NAMES } } });
  // QC-47: y las empresas, DESPUES de los usuarios. Sin esto, la empresa de instalacion
  // sobreviviria al reset y el seed la reutilizaria: «base vacia» dejaria de serlo.
  await tx.company.deleteMany({});
}

async function seedRoleNames(tx: Prisma.TransactionClient): Promise<readonly string[]> {
  const roles = await tx.role.findMany({
    where: { name: { in: SEED_ROLE_NAMES } },
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

/** Los codigos del catalogo, ordenados. Derivados de `PERMISSIONS`, nunca escritos aqui. */
const CODIGOS_DEL_CATALOGO = PERMISSIONS.map((permission) => permission.code).slice().sort();

/** Los codigos que el seed asigna a un rol, ordenados, tal como los declara el dominio. */
function codigosSembradosDe(roleName: string): readonly string[] {
  return [...(SEED_ROLE_PERMISSIONS[roleName] ?? [])].sort();
}

/** Numero total de asignaciones que el seed tiene que dejar, derivado de `SEED_ROLE_PERMISSIONS`. */
const TOTAL_DE_ASIGNACIONES_DEL_SEED = Object.values(SEED_ROLE_PERMISSIONS).reduce(
  (total, codes) => total + codes.length,
  0,
);

/** Los codigos que la BASE tiene asignados a un rol, leidos de `role_permissions`. */
async function codigosEnBaseDe(tx: Prisma.TransactionClient, roleName: string): Promise<string[]> {
  const filas = await tx.rolePermission.findMany({
    where: { role: { name: roleName } },
    select: { permissionCode: true },
    orderBy: { permissionCode: 'asc' },
  });
  return filas.map((fila) => fila.permissionCode);
}

// ---------------------------------------------------------------------------
// QC-86 T12 (R28) — el SQL de permisos de la migracion de las asignaciones, LEIDO DEL
// ARCHIVO. No se copia a mano a proposito: lo que este archivo tiene que notar es que
// alguien cambie `db/migrations/*_order_assignments/migration.sql`. Si manana ese SQL
// pierde su `ON CONFLICT ... DO NOTHING`, el caso de idempotencia se pone rojo con `23505`
// en vez de seguir verde sobre una copia que ya no representa a la migracion.
// ---------------------------------------------------------------------------

/** Sube desde este archivo hasta la raiz del repo (la carpeta con `package.json`). */
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

/**
 * Las sentencias EJECUTABLES del `migration.sql` de las asignaciones que escriben sobre
 * `permissions` / `role_permissions` (paso 5 de esa migracion; design.md > 4.2).
 *
 * La carpeta se localiza por PATRON, no por el timestamp escrito a pelo, igual que en
 * `tests/unit/asignaciones/schema/order-assignments-migration.test.ts`: si la migracion se
 * regenera con otra marca de tiempo, este test tiene que seguir apuntando a ella.
 *
 * Se quitan los comentarios antes de trocear: la cabecera de esa migracion habla largo y
 * tendido de `permissions` y `role_permissions` para dejar escrito lo que NO toca, y un
 * troceado ingenuo se llevaria esa prosa por delante.
 */
function sentenciasDePermisosDeLaMigracion(): readonly string[] {
  const migrationsDir = join(findRepoRoot(dirname(fileURLToPath(import.meta.url))), 'db', 'migrations');
  const carpetas = readdirSync(migrationsDir).filter((name) => /_order_assignments$/.test(name));
  expect(carpetas, 'debe existir exactamente una migracion de las asignaciones').toHaveLength(1);

  const sql = readFileSync(join(migrationsDir, carpetas[0] as string, 'migration.sql'), 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');

  return sql
    .split(';')
    .map((statement) => statement.replace(/\s+/g, ' ').trim())
    .filter((statement) => /^INSERT INTO "(permissions|role_permissions)"/i.test(statement));
}

/** Una foto comparable de TODO el catalogo y TODAS las asignaciones, filas completas. */
async function fotoDePermisos(tx: Prisma.TransactionClient) {
  return {
    permisos: await tx.permission.findMany({ orderBy: { code: 'asc' } }),
    asignaciones: await tx.rolePermission.findMany({
      orderBy: [{ roleId: 'asc' }, { permissionCode: 'asc' }],
    }),
  };
}

// ---------------------------------------------------------------------------

afterAll(async () => {
  await prisma.$disconnect();
});

describe('seedInitialAccess contra base real — la doble corrida', () => {
  // Doble corrida sobre base vacia, ahora con los TRES roles de `SEED_ROLES`.
  it('la primera corrida sobre base vacia crea todos los roles de SEED_ROLES y el administrador; la segunda no cambia nada', async () => {
    await inRolledBackTransaction(async (tx) => {
      await resetIdentityToEmptyState(tx);
      expect(await seedRoleNames(tx)).toEqual([]);
      expect(await findLiveAdmin(tx)).toBeNull();

      const repository = createInitialAccessRepository(tx);

      const first = await seedInitialAccess({
        repository,
        passwordHasher: identity.passwordHasher,
        // QC-19 R18: el seed evalua la politica antes de hashear. Aqui se le da la REAL,
        // la misma que expone la fachada: si el marcador de instalacion de estos tests
        // dejara de cumplirla, este archivo se pone rojo, que es lo que se quiere.
        checkCredentialPolicy: identity.checkCredentialPolicy,
        credentials: fakeCredentialsProvider,
        maestroCredentials: fakeMaestroCredentialsProvider,
      });

      // Se afirma PRIMERO que la primera corrida encontro/creo algo real.
      expect(first.createdRoles.slice().sort()).toEqual([...SEED_ROLE_NAMES].sort());
      expect(first.createdAdmin).toBe(true);

      const rolesAfterFirst = await tx.role.findMany({
        where: { name: { in: SEED_ROLE_NAMES } },
      });
      expect(rolesAfterFirst).toHaveLength(SEED_ROLE_NAMES.length);
      // El Empacador es global y una sola fila lo representa.
      expect(rolesAfterFirst.filter((role) => role.name === ROLE_EMPACADOR)).toHaveLength(1);

      const adminAfterFirst = await findLiveAdmin(tx);
      expect(adminAfterFirst).not.toBeNull();
      if (adminAfterFirst === null) throw new Error('inalcanzable');
      expect(adminAfterFirst.role.name).toBe(ROLE_ADMINISTRADOR);

      const usersAfterFirst = await tx.user.count();
      expect(usersAfterFirst).toBe(1);

      // Segunda corrida: no debe duplicar ni modificar nada.
      const second = await seedInitialAccess({
        repository,
        passwordHasher: identity.passwordHasher,
        // QC-19 R18: el seed evalua la politica antes de hashear. Aqui se le da la REAL,
        // la misma que expone la fachada: si el marcador de instalacion de estos tests
        // dejara de cumplirla, este archivo se pone rojo, que es lo que se quiere.
        checkCredentialPolicy: identity.checkCredentialPolicy,
        credentials: fakeCredentialsProvider,
        maestroCredentials: fakeMaestroCredentialsProvider,
      });
      expect(second.createdRoles).toEqual([]);
      expect(second.createdAdmin).toBe(false);

      const rolesAfterSecond = await tx.role.findMany({
        where: { name: { in: SEED_ROLE_NAMES } },
        orderBy: { name: 'asc' },
      });
      expect(rolesAfterSecond).toHaveLength(SEED_ROLE_NAMES.length);
      expect(rolesAfterSecond).toEqual(
        [...rolesAfterFirst].sort((a, b) => a.name.localeCompare(b.name)),
      );
      // Sigue habiendo una sola fila `Empacador` tras la segunda corrida.
      expect(rolesAfterSecond.filter((role) => role.name === ROLE_EMPACADOR)).toHaveLength(1);

      const adminAfterSecond = await findLiveAdmin(tx);
      expect(adminAfterSecond).not.toBeNull();
      // Comparacion campo a campo de la fila entera releida, id/password_hash/updated_at
      // y must_change_credential incluidos (design.md > 11).
      expect(adminAfterSecond).toEqual(adminAfterFirst);

      expect(await tx.user.count()).toBe(1);
      expect(await tx.role.count({ where: { name: { in: SEED_ROLE_NAMES } } })).toBe(SEED_ROLE_NAMES.length);
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
        maestroCredentials: fakeMaestroCredentialsProvider,
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
        // QC-19 R18: el seed evalua la politica antes de hashear. Aqui se le da la REAL,
        // la misma que expone la fachada: si el marcador de instalacion de estos tests
        // dejara de cumplirla, este archivo se pone rojo, que es lo que se quiere.
        checkCredentialPolicy: identity.checkCredentialPolicy,
        credentials: fakeCredentialsProvider,
        maestroCredentials: fakeMaestroCredentialsProvider,
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
        maestroCredentials: fakeMaestroCredentialsProvider,
      });
      expect(first.createdAdmin).toBe(true);
      expect(first.createdRoles.length).toBe(SEED_ROLE_NAMES.length);

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
        maestroCredentials: fakeMaestroCredentialsProvider,
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

  // Conviven todos los roles de semilla y solo falta uno.
  it('si solo falta el rol Operador, la corrida crea unicamente ese y deja Administrador y Empacador intactos', async () => {
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
        maestroCredentials: fakeMaestroCredentialsProvider,
      });
      expect(first.createdRoles.length).toBe(SEED_ROLE_NAMES.length);
      expect(first.createdAdmin).toBe(true);

      const administradorBeforeDelete = await tx.role.findUniqueOrThrow({ where: { name: ROLE_ADMINISTRADOR } });
      const empacadorBeforeDelete = await tx.role.findUniqueOrThrow({ where: { name: ROLE_EMPACADOR } });
      // Operador no tiene usuarios asignados: es borrable (ya probado en
      // identity-constraints.int.test.ts > "permite borrar un rol sin usuarios asignados").
      // QC-74: pero SI tiene ya su asignacion de permiso, y esa FK es ON DELETE RESTRICT,
      // asi que hay que retirarla antes. Que el borrado del rol falle sin este paso es
      // justo lo que `Restrict` promete: nadie se lleva por delante las asignaciones.
      await tx.rolePermission.deleteMany({ where: { role: { name: ROLE_OPERADOR } } });
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
        maestroCredentials: fakeMaestroCredentialsProvider,
      });
      expect(second.createdRoles).toEqual([ROLE_OPERADOR]);
      expect(second.createdAdmin).toBe(false);
      // QC-74 R9, R10: el rol vuelve con sus permisos, y el catalogo ya estaba. Eran uno hasta
      // QC-86 R26, que le suma `asignaciones.consultar`: ahora son DOS.
      expect(second.createdPermissions).toEqual([]);
      expect(second.createdRolePermissions).toBe(2);

      const operadorAfter = await tx.role.findUnique({ where: { name: ROLE_OPERADOR } });
      expect(operadorAfter).not.toBeNull();
      expect(await codigosEnBaseDe(tx, ROLE_OPERADOR)).toEqual([
        'asignaciones.consultar',
        'inventario.consultar',
      ]);

      const administradorAfter = await tx.role.findUniqueOrThrow({ where: { name: ROLE_ADMINISTRADOR } });
      expect(administradorAfter).toEqual(administradorBeforeDelete);
      // El Empacador nunca faltaba en este caso: la corrida no lo toca.
      const empacadorAfter = await tx.role.findUniqueOrThrow({ where: { name: ROLE_EMPACADOR } });
      expect(empacadorAfter).toEqual(empacadorBeforeDelete);
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
        maestroCredentials: fakeMaestroCredentialsProvider,
      });
      expect(bootstrap.createdRoles.length).toBe(SEED_ROLE_NAMES.length);
      expect(bootstrap.createdAdmin).toBe(true);

      const outcome = await withSeedAdminEnvVarsCleared(() =>
        seedInitialAccess({
          repository,
          passwordHasher: identity.passwordHasher,
          checkCredentialPolicy: identity.checkCredentialPolicy,
          credentials: readInitialAdminCredentialsFromEnv,
          maestroCredentials: readInitialMaestroCredentialsFromEnv,
        }),
      );

      expect(outcome.createdRoles).toEqual([]);
      expect(outcome.createdAdmin).toBe(false);
      expect(await tx.user.count()).toBe(1);
      expect(await tx.role.count({ where: { name: { in: SEED_ROLE_NAMES } } })).toBe(SEED_ROLE_NAMES.length);
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
            maestroCredentials: readInitialMaestroCredentialsFromEnv,
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
        maestroCredentials: fakeMaestroCredentialsProvider,
      });
      expect(first.createdRoles.length).toBe(SEED_ROLE_NAMES.length);
      expect(first.createdAdmin).toBe(true);

      const second = await seedInitialAccess({
        repository,
        passwordHasher: identity.passwordHasher,
        // QC-19 R18: el seed evalua la politica antes de hashear. Aqui se le da la REAL,
        // la misma que expone la fachada: si el marcador de instalacion de estos tests
        // dejara de cumplirla, este archivo se pone rojo, que es lo que se quiere.
        checkCredentialPolicy: identity.checkCredentialPolicy,
        credentials: fakeCredentialsProvider,
        maestroCredentials: fakeMaestroCredentialsProvider,
      });
      expect(second.createdRoles).toEqual([]);
      expect(second.createdAdmin).toBe(false);

      const documentTypesAfter = await tx.documentType.findMany({ orderBy: { code: 'asc' } });
      expect(documentTypesAfter).toHaveLength(documentTypesBefore.length);
      expect(documentTypesAfter).toEqual(documentTypesBefore);
    });
  });

  // Caso 9 (QC-47 R20, R21, R22): la empresa inicial y el usuario semilla DENTRO de ella.
  it('la primera corrida deja la empresa inicial con el usuario semilla dentro; la segunda no crea una segunda empresa', async () => {
    await inRolledBackTransaction(async (tx) => {
      await resetIdentityToEmptyState(tx);
      expect(await tx.company.count()).toBe(0);

      const repository = createInitialAccessRepository(tx);

      const first = await seedInitialAccess({
        repository,
        passwordHasher: identity.passwordHasher,
        checkCredentialPolicy: identity.checkCredentialPolicy,
        credentials: fakeCredentialsProvider,
        maestroCredentials: fakeMaestroCredentialsProvider,
      });
      expect(first.createdAdmin).toBe(true);
      // R21: el nombre sale de la UNICA constante del dominio, no de un literal ni del entorno.
      expect(first.createdCompany).toBe(INITIAL_COMPANY_NAME);

      const empresas = await tx.company.findMany();
      expect(empresas).toHaveLength(1);
      const [empresa] = empresas;
      if (empresa === undefined) throw new Error('inalcanzable');
      expect(empresa.name).toBe(INITIAL_COMPANY_NAME);
      expect(empresa.nameNormalized).toBe(normalizeCompanyName(INITIAL_COMPANY_NAME));
      expect(empresa.deletedAt).toBeNull();

      // R20: no queda ninguna persona fuera de la empresa, y la empresa no queda vacia.
      const admin = await findLiveAdmin(tx);
      expect(admin).not.toBeNull();
      if (admin === null) throw new Error('inalcanzable');
      expect(admin.companyId).toBe(empresa.id);
      expect(await tx.user.count({ where: { companyId: empresa.id } })).toBe(1);

      // R22: la segunda corrida no crea una segunda empresa ni toca la que hay.
      const second = await seedInitialAccess({
        repository,
        passwordHasher: identity.passwordHasher,
        checkCredentialPolicy: identity.checkCredentialPolicy,
        credentials: fakeCredentialsProvider,
        maestroCredentials: fakeMaestroCredentialsProvider,
      });
      expect(second.createdAdmin).toBe(false);
      expect(second.createdCompany).toBeNull();
      expect(await tx.company.findMany()).toEqual(empresas);
      expect(await tx.user.count()).toBe(1);
    });
  });

  // Caso 10 (QC-74 R7, R8, R9, R10): el catalogo y las asignaciones, contra base real.
  it('la primera corrida deja el catalogo completo, el Administrador con todos sus permisos y el Operador solo con inventario.consultar y asignaciones.consultar; la segunda no cambia ningun conteo', async () => {
    await inRolledBackTransaction(async (tx) => {
      await resetIdentityToEmptyState(tx);
      expect(await tx.permission.count()).toBe(0);
      expect(await tx.rolePermission.count()).toBe(0);

      const repository = createInitialAccessRepository(tx);

      const first = await seedInitialAccess({
        repository,
        passwordHasher: identity.passwordHasher,
        checkCredentialPolicy: identity.checkCredentialPolicy,
        credentials: fakeCredentialsProvider,
        maestroCredentials: fakeMaestroCredentialsProvider,
      });

      // Primero: la corrida SI creo el catalogo entero y todas las asignaciones del seed.
      expect(first.createdPermissions.slice().sort()).toEqual(CODIGOS_DEL_CATALOGO);
      expect(PERMISSIONS.length).toBeGreaterThan(0);
      expect(TOTAL_DE_ASIGNACIONES_DEL_SEED).toBeGreaterThan(0);
      expect(first.createdRolePermissions).toBe(TOTAL_DE_ASIGNACIONES_DEL_SEED);

      // Y la base lo confirma: las filas de `permissions` son exactamente las del catalogo.
      const catalogoEnBase = await tx.permission.findMany({ orderBy: { code: 'asc' } });
      expect(catalogoEnBase.map((permission) => permission.code)).toEqual(CODIGOS_DEL_CATALOGO);

      // El Administrador tiene el catalogo menos los codigos excluidos, escrito uno a uno — sin
      // comodin ni regla implicita: se leen de `role_permissions`, no de su nombre de rol.
      expect(await codigosEnBaseDe(tx, ROLE_ADMINISTRADOR)).toEqual(codigosSembradosDe(ROLE_ADMINISTRADOR));
      // R9 (enmendado por QC-86 R26): el Operador, exactamente DOS, ni uno mas (QC-86 R27).
      // Los dos helpers devuelven la lista ORDENADA alfabeticamente, de ahi el orden de aqui.
      expect(await codigosEnBaseDe(tx, ROLE_OPERADOR)).toEqual([
        'asignaciones.consultar',
        'inventario.consultar',
      ]);
      expect(codigosSembradosDe(ROLE_OPERADOR)).toEqual([
        'asignaciones.consultar',
        'inventario.consultar',
      ]);
      // QC-86 R27, dicho EN NEGATIVO y por su nombre: `recetas.consultar` abre hoy tambien el
      // formulario de edicion, y el Operador no lo tiene. La igualdad de arriba ya lo excluye;
      // esta linea hace que el dia que alguien lo anada, el mensaje del fallo lo NOMBRE.
      expect(await codigosEnBaseDe(tx, ROLE_OPERADOR)).not.toContain('recetas.consultar');
      expect(codigosSembradosDe(ROLE_OPERADOR)).not.toContain('recetas.consultar');

      const permisosTrasPrimera = await tx.permission.count();
      const asignacionesTrasPrimera = await tx.rolePermission.count();
      expect(permisosTrasPrimera).toBe(PERMISSIONS.length);
      expect(asignacionesTrasPrimera).toBe(TOTAL_DE_ASIGNACIONES_DEL_SEED);

      // R10: la segunda corrida no crea nada y no cambia ni un conteo ni una fila.
      const second = await seedInitialAccess({
        repository,
        passwordHasher: identity.passwordHasher,
        checkCredentialPolicy: identity.checkCredentialPolicy,
        credentials: fakeCredentialsProvider,
        maestroCredentials: fakeMaestroCredentialsProvider,
      });
      expect(second.createdPermissions).toEqual([]);
      expect(second.createdRolePermissions).toBe(0);

      expect(await tx.permission.count()).toBe(permisosTrasPrimera);
      expect(await tx.rolePermission.count()).toBe(asignacionesTrasPrimera);
      // Comparacion fila a fila, `created_at`/`updated_at` incluidos: un `upsert` que
      // reescribiera el catalogo se veria aqui aunque el conteo no se moviera.
      expect(await tx.permission.findMany({ orderBy: { code: 'asc' } })).toEqual(catalogoEnBase);
      expect(await codigosEnBaseDe(tx, ROLE_ADMINISTRADOR)).toEqual(codigosSembradosDe(ROLE_ADMINISTRADOR));
      expect(await codigosEnBaseDe(tx, ROLE_OPERADOR)).toEqual([
        'asignaciones.consultar',
        'inventario.consultar',
      ]);
    });
  });

  it('QC-142 R13: sobre la base ya sembrada salvo documentos.*, el seed crea exactamente esos dos permisos y las dos asignaciones del Administrador, y la segunda corrida no cambia nada', async () => {
    await inRolledBackTransaction(async (tx) => {
      const codigosDeDocumentos = PERMISSIONS.filter((permission) => permission.module === 'documentos')
        .map((permission) => permission.code)
        .sort();

      // La base local YA trae el seed completo (ver cabecera). Se retira SOLO lo de documentos,
      // dentro del tx, para simular una base sembrada antes de esta feature.
      await tx.rolePermission.deleteMany({ where: { permissionCode: { in: codigosDeDocumentos } } });
      await tx.permission.deleteMany({ where: { code: { in: codigosDeDocumentos } } });

      const permisosAntes = await tx.permission.count();
      const asignacionesAntes = await tx.rolePermission.count();
      const operadorAntes = await codigosEnBaseDe(tx, ROLE_OPERADOR);
      const empacadorAntes = await codigosEnBaseDe(tx, ROLE_EMPACADOR);

      const repository = createInitialAccessRepository(tx);
      const first = await seedInitialAccess({
        repository,
        passwordHasher: identity.passwordHasher,
        checkCredentialPolicy: identity.checkCredentialPolicy,
        credentials: fakeCredentialsProvider,
        maestroCredentials: fakeMaestroCredentialsProvider,
      });

      // Primero: se creo exactamente lo que faltaba de documentos, y nada mas.
      expect(first.createdPermissions.slice().sort()).toEqual(codigosDeDocumentos);
      expect(first.createdRolePermissions).toBe(codigosDeDocumentos.length);
      expect(await tx.permission.count()).toBe(permisosAntes + codigosDeDocumentos.length);
      expect(await tx.rolePermission.count()).toBe(asignacionesAntes + codigosDeDocumentos.length);
      expect(await codigosEnBaseDe(tx, ROLE_ADMINISTRADOR)).toEqual(codigosSembradosDe(ROLE_ADMINISTRADOR));
      // Operador y Empacador, intactos: ninguno gana documentos.*.
      expect(await codigosEnBaseDe(tx, ROLE_OPERADOR)).toEqual(operadorAntes);
      expect(await codigosEnBaseDe(tx, ROLE_EMPACADOR)).toEqual(empacadorAntes);

      // Y la segunda corrida, ya con el catalogo completo, no cambia ningun conteo.
      const second = await seedInitialAccess({
        repository,
        passwordHasher: identity.passwordHasher,
        checkCredentialPolicy: identity.checkCredentialPolicy,
        credentials: fakeCredentialsProvider,
        maestroCredentials: fakeMaestroCredentialsProvider,
      });
      expect(second.createdPermissions).toEqual([]);
      expect(second.createdRolePermissions).toBe(0);
      expect(await tx.permission.count()).toBe(permisosAntes + codigosDeDocumentos.length);
      expect(await tx.rolePermission.count()).toBe(asignacionesAntes + codigosDeDocumentos.length);
    });
  });

  // CADA rol de `SEED_ROLES` -no solo Administrador y Operador- tiene en la base exactamente los
  // permisos que el seed le declara, ni uno mas ni uno menos.
  it('R25 — cada rol de semilla tiene en `role_permissions` exactamente los permisos que declara SEED_ROLE_PERMISSIONS', async () => {
    await inRolledBackTransaction(async (tx) => {
      await resetIdentityToEmptyState(tx);
      const repository = createInitialAccessRepository(tx);

      await seedInitialAccess({
        repository,
        passwordHasher: identity.passwordHasher,
        checkCredentialPolicy: identity.checkCredentialPolicy,
        credentials: fakeCredentialsProvider,
        maestroCredentials: fakeMaestroCredentialsProvider,
      });

      for (const role of SEED_ROLES) {
        expect(
          await codigosEnBaseDe(tx, role.name),
          `permisos en base del rol «${role.name}»`,
        ).toEqual(codigosSembradosDe(role.name));
      }
      // Y el Empacador, nombrado, en negativo: ni inventario ni asignaciones.modificar.
      expect(await codigosEnBaseDe(tx, ROLE_EMPACADOR)).toEqual([
        'asignaciones.consultar',
        'empaque.modificar',
        'terminados.consultar',
      ]);
      expect(await codigosEnBaseDe(tx, ROLE_EMPACADOR)).not.toContain('inventario.consultar');
      expect(await codigosEnBaseDe(tx, ROLE_EMPACADOR)).not.toContain('asignaciones.modificar');
    });
  });

  it('QC-161 R9 — tras sembrar sobre base vacia, el Administrador, el Operador y el Empacador no tienen ningun empresas.* en `role_permissions`', async () => {
    await inRolledBackTransaction(async (tx) => {
      await resetIdentityToEmptyState(tx);
      const repository = createInitialAccessRepository(tx);

      await seedInitialAccess({
        repository,
        passwordHasher: identity.passwordHasher,
        checkCredentialPolicy: identity.checkCredentialPolicy,
        credentials: fakeCredentialsProvider,
        maestroCredentials: fakeMaestroCredentialsProvider,
      });

      const deEmpresas = (codigos: readonly string[]): string[] =>
        codigos.filter((codigo) => codigo.startsWith('empresas.'));
      expect(await codigosEnBaseDe(tx, ROLE_ADMINISTRADOR)).toEqual(codigosSembradosDe(ROLE_ADMINISTRADOR));
      expect((await codigosEnBaseDe(tx, ROLE_ADMINISTRADOR)).length).toBeGreaterThan(0);
      for (const rol of [ROLE_ADMINISTRADOR, ROLE_OPERADOR, ROLE_EMPACADOR]) {
        expect(deEmpresas(await codigosEnBaseDe(tx, rol)), `empresas.* del rol «${rol}»`).toEqual([]);
      }
      // Anti-cegado: los dos codigos si existen en la base, en `permissions`.
      const empresasEnCatalogo = await tx.permission.findMany({
        where: { module: 'empresas' },
        orderBy: { code: 'asc' },
      });
      expect(empresasEnCatalogo.map((permiso) => permiso.code)).toEqual([
        'empresas.consultar',
        'empresas.modificar',
      ]);
    });
  });

  // Caso 11 (QC-65 R7, R10): el estado de cuenta del administrador inicial, contra Postgres
  // REAL. El unitario de `tests/unit/identity/seed/seed-initial-access.test.ts` afirma que el
  // dominio PASA el valor; este afirma que llega a la fila. Es el riesgo n.o 1 de
  // `design.md > 8`: si el seed heredara el `@default(pending)` de la columna, hoy no se
  // notaria nada y el sistema se cerraria sobre si mismo cuando QC-78 corte el login.
  it('el administrador que crea el seed queda en la base con el estado del seed y sin autor del cambio', async () => {
    await inRolledBackTransaction(async (tx) => {
      await resetIdentityToEmptyState(tx);

      const outcome = await seedInitialAccess({
        repository: createInitialAccessRepository(tx),
        passwordHasher: identity.passwordHasher,
        checkCredentialPolicy: identity.checkCredentialPolicy,
        credentials: fakeCredentialsProvider,
        maestroCredentials: fakeMaestroCredentialsProvider,
      });

      // Primero: el administrador SI se creo (un caso que no crea nada no prueba nada).
      expect(outcome.createdAdmin).toBe(true);
      const admin = await findLiveAdmin(tx);
      expect(admin).not.toBeNull();
      if (admin === null) throw new Error('inalcanzable');

      // R7: `active`, y el valor sale de la constante del dominio, no de un literal de aqui.
      expect(admin.accountStatus).toBe(SEED_ADMIN_ACCOUNT_STATUS);
      // Y NO es el estado con el que nace una cuenta cualquiera: si el seed dejara actuar al
      // `@default(pending)` de la columna, esta linea seria la unica que lo delataria.
      expect(admin.accountStatus).not.toBe(INITIAL_USER_ACCOUNT_STATUS);

      // R10: el autor queda NULL — lo creo el SISTEMA, no una persona. NULL aqui significa
      // eso y nunca «se perdio el dato».
      expect(admin.accountStatusChangedBy).toBeNull();

      // R8, R9: el instante se rellena solo y es el del alta.
      expect(admin.accountStatusChangedAt).toBeInstanceOf(Date);
      expect(admin.accountStatusChangedAt.getTime()).toBe(admin.createdAt.getTime());
    });
  });

  // Caso 12 (QC-86 R28, R26): la MIGRACION de las asignaciones sobre una instalacion QUE YA
  // EXISTE. El escenario no se toma prestado del estado con el que arranque la base local: se
  // CONSTRUYE dentro del `tx` —reset + una corrida del seed— para que «ya sembrada» signifique
  // exactamente el catalogo y las asignaciones que el dominio declara, con los dos codigos de
  // `asignaciones` ya presentes, que es el caso dificil de R28.
  //
  // El SQL se LEE del `migration.sql`, no se copia: si alguien le quita el
  // `ON CONFLICT ... DO NOTHING`, la primera pasada revienta aqui con `23505`; si cambia una
  // descripcion o convierte un `INSERT` en `UPSERT`, lo delata la comparacion fila a fila.
  it('aplicar el SQL de permisos de la migracion de asignaciones sobre la base ya sembrada no duplica, no reescribe y no borra nada, ni a la primera ni a la segunda', async () => {
    await inRolledBackTransaction(async (tx) => {
      await resetIdentityToEmptyState(tx);

      const bootstrap = await seedInitialAccess({
        repository: createInitialAccessRepository(tx),
        passwordHasher: identity.passwordHasher,
        checkCredentialPolicy: identity.checkCredentialPolicy,
        credentials: fakeCredentialsProvider,
        maestroCredentials: fakeMaestroCredentialsProvider,
      });
      // La instalacion de partida es la de verdad: el catalogo completo y todas sus asignaciones.
      expect(bootstrap.createdPermissions.slice().sort()).toEqual(CODIGOS_DEL_CATALOGO);
      expect(bootstrap.createdRolePermissions).toBe(TOTAL_DE_ASIGNACIONES_DEL_SEED);

      const antes = await fotoDePermisos(tx);
      expect(antes.permisos).toHaveLength(PERMISSIONS.length);
      expect(antes.asignaciones).toHaveLength(TOTAL_DE_ASIGNACIONES_DEL_SEED);
      // Y los dos codigos de la ficha YA estan: sin esto, «no duplica» seria trivial.
      expect(antes.permisos.map((permiso) => permiso.code)).toEqual(
        expect.arrayContaining(['asignaciones.consultar', 'asignaciones.modificar']),
      );

      // Las descripciones de partida, guardadas por codigo para poder afirmar que NADIE las
      // reescribe: son el dato que un `DO UPDATE` mal puesto pisaria sin mover ningun conteo.
      const descripcionesAntes = new Map(antes.permisos.map((permiso) => [permiso.code, permiso.description]));
      const marcasAntes = new Map(
        antes.permisos.map((permiso) => [
          permiso.code,
          { createdAt: permiso.createdAt.getTime(), updatedAt: permiso.updatedAt.getTime() },
        ]),
      );

      const sentencias = sentenciasDePermisosDeLaMigracion();
      // Las TRES del paso 5: el catalogo, el Administrador y el Operador (design.md > 4.2).
      expect(sentencias).toHaveLength(3);

      // Se aplica DOS VECES seguidas: R28 pide que la segunda deje exactamente el mismo estado.
      for (const pasada of [1, 2]) {
        for (const sentencia of sentencias) {
          await tx.$executeRawUnsafe(sentencia);
        }

        const despues = await fotoDePermisos(tx);

        // Ni una fila de mas (no duplica) ni una de menos (no borra).
        expect(despues.permisos, `conteo de permisos tras la pasada ${pasada}`).toHaveLength(
          PERMISSIONS.length,
        );
        expect(despues.asignaciones, `conteo de asignaciones tras la pasada ${pasada}`).toHaveLength(
          TOTAL_DE_ASIGNACIONES_DEL_SEED,
        );

        // Ni una fila distinta: comparacion campo a campo, `created_at`/`updated_at` incluidos.
        expect(despues.permisos, `filas de permisos tras la pasada ${pasada}`).toEqual(antes.permisos);
        expect(despues.asignaciones, `filas de asignaciones tras la pasada ${pasada}`).toEqual(
          antes.asignaciones,
        );

        // Dicho ademas por su nombre, para que el fallo señale el dato y no solo «la fila cambio».
        for (const permiso of despues.permisos) {
          expect(permiso.description, `descripcion de ${permiso.code} tras la pasada ${pasada}`).toBe(
            descripcionesAntes.get(permiso.code),
          );
          expect(
            { createdAt: permiso.createdAt.getTime(), updatedAt: permiso.updatedAt.getTime() },
            `marcas de tiempo de ${permiso.code} tras la pasada ${pasada}`,
          ).toEqual(marcasAntes.get(permiso.code));
        }

        // R28/R26: los roles siguen resueltos POR NOMBRE y con exactamente lo suyo.
        expect(await codigosEnBaseDe(tx, ROLE_ADMINISTRADOR)).toEqual(codigosSembradosDe(ROLE_ADMINISTRADOR));
        expect(await codigosEnBaseDe(tx, ROLE_OPERADOR)).toEqual([
          'asignaciones.consultar',
          'inventario.consultar',
        ]);
        expect(await codigosEnBaseDe(tx, ROLE_OPERADOR)).not.toContain('recetas.consultar');
      }
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
