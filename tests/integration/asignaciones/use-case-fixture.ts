// tests/integration/asignaciones/use-case-fixture.ts
/**
 * QC-87 (T14) — El fixture COMPARTIDO de los tests de integracion de los cuatro casos de uso de
 * `asignaciones` (`design.md > 8`).
 *
 * QUE SE EJERCITA AQUI Y NO EN UNIDAD. Los tests de `tests/unit/asignaciones/**` prueban el
 * dominio con puertos de mentira. Estos prueban el CASO DE USO COMPLETO con sus CUATRO adaptadores
 * Prisma reales contra Postgres: el repositorio de `asignaciones` (T4), el `OrderCatalog` de
 * `pedidos` (T2) y los dos directorios de `identity` (T3), que a su vez se apoyan en
 * `listMembersAliveInCompany` de QC-84 y en `effectiveAccountStatus` de QC-78. Es la evidencia que
 * SUSTITUYE al E2E en esta mitad (hallazgo 1 de `design.md > 0`): esta ficha no trae pantalla
 * (R50), asi que si el congelado, el filtro de `active`, la reaplicacion, el alcance de empresa y
 * los borrados no se demuestran aqui, no se demuestran en ningun sitio.
 *
 * AISLAMIENTO — `transaccion` (QC-77 R18, censado en `tests/integration/aislamiento.json`): cada
 * `it` corre dentro de una `prisma.$transaction` interactiva que termina lanzando `RollbackSignal`,
 * asi que Prisma emite `ROLLBACK` y ninguna fila sobrevive al caso. El repositorio de
 * `asignaciones` se CONSTRUYE sobre esa `tx` —es una fabrica, no un objeto atado al cliente
 * global— y los tres adaptadores de T2 y T3, que SI importan el cliente global, viajan por esa
 * misma conexion gracias al Proxy de `./prisma-tx-holder` (su cabecera explica por que eso no
 * falsea nada). Sin una de las dos cosas, el adaptador correria en otra conexion del pool y no
 * veria ni una fila del fixture: el «aislamiento de mentira» de QC-77.
 *
 * FIXTURE PROPIO Y EFIMERO — dos empresas con nombre irrepetible (`randomUUID`), su rol, su receta
 * y sus pedidos nacen dentro de la transaccion. NUNCA se usa la empresa de instalacion de QC-6:
 * `companies_name_unique` es GLOBAL y el alta chocaria con ella.
 *
 * SAVEPOINTS — un error del motor aborta la transaccion entera, y casi todos los requisitos de
 * rechazo exigen mirar el estado DESPUES («no crear ni eliminar ninguna fila»). Por eso lo que se
 * espera que falle CONTRA LA BASE va envuelto en `withSavepoint`. Un rechazo del DOMINIO
 * —`user_not_found`, `work_group_not_found`, `invalid_input`— no toca la base y no lo necesita.
 *
 * Este archivo NO termina en `.int.test.ts`: no es una suite y no entra en el censo (la guardia
 * `guard-aislamiento-integracion` filtra por ese sufijo).
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';

import { createOrderAssignmentRepository } from '@/lib/modules/asignaciones/adapters/driven/persistence/order-assignment-prisma';
import { createAssignResponsibles } from '@/lib/modules/asignaciones/domain/assign-responsibles';
import { createListOrderResponsibles } from '@/lib/modules/asignaciones/domain/list-order-responsibles';
import { createListResponsiblesForOrders } from '@/lib/modules/asignaciones/domain/list-responsibles-for-orders';
import { createRemoveWorkGroupFromOrder } from '@/lib/modules/asignaciones/domain/remove-work-group-from-order';
import { createUnassignResponsible } from '@/lib/modules/asignaciones/domain/unassign-responsible';
import { assignmentDirectoryPrisma } from '@/lib/modules/identity/adapters/driven/persistence/assignment-directory-prisma';
import { DOCUMENT_TYPE_CC, normalizeCompanyName, normalizeWorkGroupName } from '@/lib/modules/identity';
import { findAliveOrderTargetById } from '@/lib/modules/pedidos/adapters/driven/persistence/order-catalog-prisma';
import { prisma } from '@/lib/shared/db/prisma';

import { setCurrentTx } from './prisma-tx-holder';

import type { Actor } from '@/lib/modules/asignaciones/domain/actor';
import type { AssignOutcome } from '@/lib/modules/asignaciones/domain/assign-responsibles';
import type { OrderResponsible } from '@/lib/modules/asignaciones/domain/assignment-view';
import type { OrderResponsiblesEntry } from '@/lib/modules/asignaciones/domain/list-responsibles-for-orders';
import type { OrderCatalog } from '@/lib/modules/pedidos';

// ---------------------------------------------------------------------------------------------
// Los casos de uso, cableados con los adaptadores REALES
// ---------------------------------------------------------------------------------------------

/**
 * El `OrderCatalog` de `pedidos` (T2). Se compone aqui —y no se importa un objeto ya hecho— porque
 * `lib/composition` todavia no cablea `asignaciones` (T11) y este archivo no lo adelanta: el dia
 * que T11 exista, esta es la unica linea que cambia.
 */
const orders: OrderCatalog = { findAliveById: findAliveOrderTargetById };

export type UseCases = {
  readonly assign: (actor: Actor | null | undefined, input: unknown, now: Date) => Promise<AssignOutcome>;
  readonly removeWorkGroup: (
    actor: Actor | null | undefined,
    input: unknown,
  ) => Promise<{ readonly removed: number }>;
  readonly unassign: (actor: Actor | null | undefined, input: unknown) => Promise<void>;
  readonly list: (
    actor: Actor | null | undefined,
    orderId: string,
  ) => Promise<readonly OrderResponsible[]>;
  /** QC-102 T2/T4 — la consulta EN LOTE: varios pedidos de una vez, con UNA sola sentencia. */
  readonly listForOrders: (
    actor: Actor | null | undefined,
    orderIds: unknown,
  ) => Promise<readonly OrderResponsiblesEntry[]>;
};

function wireUseCases(tx: Prisma.TransactionClient, now: Date): UseCases {
  // El UNICO adaptador que se construye explicitamente sobre la `tx`: es una fabrica. Los otros
  // tres llegan a la misma conexion por el Proxy de `./prisma-tx-holder`.
  const assignments = createOrderAssignmentRepository(tx);

  return {
    assign: createAssignResponsibles({
      assignments,
      orders,
      people: assignmentDirectoryPrisma,
      groups: assignmentDirectoryPrisma,
    }),
    removeWorkGroup: createRemoveWorkGroupFromOrder({ orders, assignments }),
    unassign: createUnassignResponsible({ orders, assignments }),
    // El reloj entra por parametro tambien en la consulta: aqui no hay ni un `new Date()` escondido.
    list: createListOrderResponsibles({ orders, assignments, people: assignmentDirectoryPrisma, now: () => now }),
    // QC-102: SIN `orders` a proposito (hallazgo H3). El lote no comprueba pedido a pedido que el
    // pedido viva —costaria una consulta por pedido— y devuelve entrada vacia para lo que no
    // encuentra (R7).
    listForOrders: createListResponsiblesForOrders({
      assignments,
      people: assignmentDirectoryPrisma,
      now: () => now,
    }),
  };
}

// ---------------------------------------------------------------------------------------------
// Aislamiento
// ---------------------------------------------------------------------------------------------

/** Senal de rollback: no es un fallo, es como se deshace la transaccion del test. */
class RollbackSignal extends Error {
  constructor() {
    super('rollback de aislamiento del test');
    this.name = 'RollbackSignal';
  }
}

export interface Fixture {
  readonly tx: Prisma.TransactionClient;
  /** Empresa propia del caso. */
  readonly companyA: string;
  /** Empresa ajena: con ella se comprueba que la empresa acota de verdad (R5, R6, R7). */
  readonly companyB: string;
  readonly roleId: string;
  readonly recipeId: string;
  readonly useCases: UseCases;
}

/** El instante por defecto de los casos que no juegan con el reloj. */
export const NOW = new Date('2026-03-01T10:00:00.000Z');

export async function inRolledBackTransaction(
  body: (fixture: Fixture) => Promise<void>,
  now: Date = NOW,
): Promise<void> {
  try {
    await prisma.$transaction(
      async (tx) => {
        // A partir de aqui, los adaptadores que importan el cliente global hablan por ESTA `tx`.
        setCurrentTx(tx);
        const companyA = await createCompany(tx, 'qc87-t14-a');
        const companyB = await createCompany(tx, 'qc87-t14-b');
        const roleId = await createRole(tx);
        const recipeId = await createRecipe(tx);
        await body({ tx, companyA, companyB, roleId, recipeId, useCases: wireUseCases(tx, now) });
        throw new RollbackSignal();
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
  } catch (error) {
    if (!(error instanceof RollbackSignal)) throw error;
  } finally {
    // Sin esto, el proxy seguiria apuntando a una transaccion ya cerrada y el siguiente caso
    // fallaria con un error del pool en vez de con lo que mide.
    setCurrentTx(null);
  }
}

/**
 * Lo que se espera que falle CONTRA LA BASE, envuelto en un `SAVEPOINT`: el error aborta el
 * subbloque y `ROLLBACK TO SAVEPOINT` deja la transaccion viva para poder seguir consultando. El
 * error se devuelve en vez de lanzarse, para que el caso afirme sobre el.
 */
export async function withSavepoint(
  tx: Prisma.TransactionClient,
  body: () => Promise<unknown>,
): Promise<unknown> {
  const nombre = `qc87_sp_${randomUUID().replaceAll('-', '')}`;
  await tx.$executeRawUnsafe(`SAVEPOINT ${nombre}`);
  try {
    await body();
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${nombre}`);
    return null;
  } catch (error) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${nombre}`);
    return error;
  }
}

// ---------------------------------------------------------------------------------------------
// El actor
// ---------------------------------------------------------------------------------------------

/** Los dos permisos que esta ficha consume; no nace ninguno (R49). */
export const MODIFICAR = 'asignaciones.modificar';
export const CONSULTAR_PEDIDOS = 'pedidos.consultar';

export function actorOf(
  companyId: string,
  permissions: readonly string[] = [MODIFICAR, CONSULTAR_PEDIDOS],
): Actor {
  return { id: randomUUID(), companyId, permissions };
}

// ---------------------------------------------------------------------------------------------
// Datos de apoyo
// ---------------------------------------------------------------------------------------------

export async function createCompany(tx: Prisma.TransactionClient, prefix: string): Promise<string> {
  const name = `${prefix}-${randomUUID()}`;
  const company = await tx.company.create({
    data: { name, nameNormalized: normalizeCompanyName(name) },
    select: { id: true },
  });
  return company.id;
}

async function createRole(tx: Prisma.TransactionClient): Promise<string> {
  const role = await tx.role.create({
    data: { name: `rol-qc87-t14-${randomUUID()}`, description: 'Rol de prueba' },
    select: { id: true },
  });
  return role.id;
}

/** Receta efimera SIN lineas: es solo el otro lado de `orders_recipe_id_fkey`. */
async function createRecipe(tx: Prisma.TransactionClient): Promise<string> {
  const marca = randomUUID().replaceAll('-', '');
  const recipe = await tx.recipe.create({
    data: { name: `Receta ${marca}`, nameNormalized: `receta${marca}` },
    select: { id: true },
  });
  return recipe.id;
}

export type PersonOptions = {
  /** Manda el APELLIDO porque es por donde ordena el SQL de QC-84 y por donde empieza el nombre
   *  mostrable de QC-66: asi los casos del orden (R38) pueden fijarlo. */
  readonly lastNames?: string;
  readonly firstNames?: string;
  /** La COLUMNA. El estado EFECTIVO lo calcula `effectiveAccountStatus` con el reloj (R21). */
  readonly accountStatus?: 'active' | 'pending' | 'inactive' | 'blocked';
  readonly lockedUntil?: Date | null;
  readonly deletedAt?: Date | null;
};

export async function createPerson(
  fixture: Pick<Fixture, 'tx' | 'roleId'>,
  companyId: string,
  options: PersonOptions = {},
): Promise<string> {
  const tag = randomUUID();
  const user = await fixture.tx.user.create({
    data: {
      firstNames: options.firstNames ?? 'Ana Maria',
      lastNames: options.lastNames ?? 'Perez Gomez',
      birthDate: new Date('1990-05-17T00:00:00.000Z'),
      email: `${tag}@example.com`,
      phone: '+57 300 111 2233',
      documentTypeCode: DOCUMENT_TYPE_CC,
      documentNumber: tag.replaceAll('-', '').slice(0, 15),
      username: tag,
      passwordHash: 'hash-de-prueba-no-es-un-algoritmo-real',
      roleId: fixture.roleId,
      companyId,
      // Por defecto `active`: el `@default(pending)` del esquema es lo correcto en produccion
      // —nadie esta activo hasta que entra y cambia su contrasena— pero aqui obligaria a
      // repetirlo en cada caso.
      accountStatus: options.accountStatus ?? 'active',
      lockedUntil: options.lockedUntil ?? null,
      deletedAt: options.deletedAt ?? null,
    },
    select: { id: true },
  });
  return user.id;
}

export type WorkGroupRef = { readonly id: string; readonly name: string };

export async function createWorkGroup(
  tx: Prisma.TransactionClient,
  companyId: string,
  name = `Turno noche ${randomUUID()}`,
): Promise<WorkGroupRef> {
  return tx.workGroup.create({
    data: { name, nameNormalized: normalizeWorkGroupName(name), companyId },
    select: { id: true, name: true },
  });
}

/** La pertenencia de QC-83/QC-84: la tabla que lee `listMembersAliveInCompany`. */
export async function addMember(
  tx: Prisma.TransactionClient,
  companyId: string,
  workGroupId: string,
  userId: string,
): Promise<void> {
  await tx.workGroupMember.create({ data: { workGroupId, userId, companyId } });
}

/**
 * Posicion del correlativo de los pedidos de este fixture. Arranca alto y aleatorio para no chocar
 * con `orders_order_year_order_sequence_key` ni con otro archivo que corra a la vez. El ano NO se
 * escribe a mano: el CHECK `orders_order_year_matches_created_at` (QC-33 R41) lo ata a
 * `created_at`.
 */
let nextSequence = 910_000 + Math.floor(Math.random() * 80_000);

export type OrderOptions = {
  readonly status?: 'PENDIENTE' | 'EN_CURSO' | 'ENTREGADO' | 'CANCELADO';
  readonly deletedAt?: Date | null;
};

export async function createOrder(
  fixture: Pick<Fixture, 'tx' | 'recipeId'>,
  options: OrderOptions = {},
): Promise<string> {
  nextSequence += 1;
  const order = await fixture.tx.order.create({
    data: {
      orderYear: new Date().getUTCFullYear(),
      orderSequence: nextSequence,
      recipeId: fixture.recipeId,
      quantity: new Prisma.Decimal('10'),
      status: options.status ?? 'PENDIENTE',
      deletedAt: options.deletedAt ?? null,
    },
    select: { id: true },
  });
  return order.id;
}

export type StoredRow = {
  userId: string;
  companyId: string;
  workGroupId: string | null;
  workGroupName: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Las filas del pedido leidas AL MARGEN del adaptador, con sus marcas de tiempo. */
export async function readRows(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<readonly StoredRow[]> {
  return tx.orderAssignment.findMany({
    where: { orderId },
    select: {
      userId: true,
      companyId: true,
      workGroupId: true,
      workGroupName: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { userId: 'asc' },
  });
}

/** El `code` estable del error, que es por donde se traduce (R43) y por donde se afirma. */
export function codeOf(error: unknown): string {
  return (error as { code?: string }).code ?? `(sin code: ${String(error)})`;
}
