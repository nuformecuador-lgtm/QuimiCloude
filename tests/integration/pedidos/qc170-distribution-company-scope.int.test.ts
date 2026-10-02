/**
 * Aislamiento por empresa de las dos escrituras del reparto y la unidad, contra Postgres REAL:
 * la edicion general (`updateOrder` -> `updateAlive`) y la acotada de `POR_EMPACAR`
 * (`updateOrderPresentationLines` -> `updatePresentationLinesAlive`).
 *
 * Se prueba en dos alturas:
 *   - el caso de uso, cableado con los adaptadores driven reales (sin dobles), que corta en la
 *     primera lectura con ambito (`findAliveById` / `lockAliveById`);
 *   - el adaptador de escritura llamado directamente con el ambito de la otra empresa, que es
 *     el unico modo de demostrar que el `where` del `UPDATE` filtra por `company_id` aunque la
 *     lectura previa se saltara.
 *
 * AISLAMIENTO: por COMMIT. Los casos de uso abren su PROPIA transaccion contra el cliente
 * global, asi que una transaccion del test no los envolveria. Cada caso fabrica dos empresas
 * efimeras y las borra en un `finally`.
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import { normalizePresentationName } from '@/lib/modules/inventario';
import { normalizeUnitName } from '@/lib/modules/unidades';
import { findProductRefs, findCostingBatches } from '@/lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma';
import { findFinishedGoodsReceipts } from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import { createMaterialReservations } from '@/lib/modules/inventario/adapters/driven/persistence/reservation-prisma';
import { createFinishedGoodsIntake } from '@/lib/modules/inventario/adapters/driven/persistence/finished-goods-prisma';
import { findPresentationRefs, findPresentationsByNormalizedNames } from '@/lib/modules/inventario/adapters/driven/persistence/presentation-catalog-prisma';
import {
  findAliveOrderById,
  findBlockedOrderIds,
  listAliveOrders,
  createOrderWriteRepository,
} from '@/lib/modules/pedidos/adapters/driven/persistence/order-prisma';
import { withOrderTransaction, createOrderDistributionTransaction } from '@/lib/modules/pedidos/adapters/driven/persistence/order-unit-of-work-prisma';
import {
  createRecipeExecutionReader,
  findRecipeExecutionContentById,
  findAliveRecipeByNormalizedName,
  findRecipeIdsMatchingName,
  findRecipeRefsIncludingDeleted,
} from '@/lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma';
import { findUnitRefs } from '@/lib/modules/unidades/adapters/driven/persistence/unit-catalog-prisma';
import { findUnitRefsSharingBaseInCompany } from '@/lib/modules/unidades/adapters/driven/persistence/unit-prisma';
import { prisma } from '@/lib/shared/db/prisma';

import {
  createCreateOrder,
  createUpdateOrder,
  createUpdateOrderPresentationLines,
  OrderNotFoundError,
} from '@/lib/modules/pedidos';

import type { Actor } from '@/lib/modules/pedidos';
import type { PresentationCatalog, ProductCatalog } from '@/lib/modules/inventario';
import type { OrderRepository } from '@/lib/modules/pedidos/ports/order-repository';
import type { OrderTransactionScope, OrderUnitOfWork } from '@/lib/modules/pedidos/ports/order-unit-of-work';
import type { RecipeCatalog } from '@/lib/modules/recetas';
import type { UnitCatalog } from '@/lib/modules/unidades';

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

// ---------------------------------------------------------------------------
// Cableado real: los mismos adaptadores que `lib/composition`.
// ---------------------------------------------------------------------------

const orders: OrderRepository = { findAliveById: findAliveOrderById, listAlive: listAliveOrders, findBlockedIds: findBlockedOrderIds };

const unitOfWork: OrderUnitOfWork = {
  run: (work) =>
    withOrderTransaction((tx) => {
      const scope: OrderTransactionScope = {
        orders: createOrderWriteRepository(tx),
        reservations: createMaterialReservations(tx),
        recipes: createRecipeExecutionReader(tx),
        finishedGoods: createFinishedGoodsIntake(tx),
      };
      return work(scope);
    }),
};

const recipes: RecipeCatalog = {
  findRefsIncludingDeleted: findRecipeRefsIncludingDeleted,
  findExecutionContentById: findRecipeExecutionContentById,
  findIdsMatchingName: findRecipeIdsMatchingName,
  findAliveByNormalizedName: findAliveRecipeByNormalizedName,
};

const products: ProductCatalog = { findRefs: findProductRefs, findCostingBatches, findFinishedGoodsReceipts };
const presentations: PresentationCatalog = {
  findRefs: findPresentationRefs,
  findByNormalizedNames: findPresentationsByNormalizedNames,
};
const units: UnitCatalog = {
  findRefs: findUnitRefs,
  findRefsSharingBaseInCompany: findUnitRefsSharingBaseInCompany,
};

const createOrder = createCreateOrder({ recipes, products, units, presentations, unitOfWork, now: () => new Date() });
const updateOrder = createUpdateOrder({ orders, recipes, products, units, presentations, unitOfWork, now: () => new Date() });
const updateOrderPresentationLines = createUpdateOrderPresentationLines({
  presentations,
  units,
  transaction: createOrderDistributionTransaction(),
});

// ---------------------------------------------------------------------------
// Empresa efimera: usuario, unidad, otra unidad convertible, presentacion y receta.
// ---------------------------------------------------------------------------

type Fixture = {
  readonly companyId: string;
  readonly actorId: string;
  readonly roleId: string;
  readonly documentTypeCode: string;
  readonly unitId: string;
  /** Comparte base con `unitId` (factor 1): cambiar a ella es una edicion valida. */
  readonly unitConvertibleId: string;
  /** Contenido `10.0000`, en `unitId`. */
  readonly presentationId: string;
  readonly recipeId: string;
};

function normalizeForTest(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]/gu, '');
}

async function crearFixture(): Promise<Fixture> {
  const marca = token();
  const documentType = await prisma.documentType.create({
    data: { code: `DOC${marca.slice(0, 8)}`, name: 'Tipo de documento de prueba' },
    select: { code: true },
  });
  const role = await prisma.role.create({
    data: { name: `rol-${marca}`, description: 'Rol de prueba' },
    select: { id: true },
  });
  const nombre = `Empresa ${marca}`;
  const company = await prisma.company.create({
    data: { name: nombre, nameNormalized: normalizeCompanyName(nombre) },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: {
      firstNames: 'Ana Maria',
      lastNames: 'Perez Gomez',
      birthDate: new Date('1990-05-17T00:00:00.000Z'),
      email: `ana.${marca}@quimicloude.test`,
      phone: '+57 300 111 2233',
      documentTypeCode: documentType.code,
      documentNumber: marca.slice(0, 12),
      username: `ana.${marca}`,
      passwordHash: 'hash-de-prueba-no-es-un-algoritmo-real',
      roleId: role.id,
      companyId: company.id,
    },
    select: { id: true },
  });
  const unit = await prisma.unit.create({
    data: { name: `Unidad ${marca}`, nameNormalized: normalizeUnitName(`Unidad ${marca}`), symbol: `u${marca}` },
    select: { id: true },
  });
  const unitConvertible = await prisma.unit.create({
    data: {
      name: `Unidad convertible ${marca}`,
      nameNormalized: normalizeUnitName(`Unidad convertible ${marca}`),
      symbol: `c${marca}`,
      baseUnitId: unit.id,
      factor: new Prisma.Decimal('1.0000'),
    },
    select: { id: true },
  });
  const presentation = await prisma.presentation.create({
    data: {
      name: `Bidon ${marca}`,
      nameNormalized: normalizePresentationName(`Bidon ${marca}`),
      unitId: unit.id,
      companyId: company.id,
      content: new Prisma.Decimal('10.0000'),
    },
    select: { id: true },
  });
  const recipe = await prisma.recipe.create({
    data: { name: `Receta ${marca}`, nameNormalized: normalizeForTest(`Receta ${marca}`), companyId: company.id, createdBy: user.id },
    select: { id: true },
  });
  return {
    companyId: company.id,
    actorId: user.id,
    roleId: role.id,
    documentTypeCode: documentType.code,
    unitId: unit.id,
    unitConvertibleId: unitConvertible.id,
    presentationId: presentation.id,
    recipeId: recipe.id,
  };
}

async function borrarFixture(fixture: Fixture): Promise<void> {
  await prisma.reservationMovement.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.inventoryMovement.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.orderPresentationLine.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.order.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.recipeLine.deleteMany({ where: { recipe: { companyId: fixture.companyId } } });
  await prisma.recipe.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.presentation.deleteMany({ where: { id: fixture.presentationId } });
  await prisma.unit.deleteMany({ where: { id: { in: [fixture.unitConvertibleId, fixture.unitId] } } });
  await prisma.user.deleteMany({ where: { id: fixture.actorId } });
  await prisma.role.deleteMany({ where: { id: fixture.roleId } });
  await prisma.documentType.deleteMany({ where: { code: fixture.documentTypeCode } });
  await prisma.company.deleteMany({ where: { id: fixture.companyId } });
}

async function conDosEmpresas(body: (a: Fixture, b: Fixture) => Promise<void>): Promise<void> {
  const a = await crearFixture();
  try {
    const b = await crearFixture();
    try {
      await body(a, b);
    } finally {
      await borrarFixture(b);
    }
  } finally {
    await borrarFixture(a);
  }
}

function actorDe(fixture: Fixture): Actor {
  return { id: fixture.actorId, companyId: fixture.companyId, permissions: ['pedidos.consultar', 'pedidos.modificar'] };
}

function entradaDePedido(fixture: Fixture, quantity: string, unitId: string, packages: number) {
  return {
    recipeId: fixture.recipeId,
    quantity,
    priority: 'BAJA' as const,
    unitId,
    presentationLines: [{ presentationId: fixture.presentationId, packages }],
  };
}

/** Pedido de `fixture` con 100.0000 en su unidad y 5 envases de su presentacion. */
async function pedidoDe(fixture: Fixture, status: 'PENDIENTE' | 'POR_EMPACAR'): Promise<string> {
  const creado = await createOrder(entradaDePedido(fixture, '100.0000', fixture.unitId, 5), actorDe(fixture));
  if (status !== 'PENDIENTE') {
    await prisma.order.update({ where: { id: creado.id }, data: { status } });
  }
  return creado.id;
}

/** Todo lo que una escritura ajena podria tocar: la fila del pedido y su reparto. */
async function foto(orderId: string) {
  const fila = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      companyId: true,
      unitId: true,
      quantity: true,
      recipeId: true,
      priority: true,
      status: true,
      updatedAt: true,
      updatedBy: true,
    },
  });
  const lineas = await prisma.orderPresentationLine.findMany({
    where: { orderId },
    select: { id: true, companyId: true, presentationId: true, packages: true, presentationContent: true, updatedAt: true },
    orderBy: { id: 'asc' },
  });
  return {
    fila: { ...fila, quantity: fila.quantity.toFixed(4) },
    lineas: lineas.map((linea) => ({ ...linea, presentationContent: linea.presentationContent?.toFixed(4) ?? null })),
  };
}

afterAll(async () => {
  await prisma.$disconnect();
});

// ===========================================================================
// Edicion acotada en POR_EMPACAR (`updateOrderPresentationLines`).
// ===========================================================================
describe('R29 — aislamiento: la edicion acotada del reparto y la unidad no cruza de empresa', () => {
  it('R29: la empresa B no puede editar unidad ni reparto de un pedido POR_EMPACAR de A: not_found y el pedido de A queda intacto', async () => {
    await conDosEmpresas(async (a, b) => {
      const pedidoA = await pedidoDe(a, 'POR_EMPACAR');
      const antes = await foto(pedidoA);
      expect(antes.lineas).toHaveLength(1);

      // Entrada valida para B (su unidad y su presentacion): solo el ambito del pedido la rechaza.
      const resultado = await updateOrderPresentationLines(pedidoA, actorDe(b), {
        unitId: b.unitId,
        lines: [{ presentationId: b.presentationId, packages: 2 }],
      });

      expect(resultado).toBe('not_found');
      expect(await foto(pedidoA)).toEqual(antes);
      expect(await prisma.orderPresentationLine.count({ where: { companyId: b.companyId } })).toBe(0);
    });
  });

  it('R29: control positivo, la misma edicion acotada desde A si cambia la unidad y el reparto', async () => {
    await conDosEmpresas(async (a) => {
      const pedidoA = await pedidoDe(a, 'POR_EMPACAR');

      const resultado = await updateOrderPresentationLines(pedidoA, actorDe(a), {
        unitId: a.unitConvertibleId,
        lines: [{ presentationId: a.presentationId, packages: 2 }],
      });

      expect(resultado).toBe('ok');
      const despues = await foto(pedidoA);
      expect(despues.fila.unitId).toBe(a.unitConvertibleId);
      expect(despues.fila.status).toBe('POR_EMPACAR');
      expect(despues.lineas.map(({ presentationId, packages }) => ({ presentationId, packages }))).toEqual([
        { presentationId: a.presentationId, packages: 2 },
      ]);
    });
  });

  it('R29: A no puede repartir su pedido en una presentacion de B: presentation_not_found y el pedido queda intacto', async () => {
    await conDosEmpresas(async (a, b) => {
      const pedidoA = await pedidoDe(a, 'POR_EMPACAR');
      const antes = await foto(pedidoA);

      const resultado = await updateOrderPresentationLines(pedidoA, actorDe(a), {
        unitId: a.unitId,
        lines: [{ presentationId: b.presentationId, packages: 2 }],
      });

      expect(resultado).toBe('presentation_not_found');
      expect(await foto(pedidoA)).toEqual(antes);
    });
  });

  it('R29: el adaptador `updatePresentationLinesAlive` con el ambito de B devuelve not_found y no escribe ni la fila ni las lineas de A', async () => {
    await conDosEmpresas(async (a, b) => {
      const pedidoA = await pedidoDe(a, 'POR_EMPACAR');
      const antes = await foto(pedidoA);

      const resultado = await createOrderWriteRepository(prisma).updatePresentationLinesAlive(
        pedidoA,
        b.unitId,
        [{ presentationId: b.presentationId, packages: 2, content: '10.0000' }],
        b.actorId,
        new Date(),
        { companyId: b.companyId },
      );

      expect(resultado).toBe('not_found');
      expect(await foto(pedidoA)).toEqual(antes);
      expect(await prisma.orderPresentationLine.count({ where: { companyId: b.companyId } })).toBe(0);
    });
  });

  it('R29: control positivo, el adaptador `updatePresentationLinesAlive` con el ambito de A si escribe', async () => {
    await conDosEmpresas(async (a) => {
      const pedidoA = await pedidoDe(a, 'POR_EMPACAR');

      const resultado = await createOrderWriteRepository(prisma).updatePresentationLinesAlive(
        pedidoA,
        a.unitConvertibleId,
        [{ presentationId: a.presentationId, packages: 2, content: '10.0000' }],
        a.actorId,
        new Date(),
        { companyId: a.companyId },
      );

      expect(resultado).toBe('ok');
      const despues = await foto(pedidoA);
      expect(despues.fila.unitId).toBe(a.unitConvertibleId);
      expect(despues.lineas.map(({ presentationId, packages }) => ({ presentationId, packages }))).toEqual([
        { presentationId: a.presentationId, packages: 2 },
      ]);
    });
  });
});

// ===========================================================================
// Edicion general (`updateOrder`).
// ===========================================================================
describe('R29 — aislamiento: la edicion general (cantidad, unidad y reparto) no cruza de empresa', () => {
  it('R29: la empresa B no puede editar unidad ni reparto de un pedido de A por la edicion general: OrderNotFoundError y el pedido de A queda intacto', async () => {
    await conDosEmpresas(async (a, b) => {
      const pedidoA = await pedidoDe(a, 'PENDIENTE');
      const antes = await foto(pedidoA);

      await expect(
        updateOrder(pedidoA, entradaDePedido(b, '80.0000', b.unitId, 2), actorDe(b)),
      ).rejects.toBeInstanceOf(OrderNotFoundError);

      expect(await foto(pedidoA)).toEqual(antes);
      expect(await prisma.orderPresentationLine.count({ where: { companyId: b.companyId } })).toBe(0);
    });
  });

  it('R29: control positivo, la misma edicion general desde A si cambia cantidad, unidad y reparto', async () => {
    await conDosEmpresas(async (a) => {
      const pedidoA = await pedidoDe(a, 'PENDIENTE');

      await updateOrder(pedidoA, entradaDePedido(a, '80.0000', a.unitConvertibleId, 2), actorDe(a));

      const despues = await foto(pedidoA);
      expect(despues.fila.quantity).toBe('80.0000');
      expect(despues.fila.unitId).toBe(a.unitConvertibleId);
      expect(despues.lineas.map(({ presentationId, packages }) => ({ presentationId, packages }))).toEqual([
        { presentationId: a.presentationId, packages: 2 },
      ]);
    });
  });

  it('R29: el adaptador `updateAlive` con el ambito de B devuelve not_found y no escribe ni la fila ni las lineas de A', async () => {
    await conDosEmpresas(async (a, b) => {
      const pedidoA = await pedidoDe(a, 'PENDIENTE');
      const antes = await foto(pedidoA);

      const resultado = await createOrderWriteRepository(prisma).updateAlive(
        pedidoA,
        {
          recipeId: b.recipeId,
          quantity: '80.0000',
          priority: 'BAJA',
          unitId: b.unitId,
          presentationLines: [{ presentationId: b.presentationId, packages: 2, content: '10.0000' }],
        },
        b.actorId,
        new Date(),
        null,
        { companyId: b.companyId },
      );

      expect(resultado).toBe('not_found');
      expect(await foto(pedidoA)).toEqual(antes);
      expect(await prisma.orderPresentationLine.count({ where: { companyId: b.companyId } })).toBe(0);
    });
  });
});
