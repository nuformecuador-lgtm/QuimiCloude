/**
 * QC-84 T14 — el CRUD de grupos de trabajo contra Postgres REAL (R8, R9, R10, R11, R12, R15,
 * R16, R17, R24, R25, R26, R37, R38, R41).
 *
 * QUE SE EJERCITA: los CASOS DE USO ya cableados —`identity.createWorkGroup`,
 * `renameWorkGroup`, `deleteWorkGroup`, `listWorkGroups`— tal y como los consume una Server
 * Action, con un ACTOR de verdad. Se llega por la fachada de `@/lib/composition` y no por el
 * adaptador suelto porque la mitad de lo que aqui se afirma —«la empresa sale del actor y de
 * ningun otro sitio» (R11), «el duplicado se rechaza con un `code` estable» (R12)— vive
 * justamente en la costura entre el caso de uso y el adaptador, que es lo que ningun test
 * unitario con dobles puede contestar.
 *
 * AISLAMIENTO: CONSTRUCCION PROPIA + LIMPIEZA PROPIA, el mismo patron que
 * `user-crud.int.test.ts` (QC-66 T16). **AQUI NO SE PUEDE USAR el `$transaction` interactiva +
 * senal de rollback de `work-groups-constraints.int.test.ts` (QC-83 T8)**: aquel archivo escribe
 * con el `tx` que el propio test abre, mientras que el adaptador de produccion
 * (`work-group-prisma.ts`) habla con el cliente Prisma GLOBAL. Una llamada hecha «dentro» del
 * callback de `prisma.$transaction(...)` correria en OTRA conexion del pool y confirmaria de
 * inmediato —el aislamiento seria una ilusion—, y ademas los tres metodos que abren su propia
 * transaccion se quedarian esperando un bloqueo que tiene la transaccion del test. Asi que cada
 * caso fabrica su PROPIA empresa con nombre irrepetible (`randomUUID`) y la borra en un
 * `finally`.
 *
 * LAS DOS EMPRESAS — R8 y R15 tratan justamente de que el grupo de la empresa A no se vea ni
 * choque con el de la B, asi que los casos que lo necesitan fabrican DOS empresas efimeras
 * propias. NUNCA se usa la empresa de instalacion que siembra QC-6: `companies_name_unique` es
 * GLOBAL y el alta chocaria con ella.
 *
 * EL SQLSTATE 23505, DE VERDAD Y SIN LEER NINGUN TEXTO — R12 exige que la unicidad la garantice
 * el INDICE PARCIAL de QC-83 y no una consulta previa. El caso de uso solo puede ensenar su
 * `code`, asi que este archivo baja un escalon mas y prueba el `INSERT` duplicado en SQL crudo
 * dentro de una transaccion que SIEMPRE se deshace, a traves de una funcion PL/pgSQL efimera
 * cuyo bloque `EXCEPTION` lee `GET STACKED DIAGNOSTICS`: de ahi salen `RETURNED_SQLSTATE` y
 * `CONSTRAINT_NAME` como CAMPOS. Es el patron de QC-83 T8 y QC-86 T10, y es la unica forma de
 * afirmar sobre el `23505` y sobre `work_groups_name_unique` **sin mirar el mensaje**: en esta
 * maquina Postgres responde en espanol.
 *
 * LA BASE LOCAL NO ESTA VACIA: trae la instalacion del seed. Este archivo NO afirma sobre el
 * estado global de ninguna tabla —los de integracion corren en serie pero NO aislados entre
 * archivos (`vitest.config.mts`, `fileParallelism: false`)—: solo afirma sobre SUS propias filas
 * y sobre los totales de SU propia empresa.
 *
 * SIN TESTS DE RLS: un test de RLS escrito con Prisma sale verde pase lo que pase, porque Prisma
 * se conecta como dueno de las tablas (`docs/architecture.md > Acceso a datos y autorizacion`).
 * R7 lo cierra `tests/guards/guard-rls-force.test.ts`.
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { identity } from '@/lib/composition';
import {
  DOCUMENT_TYPE_CC,
  normalizeCompanyName,
  normalizeWorkGroupName,
  ROLE_OPERADOR,
} from '@/lib/modules/identity';
import { prisma } from '@/lib/shared/db/prisma';

import type { Actor } from '@/lib/modules/identity/domain/actor';
import type { WorkGroupRow } from '@/lib/modules/identity/domain/work-group-view';

// ---------------------------------------------------------------------------
// Escenario: empresas propias, grupos propios, limpieza propia
// ---------------------------------------------------------------------------

/** SQLSTATE de la violacion de unicidad. Es estable y NO depende del idioma del servidor. */
const UNIQUE_VIOLATION = '23505';

/** El indice PARCIAL, FUNCIONAL y COMPUESTO que escribio QC-83 a mano en su `migration.sql`. */
const INDICE_NOMBRE_UNICO = 'work_groups_name_unique';

/** Marcador de prueba, evidentemente ficticio: ninguna operacion de aqui lee credenciales. */
const FAKE_CREDENTIAL_HASH = '$2b$10$marcador.de.prueba.qc84.t14.no.es.un.hash.real';

/** Rol del que cuelgan las personas de apoyo. Se REUTILIZA el del seed, no se crea ninguno. */
let operadorRoleId = '';

/** Las empresas que este archivo creo, para comprobar en `afterAll` que no quedo ninguna. */
const createdCompanyIds = new Set<string>();

async function createCompany(): Promise<string> {
  const name = `QC84 T14 ${randomUUID()}`;
  const company = await prisma.company.create({
    data: { name, nameNormalized: normalizeCompanyName(name) },
    select: { id: true },
  });
  createdCompanyIds.add(company.id);
  return company.id;
}

/**
 * Borra la empresa y todo lo que cuelga de ella en el unico orden que respetan las FK: primero
 * las pertenencias, despues los grupos y los usuarios, y solo entonces la empresa. La referencia
 * al autor del cambio de estado se vacia antes porque `users_account_status_changed_by_fkey` es
 * `ON DELETE RESTRICT` (QC-65 R12); mismo orden que razona `dropCompany` en
 * `user-crud.int.test.ts`.
 */
async function dropCompany(companyId: string): Promise<void> {
  await prisma.workGroupMember.deleteMany({ where: { companyId } });
  await prisma.workGroup.deleteMany({ where: { companyId } });
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

/** Un caso con DOS empresas propias y distintas: es lo que hace comprobables R8 y R15. */
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

/** Una persona viva de esa empresa. Solo hace falta para R38: aqui no se mira ningun estado. */
async function seedUser(companyId: string): Promise<string> {
  const tag = randomUUID();
  const created = await prisma.user.create({
    data: {
      firstNames: 'QC84T14',
      lastNames: `Apellido${tag.slice(0, 8)}`,
      birthDate: new Date('1990-01-01T00:00:00.000Z'),
      email: `qc84.t14.${tag}@example.test`,
      phone: '000000000',
      documentTypeCode: DOCUMENT_TYPE_CC,
      documentNumber: tag.replaceAll('-', '').slice(0, 20),
      username: `qc84.t14.${tag}`,
      passwordHash: FAKE_CREDENTIAL_HASH,
      roleId: operadorRoleId,
      companyId,
      accountStatus: 'active',
    },
    select: { id: true },
  });
  return created.id;
}

/**
 * El actor de la empresa, con los DOS permisos: la autorizacion tiene su propio archivo unitario
 * (`tests/unit/identity/grupos/authorization.test.ts`) y aqui no se vuelve a medir. Lo que si
 * importa es que la EMPRESA viaja SOLO aqui dentro (R11): ninguna llamada de este archivo pasa
 * una empresa como argumento, porque ninguna firma la acepta.
 */
function actorOf(companyId: string): Actor {
  return {
    id: randomUUID(),
    companyId,
    permissions: ['usuarios.consultar', 'usuarios.modificar'],
  };
}

/** La consulta generica de QC-57 con lo minimo. Los defectos los pone el propio esquema. */
function listInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { page: 1, sort: null, filters: {}, search: '', ...overrides };
}

// ---------------------------------------------------------------------------
// La FILA CRUDA: lo que de verdad quedo escrito en `work_groups`
// ---------------------------------------------------------------------------

/**
 * Las columnas de `work_groups` que este archivo afirma, en `snake_case` y leidas con SQL crudo.
 * **R10, R16 y R37 se afirman sobre la FILA, no sobre el tipo de salida**: `WorkGroupRow` no
 * expone `name_normalized`, `company_id` ni `deleted_at` a proposito (R26), asi que un test que
 * mirara solo el listado saldria verde aunque el alta escribiera la empresa equivocada.
 */
type RawWorkGroupRow = {
  readonly id: string;
  readonly company_id: string;
  readonly name: string;
  readonly name_normalized: string;
  readonly deleted_at: Date | null;
  readonly created_at: Date;
  readonly updated_at: Date;
};

async function rawWorkGroup(id: string): Promise<RawWorkGroupRow> {
  const rows = await prisma.$queryRaw<ReadonlyArray<RawWorkGroupRow>>(Prisma.sql`
    SELECT "id"::text AS "id", "company_id"::text AS "company_id",
           "name", "name_normalized", "deleted_at", "created_at", "updated_at"
    FROM "work_groups" WHERE "id" = ${id}::uuid
  `);
  const row = rows[0];
  if (row === undefined) throw new Error(`no existe ninguna fila de \`work_groups\` con id ${id}`);
  return row;
}

/** Cuantas filas —vivas o dadas de baja— tiene la empresa. Asi se comprueba «no creo ninguna». */
async function countWorkGroupsOf(companyId: string): Promise<number> {
  return prisma.workGroup.count({ where: { companyId } });
}

// ---------------------------------------------------------------------------
// Los errores: se afirma sobre el `code` ESTABLE, nunca sobre el mensaje
// ---------------------------------------------------------------------------

/** El `code` del error que lanzo la operacion, o el fallo del test si no lanzo ninguno. */
async function codeOfRejection(operation: Promise<unknown>): Promise<string> {
  try {
    await operation;
  } catch (error) {
    const code: unknown = (error as { code?: unknown }).code;
    if (typeof code !== 'string') throw error;
    return code;
  }
  throw new Error('se esperaba que la operacion fuera rechazada, y termino bien');
}

// ---------------------------------------------------------------------------
// El 23505 del indice parcial, leido como CAMPO y no como texto
// ---------------------------------------------------------------------------

/**
 * Funcion PL/pgSQL efimera: ejecuta una sentencia y, si Postgres la rechaza, devuelve el
 * diagnostico ESTRUCTURADO. Vive en `pg_temp`, se crea dentro de la transaccion del sondeo y
 * muere con ella. Mismo patron que QC-83 T8 y QC-86 T10.
 */
const CREATE_TRY_FUNCTION = `
  CREATE OR REPLACE FUNCTION pg_temp.qc84_try(stmt text) RETURNS text AS $qc84fn$
  DECLARE
    v_state text; v_constraint text;
  BEGIN
    EXECUTE stmt;
    RETURN 'ACEPTADO|';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_constraint = CONSTRAINT_NAME;
    RETURN v_state || '|' || coalesce(v_constraint, '');
  END $qc84fn$ LANGUAGE plpgsql`;

/** Senal de rollback del sondeo: no es un fallo, es como se deshace su transaccion. */
class RollbackSignal extends Error {
  constructor() {
    super('rollback del sondeo del 23505');
    this.name = 'RollbackSignal';
  }
}

type Rejection = { readonly sqlState: string; readonly constraint: string | null };

/** Literal SQL de un texto. Los valores los fabrica el propio test; solo hay que escapar `'`. */
function lit(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * Intenta el `INSERT` crudo de un grupo y devuelve lo que Postgres contesto. Corre dentro de una
 * transaccion que SIEMPRE termina en `ROLLBACK`, asi que ni la funcion efimera ni la fila —si
 * llegara a aceptarse— sobreviven al sondeo. Todas las sentencias comparten la conexion de esa
 * transaccion, que es lo que hace visible la funcion de `pg_temp`.
 */
async function probeRawInsert(companyId: string, name: string): Promise<Rejection> {
  let outcome: Rejection = { sqlState: '', constraint: null };
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(CREATE_TRY_FUNCTION);
      const sql =
        `INSERT INTO "work_groups" ("name", "name_normalized", "company_id", "updated_at") ` +
        `VALUES (${lit(name)}, ${lit(normalizeWorkGroupName(name))}, ` +
        `CAST(${lit(companyId)} AS uuid), CURRENT_TIMESTAMP)`;
      const rows = await tx.$queryRawUnsafe<{ r: string }[]>(
        `SELECT pg_temp.qc84_try($qc84stmt$${sql}$qc84stmt$) AS r`,
      );
      const [sqlState = '', constraint = ''] = (rows[0]?.r ?? '').split('|');
      outcome = { sqlState, constraint: constraint === '' ? null : constraint };
      throw new RollbackSignal();
    });
  } catch (error) {
    if (!(error instanceof RollbackSignal)) throw error;
  }
  if (outcome.sqlState === 'ACEPTADO') {
    throw new Error('se esperaba que la base rechazara el nombre duplicado, y lo acepto');
  }
  return outcome;
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

beforeAll(async () => {
  const tablas = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename IN ('work_groups', 'work_group_members')`;
  if (tablas.length !== 2) {
    throw new Error(
      'la base de pruebas no tiene aplicada la migracion de grupos de trabajo (QC-83): faltan ' +
        '`work_groups` y/o `work_group_members`. Corre `pnpm exec prisma migrate deploy` y ' +
        '`pnpm exec prisma generate` contra la base de ESTA feature antes de estos tests.',
    );
  }

  const indices = await prisma.$queryRaw<{ indexname: string }[]>`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'work_groups_name_unique'`;
  if (indices.length !== 1) {
    throw new Error(
      'la base de pruebas no tiene el indice unico parcial `work_groups_name_unique` de QC-83, ' +
        'que es la UNICA garantia de R12. Corre `pnpm exec prisma migrate deploy` contra la base ' +
        'de esta feature antes de estos tests.',
    );
  }

  const operador = await prisma.role.findFirst({
    where: { name: ROLE_OPERADOR },
    select: { id: true },
  });
  if (operador === null) {
    throw new Error(
      `falta el rol base \`${ROLE_OPERADOR}\` en la base: corre \`pnpm run db:seed\` contra la ` +
        'base de esta feature antes de correr este archivo.',
    );
  }
  operadorRoleId = operador.id;
});

afterAll(async () => {
  // Ninguna fila propia sobrevive: si algun `finally` no hubiera corrido, esto lo dice.
  expect([...createdCompanyIds]).toEqual([]);
});

// ---------------------------------------------------------------------------
// R10 + R11 — el alta hereda la empresa DEL ACTOR
// ---------------------------------------------------------------------------

describe('R10 + R11 — crear un grupo lo persiste con la empresa del actor, su normalizado y sin marca de baja', () => {
  it('la fila nace con la empresa del ACTOR, el nombre, su forma normalizada y `deleted_at` nulo', async () => {
    await withCompany(async (companyId) => {
      const actor = actorOf(companyId);

      const { id } = await identity.createWorkGroup(actor, { name: '  Turno Noche  ' });

      const row = await rawWorkGroup(id);
      expect(row.company_id).toBe(companyId);
      // El `trim` es del esquema del borde: lo que se guarda es el nombre ya recortado.
      expect(row.name).toBe('Turno Noche');
      expect(row.name_normalized).toBe(normalizeWorkGroupName('Turno Noche'));
      expect(row.deleted_at).toBeNull();
    });
  });

  it('R11 — no hay ninguna forma de crear el grupo en OTRA empresa: el esquema rechaza el campo y la fila sigue heredando la del actor', async () => {
    await withTwoCompanies(async (companyA, companyB) => {
      const actor = actorOf(companyA);

      // `createWorkGroupSchema` es `strictObject`: mandar la empresa no se ignora, FALLA.
      const code = await codeOfRejection(
        identity.createWorkGroup(actor, { name: 'Turno tarde', companyId: companyB }),
      );
      expect(code).toBe('invalid_input');
      expect(await countWorkGroupsOf(companyA)).toBe(0);
      expect(await countWorkGroupsOf(companyB)).toBe(0);

      const { id } = await identity.createWorkGroup(actor, { name: 'Turno tarde' });
      expect((await rawWorkGroup(id)).company_id).toBe(companyA);
      expect(await countWorkGroupsOf(companyB)).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// R12 — el duplicado llega del 23505 del indice PARCIAL
// ---------------------------------------------------------------------------

describe('R12 — el nombre duplicado se rechaza con un `code` estable, y la garantia es el indice unico parcial', () => {
  it('el segundo alta con el mismo nombre normalizado responde `work_group_duplicate_name` y NO crea ninguna fila', async () => {
    await withCompany(async (companyId) => {
      const actor = actorOf(companyId);
      await identity.createWorkGroup(actor, { name: 'Turno noche' });

      // Mayusculas y acentos distintos: el «mismo nombre» lo mide `normalizeWorkGroupName`.
      const code = await codeOfRejection(identity.createWorkGroup(actor, { name: 'TURNO NÓCHE' }));

      expect(code).toBe('work_group_duplicate_name');
      expect(await countWorkGroupsOf(companyId)).toBe(1);
    });
  });

  it('el rechazo lo dicta la BASE: un `INSERT` crudo del duplicado responde `SQLSTATE 23505` contra `work_groups_name_unique`', async () => {
    await withCompany(async (companyId) => {
      await identity.createWorkGroup(actorOf(companyId), { name: 'Turno noche' });

      const rejection = await probeRawInsert(companyId, 'turno NOCHE');

      expect(rejection.sqlState).toBe(UNIQUE_VIOLATION);
      expect(rejection.constraint).toBe(INDICE_NOMBRE_UNICO);
      // Y el sondeo no dejo nada: sigue habiendo un solo grupo.
      expect(await countWorkGroupsOf(companyId)).toBe(1);
    });
  });
});

// ---------------------------------------------------------------------------
// R15 — dos empresas distintas pueden llamar igual a sus grupos
// ---------------------------------------------------------------------------

describe('R15 — el mismo nombre en DOS empresas distintas es valido en las dos', () => {
  it('las dos altas tienen exito y cada fila queda en su propia empresa, con el MISMO normalizado', async () => {
    await withTwoCompanies(async (companyA, companyB) => {
      const nombre = 'Turno noche';

      const enA = await identity.createWorkGroup(actorOf(companyA), { name: nombre });
      const enB = await identity.createWorkGroup(actorOf(companyB), { name: nombre });

      expect(enA.id).not.toBe(enB.id);
      const filaA = await rawWorkGroup(enA.id);
      const filaB = await rawWorkGroup(enB.id);
      expect(filaA.company_id).toBe(companyA);
      expect(filaB.company_id).toBe(companyB);
      // El indice es COMPUESTO con la empresa: el mismo normalizado no es una colision.
      expect(filaA.name_normalized).toBe(filaB.name_normalized);
    });
  });
});

// ---------------------------------------------------------------------------
// R16 + R17 — renombrar, y su duplicado
// ---------------------------------------------------------------------------

describe('R16 + R17 — renombrar cambia el nombre y su normalizado, y nada mas', () => {
  it('R16 — reemplaza las dos columnas del nombre y NO toca empresa, identificador ni marca de baja', async () => {
    await withCompany(async (companyId) => {
      const actor = actorOf(companyId);
      const { id } = await identity.createWorkGroup(actor, { name: 'Turno noche' });
      const antes = await rawWorkGroup(id);

      await identity.renameWorkGroup(actor, { workGroupId: id, name: 'Turno madrugada' });

      const despues = await rawWorkGroup(id);
      expect(despues.name).toBe('Turno madrugada');
      expect(despues.name_normalized).toBe(normalizeWorkGroupName('Turno madrugada'));
      expect(despues.id).toBe(antes.id);
      expect(despues.company_id).toBe(antes.company_id);
      expect(despues.deleted_at).toBeNull();
      expect(despues.created_at.toISOString()).toBe(antes.created_at.toISOString());
    });
  });

  it('R16 — renombrar NO toca ninguna de sus filas de pertenencia', async () => {
    await withCompany(async (companyId) => {
      const actor = actorOf(companyId);
      const { id } = await identity.createWorkGroup(actor, { name: 'Turno noche' });
      await identity.addWorkGroupMember(actor, { workGroupId: id, userId: await seedUser(companyId) });
      const antes = await prisma.workGroupMember.findMany({ where: { workGroupId: id } });

      await identity.renameWorkGroup(actor, { workGroupId: id, name: 'Turno madrugada' });

      expect(await prisma.workGroupMember.findMany({ where: { workGroupId: id } })).toEqual(antes);
    });
  });

  it('R17 — renombrar al nombre de OTRO grupo vivo de la empresa responde el MISMO `code` del alta y no modifica ninguna fila', async () => {
    await withCompany(async (companyId) => {
      const actor = actorOf(companyId);
      await identity.createWorkGroup(actor, { name: 'Turno noche' });
      const { id } = await identity.createWorkGroup(actor, { name: 'Turno tarde' });

      const code = await codeOfRejection(
        identity.renameWorkGroup(actor, { workGroupId: id, name: 'turno NOCHE' }),
      );

      expect(code).toBe('work_group_duplicate_name');
      expect((await rawWorkGroup(id)).name).toBe('Turno tarde');
    });
  });

  it('R17 — renombrar un grupo con su PROPIO nombre no choca consigo mismo', async () => {
    await withCompany(async (companyId) => {
      const actor = actorOf(companyId);
      const { id } = await identity.createWorkGroup(actor, { name: 'Turno noche' });

      await identity.renameWorkGroup(actor, { workGroupId: id, name: 'Turno Noche' });

      expect((await rawWorkGroup(id)).name).toBe('Turno Noche');
    });
  });
});

// ---------------------------------------------------------------------------
// R24 + R25 + R26 — el listado: 10 por defecto, 25 de tope, orden estable, dos claves
// ---------------------------------------------------------------------------

describe('R24 + R25 + R26 — el listado pagina 10/25, ordena estable y trae DOS columnas', () => {
  it('R24 — sin tamano de pagina devuelve 10, con 100 devuelve 25 (acotado, no un error), y el total es el de la empresa', async () => {
    await withCompany(async (companyId) => {
      const actor = actorOf(companyId);
      for (let i = 0; i < 28; i += 1) {
        await identity.createWorkGroup(actor, { name: `Grupo ${String(i).padStart(2, '0')}` });
      }

      const porDefecto = await identity.listWorkGroups(actor, listInput());
      expect(porDefecto.items).toHaveLength(10);
      expect(porDefecto.pageSize).toBe(10);
      expect(porDefecto.total).toBe(28);

      const pedidoDeCien = await identity.listWorkGroups(actor, listInput({ pageSize: 100 }));
      expect(pedidoDeCien.items).toHaveLength(25);
      expect(pedidoDeCien.pageSize).toBe(25);
      expect(pedidoDeCien.total).toBe(28);
    });
  });

  it('R25 — el orden por nombre es estable: recorrer las tres paginas devuelve a cada grupo EXACTAMENTE una vez, y en orden', async () => {
    await withCompany(async (companyId) => {
      const actor = actorOf(companyId);
      const nombres = Array.from({ length: 23 }, (_, i) => `Grupo ${String(i).padStart(2, '0')}`);
      for (const name of nombres) await identity.createWorkGroup(actor, { name });

      const recorrido: WorkGroupRow[] = [];
      for (const page of [1, 2, 3]) {
        const pagina = await identity.listWorkGroups(actor, listInput({ page, pageSize: 10 }));
        recorrido.push(...pagina.items);
      }

      expect(recorrido.map((row) => row.name)).toEqual(nombres);
      expect(new Set(recorrido.map((row) => row.id)).size).toBe(23);
    });
  });

  it('R26 — cada fila trae EXACTAMENTE `id`, `name` y `members`: ni el normalizado, ni la empresa, ni la marca de baja', async () => {
    await withCompany(async (companyId) => {
      const actor = actorOf(companyId);
      await identity.createWorkGroup(actor, { name: 'Turno noche' });

      const pagina = await identity.listWorkGroups(actor, listInput());
      const fila = pagina.items[0];

      expect(fila).toBeDefined();
      expect(Object.keys(fila ?? {}).sort()).toEqual(['id', 'members', 'name']);
    });
  });

  it('cada fila trae los NOMBRES de sus miembros (humano, fuera de QC-84): un grupo sin miembros trae `members: []`, y uno con miembros trae su `displayName`', async () => {
    await withCompany(async (companyId) => {
      const actor = actorOf(companyId);
      const vacio = await identity.createWorkGroup(actor, { name: 'Turno madrugada' });
      const conGente = await identity.createWorkGroup(actor, { name: 'Turno tarde' });
      const unoId = await seedUser(companyId);
      const dosId = await seedUser(companyId);
      await identity.addWorkGroupMember(actor, { workGroupId: conGente.id, userId: unoId });
      await identity.addWorkGroupMember(actor, { workGroupId: conGente.id, userId: dosId });

      const pagina = await identity.listWorkGroups(actor, listInput());
      const filaVacia = pagina.items.find((row) => row.id === vacio.id);
      const filaConGente = pagina.items.find((row) => row.id === conGente.id);

      expect(filaVacia?.members).toEqual([]);
      expect(filaConGente?.members.map((member) => member.id).sort()).toEqual(
        [unoId, dosId].sort(),
      );
      for (const member of filaConGente?.members ?? []) {
        expect(member.displayName.length).toBeGreaterThan(0);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// R8 + R9 — el grupo de OTRA empresa, y el grupo dado de baja, son inexistentes
// ---------------------------------------------------------------------------

describe('R8 — un grupo de OTRA empresa responde «no encontrado» y no se toca', () => {
  it('renombrar, dar de baja, meter, sacar y ver miembros responden `work_group_not_found`, y la fila ajena queda intacta', async () => {
    await withTwoCompanies(async (companyA, companyB) => {
      const ajeno = await identity.createWorkGroup(actorOf(companyB), { name: 'Turno noche' });
      const actorA = actorOf(companyA);
      const antes = await rawWorkGroup(ajeno.id);
      const persona = randomUUID();

      expect(
        await codeOfRejection(
          identity.renameWorkGroup(actorA, { workGroupId: ajeno.id, name: 'Otro' }),
        ),
      ).toBe('work_group_not_found');
      expect(
        await codeOfRejection(identity.deleteWorkGroup(actorA, { workGroupId: ajeno.id })),
      ).toBe('work_group_not_found');
      expect(
        await codeOfRejection(
          identity.addWorkGroupMember(actorA, { workGroupId: ajeno.id, userId: persona }),
        ),
      ).toBe('work_group_not_found');
      expect(
        await codeOfRejection(
          identity.removeWorkGroupMember(actorA, { workGroupId: ajeno.id, userId: persona }),
        ),
      ).toBe('work_group_not_found');
      expect(
        await codeOfRejection(
          identity.listWorkGroupMembers(actorA, ajeno.id, listInput(), new Date()),
        ),
      ).toBe('work_group_not_found');

      // Ni una columna cambio, y el grupo sigue vivo: «no revelar que existe» no es «tocarlo».
      expect(await rawWorkGroup(ajeno.id)).toEqual(antes);
    });
  });

  it('el listado de la empresa A no ensena ningun grupo de la B', async () => {
    await withTwoCompanies(async (companyA, companyB) => {
      await identity.createWorkGroup(actorOf(companyB), { name: 'Turno noche' });
      await identity.createWorkGroup(actorOf(companyA), { name: 'Turno tarde' });

      const pagina = await identity.listWorkGroups(actorOf(companyA), listInput({ pageSize: 25 }));

      expect(pagina.total).toBe(1);
      expect(pagina.items.map((row) => row.name)).toEqual(['Turno tarde']);
    });
  });
});

describe('R9 — MIENTRAS un grupo este dado de baja, las operaciones lo tratan como inexistente', () => {
  it('no sale en el listado, y renombrarlo, darlo de baja otra vez o consultar sus miembros responden `work_group_not_found`', async () => {
    await withCompany(async (companyId) => {
      const actor = actorOf(companyId);
      const { id } = await identity.createWorkGroup(actor, { name: 'Turno noche' });
      await identity.deleteWorkGroup(actor, { workGroupId: id });

      const pagina = await identity.listWorkGroups(actor, listInput({ pageSize: 25 }));
      expect(pagina.total).toBe(0);
      expect(pagina.items).toEqual([]);

      expect(
        await codeOfRejection(identity.renameWorkGroup(actor, { workGroupId: id, name: 'Otro' })),
      ).toBe('work_group_not_found');
      expect(await codeOfRejection(identity.deleteWorkGroup(actor, { workGroupId: id }))).toBe(
        'work_group_not_found',
      );
      expect(
        await codeOfRejection(identity.listWorkGroupMembers(actor, id, listInput(), new Date())),
      ).toBe('work_group_not_found');
    });
  });
});

// ---------------------------------------------------------------------------
// R37 + R38 + R41 — la baja es LOGICA, conserva las pertenencias y libera el nombre
// ---------------------------------------------------------------------------

describe('R37 + R38 — la baja conserva la fila entera y TODAS sus pertenencias', () => {
  it('R37 — la fila sigue existiendo con su nombre y su empresa, y solo gana la marca de baja', async () => {
    await withCompany(async (companyId) => {
      const actor = actorOf(companyId);
      const { id } = await identity.createWorkGroup(actor, { name: 'Turno noche' });
      const antes = await rawWorkGroup(id);

      await identity.deleteWorkGroup(actor, { workGroupId: id });

      const despues = await rawWorkGroup(id);
      expect(despues.deleted_at).not.toBeNull();
      expect(despues.name).toBe(antes.name);
      expect(despues.name_normalized).toBe(antes.name_normalized);
      expect(despues.company_id).toBe(antes.company_id);
      expect(await countWorkGroupsOf(companyId)).toBe(1);
    });
  });

  it('R38 — las filas de pertenencia se conservan INTACTAS: no se pierde quien estaba dentro', async () => {
    await withCompany(async (companyId) => {
      const actor = actorOf(companyId);
      const { id } = await identity.createWorkGroup(actor, { name: 'Turno noche' });
      const uno = await seedUser(companyId);
      const dos = await seedUser(companyId);
      await identity.addWorkGroupMember(actor, { workGroupId: id, userId: uno });
      await identity.addWorkGroupMember(actor, { workGroupId: id, userId: dos });
      const antes = await prisma.workGroupMember.findMany({
        where: { workGroupId: id },
        orderBy: { userId: 'asc' },
      });

      await identity.deleteWorkGroup(actor, { workGroupId: id });

      const despues = await prisma.workGroupMember.findMany({
        where: { workGroupId: id },
        orderBy: { userId: 'asc' },
      });
      expect(despues).toHaveLength(2);
      expect(despues).toEqual(antes);
    });
  });
});

describe('R41 — MIENTRAS un grupo este dado de baja, su nombre queda LIBRE en su empresa', () => {
  it('crear otro grupo con el mismo nombre tiene exito, y las dos filas coexisten', async () => {
    await withCompany(async (companyId) => {
      const actor = actorOf(companyId);
      const viejo = await identity.createWorkGroup(actor, { name: 'Turno noche' });
      await identity.deleteWorkGroup(actor, { workGroupId: viejo.id });

      const nuevo = await identity.createWorkGroup(actor, { name: 'Turno noche' });

      expect(nuevo.id).not.toBe(viejo.id);
      expect((await rawWorkGroup(nuevo.id)).deleted_at).toBeNull();
      expect((await rawWorkGroup(viejo.id)).deleted_at).not.toBeNull();
      // Las dos filas coexisten: la baja es logica (R37) y el indice es PARCIAL.
      expect(await countWorkGroupsOf(companyId)).toBe(2);
      // Y el nombre vuelve a estar tomado: un TERCER grupo vivo si choca.
      expect(await codeOfRejection(identity.createWorkGroup(actor, { name: 'TURNO NOCHE' }))).toBe(
        'work_group_duplicate_name',
      );
    });
  });
});
