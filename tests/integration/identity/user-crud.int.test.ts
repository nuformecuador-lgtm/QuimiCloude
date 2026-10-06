/**
 * QC-66 T16 — el CRUD de usuarios contra Postgres REAL (R13, R17, R27-R31, R33, R34, R35, R37,
 * R38, R49).
 *
 * QUE SE EJERCITA: el ADAPTADOR de produccion directamente —los CINCO metodos de
 * `lib/modules/identity/adapters/driven/persistence/user-admin-prisma.ts`—, no la fachada ni las
 * Server Actions. Es el mismo reparto que `tests/integration/proveedores/supplier-crud.int.test.ts`
 * con `supplier-prisma.ts`: lo que aqui se prueba es lo que solo la base puede contestar (los
 * indices unicos de `users`, el orden con desempate, lo que queda escrito en la FILA), y
 * la autorizacion, los esquemas y las dos guardas del administrador ya tienen sus tests propios
 * (`tests/unit/identity/usuarios/**`, `tests/integration/identity/last-administrator.int.test.ts`).
 *
 * AISLAMIENTO: CONSTRUCCION PROPIA + LIMPIEZA PROPIA, el mismo patron que
 * `last-administrator.int.test.ts` y la «estrategia 2» de `supplier-crud.int.test.ts`. **AQUI NO SE
 * PUEDE USAR el `$transaction` interactiva + senal de rollback de `identity-seed.int.test.ts`**: las
 * cinco funciones de este adaptador hablan con el cliente Prisma GLOBAL, no con un `tx` inyectado,
 * asi que una llamada hecha «dentro» del callback de `prisma.$transaction(...)` correria en OTRA
 * conexion del pool y confirmaria de inmediato —el aislamiento seria una ilusion y, peor, los dos
 * metodos que abren su propia transaccion se quedarian esperando un bloqueo que tiene la
 * transaccion del test—. Asi que cada caso fabrica su PROPIA empresa con identificador irrepetible
 * y sus PROPIOS usuarios (correo, nombre de usuario y documento aleatorios) y la borra en un
 * `finally`. Se usa este patron y SOLO este, en todos los casos del archivo.
 *
 * EL ORDEN DE LA LIMPIEZA NO ES LIBRE: `users_account_status_changed_by_fkey` es
 * `ON DELETE RESTRICT` (QC-65 R12), asi que antes de borrar las filas hay que VACIAR la referencia
 * al autor del cambio de estado; despues los usuarios, y solo entonces la empresa
 * (`users_company_id_fkey`, tambien RESTRICT). Mismo orden que razonan `dropScenario` en
 * `last-administrator.int.test.ts` y `resetIdentityToEmptyState` en `identity-seed.int.test.ts`.
 *
 * LA BASE LOCAL NO ESTA VACIA: trae la instalacion del seed (dos roles, la empresa inicial y su
 * administrador). Este archivo NO afirma sobre el estado global de ninguna tabla —los de integracion
 * corren en serie pero NO aislados entre archivos (`vitest.config.mts`, `fileParallelism: false`)—:
 * solo afirma sobre SUS propias filas, y los `total` se contrastan contra el conjunto que el propio
 * caso sembro. Los dos roles se REUTILIZAN, no se crean.
 *
 * SOBRE LOS MENSAJES DE ERROR: nunca se afirma sobre el TEXTO de un error de Postgres —en esta
 * maquina el servidor responde en espanol—. Se afirma sobre el RESULTADO DISCRIMINADO del puerto
 * (`'email' | 'username' | 'document'`, `'not_found'`), que es justamente lo que el adaptador
 * traduce desde el `P2002`/`23505`. El `meta.target` de los dos indices FUNCIONALES trae la
 * EXPRESION (`["company_id","lower(email)"]`; el de usuario es global,
 * `["lower(username)"]`) y el del documento sus columnas: lo traduce el adaptador por subcadena, y
 * este archivo solo comprueba el resultado.
 *
 * NINGUNA CREDENCIAL REAL: `FAKE_CREDENTIAL_HASH` es un marcador evidentemente ficticio; ninguna
 * operacion de este archivo lee ni verifica credenciales.
 *
 * SIN TESTS DE RLS: un test de RLS escrito con Prisma sale verde pase lo que pase, porque Prisma se
 * conecta como dueno de las tablas (`docs/architecture.md > Acceso a datos y autorizacion`). R7 lo
 * cierra `tests/guards/guard-rls-force.test.ts`.
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { identity } from '@/lib/composition';
import {
  ActionNotAllowedError,
  DOCUMENT_TYPE_CC,
  DuplicateUsernameError,
  normalizeCompanyName,
  UnauthorizedError,
} from '@/lib/modules/identity';
import {
  applyGuardedChange,
  create,
  findAliveInCompany,
  listAliveInCompany,
  updateAliveInCompany,
} from '@/lib/modules/identity/adapters/driven/persistence/user-admin-prisma';
import { PERMISSIONS } from '@/lib/modules/identity/domain/permissions';
import { clearedLockState } from '@/lib/modules/identity/domain/effective-account-status';
import {
  ROLE_ACONDICIONAMIENTO,
  ROLE_ADMINISTRADOR,
  ROLE_EMPACADOR,
  ROLE_MAESTRO,
  ROLE_OPERADOR,
} from '@/lib/modules/identity/domain/roles';
import { prisma } from '@/lib/shared/db/prisma';

import type { Actor } from '@/lib/modules/identity';
import type { UserAccountStatus } from '@/lib/modules/identity/domain/account-status';
import type { ListQuery } from '@/lib/modules/identity/domain/list-query';
import type { UserDetail, UserRow } from '@/lib/modules/identity/domain/user-view';
import type { NewUser, NewUserCredential } from '@/lib/modules/identity/ports/user-admin-repository';

// ---------------------------------------------------------------------------
// Escenario: empresas propias, usuarios propios, limpieza propia
// ---------------------------------------------------------------------------

/** Marcador de prueba, evidentemente ficticio: ninguna operacion de este archivo lee credenciales. */
/**
 * QC-79 T11: `create` ya no recibe el hash suelto sino la union discriminada de
 * `design.md > 6.1` (`NewUserCredential`). Estos casos son los de QC-66 y siguen probando la rama
 * **con** credencial, asi que el marcador viaja envuelto en `{ kind: 'hash' }`. La rama
 * `{ kind: 'none' }` -el centinela de R4- la prueba T20 en su propio archivo.
 */
const FAKE_CREDENTIAL_HASH = {
  kind: 'hash',
  value: '$2b$10$marcador.de.prueba.qc66.t16.no.es.un.hash.real',
} as const satisfies NewUserCredential;

let operadorRoleId = '';
let administradorRoleId = '';
let empacadorRoleId = '';
let maestroRoleId = '';

/** Las empresas que este archivo creo, para comprobar en `afterAll` que no quedo ninguna. */
const createdCompanyIds = new Set<string>();

async function createCompany(): Promise<string> {
  const name = `QC66 T16 ${randomUUID()}`;
  const company = await prisma.company.create({
    data: { name, nameNormalized: normalizeCompanyName(name) },
    select: { id: true },
  });
  createdCompanyIds.add(company.id);
  return company.id;
}

/** Borra la empresa y todos sus usuarios en el unico orden que respetan las FK (ver cabecera). */
async function dropCompany(companyId: string): Promise<void> {
  await prisma.user.updateMany({ where: { companyId }, data: { accountStatusChangedBy: null } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
  createdCompanyIds.delete(companyId);
}

/** Un caso con UNA empresa propia, que se borra siempre. */
async function withCompany(body: (companyId: string) => Promise<void>): Promise<void> {
  const companyId = await createCompany();
  try {
    await body(companyId);
  } finally {
    await dropCompany(companyId);
  }
}

/** Un caso con DOS empresas propias y distintas: es lo que hace comprobable R33 y el simetrico de R17. */
async function withTwoCompanies(
  body: (companyA: string, companyB: string) => Promise<void>,
): Promise<void> {
  const companyA = await createCompany();
  const companyB = await createCompany();
  try {
    await body(companyA, companyB);
  } finally {
    await dropCompany(companyB);
    await dropCompany(companyA);
  }
}

/**
 * Un Maestro propio, sin empresa, que se borra siempre. No se usa el del seed: el caso no depende de
 * que exista ni de su nombre.
 */
async function withMaestro(body: (maestroId: string, username: string) => Promise<void>): Promise<void> {
  const tag = randomUUID();
  const username = `qc161.maestro.${tag}`;
  const maestro = await prisma.user.create({
    data: {
      firstNames: 'QC161',
      lastNames: `Maestro${tag.slice(0, 8)}`,
      birthDate: new Date('1990-01-01T00:00:00.000Z'),
      email: `qc161.maestro.${tag}@example.test`,
      phone: '000000000',
      documentTypeCode: DOCUMENT_TYPE_CC,
      documentNumber: documentNumberFrom(tag),
      username,
      passwordHash: FAKE_CREDENTIAL_HASH.value,
      roleId: maestroRoleId,
      companyId: null,
      accountStatus: 'active',
    },
    select: { id: true },
  });
  try {
    await body(maestro.id, username);
  } finally {
    await prisma.user.delete({ where: { id: maestro.id } });
  }
}

/** Un identificador de documento irrepetible y corto, derivado de un uuid. */
function documentNumberFrom(tag: string): string {
  return tag.replaceAll('-', '').slice(0, 20);
}

/**
 * Los nueve campos de `NewUser` con valores irrepetibles, para el alta y la edicion. `roleId` cae en
 * el `Operador` a proposito: asi ninguna operacion de este archivo roza la guarda del ultimo
 * administrador (R22), que tiene su propio archivo de integracion.
 */
function newUserData(overrides: Partial<NewUser> = {}): NewUser {
  const tag = randomUUID();
  return {
    firstNames: 'QC66T16',
    lastNames: `Apellido${tag.slice(0, 8)}`,
    birthDate: new Date('1990-01-01T00:00:00.000Z'),
    email: `qc66.t16.${tag}@example.test`,
    phone: '000000000',
    documentTypeCode: DOCUMENT_TYPE_CC,
    documentNumber: documentNumberFrom(tag),
    username: `qc66.t16.${tag}`,
    roleId: operadorRoleId,
    ...overrides,
  };
}

/** Alta por el ADAPTADOR, que es lo que se esta probando. Falla el test si el alta no crea. */
async function createUser(companyId: string, data: NewUser): Promise<string> {
  const result = await create(companyId, data, FAKE_CREDENTIAL_HASH, 'pending', new Date());
  if (typeof result === 'string') {
    throw new Error(`el alta no debia fallar, y devolvio \`${result}\``);
  }
  return result.id;
}

/**
 * Fila sembrada DIRECTAMENTE con Prisma, para los casos de consulta que necesitan nombres o estados
 * concretos: el alta del adaptador nace siempre `pending` (R13) y no elige los nombres. Sembrar el
 * escenario a mano es lo que hace que los casos de R27-R30 no dependan de ningun dato ajeno.
 */
async function seedUser(
  companyId: string,
  fields: Partial<{
    firstNames: string;
    lastNames: string;
    email: string;
    username: string;
    accountStatus: UserAccountStatus;
    roleId: string;
  }> = {},
): Promise<string> {
  const tag = randomUUID();
  const created = await prisma.user.create({
    data: {
      firstNames: fields.firstNames ?? 'QC66T16',
      lastNames: fields.lastNames ?? `Apellido${tag.slice(0, 8)}`,
      birthDate: new Date('1990-01-01T00:00:00.000Z'),
      email: fields.email ?? `qc66.t16.${tag}@example.test`,
      phone: '000000000',
      documentTypeCode: DOCUMENT_TYPE_CC,
      documentNumber: documentNumberFrom(tag),
      username: fields.username ?? `qc66.t16.${tag}`,
      passwordHash: FAKE_CREDENTIAL_HASH.value,
      roleId: fields.roleId ?? operadorRoleId,
      companyId,
      accountStatus: fields.accountStatus ?? 'pending',
    },
    select: { id: true },
  });
  return created.id;
}

// ---------------------------------------------------------------------------
// La FILA CRUDA: lo que de verdad quedo escrito en `users`
// ---------------------------------------------------------------------------

/**
 * Las columnas de `users` que este archivo afirma, en `snake_case` y leidas con SQL crudo. **R49 se
 * afirma sobre la COLUMNA `account_status_changed_by`, no sobre el tipo de salida**: `UserDetail` no
 * la expone a proposito (`domain/user-view.ts`), asi que un test que mirara la ficha saldria verde
 * aunque el alta escribiera ahi el identificador del actor.
 */
type RawUserRow = {
  readonly company_id: string;
  readonly role_id: string;
  readonly account_status: string;
  readonly must_change_credential: boolean;
  readonly account_status_changed_at: Date;
  readonly account_status_changed_by: string | null;
  readonly deleted_at: Date | null;
  readonly first_names: string;
  readonly last_names: string;
  readonly birth_date: Date;
  readonly email: string;
  readonly phone: string;
  readonly document_type_code: string;
  readonly document_number: string;
  readonly username: string;
  readonly password_hash: string;
  readonly failed_login_attempts: number;
  readonly lock_level: number;
  readonly locked_until: Date | null;
  readonly created_at: Date;
  readonly updated_at: Date;
};

async function rawUser(id: string): Promise<RawUserRow> {
  const rows = await prisma.$queryRaw<ReadonlyArray<RawUserRow>>(Prisma.sql`
    SELECT "company_id"::text AS "company_id", "role_id"::text AS "role_id",
           "account_status"::text AS "account_status",
           "must_change_credential", "account_status_changed_at",
           "account_status_changed_by"::text AS "account_status_changed_by", "deleted_at",
           "first_names", "last_names", "birth_date", "email", "phone",
           "document_type_code", "document_number", "username", "password_hash",
           "failed_login_attempts", "lock_level", "locked_until",
           "created_at", "updated_at"
    FROM "users" WHERE "id" = ${id}::uuid
  `);
  const row = rows[0];
  if (row === undefined) throw new Error(`no existe ninguna fila de \`users\` con id ${id}`);
  return row;
}

/** La fila cruda SIN las dos marcas que el borrado logico si cambia (R37). */
function withoutDeletionMarks(row: RawUserRow): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...row };
  delete copy.deleted_at;
  delete copy.updated_at;
  return copy;
}

/** Cuantas filas —vivas o borradas— tiene la empresa: es como se comprueba «no creo ninguna fila». */
async function countRowsOf(companyId: string): Promise<number> {
  return prisma.user.count({ where: { companyId } });
}

// ---------------------------------------------------------------------------
// La consulta
// ---------------------------------------------------------------------------

/** Una `ListQuery` completa con lo minimo: el contrato generico de QC-57 (R36). */
function listQuery(overrides: Partial<ListQuery> = {}): ListQuery {
  return { page: 1, sort: null, filters: {}, search: '', ...overrides };
}

async function listIds(
  companyId: string,
  excludeUserId: string,
  overrides: Partial<ListQuery> = {},
): Promise<readonly string[]> {
  const page = await listAliveInCompany(companyId, excludeUserId, listQuery(overrides));
  return page.items.map((item) => item.id);
}

function firstRowOf(items: readonly UserRow[]): UserRow {
  const row = items[0];
  if (row === undefined) throw new Error('el listado no devolvio ninguna fila');
  return row;
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

/** Los codigos de permiso que la migracion de T4 tiene que haber dejado en el catalogo. */
const USER_PERMISSION_CODES = PERMISSIONS.filter((entry) => entry.module === 'usuarios').map(
  (entry) => entry.code,
);

beforeAll(async () => {
  // La migracion de datos del catalogo (T4). Si falta, el mensaje dice QUE hacer.
  const presentes = await prisma.permission.findMany({
    where: { code: { in: [...USER_PERMISSION_CODES] } },
    select: { code: true },
  });
  if (presentes.length !== USER_PERMISSION_CODES.length) {
    const faltan = USER_PERMISSION_CODES.filter(
      (code) => !presentes.some((fila) => fila.code === code),
    );
    throw new Error(
      `falta la migracion del catalogo de permisos de QC-66 (T4): no estan en \`permissions\` ` +
        `${faltan.join(', ')}. Corre \`pnpm run db:migrate\` contra la base de esta feature antes ` +
        `de correr este archivo.`,
    );
  }

  const roles = await prisma.role.findMany({
    where: { name: { in: [ROLE_ADMINISTRADOR, ROLE_OPERADOR, ROLE_EMPACADOR, ROLE_MAESTRO] } },
    select: { id: true, name: true },
  });
  const administrador = roles.find((role) => role.name === ROLE_ADMINISTRADOR);
  const operador = roles.find((role) => role.name === ROLE_OPERADOR);
  const empacador = roles.find((role) => role.name === ROLE_EMPACADOR);
  const maestro = roles.find((role) => role.name === ROLE_MAESTRO);
  if (
    administrador === undefined ||
    operador === undefined ||
    empacador === undefined ||
    maestro === undefined
  ) {
    throw new Error(
      `faltan los roles base (${ROLE_ADMINISTRADOR} / ${ROLE_OPERADOR} / ${ROLE_EMPACADOR} / ` +
        `${ROLE_MAESTRO}) en la base: corre \`pnpm run db:migrate\` y \`pnpm run db:seed\` antes ` +
        'de correr este archivo.',
    );
  }
  administradorRoleId = administrador.id;
  operadorRoleId = operador.id;
  empacadorRoleId = empacador.id;
  maestroRoleId = maestro.id;
});

afterAll(async () => {
  // Ninguna fila propia sobrevive: si algun `finally` no hubiera corrido, esto lo dice.
  expect([...createdCompanyIds]).toEqual([]);
});

// ---------------------------------------------------------------------------
// R13 + R49 — el alta, leida de la fila cruda
// ---------------------------------------------------------------------------

describe('R13 + R49 — el alta persiste la empresa del argumento, el rol, `pending`, la marca de credencial y NINGUN autor del estado', () => {
  it('R13 — la fila nace con la empresa del argumento, el rol pedido, `pending`, `must_change_credential` en verdadero y el instante del cambio de estado', async () => {
    await withCompany(async (companyId) => {
      const now = new Date('2026-09-10T12:34:56.000Z');
      const data = newUserData();

      const result = await create(companyId, data, FAKE_CREDENTIAL_HASH, 'pending', now);

      expect(result).toEqual({ id: expect.any(String) });
      const id = typeof result === 'string' ? '' : result.id;
      const row = await rawUser(id);

      expect(row.company_id).toBe(companyId);
      expect(row.role_id).toBe(data.roleId);
      expect(row.account_status).toBe('pending');
      expect(row.must_change_credential).toBe(true);
      expect(row.account_status_changed_at.toISOString()).toBe(now.toISOString());
      expect(row.deleted_at).toBeNull();
    });
  });

  it('R49 — `account_status_changed_by` queda NULO en la fila: el `pending` inicial no se atribuye a ninguna persona', async () => {
    await withTwoCompanies(async (companyA) => {
      // Hay OTRO usuario vivo en la empresa —el «actor» que daria el alta—, asi que si el adaptador
      // copiara un identificador ahi por reflejo, esta fila lo tendria.
      const actorId = await seedUser(companyA, { accountStatus: 'active' });
      const id = await createUser(companyA, newUserData());

      const row = await rawUser(id);
      expect(row.account_status_changed_by).toBeNull();
      expect(row.account_status_changed_by).not.toBe(actorId);
    });
  });

  it('R49 (contraste) — al MOVER el estado si se escribe el autor, asi que el NULO del alta no es que la columna no se escriba nunca', async () => {
    await withCompany(async (companyId) => {
      const actorId = await seedUser(companyId, { accountStatus: 'active' });
      const id = await createUser(companyId, newUserData());
      expect((await rawUser(id)).account_status_changed_by).toBeNull();

      const outcome = await applyGuardedChange({
        kind: 'account_status',
        companyId,
        id,
        adminRoleName: ROLE_ADMINISTRADOR,
        now: new Date(),
        accountStatus: 'active',
        changedBy: actorId,
        lockState: clearedLockState(),
      });

      expect(outcome).toBe('ok');
      expect((await rawUser(id)).account_status_changed_by).toBe(actorId);
    });
  });
});

// ---------------------------------------------------------------------------
// R17 — los tres duplicados, POR EMPRESA
// ---------------------------------------------------------------------------

describe('R17 — correo y pareja tipo+numero de documento son unicos DENTRO de la empresa; el nombre de usuario, en todo el sistema (QC-161)', () => {
  it('el correo repetido devuelve `email` y NO crea ninguna fila', async () => {
    await withCompany(async (companyId) => {
      const primero = newUserData();
      await createUser(companyId, primero);

      const outcome = await create(
        companyId,
        newUserData({ email: primero.email }),
        FAKE_CREDENTIAL_HASH,
        'pending',
        new Date(),
      );

      expect(outcome).toBe('email');
      expect(await countRowsOf(companyId)).toBe(1);
    });
  });

  it('el correo repetido CAMBIANDO MAYUSCULAS tambien devuelve `email`: el indice compara `lower(email)`', async () => {
    await withCompany(async (companyId) => {
      const primero = newUserData({ email: `qc66.t16.${randomUUID()}@example.test` });
      await createUser(companyId, primero);

      const outcome = await create(
        companyId,
        newUserData({ email: primero.email.toUpperCase() }),
        FAKE_CREDENTIAL_HASH,
        'pending',
        new Date(),
      );

      expect(outcome).toBe('email');
      expect(await countRowsOf(companyId)).toBe(1);
    });
  });

  it('el nombre de usuario repetido devuelve `username` y NO crea ninguna fila', async () => {
    await withCompany(async (companyId) => {
      const primero = newUserData();
      await createUser(companyId, primero);

      const outcome = await create(
        companyId,
        newUserData({ username: primero.username }),
        FAKE_CREDENTIAL_HASH,
        'pending',
        new Date(),
      );

      expect(outcome).toBe('username');
      expect(await countRowsOf(companyId)).toBe(1);
    });
  });

  it('el nombre de usuario repetido CAMBIANDO MAYUSCULAS tambien devuelve `username`: el indice compara `lower(username)`', async () => {
    await withCompany(async (companyId) => {
      const primero = newUserData();
      await createUser(companyId, primero);

      const outcome = await create(
        companyId,
        newUserData({ username: primero.username.toUpperCase() }),
        FAKE_CREDENTIAL_HASH,
        'pending',
        new Date(),
      );

      expect(outcome).toBe('username');
      expect(await countRowsOf(companyId)).toBe(1);
    });
  });

  it('la pareja tipo+numero de documento repetida devuelve `document` y NO crea ninguna fila', async () => {
    await withCompany(async (companyId) => {
      const primero = newUserData();
      await createUser(companyId, primero);

      const outcome = await create(
        companyId,
        newUserData({
          documentTypeCode: primero.documentTypeCode,
          documentNumber: primero.documentNumber,
        }),
        FAKE_CREDENTIAL_HASH,
        'pending',
        new Date(),
      );

      expect(outcome).toBe('document');
      expect(await countRowsOf(companyId)).toBe(1);
    });
  });

  it('QC-161 R36 — el MISMO nombre de usuario en OTRA empresa devuelve `username` y NO crea ninguna fila, tambien cambiando mayusculas', async () => {
    await withTwoCompanies(async (companyA, companyB) => {
      const data = newUserData();
      await createUser(companyA, data);

      for (const username of [data.username, data.username.toUpperCase()]) {
        const outcome = await create(
          companyB,
          newUserData({ username }),
          FAKE_CREDENTIAL_HASH,
          'pending',
          new Date(),
        );
        expect(outcome, username).toBe('username');
      }

      expect(await countRowsOf(companyA)).toBe(1);
      expect(await countRowsOf(companyB)).toBe(0);
    });
  });

  it('QC-161 R37 — los MISMOS correo y documento en OTRA empresa SI se crean, tambien cambiando mayusculas: esos dos siguen siendo por empresa', async () => {
    await withTwoCompanies(async (companyA, companyB) => {
      const data = newUserData();
      const enA = await createUser(companyA, data);

      const enB = await createUser(
        companyB,
        newUserData({
          email: data.email.toUpperCase(),
          documentTypeCode: data.documentTypeCode,
          documentNumber: data.documentNumber,
        }),
      );

      expect(enB).not.toBe(enA);
      expect((await rawUser(enA)).company_id).toBe(companyA);
      const filaB = await rawUser(enB);
      expect(filaB.company_id).toBe(companyB);
      expect(filaB.email).toBe(data.email.toUpperCase());
      expect(filaB.document_number).toBe(data.documentNumber);
      expect(await countRowsOf(companyB)).toBe(1);
    });
  });

  it('QC-161 R36 — un usuario dado de baja NO ocupa su nombre de usuario en otra empresa', async () => {
    await withTwoCompanies(async (companyA, companyB) => {
      const data = newUserData();
      const enA = await createUser(companyA, data);
      expect(
        await applyGuardedChange({
          kind: 'delete',
          companyId: companyA,
          id: enA,
          adminRoleName: ROLE_ADMINISTRADOR,
          now: new Date(),
        }),
      ).toBe('ok');

      const enB = await createUser(companyB, newUserData({ username: data.username }));

      expect((await rawUser(enB)).username).toBe(data.username);
    });
  });
});

// ---------------------------------------------------------------------------
// El duplicado capturado DENTRO de la transaccion de `updateAliveInCompany`
// ---------------------------------------------------------------------------

describe('R17 en la EDICION — el duplicado capturado dentro del `$transaction` de `updateAliveInCompany` no escapa como error y deja la fila intacta', () => {
  it.each<['email' | 'username' | 'document', (otro: NewUser) => Partial<NewUser>]>([
    ['email', (otro) => ({ email: otro.email })],
    ['username', (otro) => ({ username: otro.username })],
    [
      'document',
      (otro) => ({ documentTypeCode: otro.documentTypeCode, documentNumber: otro.documentNumber }),
    ],
  ])(
    'pedir el %s de otro usuario vivo de la misma empresa devuelve la clave duplicada, NO lanza, y la fila del objetivo no cambia',
    async (esperado, choque) => {
      await withCompany(async (companyId) => {
        const datosDestino = newUserData();
        const destino = await createUser(companyId, datosDestino);
        const datosVecino = newUserData();
        await createUser(companyId, datosVecino);
        const antes = await rawUser(destino);

        // El `UPDATE` fallido aborta la transaccion; devolver el resultado discriminado provoca un
        // `COMMIT` que Postgres convierte en `ROLLBACK` silencioso. Que esto no lance es el
        // requisito: si lanzara, el dominio veria un error de Prisma (R41) en vez de un duplicado.
        const outcome = await updateAliveInCompany(
          companyId,
          destino,
          { ...datosDestino, ...choque(datosVecino) },
          new Date(),
        );

        expect(outcome).toBe(esperado);
        // La fila queda ENTERA como estaba, `updated_at` incluido: no se escribio nada.
        expect(await rawUser(destino)).toEqual(antes);
        // Y la conexion sigue sirviendo despues del rollback silencioso.
        expect(await countRowsOf(companyId)).toBe(2);
      });
    },
  );

  it('la edicion SIN choque si escribe: el caso de arriba no esta verde porque la edicion no haga nada', async () => {
    await withCompany(async (companyId) => {
      const datos = newUserData();
      const id = await createUser(companyId, datos);

      const outcome = await updateAliveInCompany(
        companyId,
        id,
        { ...datos, firstNames: 'Editado', lastNames: 'Tambien' },
        new Date(),
      );

      expect(outcome).toBe('ok');
      const row = await rawUser(id);
      expect(row.first_names).toBe('Editado');
      expect(row.last_names).toBe('Tambien');
    });
  });
});

// ---------------------------------------------------------------------------
// R27 — paginacion: defecto 10, tope 25
// ---------------------------------------------------------------------------

describe('R27 — el tamano de pagina efectivo: defecto 10, tope 25, y el `total` describe el conjunto ya filtrado', () => {
  it('sin tamano de pagina devuelve 10 elementos y el `pageSize` efectivo es 10', async () => {
    await withCompany(async (companyId) => {
      const actorId = await seedUser(companyId);
      for (let index = 0; index < 12; index += 1) await seedUser(companyId);

      const page = await listAliveInCompany(companyId, actorId, listQuery());

      expect(page.pageSize).toBe(10);
      expect(page.items).toHaveLength(10);
      expect(page.total).toBe(12);
      expect(page.totalPages).toBe(2);
      expect(page.page).toBe(1);
    });
  });

  it('pedir 100 devuelve `pageSize` 25 y NO un error: el tope se ACOTA', async () => {
    await withCompany(async (companyId) => {
      const actorId = await seedUser(companyId);
      for (let index = 0; index < 12; index += 1) await seedUser(companyId);

      const page = await listAliveInCompany(companyId, actorId, listQuery({ pageSize: 100 }));

      expect(page.pageSize).toBe(25);
      expect(page.items).toHaveLength(12);
      expect(page.total).toBe(12);
      expect(page.totalPages).toBe(1);
    });
  });

  it('el `total` cuenta el conjunto YA filtrado, no la empresa entera', async () => {
    await withCompany(async (companyId) => {
      const actorId = await seedUser(companyId);
      await seedUser(companyId, { accountStatus: 'active' });
      await seedUser(companyId, { accountStatus: 'active' });
      await seedUser(companyId, { accountStatus: 'pending' });

      const page = await listAliveInCompany(
        companyId,
        actorId,
        listQuery({ filters: { accountStatus: { kind: 'select', values: ['active'] } } }),
      );

      expect(page.total).toBe(2);
      expect(page.items).toHaveLength(2);
    });
  });
});

// ---------------------------------------------------------------------------
// R28 — busqueda
// ---------------------------------------------------------------------------

describe('R28 — la busqueda cubre nombres, apellidos, correo y nombre de usuario, insensible a mayusculas', () => {
  it('encuentra por nombres, por apellidos, por correo y por nombre de usuario; y sin texto devuelve todo el ambito', async () => {
    await withCompany(async (companyId) => {
      const tag = randomUUID();
      const actorId = await seedUser(companyId);
      const porNombres = await seedUser(companyId, { firstNames: `Zoraida${tag}` });
      const porApellidos = await seedUser(companyId, { lastNames: `Quintanilla${tag}` });
      const porCorreo = await seedUser(companyId, { email: `${tag}.correo@example.test` });
      const porUsuario = await seedUser(companyId, { username: `${tag}.usuario` });
      const ajeno = await seedUser(companyId);

      expect(await listIds(companyId, actorId, { search: `Zoraida${tag}` })).toEqual([porNombres]);
      expect(await listIds(companyId, actorId, { search: `Quintanilla${tag}` })).toEqual([
        porApellidos,
      ]);
      expect(await listIds(companyId, actorId, { search: `${tag}.correo` })).toEqual([porCorreo]);
      expect(await listIds(companyId, actorId, { search: `${tag}.usuario` })).toEqual([porUsuario]);

      const sinTexto = await listIds(companyId, actorId, { pageSize: 25 });
      expect([...sinTexto].sort()).toEqual(
        [porNombres, porApellidos, porCorreo, porUsuario, ajeno].sort(),
      );
    });
  });

  it('es INSENSIBLE a mayusculas en las cuatro columnas', async () => {
    await withCompany(async (companyId) => {
      const tag = randomUUID();
      const actorId = await seedUser(companyId);
      const porNombres = await seedUser(companyId, { firstNames: `Zoraida${tag}` });
      const porApellidos = await seedUser(companyId, { lastNames: `Quintanilla${tag}` });
      const porCorreo = await seedUser(companyId, { email: `${tag}.correo@example.test` });
      const porUsuario = await seedUser(companyId, { username: `${tag}.usuario` });

      expect(await listIds(companyId, actorId, { search: `zoraida${tag}`.toUpperCase() })).toEqual([
        porNombres,
      ]);
      expect(
        await listIds(companyId, actorId, { search: `quintanilla${tag}`.toUpperCase() }),
      ).toEqual([porApellidos]);
      expect(await listIds(companyId, actorId, { search: `${tag}.CORREO` })).toEqual([porCorreo]);
      expect(await listIds(companyId, actorId, { search: `${tag}.USUARIO` })).toEqual([porUsuario]);
    });
  });
});

// ---------------------------------------------------------------------------
// R29 — filtro por estado de cuenta, multivalor y opcional
// ---------------------------------------------------------------------------

describe('R29 — el filtro por estado de cuenta es multivalor y OPCIONAL', () => {
  it('cuando se indica, devuelve solo los estados pedidos; cuando NO se indica, salen los cuatro', async () => {
    await withCompany(async (companyId) => {
      const actorId = await seedUser(companyId);
      const pendiente = await seedUser(companyId, { accountStatus: 'pending' });
      const activo = await seedUser(companyId, { accountStatus: 'active' });
      const inactivo = await seedUser(companyId, { accountStatus: 'inactive' });
      const bloqueado = await seedUser(companyId, { accountStatus: 'blocked' });

      const unoSolo = await listIds(companyId, actorId, {
        filters: { accountStatus: { kind: 'select', values: ['blocked'] } },
      });
      expect(unoSolo).toEqual([bloqueado]);

      const dos = await listIds(companyId, actorId, {
        pageSize: 25,
        filters: { accountStatus: { kind: 'select', values: ['active', 'inactive'] } },
      });
      expect([...dos].sort()).toEqual([activo, inactivo].sort());

      const sinFiltro = await listIds(companyId, actorId, { pageSize: 25 });
      expect([...sinFiltro].sort()).toEqual([pendiente, activo, inactivo, bloqueado].sort());
    });
  });
});

// ---------------------------------------------------------------------------
// R30 — orden estable: el caso de los dos homonimos, recorriendo TODAS las paginas
// ---------------------------------------------------------------------------

describe('R30 — orden por apellidos y nombres con desempate por identificador: ningun usuario sale en dos paginas ni se omite de todas', () => {
  it('con DOS homonimos en la misma empresa, la union de todas las paginas es EXACTAMENTE el conjunto esperado y sin repetidos', async () => {
    await withCompany(async (companyId) => {
      const actorId = await seedUser(companyId);
      // Los dos homonimos: MISMOS nombres y MISMOS apellidos. Nada lo prohibe, y sin el desempate
      // por `id` el orden de las empatadas no esta definido: Postgres puede devolverlas distinto en
      // cada consulta y una fila saldria en dos paginas o en ninguna.
      const homonimoUno = await seedUser(companyId, {
        firstNames: 'Homonimo',
        lastNames: 'Mismoapellido',
      });
      const homonimoDos = await seedUser(companyId, {
        firstNames: 'Homonimo',
        lastNames: 'Mismoapellido',
      });
      const antes = await seedUser(companyId, { firstNames: 'Ana', lastNames: 'Alvarez' });
      const despues = await seedUser(companyId, { firstNames: 'Zoe', lastNames: 'Zapata' });
      const tambienDespues = await seedUser(companyId, { firstNames: 'Zuleima', lastNames: 'Zapata' });
      const esperados = [homonimoUno, homonimoDos, antes, despues, tambienDespues];

      const primera = await listAliveInCompany(companyId, actorId, listQuery({ pageSize: 2 }));
      expect(primera.total).toBe(esperados.length);
      expect(primera.totalPages).toBe(3);

      // Se recorren TODAS las paginas: sin el recorrido completo el caso no prueba nada.
      const vistos: string[] = [];
      for (let page = 1; page <= primera.totalPages; page += 1) {
        const actual = await listAliveInCompany(companyId, actorId, listQuery({ page, pageSize: 2 }));
        vistos.push(...actual.items.map((item) => item.id));
      }

      // Ni repetidos (ninguno en dos paginas) ni omitidos (ninguno fuera de todas).
      expect(vistos).toHaveLength(esperados.length);
      expect(new Set(vistos).size).toBe(esperados.length);
      expect([...vistos].sort()).toEqual([...esperados].sort());

      // Y el orden pedido: `Alvarez` < `Mismoapellido` < `Zapata`, con los dos homonimos
      // consecutivos y desempatados por identificador ascendente.
      const [menor, mayor] = [homonimoUno, homonimoDos].sort();
      expect(vistos).toEqual([antes, menor, mayor, despues, tambienDespues]);
    });
  });

  it('el recorrido es igual de completo cuando el orden lo pide el cliente: `id ASC` se conserva como ultimo desempate', async () => {
    await withCompany(async (companyId) => {
      const actorId = await seedUser(companyId);
      const unos = [
        await seedUser(companyId, { firstNames: 'Homonimo', lastNames: 'Mismoapellido' }),
        await seedUser(companyId, { firstNames: 'Homonimo', lastNames: 'Mismoapellido' }),
        await seedUser(companyId, { firstNames: 'Homonimo', lastNames: 'Mismoapellido' }),
      ];

      const vistos: string[] = [];
      for (let page = 1; page <= 3; page += 1) {
        const actual = await listAliveInCompany(
          companyId,
          actorId,
          listQuery({ page, pageSize: 1, sort: { columnId: 'lastNames', direction: 'desc' } }),
        );
        vistos.push(...actual.items.map((item) => item.id));
      }

      expect(new Set(vistos).size).toBe(3);
      expect(vistos).toEqual([...unos].sort());
    });
  });
});

// ---------------------------------------------------------------------------
// R31 / R32 — las claves EXACTAS de la fila y de la ficha
// ---------------------------------------------------------------------------

describe('R31 — la fila del listado trae las SEIS claves y la ficha las QUINCE, exactamente esas', () => {
  it('la fila del listado tiene EXACTAMENTE las seis claves de `UserRow`', async () => {
    await withCompany(async (companyId) => {
      const actorId = await seedUser(companyId);
      const data = newUserData({ firstNames: 'Ana Maria', lastNames: 'Perez Gomez' });
      const id = await createUser(companyId, data);

      const page = await listAliveInCompany(companyId, actorId, listQuery());
      const row = firstRowOf(page.items);

      expect(Object.keys(row).sort()).toEqual(
        ['accountStatus', 'displayName', 'email', 'id', 'roleName', 'username'].sort(),
      );
      expect(row).toEqual({
        id,
        displayName: 'Ana Perez',
        username: data.username,
        email: data.email,
        roleName: ROLE_OPERADOR,
        accountStatus: 'pending',
      });
      // Y lo que NO esta, uno a uno, porque es el requisito y no un olvido.
      for (const prohibida of [
        'passwordHash',
        'mustChangeCredential',
        'failedLoginAttempts',
        'lockLevel',
        'lockedUntil',
        'companyId',
        'deletedAt',
        'accountStatusChangedBy',
      ]) {
        expect(Object.keys(row)).not.toContain(prohibida);
      }
    });
  });

  it('la ficha por identificador tiene EXACTAMENTE las quince claves de `UserDetail`', async () => {
    await withCompany(async (companyId) => {
      const data = newUserData();
      const id = await createUser(companyId, data);

      const detail = await findAliveInCompany(companyId, id);

      expect(detail).not.toBeNull();
      const ficha = detail as UserDetail;
      expect(Object.keys(ficha).sort()).toEqual(
        [
          'accountStatus',
          'accountStatusChangedAt',
          'birthDate',
          'createdAt',
          'documentNumber',
          'documentTypeCode',
          'email',
          'firstNames',
          'id',
          'lastNames',
          'phone',
          'roleId',
          'roleName',
          'updatedAt',
          'username',
        ].sort(),
      );
      expect(Object.keys(ficha)).toHaveLength(15);
      expect(ficha.roleId).toBe(operadorRoleId);
      expect(ficha.roleName).toBe(ROLE_OPERADOR);
      for (const prohibida of [
        'passwordHash',
        'mustChangeCredential',
        'failedLoginAttempts',
        'lockLevel',
        'lockedUntil',
        'companyId',
        'deletedAt',
        'accountStatusChangedBy',
        'displayName',
      ]) {
        expect(Object.keys(ficha)).not.toContain(prohibida);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// R33 — aislamiento entre empresas
// ---------------------------------------------------------------------------

describe('R33 — todo esta acotado a la empresa: un identificador ajeno responde «no encontrado» y no se modifica ninguna fila', () => {
  it('la ficha de un identificador de OTRA empresa es `null`', async () => {
    await withTwoCompanies(async (companyA, companyB) => {
      const enB = await createUser(companyB, newUserData());

      expect(await findAliveInCompany(companyA, enB)).toBeNull();
      // Y desde su propia empresa si responde: el `null` de arriba es por el ambito, no porque la
      // fila no exista.
      expect(await findAliveInCompany(companyB, enB)).not.toBeNull();
    });
  });

  it('el listado de una empresa NO ve a los usuarios de la otra', async () => {
    await withTwoCompanies(async (companyA, companyB) => {
      const actorA = await seedUser(companyA);
      const enA = await seedUser(companyA);
      const enB = await seedUser(companyB);

      const idsDeA = await listIds(companyA, actorA, { pageSize: 25 });
      expect(idsDeA).toEqual([enA]);
      expect(idsDeA).not.toContain(enB);
    });
  });

  it('editar un identificador ajeno devuelve `not_found` y NO modifica la fila', async () => {
    await withTwoCompanies(async (companyA, companyB) => {
      const datos = newUserData();
      const enB = await createUser(companyB, datos);
      const antes = await rawUser(enB);

      const outcome = await updateAliveInCompany(
        companyA,
        enB,
        { ...datos, firstNames: 'Intruso' },
        new Date(),
      );

      expect(outcome).toBe('not_found');
      expect(await rawUser(enB)).toEqual(antes);
    });
  });

  it('borrar un identificador ajeno devuelve `not_found` y NO modifica la fila', async () => {
    await withTwoCompanies(async (companyA, companyB) => {
      const enB = await createUser(companyB, newUserData());
      const antes = await rawUser(enB);

      const outcome = await applyGuardedChange({
        kind: 'delete',
        companyId: companyA,
        id: enB,
        adminRoleName: ROLE_ADMINISTRADOR,
        now: new Date(),
      });

      expect(outcome).toBe('not_found');
      expect(await rawUser(enB)).toEqual(antes);
    });
  });

  it('mover el estado de un identificador ajeno devuelve `not_found` y NO modifica la fila', async () => {
    await withTwoCompanies(async (companyA, companyB) => {
      const actorA = await seedUser(companyA, { accountStatus: 'active' });
      const enB = await createUser(companyB, newUserData());
      const antes = await rawUser(enB);

      const outcome = await applyGuardedChange({
        kind: 'account_status',
        companyId: companyA,
        id: enB,
        adminRoleName: ROLE_ADMINISTRADOR,
        now: new Date(),
        accountStatus: 'blocked',
        changedBy: actorA,
        lockState: null,
      });

      expect(outcome).toBe('not_found');
      expect(await rawUser(enB)).toEqual(antes);
    });
  });
});

// ---------------------------------------------------------------------------
// R34 + R37 — el borrado logico
// ---------------------------------------------------------------------------

describe('R34 + R37 — el borrado es LOGICO: la fila se conserva entera y las operaciones tratan al usuario como inexistente', () => {
  it('R37 — borrar conserva la fila COMPLETA y solo marca `deleted_at` (leido de la fila cruda)', async () => {
    await withCompany(async (companyId) => {
      const id = await createUser(companyId, newUserData());
      const antes = await rawUser(id);
      const now = new Date('2026-09-10T15:00:00.000Z');

      const outcome = await applyGuardedChange({
        kind: 'delete',
        companyId,
        id,
        adminRoleName: ROLE_ADMINISTRADOR,
        now,
      });

      expect(outcome).toBe('ok');
      const despues = await rawUser(id);
      // La fila SIGUE AHI: ningun `DELETE`.
      expect(await countRowsOf(companyId)).toBe(1);
      expect(despues.deleted_at?.toISOString()).toBe(now.toISOString());
      // Y todo lo demas, campo por campo, es lo que era.
      expect(withoutDeletionMarks(despues)).toEqual(withoutDeletionMarks(antes));
    });
  });

  it('R34 — un usuario borrado no sale en el listado y su ficha es `null`', async () => {
    await withCompany(async (companyId) => {
      const actorId = await seedUser(companyId);
      const vivo = await createUser(companyId, newUserData());
      const borrado = await createUser(companyId, newUserData());

      expect(
        await applyGuardedChange({
          kind: 'delete',
          companyId,
          id: borrado,
          adminRoleName: ROLE_ADMINISTRADOR,
          now: new Date(),
        }),
      ).toBe('ok');

      const ids = await listIds(companyId, actorId, { pageSize: 25 });
      expect(ids).toEqual([vivo]);
      expect(await findAliveInCompany(companyId, borrado)).toBeNull();
    });
  });

  it('R34 — editarlo, borrarlo otra vez y moverle el estado responden `not_found` SIN modificar ninguna fila', async () => {
    await withCompany(async (companyId) => {
      const actorId = await seedUser(companyId, { accountStatus: 'active' });
      const datos = newUserData();
      const borrado = await createUser(companyId, datos);
      await applyGuardedChange({
        kind: 'delete',
        companyId,
        id: borrado,
        adminRoleName: ROLE_ADMINISTRADOR,
        now: new Date(),
      });
      const antes = await rawUser(borrado);

      expect(
        await updateAliveInCompany(
          companyId,
          borrado,
          { ...datos, firstNames: 'Resucitado' },
          new Date(),
        ),
      ).toBe('not_found');
      expect(
        await applyGuardedChange({
          kind: 'delete',
          companyId,
          id: borrado,
          adminRoleName: ROLE_ADMINISTRADOR,
          now: new Date(),
        }),
      ).toBe('not_found');
      expect(
        await applyGuardedChange({
          kind: 'account_status',
          companyId,
          id: borrado,
          adminRoleName: ROLE_ADMINISTRADOR,
          now: new Date(),
          accountStatus: 'active',
          changedBy: actorId,
          lockState: clearedLockState(),
        }),
      ).toBe('not_found');

      expect(await rawUser(borrado)).toEqual(antes);
    });
  });
});

// ---------------------------------------------------------------------------
// R38 — lo que de verdad importa del borrado: los tres quedan LIBRES
// ---------------------------------------------------------------------------

describe('R38 — tras el borrado, el correo, el nombre de usuario y la pareja tipo+numero de documento quedan LIBRES en la misma empresa', () => {
  it('los tres estan OCUPADOS mientras vive y LIBRES en cuanto se borra: es lo que justifica que los indices de QC-47 sean parciales', async () => {
    await withCompany(async (companyId) => {
      const datos = newUserData();
      const primero = await createUser(companyId, datos);

      // Mientras vive, los tres estan ocupados (si no, el caso de abajo no probaria nada).
      expect(
        await create(companyId, datos, FAKE_CREDENTIAL_HASH, 'pending', new Date()),
      ).not.toEqual({ id: expect.any(String) });

      expect(
        await applyGuardedChange({
          kind: 'delete',
          companyId,
          id: primero,
          adminRoleName: ROLE_ADMINISTRADOR,
          now: new Date(),
        }),
      ).toBe('ok');

      // Y ahora otro usuario de la MISMA empresa los toma: correo, nombre de usuario y documento.
      const segundo = await createUser(companyId, datos);

      expect(segundo).not.toBe(primero);
      const row = await rawUser(segundo);
      expect(row.email).toBe(datos.email);
      expect(row.username).toBe(datos.username);
      expect(row.document_number).toBe(datos.documentNumber);
      expect(row.deleted_at).toBeNull();
      // Las dos filas coexisten: la borrada se conservo (R37).
      expect(await countRowsOf(companyId)).toBe(2);
    });
  });
});

// ---------------------------------------------------------------------------
// R35 — el actor no se ve a si mismo
// ---------------------------------------------------------------------------

describe('R35 — el propio actor NO sale en su listado', () => {
  it('`excludeUserId` saca al actor de su propia consulta, en la primera pagina y en todas', async () => {
    await withCompany(async (companyId) => {
      const actorId = await seedUser(companyId, { lastNames: 'Aaaactor' });
      const otroUno = await seedUser(companyId, { lastNames: 'Bbb' });
      const otroDos = await seedUser(companyId, { lastNames: 'Ccc' });

      // El actor seria el PRIMERO por orden de apellidos, asi que si apareciera, apareceria aqui.
      const page = await listAliveInCompany(companyId, actorId, listQuery({ pageSize: 25 }));

      expect(page.items.map((item) => item.id)).toEqual([otroUno, otroDos]);
      expect(page.total).toBe(2);
      // Y con el ambito mirado desde otro actor, la fila del primero si existe: la exclusion es del
      // actor, no un borrado.
      expect(await listIds(companyId, otroUno, { pageSize: 25 })).toEqual([actorId, otroDos]);
    });
  });

  it('tambien queda fuera del `total`, no solo de la pagina', async () => {
    await withCompany(async (companyId) => {
      const actorId = await seedUser(companyId);
      await seedUser(companyId);

      const page = await listAliveInCompany(companyId, actorId, listQuery());

      expect(page.total).toBe(1);
      expect(page.items.map((item) => item.id)).not.toContain(actorId);
    });
  });
});

// ---------------------------------------------------------------------------
// El rol Empacador llega a los usuarios por el CASO DE USO completo (`identity.createUser` /
// `identity.updateUser`, ya cableados con la base real por `lib/composition`), no por el
// adaptador suelto: es la unica forma de ejercitar `requirePermission(actor, 'usuarios.modificar')`
// en el mismo camino que usa produccion.
// ---------------------------------------------------------------------------

/** Cumple la politica real de credenciales (mayuscula, minuscula, digito, simbolo, 8..64):
 *  evidentemente ficticia, y solo sirve para que el alta con credencial tome la rama
 *  `'not_needed'` y no toque el emisor de enlaces ni el correo. */
const FAKE_USE_CASE_CREDENTIAL = 'QC144-credencial-de-prueba-no-real-00';

function actorWithPermissions(companyId: string, permissions: readonly string[]): Actor {
  return { id: randomUUID(), companyId, permissions };
}

/** Los ocho campos comunes de `createUserSchema`/`updateUserSchema` del CASO DE USO, con
 *  `birthDate` como TEXTO ISO: distinto del puerto `NewUser` del adaptador, que pide un `Date`. */
function baseUserInputData(roleId: string, overrides: Record<string, unknown> = {}) {
  const tag = randomUUID();
  return {
    firstNames: 'QC144',
    lastNames: `Empacador${tag.slice(0, 8)}`,
    birthDate: '1990-01-01',
    email: `qc144.${tag}@example.test`,
    phone: '000000000',
    documentTypeCode: DOCUMENT_TYPE_CC,
    documentNumber: documentNumberFrom(tag),
    username: `qc144.${tag}`,
    roleId,
    ...overrides,
  };
}

/** Entrada de ALTA: los ocho campos comunes mas `credential`, para tomar la rama `'not_needed'`
 *  y no rozar el emisor de enlaces ni el correo. */
function createUserInputData(roleId: string, overrides: Record<string, unknown> = {}) {
  return { ...baseUserInputData(roleId), credential: FAKE_USE_CASE_CREDENTIAL, ...overrides };
}

/** Entrada de EDICION: los ocho campos comunes y NADA MAS —`updateUserSchema` es
 *  `createUserSchema.omit({ credential: true })` y `strictObject`, asi que una clave `credential`
 *  presente (aunque valga `undefined`) la rechazaria. */
function updateUserInputData(roleId: string, overrides: Record<string, unknown> = {}) {
  return baseUserInputData(roleId, overrides);
}

describe('QC-144 R23 — alta y edicion con el rol Empacador, por un actor con `usuarios.modificar`', () => {
  it('el alta con roleId del Empacador se acepta y persiste ese rol', async () => {
    await withCompany(async (companyId) => {
      const actor = actorWithPermissions(companyId, ['usuarios.modificar']);

      const result = await identity.createUser(actor, createUserInputData(empacadorRoleId));

      const detail = await findAliveInCompany(companyId, result.id);
      expect(detail).not.toBeNull();
      expect(detail?.roleId).toBe(empacadorRoleId);
      expect(detail?.roleName).toBe(ROLE_EMPACADOR);
    });
  });

  it('la edicion que pide el rol Empacador se acepta y persiste ese rol', async () => {
    await withCompany(async (companyId) => {
      const actor = actorWithPermissions(companyId, ['usuarios.modificar']);
      const created = await identity.createUser(actor, createUserInputData(operadorRoleId));

      await identity.updateUser(actor, created.id, updateUserInputData(empacadorRoleId));

      const detail = await findAliveInCompany(companyId, created.id);
      expect(detail).not.toBeNull();
      expect(detail?.roleId).toBe(empacadorRoleId);
      expect(detail?.roleName).toBe(ROLE_EMPACADOR);
    });
  });

  it('sin `usuarios.modificar` el alta con rol Empacador se rechaza y no crea ninguna fila', async () => {
    await withCompany(async (companyId) => {
      const actor = actorWithPermissions(companyId, ['usuarios.consultar']);

      await expect(
        identity.createUser(actor, createUserInputData(empacadorRoleId)),
      ).rejects.toBeInstanceOf(UnauthorizedError);
      expect(await countRowsOf(companyId)).toBe(0);
    });
  });

  it('sin `usuarios.modificar` la edicion hacia el rol Empacador se rechaza y no modifica la fila', async () => {
    await withCompany(async (companyId) => {
      const owner = actorWithPermissions(companyId, ['usuarios.modificar']);
      const created = await identity.createUser(owner, createUserInputData(operadorRoleId));
      const antes = await rawUser(created.id);

      const actorSinPermiso = actorWithPermissions(companyId, ['usuarios.consultar']);
      await expect(
        identity.updateUser(actorSinPermiso, created.id, updateUserInputData(empacadorRoleId)),
      ).rejects.toBeInstanceOf(UnauthorizedError);

      expect(await rawUser(created.id)).toEqual(antes);
    });
  });
});

describe('QC-144 R3 — el rol Empacador se asigna a usuarios de empresas distintas', () => {
  it('dos usuarios de dos empresas distintas nacen con el MISMO rol Empacador, cada uno en su empresa', async () => {
    await withTwoCompanies(async (companyA, companyB) => {
      const actorA = actorWithPermissions(companyA, ['usuarios.modificar']);
      const actorB = actorWithPermissions(companyB, ['usuarios.modificar']);

      const enA = await identity.createUser(actorA, createUserInputData(empacadorRoleId));
      const enB = await identity.createUser(actorB, createUserInputData(empacadorRoleId));

      const detalleA = await findAliveInCompany(companyA, enA.id);
      const detalleB = await findAliveInCompany(companyB, enB.id);
      expect(detalleA?.roleId).toBe(empacadorRoleId);
      expect(detalleB?.roleId).toBe(empacadorRoleId);
      expect(detalleA?.roleName).toBe(ROLE_EMPACADOR);
      expect(detalleB?.roleName).toBe(ROLE_EMPACADOR);
    });
  });
});

describe('QC-216 R19 — alta y edicion con el rol de acondicionamiento, por un actor con `usuarios.modificar`', () => {
  let acondicionamientoRoleId = '';

  beforeAll(async () => {
    const rol = await prisma.role.findUnique({ where: { name: ROLE_ACONDICIONAMIENTO }, select: { id: true } });
    if (rol === null) {
      throw new Error(
        `falta el rol «${ROLE_ACONDICIONAMIENTO}» en la base: corre \`pnpm run db:migrate\` antes de este archivo.`,
      );
    }
    acondicionamientoRoleId = rol.id;
  });

  it('R19 — el alta con el rol se acepta y persiste ese rol con la empresa del actor', async () => {
    await withCompany(async (companyId) => {
      const actor = actorWithPermissions(companyId, ['usuarios.modificar']);

      const result = await identity.createUser(actor, createUserInputData(acondicionamientoRoleId));

      const detail = await findAliveInCompany(companyId, result.id);
      expect(detail?.roleId).toBe(acondicionamientoRoleId);
      expect(detail?.roleName).toBe(ROLE_ACONDICIONAMIENTO);
      const fila = await rawUser(result.id);
      expect(fila.company_id).toBe(companyId);
      expect(fila.role_id).toBe(acondicionamientoRoleId);
    });
  });

  it('R19 — la edicion que pide el rol se acepta y persiste ese rol con la empresa del actor', async () => {
    await withCompany(async (companyId) => {
      const actor = actorWithPermissions(companyId, ['usuarios.modificar']);
      const created = await identity.createUser(actor, createUserInputData(operadorRoleId));

      await identity.updateUser(actor, created.id, updateUserInputData(acondicionamientoRoleId));

      const detail = await findAliveInCompany(companyId, created.id);
      expect(detail?.roleId).toBe(acondicionamientoRoleId);
      expect(detail?.roleName).toBe(ROLE_ACONDICIONAMIENTO);
      expect((await rawUser(created.id)).company_id).toBe(companyId);
    });
  });

  it('R19 — sin `usuarios.modificar` el alta con el rol se rechaza y no crea ninguna fila', async () => {
    await withCompany(async (companyId) => {
      const actor = actorWithPermissions(companyId, ['usuarios.consultar']);

      await expect(
        identity.createUser(actor, createUserInputData(acondicionamientoRoleId)),
      ).rejects.toBeInstanceOf(UnauthorizedError);
      expect(await countRowsOf(companyId)).toBe(0);
    });
  });

  it('R19 — sin `usuarios.modificar` la edicion hacia el rol se rechaza y no modifica la fila', async () => {
    await withCompany(async (companyId) => {
      const owner = actorWithPermissions(companyId, ['usuarios.modificar']);
      const created = await identity.createUser(owner, createUserInputData(operadorRoleId));
      const antes = await rawUser(created.id);

      const actorSinPermiso = actorWithPermissions(companyId, ['usuarios.consultar']);
      await expect(
        identity.updateUser(actorSinPermiso, created.id, updateUserInputData(acondicionamientoRoleId)),
      ).rejects.toBeInstanceOf(UnauthorizedError);

      expect(await rawUser(created.id)).toEqual(antes);
    });
  });

  it('R3 — dos usuarios de dos empresas distintas nacen con el MISMO rol, cada uno en su empresa', async () => {
    await withTwoCompanies(async (companyA, companyB) => {
      const enA = await identity.createUser(
        actorWithPermissions(companyA, ['usuarios.modificar']),
        createUserInputData(acondicionamientoRoleId),
      );
      const enB = await identity.createUser(
        actorWithPermissions(companyB, ['usuarios.modificar']),
        createUserInputData(acondicionamientoRoleId),
      );

      const filaA = await rawUser(enA.id);
      const filaB = await rawUser(enB.id);
      expect(filaA.role_id).toBe(acondicionamientoRoleId);
      expect(filaB.role_id).toBe(acondicionamientoRoleId);
      expect(filaA.company_id).toBe(companyA);
      expect(filaB.company_id).toBe(companyB);
      expect(await prisma.role.count({ where: { name: ROLE_ACONDICIONAMIENTO } })).toBe(1);
    });
  });
});

// ---------------------------------------------------------------------------
// El rol de administrador existe en la base y no se usa aqui por su literal
// ---------------------------------------------------------------------------

describe('el escenario de este archivo no roza la guarda del ultimo administrador', () => {
  it('todos sus usuarios llevan el rol `Operador`, asi que ninguna operacion de aqui puede responder `last_administrator`', async () => {
    // `administradorRoleId` se resuelve en `beforeAll` SOLO para dejar constancia de que el rol
    // existe y de que no es el que usan los casos: R22 y R23 tienen su propio archivo
    // (`last-administrator.int.test.ts`) y no se duplican aqui.
    expect(administradorRoleId).not.toBe('');
    expect(operadorRoleId).not.toBe(administradorRoleId);
  });
});

// ---------------------------------------------------------------------------
// El Maestro no pertenece a ninguna empresa ni se asigna desde la gestion de usuarios
// ---------------------------------------------------------------------------

/** Todos los permisos del catalogo: el rechazo del rol Maestro no depende de lo que tenga el actor. */
const TODOS_LOS_PERMISOS: readonly string[] = PERMISSIONS.map((entry) => entry.code);

/** Usuarios vivos o borrados con ese nombre de usuario en toda la base, sin distinguir mayusculas. */
async function countByUsername(username: string): Promise<number> {
  return prisma.user.count({ where: { username: { equals: username, mode: 'insensitive' } } });
}

describe('QC-161 R1 — el Maestro no aparece en ninguna operacion con ambito de empresa', () => {
  it('R1 — la lista de una empresa no lo incluye, ni buscandolo por su nombre de usuario', async () => {
    await withMaestro(async (maestroId, username) => {
      await withCompany(async (companyId) => {
        const actorId = await seedUser(companyId);
        const otro = await seedUser(companyId);

        expect(await listIds(companyId, actorId, { pageSize: 25 })).toEqual([otro]);
        expect(await listIds(companyId, actorId, { search: username })).toEqual([]);
        expect(await findAliveInCompany(companyId, maestroId)).toBeNull();
      });
    });
  });

  it('R1 — editarlo, darlo de baja y cambiarle el estado responden `not_found` y su fila no cambia', async () => {
    await withMaestro(async (maestroId) => {
      await withCompany(async (companyId) => {
        const actorId = await seedUser(companyId, { accountStatus: 'active' });
        const antes = await rawUser(maestroId);

        expect(
          await updateAliveInCompany(companyId, maestroId, newUserData(), new Date()),
        ).toBe('not_found');
        expect(
          await applyGuardedChange({
            kind: 'delete',
            companyId,
            id: maestroId,
            adminRoleName: ROLE_ADMINISTRADOR,
            now: new Date(),
          }),
        ).toBe('not_found');
        expect(
          await applyGuardedChange({
            kind: 'account_status',
            companyId,
            id: maestroId,
            adminRoleName: ROLE_ADMINISTRADOR,
            now: new Date(),
            accountStatus: 'blocked',
            changedBy: actorId,
            lockState: null,
          }),
        ).toBe('not_found');

        expect(await rawUser(maestroId)).toEqual(antes);
      });
    });
  });
});

describe('QC-161 R24, R25 — el rol Maestro no se concede en el alta ni en la edicion', () => {
  it('R24 — el alta con el rol Maestro se rechaza como accion no permitida y no escribe ninguna fila, con `usuarios.modificar` o con todo el catalogo', async () => {
    await withCompany(async (companyId) => {
      for (const permisos of [['usuarios.modificar'], TODOS_LOS_PERMISOS]) {
        const actor = actorWithPermissions(companyId, permisos);
        const entrada = createUserInputData(maestroRoleId);

        await expect(identity.createUser(actor, entrada)).rejects.toBeInstanceOf(
          ActionNotAllowedError,
        );
        expect(await countByUsername(entrada.username)).toBe(0);
      }
      expect(await countRowsOf(companyId)).toBe(0);
    });
  });

  it('R24 — el adaptador responde `action_not_allowed` antes de escribir', async () => {
    await withCompany(async (companyId) => {
      const outcome = await create(
        companyId,
        newUserData({ roleId: maestroRoleId }),
        FAKE_CREDENTIAL_HASH,
        'pending',
        new Date(),
      );

      expect(outcome).toBe('action_not_allowed');
      expect(await countRowsOf(companyId)).toBe(0);
    });
  });

  it('R25 — la edicion hacia el rol Maestro se rechaza como accion no permitida y la fila no cambia, con `usuarios.modificar` o con todo el catalogo', async () => {
    await withCompany(async (companyId) => {
      const owner = actorWithPermissions(companyId, ['usuarios.modificar']);
      const created = await identity.createUser(owner, createUserInputData(operadorRoleId));
      const antes = await rawUser(created.id);

      for (const permisos of [['usuarios.modificar'], TODOS_LOS_PERMISOS]) {
        const actor = actorWithPermissions(companyId, permisos);
        await expect(
          identity.updateUser(actor, created.id, updateUserInputData(maestroRoleId)),
        ).rejects.toBeInstanceOf(ActionNotAllowedError);
      }

      expect(
        await updateAliveInCompany(
          companyId,
          created.id,
          newUserData({ roleId: maestroRoleId }),
          new Date(),
        ),
      ).toBe('action_not_allowed');
      expect(await rawUser(created.id)).toEqual(antes);
      expect(await countRowsOf(companyId)).toBe(1);
    });
  });
});

describe('QC-161 R40 — el nombre de usuario de otra empresa o del Maestro choca en el alta y en la edicion', () => {
  it('R40 — el alta con el nombre de un usuario de OTRA empresa o del Maestro devuelve `username` y no escribe nada', async () => {
    await withMaestro(async (_maestroId, nombreDelMaestro) => {
      await withTwoCompanies(async (companyA, companyB) => {
        const deA = newUserData();
        await createUser(companyA, deA);

        for (const username of [deA.username, nombreDelMaestro, nombreDelMaestro.toUpperCase()]) {
          const outcome = await create(
            companyB,
            newUserData({ username }),
            FAKE_CREDENTIAL_HASH,
            'pending',
            new Date(),
          );
          expect(outcome, username).toBe('username');
        }
        expect(await countRowsOf(companyB)).toBe(0);
      });
    });
  });

  it('R40 — la edicion hacia el nombre de un usuario de OTRA empresa o del Maestro devuelve `username` y la fila no cambia', async () => {
    await withMaestro(async (_maestroId, nombreDelMaestro) => {
      await withTwoCompanies(async (companyA, companyB) => {
        const deA = newUserData();
        await createUser(companyA, deA);
        const datosB = newUserData();
        const enB = await createUser(companyB, datosB);
        const antes = await rawUser(enB);

        for (const username of [deA.username, nombreDelMaestro]) {
          expect(
            await updateAliveInCompany(companyB, enB, { ...datosB, username }, new Date()),
            username,
          ).toBe('username');
        }
        expect(await rawUser(enB)).toEqual(antes);
      });
    });
  });

  it('R40 — por el caso de uso llega como `DuplicateUsernameError` y el error no lleva ningun dato del otro usuario', async () => {
    await withMaestro(async (maestroId, nombreDelMaestro) => {
      await withTwoCompanies(async (companyA, companyB) => {
        const deA = newUserData();
        const idDeA = await createUser(companyA, deA);
        const actor = actorWithPermissions(companyB, ['usuarios.modificar']);

        for (const [username, idDelOtro, empresaDelOtro] of [
          [deA.username, idDeA, companyA],
          [nombreDelMaestro, maestroId, null],
        ] as const) {
          const error: unknown = await identity
            .createUser(actor, createUserInputData(operadorRoleId, { username }))
            .then(
              () => null,
              (fallo: unknown) => fallo,
            );

          expect(error, username).toBeInstanceOf(DuplicateUsernameError);
          const visto = JSON.stringify({
            message: (error as DuplicateUsernameError).message,
            diagnostic: (error as DuplicateUsernameError).diagnostic,
            props: { ...(error as object) },
          });
          expect(visto).not.toContain(idDelOtro);
          if (empresaDelOtro !== null) expect(visto).not.toContain(empresaDelOtro);
          expect(visto.toLowerCase()).not.toContain(username.toLowerCase());
        }
        expect(await countRowsOf(companyB)).toBe(0);
      });
    });
  });
});
