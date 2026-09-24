/**
 * QC-23 T14 y T15 — el sello «sesiones validas desde» sube DENTRO de las transacciones que ya
 * existen, contra Postgres REAL (R30, R32, R33, R34, R35, R36, R37, R38).
 *
 * QUE SE EJERCITA: los adaptadores de produccion directamente, sin fachada y sin dobles —
 * `user-admin-prisma.ts` (`applyGuardedChange` y `updateAliveInCompany`, QC-66) y
 * `credential-setup-link-prisma.ts` (`applyCredentialAndActivate`, QC-79)—. Un doble no puede
 * contestar lo unico que esta ficha promete aqui: que el sello y el cambio viajan en el **MISMO
 * `UPDATE`** y en la **MISMA transaccion**, asi que lo que se afirma es siempre la COLUMNA
 * `users.sessions_valid_from` leida con SQL crudo despues de la operacion, nunca un tipo de salida.
 *
 * **R38 se prueba por su lado dificil**: cuando la transaccion aborta por `last_administrator`, el
 * sello NO cambio. Ese caso es la unica forma de distinguir «el sello sube dentro» de «el sello
 * sube al lado», y es justamente por lo que el diseno descarto un caso de uso «revocar» aparte
 * (`design.md > 5.5`).
 *
 * **R37 se prueba entero, no solo su primera mitad**: bloquear sube el sello, y devolver la cuenta
 * a `active` NO lo baja ni lo toca. Eso es lo que hace que el corte sea DURADERO: reactivar una
 * cuenta no revive las cookies que quedaron por ahi.
 *
 * AISLAMIENTO: CONSTRUCCION PROPIA + LIMPIEZA PROPIA, el mismo patron y por el mismo motivo que
 * `user-crud.int.test.ts` y `last-administrator.int.test.ts`. **Aqui no se puede usar el
 * `$transaction` + senal de rollback de `identity-constraints.int.test.ts`**: los dos adaptadores
 * abren SU PROPIA transaccion contra el cliente global, asi que una llamada hecha «dentro» del
 * callback de un `$transaction` del test correria en otra conexion del pool y se quedaria esperando
 * un bloqueo que tiene el propio test. Cada caso fabrica su empresa con nombre irrepetible y la
 * borra en un `finally`.
 *
 * EL ORDEN DE LA LIMPIEZA NO ES LIBRE: `credential_setup_tokens_user_id_fkey` y
 * `users_account_status_changed_by_fkey` son `ON DELETE RESTRICT`, asi que primero los enlaces,
 * despues la referencia al autor del cambio de estado, despues los usuarios y solo entonces la
 * empresa. Mismo orden que razonan `dropCompany` en `credential-setup.int.test.ts` y
 * `user-crud.int.test.ts`.
 *
 * LA BASE LOCAL NO ESTA VACIA: trae la instalacion del seed. Este archivo NO afirma sobre el estado
 * global de ninguna tabla —los de integracion corren en serie pero no aislados entre archivos
 * (`vitest.config.mts`, `fileParallelism: false`)—: solo sobre SUS propias filas. Los dos roles se
 * REUTILIZAN, no se crean.
 *
 * EL «AHORA» NUNCA ES `new Date()` A SECAS en las aserciones: se inyecta un instante con
 * milisegundos distintos de cero a proposito, porque lo que se afirma es que la columna quedo
 * TRUNCADA AL SEGUNDO (`floorToSecond`, `design.md > 2.3`). Un `now` redondo dejaria el test verde
 * aunque el truncado no existiera.
 *
 * NINGUNA CREDENCIAL REAL: `FAKE_CREDENTIAL_HASH` es un marcador evidentemente ficticio.
 *
 * SIN TESTS DE RLS: un test de RLS escrito con Prisma sale verde pase lo que pase, porque Prisma se
 * conecta como dueno de las tablas (`docs/architecture.md > Acceso a datos y autorizacion`).
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DOCUMENT_TYPE_CC, normalizeCompanyName } from '@/lib/modules/identity';
import {
  applyCredentialAndActivate,
  issueForPendingUser,
} from '@/lib/modules/identity/adapters/driven/persistence/credential-setup-link-prisma';
import {
  applyGuardedChange,
  create,
  updateAliveInCompany,
} from '@/lib/modules/identity/adapters/driven/persistence/user-admin-prisma';
import { createCredentialSetupSecret } from '@/lib/modules/identity/adapters/driven/security/credential-setup-secret-crypto';
import { clearedLockState } from '@/lib/modules/identity/domain/effective-account-status';
import { ROLE_ADMINISTRADOR, ROLE_OPERADOR } from '@/lib/modules/identity/domain/roles';
import { floorToSecond } from '@/lib/modules/identity/domain/session-revocation';
import { prisma } from '@/lib/shared/db/prisma';

import type { UserAccountStatus } from '@/lib/modules/identity/domain/account-status';
import type { NewUser, NewUserCredential } from '@/lib/modules/identity/ports/user-admin-repository';

// ---------------------------------------------------------------------------
// Escenario propio
// ---------------------------------------------------------------------------

const FAKE_CREDENTIAL_HASH = {
  kind: 'hash',
  value: '$2b$10$marcador.de.prueba.qc23.t14.no.es.un.hash.real',
} as const satisfies NewUserCredential;

/** El hash que escribe el enlace de QC-79 en el caso de T15. Tambien ficticio. */
const FAKE_LINK_HASH = '$2b$10$marcador.de.prueba.qc23.t15.no.es.un.hash.real';

let operadorRoleId = '';
let administradorRoleId = '';

const createdCompanyIds = new Set<string>();

async function createCompany(): Promise<string> {
  const name = `QC23 T14 ${randomUUID()}`;
  const company = await prisma.company.create({
    data: { name, nameNormalized: normalizeCompanyName(name) },
    select: { id: true },
  });
  createdCompanyIds.add(company.id);
  return company.id;
}

/** Borra la empresa y todo lo suyo en el unico orden que respetan las FK (ver cabecera). */
async function dropCompany(companyId: string): Promise<void> {
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

function documentNumberFrom(tag: string): string {
  return tag.replaceAll('-', '').slice(0, 20);
}

function newUserData(overrides: Partial<NewUser> = {}): NewUser {
  const tag = randomUUID();
  return {
    firstNames: 'QC23T14',
    lastNames: `Apellido${tag.slice(0, 8)}`,
    birthDate: new Date('1990-01-01T00:00:00.000Z'),
    email: `qc23.t14.${tag}@example.test`,
    phone: '000000000',
    documentTypeCode: DOCUMENT_TYPE_CC,
    documentNumber: documentNumberFrom(tag),
    username: `qc23.t14.${tag}`,
    roleId: operadorRoleId,
    ...overrides,
  };
}

/** Alta por el ADAPTADOR. Falla el test si no crea. */
async function createUser(
  companyId: string,
  data: NewUser,
  credential: NewUserCredential = FAKE_CREDENTIAL_HASH,
): Promise<string> {
  const result = await create(companyId, data, credential, 'pending', new Date());
  if (typeof result === 'string') {
    throw new Error(`el alta no debia fallar, y devolvio \`${result}\``);
  }
  return result.id;
}

/**
 * Alta DIRECTA al escenario, saltando el adaptador: solo para los casos que necesitan que la fila
 * NAZCA como administrador (R38 y QC-95 R3), porque desde el fix directo del 2026-09-22 el
 * adaptador responde `'action_not_allowed'` a ese rol y estos casos necesitan un administrador de
 * verdad para que la guardia de R22 tenga algo que abortar.
 */
async function createUserRaw(companyId: string, data: NewUser): Promise<string> {
  const created = await prisma.user.create({
    data: {
      firstNames: data.firstNames,
      lastNames: data.lastNames,
      birthDate: data.birthDate,
      email: data.email,
      phone: data.phone,
      documentTypeCode: data.documentTypeCode,
      documentNumber: data.documentNumber,
      username: data.username,
      passwordHash: FAKE_CREDENTIAL_HASH.value,
      roleId: data.roleId,
      companyId,
    },
    select: { id: true },
  });
  return created.id;
}

/**
 * El sello TAL COMO QUEDO EN LA COLUMNA. Se lee con SQL crudo y por su nombre en `snake_case`: lo
 * que esta ficha promete es una columna, no un campo de un tipo de salida.
 */
async function stampOf(userId: string): Promise<Date> {
  const rows = await prisma.$queryRaw<ReadonlyArray<{ sessions_valid_from: Date }>>(Prisma.sql`
    SELECT "sessions_valid_from" FROM "users" WHERE "id" = ${userId}::uuid
  `);
  const row = rows[0];
  if (row === undefined) throw new Error(`no existe ninguna fila de \`users\` con id ${userId}`);
  return row.sessions_valid_from;
}

/**
 * Un instante con milisegundos NO nulos, para que el truncado al segundo sea observable. `offsetMs`
 * separa unos casos de otros dentro del mismo test sin depender del reloj.
 */
function instantWithMillis(offsetMs = 0): Date {
  return new Date(Date.UTC(2026, 8, 12, 10, 30, 0, 437) + offsetMs);
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

beforeAll(async () => {
  const roles = await prisma.role.findMany({
    where: { name: { in: [ROLE_ADMINISTRADOR, ROLE_OPERADOR] } },
    select: { id: true, name: true },
  });
  const administrador = roles.find((role) => role.name === ROLE_ADMINISTRADOR);
  const operador = roles.find((role) => role.name === ROLE_OPERADOR);
  if (administrador === undefined || operador === undefined) {
    throw new Error(
      `faltan los roles base (${ROLE_ADMINISTRADOR} / ${ROLE_OPERADOR}) en la base: corre ` +
        '`pnpm run db:seed` antes de correr este archivo.',
    );
  }
  administradorRoleId = administrador.id;
  operadorRoleId = operador.id;

  // La columna de T1/T2. Si falta, el mensaje dice QUE hacer en vez de fallar con un error de SQL.
  const columnas = await prisma.$queryRaw<ReadonlyArray<{ column_name: string }>>(Prisma.sql`
    SELECT "column_name" FROM "information_schema"."columns"
    WHERE "table_name" = 'users' AND "column_name" = 'sessions_valid_from'
  `);
  if (columnas.length === 0) {
    throw new Error(
      'falta la migracion de QC-23 (T2): `users.sessions_valid_from` no existe. Corre ' +
        '`pnpm run db:migrate` contra la base de esta feature antes de correr este archivo.',
    );
  }
});

afterAll(async () => {
  expect([...createdCompanyIds]).toEqual([]);
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// T14 — `applyGuardedChange`: el estado de cuenta y el borrado
// ---------------------------------------------------------------------------

describe('QC-23 T14 — el estado de cuenta sube el sello dentro de su propia transaccion', () => {
  /** Las CUATRO transiciones de estado, en un solo sitio: dos cortan (R33) y dos no (R36). */
  const TRANSICIONES: ReadonlyArray<{
    readonly next: UserAccountStatus;
    readonly corta: boolean;
    readonly motivo: string;
  }> = [
    { next: 'blocked', corta: true, motivo: 'R33: una cuenta bloqueada no puede seguir dentro' },
    { next: 'inactive', corta: true, motivo: 'R33: una cuenta inactiva tampoco' },
    { next: 'pending', corta: false, motivo: 'R36: una cuenta pendiente nunca llego a tener sesion' },
    { next: 'active', corta: false, motivo: 'R36: activar no puede echar a quien acaba de entrar' },
  ];

  for (const transicion of TRANSICIONES) {
    it(`mover a \`${transicion.next}\` ${transicion.corta ? 'SUBE' : 'NO toca'} el sello — ${transicion.motivo}`, async () => {
      await withCompany(async (companyId) => {
        const actorId = await createUser(companyId, newUserData());
        const targetId = await createUser(companyId, newUserData());
        const antes = await stampOf(targetId);
        const now = instantWithMillis();

        const outcome = await applyGuardedChange({
          kind: 'account_status',
          companyId,
          id: targetId,
          adminRoleName: ROLE_ADMINISTRADOR,
          now,
          accountStatus: transicion.next,
          changedBy: actorId,
          lockState: transicion.next === 'blocked' ? null : clearedLockState(),
        });
        expect(outcome).toBe('ok');

        const despues = await stampOf(targetId);
        if (transicion.corta) {
          // Truncado al segundo: `now` trae 437 ms y la columna NO puede traerlos.
          expect(despues).toEqual(floorToSecond(now));
          expect(despues.getMilliseconds()).toBe(0);
        } else {
          expect(despues).toEqual(antes);
        }
      });
    });
  }

  it('borrar a una persona sube el sello (R34), en el mismo `UPDATE` que `deleted_at`', async () => {
    await withCompany(async (companyId) => {
      const targetId = await createUser(companyId, newUserData());
      const now = instantWithMillis();

      const outcome = await applyGuardedChange({
        kind: 'delete',
        companyId,
        id: targetId,
        adminRoleName: ROLE_ADMINISTRADOR,
        now,
      });
      expect(outcome).toBe('ok');

      const rows = await prisma.$queryRaw<
        ReadonlyArray<{ deleted_at: Date | null; sessions_valid_from: Date }>
      >(Prisma.sql`
        SELECT "deleted_at", "sessions_valid_from" FROM "users" WHERE "id" = ${targetId}::uuid
      `);
      // Las dos columnas, de la misma fila y de la misma sentencia: o estan las dos o no esta
      // ninguna. Eso es R38 visto desde el resultado.
      expect(rows[0]?.deleted_at).toEqual(now);
      expect(rows[0]?.sessions_valid_from).toEqual(floorToSecond(now));
    });
  });

  it('R37: reactivar una cuenta bloqueada NO revive sus sesiones — el sello se queda donde estaba', async () => {
    await withCompany(async (companyId) => {
      const actorId = await createUser(companyId, newUserData());
      const targetId = await createUser(companyId, newUserData());
      const bloqueo = instantWithMillis();
      const reactivacion = instantWithMillis(60_000);

      await applyGuardedChange({
        kind: 'account_status',
        companyId,
        id: targetId,
        adminRoleName: ROLE_ADMINISTRADOR,
        now: bloqueo,
        accountStatus: 'blocked',
        changedBy: actorId,
        lockState: null,
      });
      const trasBloquear = await stampOf(targetId);
      expect(trasBloquear).toEqual(floorToSecond(bloqueo));

      await applyGuardedChange({
        kind: 'account_status',
        companyId,
        id: targetId,
        adminRoleName: ROLE_ADMINISTRADOR,
        now: reactivacion,
        accountStatus: 'active',
        changedBy: actorId,
        lockState: clearedLockState(),
      });

      // Ni sube ni baja: las cookies emitidas antes del bloqueo siguen muertas para siempre. Ese es
      // todo el contenido de R37 —el corte inmediato ya existia; lo que esta ficha anade es que sea
      // DURADERO—.
      expect(await stampOf(targetId)).toEqual(trasBloquear);
    });
  });

  it('R38: si la transaccion aborta por `last_administrator`, el sello NO cambio', async () => {
    await withCompany(async (companyId) => {
      // Un unico administrador ACTIVO en la empresa: bloquearlo deja a la empresa sin ninguno, y la
      // guarda de QC-66 R22 aborta la transaccion ANTES de escribir. Nace DIRECTO en el escenario:
      // el adaptador ya no concede el rol administrador (fix directo, `action_not_allowed`).
      const adminId = await createUserRaw(companyId, newUserData({ roleId: administradorRoleId }));
      await prisma.user.update({ where: { id: adminId }, data: { accountStatus: 'active' } });
      const antes = await stampOf(adminId);

      const outcome = await applyGuardedChange({
        kind: 'account_status',
        companyId,
        id: adminId,
        adminRoleName: ROLE_ADMINISTRADOR,
        now: instantWithMillis(),
        accountStatus: 'blocked',
        changedBy: adminId,
        lockState: null,
      });
      expect(outcome).toBe('last_administrator');

      // Esta es la asercion que distingue «el sello sube DENTRO» de «el sello sube al lado»: si
      // fuera una segunda escritura, aqui el sello habria subido con la cuenta intacta.
      expect(await stampOf(adminId)).toEqual(antes);
      expect(
        (await prisma.user.findFirstOrThrow({ where: { id: adminId }, select: { accountStatus: true } }))
          .accountStatus,
      ).toBe('active');
    });
  });

  it('un objetivo de otra empresa no escribe nada: ni el estado ni el sello', async () => {
    const companyA = await createCompany();
    const companyB = await createCompany();
    try {
      const targetId = await createUser(companyA, newUserData());
      const antes = await stampOf(targetId);
      const actorId = await createUser(companyB, newUserData());

      const outcome = await applyGuardedChange({
        kind: 'account_status',
        companyId: companyB,
        id: targetId,
        adminRoleName: ROLE_ADMINISTRADOR,
        now: instantWithMillis(),
        accountStatus: 'blocked',
        changedBy: actorId,
        lockState: null,
      });
      expect(outcome).toBe('not_found');
      expect(await stampOf(targetId)).toEqual(antes);
    } finally {
      await dropCompany(companyB);
      await dropCompany(companyA);
    }
  });
});

// ---------------------------------------------------------------------------
// T14 — `updateAliveInCompany`: el cambio de rol
// ---------------------------------------------------------------------------

describe('QC-23 T14 — el cambio de rol sube el sello dentro de la edicion', () => {
  it('R35: cambiar el rol DE VERDAD sube el sello, en el mismo `UPDATE` que los nueve campos', async () => {
    await withCompany(async (companyId) => {
      // ENMENDADO por el fix directo (2026-09-22): el adaptador ya no concede el rol administrador,
      // asi que el cambio DE VERDAD de rol se prueba en la direccion que sigue siendo legal: quien
      // nacio administrador deja de serlo. Dos administradores ACTIVOS —nacidos directo en el
      // escenario— porque con uno solo `updateAliveInCompany` responderia `last_administrator` (R22)
      // y la edicion no llegaria a escribir el sello.
      const data = newUserData();
      const targetId = await createUserRaw(companyId, { ...data, roleId: administradorRoleId });
      await createUserRaw(companyId, { ...newUserData(), roleId: administradorRoleId });
      await prisma.user.updateMany({
        where: { companyId },
        data: { accountStatus: 'active' },
      });
      const now = instantWithMillis();

      const outcome = await updateAliveInCompany(
        companyId,
        targetId,
        { ...data, roleId: operadorRoleId },
        now,
      );
      expect(outcome).toBe('ok');
      expect(await stampOf(targetId)).toEqual(floorToSecond(now));
    });
  });

  it('R35: reescribir el MISMO rol no corta nada — R19 de QC-66 es reemplazo completo', async () => {
    await withCompany(async (companyId) => {
      const data = newUserData();
      const targetId = await createUser(companyId, data);
      const antes = await stampOf(targetId);

      // Una edicion ordinaria: cambia el telefono y reescribe el mismo `role_id`. Si esto subiera
      // el sello, corregir un telefono echaria a la persona de todos sus dispositivos.
      const outcome = await updateAliveInCompany(
        companyId,
        targetId,
        { ...data, phone: '111111111' },
        instantWithMillis(),
      );
      expect(outcome).toBe('ok');
      expect(await stampOf(targetId)).toEqual(antes);

      const fila = await prisma.user.findFirstOrThrow({
        where: { id: targetId },
        select: { phone: true },
      });
      // La edicion SI se escribio: el «no subio el sello» no es que no se hiciera nada.
      expect(fila.phone).toBe('111111111');
    });
  });

  it('una edicion sobre un usuario borrado no escribe nada, tampoco el sello', async () => {
    await withCompany(async (companyId) => {
      const data = newUserData();
      const targetId = await createUser(companyId, data);
      await applyGuardedChange({
        kind: 'delete',
        companyId,
        id: targetId,
        adminRoleName: ROLE_ADMINISTRADOR,
        now: instantWithMillis(),
      });
      const antes = await stampOf(targetId);

      const outcome = await updateAliveInCompany(
        companyId,
        targetId,
        // Una edicion ordinaria —sin pedir el rol administrador—: el objetivo ya no existe, y el
        // `where` del `UPDATE` responde `'not_found'` sin escribir nada.
        { ...data, phone: '111111111' },
        instantWithMillis(120_000),
      );
      expect(outcome).toBe('not_found');
      expect(await stampOf(targetId)).toEqual(antes);
    });
  });
});

// ---------------------------------------------------------------------------
// T15 — el enlace de QC-79
// ---------------------------------------------------------------------------

describe('QC-23 T15 — establecer la contrasena por el enlace sube el sello (R30, R32)', () => {
  it('tras consumir el enlace, el sello quedo en el instante del consumo', async () => {
    await withCompany(async (companyId) => {
      const targetId = await createUser(companyId, newUserData(), { kind: 'none' });
      const antes = await stampOf(targetId);
      const { digest } = createCredentialSetupSecret();
      const emision = instantWithMillis();

      const issued = await issueForPendingUser({
        userId: targetId,
        companyId: null,
        digest,
        expiresAt: new Date(emision.getTime() + 3_600_000),
        now: emision,
      });
      expect(issued).not.toBe('not_found');

      const consumo = instantWithMillis(30_000);
      expect(
        await applyCredentialAndActivate({ digest, credentialHash: FAKE_LINK_HASH, now: consumo }),
      ).toBe('ok');

      const despues = await stampOf(targetId);
      expect(despues).toEqual(floorToSecond(consumo));
      expect(despues.getMilliseconds()).toBe(0);
      // Y cambio: el sello con el que nacio la fila (`@default(now())`, el reloj de la base) no es
      // el del consumo. No se compara «mayor que» a proposito: el instante inyectado es un valor
      // FIJO del escenario, no el reloj de la maquina, y ordenarlos contra `now()` seria atar el
      // test a la hora a la que se corre.
      expect(despues).not.toEqual(antes);

      // Y la escritura del hash y la del sello son la MISMA sentencia: la cuenta quedo activa.
      const fila = await prisma.user.findFirstOrThrow({
        where: { id: targetId },
        select: { accountStatus: true, passwordHash: true },
      });
      expect(fila.accountStatus).toBe('active');
      expect(fila.passwordHash).toBe(FAKE_LINK_HASH);
    });
  });

  it('R38: si el consumo REVIERTE, ni la contrasena ni el sello quedaron escritos', async () => {
    await withCompany(async (companyId) => {
      const targetId = await createUser(companyId, newUserData(), { kind: 'none' });
      const { digest } = createCredentialSetupSecret();
      const emision = instantWithMillis();

      await issueForPendingUser({
        userId: targetId,
        companyId: null,
        digest,
        expiresAt: new Date(emision.getTime() + 3_600_000),
        now: emision,
      });

      // Entre el correo y el clic, el administrador borra la cuenta: el `WHERE` del paso 2 no
      // encaja y la transaccion revierte ENTERA (QC-79 R19).
      await applyGuardedChange({
        kind: 'delete',
        companyId,
        id: targetId,
        adminRoleName: ROLE_ADMINISTRADOR,
        now: instantWithMillis(10_000),
      });
      const antes = await stampOf(targetId);

      expect(
        await applyCredentialAndActivate({
          digest,
          credentialHash: FAKE_LINK_HASH,
          now: instantWithMillis(30_000),
        }),
      ).toBe('invalid');

      // El sello se quedo en el del borrado, no en el del consumo fallido.
      expect(await stampOf(targetId)).toEqual(antes);
      const fila = await prisma.user.findFirstOrThrow({
        where: { id: targetId },
        select: { passwordHash: true },
      });
      expect(fila.passwordHash).not.toBe(FAKE_LINK_HASH);
    });
  });
});

// ---------------------------------------------------------------------------
// QC-95 — al salir de `blocked`, la misma escritura limpia los contadores (R1, R2, R3)
// ---------------------------------------------------------------------------

describe('QC-95 — el cambio de estado escribe los contadores de bloqueo en el MISMO `UPDATE` (R1, R2, R3)', () => {
  it('R1/R3: mover a `active` limpia los tres contadores en la misma escritura', async () => {
    await withCompany(async (companyId) => {
      const actorId = await createUser(companyId, newUserData());
      const targetId = await createUser(companyId, newUserData());

      // Un estado de bloqueo «suelto» que el desbloqueo administrativo tiene que retirar: lo que
      // dejaria la politica de intentos de QC-19 si nadie lo limpiara.
      await prisma.user.update({
        where: { id: targetId },
        data: {
          failedLoginAttempts: 3,
          lockLevel: 2,
          lockedUntil: new Date('2099-01-01T00:00:00.000Z'),
        },
      });

      const outcome = await applyGuardedChange({
        kind: 'account_status',
        companyId,
        id: targetId,
        adminRoleName: ROLE_ADMINISTRADOR,
        now: instantWithMillis(),
        accountStatus: 'active',
        changedBy: actorId,
        lockState: clearedLockState(),
      });
      expect(outcome).toBe('ok');

      // La fila releida: estado y los tres contadores, de la misma escritura (R3). Un
      // `locked_until` futuro que sobreviva dejaria la cuenta efectivamente `blocked` (QC-78 R11):
      // aqui no queda.
      const fila = await prisma.user.findFirstOrThrow({
        where: { id: targetId },
        select: {
          accountStatus: true,
          failedLoginAttempts: true,
          lockLevel: true,
          lockedUntil: true,
        },
      });
      expect(fila.accountStatus).toBe('active');
      expect(fila.failedLoginAttempts).toBe(0);
      expect(fila.lockLevel).toBe(0);
      expect(fila.lockedUntil).toBeNull();
    });
  });

  it('R2: mover a `blocked` NO toca los contadores, aunque se escriba el estado', async () => {
    await withCompany(async (companyId) => {
      const actorId = await createUser(companyId, newUserData());
      const targetId = await createUser(companyId, newUserData());
      const bloqueado = {
        failedLoginAttempts: 4,
        lockLevel: 3,
        lockedUntil: new Date('2099-06-01T00:00:00.000Z'),
      };

      await prisma.user.update({ where: { id: targetId }, data: bloqueado });

      const outcome = await applyGuardedChange({
        kind: 'account_status',
        companyId,
        id: targetId,
        adminRoleName: ROLE_ADMINISTRADOR,
        now: instantWithMillis(),
        accountStatus: 'blocked',
        changedBy: actorId,
        lockState: null,
      });
      expect(outcome).toBe('ok');

      const fila = await prisma.user.findFirstOrThrow({
        where: { id: targetId },
        select: {
          accountStatus: true,
          failedLoginAttempts: true,
          lockLevel: true,
          lockedUntil: true,
        },
      });
      expect(fila.accountStatus).toBe('blocked');
      expect(fila.failedLoginAttempts).toBe(bloqueado.failedLoginAttempts);
      expect(fila.lockLevel).toBe(bloqueado.lockLevel);
      expect(fila.lockedUntil).toEqual(bloqueado.lockedUntil);
    });
  });

  // R3, «si una no se aplica, la otra tampoco», por su lado dificil: el mismo patron que el caso R38
  // de QC-23 de arriba. Si los contadores viajaran en una escritura previa al chequeo de R22, aqui
  // quedarian limpios con la cuenta intacta.
  it('R3: si la transaccion aborta por `last_administrator`, ni el estado ni los tres contadores cambian', async () => {
    await withCompany(async (companyId) => {
      // El UNICO administrador `active` de la empresa: moverlo a `inactive` la dejaria sin ninguno.
      // Nace DIRECTO en el escenario: el adaptador ya no concede el rol administrador (fix directo,
      // `action_not_allowed`).
      const adminId = await createUserRaw(companyId, newUserData({ roleId: administradorRoleId }));
      const sembrado = {
        accountStatus: 'active',
        failedLoginAttempts: 3,
        lockLevel: 2,
        lockedUntil: new Date('2099-01-01T00:00:00.000Z'),
      } as const;
      await prisma.user.update({ where: { id: adminId }, data: sembrado });

      const outcome = await applyGuardedChange({
        kind: 'account_status',
        companyId,
        id: adminId,
        adminRoleName: ROLE_ADMINISTRADOR,
        now: instantWithMillis(),
        accountStatus: 'inactive',
        changedBy: adminId,
        lockState: clearedLockState(),
      });
      expect(outcome).toBe('last_administrator');

      expect(await lockRowOf(adminId)).toEqual(sembrado);
    });
  });

  it('R3: un objetivo de otra empresa (`not_found`) conserva sus tres contadores', async () => {
    const companyA = await createCompany();
    const companyB = await createCompany();
    try {
      const targetId = await createUser(companyA, newUserData());
      await prisma.user.update({
        where: { id: targetId },
        data: { failedLoginAttempts: 3, lockLevel: 2, lockedUntil: new Date('2099-01-01T00:00:00.000Z') },
      });
      const antes = await lockRowOf(targetId);
      const actorId = await createUser(companyB, newUserData());

      const outcome = await applyGuardedChange({
        kind: 'account_status',
        companyId: companyB,
        id: targetId,
        adminRoleName: ROLE_ADMINISTRADOR,
        now: instantWithMillis(),
        accountStatus: 'active',
        changedBy: actorId,
        lockState: clearedLockState(),
      });
      expect(outcome).toBe('not_found');

      expect(await lockRowOf(targetId)).toEqual(antes);
      expect(antes.failedLoginAttempts).toBe(3);
    } finally {
      await dropCompany(companyB);
      await dropCompany(companyA);
    }
  });
});

/** El estado de cuenta y los tres contadores de bloqueo de una fila, releidos de la base. */
async function lockRowOf(userId: string) {
  return prisma.user.findFirstOrThrow({
    where: { id: userId },
    select: { accountStatus: true, failedLoginAttempts: true, lockLevel: true, lockedUntil: true },
  });
}
