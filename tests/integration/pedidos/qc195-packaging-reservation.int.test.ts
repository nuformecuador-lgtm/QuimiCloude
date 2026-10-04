/**
 * QC-195 — los envases del reparto se apartan con el mismo flujo que las materias primas, contra
 * Postgres real: alta, edicion completa, revision de bloqueados y cancelacion, cableados a mano
 * con los adaptadores driven reales (mismo conjunto que `lib/composition`).
 *
 * AISLAMIENTO — `withOrderTransaction` abre su propia `prisma.$transaction` sobre el cliente
 * global: una transaccion del test seria aislamiento de mentira. Cada caso fabrica su empresa
 * efimera con randomUUID y la limpia en un `finally`.
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import { findPackagingCostingBatches, findPackagingRefs } from '@/lib/modules/inventario/adapters/driven/persistence/packaging-catalog-prisma';
import { findCostingBatches, findProductRefs } from '@/lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma';
import { addBatchToAlive, createWithFirstBatch, findFinishedGoodsReceipts } from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
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
import { findUnitRefs } from '@/lib/modules/unidades/adapters/driven/persistence/unit-catalog-prisma';
import { findUnitRefsSharingBaseInCompany } from '@/lib/modules/unidades/adapters/driven/persistence/unit-prisma';
import { prisma } from '@/lib/shared/db/prisma';

import {
  createCancelOrder,
  createCreateOrder,
  createQuoteOrderCost,
  createDeleteOrder,
  createReviewBlockedOrders,
  createTransitionOrder,
  createUpdateOrder,
  createUpdateOrderPresentationLines,
} from '@/lib/modules/pedidos';

import type { Actor } from '@/lib/modules/pedidos';
import type { PackagingCatalog, PresentationCatalog, ProductCatalog } from '@/lib/modules/inventario';
import type { OrderRepository } from '@/lib/modules/pedidos/ports/order-repository';
import type { OrderTransactionScope, OrderUnitOfWork } from '@/lib/modules/pedidos/ports/order-unit-of-work';
import type { RecipeCatalog } from '@/lib/modules/recetas';
import type { UnitCatalog } from '@/lib/modules/unidades';

import { dropPackaging, seedPackaging } from '../../helpers/packaging-seed';

function token(): string {
  return randomUUID().replace(/-/gu, '');
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
const presentations: PresentationCatalog = { findRefs: findPresentationRefs, findByNormalizedNames: findPresentationsByNormalizedNames };
const units: UnitCatalog = { findRefs: findUnitRefs, findRefsSharingBaseInCompany: findUnitRefsSharingBaseInCompany };
const packaging: PackagingCatalog = { findRefs: findPackagingRefs, findCostingBatches: findPackagingCostingBatches };

const createOrder = createCreateOrder({ recipes, products, units, presentations, packaging, unitOfWork, now: () => new Date() });
const updateOrder = createUpdateOrder({ orders, recipes, products, units, presentations, packaging, unitOfWork, now: () => new Date() });
const cancelOrder = createCancelOrder({ orders, unitOfWork, now: () => new Date() });
const deleteOrder = createDeleteOrder({ orders, unitOfWork, now: () => new Date() });
const transition = createTransitionOrder({ unitOfWork });
const quoteOrderCost = createQuoteOrderCost({ recipes, products, units, packaging });
const updateDistribution = createUpdateOrderPresentationLines({ recipes, products, packaging, presentations, units, unitOfWork });
const reviewBlockedOrders = createReviewBlockedOrders({ orders, recipes, products, units, packaging, unitOfWork });

type Fixture = {
  readonly companyId: string;
  readonly actorId: string;
  readonly roleId: string;
  readonly documentTypeCode: string;
  readonly unitId: string;
  /** Presentacion de 1 en `unitId`: la de la materia prima y la del envase. */
  readonly presentationId: string;
  readonly recipeId: string;
  /** Materia prima al 100 % de la receta, con 1000 de existencia. */
  readonly materialId: string;
  readonly productIds: string[];
};

function actorDe(f: Fixture): Actor {
  return { id: f.actorId, companyId: f.companyId, permissions: ['pedidos.consultar', 'pedidos.modificar'] };
}

async function crearFixture(): Promise<Fixture> {
  const marca = token();
  const documentType = await prisma.documentType.create({
    data: { code: `DOC${marca.slice(0, 8)}`, name: 'Tipo de documento de prueba' },
    select: { code: true },
  });
  const role = await prisma.role.create({ data: { name: `rol-${marca}`, description: 'Rol de prueba' }, select: { id: true } });
  const nombre = `Empresa envases ${marca}`;
  const company = await prisma.company.create({ data: { name: nombre, nameNormalized: normalizeCompanyName(nombre) }, select: { id: true } });
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
    data: { name: `Litro ${marca}`, nameNormalized: `litro${marca}`, symbol: `l${marca}` },
    select: { id: true },
  });
  const presentation = await prisma.presentation.create({
    data: { name: `Botella ${marca}`, nameNormalized: `botella${marca}`, unitId: unit.id, companyId: company.id, content: '1.0000' },
    select: { id: true },
  });
  const recipe = await prisma.recipe.create({
    data: { name: `Receta ${marca}`, nameNormalized: `receta${marca}`, companyId: company.id, createdBy: user.id },
    select: { id: true },
  });
  const material = await createWithFirstBatch(
    { name: `Materia ${marca}` },
    { presentationId: presentation.id, stock: '1000', unitCost: '1.0000', lot: null, purchaseDate: '2026-09-01', expiryDate: null, createdBy: user.id },
    new Date(),
    { companyId: company.id },
  );
  await prisma.recipeLine.create({ data: { recipeId: recipe.id, productId: material.id, percentage: new Prisma.Decimal('100.00') } });
  return {
    companyId: company.id,
    actorId: user.id,
    roleId: role.id,
    documentTypeCode: documentType.code,
    unitId: unit.id,
    presentationId: presentation.id,
    recipeId: recipe.id,
    materialId: material.id,
    productIds: [],
  };
}

async function envase(f: Fixture, stock: string): Promise<string> {
  const id = await seedPackaging({ companyId: f.companyId, presentationId: f.presentationId, createdBy: f.actorId, stock });
  f.productIds.push(id);
  return id;
}

async function borrarFixture(f: Fixture): Promise<void> {
  await prisma.reservationMovement.deleteMany({ where: { companyId: f.companyId } });
  await prisma.inventoryMovement.deleteMany({ where: { companyId: f.companyId } });
  await prisma.orderPresentationLine.deleteMany({ where: { companyId: f.companyId } });
  await prisma.order.deleteMany({ where: { companyId: f.companyId } });
  await prisma.recipeLine.deleteMany({ where: { recipe: { companyId: f.companyId } } });
  await prisma.recipe.deleteMany({ where: { companyId: f.companyId } });
  await dropPackaging([...f.productIds, f.materialId]);
  await prisma.presentation.deleteMany({ where: { id: f.presentationId } });
  await prisma.unit.deleteMany({ where: { id: f.unitId } });
  await prisma.user.deleteMany({ where: { id: f.actorId } });
  await prisma.role.deleteMany({ where: { id: f.roleId } });
  await prisma.documentType.deleteMany({ where: { code: f.documentTypeCode } });
  await prisma.company.deleteMany({ where: { id: f.companyId } });
}

function entrada(f: Fixture, quantity: string, lines: readonly { packagingProductId: string; packages: number }[], confirmBlocked = false) {
  return { recipeId: f.recipeId, quantity, priority: 'BAJA', unitId: f.unitId, presentationLines: lines, confirmBlocked };
}

/** Lo apartado neto del pedido por producto (reserve - release - consume). */
async function apartadoPorProducto(orderId: string): Promise<Readonly<Record<string, string>>> {
  const rows = await prisma.$queryRaw<{ product_id: string; neto: string }[]>`
    SELECT b."product_id" AS "product_id",
           SUM(CASE WHEN m."kind" = 'reserve' THEN m."quantity" ELSE -m."quantity" END)::text AS "neto"
      FROM "reservation_movements" m
      JOIN "product_batches" b ON b."id" = m."batch_id"
     WHERE m."order_id" = ${orderId}::uuid
     GROUP BY b."product_id"`;
  return Object.fromEntries(rows.map((row) => [row.product_id, Number(row.neto).toFixed(4)]));
}

async function estadoDe(orderId: string) {
  return prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true, reservedAt: true, ingredientsCost: true, quantity: true } });
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('QC-195 — el alta aparta los envases del reparto', () => {
  it('R15: un pedido de 40 l en 40 botellas aparta 40 envases junto a la materia prima, en la misma operacion', async () => {
    const f = await crearFixture();
    try {
      const botella = await envase(f, '100');
      const creado = await createOrder(entrada(f, '40', [{ packagingProductId: botella, packages: 40 }]), actorDe(f));

      expect(await apartadoPorProducto(creado.id)).toEqual({ [botella]: '40.0000', [f.materialId]: '40.0000' });
      const fila = await estadoDe(creado.id);
      expect(fila.status).toBe('PENDIENTE');
      expect(fila.reservedAt).not.toBeNull();
    } finally {
      await borrarFixture(f);
    }
  });

  it('R16, R17: si el envase no alcanza, el alta avisa con order_would_block y no deja nada escrito', async () => {
    const f = await crearFixture();
    try {
      const botella = await envase(f, '10');
      await expect(
        createOrder(entrada(f, '40', [{ packagingProductId: botella, packages: 40 }]), actorDe(f)),
      ).rejects.toMatchObject({ code: 'order_would_block' });

      expect(await prisma.order.count({ where: { companyId: f.companyId } })).toBe(0);
      expect(await prisma.reservationMovement.count({ where: { companyId: f.companyId } })).toBe(0);
    } finally {
      await borrarFixture(f);
    }
  });

  it('R16, R17: con la confirmacion queda BLOQUEADO, sin nada apartado (ni la materia prima) y sin importe', async () => {
    const f = await crearFixture();
    try {
      const botella = await envase(f, '10');
      const creado = await createOrder(entrada(f, '40', [{ packagingProductId: botella, packages: 40 }], true), actorDe(f));

      const fila = await estadoDe(creado.id);
      expect(fila.status).toBe('BLOQUEADO');
      expect(fila.reservedAt).toBeNull();
      expect(fila.ingredientsCost).toBeNull();
      expect(await apartadoPorProducto(creado.id)).toEqual({});
    } finally {
      await borrarFixture(f);
    }
  });
});

describe('QC-195 — la edicion completa sincroniza los envases', () => {
  it('R15, R20: bajar los envases de una linea libera lo que sobra en la misma operacion', async () => {
    const f = await crearFixture();
    try {
      const botella = await envase(f, '100');
      const creado = await createOrder(entrada(f, '40', [{ packagingProductId: botella, packages: 40 }]), actorDe(f));
      await updateOrder(creado.id, entrada(f, '40', [{ packagingProductId: botella, packages: 25 }]), actorDe(f));
      expect((await apartadoPorProducto(creado.id))[botella]).toBe('25.0000');
    } finally {
      await borrarFixture(f);
    }
  });

  it('R17: editar un PENDIENTE con un envase que no alcanza avisa; con la confirmacion queda BLOQUEADO sin nada apartado', async () => {
    const f = await crearFixture();
    try {
      const botella = await envase(f, '30');
      const creado = await createOrder(entrada(f, '20', [{ packagingProductId: botella, packages: 20 }]), actorDe(f));

      await expect(
        updateOrder(creado.id, entrada(f, '40', [{ packagingProductId: botella, packages: 40 }]), actorDe(f)),
      ).rejects.toMatchObject({ code: 'order_would_block' });
      expect((await apartadoPorProducto(creado.id))[botella]).toBe('20.0000');

      await updateOrder(creado.id, entrada(f, '40', [{ packagingProductId: botella, packages: 40 }], true), actorDe(f));
      const fila = await estadoDe(creado.id);
      expect(fila.status).toBe('BLOQUEADO');
      expect(fila.ingredientsCost).toBeNull();
      // Lo que tenia apartado se libera entero: el neto de cada producto queda en cero.
      expect(await apartadoPorProducto(creado.id)).toEqual({ [botella]: '0.0000', [f.materialId]: '0.0000' });
    } finally {
      await borrarFixture(f);
    }
  });

  it('R18: editar un EN_CURSO con un envase que no alcanza rechaza con insufficient_material y no cambia nada', async () => {
    const f = await crearFixture();
    try {
      const botella = await envase(f, '30');
      const creado = await createOrder(entrada(f, '20', [{ packagingProductId: botella, packages: 20 }]), actorDe(f));
      expect(await transition(creado.id, f.companyId, 'PENDIENTE', 'EN_CURSO', f.actorId, new Date())).toBe('ok');
      const antes = await apartadoPorProducto(creado.id);

      await expect(
        updateOrder(creado.id, entrada(f, '40', [{ packagingProductId: botella, packages: 40 }], true), actorDe(f)),
      ).rejects.toMatchObject({ code: 'insufficient_material' });

      const fila = await estadoDe(creado.id);
      expect(fila.status).toBe('EN_CURSO');
      expect(fila.quantity.toFixed(4)).toBe('20.0000');
      expect(await apartadoPorProducto(creado.id)).toEqual(antes);
    } finally {
      await borrarFixture(f);
    }
  });

  it('R19: guardar un BLOQUEADO cuando ya hay envases lo deja PENDIENTE con todo apartado', async () => {
    const f = await crearFixture();
    try {
      const botella = await envase(f, '10');
      const creado = await createOrder(entrada(f, '40', [{ packagingProductId: botella, packages: 40 }], true), actorDe(f));
      expect((await estadoDe(creado.id)).status).toBe('BLOQUEADO');

      const otraBotella = await envase(f, '100');
      await updateOrder(creado.id, entrada(f, '40', [{ packagingProductId: otraBotella, packages: 40 }]), actorDe(f));

      const fila = await estadoDe(creado.id);
      expect(fila.status).toBe('PENDIENTE');
      expect(fila.reservedAt).not.toBeNull();
      expect(await apartadoPorProducto(creado.id)).toEqual({ [otraBotella]: '40.0000', [f.materialId]: '40.0000' });
    } finally {
      await borrarFixture(f);
    }
  });
});

describe('QC-195 — revision de bloqueados, liberacion y otros pedidos', () => {
  it('R21: la revision no desbloquea un pedido mientras falte un envase, y lo desbloquea cuando entra', async () => {
    const f = await crearFixture();
    try {
      const botella = await envase(f, '10');
      const creado = await createOrder(entrada(f, '40', [{ packagingProductId: botella, packages: 40 }], true), actorDe(f));

      const primera = await reviewBlockedOrders({ companyId: f.companyId, now: new Date() });
      expect(primera.unblocked).toBe(0);
      expect((await estadoDe(creado.id)).status).toBe('BLOQUEADO');
      expect(await apartadoPorProducto(creado.id)).toEqual({});

      await addBatchToAlive(
        botella,
        { presentationId: null, stock: '50', unitCost: '0.5000', lot: null, purchaseDate: '2026-09-02', expiryDate: null, createdBy: f.actorId },
        new Date(),
        { companyId: f.companyId },
        { presentationId: f.presentationId },
      );

      const segunda = await reviewBlockedOrders({ companyId: f.companyId, now: new Date() });
      expect(segunda.unblocked).toBe(1);
      expect((await estadoDe(creado.id)).status).toBe('PENDIENTE');
      expect(await apartadoPorProducto(creado.id)).toEqual({ [botella]: '40.0000', [f.materialId]: '40.0000' });
    } finally {
      await borrarFixture(f);
    }
  });

  it('R22: cancelar y borrar un pedido liberan tambien lo apartado de sus envases', async () => {
    const f = await crearFixture();
    try {
      const botella = await envase(f, '100');
      const aCancelar = await createOrder(entrada(f, '10', [{ packagingProductId: botella, packages: 10 }]), actorDe(f));
      const aBorrar = await createOrder(entrada(f, '5', [{ packagingProductId: botella, packages: 5 }]), actorDe(f));

      await cancelOrder(aCancelar.id, { reason: 'ya no hace falta' }, actorDe(f));
      await deleteOrder(aBorrar.id, actorDe(f));

      expect((await apartadoPorProducto(aCancelar.id))[botella]).toBe('0.0000');
      expect((await apartadoPorProducto(aBorrar.id))[botella]).toBe('0.0000');
    } finally {
      await borrarFixture(f);
    }
  });

  it('R23: apartar, liberar y editar los envases de un pedido no cambia lo que otro pedido tiene apartado', async () => {
    const f = await crearFixture();
    try {
      const botella = await envase(f, '100');
      const otro = await createOrder(entrada(f, '30', [{ packagingProductId: botella, packages: 30 }]), actorDe(f));
      const antes = await apartadoPorProducto(otro.id);

      const este = await createOrder(entrada(f, '40', [{ packagingProductId: botella, packages: 40 }]), actorDe(f));
      await updateOrder(este.id, entrada(f, '40', [{ packagingProductId: botella, packages: 20 }]), actorDe(f));
      await cancelOrder(este.id, { reason: 'prueba' }, actorDe(f));

      expect(await apartadoPorProducto(otro.id)).toEqual(antes);
    } finally {
      await borrarFixture(f);
    }
  });
});

describe('QC-195 — pasar a POR_EMPACAR no consume los envases', () => {
  it('R26: la materia prima se consume y los envases siguen apartados, con su existencia intacta', async () => {
    const f = await crearFixture();
    try {
      const botella = await envase(f, '100');
      const creado = await createOrder(entrada(f, '40', [{ packagingProductId: botella, packages: 40 }]), actorDe(f));
      expect(await transition(creado.id, f.companyId, 'PENDIENTE', 'EN_CURSO', f.actorId, new Date())).toBe('ok');
      expect(await transition(creado.id, f.companyId, 'EN_CURSO', 'POR_EMPACAR', f.actorId, new Date())).toBe('ok');

      expect(await apartadoPorProducto(creado.id)).toEqual({ [botella]: '40.0000', [f.materialId]: '0.0000' });
      const existencia = await prisma.productBatch.findMany({ where: { productId: { in: [botella, f.materialId] } }, select: { productId: true, stock: true } });
      expect(Object.fromEntries(existencia.map((b) => [b.productId, b.stock.toFixed(4)]))).toEqual({
        [botella]: '100.0000',
        [f.materialId]: '960.0000',
      });
    } finally {
      await borrarFixture(f);
    }
  });
});

describe('QC-195 — Reparto y unidad toca la reserva de los envases', () => {
  async function lineasDe(orderId: string) {
    return prisma.orderPresentationLine.findMany({ where: { orderId }, select: { packagingProductId: true, packages: true } });
  }

  it('R20: bajar los envases de una linea libera lo que sobra en la misma operacion', async () => {
    const f = await crearFixture();
    try {
      const botella = await envase(f, '100');
      const creado = await createOrder(entrada(f, '40', [{ packagingProductId: botella, packages: 40 }]), actorDe(f));

      const resultado = await updateDistribution(creado.id, actorDe(f), {
        unitId: f.unitId,
        lines: [{ packagingProductId: botella, packages: 25 }],
      });

      expect(resultado).toBe('ok');
      expect(await apartadoPorProducto(creado.id)).toEqual({ [botella]: '25.0000', [f.materialId]: '40.0000' });
    } finally {
      await borrarFixture(f);
    }
  });

  it('R17: en PENDIENTE, si falta envase avisa sin escribir nada; con la confirmacion queda BLOQUEADO sin nada apartado ni importe', async () => {
    const f = await crearFixture();
    try {
      const botella = await envase(f, '30');
      const creado = await createOrder(entrada(f, '40', [{ packagingProductId: botella, packages: 20 }]), actorDe(f));
      const antes = await apartadoPorProducto(creado.id);

      const sinConfirmar = await updateDistribution(creado.id, actorDe(f), {
        unitId: f.unitId,
        lines: [{ packagingProductId: botella, packages: 40 }],
      });
      expect(sinConfirmar).toBe('would_block');
      expect(await lineasDe(creado.id)).toEqual([{ packagingProductId: botella, packages: 20 }]);
      expect(await apartadoPorProducto(creado.id)).toEqual(antes);
      expect((await estadoDe(creado.id)).status).toBe('PENDIENTE');

      const confirmado = await updateDistribution(creado.id, actorDe(f), {
        unitId: f.unitId,
        lines: [{ packagingProductId: botella, packages: 40 }],
        confirmBlocked: true,
      });
      expect(confirmado).toBe('ok');
      const fila = await estadoDe(creado.id);
      expect(fila.status).toBe('BLOQUEADO');
      expect(fila.reservedAt).toBeNull();
      expect(fila.ingredientsCost).toBeNull();
      expect(await apartadoPorProducto(creado.id)).toEqual({ [botella]: '0.0000', [f.materialId]: '0.0000' });
      expect(await lineasDe(creado.id)).toEqual([{ packagingProductId: botella, packages: 40 }]);
    } finally {
      await borrarFixture(f);
    }
  });

  it('R18: en EN_CURSO, si falta envase rechaza con insufficient_material y no cambia reparto, unidad ni apartado', async () => {
    const f = await crearFixture();
    try {
      const botella = await envase(f, '30');
      const creado = await createOrder(entrada(f, '40', [{ packagingProductId: botella, packages: 20 }]), actorDe(f));
      expect(await transition(creado.id, f.companyId, 'PENDIENTE', 'EN_CURSO', f.actorId, new Date())).toBe('ok');
      const antes = await apartadoPorProducto(creado.id);

      const resultado = await updateDistribution(creado.id, actorDe(f), {
        unitId: f.unitId,
        lines: [{ packagingProductId: botella, packages: 40 }],
        confirmBlocked: true,
      });

      expect(resultado).toBe('insufficient_material');
      expect((await estadoDe(creado.id)).status).toBe('EN_CURSO');
      expect(await lineasDe(creado.id)).toEqual([{ packagingProductId: botella, packages: 20 }]);
      expect(await apartadoPorProducto(creado.id)).toEqual(antes);
    } finally {
      await borrarFixture(f);
    }
  });

  it('R19: un BLOQUEADO cuyo reparto nuevo ya queda cubierto pasa a PENDIENTE con todo apartado', async () => {
    const f = await crearFixture();
    try {
      const corta = await envase(f, '10');
      const creado = await createOrder(entrada(f, '40', [{ packagingProductId: corta, packages: 40 }], true), actorDe(f));
      expect((await estadoDe(creado.id)).status).toBe('BLOQUEADO');

      const resultado = await updateDistribution(creado.id, actorDe(f), {
        unitId: f.unitId,
        lines: [{ packagingProductId: corta, packages: 10 }],
      });

      expect(resultado).toBe('ok');
      const fila = await estadoDe(creado.id);
      expect(fila.status).toBe('PENDIENTE');
      expect(fila.reservedAt).not.toBeNull();
      expect(await apartadoPorProducto(creado.id)).toEqual({ [corta]: '10.0000', [f.materialId]: '40.0000' });
    } finally {
      await borrarFixture(f);
    }
  });

  it('R24: en POR_EMPACAR solo se sincronizan los envases y la materia prima consumida no se vuelve a apartar', async () => {
    const f = await crearFixture();
    try {
      const botella = await envase(f, '100');
      const creado = await createOrder(entrada(f, '40', [{ packagingProductId: botella, packages: 40 }]), actorDe(f));
      expect(await transition(creado.id, f.companyId, 'PENDIENTE', 'EN_CURSO', f.actorId, new Date())).toBe('ok');
      expect(await transition(creado.id, f.companyId, 'EN_CURSO', 'POR_EMPACAR', f.actorId, new Date())).toBe('ok');
      const materiaAntes = await prisma.productBatch.findFirstOrThrow({ where: { productId: f.materialId }, select: { stock: true } });

      const resultado = await updateDistribution(creado.id, actorDe(f), {
        unitId: f.unitId,
        lines: [{ packagingProductId: botella, packages: 30 }],
      });

      expect(resultado).toBe('ok');
      expect((await estadoDe(creado.id)).status).toBe('POR_EMPACAR');
      expect(await apartadoPorProducto(creado.id)).toEqual({ [botella]: '30.0000', [f.materialId]: '0.0000' });
      const materiaDespues = await prisma.productBatch.findFirstOrThrow({ where: { productId: f.materialId }, select: { stock: true } });
      expect(materiaDespues.stock.toFixed(4)).toBe(materiaAntes.stock.toFixed(4));
    } finally {
      await borrarFixture(f);
    }
  });

  it('R18: en POR_EMPACAR, si falta envase rechaza con insufficient_material sin tocar nada', async () => {
    const f = await crearFixture();
    try {
      const botella = await envase(f, '50');
      const creado = await createOrder(entrada(f, '60', [{ packagingProductId: botella, packages: 40 }]), actorDe(f));
      expect(await transition(creado.id, f.companyId, 'PENDIENTE', 'EN_CURSO', f.actorId, new Date())).toBe('ok');
      expect(await transition(creado.id, f.companyId, 'EN_CURSO', 'POR_EMPACAR', f.actorId, new Date())).toBe('ok');
      const antes = await apartadoPorProducto(creado.id);

      const resultado = await updateDistribution(creado.id, actorDe(f), {
        unitId: f.unitId,
        lines: [{ packagingProductId: botella, packages: 60 }],
      });

      expect(resultado).toBe('insufficient_material');
      expect(await apartadoPorProducto(creado.id)).toEqual(antes);
      expect(await lineasDe(creado.id)).toEqual([{ packagingProductId: botella, packages: 40 }]);
    } finally {
      await borrarFixture(f);
    }
  });
});

describe('QC-195 — el importe suma los envases', () => {
  it('R27, R29, R30: 40 l y 40 botellas (lotes a 0.50 y 0.70): cotizacion, alta y edicion guardan 40 + 24 = 64.0000', async () => {
    const f = await crearFixture();
    try {
      const botella = await seedPackaging({ companyId: f.companyId, presentationId: f.presentationId, createdBy: f.actorId, stock: '100', unitCost: '0.5000' });
      f.productIds.push(botella);
      await addBatchToAlive(
        botella,
        { presentationId: null, stock: '50', unitCost: '0.7000', lot: null, purchaseDate: '2026-09-02', expiryDate: null, createdBy: f.actorId },
        new Date(),
        { companyId: f.companyId },
        { presentationId: f.presentationId },
      );
      const lineas = [{ packagingProductId: botella, packages: 40 }];

      const cotizacion = await quoteOrderCost({ recipeId: f.recipeId, quantity: '40', presentationLines: lineas }, actorDe(f));
      expect(cotizacion.ingredientsCost).toBe('64.0000');

      const creado = await createOrder(entrada(f, '40', lineas), actorDe(f));
      expect((await estadoDe(creado.id)).ingredientsCost?.toFixed(4)).toBe('64.0000');

      // Lo apartado por el propio pedido cuenta como disponible: la edicion sin cambios no lo pierde.
      await updateOrder(creado.id, entrada(f, '40', lineas), actorDe(f));
      expect((await estadoDe(creado.id)).ingredientsCost?.toFixed(4)).toBe('64.0000');
      const cotizacionEdicion = await quoteOrderCost(
        { recipeId: f.recipeId, quantity: '40', orderId: creado.id, presentationLines: lineas },
        actorDe(f),
      );
      expect(cotizacionEdicion.ingredientsCost).toBe('64.0000');
    } finally {
      await borrarFixture(f);
    }
  });

  it('R28: si los envases disponibles no cubren el reparto, la cotizacion y lo guardado quedan sin importe', async () => {
    const f = await crearFixture();
    try {
      const botella = await envase(f, '10');
      const lineas = [{ packagingProductId: botella, packages: 40 }];

      const cotizacion = await quoteOrderCost({ recipeId: f.recipeId, quantity: '40', presentationLines: lineas }, actorDe(f));
      expect(cotizacion.ingredientsCost).toBeNull();

      const creado = await createOrder(entrada(f, '40', lineas, true), actorDe(f));
      expect((await estadoDe(creado.id)).ingredientsCost).toBeNull();
    } finally {
      await borrarFixture(f);
    }
  });
});

describe('QC-195 — Reparto y unidad guarda el importe', () => {
  /** Las dos columnas del importe: el total y su parte de envases. */
  async function costoDe(orderId: string) {
    const fila = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { status: true, ingredientsCost: true, packagingCost: true },
    });
    return {
      status: fila.status,
      total: fila.ingredientsCost === null ? null : fila.ingredientsCost.toFixed(4),
      packaging: fila.packagingCost === null ? null : fila.packagingCost.toFixed(4),
    };
  }

  /** Envase con dos lotes, 100 a 0.50 y 50 a 0.70: 40 envases cuestan 24.0000. */
  async function botellaDeDosLotes(f: Fixture): Promise<string> {
    const botella = await seedPackaging({ companyId: f.companyId, presentationId: f.presentationId, createdBy: f.actorId, stock: '100', unitCost: '0.5000' });
    f.productIds.push(botella);
    await addBatchToAlive(
      botella,
      { presentationId: null, stock: '50', unitCost: '0.7000', lot: null, purchaseDate: '2026-09-02', expiryDate: null, createdBy: f.actorId },
      new Date(),
      { companyId: f.companyId },
      { presentationId: f.presentationId },
    );
    return botella;
  }

  it.each(['PENDIENTE', 'EN_CURSO'] as const)(
    'R45, R27, R29: en %s, tras anadir 40 botellas por el dialogo el importe guardado es el de quoteOrderCost con ese reparto y orderId',
    async (estado) => {
      const f = await crearFixture();
      try {
        const botella = await botellaDeDosLotes(f);
        const creado = await createOrder(entrada(f, '40', []), actorDe(f));
        expect(await costoDe(creado.id)).toEqual({ status: 'PENDIENTE', total: '40.0000', packaging: '0.0000' });
        if (estado === 'EN_CURSO') {
          expect(await transition(creado.id, f.companyId, 'PENDIENTE', 'EN_CURSO', f.actorId, new Date())).toBe('ok');
        }

        const lineas = [{ packagingProductId: botella, packages: 40 }];
        expect(await updateDistribution(creado.id, actorDe(f), { unitId: f.unitId, lines: lineas })).toBe('ok');

        const cotizacion = await quoteOrderCost(
          { recipeId: f.recipeId, quantity: '40', orderId: creado.id, presentationLines: lineas },
          actorDe(f),
        );
        expect(cotizacion.ingredientsCost).toBe('64.0000');
        expect(await costoDe(creado.id)).toEqual({ status: estado, total: cotizacion.ingredientsCost, packaging: '24.0000' });
      } finally {
        await borrarFixture(f);
      }
    },
  );

  it('R45: si el envase nuevo no tiene lote con costo, el dialogo guarda «sin importe», igual que la cotizacion', async () => {
    const f = await crearFixture();
    try {
      const botella = await envase(f, '100');
      await prisma.productBatch.updateMany({ where: { productId: botella }, data: { unitCost: null } });
      const creado = await createOrder(entrada(f, '40', []), actorDe(f));
      expect(await costoDe(creado.id)).toEqual({ status: 'PENDIENTE', total: '40.0000', packaging: '0.0000' });

      const lineas = [{ packagingProductId: botella, packages: 40 }];
      expect(await updateDistribution(creado.id, actorDe(f), { unitId: f.unitId, lines: lineas })).toBe('ok');

      const cotizacion = await quoteOrderCost(
        { recipeId: f.recipeId, quantity: '40', orderId: creado.id, presentationLines: lineas },
        actorDe(f),
      );
      expect(cotizacion.ingredientsCost).toBeNull();
      expect(await costoDe(creado.id)).toEqual({ status: 'PENDIENTE', total: null, packaging: null });
    } finally {
      await borrarFixture(f);
    }
  });

  it('R46, R19: un BLOQUEADO que el dialogo desbloquea queda PENDIENTE con el importe de quoteOrderCost, no sin importe', async () => {
    const f = await crearFixture();
    try {
      const corta = await envase(f, '10');
      const botella = await botellaDeDosLotes(f);
      const creado = await createOrder(entrada(f, '40', [{ packagingProductId: corta, packages: 40 }], true), actorDe(f));
      expect(await costoDe(creado.id)).toEqual({ status: 'BLOQUEADO', total: null, packaging: null });

      const lineas = [{ packagingProductId: botella, packages: 40 }];
      expect(await updateDistribution(creado.id, actorDe(f), { unitId: f.unitId, lines: lineas })).toBe('ok');

      const cotizacion = await quoteOrderCost(
        { recipeId: f.recipeId, quantity: '40', orderId: creado.id, presentationLines: lineas },
        actorDe(f),
      );
      expect(cotizacion.ingredientsCost).toBe('64.0000');
      expect(await costoDe(creado.id)).toEqual({ status: 'PENDIENTE', total: '64.0000', packaging: '24.0000' });
    } finally {
      await borrarFixture(f);
    }
  });

  it('R47: en POR_EMPACAR, el importe es la parte de ingredientes guardada mas los envases nuevos, y no el de quoteOrderCost', async () => {
    const f = await crearFixture();
    try {
      const botella = await botellaDeDosLotes(f);
      const tapa = await seedPackaging({ companyId: f.companyId, presentationId: f.presentationId, createdBy: f.actorId, stock: '100', unitCost: '0.9000' });
      f.productIds.push(tapa);
      const creado = await createOrder(entrada(f, '40', [{ packagingProductId: botella, packages: 40 }]), actorDe(f));
      expect(await costoDe(creado.id)).toEqual({ status: 'PENDIENTE', total: '64.0000', packaging: '24.0000' });
      expect(await transition(creado.id, f.companyId, 'PENDIENTE', 'EN_CURSO', f.actorId, new Date())).toBe('ok');
      expect(await transition(creado.id, f.companyId, 'EN_CURSO', 'POR_EMPACAR', f.actorId, new Date())).toBe('ok');
      // Un lote de materia mas caro, posterior al consumo: la cotizacion de hoy cambia, lo guardado no.
      await addBatchToAlive(
        f.materialId,
        { presentationId: f.presentationId, stock: '100', unitCost: '3.0000', lot: null, purchaseDate: '2026-09-03', expiryDate: null, createdBy: f.actorId },
        new Date(),
        { companyId: f.companyId },
      );

      const lineas = [{ packagingProductId: tapa, packages: 30 }];
      expect(await updateDistribution(creado.id, actorDe(f), { unitId: f.unitId, lines: lineas })).toBe('ok');

      // (64 - 24) de ingredientes guardados + 30 x 0.90 de envases.
      expect(await costoDe(creado.id)).toEqual({ status: 'POR_EMPACAR', total: '67.0000', packaging: '27.0000' });
      const cotizacion = await quoteOrderCost(
        { recipeId: f.recipeId, quantity: '40', orderId: creado.id, presentationLines: lineas },
        actorDe(f),
      );
      expect(cotizacion.ingredientsCost).not.toBe('67.0000');
    } finally {
      await borrarFixture(f);
    }
  });
});
