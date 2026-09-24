/**
 * El Finalizar da de alta el producto terminado, contra Postgres real: el mismo cableado
 * que `order-reservation.int.test.ts` (los adaptadores driven REALES de `pedidos`,
 * `recetas`, `inventario` y `unidades`, sin pasar por `lib/composition`), con `finishAssignedOrder`
 * de `asignaciones` encima.
 *
 * AISLAMIENTO — mismo criterio que `order-reservation.int.test.ts`: `withOrderTransaction` abre
 * su PROPIA `prisma.$transaction` sobre el cliente global, asi que envolver la corrida en una
 * transaccion del test seria aislamiento de mentira. Cada caso fabrica su propia empresa efimera
 * con randomUUID y la limpia en un `finally`.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import { findCostingBatches, findProductRefs } from '@/lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma';
import { createWithFirstBatch } from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import { createMaterialReservations } from '@/lib/modules/inventario/adapters/driven/persistence/reservation-prisma';
import { createFinishedGoodsIntake } from '@/lib/modules/inventario/adapters/driven/persistence/finished-goods-prisma';
import { findPresentationRefs } from '@/lib/modules/inventario/adapters/driven/persistence/presentation-catalog-prisma';
import {
  findAliveOrderById,
  createOrderWriteRepository,
} from '@/lib/modules/pedidos/adapters/driven/persistence/order-prisma';
import { withOrderTransaction } from '@/lib/modules/pedidos/adapters/driven/persistence/order-unit-of-work-prisma';
import {
  createRecipeExecutionReader,
  findRecipeExecutionContentById,
  findRecipeIdsMatchingName,
  findRecipeRefsIncludingDeleted,
} from '@/lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma';
import { findUnitRefs } from '@/lib/modules/unidades/adapters/driven/persistence/unit-catalog-prisma';
import { findUnitRefsSharingBaseInCompany } from '@/lib/modules/unidades/adapters/driven/persistence/unit-prisma';
import { prisma } from '@/lib/shared/db/prisma';

import { createCreateOrder, createTransitionOrder, createUpdateOrder } from '@/lib/modules/pedidos';
import { createFinishAssignedOrder } from '@/lib/modules/asignaciones/domain/finish-assigned-order';
import { UnauthorizedError } from '@/lib/modules/asignaciones/domain/errors';

import type { Actor, NewOrder, OrderCatalog } from '@/lib/modules/pedidos';
import type { PresentationCatalog, ProductCatalog } from '@/lib/modules/inventario';
import type { OrderTransactionScope, OrderUnitOfWork } from '@/lib/modules/pedidos/ports/order-unit-of-work';
import type { RecipeCatalog } from '@/lib/modules/recetas';
import type { UnitCatalog } from '@/lib/modules/unidades';
import type { Actor as AsignacionesActor } from '@/lib/modules/asignaciones/domain/actor';
import type { OrderAssignmentRepository } from '@/lib/modules/asignaciones/ports/order-assignment-repository';

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

// ---------------------------------------------------------------------------
// El cableado REAL: los mismos adaptadores que `lib/composition`.
// ---------------------------------------------------------------------------

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
};

const products: ProductCatalog = { findRefs: findProductRefs, findCostingBatches };
const presentations: PresentationCatalog = { findRefs: findPresentationRefs };
const units: UnitCatalog = {
  findRefs: findUnitRefs,
  findRefsSharingBaseInCompany: findUnitRefsSharingBaseInCompany,
};

const createOrder = createCreateOrder({ recipes, products, units, presentations, unitOfWork, now: () => new Date() });
const updateOrder = createUpdateOrder({ orders: { findAliveById: findAliveOrderById, listAlive: async () => { throw new Error('sin uso en este archivo'); } }, recipes, products, units, presentations, unitOfWork, now: () => new Date() });

const orderCatalog: OrderCatalog = {
  findAliveById: async (id, companyId) => {
    const row = await findAliveOrderById(id, { companyId });
    return row === null ? null : { id: row.id, status: row.status };
  },
  listAliveSummariesByIds: async (companyId, ids, statuses, page, pageSize) => {
    const { listAliveOrderSummariesByIds } = await import('@/lib/modules/pedidos/adapters/driven/persistence/order-catalog-prisma');
    return listAliveOrderSummariesByIds(companyId, ids, statuses, page, pageSize);
  },
  listAliveSummariesInCompany: async () => {
    throw new Error('este archivo no ejercita listAliveSummariesInCompany');
  },
  transitionAliveById: createTransitionOrder({ unitOfWork, recipes, products, units }),
};

function finishAssignedOrderPara(orderId: string) {
  return createFinishAssignedOrder({
    assignments: {
      listOrderIdsByUserInCompany: async () => [orderId],
    } as unknown as OrderAssignmentRepository,
    orders: orderCatalog,
    now: () => new Date(),
  });
}

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

function asignacionesActorDe(fixture: Fixture): AsignacionesActor {
  return { id: fixture.actorId, companyId: fixture.companyId, permissions: ['asignaciones.consultar'] };
}

async function crearFixture(content: string | null = '1.0000'): Promise<Fixture> {
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
      name: `Botella ${marca}`,
      nameNormalized: normalizeForTest(`Botella ${marca}`),
      unitId: unit.id,
      companyId: company.id,
      content,
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

async function borrarFixture(fixture: Fixture, productIds: readonly string[]): Promise<void> {
  await prisma.reservationMovement.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.inventoryMovement.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.order.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.recipeLine.deleteMany({ where: { recipe: { companyId: fixture.companyId } } });
  // El producto terminado que un Finalizar da de alta referencia la receta con
  // `ON DELETE RESTRICT`: se limpia ANTES de borrar la receta.
  await prisma.productBatch.deleteMany({ where: { product: { companyId: fixture.companyId, type: 'FINISHED_PRODUCT' } } });
  await prisma.product.deleteMany({ where: { companyId: fixture.companyId, type: 'FINISHED_PRODUCT' } });
  await prisma.recipe.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.productBatch.deleteMany({ where: { productId: { in: [...productIds] } } });
  await prisma.product.deleteMany({ where: { id: { in: [...productIds] } } });
  await prisma.presentation.deleteMany({ where: { id: fixture.presentationId } });
  await prisma.unit.deleteMany({ where: { id: fixture.unitId } });
  await prisma.user.deleteMany({ where: { id: fixture.actorId } });
  await prisma.role.deleteMany({ where: { id: fixture.roleId } });
  await prisma.documentType.deleteMany({ where: { code: fixture.documentTypeCode } });
  await prisma.company.deleteMany({ where: { id: fixture.companyId } });
}

async function crearReceta(fixture: Fixture, nombre = `Receta ${token()}`): Promise<string> {
  const recipe = await prisma.recipe.create({
    data: { name: nombre, nameNormalized: normalizeForTest(nombre), companyId: fixture.companyId, createdBy: fixture.actorId },
    select: { id: true },
  });
  return recipe.id;
}

async function crearLineaCompleta(recipeId: string, productId: string): Promise<void> {
  await prisma.recipeLine.create({ data: { recipeId, productId, percentage: '100.00' } });
}

async function crearLinea(recipeId: string, productId: string, percentage: string): Promise<void> {
  await prisma.recipeLine.create({ data: { recipeId, productId, percentage } });
}

/** Ingrediente MACHINE con lote de stock pero sin costo (`unit_cost` nulo): admitido desde
 *  `20260923140000_product_batch_nullable_machine`. Con presentacion -a diferencia del alta
 *  sin envase- para que `planReservation` le resuelva unidad y lo trate como material real. */
async function crearMaquinaSinCosto(fixture: Fixture, stock: string): Promise<{ productId: string }> {
  const created = await createWithFirstBatch(
    { name: `Maquina ${token()}`, type: 'MACHINE' },
    {
      presentationId: fixture.presentationId,
      stock,
      unitCost: null,
      lot: null,
      purchaseDate: '2026-09-01',
      expiryDate: null,
      createdBy: fixture.actorId,
    },
    new Date(),
    { companyId: fixture.companyId },
  );
  return { productId: created.id };
}

async function crearProductoConLote(fixture: Fixture, stock: string, unitCost = '2.5000'): Promise<{ productId: string; batchId: string }> {
  const created = await createWithFirstBatch(
    { name: `Producto ${token()}` },
    {
      presentationId: fixture.presentationId,
      stock,
      unitCost,
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

function nuevoPedido(recipeId: string, presentationId: string, quantity: string): NewOrder {
  return { recipeId, quantity, priority: 'BAJA', status: 'PENDIENTE', presentationId, presentationContent: null };
}

async function finishedProductDe(companyId: string, recipeId: string, presentationId: string) {
  return prisma.product.findFirst({
    where: { companyId, recipeId, presentationId, type: 'FINISHED_PRODUCT', deletedAt: null },
    select: { id: true, name: true, unitId: true },
  });
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('R10, R41 — Finalizar deja el pedido ENTREGADO, consume material y da de alta el lote', () => {
  it('un producto terminado nuevo nace con su lote a partir de la combinacion del pedido', async () => {
    const fixture = await crearFixture('1.0000');
    const { productId, batchId } = await crearProductoConLote(fixture, '100');
    const recipeId = await crearReceta(fixture, `Desengrasante ${token()}`);
    await crearLineaCompleta(recipeId, productId);

    try {
      const creado = await createOrder(nuevoPedido(recipeId, fixture.presentationId, '10.0000'), actorDe(fixture));

      const resultado = await orderCatalog.transitionAliveById(
        creado.id,
        fixture.companyId,
        'PENDIENTE',
        'ENTREGADO',
        fixture.actorId,
        new Date(),
      );

      expect(resultado).toMatchObject({ kind: 'ok', finishedGoods: { packages: '10' } });

      const producto = await finishedProductDe(fixture.companyId, recipeId, fixture.presentationId);
      expect(producto).not.toBeNull();
      expect(producto?.unitId).toBe(fixture.unitId);

      const lote = await prisma.productBatch.findFirst({
        where: { productId: producto?.id },
        select: { stock: true, unitCost: true, packageContent: true, presentationId: true },
      });
      expect(lote?.stock.toFixed(4)).toBe('10.0000');
      expect(lote?.packageContent?.toFixed(4)).toBe('1.0000');
      expect(lote?.presentationId).toBe(fixture.presentationId);

      const asiento = await prisma.inventoryMovement.findFirst({
        where: { orderId: creado.id, kind: 'production' },
        select: { quantity: true, orderId: true, createdBy: true },
      });
      expect(asiento?.quantity.toFixed(4)).toBe('10.0000');
      expect(asiento?.orderId).toBe(creado.id);
      expect(asiento?.createdBy).toBe(fixture.actorId);

      const row = await prisma.order.findUniqueOrThrow({ where: { id: creado.id }, select: { status: true } });
      expect(row.status).toBe('ENTREGADO');
      expect(await prisma.productBatch.findUniqueOrThrow({ where: { id: batchId }, select: { stock: true } }).then((b) => b.stock.toFixed(4))).toBe('90.0000');
    } finally {
      await borrarFixture(fixture, [productId]);
    }
  });
});

describe('R18, R20 — sin contenido, el Finalizar rechaza sin cambiar nada', () => {
  it('un pedido sin copia y una presentacion sin contenido rechaza con presentation_without_content, sin tocar el pedido, el apartado ni las existencias', async () => {
    const fixture = await crearFixture(null);
    const { productId, batchId } = await crearProductoConLote(fixture, '100');
    const recipeId = await crearReceta(fixture);
    await crearLineaCompleta(recipeId, productId);

    try {
      const creado = await createOrder(nuevoPedido(recipeId, fixture.presentationId, '10.0000'), actorDe(fixture));

      const resultado = await orderCatalog.transitionAliveById(
        creado.id,
        fixture.companyId,
        'PENDIENTE',
        'ENTREGADO',
        fixture.actorId,
        new Date(),
      );

      expect(resultado).toBe('presentation_without_content');

      const row = await prisma.order.findUniqueOrThrow({ where: { id: creado.id }, select: { status: true, reservedAt: true } });
      expect(row.status).toBe('PENDIENTE');
      expect(row.reservedAt).not.toBeNull();
      expect(await prisma.productBatch.findUniqueOrThrow({ where: { id: batchId }, select: { stock: true } }).then((b) => b.stock.toFixed(4))).toBe('100.0000');
      expect(await finishedProductDe(fixture.companyId, recipeId, fixture.presentationId)).toBeNull();
    } finally {
      await borrarFixture(fixture, [productId]);
    }
  });
});

describe('R23, D24 — receta de otra empresa', () => {
  it('R23, D24 — un pedido de la empresa B con su presentación y el recipeId de la empresa A se rechaza con recipe_not_found y no escribe nada en ninguna empresa', async () => {
    const fixtureA = await crearFixture('1.0000');
    const fixtureB = await crearFixture('1.0000');
    const recipeIdDeA = await crearReceta(fixtureA);

    const now = new Date();
    const orderB = await prisma.order.create({
      data: {
        orderYear: now.getUTCFullYear(),
        orderSequence: 1,
        recipeId: recipeIdDeA,
        quantity: '10.0000',
        companyId: fixtureB.companyId,
        presentationId: fixtureB.presentationId,
        presentationContent: '1.0000',
        createdAt: now,
      },
      select: { id: true },
    });

    const contarTodo = () =>
      Promise.all([
        prisma.product.count({ where: { companyId: { in: [fixtureA.companyId, fixtureB.companyId] } } }),
        prisma.productBatch.count({ where: { companyId: { in: [fixtureA.companyId, fixtureB.companyId] } } }),
        prisma.inventoryMovement.count({ where: { companyId: { in: [fixtureA.companyId, fixtureB.companyId] } } }),
      ]);

    try {
      const antes = await contarTodo();

      const resultado = await orderCatalog.transitionAliveById(
        orderB.id,
        fixtureB.companyId,
        'PENDIENTE',
        'ENTREGADO',
        fixtureB.actorId,
        new Date(),
      );

      expect(resultado).toBe('recipe_not_found');

      const row = await prisma.order.findUniqueOrThrow({ where: { id: orderB.id }, select: { status: true } });
      expect(row.status).toBe('PENDIENTE');

      const despues = await contarTodo();
      expect(despues).toEqual(antes);
    } finally {
      await borrarFixture(fixtureB, []);
      await borrarFixture(fixtureA, []);
    }
  });
});

describe('R27 — la edicion en Pedidos no da de alta producto terminado', () => {
  it('R27: editar un pedido EN_CURSO por el caso de uso real de edicion no crea producto, lote ni asiento, y el pedido sigue sin ENTREGADO', async () => {
    const fixture = await crearFixture('1.0000');
    const { productId, batchId } = await crearProductoConLote(fixture, '100');
    const recipeId = await crearReceta(fixture, `Desengrasante ${token()}`);
    await crearLineaCompleta(recipeId, productId);

    try {
      const creado = await createOrder(nuevoPedido(recipeId, fixture.presentationId, '10.0000'), actorDe(fixture));

      const aEnCurso = await orderCatalog.transitionAliveById(
        creado.id,
        fixture.companyId,
        'PENDIENTE',
        'EN_CURSO',
        fixture.actorId,
        new Date(),
      );
      expect(aEnCurso).toBe('ok');

      // `updateOrderSchema` no declara `status`: `z.object` lo descarta en el borde, asi que
      // esta entrada nunca podria mover el pedido a `ENTREGADO` aunque el dato viaje aqui.
      await updateOrder(
        creado.id,
        { recipeId, quantity: '20.0000', presentationId: fixture.presentationId, status: 'ENTREGADO' },
        actorDe(fixture),
      );

      const row = await prisma.order.findUniqueOrThrow({ where: { id: creado.id }, select: { status: true, quantity: true } });
      expect(row.status).toBe('EN_CURSO');
      expect(row.quantity.toFixed(4)).toBe('20.0000');

      expect(await finishedProductDe(fixture.companyId, recipeId, fixture.presentationId)).toBeNull();
      const loteConContenido = await prisma.productBatch.findFirst({
        where: { product: { companyId: fixture.companyId }, packageContent: { not: null } },
        select: { id: true },
      });
      expect(loteConContenido).toBeNull();
      const asientoDeProduccion = await prisma.inventoryMovement.findFirst({
        where: { orderId: creado.id, kind: 'production' },
        select: { id: true },
      });
      expect(asientoDeProduccion).toBeNull();
      expect(await prisma.productBatch.findUniqueOrThrow({ where: { id: batchId }, select: { stock: true } }).then((b) => b.stock.toFixed(4))).toBe('100.0000');
    } finally {
      await borrarFixture(fixture, [productId]);
    }
  });
});

describe('R20 — un fallo forzado tras el lote deshace la transaccion entera', () => {
  it('un finishedGoods que escribe y luego lanza no deja ni el estado, ni el consumo, ni el producto', async () => {
    const fixture = await crearFixture('1.0000');
    const { productId, batchId } = await crearProductoConLote(fixture, '100');
    const recipeId = await crearReceta(fixture);
    await crearLineaCompleta(recipeId, productId);

    const unitOfWorkQueForzaFallo: OrderUnitOfWork = {
      run: (work) =>
        withOrderTransaction((tx) => {
          const real = createFinishedGoodsIntake(tx);
          const scope: OrderTransactionScope = {
            orders: createOrderWriteRepository(tx),
            reservations: createMaterialReservations(tx),
            recipes: createRecipeExecutionReader(tx),
            finishedGoods: {
              receiveFromOrder: async (input) => {
                await real.receiveFromOrder(input);
                throw new Error('fallo forzado tras el lote, para R20');
              },
            },
          };
          return work(scope);
        }),
    };
    const transitionAliveByIdConFallo = createTransitionOrder({
      unitOfWork: unitOfWorkQueForzaFallo,
      recipes,
      products,
      units,
    });

    try {
      const creado = await createOrder(nuevoPedido(recipeId, fixture.presentationId, '10.0000'), actorDe(fixture));

      await expect(
        transitionAliveByIdConFallo(creado.id, fixture.companyId, 'PENDIENTE', 'ENTREGADO', fixture.actorId, new Date()),
      ).rejects.toThrow('fallo forzado tras el lote, para R20');

      const row = await prisma.order.findUniqueOrThrow({ where: { id: creado.id }, select: { status: true, reservedAt: true } });
      expect(row.status).toBe('PENDIENTE');
      expect(row.reservedAt).not.toBeNull();
      expect(await prisma.productBatch.findUniqueOrThrow({ where: { id: batchId }, select: { stock: true } }).then((b) => b.stock.toFixed(4))).toBe('100.0000');
      expect(await finishedProductDe(fixture.companyId, recipeId, fixture.presentationId)).toBeNull();
    } finally {
      await borrarFixture(fixture, [productId]);
    }
  });
});

describe('R21 — un solo lote por pedido, tambien a la vez', () => {
  it('dos Finalizar del mismo pedido, uno tras otro, no dan de alta un segundo lote', async () => {
    const fixture = await crearFixture('1.0000');
    const { productId } = await crearProductoConLote(fixture, '100');
    const recipeId = await crearReceta(fixture);
    await crearLineaCompleta(recipeId, productId);

    try {
      const creado = await createOrder(nuevoPedido(recipeId, fixture.presentationId, '10.0000'), actorDe(fixture));

      await orderCatalog.transitionAliveById(creado.id, fixture.companyId, 'PENDIENTE', 'ENTREGADO', fixture.actorId, new Date());
      await expect(
        orderCatalog.transitionAliveById(creado.id, fixture.companyId, 'ENTREGADO', 'ENTREGADO', fixture.actorId, new Date()),
      ).rejects.toThrow();

      const producto = await finishedProductDe(fixture.companyId, recipeId, fixture.presentationId);
      const lotes = await prisma.productBatch.findMany({ where: { productId: producto?.id } });
      expect(lotes).toHaveLength(1);
    } finally {
      await borrarFixture(fixture, [productId]);
    }
  });

  it('dos Finalizar del mismo pedido A LA VEZ terminan con un solo lote', async () => {
    const fixture = await crearFixture('1.0000');
    const { productId } = await crearProductoConLote(fixture, '100');
    const recipeId = await crearReceta(fixture);
    await crearLineaCompleta(recipeId, productId);

    try {
      const creado = await createOrder(nuevoPedido(recipeId, fixture.presentationId, '10.0000'), actorDe(fixture));

      const resultados = await Promise.allSettled([
        orderCatalog.transitionAliveById(creado.id, fixture.companyId, 'PENDIENTE', 'ENTREGADO', fixture.actorId, new Date()),
        orderCatalog.transitionAliveById(creado.id, fixture.companyId, 'PENDIENTE', 'ENTREGADO', fixture.actorId, new Date()),
      ]);
      const exitos = resultados.filter(
        (r) => r.status === 'fulfilled' && typeof r.value === 'object' && r.value.kind === 'ok',
      );
      expect(exitos).toHaveLength(1);

      const producto = await finishedProductDe(fixture.companyId, recipeId, fixture.presentationId);
      const lotes = await prisma.productBatch.findMany({ where: { productId: producto?.id } });
      expect(lotes).toHaveLength(1);
    } finally {
      await borrarFixture(fixture, [productId]);
    }
  });
});

describe('R24, R26 — el Finalizar de asignaciones devuelve el lote y exige el permiso primero', () => {
  it('R24: el resultado lleva el numero de envases y el nombre del producto terminado', async () => {
    const fixture = await crearFixture('1.0000');
    const { productId } = await crearProductoConLote(fixture, '100');
    const recipeId = await crearReceta(fixture, `Desengrasante ${token()}`);
    await crearLineaCompleta(recipeId, productId);

    try {
      const creado = await createOrder(nuevoPedido(recipeId, fixture.presentationId, '10.0000'), actorDe(fixture));

      const resultado = await finishAssignedOrderPara(creado.id)(asignacionesActorDe(fixture), { orderId: creado.id });

      expect(resultado.packages).toBe('10');
      const producto = await finishedProductDe(fixture.companyId, recipeId, fixture.presentationId);
      expect(resultado.productName).toBe(producto?.name);
    } finally {
      await borrarFixture(fixture, [productId]);
    }
  });

  it('R26: sin el permiso, rechaza ANTES de leer el pedido y sin dar de alta nada', async () => {
    const fixture = await crearFixture('1.0000');
    const { productId } = await crearProductoConLote(fixture, '100');
    const recipeId = await crearReceta(fixture);
    await crearLineaCompleta(recipeId, productId);

    try {
      const creado = await createOrder(nuevoPedido(recipeId, fixture.presentationId, '10.0000'), actorDe(fixture));

      await expect(
        finishAssignedOrderPara(creado.id)({ id: fixture.actorId, companyId: fixture.companyId, permissions: [] }, { orderId: creado.id }),
      ).rejects.toBeInstanceOf(UnauthorizedError);

      const row = await prisma.order.findUniqueOrThrow({ where: { id: creado.id }, select: { status: true } });
      expect(row.status).toBe('PENDIENTE');
      expect(await finishedProductDe(fixture.companyId, recipeId, fixture.presentationId)).toBeNull();
    } finally {
      await borrarFixture(fixture, [productId]);
    }
  });
});

describe('R42, R43 — el coste del lote', () => {
  it('con importe guardado, el lote entra a ese coste dividido entre la cantidad que entra, y el pedido no cambia (R43)', async () => {
    const fixture = await crearFixture('1.0000');
    const { productId } = await crearProductoConLote(fixture, '100', '2.0000');
    const recipeId = await crearReceta(fixture);
    await crearLineaCompleta(recipeId, productId);

    try {
      const creado = await createOrder(nuevoPedido(recipeId, fixture.presentationId, '10.0000'), actorDe(fixture));
      const antes = await prisma.order.findUniqueOrThrow({ where: { id: creado.id }, select: { ingredientsCost: true } });
      expect(antes.ingredientsCost?.toFixed(4)).toBe('20.0000');

      await orderCatalog.transitionAliveById(creado.id, fixture.companyId, 'PENDIENTE', 'ENTREGADO', fixture.actorId, new Date());

      const producto = await finishedProductDe(fixture.companyId, recipeId, fixture.presentationId);
      const lote = await prisma.productBatch.findFirstOrThrow({ where: { productId: producto?.id }, select: { unitCost: true } });
      // 20.0000 (importe guardado) / 10 (cantidad que entra) = 2.0000
      expect(lote.unitCost?.toFixed(4)).toBe('2.0000');

      const despues = await prisma.order.findUniqueOrThrow({ where: { id: creado.id }, select: { ingredientsCost: true } });
      expect(despues.ingredientsCost?.toFixed(4)).toBe('20.0000');
    } finally {
      await borrarFixture(fixture, [productId]);
    }
  });

  it('con importe nulo, se recalcula al Finalizar -antes de consumir- con la receta que el pedido tiene en ese instante (R42, R43)', async () => {
    const fixture = await crearFixture('1.0000');
    const { productId, batchId } = await crearProductoConLote(fixture, '100', '3.0000');
    const recipeVacia = await crearReceta(fixture);
    const recipeConLinea = await crearReceta(fixture);
    await crearLineaCompleta(recipeConLinea, productId);

    try {
      // Se crea con la receta VACIA -sin lineas, `calculateIngredientsCost` devuelve `null`,
      // que tampoco aparta nada-; se recarga con la receta con linea por fuera del caso de uso,
      // igual que el patron de `order-reservation.int.test.ts`: el pedido llega al Finalizar sin
      // nada apartado y sin importe guardado.
      const creado = await createOrder(nuevoPedido(recipeVacia, fixture.presentationId, '10.0000'), actorDe(fixture));
      const antes = await prisma.order.findUniqueOrThrow({ where: { id: creado.id }, select: { ingredientsCost: true } });
      expect(antes.ingredientsCost).toBeNull();
      await prisma.order.update({ where: { id: creado.id }, data: { recipeId: recipeConLinea } });

      const resultado = await orderCatalog.transitionAliveById(creado.id, fixture.companyId, 'PENDIENTE', 'ENTREGADO', fixture.actorId, new Date());
      expect(resultado).toMatchObject({ kind: 'ok', finishedGoods: { packages: '10' } });

      const producto = await finishedProductDe(fixture.companyId, recipeConLinea, fixture.presentationId);
      const lote = await prisma.productBatch.findFirstOrThrow({ where: { productId: producto?.id }, select: { unitCost: true } });
      // Sin importe guardado, se recalcula: 10 (100% de 10) x 3.0000 = 30.0000, dividido entre
      // 10 (cantidad que entra) = 3.0000. El disponible se lee YA con la receta nueva -si se
      // hubiera leido antes de consumir con la receta vieja (vacia), el resultado seria 0-.
      expect(lote.unitCost?.toFixed(4)).toBe('3.0000');
      expect(await prisma.productBatch.findUniqueOrThrow({ where: { id: batchId }, select: { stock: true } }).then((b) => b.stock.toFixed(4))).toBe('90.0000');

      const despues = await prisma.order.findUniqueOrThrow({ where: { id: creado.id }, select: { ingredientsCost: true } });
      // El importe guardado del pedido sigue nulo: el recalculo del lote no lo escribe.
      expect(despues.ingredientsCost).toBeNull();
    } finally {
      await borrarFixture(fixture, [productId]);
    }
  });

  it('R42: un ingrediente con material pero sin costo cuenta cero, y el pedido sigue sin importe guardado (R43)', async () => {
    const fixture = await crearFixture('1.0000');
    const { productId: productoConCosto } = await crearProductoConLote(fixture, '100', '5.0000');
    const { productId: maquinaSinCosto } = await crearMaquinaSinCosto(fixture, '50');
    const recipeId = await crearReceta(fixture);
    await crearLinea(recipeId, productoConCosto, '60.00');
    await crearLinea(recipeId, maquinaSinCosto, '40.00');

    try {
      const creado = await createOrder(nuevoPedido(recipeId, fixture.presentationId, '10.0000'), actorDe(fixture));
      const antes = await prisma.order.findUniqueOrThrow({ where: { id: creado.id }, select: { ingredientsCost: true } });
      // El ingrediente MACHINE sin costo invalida el importe del pedido entero.
      expect(antes.ingredientsCost).toBeNull();

      const resultado = await orderCatalog.transitionAliveById(creado.id, fixture.companyId, 'PENDIENTE', 'ENTREGADO', fixture.actorId, new Date());
      expect(resultado).toMatchObject({ kind: 'ok', finishedGoods: { packages: '10' } });

      const producto = await finishedProductDe(fixture.companyId, recipeId, fixture.presentationId);
      const lote = await prisma.productBatch.findFirstOrThrow({ where: { productId: producto?.id }, select: { unitCost: true } });
      // Solo el ingrediente con costo cuenta: 60% de 10 x 5.0000 = 30.0000, entre 10 (cantidad
      // que entra) = 3.0000. El de la maquina sin costo aporta cero.
      expect(lote.unitCost?.toFixed(4)).toBe('3.0000');

      const despues = await prisma.order.findUniqueOrThrow({ where: { id: creado.id }, select: { ingredientsCost: true } });
      expect(despues.ingredientsCost).toBeNull();
    } finally {
      await borrarFixture(fixture, [productoConCosto, maquinaSinCosto]);
    }
  });
});
