/**
 * QC-79 T20 — el enlace de establecimiento de credencial contra Postgres REAL
 * (R9, R11, R12, R19, R20, R21, R22, R37).
 *
 * QUE SE EJERCITA: los DOS adaptadores de produccion, directamente y sin fachada —
 * `lib/modules/identity/adapters/driven/persistence/credential-setup-link-prisma.ts` (las dos
 * transacciones de `design.md > 4.5` y `> 4.6`) y el `create` de `user-admin-prisma.ts` con
 * `kind: 'none'` (el centinela de T12)—. Lo que se prueba aqui es EXACTAMENTE lo que ningun doble
 * puede contestar:
 *
 *   - que la columna `token_digest` guarda la HUELLA y que el secreto no esta en ninguna parte de
 *     la fila (R9);
 *   - que «un enlace vivo por persona» lo garantiza el INDICE UNICO PARCIAL
 *     `credential_setup_tokens_one_live_per_user` y no la disciplina del codigo (R11);
 *   - que el consumo es un compare-and-set atomico y de dos usos simultaneos gana uno solo (R12,
 *     R20);
 *   - que cuando la cuenta ya no esta en `pending` —borrada o activa— la transaccion REVIERTE
 *     ENTERA y el enlace NO queda consumido (R19, R22);
 *   - que `must_change_credential` no cambia al establecer la contrasena (R21);
 *   - que el centinela de `design.md > 6.1` no verifica contra NINGUNA contrasena (R4, via T12).
 *
 * DOS CONEXIONES DE VERDAD, y es el nucleo del archivo. Un `Promise.all` de dos llamadas sobre el
 * MISMO `PrismaClient` puede serializarse en el pool y dejar el test verde sin haber probado
 * ninguna carrera, asi que se instancian DOS `PrismaClient` distintos y se importa DOS VECES el
 * adaptador de produccion, cada copia con `@/lib/shared/db/prisma` doblado a su cliente
 * (`importAdapterBoundTo`). No se copia ni se reescribe una linea de SQL: el codigo que corre es el
 * de produccion. Es el mismo patron, y por el mismo motivo, que `last-administrator.int.test.ts`,
 * y el primer caso lo DEMUESTRA con dos `pg_backend_pid()` leidos desde transacciones solapadas.
 *
 * LA CARRERA DE R11 NO SE DEJA AL AZAR. Lanzar dos emisiones con `Promise.all` y esperar que se
 * solapen es una apuesta: si la primera confirma antes de que la segunda empiece, la segunda
 * sustituye su enlace y las dos salen bien —el invariante se cumple, pero el `23505` no se ha
 * ejercido y el test sale verde sin haber probado nada—. Asi que la carrera se FUERZA: una tercera
 * conexion bloquea con `SELECT … FOR UPDATE` el enlace vivo anterior, las dos emisiones se quedan
 * esperando en su paso 1 —lo que se comprueba leyendo `pg_stat_activity`, no durmiendo—, y al
 * soltar el bloqueo una gana, sustituye y confirma, y la otra choca contra el indice parcial. El
 * resultado es determinista: exactamente un `'superseded'`.
 *
 * AISLAMIENTO: CONSTRUCCION PROPIA + LIMPIEZA PROPIA, como `user-crud.int.test.ts` y
 * `last-administrator.int.test.ts`. **Aqui NO se puede usar el `$transaction` + senal de rollback
 * de `identity-constraints.int.test.ts`**: los dos adaptadores abren SU PROPIA transaccion contra
 * el cliente global, y las carreras necesitan transacciones que CONFIRMEN. Cada caso fabrica su
 * propia empresa con nombre irrepetible y sus propios usuarios, y la borra en un `finally`.
 *
 * EL ORDEN DE LA LIMPIEZA NO ES LIBRE, y esta feature le anade un escalon:
 * `credential_setup_tokens_user_id_fkey` es `ON DELETE RESTRICT` (`design.md > 3.1`), asi que los
 * ENLACES se borran ANTES que los usuarios; despues hay que vaciar `account_status_changed_by`
 * (`users_account_status_changed_by_fkey`, tambien RESTRICT, QC-65 R12); despues los usuarios; y
 * solo entonces la empresa. Un solo `afterAll` comprueba que no quedo ninguna empresa propia.
 *
 * LA BASE LOCAL NO ESTA VACIA: trae la instalacion del seed. Este archivo NO afirma sobre el estado
 * global de ninguna tabla —los de integracion corren en serie pero no aislados entre archivos
 * (`vitest.config.mts`, `fileParallelism: false`)—: solo afirma sobre SUS propias filas. El rol
 * `Operador` se REUTILIZA, no se crea.
 *
 * SOBRE LOS MENSAJES DE ERROR: nunca se afirma sobre el TEXTO de un error de Postgres —en esta
 * maquina el servidor responde en espanol—. Se afirma sobre el SQLSTATE (`23505`, en `meta.code`
 * por el camino raw) y sobre la COLUMNA que el choque senala (`meta.target` por el camino del
 * cliente tipado), que son identificadores nuestros y no traducibles. El NOMBRE DEL INDICE no se
 * usa como ancla en ninguna asercion de error: Prisma no lo expone por ningun campo, comprobado
 * por los dos caminos (el detalle esta escrito en el caso de R11). Si que se usa en el `beforeAll`,
 * donde se lee de `pg_indexes` y ahi si es un identificador de la base.
 *
 * SIN TESTS DE RLS: un test de RLS escrito con Prisma sale verde pase lo que pase, porque Prisma se
 * conecta como dueno de las tablas (`docs/architecture.md > Acceso a datos y autorizacion`). El RLS
 * forzado de R35 lo cierra `tests/guards/guard-rls-force.test.ts`.
 */
import { randomUUID } from 'node:crypto';

import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { DOCUMENT_TYPE_CC, normalizeCompanyName } from '@/lib/modules/identity';
import { create } from '@/lib/modules/identity/adapters/driven/persistence/user-admin-prisma';
import {
  createCredentialSetupSecret,
  digestOfCredentialSetupSecret,
} from '@/lib/modules/identity/adapters/driven/security/credential-setup-secret-crypto';
import {
  createPasswordHash,
  verifyPasswordHash,
} from '@/lib/modules/identity/adapters/driven/security/password-hash';
import {
  credentialSetupLinkExpiresAt,
  NO_CREDENTIAL_SENTINEL,
} from '@/lib/modules/identity/domain/credential-setup-link';
import { ROLE_OPERADOR } from '@/lib/modules/identity/domain/roles';
import { prisma } from '@/lib/shared/db/prisma';

import type { IssueOutcome } from '@/lib/modules/identity/ports/credential-setup-link-repository';
import type { NewUser } from '@/lib/modules/identity/ports/user-admin-repository';

// ---------------------------------------------------------------------------
// Las dos conexiones de verdad
// ---------------------------------------------------------------------------

const ADAPTER_PATH =
  '@/lib/modules/identity/adapters/driven/persistence/credential-setup-link-prisma';

type LinkAdapter =
  typeof import('@/lib/modules/identity/adapters/driven/persistence/credential-setup-link-prisma');

/**
 * Devuelve una instancia NUEVA del adaptador de produccion cuyo `prisma` es `client`. El doble de
 * `@/lib/shared/db/prisma` es imprescindible: ese modulo cachea su unica instancia en `globalThis`,
 * asi que reimportarlo sin doblarlo devolveria siempre el mismo cliente y las dos «conexiones»
 * serian una. Se COMPRUEBA que el doble quedo en vigor: si fallara en silencio, las dos carreras de
 * este archivo saldrian verdes sobre un solo pool, que es exactamente la forma de hacerlo mal.
 */
async function importAdapterBoundTo(client: PrismaClient): Promise<LinkAdapter> {
  vi.resetModules();
  vi.doMock('@/lib/shared/db/prisma', () => ({ prisma: client }));
  const bound = await import('@/lib/shared/db/prisma');
  if (bound.prisma !== client) {
    throw new Error(
      'el doble de `@/lib/shared/db/prisma` no quedo en vigor: el adaptador no estaria atado a su ' +
        'propia conexion y las carreras no se probarian',
    );
  }
  return import(ADAPTER_PATH);
}

/** `pg_backend_pid()` de una transaccion interactiva, leido mientras `arrive` sigue pendiente. */
async function backendPidWhileHolding(
  client: PrismaClient,
  arrive: () => Promise<void>,
): Promise<number> {
  return client.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<
        ReadonlyArray<{ pid: number }>
      >`SELECT pg_backend_pid()::int AS pid`;
      const pid = rows[0]?.pid;
      if (pid === undefined) throw new Error('pg_backend_pid() no devolvio ninguna fila');
      await arrive();
      return pid;
    },
    { maxWait: 10_000, timeout: 10_000 },
  );
}

/** Puerta que se abre cuando los `expected` participantes han llegado. */
function createBarrier(expected: number): () => Promise<void> {
  let pending = expected;
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return async () => {
    pending -= 1;
    if (pending === 0) open();
    await opened;
  };
}

/** Una promesa que se resuelve desde fuera: es como se suelta el bloqueo de la carrera de R11. */
function createGate(): { readonly opened: Promise<void>; readonly open: () => void } {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

/**
 * Cuantas sesiones de esta base estan ESPERANDO un bloqueo ahora mismo. Es lo que sustituye a un
 * `sleep`: la carrera se lanza cuando se SABE que las dos emisiones estan encoladas, no cuando se
 * supone. Los de integracion corren en serie (`fileParallelism: false`), asi que las unicas
 * sesiones esperando son las de este archivo.
 */
async function countLockWaiters(): Promise<number> {
  const rows = await prisma.$queryRaw<ReadonlyArray<{ waiters: number }>>(Prisma.sql`
    SELECT count(*)::int AS "waiters"
      FROM pg_stat_activity
     WHERE datname = current_database()
       AND wait_event_type = 'Lock'
       AND pid <> pg_backend_pid()
  `);
  return rows[0]?.waiters ?? 0;
}

/** Espera a que haya al menos `expected` sesiones encoladas, o falla diciendo que no las hubo. */
async function waitForLockWaiters(expected: number): Promise<void> {
  // 20 s en CI: el runner gratuito de GitHub (2 vCPU) corre la suite entera en paralelo y las dos
  // emisiones tardaron mas de 5 s en encolarse en una corrida (2026-10-07), aunque pasaron en la
  // repeticion. El plazo solo acota la espera; no cambia lo que se comprueba.
  const deadline = Date.now() + (process.env.CI ? 20_000 : 5_000);
  for (;;) {
    if ((await countLockWaiters()) >= expected) return;
    if (Date.now() > deadline) {
      throw new Error(
        `las ${expected} emisiones no llegaron a encolarse tras el bloqueo: la carrera de R11 no ` +
          'se estaria ejerciendo y un verde aqui no significaria nada',
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

// ---------------------------------------------------------------------------
// El escenario: empresa propia, usuario propio, limpieza propia
// ---------------------------------------------------------------------------

let operadorRoleId = '';

/** Las empresas que este archivo creo, para comprobar en `afterAll` que no quedo ninguna. */
const createdCompanyIds = new Set<string>();

async function createCompany(): Promise<string> {
  const name = `QC79 T20 ${randomUUID()}`;
  const company = await prisma.company.create({
    data: { name, nameNormalized: normalizeCompanyName(name) },
    select: { id: true },
  });
  createdCompanyIds.add(company.id);
  return company.id;
}

/** Borra enlaces, usuarios y empresa en el UNICO orden que respetan las tres FK (ver cabecera). */
async function dropCompany(companyId: string): Promise<void> {
  await prisma.credentialSetupToken.deleteMany({ where: { user: { companyId } } });
  await prisma.user.updateMany({ where: { companyId }, data: { accountStatusChangedBy: null } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
  createdCompanyIds.delete(companyId);
}

/**
 * Los nueve campos de `NewUser` con valores irrepetibles. `roleId` cae en el `Operador` a
 * proposito: asi ninguna operacion de este archivo roza la guarda del ultimo administrador, que
 * tiene su propio archivo de integracion.
 */
function newUserData(): NewUser {
  const tag = randomUUID();
  return {
    firstNames: 'QC79T20',
    lastNames: `Apellido${tag.slice(0, 8)}`,
    birthDate: new Date('1990-01-01T00:00:00.000Z'),
    email: `qc79.t20.${tag}@example.test`,
    phone: '000000000',
    documentTypeCode: DOCUMENT_TYPE_CC,
    documentNumber: tag.replaceAll('-', '').slice(0, 20),
    username: `qc79.t20.${tag}`,
    roleId: operadorRoleId,
  };
}

type Scenario = {
  readonly companyId: string;
  readonly userId: string;
  /** El correo con el que nacio la fila: `issueForPendingUser` tiene que devolver ESTE. */
  readonly email: string;
};

/**
 * Un usuario `pending` creado por el ADAPTADOR DE PRODUCCION con `kind: 'none'` (T11, T12): asi
 * cada caso de este archivo parte de una fila con el centinela, que es el estado real del que sale
 * un enlace, y no de una fila fabricada a mano que podria no parecerse.
 */
async function withPendingUser(body: (scenario: Scenario) => Promise<void>): Promise<void> {
  const companyId = await createCompany();
  try {
    const data = newUserData();
    const created = await create(companyId, data, { kind: 'none' }, 'pending', new Date());
    if (typeof created === 'string') {
      throw new Error(`el alta sin credencial no debia fallar, y devolvio \`${created}\``);
    }
    await body({ companyId, userId: created.id, email: data.email });
  } finally {
    await dropCompany(companyId);
  }
}

// ---------------------------------------------------------------------------
// Lo que quedo escrito, leido en crudo
// ---------------------------------------------------------------------------

type RawTokenRow = {
  readonly id: string;
  readonly user_id: string;
  readonly token_digest: string;
  readonly expires_at: Date;
  readonly consumed_at: Date | null;
  readonly superseded_at: Date | null;
};

async function tokensOf(userId: string): Promise<readonly RawTokenRow[]> {
  return prisma.$queryRaw<ReadonlyArray<RawTokenRow>>(Prisma.sql`
    SELECT "id"::text AS "id", "user_id"::text AS "user_id", "token_digest",
           "expires_at", "consumed_at", "superseded_at"
      FROM "credential_setup_tokens"
     WHERE "user_id" = ${userId}::uuid
     ORDER BY "created_at"
  `);
}

function liveTokensOf(rows: readonly RawTokenRow[]): readonly RawTokenRow[] {
  return rows.filter((row) => row.consumed_at === null && row.superseded_at === null);
}

type RawUserRow = {
  readonly account_status: string;
  readonly account_status_changed_at: Date;
  readonly account_status_changed_by: string | null;
  readonly must_change_credential: boolean;
  readonly password_hash: string;
  readonly deleted_at: Date | null;
};

async function rawUser(id: string): Promise<RawUserRow> {
  const rows = await prisma.$queryRaw<ReadonlyArray<RawUserRow>>(Prisma.sql`
    SELECT "account_status"::text AS "account_status", "account_status_changed_at",
           "account_status_changed_by"::text AS "account_status_changed_by",
           "must_change_credential", "password_hash", "deleted_at"
      FROM "users" WHERE "id" = ${id}::uuid
  `);
  const row = rows[0];
  if (row === undefined) throw new Error(`no existe ninguna fila de \`users\` con id ${id}`);
  return row;
}

/** Emite un enlace por el adaptador de produccion y devuelve el secreto que viajaria al correo. */
async function issueLinkFor(
  adapter: LinkAdapter,
  userId: string,
  now: Date,
): Promise<{ readonly secret: string; readonly digest: string }> {
  const { secret, digest } = createCredentialSetupSecret();
  const outcome = await adapter.issueForPendingUser({
    userId,
    companyId: null,
    digest,
    expiresAt: credentialSetupLinkExpiresAt(now),
    now,
  });
  if (typeof outcome === 'string') {
    throw new Error(`la emision no debia fallar, y devolvio \`${outcome}\``);
  }
  return { secret, digest };
}

function isIssued(outcome: IssueOutcome | { readonly email: string }): boolean {
  return typeof outcome !== 'string';
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

const TOKENS_TABLE = 'credential_setup_tokens';
const ONE_LIVE_INDEX = 'credential_setup_tokens_one_live_per_user';

let clientA: PrismaClient;
let clientB: PrismaClient;
let adapterA: LinkAdapter;
let adapterB: LinkAdapter;

beforeAll(async () => {
  // La migracion de esta feature (T6). Si falta la tabla, el mensaje dice QUE hacer, y ese es el
  // criterio de «hecho» de T20: sin la migracion aplicada este archivo no puede significar nada.
  const tabla = await prisma.$queryRaw<ReadonlyArray<{ oid: string | null }>>(Prisma.sql`
    SELECT to_regclass(${`public.${TOKENS_TABLE}`})::text AS "oid"
  `);
  if ((tabla[0]?.oid ?? null) === null) {
    throw new Error(
      `falta la tabla \`${TOKENS_TABLE}\` (QC-79, migracion ` +
        '`20260911155021_credential_setup_tokens`): corre `pnpm run db:migrate` contra la base de ' +
        'esta feature antes de correr este archivo.',
    );
  }

  // El indice unico PARCIAL de `design.md > 3.2` ES el requisito R11, y se escribio A MANO en la
  // migracion porque Prisma no modela indices parciales: si se hubiera perdido, la carrera de abajo
  // dejaria DOS enlaces vivos y el mensaje tiene que decir por que.
  const indice = await prisma.$queryRaw<ReadonlyArray<{ indexname: string }>>(Prisma.sql`
    SELECT "indexname" FROM "pg_indexes"
     WHERE "schemaname" = 'public' AND "tablename" = ${TOKENS_TABLE}
       AND "indexname" = ${ONE_LIVE_INDEX}
  `);
  if (indice.length === 0) {
    throw new Error(
      `la tabla \`${TOKENS_TABLE}\` existe pero le falta el indice unico parcial ` +
        `\`${ONE_LIVE_INDEX}\`, que ES el requisito R11 y va escrito a mano en la migracion: ` +
        'corre `pnpm run db:migrate` contra la base de esta feature antes de correr este archivo.',
    );
  }

  const operador = await prisma.role.findFirst({
    where: { name: ROLE_OPERADOR },
    select: { id: true },
  });
  if (operador === null) {
    throw new Error(
      `falta el rol base ${ROLE_OPERADOR} en la base: corre \`pnpm run db:seed\` antes de correr ` +
        'este archivo.',
    );
  }
  operadorRoleId = operador.id;

  clientA = new PrismaClient();
  clientB = new PrismaClient();
  adapterA = await importAdapterBoundTo(clientA);
  adapterB = await importAdapterBoundTo(clientB);
  vi.doUnmock('@/lib/shared/db/prisma');
});

afterAll(async () => {
  // Ninguna fila propia sobrevive: si algun `finally` no hubiera corrido, esto lo dice.
  expect([...createdCompanyIds]).toEqual([]);
  // Los dos `?.` no son decoracion: si el `beforeAll` aborto -por ejemplo porque falta la
  // migracion-, los clientes no llegaron a instanciarse, y un `TypeError` aqui TAPARIA con ruido
  // el unico mensaje que importa, que es el que dice que corras `pnpm run db:migrate`.
  await clientA?.$disconnect();
  await clientB?.$disconnect();
  vi.resetModules();
});

describe('QC-79 T20 — el enlace de credencial contra Postgres real', () => {
  // -------------------------------------------------------------------------
  // R9 — la huella, y solo la huella
  // -------------------------------------------------------------------------

  it('R9 — la columna guarda la HUELLA (SHA-256 hex) y el secreto no aparece en ninguna columna de ninguna fila', async () => {
    await withPendingUser(async ({ userId, email }) => {
      const now = new Date();
      const { secret, digest } = createCredentialSetupSecret();

      const outcome = await adapterA.issueForPendingUser({
        userId,
        companyId: null,
        digest,
        expiresAt: credentialSetupLinkExpiresAt(now),
        now,
      });

      // Devuelve el correo leido de la BASE, no uno que trajera el llamante (`design.md > 6.2`).
      expect(outcome).toEqual({ email });

      const filas = await tokensOf(userId);
      expect(filas).toHaveLength(1);
      const fila = filas[0] as RawTokenRow;

      // La huella es la esperada, y es la de SHA-256 en hexadecimal: 64 caracteres.
      expect(fila.token_digest).toBe(digestOfCredentialSetupSecret(secret));
      expect(fila.token_digest).toMatch(/^[0-9a-f]{64}$/);
      expect(fila.token_digest).not.toBe(secret);

      // Y el secreto NO esta en la tabla: se busca como subcadena en la fila ENTERA convertida a
      // texto —todas las columnas a la vez—, con `strpos` y no con `LIKE`, porque el `_` de
      // base64url es un comodin de `LIKE` y haria la busqueda mas laxa de lo que se cree.
      const rastro = await prisma.$queryRaw<ReadonlyArray<{ hits: number }>>(Prisma.sql`
        SELECT count(*)::int AS "hits"
          FROM "credential_setup_tokens" t
         WHERE strpos(t::text, ${secret}) > 0
      `);
      expect(rastro[0]?.hits).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // R37 — la tabla cuelga del usuario, y no lleva empresa
  // -------------------------------------------------------------------------

  it('R37 — la tabla no tiene columna de empresa: cuelga del usuario y por el se consulta', async () => {
    const columnas = await prisma.$queryRaw<ReadonlyArray<{ column_name: string }>>(Prisma.sql`
      SELECT "column_name" FROM "information_schema"."columns"
       WHERE "table_schema" = 'public' AND "table_name" = ${TOKENS_TABLE}
       ORDER BY "column_name"
    `);
    const nombres = columnas.map((columna) => columna.column_name);
    expect(nombres).not.toContain('company_id');
    expect(nombres).toEqual([
      'consumed_at',
      'created_at',
      'expires_at',
      'id',
      'superseded_at',
      'token_digest',
      'user_id',
    ]);
  });

  // -------------------------------------------------------------------------
  // Las dos conexiones, antes de usarlas para nada
  // -------------------------------------------------------------------------

  it('las dos conexiones son reales y distintas: dos `pg_backend_pid()` solapados y dos instancias del adaptador', async () => {
    expect(clientA).not.toBe(clientB);
    // Dos instancias distintas del MISMO archivo de produccion, cada una con su cliente doblado.
    expect(adapterA).not.toBe(adapterB);
    expect(adapterA.issueForPendingUser).not.toBe(adapterB.issueForPendingUser);

    // Las dos transacciones se solapan a proposito: cada una lee su pid y espera a que la otra
    // llegue. Si compartieran una sola conexion, la segunda no podria ni empezar.
    const arrive = createBarrier(2);
    const [pidA, pidB] = await Promise.all([
      backendPidWhileHolding(clientA, arrive),
      backendPidWhileHolding(clientB, arrive),
    ]);
    expect(pidA).not.toBe(pidB);
  });

  // -------------------------------------------------------------------------
  // R11 — un solo enlace vivo por persona, y lo decide la BASE
  // -------------------------------------------------------------------------

  it('R11 — un segundo enlace VIVO para la misma persona lo rechaza el indice parcial con `23505`', async () => {
    await withPendingUser(async ({ userId }) => {
      const now = new Date();
      await issueLinkFor(adapterA, userId, now);

      // Se intenta a mano lo que el adaptador nunca hace: insertar un segundo enlace vivo. Es la
      // unica forma de ver el SQLSTATE de frente, sin pasar por la traduccion del adaptador.
      const segundo = createCredentialSetupSecret();
      const error = await prisma
        .$executeRaw(Prisma.sql`
          INSERT INTO "credential_setup_tokens" ("user_id", "token_digest", "expires_at")
          VALUES (${userId}::uuid, ${segundo.digest}, ${credentialSetupLinkExpiresAt(now)})
        `)
        .then(
          () => null,
          (caught: unknown) => caught,
        );

      expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      const conocido = error as Prisma.PrismaClientKnownRequestError;
      // DONDE SE ANCLA, Y POR QUE. Prisma NO expone el NOMBRE del indice por ningun campo
      // estable, y esta comprobado por los DOS caminos contra esta misma base: por `$executeRaw`
      // el error llega como `P2010` con `meta = { code: '23505', message: <texto del servidor> }`
      // —el nombre del indice no aparece en ningun campo—, y por el cliente tipado llega como
      // `P2002` con `meta = { modelName, target: ['user_id'] }`. El TEXTO del mensaje tampoco
      // sirve de ancla: en esta maquina el servidor responde en espanol, asi que afirmar sobre el
      // seria afirmar sobre una traduccion. Por eso se afirman las tres cosas que SI son
      // invariantes, cada una por el camino donde existe.
      //
      // 1. EL SQLSTATE, por el camino raw: `meta.code`. Es el codigo de Postgres, no un texto.
      expect((conocido.meta as { readonly code?: unknown } | undefined)?.code).toBe('23505');

      // 2. LA COLUMNA SENALADA, por el camino del cliente tipado: `meta.target`. Es el sustituto
      // correcto del nombre del indice porque nombra la COLUMNA, y la columna es justo lo que
      // distingue el indice parcial de R11 (`user_id`) del OTRO indice unico de esta tabla
      // (`token_digest`). Que discrimina de verdad lo demuestra el caso siguiente, que provoca el
      // choque contrario y comprueba que ahi `target` NO es `user_id`.
      const tercero = createCredentialSetupSecret();
      const errorTipado = await prisma.credentialSetupToken
        .create({
          data: {
            userId,
            tokenDigest: tercero.digest,
            expiresAt: credentialSetupLinkExpiresAt(now),
          },
        })
        .then(
          () => null,
          (caught: unknown) => caught,
        );

      expect(errorTipado).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      const tipado = errorTipado as Prisma.PrismaClientKnownRequestError;
      expect(tipado.code).toBe('P2002');
      expect((tipado.meta as { readonly target?: unknown } | undefined)?.target).toEqual([
        'user_id',
      ]);

      // 3. EL INVARIANTE, que es el requisito: despues de los dos intentos queda EXACTAMENTE UNO.
      expect(liveTokensOf(await tokensOf(userId))).toHaveLength(1);
    });
  });

  it('R11 — el choque contra el OTRO indice unico (`token_digest`) senala `token_digest` y NO `user_id`: la asercion discrimina entre los dos indices', async () => {
    await withPendingUser(async ({ companyId, userId }) => {
      const now = new Date();
      const { digest } = await issueLinkFor(adapterA, userId, now);

      // Un SEGUNDO usuario de la misma empresa, SIN ningun enlace vivo: por el indice parcial de
      // R11 su ranura esta libre, asi que lo unico con lo que su insercion puede chocar es con el
      // indice unico de `token_digest`.
      const otro = await create(companyId, newUserData(), { kind: 'none' }, 'pending', now);
      if (typeof otro === 'string') {
        throw new Error(`el alta del segundo usuario no debia fallar, y devolvio \`${otro}\``);
      }
      expect(liveTokensOf(await tokensOf(otro.id))).toHaveLength(0);

      // El MISMO digest que ya tiene el enlace vivo del primero.
      const error = await prisma.credentialSetupToken
        .create({
          data: {
            userId: otro.id,
            tokenDigest: digest,
            expiresAt: credentialSetupLinkExpiresAt(now),
          },
        })
        .then(
          () => null,
          (caught: unknown) => caught,
        );

      expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      const conocido = error as Prisma.PrismaClientKnownRequestError;
      expect(conocido.code).toBe('P2002');
      // Aqui esta el valor del caso: el duplicado tambien es un `23505`, pero `meta.target` dice
      // OTRA columna. Si el caso de R11 se conformara con «hubo un duplicado», este escenario lo
      // satisfaria igual y la asercion no afirmaria nada.
      const objetivo = (conocido.meta as { readonly target?: unknown } | undefined)?.target;
      expect(objetivo).toEqual(['token_digest']);
      expect(objetivo).not.toEqual(['user_id']);

      // Nada se escribio: cada usuario sigue con lo que tenia.
      expect(liveTokensOf(await tokensOf(userId))).toHaveLength(1);
      expect(await tokensOf(otro.id)).toHaveLength(0);
    });
  });

  // Tres corridas seguidas: una carrera que pasa una vez de tres no esta cerrada.
  it.each([1, 2, 3])(
    'R11 — corrida %i: dos emisiones CONCURRENTES sobre dos conexiones dejan UN SOLO enlace vivo, y la perdedora recibe `superseded`',
    async () => {
      await withPendingUser(async ({ userId, email }) => {
        const now = new Date();
        // Un enlace vivo anterior: es la fila sobre la que las dos emisiones van a chocar en su
        // paso 1, y es lo que permite encolarlas a las dos antes de soltarlas a la vez.
        const anterior = createCredentialSetupSecret();
        await prisma.credentialSetupToken.create({
          data: {
            userId,
            tokenDigest: anterior.digest,
            expiresAt: credentialSetupLinkExpiresAt(now),
          },
        });

        const gate = createGate();
        const digestA = createCredentialSetupSecret().digest;
        const digestB = createCredentialSetupSecret().digest;

        // Tercera conexion: bloquea el enlace anterior y no lo suelta hasta que las dos emisiones
        // esten encoladas. Sin esto la carrera seria una apuesta (ver cabecera).
        const bloqueo = prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw(Prisma.sql`
              SELECT "id" FROM "credential_setup_tokens"
               WHERE "user_id" = ${userId}::uuid
                 AND "consumed_at" IS NULL AND "superseded_at" IS NULL
               FOR UPDATE
            `);
            await gate.opened;
          },
          { maxWait: 10_000, timeout: 10_000 },
        );

        const emitir = (adapter: LinkAdapter, digest: string) =>
          adapter.issueForPendingUser({
            userId,
            companyId: null,
            digest,
            expiresAt: credentialSetupLinkExpiresAt(now),
            now,
          });

        const carrera = Promise.all([emitir(adapterA, digestA), emitir(adapterB, digestB)]);
        await waitForLockWaiters(2);
        gate.open();
        await bloqueo;

        const [resultadoA, resultadoB] = await carrera;

        // Una gana —y devuelve el correo del destinatario— y la otra recibe `'superseded'`, que es
        // la traduccion del `23505` del indice parcial. Nunca las dos.
        const ganadoras = [resultadoA, resultadoB].filter(isIssued);
        expect(ganadoras).toHaveLength(1);
        expect(ganadoras[0]).toEqual({ email });
        expect([resultadoA, resultadoB].filter((resultado) => resultado === 'superseded')).toEqual([
          'superseded',
        ]);

        // Y el invariante, que es el requisito: UN SOLO enlace vivo, y es el de la ganadora.
        const filas = await tokensOf(userId);
        const vivos = liveTokensOf(filas);
        expect(vivos).toHaveLength(1);
        expect([digestA, digestB]).toContain((vivos[0] as RawTokenRow).token_digest);
        // El anterior murio sustituido, no borrado (R12): la tabla conserva el rastro.
        const previo = filas.find((fila) => fila.token_digest === anterior.digest);
        expect(previo?.superseded_at).toBeInstanceOf(Date);
        expect(filas).toHaveLength(2);
      });
    },
  );

  // -------------------------------------------------------------------------
  // R12, R20 — dos usos concurrentes del mismo enlace: gana exactamente uno
  // -------------------------------------------------------------------------

  it('R12, R20 — dos usos CONCURRENTES del mismo enlace: uno responde `ok`, el otro `invalid`, y el enlace queda consumido una sola vez', async () => {
    await withPendingUser(async ({ userId }) => {
      const { digest } = await issueLinkFor(adapterA, userId, new Date());

      const credencialA = `QC79-t20-Alfa-${randomUUID()}`;
      const credencialB = `QC79-t20-Beta-${randomUUID()}`;
      const [hashA, hashB] = await Promise.all([
        createPasswordHash(credencialA),
        createPasswordHash(credencialB),
      ]);
      const usadoEn = new Date();

      const [resultadoA, resultadoB] = await Promise.all([
        adapterA.applyCredentialAndActivate({
          digest,
          credentialHash: hashA,
          now: usadoEn,
        }),
        adapterB.applyCredentialAndActivate({
          digest,
          credentialHash: hashB,
          now: usadoEn,
        }),
      ]);

      expect([resultadoA, resultadoB].filter((resultado) => resultado === 'ok')).toEqual(['ok']);
      expect([resultadoA, resultadoB].filter((resultado) => resultado === 'invalid')).toEqual([
        'invalid',
      ]);

      // El enlace quedo consumido, con su instante, y sigue siendo UNO (nada se borra: R12).
      const filas = await tokensOf(userId);
      expect(filas).toHaveLength(1);
      const fila = filas[0] as RawTokenRow;
      expect(fila.consumed_at).toBeInstanceOf(Date);
      expect(fila.consumed_at?.getTime()).toBe(usadoEn.getTime());
      expect(fila.superseded_at).toBeNull();
      expect(liveTokensOf(filas)).toHaveLength(0);

      // Y la cuenta quedo con la credencial de UNA de las dos, nunca con las dos ni con ninguna.
      const usuario = await rawUser(userId);
      expect(usuario.account_status).toBe('active');
      const verificadas = await Promise.all([
        verifyPasswordHash(credencialA, usuario.password_hash),
        verifyPasswordHash(credencialB, usuario.password_hash),
      ]);
      expect(verificadas.filter(Boolean)).toHaveLength(1);
    });
  });

  it('R12, R22 — un segundo uso del mismo secreto, ya en serie, responde `invalid` y no vuelve a escribir', async () => {
    await withPendingUser(async ({ userId }) => {
      const { digest } = await issueLinkFor(adapterA, userId, new Date());
      const primeroEn = new Date();

      expect(
        await adapterA.applyCredentialAndActivate({
          digest,
          credentialHash: await createPasswordHash(`QC79-t20-Unica-${randomUUID()}`),
          now: primeroEn,
        }),
      ).toBe('ok');

      const antes = await rawUser(userId);
      const segundoEn = new Date(primeroEn.getTime() + 1_000);
      expect(
        await adapterA.applyCredentialAndActivate({
          digest,
          credentialHash: await createPasswordHash(`QC79-t20-Otra-${randomUUID()}`),
          now: segundoEn,
        }),
      ).toBe('invalid');

      // Ni la fila del usuario ni el instante de consumo se movieron.
      expect(await rawUser(userId)).toEqual(antes);
      const fila = (await tokensOf(userId))[0] as RawTokenRow;
      expect(fila.consumed_at?.getTime()).toBe(primeroEn.getTime());
    });
  });

  // -------------------------------------------------------------------------
  // R19, R21 — el camino feliz escribe las CUATRO cosas, y solo esas
  // -------------------------------------------------------------------------

  it('R19, R21 — el camino feliz escribe hash, `active`, el instante y el autor en NULL, y NO toca `must_change_credential`', async () => {
    await withPendingUser(async ({ userId }) => {
      const nacida = await rawUser(userId);
      // La cuenta nace en `pending` y con el centinela de T12.
      expect(nacida.account_status).toBe('pending');
      expect(nacida.password_hash).toBe(NO_CREDENTIAL_SENTINEL);

      const { digest } = await issueLinkFor(adapterA, userId, new Date());
      const credencial = `QC79-t20-Feliz-${randomUUID()}`;
      const usadoEn = new Date();

      expect(
        await adapterA.applyCredentialAndActivate({
          digest,
          credentialHash: await createPasswordHash(credencial),
          now: usadoEn,
        }),
      ).toBe('ok');

      const despues = await rawUser(userId);
      // 1. La credencial, y SOLO como hash: la que la persona escribio verifica contra ella.
      expect(await verifyPasswordHash(credencial, despues.password_hash)).toBe(true);
      expect(despues.password_hash).not.toBe(credencial);
      expect(despues.password_hash).not.toBe(NO_CREDENTIAL_SENTINEL);
      // 2. El estado. 3. El instante. 4. El autor VACIO: el `NULL` de QC-65 R10.
      expect(despues.account_status).toBe('active');
      expect(despues.account_status_changed_at.getTime()).toBe(usadoEn.getTime());
      expect(despues.account_status_changed_by).toBeNull();
      // R21: la marca con la que la cuenta nacio se queda EXACTAMENTE como estaba.
      expect(despues.must_change_credential).toBe(nacida.must_change_credential);

      // Y el enlace quedo consumido en la misma escritura (R12, R19).
      const fila = (await tokensOf(userId))[0] as RawTokenRow;
      expect(fila.consumed_at?.getTime()).toBe(usadoEn.getTime());
    });
  });

  // -------------------------------------------------------------------------
  // R19, R22 — borrado o ya activo: la transaccion revierte ENTERA
  // -------------------------------------------------------------------------

  it('R19, R22 — usuario BORRADO: responde `invalid`, el enlace NO queda consumido y la fila no cambia', async () => {
    await withPendingUser(async ({ userId }) => {
      const { digest } = await issueLinkFor(adapterA, userId, new Date());
      const borradoEn = new Date();
      await prisma.user.update({
        where: { id: userId },
        data: { deletedAt: borradoEn, updatedAt: borradoEn },
      });
      const antes = await rawUser(userId);

      expect(
        await adapterA.applyCredentialAndActivate({
          digest,
          credentialHash: await createPasswordHash(`QC79-t20-Borrado-${randomUUID()}`),
          now: new Date(),
        }),
      ).toBe('invalid');

      // La transaccion revirtio ENTERA: el `consumed_at` del paso 1 tampoco se confirmo.
      const fila = (await tokensOf(userId))[0] as RawTokenRow;
      expect(fila.consumed_at).toBeNull();
      expect(fila.superseded_at).toBeNull();
      expect(await rawUser(userId)).toEqual(antes);
      expect(antes.password_hash).toBe(NO_CREDENTIAL_SENTINEL);
    });
  });

  it('R19, R22 — usuario YA ACTIVO: responde `invalid`, el enlace NO queda consumido y la credencial que ya tenia sigue siendo la suya', async () => {
    await withPendingUser(async ({ userId }) => {
      const { digest } = await issueLinkFor(adapterA, userId, new Date());
      const activadoEn = new Date();
      const credencialPrevia = `QC79-t20-Previa-${randomUUID()}`;
      await prisma.user.update({
        where: { id: userId },
        data: {
          accountStatus: 'active',
          accountStatusChangedAt: activadoEn,
          passwordHash: await createPasswordHash(credencialPrevia),
          updatedAt: activadoEn,
        },
      });
      const antes = await rawUser(userId);

      expect(
        await adapterA.applyCredentialAndActivate({
          digest,
          credentialHash: await createPasswordHash(`QC79-t20-Tarde-${randomUUID()}`),
          now: new Date(),
        }),
      ).toBe('invalid');

      const fila = (await tokensOf(userId))[0] as RawTokenRow;
      expect(fila.consumed_at).toBeNull();
      const despues = await rawUser(userId);
      expect(despues).toEqual(antes);
      expect(await verifyPasswordHash(credencialPrevia, despues.password_hash)).toBe(true);
    });
  });

  it('R22 — un secreto que no corresponde a ningun enlace responde `invalid` sin tocar nada', async () => {
    await withPendingUser(async ({ userId }) => {
      const { digest } = await issueLinkFor(adapterA, userId, new Date());
      const antes = await rawUser(userId);
      const ajeno = createCredentialSetupSecret();
      expect(ajeno.digest).not.toBe(digest);

      expect(
        await adapterA.applyCredentialAndActivate({
          digest: ajeno.digest,
          credentialHash: await createPasswordHash(`QC79-t20-Ajena-${randomUUID()}`),
          now: new Date(),
        }),
      ).toBe('invalid');

      expect((await tokensOf(userId))[0]?.consumed_at).toBeNull();
      expect(await rawUser(userId)).toEqual(antes);
    });
  });

  // -------------------------------------------------------------------------
  // R4 (T12) — el centinela no verifica contra NADA
  // -------------------------------------------------------------------------

  it('R4 — el alta sin credencial escribe el centinela, y NINGUNA contrasena verifica contra el (ni la propia cadena centinela)', async () => {
    await withPendingUser(async ({ userId }) => {
      const fila = await rawUser(userId);
      expect(fila.password_hash).toBe(NO_CREDENTIAL_SENTINEL);

      // La lista incluye a proposito la propia cadena centinela, la vacia y una contrasena que si
      // cumpliria la politica: lo que se afirma es que la columna no es una credencial utilizable.
      const candidatas = [
        NO_CREDENTIAL_SENTINEL,
        '',
        ' ',
        '!',
        '*',
        'Contrasena-Valida-2026!',
        createCredentialSetupSecret().secret,
      ];
      const verificadas = await Promise.all(
        candidatas.map((candidata) => verifyPasswordHash(candidata, fila.password_hash)),
      );
      expect(verificadas).toEqual(candidatas.map(() => false));
    });
  });
});
