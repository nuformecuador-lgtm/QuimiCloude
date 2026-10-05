/**
 * Las herramientas de una receta no reservan, no consumen y no cuestan: crear, editar, revisar
 * bloqueados, pasar a curso y Finalizar contra Postgres real, con los casos de uso de `pedidos` cableados a
 * mano con los adaptadores driven REALES de `pedidos`, `recetas`, `inventario` y `unidades`, igual
 * que `order-reservation.int.test.ts`.
 *
 * AISLAMIENTO — `withOrderTransaction` abre su PROPIA `prisma.$transaction` sobre el cliente
 * global: una transaccion del test no la envolveria. Cada caso fabrica su propia empresa efimera
 * con randomUUID y la limpia en un `finally`.
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import { findPackagingCostingBatches, findPackagingRefs } from '@/lib/modules/inventario/adapters/driven/persistence/packaging-catalog-prisma';
import { findCostingBatches, findProductRefs } from '@/lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma';
import { createWithFirstBatch, findFinishedGoodsReceipts } from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import { createMaterialReservations } from '@/lib/modules/inventario/adapters/driven/persistence/reservation-prisma';
import { createFinishedGoodsIntake } from '@/lib/modules/inventario/adapters/driven/persistence/finished-goods-prisma';
import {
  findPresentationRefs,
  findPresentationsByNormalizedNames,
} from '@/lib/modules/inventario/adapters/driven/persistence/presentation-catalog-prisma';
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

import {
  createCreateOrder,
  createReviewBlockedOrders,
  createTransitionOrder,
  createUpdateOrder,
} from '@/lib/modules/pedidos';

import type { Actor, OrderCatalog } from '@/lib/modules/pedidos';
import type { PackagingCatalog, PresentationCatalog, ProductCatalog } from '@/lib/modules/inventario';
import type { OrderRepository } from '@/lib/modules/pedidos/ports/order-repository';
import type { OrderTransactionScope, OrderUnitOfWork } from '@/lib/modules/pedidos/ports/order-unit-of-work';
import type { RecipeCatalog } from '@/lib/modules/recetas';
import type { UnitCatalog } from '@/lib/modules/unidades';

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

// ---------------------------------------------------------------------------
// El cableado REAL: los mismos adaptadores que `lib/composition`.
// ---------------------------------------------------------------------------

const orders: OrderRepository = {
  findAliveById: findAliveOrderById,
  listAlive: listAliveOrders,
  findBlockedIds: findBlockedOrderIds,
};

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
  listVisibleRefs: () => Promise.reject(new Error('no se usa')),
  findMassVolumeBridge: () => findMassVolumeBridge(),
  findRefsSharingBaseInCompany: findUnitRefsSharingBaseInCompany,
};

const packaging: PackagingCatalog = { findRefs: findPackagingRefs, findCostingBatches: findPackagingCostingBatches };
const createOrder = createCreateOrder({ recipes, products, packaging, units, presentations, unitOfWork, now: () => new Date() });
const reviewBlockedOrders = createReviewBlockedOrders({ orders, recipes, products, packaging, units, unitOfWork });
const updateOrder = createUpdateOrder({ orders, recipes, products, packaging, units, presentations, unitOfWork });
const transitionAliveById: OrderCatalog['transitionAliveById'] = createTransitionOrder({ unitOfWork });

// ---------------------------------------------------------------------------
// Empresa efimera
// ---------------------------------------------------------------------------

type Fixture = {
  readonly companyId: string;
  readonly actorId: string;
  readonly roleId: string;
  readonly documentTypeCode: string;
  readonly presentationId: string;
  readonly unitId: string;
};

function actorDe(fixture: Fixture): Actor {
  return { id: fixture.actorId, companyId: fixture.companyId, permissions: ['pedidos.consultar', 'pedidos.modificar'] };
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
    data: { name: `Unidad ${marca}`, nameNormalized: `unidad${marca}`, symbol: `kg${marca}` },
    select: { id: true },
  });
  const presentation = await prisma.presentation.create({
    data: {
      name: `Bidon ${marca}`,
      nameNormalized: `bidon${marca}`,
      unitId: unit.id,
      companyId: company.id,
      content: '1.0000',
    },
    select: { id: true },
  });
  return {
    companyId: company.id,
    actorId: user.id,
    roleId: role.id,
    documentTypeCode: documentType.code,
    presentationId: presentation.id,
    unitId: unit.id,
  };
}

async function borrarFixture(fixture: Fixture): Promise<void> {
  await prisma.reservationMovement.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.inventoryMovement.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.order.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.productBatch.deleteMany({ where: { product: { companyId: fixture.companyId, type: 'FINISHED_PRODUCT' } } });
  await prisma.product.deleteMany({ where: { companyId: fixture.companyId, type: 'FINISHED_PRODUCT' } });
  await prisma.recipe.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.productBatch.deleteMany({ where: { product: { companyId: fixture.companyId } } });
  await prisma.product.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.presentation.deleteMany({ where: { id: fixture.presentationId } });
  await prisma.unit.deleteMany({ where: { id: fixture.unitId } });
  await prisma.user.deleteMany({ where: { id: fixture.actorId } });
  await prisma.role.deleteMany({ where: { id: fixture.roleId } });
  await prisma.documentType.deleteMany({ where: { code: fixture.documentTypeCode } });
  await prisma.company.deleteMany({ where: { id: fixture.companyId } });
}

async function productoConLote(
  fixture: Fixture,
  type: 'PRODUCT' | 'MACHINE',
  stock: string,
): Promise<{ productId: string; batchId: string }> {
  const created = await createWithFirstBatch(
    { name: `${type} ${token()}`, type },
    {
      presentationId: fixture.presentationId,
      stock,
      unitCost: '2.5000',
      lot: null,
      purchaseDate: '2026-09-01',
      expiryDate: null,
      createdBy: fixture.actorId,
    },
    new Date(),
    { companyId: fixture.companyId },
  );
  return { productId: created.id, batchId: created.batchId };
}

/** MACHINE sin ningun lote: sin existencia que reservar. */
async function maquinaSinStock(fixture: Fixture): Promise<string> {
  const marca = token();
  return (
    await prisma.product.create({
      data: { name: `MACHINE ${marca}`, nameNormalized: `machine${marca}`, companyId: fixture.companyId, type: 'MACHINE' },
      select: { id: true },
    })
  ).id;
}

async function receta(
  fixture: Fixture,
  ingredienteId: string,
  tools: ReadonlyArray<{ productId: string; quantity: number }>,
): Promise<string> {
  const marca = token();
  return (
    await prisma.recipe.create({
      data: {
        name: `Receta ${marca}`,
        nameNormalized: `receta${marca}`,
        companyId: fixture.companyId,
        createdBy: fixture.actorId,
        lines: { create: [{ productId: ingredienteId, percentage: new Prisma.Decimal('100.00') }] },
        tools: { create: tools.map((t) => ({ productId: t.productId, quantity: t.quantity })) },
      },
      select: { id: true },
    })
  ).id;
}

/** Todo lo que un pedido podria haber escrito sobre los lotes de las herramientas. */
async function asientosSobre(batchIds: readonly string[]): Promise<{ reservas: number; inventario: number }> {
  const [reservas, inventario] = await Promise.all([
    prisma.reservationMovement.count({ where: { batchId: { in: [...batchIds] } } }),
    prisma.inventoryMovement.count({ where: { batchId: { in: [...batchIds] } } }),
  ]);
  return { reservas, inventario };
}

async function filaDe(orderId: string): Promise<{ status: string; ingredientsCost: string | null }> {
  const row = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { status: true, ingredientsCost: true },
  });
  return { status: row.status, ingredientsCost: row.ingredientsCost === null ? null : row.ingredientsCost.toFixed(4) };
}

async function stockDe(batchId: string): Promise<string> {
  const row = await prisma.productBatch.findUniqueOrThrow({ where: { id: batchId }, select: { stock: true } });
  return row.stock.toFixed(4);
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('herramientas frente a reserva y consumo', () => {
  it('R8, R9: crear, revisar bloqueados, pasar a curso y Finalizar no tocan los lotes de las herramientas ni bloquean por ellas', async () => {
    const fixture = await crearFixture();
    try {
      const ingrediente = await productoConLote(fixture, 'PRODUCT', '100');
      const conLotes = await productoConLote(fixture, 'MACHINE', '5');
      const sinStock = await maquinaSinStock(fixture);
      const recipeId = await receta(fixture, ingrediente.productId, [
        { productId: conLotes.productId, quantity: 2 },
        { productId: sinStock, quantity: 1 },
      ]);
      const herramientas = [conLotes.batchId];
      // El alta del lote ya asento su entrada: lo que se vigila es que nada se sume despues.
      const antes = await asientosSobre(herramientas);
      expect(antes.reservas).toBe(0);

      const creado = await createOrder({ recipeId, quantity: '10.0000', unitId: fixture.unitId }, actorDe(fixture));
      expect((await filaDe(creado.id)).status).toBe('PENDIENTE');

      // Un segundo pedido que no alcanza por el ingrediente; al reponerlo, la revision lo libera.
      const bloqueado = await createOrder(
        { recipeId, quantity: '200.0000', unitId: fixture.unitId, confirmBlocked: true },
        actorDe(fixture),
      );
      expect((await filaDe(bloqueado.id)).status).toBe('BLOQUEADO');
      await prisma.productBatch.create({
        data: {
          productId: ingrediente.productId,
          presentationId: fixture.presentationId,
          stock: new Prisma.Decimal('500'),
          unitCost: new Prisma.Decimal('2.5000'),
          lot: `L${token().slice(0, 12)}`,
          purchaseDate: new Date('2026-09-02T00:00:00.000Z'),
          companyId: fixture.companyId,
        },
      });
      expect(await reviewBlockedOrders({ companyId: fixture.companyId, now: new Date() })).toEqual({
        unblocked: 1,
        failed: [],
      });
      expect((await filaDe(bloqueado.id)).status).toBe('PENDIENTE');

      await transitionAliveById(creado.id, fixture.companyId, 'PENDIENTE', 'EN_CURSO', fixture.actorId, new Date());
      expect(
        await transitionAliveById(creado.id, fixture.companyId, 'EN_CURSO', 'POR_EMPACAR', fixture.actorId, new Date()),
      ).toBe('ok');

      expect(await asientosSobre(herramientas)).toEqual(antes);
      expect(await stockDe(conLotes.batchId)).toBe('5.0000');
      expect(await stockDe(ingrediente.batchId)).toBe('90.0000');
      expect(
        await prisma.reservationMovement.count({ where: { orderId: { in: [creado.id, bloqueado.id] } } }),
      ).toBeGreaterThan(0);
    } finally {
      await borrarFixture(fixture);
    }
  });

  it('R8: editar un pedido cuya receta tiene herramientas no aparta nada sobre ellas ni lo bloquea por ellas', async () => {
    const fixture = await crearFixture();
    try {
      const ingrediente = await productoConLote(fixture, 'PRODUCT', '100');
      const conLotes = await productoConLote(fixture, 'MACHINE', '5');
      const sinStock = await maquinaSinStock(fixture);
      const recipeId = await receta(fixture, ingrediente.productId, [
        { productId: conLotes.productId, quantity: 2 },
        { productId: sinStock, quantity: 1 },
      ]);
      const herramientas = [conLotes.batchId];
      const antes = await asientosSobre(herramientas);

      const pedido = await createOrder({ recipeId, quantity: '10.0000', unitId: fixture.unitId }, actorDe(fixture));
      const editar = (quantity: string, confirmBlocked = false): Promise<void> =>
        updateOrder(pedido.id, { recipeId, quantity, unitId: fixture.unitId, confirmBlocked }, actorDe(fixture));

      await editar('50.0000');
      expect((await filaDe(pedido.id)).status).toBe('PENDIENTE');

      await editar('200.0000', true);
      expect((await filaDe(pedido.id)).status).toBe('BLOQUEADO');

      await editar('30.0000');
      expect((await filaDe(pedido.id)).status).toBe('PENDIENTE');

      expect(await asientosSobre(herramientas)).toEqual(antes);
      expect(await stockDe(conLotes.batchId)).toBe('5.0000');
      expect(
        await prisma.reservationMovement.count({ where: { orderId: pedido.id, batchId: ingrediente.batchId } }),
      ).toBeGreaterThan(0);
    } finally {
      await borrarFixture(fixture);
    }
  });

  it('R10: el costo de ingredientes es el mismo con y sin herramientas', async () => {
    const fixture = await crearFixture();
    try {
      const ingrediente = await productoConLote(fixture, 'PRODUCT', '100');
      const maquina = await productoConLote(fixture, 'MACHINE', '5');
      const sin = await receta(fixture, ingrediente.productId, []);
      const con = await receta(fixture, ingrediente.productId, [
        { productId: maquina.productId, quantity: 3 },
        { productId: await maquinaSinStock(fixture), quantity: 1 },
      ]);

      const pedidoSin = await createOrder({ recipeId: sin, quantity: '10.0000', unitId: fixture.unitId }, actorDe(fixture));
      const pedidoCon = await createOrder({ recipeId: con, quantity: '10.0000', unitId: fixture.unitId }, actorDe(fixture));

      const costoSin = (await filaDe(pedidoSin.id)).ingredientsCost;
      expect(costoSin).toBe('25.0000');
      expect((await filaDe(pedidoCon.id)).ingredientsCost).toBe(costoSin);
    } finally {
      await borrarFixture(fixture);
    }
  });
});
