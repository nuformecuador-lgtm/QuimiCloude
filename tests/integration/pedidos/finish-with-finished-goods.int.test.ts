/**
 * Terminar el empaque da de alta el producto terminado, contra Postgres real (T14, R17-R21): el
 * mismo cableado que `order-reservation.int.test.ts` (los adaptadores driven REALES de
 * `pedidos`, `recetas`, `inventario` y `unidades`, sin pasar por `lib/composition`), con
 * `finishAssignedOrder`/`createStartPacking`/`createFinishPacking` encima.
 *
 * R15, R16: Finalizar (`EN_CURSO -> POR_EMPACAR`) ya NO da de alta ningun lote -eso se
 * traslada a Terminar, una vez por linea del reparto-, asi que el recorrido de cada caso es
 * SIEMPRE Finalizar -> Comenzar -> Terminar, y el lote se comprueba tras Terminar.
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
import { createWithFirstBatch, findFinishedGoodsReceipts } from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import { createMaterialReservations } from '@/lib/modules/inventario/adapters/driven/persistence/reservation-prisma';
import { createFinishedGoodsIntake } from '@/lib/modules/inventario/adapters/driven/persistence/finished-goods-prisma';
import {
  findPresentationRefs,
  findPresentationsByNormalizedNames,
} from '@/lib/modules/inventario/adapters/driven/persistence/presentation-catalog-prisma';
import {
  findAliveOrderById,
  createOrderWriteRepository,
  findBlockedOrderIds,
  startPackingAliveOrder,
} from '@/lib/modules/pedidos/adapters/driven/persistence/order-prisma';
import { withOrderTransaction } from '@/lib/modules/pedidos/adapters/driven/persistence/order-unit-of-work-prisma';
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

import { createCreateOrder, createFinishPacking, createStartPacking, createTransitionOrder, createUpdateOrder } from '@/lib/modules/pedidos';
import { createFinishAssignedOrder } from '@/lib/modules/asignaciones/domain/finish-assigned-order';
import { assignmentDirectoryPrisma } from '@/lib/modules/identity/adapters/driven/persistence/assignment-directory-prisma';
import { UnauthorizedError } from '@/lib/modules/asignaciones/domain/errors';

import type { Actor, OrderCatalog } from '@/lib/modules/pedidos';
import type { PresentationCatalog, ProductCatalog } from '@/lib/modules/inventario';
import type { OrderPackingRepository } from '@/lib/modules/pedidos/ports/order-packing-repository';
import type { OrderTransactionScope, OrderUnitOfWork } from '@/lib/modules/pedidos/ports/order-unit-of-work';
import type { RecipeCatalog } from '@/lib/modules/recetas';
import type { UnitCatalog } from '@/lib/modules/unidades';
import type { Actor as AsignacionesActor } from '@/lib/modules/asignaciones/domain/actor';
import type { OrderAssignmentRepository } from '@/lib/modules/asignaciones/ports/order-assignment-repository';
import { findPackagingCostingBatches, findPackagingRefs } from '@/lib/modules/inventario/adapters/driven/persistence/packaging-catalog-prisma';
import type { PackagingCatalog } from '@/lib/modules/inventario';

import { dropPackaging, seedPackaging } from '../../helpers/packaging-seed';

const packagingCatalog: PackagingCatalog = { findRefs: findPackagingRefs, findCostingBatches: findPackagingCostingBatches };

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

const orderPackingRepository: OrderPackingRepository = { startPackingAlive: startPackingAliveOrder };

const createOrder = createCreateOrder({ recipes, products, units, presentations, packaging: packagingCatalog, unitOfWork, now: () => new Date() });
const updateOrder = createUpdateOrder({ orders: { findAliveById: findAliveOrderById, listAlive: async () => { throw new Error('sin uso en este archivo'); }, findBlockedIds: findBlockedOrderIds }, recipes, products, units, presentations, packaging: packagingCatalog, unitOfWork, now: () => new Date() });

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
  // R15, R16: Finalizar ya no da de alta ningun lote -eso se traslada a Terminar (T14)-.
  transitionAliveById: createTransitionOrder({ unitOfWork }),
  // T14: Comenzar y Terminar, cableados exactamente como `lib/composition`.
  startPackingAliveById: createStartPacking({ packing: orderPackingRepository }),
  finishPackingAliveById: createFinishPacking({ packing: orderPackingRepository, unitOfWork, recipes, products, units, presentations, packaging: packagingCatalog }),
};

function finishAssignedOrderPara(orderId: string) {
  return createFinishAssignedOrder({
    assignments: {
      listOrderIdsByUserInCompany: async () => [orderId],
      // Sin filas: el auto-asignado del empacador no tiene candidatos y no escribe.
      listByOrderInCompany: async () => [],
    } as unknown as OrderAssignmentRepository,
    orders: orderCatalog,
    people: assignmentDirectoryPrisma,
    groups: assignmentDirectoryPrisma,
    now: () => new Date(),
  });
}

/** Comenzar y Terminar reales, en ese orden, sobre un pedido YA `POR_EMPACAR` (Finalizar ya
 *  corrio). Lanza si cualquiera de los dos no da `'ok'`, para que un caso que no espera fallar
 *  ahi no siga adelante en silencio. */
async function empacarYTerminar(
  orderId: string,
  companyId: string,
  packerId: string,
  now: Date,
): ReturnType<OrderCatalog['finishPackingAliveById']> {
  const comenzado = await orderCatalog.startPackingAliveById(orderId, companyId, packerId, now);
  if (comenzado !== 'ok') throw new Error(`Comenzar no dio 'ok': ${comenzado}`);
  return orderCatalog.finishPackingAliveById(orderId, companyId, packerId, now);
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
  /** Envase con `presentationId` como presentacion fija: lo que nombra el reparto. */
  readonly packagingProductId: string;
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
    packagingProductId: await seedPackaging({ companyId: company.id, presentationId: presentation.id, createdBy: user.id }),
    unitId: unit.id,
  };
}

async function borrarFixture(fixture: Fixture, productIds: readonly string[]): Promise<void> {
  await prisma.reservationMovement.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.inventoryMovement.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.orderPresentationLine.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.order.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.recipeLine.deleteMany({ where: { recipe: { companyId: fixture.companyId } } });
  // El producto terminado que Terminar da de alta referencia la receta con
  // `ON DELETE RESTRICT`: se limpia ANTES de borrar la receta.
  await prisma.productBatch.deleteMany({ where: { product: { companyId: fixture.companyId, type: 'FINISHED_PRODUCT' } } });
  await prisma.product.deleteMany({ where: { companyId: fixture.companyId, type: 'FINISHED_PRODUCT' } });
  await prisma.recipe.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.productBatch.deleteMany({ where: { productId: { in: [...productIds] } } });
  await prisma.product.deleteMany({ where: { id: { in: [...productIds] } } });
  await dropPackaging([fixture.packagingProductId]);
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

/** Un pedido con UNA linea de reparto: `packages` envases de la presentacion de la fixture,
 *  igual que la cantidad cuando `content` es `'1.0000'` (R8: reparto igual al total). */
function nuevoPedido(recipeId: string, fixture: Fixture, quantity: string, packages: number) {
  return {
    recipeId,
    quantity,
    priority: 'BAJA',
    status: 'PENDIENTE',
    unitId: fixture.unitId,
    presentationLines: [{ packagingProductId: fixture.packagingProductId, packages }],
  };
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

describe('R17 — Terminar da de alta el lote a partir del reparto fijado en Comenzar', () => {
  it('un producto terminado nuevo nace con su lote a partir de la combinacion del pedido, con finished_at', async () => {
    const fixture = await crearFixture('1.0000');
    const { productId, batchId } = await crearProductoConLote(fixture, '100');
    const recipeId = await crearReceta(fixture, `Desengrasante ${token()}`);
    await crearLineaCompleta(recipeId, productId);

    try {
      const creado = await createOrder(nuevoPedido(recipeId, fixture, '10.0000', 10), actorDe(fixture));
      await orderCatalog.transitionAliveById(creado.id, fixture.companyId, 'PENDIENTE', 'EN_CURSO', fixture.actorId, new Date());

      const finalizado = await orderCatalog.transitionAliveById(
        creado.id,
        fixture.companyId,
        'EN_CURSO',
        'POR_EMPACAR',
        fixture.actorId,
        new Date(),
      );
      // R15, R16: Finalizar ya no da de alta ningun lote.
      expect(finalizado).toBe('ok');
      expect(await finishedProductDe(fixture.companyId, recipeId, fixture.presentationId)).toBeNull();

      const ahora = new Date();
      const resultado = await empacarYTerminar(creado.id, fixture.companyId, fixture.actorId, ahora);
      expect(resultado).toMatchObject({ kind: 'ok', finishedGoods: [{ packages: '10' }] });

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
        select: { quantity: true, orderId: true, createdBy: true, orderPresentationLineId: true },
      });
      expect(asiento?.quantity.toFixed(4)).toBe('10.0000');
      expect(asiento?.orderId).toBe(creado.id);
      expect(asiento?.createdBy).toBe(fixture.actorId);
      expect(asiento?.orderPresentationLineId).not.toBeNull();

      const row = await prisma.order.findUniqueOrThrow({ where: { id: creado.id }, select: { status: true, finishedAt: true } });
      expect(row.status).toBe('ENTREGADO');
      expect(row.finishedAt).toEqual(ahora);
      expect(await prisma.productBatch.findUniqueOrThrow({ where: { id: batchId }, select: { stock: true } }).then((b) => b.stock.toFixed(4))).toBe('90.0000');
    } finally {
      await borrarFixture(fixture, [productId]);
    }
  });

  it('dos lineas del reparto dan de alta dos lotes, cada uno con su propia presentacion y el MISMO coste unitario', async () => {
    const fixture = await crearFixture('1.0000');
    const otraPresentacion = await prisma.presentation.create({
      data: {
        name: `Frasco ${token()}`,
        nameNormalized: normalizeForTest(`Frasco ${token()}`),
        unitId: fixture.unitId,
        companyId: fixture.companyId,
        content: '2.0000',
      },
      select: { id: true },
    });
    const otroEnvase = await seedPackaging({
      companyId: fixture.companyId,
      presentationId: otraPresentacion.id,
      createdBy: fixture.actorId,
    });
    const { productId, batchId } = await crearProductoConLote(fixture, '100', '3.0000');
    const recipeId = await crearReceta(fixture);
    await crearLineaCompleta(recipeId, productId);

    try {
      const creado = await createOrder(
        {
          recipeId,
          quantity: '10.0000',
          priority: 'BAJA',
          status: 'PENDIENTE',
          unitId: fixture.unitId,
          presentationLines: [
            { packagingProductId: fixture.packagingProductId, packages: 6 },
            { packagingProductId: otroEnvase, packages: 2 },
          ],
        },
        actorDe(fixture),
      );
      await orderCatalog.transitionAliveById(creado.id, fixture.companyId, 'PENDIENTE', 'EN_CURSO', fixture.actorId, new Date());
      await orderCatalog.transitionAliveById(creado.id, fixture.companyId, 'EN_CURSO', 'POR_EMPACAR', fixture.actorId, new Date());

      const resultado = await empacarYTerminar(creado.id, fixture.companyId, fixture.actorId, new Date());
      if (typeof resultado !== 'object') throw new Error(`finishPackingAliveById no dio 'ok': ${resultado}`);
      // Las dos lineas se insertan en la MISMA sentencia (`created_at` puede coincidir al
      // microsegundo): no depende de CUAL de las dos vino primero, solo de que las DOS
      // cantidades de envases aparezcan una vez cada una.
      expect(resultado.finishedGoods.map((r) => r.packages).sort()).toEqual(['2', '6']);

      const productoUno = await finishedProductDe(fixture.companyId, recipeId, fixture.presentationId);
      const productoDos = await finishedProductDe(fixture.companyId, recipeId, otraPresentacion.id);
      expect(productoUno).not.toBeNull();
      expect(productoDos).not.toBeNull();
      expect(productoUno?.id).not.toBe(productoDos?.id);

      const loteUno = await prisma.productBatch.findFirstOrThrow({ where: { productId: productoUno?.id }, select: { stock: true, unitCost: true } });
      const loteDos = await prisma.productBatch.findFirstOrThrow({ where: { productId: productoDos?.id }, select: { stock: true, unitCost: true } });
      // Importe guardado: 10 x 3.0000 de ingredientes + (6 + 2) envases a 0.5000 = 34.0000, entre
      // (6x1 + 2x2) = 10 -> 3.4000 para las DOS (QC-195 R27: el importe incluye los envases).
      expect(loteUno.stock.toFixed(4)).toBe('6.0000');
      expect(loteDos.stock.toFixed(4)).toBe('4.0000');
      expect(loteUno.unitCost?.toFixed(4)).toBe('3.4000');
      expect(loteDos.unitCost?.toFixed(4)).toBe('3.4000');
      expect(await prisma.productBatch.findUniqueOrThrow({ where: { id: batchId }, select: { stock: true } }).then((b) => b.stock.toFixed(4))).toBe('90.0000');
    } finally {
      // `otraPresentacion` referencia `fixture.unitId`: se borra ANTES que `borrarFixture`
      // llegue a la unidad, y su producto terminado antes que la propia presentacion (FK
      // `RESTRICT`), igual que `borrarFixture` ya hace con `fixture.presentationId`. El
      // asiento de produccion de ese lote se limpia primero, mismo orden que `borrarFixture`.
      await prisma.reservationMovement.deleteMany({ where: { companyId: fixture.companyId } });
      await prisma.inventoryMovement.deleteMany({ where: { companyId: fixture.companyId } });
      await prisma.orderPresentationLine.deleteMany({ where: { companyId: fixture.companyId } });
      await dropPackaging([otroEnvase]);
      await prisma.productBatch.deleteMany({ where: { product: { companyId: fixture.companyId, presentationId: otraPresentacion.id } } });
      await prisma.product.deleteMany({ where: { companyId: fixture.companyId, presentationId: otraPresentacion.id } });
      await prisma.presentation.deleteMany({ where: { id: otraPresentacion.id } });
      await borrarFixture(fixture, [productId]);
    }
  });
});

describe('R19 — sin contenido copiado ni vigente, Terminar rechaza el empaque entero', () => {
  it('una linea escrita directamente en la base sin contenido copiado, con la presentacion sin contenido vigente, rechaza con presentation_without_content sin cambiar nada', async () => {
    const fixture = await crearFixture('1.0000');
    const { productId, batchId } = await crearProductoConLote(fixture, '100');
    const recipeId = await crearReceta(fixture);
    await crearLineaCompleta(recipeId, productId);

    try {
      const creado = await createOrder(nuevoPedido(recipeId, fixture, '10.0000', 10), actorDe(fixture));
      await orderCatalog.transitionAliveById(creado.id, fixture.companyId, 'PENDIENTE', 'EN_CURSO', fixture.actorId, new Date());
      await orderCatalog.transitionAliveById(creado.id, fixture.companyId, 'EN_CURSO', 'POR_EMPACAR', fixture.actorId, new Date());
      const comenzado = await orderCatalog.startPackingAliveById(creado.id, fixture.companyId, fixture.actorId, new Date());
      expect(comenzado).toBe('ok');

      // R19 es defensa en profundidad: la escritura normal (R22-R25, R34) siempre copia
      // contenido, asi que este estado solo nace escribiendo la fila a mano.
      await prisma.orderPresentationLine.updateMany({ where: { orderId: creado.id }, data: { presentationContent: null } });
      await prisma.presentation.update({ where: { id: fixture.presentationId }, data: { content: null } });

      const resultado = await orderCatalog.finishPackingAliveById(creado.id, fixture.companyId, fixture.actorId, new Date());
      expect(resultado).toBe('presentation_without_content');

      const row = await prisma.order.findUniqueOrThrow({ where: { id: creado.id }, select: { status: true, finishedAt: true } });
      expect(row.status).toBe('EN_EMPAQUE');
      expect(row.finishedAt).toBeNull();
      // R15: Finalizar YA consumio el material -eso no depende del reparto ni de Terminar-,
      // asi que la existencia refleja ese consumo, no el estado de antes de Finalizar.
      expect(await prisma.productBatch.findUniqueOrThrow({ where: { id: batchId }, select: { stock: true } }).then((b) => b.stock.toFixed(4))).toBe('90.0000');
      expect(await finishedProductDe(fixture.companyId, recipeId, fixture.presentationId)).toBeNull();
    } finally {
      await borrarFixture(fixture, [productId]);
    }
  });
});

describe('recipe_not_found — la receta del pedido ya no existe para esa empresa al Terminar', () => {
  it('un recipeId cambiado a mano a uno de otra empresa justo antes de Terminar rechaza con recipe_not_found y no escribe nada', async () => {
    const fixtureA = await crearFixture('1.0000');
    const fixtureB = await crearFixture('1.0000');
    const { productId } = await crearProductoConLote(fixtureB, '100');
    const recipeIdDeB = await crearReceta(fixtureB);
    await crearLineaCompleta(recipeIdDeB, productId);
    const recipeIdDeA = await crearReceta(fixtureA);

    try {
      const creado = await createOrder(nuevoPedido(recipeIdDeB, fixtureB, '10.0000', 10), actorDe(fixtureB));
      await orderCatalog.transitionAliveById(creado.id, fixtureB.companyId, 'PENDIENTE', 'EN_CURSO', fixtureB.actorId, new Date());
      await orderCatalog.transitionAliveById(creado.id, fixtureB.companyId, 'EN_CURSO', 'POR_EMPACAR', fixtureB.actorId, new Date());
      const comenzado = await orderCatalog.startPackingAliveById(creado.id, fixtureB.companyId, fixtureB.actorId, new Date());
      expect(comenzado).toBe('ok');

      // La receta de A no existe para B: el mismo caso que R23/D24 probaba contra Finalizar
      // antes, ahora contra Terminar, la unica llamada que necesita el nombre de la
      // receta para el producto terminado.
      await prisma.order.update({ where: { id: creado.id }, data: { recipeId: recipeIdDeA } });

      const contarTodo = () =>
        Promise.all([
          prisma.product.count({ where: { companyId: { in: [fixtureA.companyId, fixtureB.companyId] } } }),
          prisma.productBatch.count({ where: { companyId: { in: [fixtureA.companyId, fixtureB.companyId] } } }),
          prisma.inventoryMovement.count({ where: { companyId: { in: [fixtureA.companyId, fixtureB.companyId] } } }),
        ]);
      const antes = await contarTodo();

      const resultado = await orderCatalog.finishPackingAliveById(creado.id, fixtureB.companyId, fixtureB.actorId, new Date());
      expect(resultado).toBe('recipe_not_found');

      const row = await prisma.order.findUniqueOrThrow({ where: { id: creado.id }, select: { status: true } });
      expect(row.status).toBe('EN_EMPAQUE');
      expect(await contarTodo()).toEqual(antes);
    } finally {
      await borrarFixture(fixtureB, [productId]);
      await borrarFixture(fixtureA, []);
    }
  });
});

describe('R20 — la edicion en Pedidos no da de alta producto terminado', () => {
  it('editar un pedido EN_CURSO por el caso de uso real de edicion no crea producto, lote ni asiento, y el pedido sigue sin ENTREGADO', async () => {
    const fixture = await crearFixture('1.0000');
    const { productId, batchId } = await crearProductoConLote(fixture, '100');
    const recipeId = await crearReceta(fixture, `Desengrasante ${token()}`);
    await crearLineaCompleta(recipeId, productId);

    try {
      const creado = await createOrder(nuevoPedido(recipeId, fixture, '10.0000', 10), actorDe(fixture));

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
        { recipeId, quantity: '20.0000', unitId: fixture.unitId, presentationLines: [{ packagingProductId: fixture.packagingProductId, packages: 20 }], status: 'ENTREGADO' },
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

describe('R19 — un fallo forzado tras el lote deshace la transaccion entera', () => {
  it('un finishedGoods que escribe y luego lanza no deja ni el estado, ni el producto, ni el asiento', async () => {
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
                throw new Error('fallo forzado tras el lote, para R19');
              },
            },
          };
          return work(scope);
        }),
    };
    const finishPackingAliveByIdConFallo = createFinishPacking({
      packing: orderPackingRepository,
      unitOfWork: unitOfWorkQueForzaFallo,
      recipes,
      products,
      units,
      presentations,
      packaging: packagingCatalog,
    });

    try {
      const creado = await createOrder(nuevoPedido(recipeId, fixture, '10.0000', 10), actorDe(fixture));
      await orderCatalog.transitionAliveById(creado.id, fixture.companyId, 'PENDIENTE', 'EN_CURSO', fixture.actorId, new Date());
      await orderCatalog.transitionAliveById(creado.id, fixture.companyId, 'EN_CURSO', 'POR_EMPACAR', fixture.actorId, new Date());
      const comenzado = await orderCatalog.startPackingAliveById(creado.id, fixture.companyId, fixture.actorId, new Date());
      expect(comenzado).toBe('ok');

      await expect(
        finishPackingAliveByIdConFallo(creado.id, fixture.companyId, fixture.actorId, new Date()),
      ).rejects.toThrow('fallo forzado tras el lote, para R19');

      const row = await prisma.order.findUniqueOrThrow({ where: { id: creado.id }, select: { status: true, finishedAt: true } });
      expect(row.status).toBe('EN_EMPAQUE');
      expect(row.finishedAt).toBeNull();
      expect(await prisma.productBatch.findUniqueOrThrow({ where: { id: batchId }, select: { stock: true } }).then((b) => b.stock.toFixed(4))).toBe('90.0000');
      expect(await finishedProductDe(fixture.companyId, recipeId, fixture.presentationId)).toBeNull();
      const asientoDeProduccion = await prisma.inventoryMovement.findFirst({ where: { orderId: creado.id, kind: 'production' }, select: { id: true } });
      expect(asientoDeProduccion).toBeNull();
    } finally {
      await borrarFixture(fixture, [productId]);
    }
  });
});

describe('R21 — un solo lote por pedido, tambien a la vez', () => {
  it('dos Terminar del mismo pedido, uno tras otro, no dan de alta un segundo lote', async () => {
    const fixture = await crearFixture('1.0000');
    const { productId } = await crearProductoConLote(fixture, '100');
    const recipeId = await crearReceta(fixture);
    await crearLineaCompleta(recipeId, productId);

    try {
      const creado = await createOrder(nuevoPedido(recipeId, fixture, '10.0000', 10), actorDe(fixture));
      await orderCatalog.transitionAliveById(creado.id, fixture.companyId, 'PENDIENTE', 'EN_CURSO', fixture.actorId, new Date());
      await orderCatalog.transitionAliveById(creado.id, fixture.companyId, 'EN_CURSO', 'POR_EMPACAR', fixture.actorId, new Date());
      const comenzado = await orderCatalog.startPackingAliveById(creado.id, fixture.companyId, fixture.actorId, new Date());
      expect(comenzado).toBe('ok');

      const primero = await orderCatalog.finishPackingAliveById(creado.id, fixture.companyId, fixture.actorId, new Date());
      expect(primero).toMatchObject({ kind: 'ok' });
      const segundo = await orderCatalog.finishPackingAliveById(creado.id, fixture.companyId, fixture.actorId, new Date());
      expect(segundo).toBe('not_packable');

      const producto = await finishedProductDe(fixture.companyId, recipeId, fixture.presentationId);
      const lotes = await prisma.productBatch.findMany({ where: { productId: producto?.id } });
      expect(lotes).toHaveLength(1);
    } finally {
      await borrarFixture(fixture, [productId]);
    }
  });

  it('dos Terminar del mismo pedido A LA VEZ terminan con un solo lote', async () => {
    const fixture = await crearFixture('1.0000');
    const { productId } = await crearProductoConLote(fixture, '100');
    const recipeId = await crearReceta(fixture);
    await crearLineaCompleta(recipeId, productId);

    try {
      const creado = await createOrder(nuevoPedido(recipeId, fixture, '10.0000', 10), actorDe(fixture));
      await orderCatalog.transitionAliveById(creado.id, fixture.companyId, 'PENDIENTE', 'EN_CURSO', fixture.actorId, new Date());
      await orderCatalog.transitionAliveById(creado.id, fixture.companyId, 'EN_CURSO', 'POR_EMPACAR', fixture.actorId, new Date());
      const comenzado = await orderCatalog.startPackingAliveById(creado.id, fixture.companyId, fixture.actorId, new Date());
      expect(comenzado).toBe('ok');

      const resultados = await Promise.allSettled([
        orderCatalog.finishPackingAliveById(creado.id, fixture.companyId, fixture.actorId, new Date()),
        orderCatalog.finishPackingAliveById(creado.id, fixture.companyId, fixture.actorId, new Date()),
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

describe('R26 — el Finalizar de asignaciones exige el permiso primero, sin dar de alta nada', () => {
  it('R26: Finalizar deja el pedido POR_EMPACAR con el numero del pedido, sin ningun lote todavia (eso es Terminar)', async () => {
    const fixture = await crearFixture('1.0000');
    const { productId } = await crearProductoConLote(fixture, '100');
    const recipeId = await crearReceta(fixture, `Desengrasante ${token()}`);
    await crearLineaCompleta(recipeId, productId);

    try {
      const creado = await createOrder(nuevoPedido(recipeId, fixture, '10.0000', 10), actorDe(fixture));
      await orderCatalog.transitionAliveById(creado.id, fixture.companyId, 'PENDIENTE', 'EN_CURSO', fixture.actorId, new Date());

      const resultado = await finishAssignedOrderPara(creado.id)(asignacionesActorDe(fixture), { orderId: creado.id });

      expect(resultado.numberText).toMatch(/^\d{4}-\d+$/);
      expect(await finishedProductDe(fixture.companyId, recipeId, fixture.presentationId)).toBeNull();
    } finally {
      await borrarFixture(fixture, [productId]);
    }
  });

  it('sin el permiso, rechaza ANTES de leer el pedido y sin dar de alta nada', async () => {
    const fixture = await crearFixture('1.0000');
    const { productId } = await crearProductoConLote(fixture, '100');
    const recipeId = await crearReceta(fixture);
    await crearLineaCompleta(recipeId, productId);

    try {
      const creado = await createOrder(nuevoPedido(recipeId, fixture, '10.0000', 10), actorDe(fixture));

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

describe('R18 — el coste del lote', () => {
  it('con importe guardado, el lote entra a ese coste dividido entre la cantidad que entra, y el pedido no cambia', async () => {
    const fixture = await crearFixture('1.0000');
    const { productId } = await crearProductoConLote(fixture, '100', '2.0000');
    const recipeId = await crearReceta(fixture);
    await crearLineaCompleta(recipeId, productId);

    try {
      const creado = await createOrder(nuevoPedido(recipeId, fixture, '10.0000', 10), actorDe(fixture));
      const antes = await prisma.order.findUniqueOrThrow({ where: { id: creado.id }, select: { ingredientsCost: true } });
      // 10 x 2.0000 de ingredientes + 10 envases a 0.5000 (QC-195 R27).
      expect(antes.ingredientsCost?.toFixed(4)).toBe('25.0000');

      await orderCatalog.transitionAliveById(creado.id, fixture.companyId, 'PENDIENTE', 'EN_CURSO', fixture.actorId, new Date());
      await orderCatalog.transitionAliveById(creado.id, fixture.companyId, 'EN_CURSO', 'POR_EMPACAR', fixture.actorId, new Date());
      await empacarYTerminar(creado.id, fixture.companyId, fixture.actorId, new Date());

      const producto = await finishedProductDe(fixture.companyId, recipeId, fixture.presentationId);
      const lote = await prisma.productBatch.findFirstOrThrow({ where: { productId: producto?.id }, select: { unitCost: true } });
      // 25.0000 (importe guardado) / 10 (cantidad que entra) = 2.5000
      expect(lote.unitCost?.toFixed(4)).toBe('2.5000');

      const despues = await prisma.order.findUniqueOrThrow({ where: { id: creado.id }, select: { ingredientsCost: true } });
      expect(despues.ingredientsCost?.toFixed(4)).toBe('25.0000');
    } finally {
      await borrarFixture(fixture, [productId]);
    }
  });

  it('con importe nulo, se recalcula al Terminar con la receta que el pedido tiene en ese instante', async () => {
    const fixture = await crearFixture('1.0000');
    const { productId, batchId } = await crearProductoConLote(fixture, '100', '3.0000');
    const recipeVacia = await crearReceta(fixture);
    const recipeConLinea = await crearReceta(fixture);
    await crearLineaCompleta(recipeConLinea, productId);

    try {
      // Se crea con la receta VACIA -sin lineas, `calculateIngredientsCost` devuelve `null`,
      // que tampoco aparta nada-; se recarga con la receta con linea por fuera del caso de uso,
      // igual que el patron de `order-reservation.int.test.ts`: el pedido llega sin nada
      // apartado y sin importe guardado.
      const creado = await createOrder(nuevoPedido(recipeVacia, fixture, '10.0000', 10), actorDe(fixture));
      const antes = await prisma.order.findUniqueOrThrow({ where: { id: creado.id }, select: { ingredientsCost: true } });
      expect(antes.ingredientsCost).toBeNull();
      await prisma.order.update({ where: { id: creado.id }, data: { recipeId: recipeConLinea } });
      await orderCatalog.transitionAliveById(creado.id, fixture.companyId, 'PENDIENTE', 'EN_CURSO', fixture.actorId, new Date());
      await orderCatalog.transitionAliveById(creado.id, fixture.companyId, 'EN_CURSO', 'POR_EMPACAR', fixture.actorId, new Date());

      const resultado = await empacarYTerminar(creado.id, fixture.companyId, fixture.actorId, new Date());
      expect(resultado).toMatchObject({ kind: 'ok', finishedGoods: [{ packages: '10' }] });

      const producto = await finishedProductDe(fixture.companyId, recipeConLinea, fixture.presentationId);
      const lote = await prisma.productBatch.findFirstOrThrow({ where: { productId: producto?.id }, select: { unitCost: true } });
      // Sin importe guardado, se recalcula: 10 (100% de 10) x 3.0000 = 30.0000 mas 10 envases a
      // 0.5000 (QC-195 R31), dividido entre 10 (cantidad que entra) = 3.5000.
      expect(lote.unitCost?.toFixed(4)).toBe('3.5000');
      expect(await prisma.productBatch.findUniqueOrThrow({ where: { id: batchId }, select: { stock: true } }).then((b) => b.stock.toFixed(4))).toBe('90.0000');

      const despues = await prisma.order.findUniqueOrThrow({ where: { id: creado.id }, select: { ingredientsCost: true } });
      // El importe guardado del pedido sigue nulo: el recalculo del lote no lo escribe.
      expect(despues.ingredientsCost).toBeNull();
    } finally {
      await borrarFixture(fixture, [productId]);
    }
  });

  it('un ingrediente con material pero sin costo cuenta cero, y el pedido sigue sin importe guardado', async () => {
    const fixture = await crearFixture('1.0000');
    const { productId: productoConCosto } = await crearProductoConLote(fixture, '100', '5.0000');
    const { productId: maquinaSinCosto } = await crearMaquinaSinCosto(fixture, '50');
    const recipeId = await crearReceta(fixture);
    await crearLinea(recipeId, productoConCosto, '60.00');
    await crearLinea(recipeId, maquinaSinCosto, '40.00');

    try {
      const creado = await createOrder(nuevoPedido(recipeId, fixture, '10.0000', 10), actorDe(fixture));
      const antes = await prisma.order.findUniqueOrThrow({ where: { id: creado.id }, select: { ingredientsCost: true } });
      // El ingrediente MACHINE sin costo invalida el importe del pedido entero.
      expect(antes.ingredientsCost).toBeNull();

      await orderCatalog.transitionAliveById(creado.id, fixture.companyId, 'PENDIENTE', 'EN_CURSO', fixture.actorId, new Date());
      await orderCatalog.transitionAliveById(creado.id, fixture.companyId, 'EN_CURSO', 'POR_EMPACAR', fixture.actorId, new Date());
      const resultado = await empacarYTerminar(creado.id, fixture.companyId, fixture.actorId, new Date());
      expect(resultado).toMatchObject({ kind: 'ok', finishedGoods: [{ packages: '10' }] });

      const producto = await finishedProductDe(fixture.companyId, recipeId, fixture.presentationId);
      const lote = await prisma.productBatch.findFirstOrThrow({ where: { productId: producto?.id }, select: { unitCost: true } });
      // Solo el ingrediente con costo cuenta: 60% de 10 x 5.0000 = 30.0000, mas 10 envases a
      // 0.5000 (QC-195 R31), entre 10 (cantidad que entra) = 3.5000. La maquina sin costo aporta cero.
      expect(lote.unitCost?.toFixed(4)).toBe('3.5000');

      const despues = await prisma.order.findUniqueOrThrow({ where: { id: creado.id }, select: { ingredientsCost: true } });
      expect(despues.ingredientsCost).toBeNull();
    } finally {
      await borrarFixture(fixture, [productoConCosto, maquinaSinCosto]);
    }
  });
});

describe('R18 — reparto en dos unidades: el coste se reparte en la unidad del pedido', () => {
  /** Unidad derivada de la de la fixture (1 = 0,001 de ella, como ml de L) y una presentacion
   *  de 200 en esa unidad. */
  async function crearMililitro(
    fixture: Fixture,
  ): Promise<{ readonly unitId: string; readonly presentationId: string; readonly packagingProductId: string }> {
    const marca = token();
    const unit = await prisma.unit.create({
      data: { name: `Mili ${marca}`, nameNormalized: `mili${marca}`, symbol: `ml${marca}`, baseUnitId: fixture.unitId, factor: '0.0010' },
      select: { id: true },
    });
    const presentation = await prisma.presentation.create({
      data: { name: `Frasco ${marca}`, nameNormalized: normalizeForTest(`Frasco ${marca}`), unitId: unit.id, companyId: fixture.companyId, content: '200.0000' },
      select: { id: true },
    });
    const packagingProductId = await seedPackaging({
      companyId: fixture.companyId,
      presentationId: presentation.id,
      createdBy: fixture.actorId,
    });
    return { unitId: unit.id, presentationId: presentation.id, packagingProductId };
  }

  async function borrarMililitro(
    fixture: Fixture,
    mililitro: { readonly unitId: string; readonly presentationId: string; readonly packagingProductId: string },
  ): Promise<void> {
    await prisma.reservationMovement.deleteMany({ where: { companyId: fixture.companyId } });
    await prisma.inventoryMovement.deleteMany({ where: { companyId: fixture.companyId } });
    await prisma.orderPresentationLine.deleteMany({ where: { companyId: fixture.companyId } });
    await dropPackaging([mililitro.packagingProductId]);
    await prisma.productBatch.deleteMany({ where: { product: { companyId: fixture.companyId, presentationId: mililitro.presentationId } } });
    await prisma.product.deleteMany({ where: { companyId: fixture.companyId, presentationId: mililitro.presentationId } });
    await prisma.presentation.deleteMany({ where: { id: mililitro.presentationId } });
    await prisma.unit.deleteMany({ where: { id: mililitro.unitId } });
  }

  /** Pedido de 100 en la unidad de la fixture, coste guardado 1000 (100 x 10.0000), con 5 x 200
   *  en la unidad derivada y 60 x 1 en la de la fixture: 61 en la unidad del pedido. */
  async function pedidoMixto(fixture: Fixture, mililitro: { readonly packagingProductId: string }, recipeId: string): Promise<string> {
    const creado = await createOrder(
      {
        recipeId,
        quantity: '100.0000',
        priority: 'BAJA',
        status: 'PENDIENTE',
        unitId: fixture.unitId,
        presentationLines: [
          { packagingProductId: mililitro.packagingProductId, packages: 5 },
          { packagingProductId: fixture.packagingProductId, packages: 60 },
        ],
      },
      actorDe(fixture),
    );
    await orderCatalog.transitionAliveById(creado.id, fixture.companyId, 'PENDIENTE', 'EN_CURSO', fixture.actorId, new Date());
    await orderCatalog.transitionAliveById(creado.id, fixture.companyId, 'EN_CURSO', 'POR_EMPACAR', fixture.actorId, new Date());
    return creado.id;
  }

  it('R18: cada lote lleva el coste por unidad del pedido expresado en su unidad, y entre los dos suman el coste del pedido', async () => {
    const fixture = await crearFixture('1.0000');
    const mililitro = await crearMililitro(fixture);
    const { productId } = await crearProductoConLote(fixture, '200', '10.0000');
    const recipeId = await crearReceta(fixture);
    await crearLineaCompleta(recipeId, productId);

    try {
      const orderId = await pedidoMixto(fixture, mililitro, recipeId);
      const antes = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { ingredientsCost: true } });
      // 100 x 10.0000 de ingredientes + (5 + 60) envases a 0.5000 (QC-195 R27).
      expect(antes.ingredientsCost?.toFixed(4)).toBe('1032.5000');

      const resultado = await empacarYTerminar(orderId, fixture.companyId, fixture.actorId, new Date());
      expect(resultado).toMatchObject({ kind: 'ok' });

      const productoMl = await finishedProductDe(fixture.companyId, recipeId, mililitro.presentationId);
      const productoL = await finishedProductDe(fixture.companyId, recipeId, fixture.presentationId);
      const loteMl = await prisma.productBatch.findFirstOrThrow({ where: { productId: productoMl?.id }, select: { stock: true, unitCost: true } });
      const loteL = await prisma.productBatch.findFirstOrThrow({ where: { productId: productoL?.id }, select: { stock: true, unitCost: true } });

      // 1032.5 / 61 = 16.9262 por unidad del pedido; en la derivada, 1032.5 / 61000 = 0.0169.
      expect(loteL.stock.toFixed(4)).toBe('60.0000');
      expect(loteL.unitCost?.toFixed(4)).toBe('16.9262');
      expect(loteMl.stock.toFixed(4)).toBe('1000.0000');
      expect(loteMl.unitCost?.toFixed(4)).toBe('0.0169');

      // 16.9000 + 1015.5720: el resto es el redondeo a cuatro decimales del coste unitario.
      const valorMl = loteMl.stock.mul(loteMl.unitCost ?? 0);
      const valorL = loteL.stock.mul(loteL.unitCost ?? 0);
      expect(valorMl.toFixed(2)).toBe('16.90');
      expect(valorL.toFixed(2)).toBe('1015.57');
      expect(valorMl.add(valorL).toFixed(1)).toBe('1032.5');
    } finally {
      await borrarMililitro(fixture, mililitro);
      await borrarFixture(fixture, [productId]);
    }
  });

  it('R7, R18: una linea que ya no se puede convertir a la unidad del pedido rechaza con incompatible_units, ningun lote nace y el pedido sigue EN_EMPAQUE', async () => {
    const fixture = await crearFixture('1.0000');
    const mililitro = await crearMililitro(fixture);
    const { productId } = await crearProductoConLote(fixture, '200', '10.0000');
    const recipeId = await crearReceta(fixture);
    await crearLineaCompleta(recipeId, productId);

    try {
      const orderId = await pedidoMixto(fixture, mililitro, recipeId);
      expect(await orderCatalog.startPackingAliveById(orderId, fixture.companyId, fixture.actorId, new Date())).toBe('ok');

      // Defensa en profundidad: la escritura normal no deja llegar aqui con un reparto
      // inconvertible, asi que se rompe la derivacion de la unidad escribiendo en la base.
      await prisma.unit.update({ where: { id: mililitro.unitId }, data: { baseUnitId: null, factor: null } });

      const resultado = await orderCatalog.finishPackingAliveById(orderId, fixture.companyId, fixture.actorId, new Date());
      expect(resultado).toBe('incompatible_units');

      const row = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true, finishedAt: true } });
      expect(row.status).toBe('EN_EMPAQUE');
      expect(row.finishedAt).toBeNull();
      expect(await finishedProductDe(fixture.companyId, recipeId, mililitro.presentationId)).toBeNull();
      expect(await finishedProductDe(fixture.companyId, recipeId, fixture.presentationId)).toBeNull();
    } finally {
      await borrarMililitro(fixture, mililitro);
      await borrarFixture(fixture, [productId]);
    }
  });
});

describe('QC-195 — Terminar consume los envases del reparto', () => {
  /** Lo apartado neto del pedido en los lotes de un producto (reserve - release - consume). */
  async function apartadoNeto(orderId: string, productId: string): Promise<string> {
    const rows = await prisma.$queryRaw<{ neto: string | null }[]>`
      SELECT SUM(CASE WHEN m."kind" = 'reserve' THEN m."quantity" ELSE -m."quantity" END)::text AS "neto"
        FROM "reservation_movements" m
        JOIN "product_batches" b ON b."id" = m."batch_id"
       WHERE m."order_id" = ${orderId}::uuid AND b."product_id" = ${productId}::uuid`;
    return Number(rows[0]?.neto ?? '0').toFixed(4);
  }

  async function existenciaDe(productId: string): Promise<string> {
    const row = await prisma.product.findUniqueOrThrow({ where: { id: productId }, select: { stock: true } });
    return row.stock.toFixed(4);
  }

  /** Un pedido de `quantity` en `packages` envases de la fixture, ya en `EN_EMPAQUE`. */
  async function pedidoEnEmpaque(fixture: Fixture, recipeId: string, quantity: string, packages: number): Promise<string> {
    const creado = await createOrder(nuevoPedido(recipeId, fixture, quantity, packages), actorDe(fixture));
    expect(await orderCatalog.transitionAliveById(creado.id, fixture.companyId, 'PENDIENTE', 'EN_CURSO', fixture.actorId, new Date())).toBe('ok');
    expect(await orderCatalog.transitionAliveById(creado.id, fixture.companyId, 'EN_CURSO', 'POR_EMPACAR', fixture.actorId, new Date())).toBe('ok');
    expect(await orderCatalog.startPackingAliveById(creado.id, fixture.companyId, fixture.actorId, new Date())).toBe('ok');
    return creado.id;
  }

  it('R25: Terminar consume los envases apartados en la misma transaccion que da de alta el producto terminado', async () => {
    const fixture = await crearFixture('1.0000');
    const { productId } = await crearProductoConLote(fixture, '100');
    const recipeId = await crearReceta(fixture);
    await crearLineaCompleta(recipeId, productId);

    try {
      const orderId = await pedidoEnEmpaque(fixture, recipeId, '10.0000', 10);
      // Hasta Terminar los envases siguen apartados y con su existencia entera.
      expect(await apartadoNeto(orderId, fixture.packagingProductId)).toBe('10.0000');
      expect(await existenciaDe(fixture.packagingProductId)).toBe('1000.0000');

      const resultado = await orderCatalog.finishPackingAliveById(orderId, fixture.companyId, fixture.actorId, new Date());
      expect(resultado).toMatchObject({ kind: 'ok', finishedGoods: [{ packages: '10' }] });

      expect(await existenciaDe(fixture.packagingProductId)).toBe('990.0000');
      expect(await apartadoNeto(orderId, fixture.packagingProductId)).toBe('0.0000');
      const consumo = await prisma.inventoryMovement.findFirst({
        where: { orderId, kind: 'consumption', batch: { productId: fixture.packagingProductId } },
        select: { quantity: true, createdBy: true },
      });
      expect(consumo?.quantity.abs().toFixed(4)).toBe('10.0000');
      expect(consumo?.createdBy).toBe(fixture.actorId);
      expect(await finishedProductDe(fixture.companyId, recipeId, fixture.presentationId)).not.toBeNull();
    } finally {
      await borrarFixture(fixture, [productId]);
    }
  });

  it('R25: si el disponible de los envases no alcanza, Terminar rechaza con insufficient_material sin mover el estado ni dar de alta producto terminado', async () => {
    const fixture = await crearFixture('1.0000');
    const { productId } = await crearProductoConLote(fixture, '100');
    const recipeId = await crearReceta(fixture);
    await crearLineaCompleta(recipeId, productId);

    try {
      const orderId = await pedidoEnEmpaque(fixture, recipeId, '10.0000', 10);
      // Merma escrita fuera de la aplicacion: quedan 4 envases fisicos de los 10 apartados.
      await prisma.productBatch.updateMany({ where: { productId: fixture.packagingProductId }, data: { stock: '4' } });
      await prisma.product.update({ where: { id: fixture.packagingProductId }, data: { stock: '4' } });

      const resultado = await orderCatalog.finishPackingAliveById(orderId, fixture.companyId, fixture.actorId, new Date());
      expect(resultado).toBe('insufficient_material');

      const row = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true, finishedAt: true } });
      expect(row.status).toBe('EN_EMPAQUE');
      expect(row.finishedAt).toBeNull();
      expect(await finishedProductDe(fixture.companyId, recipeId, fixture.presentationId)).toBeNull();
      expect(await existenciaDe(fixture.packagingProductId)).toBe('4.0000');
      expect(await apartadoNeto(orderId, fixture.packagingProductId)).toBe('10.0000');
    } finally {
      await borrarFixture(fixture, [productId]);
    }
  });

  it('R14: el producto terminado entra en la presentacion y el contenido copiados al guardar, aunque el envase y su presentacion cambien despues', async () => {
    const fixture = await crearFixture('1.0000');
    const { productId } = await crearProductoConLote(fixture, '100');
    const recipeId = await crearReceta(fixture);
    await crearLineaCompleta(recipeId, productId);
    const marca = token();
    const otra = await prisma.presentation.create({
      data: { name: `Garrafa ${marca}`, nameNormalized: `garrafa${marca}`, unitId: fixture.unitId, companyId: fixture.companyId, content: '5.0000' },
      select: { id: true },
    });

    try {
      const orderId = await pedidoEnEmpaque(fixture, recipeId, '10.0000', 10);
      await prisma.product.update({ where: { id: fixture.packagingProductId }, data: { presentationId: otra.id } });
      await prisma.presentation.update({ where: { id: fixture.presentationId }, data: { content: '2.0000' } });

      const resultado = await orderCatalog.finishPackingAliveById(orderId, fixture.companyId, fixture.actorId, new Date());
      expect(resultado).toMatchObject({ kind: 'ok', finishedGoods: [{ packages: '10' }] });

      const producto = await finishedProductDe(fixture.companyId, recipeId, fixture.presentationId);
      expect(producto).not.toBeNull();
      expect(await finishedProductDe(fixture.companyId, recipeId, otra.id)).toBeNull();
      const lote = await prisma.productBatch.findFirstOrThrow({
        where: { productId: producto?.id },
        select: { stock: true, packageContent: true, presentationId: true },
      });
      expect(lote.presentationId).toBe(fixture.presentationId);
      expect(lote.packageContent?.toFixed(4)).toBe('1.0000');
      expect(lote.stock.toFixed(4)).toBe('10.0000');
    } finally {
      await prisma.product.update({ where: { id: fixture.packagingProductId }, data: { presentationId: fixture.presentationId } });
      await prisma.presentation.deleteMany({ where: { id: otra.id } });
      await borrarFixture(fixture, [productId]);
    }
  });

  it('R33: una linea antigua, sin envase ni nada apartado por ella, termina como hoy y no consume ningun envase', async () => {
    const fixture = await crearFixture('1.0000');
    const { productId } = await crearProductoConLote(fixture, '100');
    const recipeId = await crearReceta(fixture);
    await crearLineaCompleta(recipeId, productId);

    try {
      const orderId = await pedidoEnEmpaque(fixture, recipeId, '10.0000', 10);
      // Asi queda un pedido guardado antes de los envases: la linea sin envase y nada apartado por ella.
      const batchIds = (await prisma.productBatch.findMany({ where: { productId: fixture.packagingProductId }, select: { id: true } })).map((b) => b.id);
      await prisma.reservationMovement.deleteMany({ where: { orderId, batchId: { in: batchIds } } });
      await prisma.orderPresentationLine.updateMany({ where: { orderId }, data: { packagingProductId: null } });

      const resultado = await orderCatalog.finishPackingAliveById(orderId, fixture.companyId, fixture.actorId, new Date());
      expect(resultado).toMatchObject({ kind: 'ok', finishedGoods: [{ packages: '10' }] });

      const row = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } });
      expect(row.status).toBe('ENTREGADO');
      expect(await finishedProductDe(fixture.companyId, recipeId, fixture.presentationId)).not.toBeNull();
      expect(await existenciaDe(fixture.packagingProductId)).toBe('1000.0000');
      expect(await prisma.inventoryMovement.count({ where: { orderId, batchId: { in: batchIds } } })).toBe(0);
    } finally {
      await borrarFixture(fixture, [productId]);
    }
  });
});
