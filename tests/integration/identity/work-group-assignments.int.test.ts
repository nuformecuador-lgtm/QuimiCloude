/**
 * QC-84 T16 — **el test que la ficha exige** (R18, R39): renombrar o dar de baja un grupo de
 * trabajo NO deja ningun pedido sin responsables.
 *
 * ES LA PRUEBA, DESDE EL OTRO LADO, DE UNA DECISION DE QC-86. Aquella ficha decidio congelar en
 * `order_assignments` a las PERSONAS —y el NOMBRE del grupo el dia que se asigno—, no la
 * pertenencia viva. La decision 9 de esta ficha dice «dar de baja un grupo no puede dejar un
 * pedido sin responsables, **y esta ficha lo demuestra con test**»; este archivo es ese test. Si
 * manana alguien cambiara la baja para arrastrar las asignaciones —o para poner al dia el nombre
 * congelado al renombrar—, los casos de aqui se ponen ROJOS.
 *
 * POR QUE ES UN TEST DE INTEGRACION Y NO UNO CON DOBLES: la garantia que se mide es que NADIE
 * toca esas filas, y un doble del puerto solo puede demostrar que el caso de uso no llamo a un
 * metodo que ese doble conoce. Lo que hace falta es mirar la TABLA de verdad, antes y despues.
 *
 * LEER `order_assignments` CON PRISMA DESDE UN TEST ES LEGAL, y conviene decir por que: la
 * frontera de modulo de `guard-arquitectura-modulos.test.ts` vigila `lib/modules/**`, no
 * `tests/**`. Lo que NO puede es que un archivo de produccion de esta feature nombre esa tabla
 * (R50), y eso lo cierra `tests/unit/identity/grupos/scope.test.ts`. Aqui se lee, nunca se
 * escribe desde la feature: las filas de asignacion las siembra el propio test, porque asignar
 * un pedido es de QC-86 y no de esta ficha.
 *
 * AISLAMIENTO: CONSTRUCCION PROPIA + LIMPIEZA PROPIA, igual que los otros dos archivos de T14 y
 * T15 y por el mismo motivo (el adaptador de produccion habla con el cliente Prisma GLOBAL). El
 * escenario entero —empresa, personas, grupo, receta, pedido y asignaciones— nace y muere dentro
 * del caso, asi que el archivo es repetible y no depende del seed mas que para el rol base.
 *
 * EL CORRELATIVO DEL PEDIDO arranca en un punto aleatorio alto y solo crece, para no chocar
 * contra `orders_order_year_order_sequence_key`, que es GLOBAL; y el ano NO se escribe a mano,
 * sale de `created_at`, porque el CHECK `orders_order_year_matches_created_at` (QC-33 R41) los
 * ata y un literal pondria esta suite roja sola el 1 de enero. Mismo razonamiento que
 * `tests/integration/asignaciones/order-assignments-constraints.int.test.ts`.
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { identity } from '@/lib/composition';
import { DOCUMENT_TYPE_CC, normalizeCompanyName, ROLE_OPERADOR } from '@/lib/modules/identity';
import { prisma } from '@/lib/shared/db/prisma';

import type { Actor } from '@/lib/modules/identity/domain/actor';

// ---------------------------------------------------------------------------
// Escenario propio, limpieza propia
// ---------------------------------------------------------------------------

const FAKE_CREDENTIAL_HASH = '$2b$10$marcador.de.prueba.qc84.t16.no.es.un.hash.real';

/** Rol del que cuelgan las personas. Se REUTILIZA el del seed, no se crea ninguno. */
let operadorRoleId = '';

const createdCompanyIds = new Set<string>();
const createdRecipeIds = new Set<string>();

/**
 * Posicion del correlativo de los pedidos que fabrica este archivo. Arranca alto y aleatorio y
 * solo crece: `orders_order_year_order_sequence_key` es GLOBAL.
 */
let nextSequence = 810_000 + Math.floor(Math.random() * 100_000);

async function createCompany(): Promise<string> {
  const name = `QC84 T16 ${randomUUID()}`;
  const company = await prisma.company.create({
    data: { name, nameNormalized: normalizeCompanyName(name) },
    select: { id: true },
  });
  createdCompanyIds.add(company.id);
  return company.id;
}

/** Receta efimera SIN lineas: es solo el otro lado de `orders_recipe_id_fkey`. */
async function createRecipe(): Promise<string> {
  const marca = randomUUID().replaceAll('-', '');
  const recipe = await prisma.recipe.create({
    data: { name: `Receta QC84 T16 ${marca}`, nameNormalized: `recetaqc84t16${marca}` },
    select: { id: true },
  });
  createdRecipeIds.add(recipe.id);
  return recipe.id;
}

async function createOrder(recipeId: string, companyId: string): Promise<string> {
  nextSequence += 1;
  const order = await prisma.order.create({
    data: {
      // QC-60: `orders.company_id` es NOT NULL y la FK de la asignacion ya es compuesta, asi que
      // el pedido nace en la MISMA empresa que sus asignaciones.
      companyId,
      orderYear: new Date().getUTCFullYear(),
      orderSequence: nextSequence,
      recipeId,
      quantity: new Prisma.Decimal('10'),
    },
    select: { id: true },
  });
  return order.id;
}

/** Una persona viva y `active` de esa empresa. */
async function seedUser(companyId: string, lastNames: string): Promise<string> {
  const tag = randomUUID();
  const created = await prisma.user.create({
    data: {
      firstNames: 'Ana',
      lastNames,
      birthDate: new Date('1990-01-01T00:00:00.000Z'),
      email: `qc84.t16.${tag}@example.test`,
      phone: '000000000',
      documentTypeCode: DOCUMENT_TYPE_CC,
      documentNumber: tag.replaceAll('-', '').slice(0, 20),
      username: `qc84.t16.${tag}`,
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
 * Borra el escenario entero en el unico orden que respetan las FK: las asignaciones antes que los
 * pedidos y que las personas; las pertenencias antes que los grupos; y la empresa al final.
 */
async function dropCompany(companyId: string): Promise<void> {
  await prisma.orderAssignment.deleteMany({ where: { companyId } });
  // QC-60: `orders.company_id` tiene FK `ON DELETE RESTRICT`, asi que los pedidos de la empresa
  // caen ANTES que ella. Los borra tambien `dropRecipes`, pero eso pasa despues y llega tarde.
  await prisma.order.deleteMany({ where: { companyId } });
  await prisma.workGroupMember.deleteMany({ where: { companyId } });
  await prisma.workGroup.deleteMany({ where: { companyId } });
  await prisma.user.updateMany({ where: { companyId }, data: { accountStatusChangedBy: null } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
  createdCompanyIds.delete(companyId);
}

async function dropRecipes(): Promise<void> {
  for (const recipeId of createdRecipeIds) {
    await prisma.order.deleteMany({ where: { recipeId } });
    await prisma.recipe.delete({ where: { id: recipeId } });
    createdRecipeIds.delete(recipeId);
  }
}

function actorOf(companyId: string): Actor {
  return {
    id: randomUUID(),
    companyId,
    permissions: ['usuarios.consultar', 'usuarios.modificar'],
  };
}

// ---------------------------------------------------------------------------
// El pedido con un grupo APLICADO (QC-86), sembrado por el test
// ---------------------------------------------------------------------------

type Escenario = {
  readonly companyId: string;
  readonly actor: Actor;
  readonly workGroupId: string;
  /** El nombre con el que el grupo se aplico al pedido. Es el que QC-86 congelo. */
  readonly nombreCongelado: string;
  readonly orderId: string;
  readonly responsables: readonly string[];
};

/**
 * Monta un pedido con un grupo APLICADO: tres personas del grupo, y sus tres filas de
 * `order_assignments` con `work_group_id` y `work_group_name` —las dos juntas, que es lo que
 * exige el CHECK `order_assignments_work_group_name_matches_group` de QC-86—.
 */
async function montarPedidoConGrupoAplicado(): Promise<Escenario> {
  const companyId = await createCompany();
  const actor = actorOf(companyId);
  const nombreCongelado = 'Turno noche';
  const grupo = await identity.createWorkGroup(actor, { name: nombreCongelado });

  const responsables: string[] = [];
  for (const apellido of ['Alvarez', 'Benitez', 'Castro']) {
    const userId = await seedUser(companyId, apellido);
    await identity.addWorkGroupMember(actor, { workGroupId: grupo.id, userId });
    responsables.push(userId);
  }

  const orderId = await createOrder(await createRecipe(), companyId);
  for (const userId of responsables) {
    await prisma.orderAssignment.create({
      data: {
        orderId,
        userId,
        companyId,
        workGroupId: grupo.id,
        workGroupName: nombreCongelado,
      },
    });
  }

  return {
    companyId,
    actor,
    workGroupId: grupo.id,
    nombreCongelado,
    orderId,
    responsables,
  };
}

async function withPedidoConGrupoAplicado(body: (e: Escenario) => Promise<void>): Promise<void> {
  const escenario = await montarPedidoConGrupoAplicado();
  try {
    await body(escenario);
  } finally {
    await dropCompany(escenario.companyId);
    await dropRecipes();
  }
}

// ---------------------------------------------------------------------------
// Las filas CRUDAS de `order_assignments`: todas sus columnas, sin excepcion
// ---------------------------------------------------------------------------

/**
 * **Todas** las columnas de la tabla, no una seleccion: lo que R39 promete es que las filas
 * quedan IDENTICAS, y una columna que el test no mirara seria justamente por donde se colaria el
 * cambio. `updated_at` entra a proposito —es lo que se movería si alguien las tocara aunque
 * escribiera el mismo valor—.
 */
type RawAssignmentRow = {
  readonly order_id: string;
  readonly user_id: string;
  readonly company_id: string;
  readonly work_group_id: string | null;
  readonly work_group_name: string | null;
  readonly created_at: Date;
  readonly updated_at: Date;
};

async function rawAssignments(orderId: string): Promise<ReadonlyArray<RawAssignmentRow>> {
  return prisma.$queryRaw<ReadonlyArray<RawAssignmentRow>>(Prisma.sql`
    SELECT "order_id"::text AS "order_id", "user_id"::text AS "user_id",
           "company_id"::text AS "company_id", "work_group_id"::text AS "work_group_id",
           "work_group_name", "created_at", "updated_at"
    FROM "order_assignments" WHERE "order_id" = ${orderId}::uuid
    ORDER BY "user_id"
  `);
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

beforeAll(async () => {
  const tablas = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN ('work_groups', 'work_group_members', 'order_assignments')`;
  if (tablas.length !== 3) {
    throw new Error(
      'la base de pruebas no tiene aplicadas las migraciones de grupos de trabajo (QC-83) y/o de ' +
        'asignacion de pedidos (QC-86): faltan `work_groups`, `work_group_members` y/o ' +
        '`order_assignments`. Corre `pnpm exec prisma migrate deploy` y `pnpm exec prisma ' +
        'generate` contra la base de ESTA feature antes de estos tests.',
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
  expect([...createdCompanyIds]).toEqual([]);
  expect([...createdRecipeIds]).toEqual([]);
});

// ---------------------------------------------------------------------------
// R18 — renombrar no toca lo ya asignado
// ---------------------------------------------------------------------------

describe('R18 — renombrar el grupo NO cambia ninguna asignacion ya persistida', () => {
  it('las tres filas quedan identicas, con el nombre CONGELADO del dia en que se asigno', async () => {
    await withPedidoConGrupoAplicado(async (e) => {
      const antes = await rawAssignments(e.orderId);
      expect(antes).toHaveLength(3);

      await identity.renameWorkGroup(e.actor, {
        workGroupId: e.workGroupId,
        name: 'Turno madrugada',
      });

      // El grupo SI cambio —si no, este test no estaria midiendo nada—.
      const grupo = await prisma.workGroup.findUniqueOrThrow({
        where: { id: e.workGroupId },
        select: { name: true },
      });
      expect(grupo.name).toBe('Turno madrugada');

      // Y las asignaciones NO: mismas personas, misma referencia, MISMO nombre congelado.
      const despues = await rawAssignments(e.orderId);
      expect(despues).toEqual(antes);
      expect(despues.map((fila) => fila.work_group_name)).toEqual([
        e.nombreCongelado,
        e.nombreCongelado,
        e.nombreCongelado,
      ]);
      expect(new Set(despues.map((fila) => fila.work_group_id))).toEqual(
        new Set([e.workGroupId]),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// R39 — dar de baja el grupo no deja el pedido sin responsables
// ---------------------------------------------------------------------------

describe('R39 — dar de baja el grupo NO modifica ni elimina ninguna asignacion del pedido', () => {
  it('el pedido conserva sus TRES responsables, su referencia al grupo y el nombre congelado', async () => {
    await withPedidoConGrupoAplicado(async (e) => {
      const antes = await rawAssignments(e.orderId);

      await identity.deleteWorkGroup(e.actor, { workGroupId: e.workGroupId });

      // La baja SI ocurrio, y es logica: la fila del grupo sigue ahi, marcada.
      const grupo = await prisma.workGroup.findUniqueOrThrow({
        where: { id: e.workGroupId },
        select: { deletedAt: true },
      });
      expect(grupo.deletedAt).not.toBeNull();

      // Y el pedido no perdio nada.
      const despues = await rawAssignments(e.orderId);
      expect(despues).toEqual(antes);
      expect(despues.map((fila) => fila.user_id).sort()).toEqual([...e.responsables].sort());
      expect(despues.map((fila) => fila.work_group_name)).toEqual([
        e.nombreCongelado,
        e.nombreCongelado,
        e.nombreCongelado,
      ]);
    });
  });

  it('renombrar Y DESPUES dar de baja —las dos cosas seguidas— deja las filas exactamente como estaban', async () => {
    await withPedidoConGrupoAplicado(async (e) => {
      const antes = await rawAssignments(e.orderId);

      await identity.renameWorkGroup(e.actor, { workGroupId: e.workGroupId, name: 'Otro nombre' });
      await identity.deleteWorkGroup(e.actor, { workGroupId: e.workGroupId });

      const despues = await rawAssignments(e.orderId);
      expect(despues).toEqual(antes);
      // Ni una sola fila se perdio: el pedido NUNCA se quedo sin responsables.
      expect(despues).toHaveLength(3);
      expect(await prisma.orderAssignment.count({ where: { orderId: e.orderId } })).toBe(3);
    });
  });

  it('R38 + R39 — tras la baja, la pertenencia sigue diciendo quien estaba dentro Y la asignacion sigue diciendo quien responde: son dos registros distintos', async () => {
    await withPedidoConGrupoAplicado(async (e) => {
      await identity.deleteWorkGroup(e.actor, { workGroupId: e.workGroupId });

      const pertenencias = await prisma.workGroupMember.findMany({
        where: { workGroupId: e.workGroupId },
        select: { userId: true },
      });
      const asignaciones = await rawAssignments(e.orderId);

      expect(pertenencias.map((fila) => fila.userId).sort()).toEqual([...e.responsables].sort());
      expect(asignaciones.map((fila) => fila.user_id).sort()).toEqual([...e.responsables].sort());
    });
  });

  it('sacar a una persona del grupo tampoco la quita del pedido: QC-86 congelo a la PERSONA, no la pertenencia viva', async () => {
    await withPedidoConGrupoAplicado(async (e) => {
      const antes = await rawAssignments(e.orderId);
      const [primero] = e.responsables;
      expect(primero).toBeDefined();

      await identity.removeWorkGroupMember(e.actor, {
        workGroupId: e.workGroupId,
        userId: primero ?? '',
      });

      // La pertenencia se borro DE VERDAD (R34)...
      expect(
        await prisma.workGroupMember.count({
          where: { workGroupId: e.workGroupId, userId: primero },
        }),
      ).toBe(0);
      // ...y la asignacion sigue intacta: el pedido conserva sus tres responsables.
      expect(await rawAssignments(e.orderId)).toEqual(antes);
    });
  });
});
