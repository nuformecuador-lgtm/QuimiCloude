/**
 * La necesidad de un pedido convertida a la unidad del insumo, contra Postgres real: el alta
 * cableada a mano con los adaptadores driven REALES de `pedidos`, `recetas`, `inventario` y
 * `unidades`, igual que `order-reservation.int.test.ts`, y con las unidades de sistema que
 * siembran las migraciones (gramo y kilogramo).
 *
 * AISLAMIENTO: `withOrderTransaction` abre su PROPIA `prisma.$transaction` sobre el cliente
 * global, asi que una transaccion del test no la envolveria. Cada caso fabrica su propia empresa
 * efimera con randomUUID y la limpia en un `finally`.
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import { findCostingBatches, findProductRefs } from '@/lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma';
import { createWithFirstBatch, findFinishedGoodsReceipts } from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import { createMaterialReservations } from '@/lib/modules/inventario/adapters/driven/persistence/reservation-prisma';
import { createFinishedGoodsIntake } from '@/lib/modules/inventario/adapters/driven/persistence/finished-goods-prisma';
import {
  findPresentationRefs,
  findPresentationsByNormalizedNames,
} from '@/lib/modules/inventario/adapters/driven/persistence/presentation-catalog-prisma';
import {
  findPackagingCostingBatches,
  findPackagingRefs,
} from '@/lib/modules/inventario/adapters/driven/persistence/packaging-catalog-prisma';
import {
  createOrderWriteRepository,
  findAliveOrderById,
  findBlockedOrderIds,
  listAliveOrders,
} from '@/lib/modules/pedidos/adapters/driven/persistence/order-prisma';
import { withOrderTransaction } from '@/lib/modules/pedidos/adapters/driven/persistence/order-unit-of-work-prisma';
import {
  createRecipeExecutionReader,
  findAliveRecipeByNormalizedName,
  findRecipeExecutionContentById,
  findRecipeIdsMatchingName,
  findRecipeRefsIncludingDeleted,
} from '@/lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma';
import { findMassVolumeBridge, findUnitRefs } from '@/lib/modules/unidades/adapters/driven/persistence/unit-catalog-prisma';
import { findUnitRefsSharingBaseInCompany } from '@/lib/modules/unidades/adapters/driven/persistence/unit-prisma';
import { prisma } from '@/lib/shared/db/prisma';

import { createCreateOrder, createGetOrder } from '@/lib/modules/pedidos';

import type { Actor } from '@/lib/modules/pedidos';
import type { PackagingCatalog, PresentationCatalog, ProductCatalog } from '@/lib/modules/inventario';
import type { OrderRepository } from '@/lib/modules/pedidos/ports/order-repository';
import type { OrderTransactionScope, OrderUnitOfWork } from '@/lib/modules/pedidos/ports/order-unit-of-work';
import type { RecipeCatalog } from '@/lib/modules/recetas';
import type { UnitCatalog } from '@/lib/modules/unidades';

import { orderScopeReaders } from '../../helpers/order-scope-readers';
import { findAliveCustomerRefById, findCustomerRefsIncludingDeleted } from '@/lib/modules/clientes/adapters/driven/persistence/customer-catalog-prisma';

const customerCatalog = {
  findAliveRefById: (id: string, companyId: string) => findAliveCustomerRefById(id, { companyId }),
  findRefsIncludingDeleted: (ids: readonly string[], companyId: string) =>
    findCustomerRefsIncludingDeleted(ids, { companyId }),
};

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

function normalizeForTest(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]/gu, '');
}

const orders: OrderRepository = { findAliveById: findAliveOrderById, listAlive: listAliveOrders, findBlockedIds: findBlockedOrderIds };

const unitOfWork: OrderUnitOfWork = {
  run: (work) =>
    withOrderTransaction((tx) => {
      const scope: OrderTransactionScope = {
        orders: createOrderWriteRepository(tx),
        reservations: createMaterialReservations(tx),
        recipes: createRecipeExecutionReader(tx),
        finishedGoods: createFinishedGoodsIntake(tx),
        ...orderScopeReaders(tx),
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
const packaging: PackagingCatalog = { findRefs: findPackagingRefs, findCostingBatches: findPackagingCostingBatches };
const units: UnitCatalog = {
  findRefs: findUnitRefs,
  listVisibleRefs: () => Promise.reject(new Error('no se usa')),
  findMassVolumeBridge: () => findMassVolumeBridge(),
  findRefsSharingBaseInCompany: findUnitRefsSharingBaseInCompany,
};

const createOrder = createCreateOrder({ customerCatalog, recipes, products, units, presentations, packaging, unitOfWork, now: () => new Date() });
const getOrder = createGetOrder({ customerCatalog, orders, recipes, presentations, packaging, units });

type Fixture = {
  readonly companyId: string;
  readonly actorId: string;
  readonly roleId: string;
  readonly documentTypeCode: string;
  readonly gramoId: string;
  readonly kilogramoId: string;
};

function actorDe(fixture: Fixture): Actor {
  return { id: fixture.actorId, companyId: fixture.companyId, permissions: ['pedidos.consultar', 'pedidos.modificar'] };
}

async function unidadDeSistema(nameNormalized: string): Promise<string> {
  const row = await prisma.unit.findFirstOrThrow({
    where: { companyId: null, nameNormalized },
    select: { id: true },
  });
  return row.id;
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
  return {
    companyId: company.id,
    actorId: user.id,
    roleId: role.id,
    documentTypeCode: documentType.code,
    gramoId: await unidadDeSistema('gramo'),
    kilogramoId: await unidadDeSistema('kilogramo'),
  };
}

async function borrarFixture(fixture: Fixture): Promise<void> {
  await prisma.reservationMovement.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.inventoryMovement.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.order.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.recipeLine.deleteMany({ where: { recipe: { companyId: fixture.companyId } } });
  await prisma.recipe.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.productBatch.deleteMany({ where: { product: { companyId: fixture.companyId } } });
  await prisma.product.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.user.deleteMany({ where: { id: fixture.actorId } });
  await prisma.role.deleteMany({ where: { id: fixture.roleId } });
  await prisma.documentType.deleteMany({ where: { code: fixture.documentTypeCode } });
  await prisma.company.deleteMany({ where: { id: fixture.companyId } });
}

/** Un insumo en kg con un lote de 100 kg a 3.0000 el kg, y una receta con una linea al 10 %. */
async function sembrarRecetaSobreInsumoEnKg(fixture: Fixture): Promise<{ recipeId: string; productId: string }> {
  const created = await createWithFirstBatch(
    { name: `Insumo ${token()}`, unitId: fixture.kilogramoId },
    {
      presentationId: null,
      stock: '100',
      unitCost: '3.0000',
      lot: null,
      purchaseDate: '2026-09-01',
      expiryDate: null,
      createdBy: fixture.actorId,
    },
    new Date(),
    { companyId: fixture.companyId },
  );
  const marca = token();
  const recipe = await prisma.recipe.create({
    data: { name: `Receta ${marca}`, nameNormalized: normalizeForTest(`Receta ${marca}`), companyId: fixture.companyId, createdBy: fixture.actorId },
    select: { id: true },
  });
  await prisma.recipeLine.create({
    data: { recipeId: recipe.id, productId: created.id, percentage: new Prisma.Decimal('10.00') },
  });
  return { recipeId: recipe.id, productId: created.id };
}

async function movimientosDe(orderId: string): Promise<readonly { kind: string; quantity: string }[]> {
  const rows = await prisma.reservationMovement.findMany({
    where: { orderId },
    select: { kind: true, quantity: true },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((row) => ({ kind: row.kind, quantity: row.quantity.toFixed(4) }));
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('QC-204 — la necesidad se convierte a la unidad del insumo', () => {
  it('R10 el alta de 1000 g sobre insumo en kg deja 0.1000 en reservation_movements', async () => {
    const fixture = await crearFixture();
    try {
      const { recipeId } = await sembrarRecetaSobreInsumoEnKg(fixture);

      const creado = await createOrder(
        { recipeId, quantity: '1000', unitId: fixture.gramoId },
        actorDe(fixture),
      );

      expect(await movimientosDe(creado.id)).toEqual([{ kind: 'reserve', quantity: '0.1000' }]);
      const guardado = await prisma.order.findUniqueOrThrow({
        where: { id: creado.id },
        select: { ingredientsCost: true },
      });
      // 0.1 kg a 3.0000 el kg.
      expect(guardado.ingredientsCost?.toFixed(4)).toBe('0.3000');
    } finally {
      await borrarFixture(fixture);
    }
  });

  it('R22 un pedido guardado antes del cambio conserva su costo y lo apartado al leerlo', async () => {
    const fixture = await crearFixture();
    try {
      const { recipeId, productId } = await sembrarRecetaSobreInsumoEnKg(fixture);
      const instante = new Date();
      const scope = { companyId: fixture.companyId };

      // Lo que la formula anterior guardaba: 1000 g al 10 % leidos como 100 kg, a 3.0000.
      const orderId = await withOrderTransaction(async (tx) => {
        const order = await createOrderWriteRepository(tx).create(
          { recipeId, quantity: '1000', priority: 'BAJA', unitId: fixture.gramoId, status: 'PENDIENTE', presentationLines: [], customerId: null },
          instante.getUTCFullYear(),
          fixture.actorId,
          instante,
          { total: '300.0000', packaging: '0.0000' },
          scope,
        );
        await createMaterialReservations(tx).syncForOrder({
          orderId: order.id,
          companyId: fixture.companyId,
          requirement: [{ productId, quantity: '100' }],
          actorId: fixture.actorId,
          now: instante,
        });
        return order.id;
      });

      const vista = await getOrder(orderId, actorDe(fixture));

      expect(vista.ingredientsCost).toBe('300.0000');
      expect(await movimientosDe(orderId)).toEqual([{ kind: 'reserve', quantity: '100.0000' }]);
      const guardado = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
        select: { ingredientsCost: true },
      });
      expect(guardado.ingredientsCost?.toFixed(4)).toBe('300.0000');
    } finally {
      await borrarFixture(fixture);
    }
  });
});
