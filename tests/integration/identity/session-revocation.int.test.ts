/**
 * QC-23 T21 — el almacen de sesiones cerradas contra Postgres REAL (R9, R12, R28, R39, R40).
 *
 * QUE SE EJERCITA: el adaptador de produccion directamente, sin fachada y sin dobles —
 * `lib/modules/identity/adapters/driven/persistence/session-revocation-prisma.ts`, las dos
 * operaciones del puerto (`design.md > 6`)—. Lo que se prueba aqui es EXACTAMENTE lo que ningun
 * doble puede contestar, porque no vive en el codigo sino en el esquema y en la transaccion:
 *
 *   - que «un `sid` no se cierra dos veces» lo garantiza el INDICE UNICO
 *     `revoked_sessions_session_id_key` y no la disciplina del codigo, y que el `23505` se traduce
 *     a exito sin ningun `SELECT` previo de existencia (R12);
 *   - que la purga que va DENTRO de la transaccion borra solo las filas caducadas **de esa
 *     persona**: ni las vivas de esa persona ni las caducadas de otra (R39, R40);
 *   - que el sello escrito queda TRUNCADO AL SEGUNDO en la columna, que es lo que hace que la
 *     comparacion `iat <= sello` de R8/R9 funcione, porque `iat` viaja en segundos
 *     (`design.md > 2.3`);
 *   - que `stampAll` sobre otra empresa, sobre una fila borrada logicamente y sobre un id
 *     inexistente devuelve `'not_found'` **sin distinguirse**, porque el ambito vive en el `WHERE`
 *     del adaptador y no en el caso de uso (R28, `design.md > 5.2`).
 *
 * AISLAMIENTO: CONSTRUCCION PROPIA + LIMPIEZA PROPIA, el mismo patron y por el mismo motivo que
 * `user-crud.int.test.ts`, `credential-setup.int.test.ts` y `session-stamp-writes.int.test.ts`.
 * **Aqui no se puede usar el `$transaction` + senal de rollback de
 * `identity-constraints.int.test.ts`**: el adaptador abre SU PROPIA transaccion contra el cliente
 * global, asi que una llamada hecha «dentro» del callback de un `$transaction` del test correria en
 * otra conexion del pool y se quedaria esperando un bloqueo que tiene el propio test. Cada caso
 * fabrica su empresa con nombre irrepetible y la borra en un `finally`.
 *
 * EL ORDEN DE LA LIMPIEZA NO ES LIBRE, y esta ficha le anade un escalon:
 * `revoked_sessions_user_id_fkey` es `ON DELETE RESTRICT` (`design.md > 2.2`), asi que las filas
 * del REGISTRO se borran ANTES que los usuarios; despues los enlaces de QC-79
 * (`credential_setup_tokens_user_id_fkey`, tambien RESTRICT); despues hay que vaciar
 * `account_status_changed_by` (`users_account_status_changed_by_fkey`, QC-65 R12); despues los
 * usuarios; y solo entonces la empresa.
 *
 * IDEMPOTENTE ENTRE CORRIDAS, que es el criterio de hecho de T21: no queda ni una fila detras —lo
 * comprueba el `afterAll`—, ningun identificador es fijo (todos salen de `randomUUID()`) y ninguna
 * asercion mira el estado GLOBAL de una tabla. Los de integracion corren en serie pero no aislados
 * entre archivos (`vitest.config.mts`, `fileParallelism: false`): este archivo solo afirma sobre
 * SUS propias filas. Los roles base se REUTILIZAN, no se crean.
 *
 * EL «AHORA» NUNCA ES `new Date()` A SECAS: se inyecta un instante FIJO con milisegundos distintos
 * de cero a proposito, porque parte de lo que se afirma es que el sello quedo truncado al segundo.
 * Un `now` redondo dejaria ese caso verde aunque el truncado no existiera.
 *
 * SOBRE LOS ERRORES DE POSTGRES: aqui no se afirma sobre el TEXTO de ninguno —en esta maquina el
 * servidor responde en espanol—. El choque del indice unico no se observa como error en absoluto:
 * se observa como que la llamada NO lanza y la tabla no gano ninguna fila, que es el contrato de
 * R12. El NOMBRE del indice si se usa, pero en el `beforeAll` y leido de `pg_indexes`, donde es un
 * identificador de la base y no un mensaje traducible.
 *
 * NINGUNA CREDENCIAL REAL: `FAKE_CREDENTIAL_HASH` es un marcador evidentemente ficticio.
 *
 * SIN TESTS DE RLS: un test de RLS escrito con Prisma sale verde pase lo que pase, porque Prisma se
 * conecta como dueno de las tablas (`docs/architecture.md > Acceso a datos y autorizacion`). El RLS
 * forzado de R42 lo cierra `tests/guards/guard-rls-force.test.ts`.
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DOCUMENT_TYPE_CC, normalizeCompanyName } from '@/lib/modules/identity';
import {
  revokeSession,
  stampAll,
} from '@/lib/modules/identity/adapters/driven/persistence/session-revocation-prisma';
import { create } from '@/lib/modules/identity/adapters/driven/persistence/user-admin-prisma';
import { ROLE_OPERADOR } from '@/lib/modules/identity/domain/roles';
import { floorToSecond } from '@/lib/modules/identity/domain/session-revocation';
import { prisma } from '@/lib/shared/db/prisma';

import type { NewUser, NewUserCredential } from '@/lib/modules/identity/ports/user-admin-repository';

// ---------------------------------------------------------------------------
// Escenario propio
// ---------------------------------------------------------------------------

const FAKE_CREDENTIAL_HASH = {
  kind: 'hash',
  value: '$2b$10$marcador.de.prueba.qc23.t21.no.es.un.hash.real',
} as const satisfies NewUserCredential;

let operadorRoleId = '';

const createdCompanyIds = new Set<string>();

async function createCompany(): Promise<string> {
  const name = `QC23 T21 ${randomUUID()}`;
  const company = await prisma.company.create({
    data: { name, nameNormalized: normalizeCompanyName(name) },
    select: { id: true },
  });
  createdCompanyIds.add(company.id);
  return company.id;
}

/** Borra la empresa y todo lo suyo en el unico orden que respetan las FK (ver cabecera). */
async function dropCompany(companyId: string): Promise<void> {
  await prisma.revokedSession.deleteMany({ where: { user: { companyId } } });
  await prisma.credentialSetupToken.deleteMany({ where: { user: { companyId } } });
  await prisma.user.updateMany({ where: { companyId }, data: { accountStatusChangedBy: null } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
  createdCompanyIds.delete(companyId);
}

async function withCompany(body: (companyId: string) => Promise<void>): Promise<void> {
  const companyId = await createCompany();
  try {
    await body(companyId);
  } finally {
    await dropCompany(companyId);
  }
}

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

function documentNumberFrom(tag: string): string {
  return tag.replaceAll('-', '').slice(0, 20);
}

function newUserData(overrides: Partial<NewUser> = {}): NewUser {
  const tag = randomUUID();
  return {
    firstNames: 'QC23T21',
    lastNames: `Apellido${tag.slice(0, 8)}`,
    birthDate: new Date('1990-01-01T00:00:00.000Z'),
    email: `qc23.t21.${tag}@example.test`,
    phone: '000000000',
    documentTypeCode: DOCUMENT_TYPE_CC,
    documentNumber: documentNumberFrom(tag),
    username: `qc23.t21.${tag}`,
    roleId: operadorRoleId,
    ...overrides,
  };
}

/** Alta por el ADAPTADOR de QC-66. Falla el test si no crea. */
async function createUser(companyId: string): Promise<string> {
  const result = await create(
    companyId,
    newUserData(),
    FAKE_CREDENTIAL_HASH,
    'pending',
    new Date(),
  );
  if (typeof result === 'string') {
    throw new Error(`el alta no debia fallar, y devolvio \`${result}\``);
  }
  return result.id;
}

/**
 * El sello TAL COMO QUEDO EN LA COLUMNA. Se lee con SQL crudo y por su nombre en `snake_case`: lo
 * que promete `stampAll` es una columna de `users`, no un campo de un tipo de salida.
 */
async function stampOf(userId: string): Promise<Date> {
  const rows = await prisma.$queryRaw<ReadonlyArray<{ sessions_valid_from: Date }>>(Prisma.sql`
    SELECT "sessions_valid_from" FROM "users" WHERE "id" = ${userId}::uuid
  `);
  const row = rows[0];
  if (row === undefined) throw new Error(`no existe ninguna fila de \`users\` con id ${userId}`);
  return row.sessions_valid_from;
}

type RevokedRow = { sessionId: string; expiresAt: Date; revokedAt: Date };

/** Las filas del registro DE ESA PERSONA, en orden estable para que la asercion no dependa del plan. */
async function revokedRowsOf(userId: string): Promise<RevokedRow[]> {
  return prisma.revokedSession.findMany({
    where: { userId },
    select: { sessionId: true, expiresAt: true, revokedAt: true },
    orderBy: { expiresAt: 'asc' },
  });
}

async function sessionIdsOf(userId: string): Promise<string[]> {
  return (await revokedRowsOf(userId)).map((row) => row.sessionId);
}

/**
 * Siembra una fila del registro SIN pasar por el adaptador: es escenario, no comportamiento. Se
 * escribe con el cliente para poder poner una caducidad en el pasado, que es lo que el adaptador
 * nunca hace (la fila que inserta caduca siempre en el futuro).
 */
async function seedRevoked(userId: string, expiresAt: Date, revokedAt: Date): Promise<string> {
  const sessionId = randomUUID();
  await prisma.revokedSession.create({ data: { sessionId, userId, expiresAt, revokedAt } });
  return sessionId;
}

/**
 * Un instante con milisegundos NO nulos, para que el truncado al segundo sea observable.
 * `offsetMs` separa unos casos de otros dentro del mismo test sin depender del reloj de la maquina.
 */
function instantWithMillis(offsetMs = 0): Date {
  return new Date(Date.UTC(2026, 8, 12, 10, 30, 0, 437) + offsetMs);
}

const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

beforeAll(async () => {
  const operador = await prisma.role.findFirst({
    where: { name: ROLE_OPERADOR },
    select: { id: true },
  });
  if (operador === null) {
    throw new Error(
      `falta el rol base (${ROLE_OPERADOR}) en la base: corre \`pnpm run db:seed\` antes de ` +
        'correr este archivo.',
    );
  }
  operadorRoleId = operador.id;

  // La tabla y el INDICE UNICO de T1/T2. Si faltan, el mensaje dice QUE hacer en vez de fallar mas
  // adelante con un error de SQL que no se entiende. El indice no es un detalle de implementacion:
  // ES R12 (`design.md > 2.2`), asi que se comprueba por su nombre.
  const indices = await prisma.$queryRaw<ReadonlyArray<{ indexname: string }>>(Prisma.sql`
    SELECT "indexname" FROM "pg_indexes" WHERE "tablename" = 'revoked_sessions'
  `);
  const nombres = indices.map((fila) => fila.indexname);
  if (!nombres.includes('revoked_sessions_session_id_key')) {
    throw new Error(
      'falta la migracion de QC-23 (T2): no existe `revoked_sessions_session_id_key`. Corre ' +
        '`pnpm run db:migrate` contra la base de esta feature antes de correr este archivo. ' +
        `Indices encontrados: ${nombres.join(', ') || 'ninguno'}.`,
    );
  }
  expect(nombres).toContain('revoked_sessions_user_id_expires_at_idx');
});

afterAll(async () => {
  expect([...createdCompanyIds]).toEqual([]);
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// R12 — el `sid` es unico en el registro
// ---------------------------------------------------------------------------

describe('QC-23 T21 — cerrar dos veces la misma sesion (R12)', () => {
  it('el segundo cierre del MISMO `sid` no lanza y no duplica la fila', async () => {
    await withCompany(async (companyId) => {
      const userId = await createUser(companyId);
      const sessionId = randomUUID();
      const primerCierre = instantWithMillis();
      const expiresAt = new Date(primerCierre.getTime() + EIGHT_HOURS_MS);

      await revokeSession({ sessionId, userId, expiresAt, now: primerCierre });
      expect(await sessionIdsOf(userId)).toEqual([sessionId]);

      // El segundo cierre: mismo `sid`, otro instante. Choca contra
      // `revoked_sessions_session_id_key` y el adaptador traduce el `23505` a exito (R12).
      await expect(
        revokeSession({ sessionId, userId, expiresAt, now: instantWithMillis(5_000) }),
      ).resolves.toBeUndefined();

      const filas = await revokedRowsOf(userId);
      expect(filas).toHaveLength(1);
      // Y no reescribio nada: el cierre que vale es el PRIMERO. El segundo revierte entero, que es
      // exactamente lo que significa «ya estaba» (`session-revocation-prisma.ts`).
      expect(filas[0]?.revokedAt).toEqual(primerCierre);
    });
  });

  it('el `sid` es unico EN LA TABLA, no por persona: el choque tambien salta con otro usuario', async () => {
    await withCompany(async (companyId) => {
      const unaPersona = await createUser(companyId);
      const otraPersona = await createUser(companyId);
      const sessionId = randomUUID();
      const now = instantWithMillis();
      const expiresAt = new Date(now.getTime() + EIGHT_HOURS_MS);

      await revokeSession({ sessionId, userId: unaPersona, expiresAt, now });
      await expect(
        revokeSession({ sessionId, userId: otraPersona, expiresAt, now }),
      ).resolves.toBeUndefined();

      // La segunda llamada no escribio NADA: el indice unico es sobre `session_id` a secas, asi que
      // el registro no puede contener el mismo `sid` dos veces ni repartido entre dos personas. Sin
      // esta propiedad, la busqueda por indice unico de R11/R14 no podria devolver «0 o 1 fila».
      expect(await sessionIdsOf(unaPersona)).toEqual([sessionId]);
      expect(await sessionIdsOf(otraPersona)).toEqual([]);
    });
  });

  it('cerrar DOS sesiones distintas de la misma persona deja las dos filas (R20)', async () => {
    await withCompany(async (companyId) => {
      const userId = await createUser(companyId);
      const now = instantWithMillis();
      const expiresAt = new Date(now.getTime() + EIGHT_HOURS_MS);
      const movil = randomUUID();
      const oficina = randomUUID();

      await revokeSession({ sessionId: movil, userId, expiresAt, now });
      await revokeSession({ sessionId: oficina, userId, expiresAt, now: instantWithMillis(1_000) });

      // El contrapunto del caso anterior: «no duplica» no puede significar «no inserta nunca dos».
      expect((await sessionIdsOf(userId)).toSorted()).toEqual([movil, oficina].toSorted());
    });
  });
});

// ---------------------------------------------------------------------------
// R39 / R40 — la purga borra solo las caducadas DE ESA PERSONA
// ---------------------------------------------------------------------------

describe('QC-23 T21 — la purga perezosa, dentro de la transaccion (R39, R40)', () => {
  it('`revokeSession` borra las caducadas de esa persona, y solo esas', async () => {
    await withTwoCompanies(async (companyA, companyB) => {
      const persona = await createUser(companyA);
      const companera = await createUser(companyA);
      const ajena = await createUser(companyB);
      const now = instantWithMillis();
      const yaCaducada = new Date(now.getTime() - 1_000);
      const todaviaViva = new Date(now.getTime() + EIGHT_HOURS_MS);

      const caducadaPropia = await seedRevoked(persona, yaCaducada, yaCaducada);
      const vivaPropia = await seedRevoked(persona, todaviaViva, yaCaducada);
      const caducadaDeLaCompanera = await seedRevoked(companera, yaCaducada, yaCaducada);
      const caducadaAjena = await seedRevoked(ajena, yaCaducada, yaCaducada);

      const nuevoCierre = randomUUID();
      await revokeSession({
        sessionId: nuevoCierre,
        userId: persona,
        expiresAt: todaviaViva,
        now,
      });

      // De la persona: se fue la caducada y se quedaron la viva y la recien cerrada.
      expect((await sessionIdsOf(persona)).toSorted()).toEqual([vivaPropia, nuevoCierre].toSorted());
      expect(await sessionIdsOf(persona)).not.toContain(caducadaPropia);
      // De las demas no se toca NADA, ni de la misma empresa ni de otra: el `DELETE` esta acotado a
      // `user_id = ?` (R39). Una purga que se llevara filas ajenas seria una purga global
      // disfrazada, y esta tabla no tiene columna de empresa que la limite (R44).
      expect(await sessionIdsOf(companera)).toEqual([caducadaDeLaCompanera]);
      expect(await sessionIdsOf(ajena)).toEqual([caducadaAjena]);
    });
  });

  it('la caducada justo EN el instante del cierre tambien se va: el corte es `<=`', async () => {
    await withCompany(async (companyId) => {
      const userId = await createUser(companyId);
      const now = instantWithMillis();
      const enElLimite = await seedRevoked(userId, now, now);
      const unMsDespues = await seedRevoked(userId, new Date(now.getTime() + 1), now);

      await revokeSession({
        sessionId: randomUUID(),
        userId,
        expiresAt: new Date(now.getTime() + EIGHT_HOURS_MS),
        now,
      });

      const quedan = await sessionIdsOf(userId);
      // `expires_at <= now`: una sesion que caduca exactamente ahora ya no protege de nada.
      expect(quedan).not.toContain(enElLimite);
      expect(quedan).toContain(unMsDespues);
    });
  });

  it('`stampAll` purga igual, y el corte es el propio sello', async () => {
    await withTwoCompanies(async (companyA, companyB) => {
      const persona = await createUser(companyA);
      const ajena = await createUser(companyB);
      const sello = floorToSecond(instantWithMillis());
      const caducadaPropia = await seedRevoked(persona, new Date(sello.getTime() - 1_000), sello);
      const vivaPropia = await seedRevoked(
        persona,
        new Date(sello.getTime() + EIGHT_HOURS_MS),
        sello,
      );
      const caducadaAjena = await seedRevoked(ajena, new Date(sello.getTime() - 1_000), sello);

      expect(await stampAll({ userId: persona, companyId: companyA, validFrom: sello })).toBe('ok');

      expect(await sessionIdsOf(persona)).toEqual([vivaPropia]);
      expect(await sessionIdsOf(persona)).not.toContain(caducadaPropia);
      expect(await sessionIdsOf(ajena)).toEqual([caducadaAjena]);
    });
  });
});

// ---------------------------------------------------------------------------
// R9 / design.md § 2.3 — el sello queda truncado al segundo EN LA COLUMNA
// ---------------------------------------------------------------------------

describe('QC-23 T21 — el sello escrito queda truncado al segundo (R9, `design.md > 2.3`)', () => {
  it('`stampAll` deja en la columna el instante sin milisegundos, y exactamente ese', async () => {
    await withCompany(async (companyId) => {
      const userId = await createUser(companyId);
      const conMilisegundos = instantWithMillis(); // …:00.437
      const sello = floorToSecond(conMilisegundos);

      expect(await stampAll({ userId, companyId, validFrom: sello })).toBe('ok');

      const columna = await stampOf(userId);
      // 1. Sin milisegundos: la columna es `TIMESTAMPTZ(6)` y guardaria los 437 ms sin protestar.
      expect(columna.getMilliseconds()).toBe(0);
      // 2. Y es EXACTAMENTE el instante que se pidio: Postgres no lo redondeo al segundo siguiente
      //    ni lo movio de zona horaria por el camino.
      expect(columna).toEqual(sello);
      expect(columna).not.toEqual(conMilisegundos);
      // 3. Lo que todo esto compra, dicho en la unidad en la que viaja `iat` (segundos, firmados):
      //    el sello leido de la base y el `iat` de una sesion emitida en ese mismo segundo son el
      //    MISMO numero, asi que la comparacion `iat <= sello` de R8/R9 la corta —en vez de dejarla
      //    viva por 437 ms de nada, que es el agujero que cierra `design.md > 2.3`—.
      const selloEnSegundos = columna.getTime() / 1000;
      expect(Number.isInteger(selloEnSegundos)).toBe(true);
      expect(Math.floor(conMilisegundos.getTime() / 1000)).toBe(selloEnSegundos);
    });
  });

  it('el sello que escribe `stampAll` sustituye al que traia la fila, y solo el de esa persona', async () => {
    await withCompany(async (companyId) => {
      const persona = await createUser(companyId);
      const companera = await createUser(companyId);
      const selloAnteriorDeLaCompanera = await stampOf(companera);
      const sello = floorToSecond(instantWithMillis(90_000));

      expect(await stampAll({ userId: persona, companyId, validFrom: sello })).toBe('ok');

      expect(await stampOf(persona)).toEqual(sello);
      // El sello es POR USUARIO (R24, `design.md > 5.2`): cerrar todas las de alguien no toca a
      // nadie mas de su empresa.
      expect(await stampOf(companera)).toEqual(selloAnteriorDeLaCompanera);
    });
  });
});

// ---------------------------------------------------------------------------
// R28 — los tres «no encontrada», sin distinguirse
// ---------------------------------------------------------------------------

describe('QC-23 T21 — `stampAll` fuera de ambito devuelve `not_found` (R28)', () => {
  it('sobre una persona de OTRA empresa: `not_found`, y no escribe ni el sello ni la purga', async () => {
    await withTwoCompanies(async (companyA, companyB) => {
      const persona = await createUser(companyA);
      const selloAnterior = await stampOf(persona);
      const caducada = await seedRevoked(
        persona,
        new Date(instantWithMillis().getTime() - 1_000),
        instantWithMillis(),
      );

      // El llamante es de la empresa B y apunta a alguien de la A.
      const resultado = await stampAll({
        userId: persona,
        companyId: companyB,
        validFrom: floorToSecond(instantWithMillis()),
      });

      expect(resultado).toBe('not_found');
      expect(await stampOf(persona)).toEqual(selloAnterior);
      // Si el sello no sube, no se purga nada: quien no alcanza a esta persona no le borra filas.
      expect(await sessionIdsOf(persona)).toEqual([caducada]);
    });
  });

  it('sobre una fila BORRADA logicamente: `not_found`, y no escribe nada', async () => {
    await withCompany(async (companyId) => {
      const persona = await createUser(companyId);
      await prisma.user.update({
        where: { id: persona },
        data: { deletedAt: instantWithMillis(-60_000) },
      });
      const selloAnterior = await stampOf(persona);
      const caducada = await seedRevoked(
        persona,
        new Date(instantWithMillis().getTime() - 1_000),
        instantWithMillis(),
      );

      const resultado = await stampAll({
        userId: persona,
        companyId,
        validFrom: floorToSecond(instantWithMillis()),
      });

      expect(resultado).toBe('not_found');
      expect(await stampOf(persona)).toEqual(selloAnterior);
      expect(await sessionIdsOf(persona)).toEqual([caducada]);
    });
  });

  it('sobre un id INEXISTENTE: `not_found`, sin lanzar', async () => {
    await withCompany(async (companyId) => {
      const resultado = await stampAll({
        userId: randomUUID(),
        companyId,
        validFrom: floorToSecond(instantWithMillis()),
      });

      // Ni un error de fila no encontrada ni un `update` que lanza: `updateMany` devuelve `count: 0`
      // y el adaptador lo traduce (`design.md > 5.2`).
      expect(resultado).toBe('not_found');
    });
  });

  it('los TRES casos son indistinguibles desde fuera del adaptador', async () => {
    await withTwoCompanies(async (companyA, companyB) => {
      const deOtraEmpresa = await createUser(companyA);
      const borrada = await createUser(companyB);
      await prisma.user.update({
        where: { id: borrada },
        data: { deletedAt: instantWithMillis(-60_000) },
      });
      const validFrom = floorToSecond(instantWithMillis());

      const resultados = await Promise.all([
        stampAll({ userId: deOtraEmpresa, companyId: companyB, validFrom }),
        stampAll({ userId: borrada, companyId: companyB, validFrom }),
        stampAll({ userId: randomUUID(), companyId: companyB, validFrom }),
      ]);

      // El mismo valor, sin matices: el dominio los traduce todos al mismo `UserNotFoundError` y no
      // puede distinguirlos ni queriendo. Eso es R28 — decir cual de los tres fue le contaria a
      // quien pregunta si esa persona existe en otra empresa.
      expect(resultados).toEqual(['not_found', 'not_found', 'not_found']);
      expect(new Set(resultados).size).toBe(1);
    });
  });
});
