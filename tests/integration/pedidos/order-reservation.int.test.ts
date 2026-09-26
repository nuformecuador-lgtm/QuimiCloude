/**
 * Crear, editar, cancelar y borrar con reserva, contra Postgres real: los cuatro casos de uso
 * de `pedidos` cableados a mano con los adaptadores driven REALES de `pedidos`, `recetas`,
 * `inventario` y `unidades` -el mismo conjunto que `lib/composition` ata, sin pasar por
 * `lib/composition` para no arrastrar el resto de la aplicacion a un test de dominio-.
 *
 * AISLAMIENTO — `withOrderTransaction` abre su PROPIA `prisma.$transaction` sobre el cliente
 * global (mismo criterio que `order-unit-of-work.int.test.ts`): envolver la corrida en una
 * transaccion del test seria aislamiento de mentira. Cada caso fabrica su propia empresa
 * efimera con randomUUID (usuario, presentacion, receta y, cuando hace falta, producto y lote)
 * y la limpia en un `finally`.
 *
 * Recetas en PORCENTAJE: `crearLinea` inserta en `recipe_lines` con `percentage`, nunca
 * `quantity` -esa columna ya no existe-.
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
  findAliveOrderById,
  listAliveOrders,
  createOrderWriteRepository,
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

import {
  createCancelOrder,
  createCreateOrder,
  createDeleteOrder,
  createTransitionOrder,
  createUpdateOrder,
} from '@/lib/modules/pedidos';

import type { Actor, NewOrder, OrderCatalog } from '@/lib/modules/pedidos';
import type { PresentationCatalog, ProductCatalog } from '@/lib/modules/inventario';
import type { OrderRepository } from '@/lib/modules/pedidos/ports/order-repository';
import type { OrderTransactionScope, OrderUnitOfWork } from '@/lib/modules/pedidos/ports/order-unit-of-work';
import type { RecipeCatalog } from '@/lib/modules/recetas';
import type { UnitCatalog } from '@/lib/modules/unidades';

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

const orders: OrderRepository = { findAliveById: findAliveOrderById, listAlive: listAliveOrders };

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
const cancelOrder = createCancelOrder({ orders, unitOfWork, now: () => new Date() });
const deleteOrder = createDeleteOrder({ orders, unitOfWork, now: () => new Date() });

/** El camino del Finalizar de la planta: `OrderCatalog['transitionAliveById']` cableado igual
 *  que `lib/composition`, sin pasar por `asignaciones`. */
const transitionAliveById: OrderCatalog['transitionAliveById'] = createTransitionOrder({
  unitOfWork,
  recipes,
  products,
  units,
});

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
  // Contenido `1`: las cantidades de este archivo son enteras, asi que un envase
  // entero coincide con la cantidad pedida y el Finalizar nunca rechaza por `no_whole_package`.
  const presentation = await prisma.presentation.create({
    data: {
      name: `Bidon ${marca}`,
      nameNormalized: normalizeForTest(`Bidon ${marca}`),
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

async function borrarFixture(fixture: Fixture, productIds: readonly string[]): Promise<void> {
  await prisma.reservationMovement.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.inventoryMovement.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.order.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.recipeLine.deleteMany({ where: { recipe: { companyId: fixture.companyId } } });
  // El producto terminado que un Finalizar da de alta referencia la receta con
  // `ON DELETE RESTRICT`: se limpia ANTES de borrar la receta, no solo los ingredientes.
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

async function crearReceta(fixture: Fixture): Promise<string> {
  const marca = token();
  const recipe = await prisma.recipe.create({
    data: { name: `Receta ${marca}`, nameNormalized: normalizeForTest(`Receta ${marca}`), companyId: fixture.companyId, createdBy: fixture.actorId },
    select: { id: true },
  });
  return recipe.id;
}

/** Una unica linea al 100 %: la necesidad queda igual a la cantidad del pedido. */
async function crearLineaCompleta(recipeId: string, productId: string): Promise<void> {
  await prisma.recipeLine.create({ data: { recipeId, productId, percentage: new Prisma.Decimal('100.00') } });
}

async function crearProductoConLote(fixture: Fixture, stock: string): Promise<{ productId: string; batchId: string }> {
  const created = await createWithFirstBatch(
    { name: `Producto ${token()}` },
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

function nuevoPedido(recipeId: string, presentationId: string, quantity: string, status: NewOrder['status'] = 'PENDIENTE'): NewOrder {
  return { recipeId, quantity, priority: 'BAJA', status, presentationId, presentationContent: null };
}

type ReservaResumen = { readonly kind: string; readonly quantity: string; readonly createdBy: string | null };

async function movimientosDe(orderId: string): Promise<readonly ReservaResumen[]> {
  const rows = await prisma.reservationMovement.findMany({
    where: { orderId },
    select: { kind: true, quantity: true, createdBy: true },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((row) => ({ kind: row.kind, quantity: row.quantity.toFixed(4), createdBy: row.createdBy }));
}

async function reservedAtDe(orderId: string): Promise<Date | null> {
  const row = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { reservedAt: true } });
  return row.reservedAt;
}

async function finishedAtDe(orderId: string): Promise<Date | null> {
  const row = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { finishedAt: true } });
  return row.finishedAt;
}

async function stockDe(batchId: string): Promise<string> {
  const row = await prisma.productBatch.findUniqueOrThrow({ where: { id: batchId }, select: { stock: true } });
  return row.stock.toFixed(4);
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('R7, R20 — crear aparta y fija reserved_at', () => {
  it('un pedido nuevo aparta lo que necesita, en un solo asiento reserve, con reserved_at fijado', async () => {
    const fixture = await crearFixture();
    const { productId } = await crearProductoConLote(fixture, '100');
    const recipeId = await crearReceta(fixture);
    await crearLineaCompleta(recipeId, productId);

    try {
      const creado = await createOrder(nuevoPedido(recipeId, fixture.presentationId, '10.0000'), actorDe(fixture));

      const movimientos = await movimientosDe(creado.id);
      expect(movimientos).toEqual([{ kind: 'reserve', quantity: '10.0000', createdBy: fixture.actorId }]);
      expect(await reservedAtDe(creado.id)).not.toBeNull();
    } finally {
      await borrarFixture(fixture, [productId]);
    }
  });
});

describe('R12 — editar a la baja deja solo la diferencia', () => {
  it('bajar la cantidad libera exactamente la diferencia, no lo apartado entero', async () => {
    const fixture = await crearFixture();
    const { productId } = await crearProductoConLote(fixture, '100');
    const recipeId = await crearReceta(fixture);
    await crearLineaCompleta(recipeId, productId);

    try {
      const creado = await createOrder(nuevoPedido(recipeId, fixture.presentationId, '10.0000'), actorDe(fixture));
      const primeraReservedAt = await reservedAtDe(creado.id);

      await updateOrder(creado.id, nuevoPedido(recipeId, fixture.presentationId, '4.0000'), actorDe(fixture));

      const movimientos = await movimientosDe(creado.id);
      expect(movimientos).toEqual([
        { kind: 'reserve', quantity: '10.0000', createdBy: fixture.actorId },
        { kind: 'release', quantity: '6.0000', createdBy: fixture.actorId },
      ]);
      // La edicion reinicia el plazo -sigue fijado, y no es necesariamente un instante
      // distinto en un reloj de baja resolucion, pero el pedido sigue "apartado".
      expect(await reservedAtDe(creado.id)).not.toBeNull();
      expect(primeraReservedAt).not.toBeNull();
    } finally {
      await borrarFixture(fixture, [productId]);
    }
  });
});

describe('R13 — editar que ya no cabe libera todo', () => {
  it('subir la cantidad por encima de la existencia libera lo que tenia apartado, sin error', async () => {
    const fixture = await crearFixture();
    const { productId } = await crearProductoConLote(fixture, '100');
    const recipeId = await crearReceta(fixture);
    await crearLineaCompleta(recipeId, productId);

    try {
      const creado = await createOrder(nuevoPedido(recipeId, fixture.presentationId, '10.0000'), actorDe(fixture));

      await updateOrder(creado.id, nuevoPedido(recipeId, fixture.presentationId, '1000.0000'), actorDe(fixture));

      const movimientos = await movimientosDe(creado.id);
      expect(movimientos).toEqual([
        { kind: 'reserve', quantity: '10.0000', createdBy: fixture.actorId },
        { kind: 'release', quantity: '10.0000', createdBy: fixture.actorId },
      ]);
      expect(await reservedAtDe(creado.id)).toBeNull();
    } finally {
      await borrarFixture(fixture, [productId]);
    }
  });
});

describe('R14 — editar la receta no toca lo apartado de un pedido existente', () => {
  it('cambiar las lineas de la receta despues del alta deja el libro del pedido intacto', async () => {
    const fixture = await crearFixture();
    const { productId } = await crearProductoConLote(fixture, '100');
    const recipeId = await crearReceta(fixture);
    await crearLineaCompleta(recipeId, productId);

    try {
      const creado = await createOrder(nuevoPedido(recipeId, fixture.presentationId, '10.0000'), actorDe(fixture));
      const antes = await movimientosDe(creado.id);

      // La receta se recarga con otra proporcion, POR FUERA del caso de uso de pedidos: nadie
      // recalcula la reserva de un pedido ya escrito solo porque su receta cambio.
      await prisma.recipeLine.updateMany({ where: { recipeId }, data: { percentage: new Prisma.Decimal('50.00') } });

      const despues = await movimientosDe(creado.id);
      expect(despues).toEqual(antes);
    } finally {
      await borrarFixture(fixture, [productId]);
    }
  });
});

describe('R18 — cancelar libera con autor', () => {
  it('cancelar un pedido con material apartado lo libera entero y registra al actor', async () => {
    const fixture = await crearFixture();
    const { productId } = await crearProductoConLote(fixture, '100');
    const recipeId = await crearReceta(fixture);
    await crearLineaCompleta(recipeId, productId);

    try {
      const creado = await createOrder(nuevoPedido(recipeId, fixture.presentationId, '10.0000'), actorDe(fixture));

      await cancelOrder(creado.id, { reason: 'el cliente desistio' }, actorDe(fixture));

      const movimientos = await movimientosDe(creado.id);
      expect(movimientos).toEqual([
        { kind: 'reserve', quantity: '10.0000', createdBy: fixture.actorId },
        { kind: 'release', quantity: '10.0000', createdBy: fixture.actorId },
      ]);
      expect(await reservedAtDe(creado.id)).toBeNull();
    } finally {
      await borrarFixture(fixture, [productId]);
    }
  });
});

describe('R19 — borrar libera', () => {
  it('borrar un pedido vivo con material apartado lo libera entero', async () => {
    const fixture = await crearFixture();
    const { productId } = await crearProductoConLote(fixture, '100');
    const recipeId = await crearReceta(fixture);
    await crearLineaCompleta(recipeId, productId);

    try {
      const creado = await createOrder(nuevoPedido(recipeId, fixture.presentationId, '10.0000'), actorDe(fixture));

      await deleteOrder(creado.id, actorDe(fixture));

      const movimientos = await movimientosDe(creado.id);
      expect(movimientos).toEqual([
        { kind: 'reserve', quantity: '10.0000', createdBy: fixture.actorId },
        { kind: 'release', quantity: '10.0000', createdBy: fixture.actorId },
      ]);
      expect(await reservedAtDe(creado.id)).toBeNull();
    } finally {
      await borrarFixture(fixture, [productId]);
    }
  });
});

describe('R52 — un `status` de entrada no dispara consumo, ni siquiera "ENTREGADO"', () => {
  it('la edicion que sube la cantidad y trae `status: ENTREGADO` solo recalcula la reserva, sin consumir', async () => {
    const fixture = await crearFixture();
    const { productId, batchId } = await crearProductoConLote(fixture, '100');
    const recipeId = await crearReceta(fixture);
    await crearLineaCompleta(recipeId, productId);

    try {
      const creado = await createOrder(nuevoPedido(recipeId, fixture.presentationId, '4.0000'), actorDe(fixture));
      expect(await stockDe(batchId)).toBe('100.0000');

      await updateOrder(
        creado.id,
        nuevoPedido(recipeId, fixture.presentationId, '8.0000', 'ENTREGADO'),
        actorDe(fixture),
      );

      expect(await stockDe(batchId)).toBe('100.0000');
      const movimientos = await movimientosDe(creado.id);
      expect(movimientos.map((m) => m.kind)).toEqual(['reserve', 'reserve']);
      expect(movimientos.at(-1)).toMatchObject({ kind: 'reserve', quantity: '4.0000' });
      expect(await reservedAtDe(creado.id)).not.toBeNull();
      const row = await prisma.order.findUniqueOrThrow({ where: { id: creado.id }, select: { status: true, quantity: true } });
      expect(row.status).toBe('PENDIENTE');
      expect(row.quantity.toFixed(4)).toBe('8.0000');
    } finally {
      await borrarFixture(fixture, [productId]);
    }
  });

  it('una edicion nunca escribe `consumption` ni un asiento `consume`, aunque no alcance el material', async () => {
    const fixture = await crearFixture();
    const { productId, batchId } = await crearProductoConLote(fixture, '5');
    const recipeId = await crearReceta(fixture);
    await crearLineaCompleta(recipeId, productId);

    try {
      const creado = await createOrder(nuevoPedido(recipeId, fixture.presentationId, '5.0000'), actorDe(fixture));
      expect(await stockDe(batchId)).toBe('5.0000');

      // Subir por encima de la existencia no rechaza: la edicion nunca consume, asi que
      // `insufficient_material` no puede salir de aqui.
      await updateOrder(
        creado.id,
        nuevoPedido(recipeId, fixture.presentationId, '500.0000', 'ENTREGADO'),
        actorDe(fixture),
      );

      expect(await stockDe(batchId)).toBe('5.0000');
      const row = await prisma.order.findUniqueOrThrow({ where: { id: creado.id }, select: { status: true, quantity: true } });
      expect(row.status).toBe('PENDIENTE');
      expect(row.quantity.toFixed(4)).toBe('500.0000');
      const movimientos = await movimientosDe(creado.id);
      expect(movimientos.every((m) => m.kind !== 'consume')).toBe(true);
      expect(await reservedAtDe(creado.id)).toBeNull();
    } finally {
      await borrarFixture(fixture, [productId]);
    }
  });
});

describe('R49 — receta sin lineas: crear y editar guardan sin error y sin apartar', () => {
  it('crear con una receta sin lineas guarda el pedido, sin asientos y con reserved_at nulo', async () => {
    const fixture = await crearFixture();
    const recipeId = await crearReceta(fixture);

    try {
      const creado = await createOrder(nuevoPedido(recipeId, fixture.presentationId, '10.0000'), actorDe(fixture));

      expect(await movimientosDe(creado.id)).toEqual([]);
      expect(await reservedAtDe(creado.id)).toBeNull();
    } finally {
      await borrarFixture(fixture, []);
    }
  });

  it('editar hacia una receta sin lineas libera lo que tenia y no vuelve a apartar', async () => {
    const fixture = await crearFixture();
    const { productId } = await crearProductoConLote(fixture, '100');
    const recipeConLineas = await crearReceta(fixture);
    await crearLineaCompleta(recipeConLineas, productId);
    const recipeVacia = await crearReceta(fixture);

    try {
      const creado = await createOrder(nuevoPedido(recipeConLineas, fixture.presentationId, '10.0000'), actorDe(fixture));

      await updateOrder(creado.id, nuevoPedido(recipeVacia, fixture.presentationId, '10.0000'), actorDe(fixture));

      const movimientos = await movimientosDe(creado.id);
      expect(movimientos).toEqual([
        { kind: 'reserve', quantity: '10.0000', createdBy: fixture.actorId },
        { kind: 'release', quantity: '10.0000', createdBy: fixture.actorId },
      ]);
      expect(await reservedAtDe(creado.id)).toBeNull();
    } finally {
      await borrarFixture(fixture, [productId]);
    }
  });
});

describe('R52 — un pedido sin apartado y receta vacia no rechaza la edicion aunque traiga `status: ENTREGADO`', () => {
  it('la edicion se guarda como una edicion normal: sigue PENDIENTE, sin asientos ni finished_at', async () => {
    const fixture = await crearFixture();
    const recipeId = await crearReceta(fixture);

    try {
      const creado = await createOrder(nuevoPedido(recipeId, fixture.presentationId, '10.0000'), actorDe(fixture));
      expect(await movimientosDe(creado.id)).toEqual([]);

      // `status` muere en el esquema: esto es una edicion cualquiera, nunca una entrega.
      await updateOrder(creado.id, nuevoPedido(recipeId, fixture.presentationId, '20.0000', 'ENTREGADO'), actorDe(fixture));

      expect(await movimientosDe(creado.id)).toEqual([]);
      const row = await prisma.order.findUniqueOrThrow({ where: { id: creado.id }, select: { status: true, quantity: true } });
      expect(row.status).toBe('PENDIENTE');
      expect(row.quantity.toFixed(4)).toBe('20.0000');
      expect(await finishedAtDe(creado.id)).toBeNull();
    } finally {
      await borrarFixture(fixture, []);
    }
  });
});

describe('QC-141 T10 — el Finalizar consume (R27, R28, R32)', () => {
  it('R27, R28, R51: Finalizar baja el lote apartado, asienta consume y recalcula la existencia', async () => {
    const fixture = await crearFixture();
    const { productId, batchId } = await crearProductoConLote(fixture, '100');
    const recipeId = await crearReceta(fixture);
    await crearLineaCompleta(recipeId, productId);

    try {
      const creado = await createOrder(nuevoPedido(recipeId, fixture.presentationId, '10.0000'), actorDe(fixture));
      expect(await stockDe(batchId)).toBe('100.0000');
      await transitionAliveById(creado.id, fixture.companyId, 'PENDIENTE', 'EN_CURSO', fixture.actorId, new Date());

      const resultado = await transitionAliveById(
        creado.id,
        fixture.companyId,
        'EN_CURSO',
        'POR_EMPACAR',
        fixture.actorId,
        new Date(),
      );

      // El exito de un Finalizar lleva el lote de producto terminado que entro.
      expect(resultado).toMatchObject({ kind: 'ok', finishedGoods: { packages: '10' } });
      expect(await stockDe(batchId)).toBe('90.0000');
      const movimientos = await movimientosDe(creado.id);
      expect(movimientos.map((m) => m.kind)).toEqual(['reserve', 'consume']);
      expect(movimientos.at(-1)).toMatchObject({ kind: 'consume', quantity: '10.0000' });
      expect(await reservedAtDe(creado.id)).toBeNull();
      const row = await prisma.order.findUniqueOrThrow({ where: { id: creado.id }, select: { status: true } });
      expect(row.status).toBe('POR_EMPACAR');
      // `finished_at` lo escribe Terminar, no Finalizar (R8).
      expect(await finishedAtDe(creado.id)).toBeNull();
    } finally {
      await borrarFixture(fixture, [productId]);
    }
  });

  it('R32: un segundo Finalizar sobre el mismo pedido no consume otra vez', async () => {
    const fixture = await crearFixture();
    const { productId, batchId } = await crearProductoConLote(fixture, '100');
    const recipeId = await crearReceta(fixture);
    await crearLineaCompleta(recipeId, productId);

    try {
      const creado = await createOrder(nuevoPedido(recipeId, fixture.presentationId, '10.0000'), actorDe(fixture));

      await transitionAliveById(creado.id, fixture.companyId, 'PENDIENTE', 'EN_CURSO', fixture.actorId, new Date());
      await transitionAliveById(creado.id, fixture.companyId, 'EN_CURSO', 'POR_EMPACAR', fixture.actorId, new Date());
      // POR_EMPACAR solo admite EN_EMPAQUE: un segundo intento, con POR_EMPACAR como `from` y
      // `to`, es ilegal por construccion y no vuelve a tocar el inventario.
      await expect(
        transitionAliveById(creado.id, fixture.companyId, 'POR_EMPACAR', 'POR_EMPACAR', fixture.actorId, new Date()),
      ).rejects.toThrow();

      expect(await stockDe(batchId)).toBe('90.0000');
      const movimientos = await movimientosDe(creado.id);
      expect(movimientos.filter((m) => m.kind === 'consume')).toHaveLength(1);
    } finally {
      await borrarFixture(fixture, [productId]);
    }
  });
});

describe('QC-141 T10 — Finalizar sin material suficiente (R30, R31)', () => {
  it('R30, R31, R51: sin alcanzar en ningun lote, rechaza con insufficient_material sin cambiar nada', async () => {
    const fixture = await crearFixture();
    const { productId, batchId } = await crearProductoConLote(fixture, '5');
    const recipeId = await crearReceta(fixture);
    await crearLineaCompleta(recipeId, productId);

    try {
      const creado = await createOrder(nuevoPedido(recipeId, fixture.presentationId, '5.0000'), actorDe(fixture));
      expect(await stockDe(batchId)).toBe('5.0000');

      // La existencia merma por fuera de la reserva (una merma de otro camino), y al Finalizar
      // ya no alcanza lo apartado ni el resto de lotes con disponible.
      await prisma.productBatch.update({ where: { id: batchId }, data: { stock: '0' } });
      await transitionAliveById(creado.id, fixture.companyId, 'PENDIENTE', 'EN_CURSO', fixture.actorId, new Date());

      const resultado = await transitionAliveById(
        creado.id,
        fixture.companyId,
        'EN_CURSO',
        'POR_EMPACAR',
        fixture.actorId,
        new Date(),
      );

      expect(resultado).toBe('insufficient_material');
      expect(await stockDe(batchId)).toBe('0.0000');
      const movimientos = await movimientosDe(creado.id);
      expect(movimientos.map((m) => m.kind)).toEqual(['reserve']);
      const row = await prisma.order.findUniqueOrThrow({ where: { id: creado.id }, select: { status: true } });
      expect(row.status).toBe('EN_CURSO');
      expect(await finishedAtDe(creado.id)).toBeNull();
    } finally {
      await borrarFixture(fixture, [productId]);
    }
  });

  it('R31: sin nada apartado, calcula con la receta actual y consume si alcanza', async () => {
    const fixture = await crearFixture();
    const { productId, batchId } = await crearProductoConLote(fixture, '100');
    const recipeId = await crearReceta(fixture);
    const recipeVacia = await crearReceta(fixture);
    await crearLineaCompleta(recipeId, productId);

    try {
      // Se crea con la receta VACIA -no aparta nada- y se recarga con lineas por fuera del
      // caso de uso: el pedido llega al Finalizar sin nada apartado.
      const creado = await createOrder(nuevoPedido(recipeVacia, fixture.presentationId, '10.0000'), actorDe(fixture));
      expect(await movimientosDe(creado.id)).toEqual([]);
      await prisma.order.update({ where: { id: creado.id }, data: { recipeId } });
      await transitionAliveById(creado.id, fixture.companyId, 'PENDIENTE', 'EN_CURSO', fixture.actorId, new Date());

      const resultado = await transitionAliveById(
        creado.id,
        fixture.companyId,
        'EN_CURSO',
        'POR_EMPACAR',
        fixture.actorId,
        new Date(),
      );

      expect(resultado).toMatchObject({ kind: 'ok', finishedGoods: { packages: '10' } });
      expect(await stockDe(batchId)).toBe('90.0000');
      // Sin apartado previo no hay nada que resolver en `reservation_movements` -la salida
      // fisica queda en `inventory_movements`, asentada por `consumeBatchStock`-.
      expect(await movimientosDe(creado.id)).toEqual([]);
    } finally {
      await borrarFixture(fixture, [productId]);
    }
  });
});

describe('QC-141 T10 — Finalizar de un pedido sin apartado y receta sin lineas (R50)', () => {
  it('R50, R51: rechaza con recipe_without_lines sin cambiar el pedido ni el inventario', async () => {
    const fixture = await crearFixture();
    const recipeId = await crearReceta(fixture);

    try {
      const creado = await createOrder(nuevoPedido(recipeId, fixture.presentationId, '10.0000'), actorDe(fixture));
      expect(await movimientosDe(creado.id)).toEqual([]);
      await transitionAliveById(creado.id, fixture.companyId, 'PENDIENTE', 'EN_CURSO', fixture.actorId, new Date());

      const resultado = await transitionAliveById(
        creado.id,
        fixture.companyId,
        'EN_CURSO',
        'POR_EMPACAR',
        fixture.actorId,
        new Date(),
      );

      expect(resultado).toBe('recipe_without_lines');
      expect(await movimientosDe(creado.id)).toEqual([]);
      const row = await prisma.order.findUniqueOrThrow({ where: { id: creado.id }, select: { status: true } });
      expect(row.status).toBe('EN_CURSO');
      expect(await finishedAtDe(creado.id)).toBeNull();
    } finally {
      await borrarFixture(fixture, []);
    }
  });
});
