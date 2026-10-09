/**
 * El cuadre de R29: para todo lote con `created_at >= LEDGER_START`, `stock` debe ser igual a la
 * suma de sus asientos en `inventory_movements`.
 *
 * EXCEPCION PERMANENTE (R29, R30): los lotes con `created_at < LEDGER_START` quedan FUERA de este
 * cuadre, sin asiento y sin que vayan a tener uno nunca -el libro de movimientos empieza a partir
 * de `LEDGER_START` y no hay asientos retroactivos para lo que ya existia-. Ese vacio NO lo cubre
 * este test: lo cubre `tests/guards/guard-libro-de-inventario.test.ts`, que vigila los CAMINOS de
 * escritura -no los datos ya guardados- y por eso no depende de cuando nacio cada lote.
 *
 * El corte es la FECHA de creacion del lote, y no "el lote no tiene ningun asiento": la regla
 * barata de "cero asientos = exceptuado" tiene un agujero, porque un camino que algun dia olvide
 * su asiento sobre un lote nuevo lo dejaria tambien en cero asientos, y por tanto exceptuado para
 * siempre -justo el fallo que este cuadre existe para vigilar-. El ultimo caso de este archivo
 * fabrica un lote posterior al corte y sin asientos para demostrar que, ahi, el cuadre SI lo caza.
 *
 * AISLAMIENTO -- `createWithFirstBatch`, `addBatchToAlive` y `adjustBatchStock` usan el cliente
 * Prisma GLOBAL y abren cada uno su PROPIA `prisma.$transaction`, asi que envolverlos en una
 * transaccion de este test seria aislamiento de mentira: correrian en otra conexion del pool y no
 * verian las filas del fixture. Cada caso fabrica su propia empresa efimera y limpia en un
 * `finally`, con el mismo patron que `product-batch-write.int.test.ts`.
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import { createFinishedGoodsDispatch } from '@/lib/modules/inventario/adapters/driven/persistence/finished-goods-dispatch-prisma';
import {
  addBatchToAlive,
  addImportedFinishedGoodsBatch,
  createWithFirstBatch,
} from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import { adjustByDelta } from '../../helpers/adjust-by-delta';
import { LEDGER_START } from '@/lib/modules/inventario/domain/movement-ledger';
import { prisma } from '@/lib/shared/db/prisma';

import type { InventoryScope } from '@/lib/modules/inventario/domain/inventory-scope';
import type { NewProductBatch } from '@/lib/modules/inventario/domain/product-batch';
import type { NewProduct } from '@/lib/modules/inventario/domain/product-view';

type Db = Prisma.TransactionClient | typeof prisma;

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

/** `LEDGER_START` es el timestamp de carpeta de la migracion (`YYYYMMDDHHmmss`, UTC). */
function ledgerStartDate(): Date {
  const y = LEDGER_START.slice(0, 4);
  const mo = LEDGER_START.slice(4, 6);
  const d = LEDGER_START.slice(6, 8);
  const h = LEDGER_START.slice(8, 10);
  const mi = LEDGER_START.slice(10, 12);
  const s = LEDGER_START.slice(12, 14);
  return new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}.000Z`);
}

async function createTestUser(db: Db): Promise<{ userId: string; companyId: string }> {
  const marker = token();
  const documentType = await db.documentType.create({
    data: { code: `DOC${marker.slice(0, 8)}`, name: 'Tipo de documento de prueba' },
    select: { code: true },
  });
  const role = await db.role.create({
    data: { name: `rol-${marker}`, description: 'Rol de prueba' },
    select: { id: true },
  });
  const companyName = `Empresa ${marker}`;
  const company = await db.company.create({
    data: { name: companyName, nameNormalized: normalizeCompanyName(companyName) },
    select: { id: true },
  });
  const user = await db.user.create({
    data: {
      firstNames: 'Ana Maria',
      lastNames: 'Perez Gomez',
      birthDate: new Date('1990-05-17T00:00:00.000Z'),
      email: `ana.${marker}@quimicloude.test`,
      phone: '+57 300 111 2233',
      documentTypeCode: documentType.code,
      documentNumber: marker.slice(0, 12),
      username: `ana.${marker}`,
      passwordHash: 'hash-de-prueba-no-es-un-algoritmo-real',
      roleId: role.id,
      companyId: company.id,
    },
    select: { id: true },
  });
  return { userId: user.id, companyId: company.id };
}

async function deleteTestUser(db: Db, userId: string): Promise<void> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { roleId: true, documentTypeCode: true, companyId: true },
  });
  await db.user.delete({ where: { id: userId } });
  await db.role.delete({ where: { id: user.roleId } });
  await db.documentType.delete({ where: { code: user.documentTypeCode } });
  if (user.companyId === null) throw new Error('el usuario de prueba se creo con empresa');
  await db.company.delete({ where: { id: user.companyId } });
}

async function unidadDeSistema(db: Db): Promise<string> {
  const unit = await db.unit.findFirstOrThrow({
    where: { nameNormalized: 'kilogramo', companyId: null },
    select: { id: true },
  });
  return unit.id;
}

async function createTestPresentation(db: Db, companyId: string): Promise<string> {
  const name = `Bidon ${token()}`;
  const presentation = await db.presentation.create({
    data: {
      name,
      nameNormalized: normalizeForTest(name),
      unitId: await unidadDeSistema(db),
      companyId,
    },
    select: { id: true },
  });
  return presentation.id;
}

type Fixture = {
  readonly actorId: string;
  readonly presentationId: string;
  readonly companyId: string;
};

function ambito(fixture: Fixture): InventoryScope {
  return { companyId: fixture.companyId };
}

async function createFixture(): Promise<Fixture> {
  const { userId, companyId } = await createTestUser(prisma);
  const presentationId = await createTestPresentation(prisma, companyId);
  return { actorId: userId, presentationId, companyId };
}

async function dropFixture(fixture: Fixture, productIds: readonly string[]): Promise<void> {
  await prisma.inventoryMovement.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.productBatch.deleteMany({ where: { productId: { in: [...productIds] } } });
  await prisma.product.deleteMany({ where: { id: { in: [...productIds] } } });
  await prisma.presentation.deleteMany({ where: { id: fixture.presentationId } });
  await deleteTestUser(prisma, fixture.actorId);
}

function newProduct(overrides: Partial<NewProduct> = {}): NewProduct {
  return { name: `Producto ${token()}`, ...overrides };
}

function newBatch(fixture: Fixture, overrides: Partial<NewProductBatch> = {}): NewProductBatch {
  return {
    presentationId: fixture.presentationId,
    stock: '10',
    unitCost: '2.5000',
    lot: null,
    purchaseDate: '2026-09-01',
    expiryDate: null,
    createdBy: fixture.actorId,
    ...overrides,
  };
}

/**
 * El propio cuadre de R29. Para un lote nacido antes de `LEDGER_START` no comprueba nada -esa es
 * la excepcion permanente de R30, ver cabecera del archivo-; para uno nacido en o despues del
 * corte, afirma que `stock` es igual a la suma de sus asientos, y por eso puede FALLAR si algo
 * dejo el libro y el stock desalineados.
 */
async function assertLedgerBalances(batchId: string): Promise<void> {
  const batch = await prisma.productBatch.findUniqueOrThrow({
    where: { id: batchId },
    select: { stock: true, createdAt: true },
  });
  if (batch.createdAt < ledgerStartDate()) return;

  const movements = await prisma.inventoryMovement.findMany({
    where: { batchId },
    select: { quantity: true },
  });
  const sumOfMovements = movements.reduce((total, movement) => total + movement.quantity.toNumber(), 0);
  expect(batch.stock.toNumber()).toBe(sumOfMovements);
}

/** Lote fabricado sin pasar por el repositorio: simula uno anterior al libro, sin ningun asiento. */
async function createBatchDirectly(
  fixture: Fixture,
  productId: string,
  createdAt: Date,
  stock: number,
): Promise<string> {
  const batch = await prisma.productBatch.create({
    data: {
      productId,
      presentationId: fixture.presentationId,
      stock,
      unitCost: new Prisma.Decimal('1.0000'),
      lot: `L-${randomUUID()}`,
      purchaseDate: new Date('2026-01-01T00:00:00Z'),
      companyId: fixture.companyId,
      createdBy: fixture.actorId,
      updatedBy: fixture.actorId,
      createdAt,
      updatedAt: createdAt,
    },
    select: { id: true },
  });
  return batch.id;
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('cuadre del libro: stock = suma de asientos, para lotes posteriores a LEDGER_START (R29)', () => {
  it('cuadra con el lote del alta de un producto nuevo', async () => {
    const fixture = await createFixture();
    const productIds: string[] = [];

    try {
      const creado = await createWithFirstBatch(newProduct(), newBatch(fixture, { stock: '12' }), new Date(), ambito(fixture));
      productIds.push(creado.id);

      await assertLedgerBalances(creado.batchId);
    } finally {
      await dropFixture(fixture, productIds);
    }
  });

  it('cuadra con un lote anadido a un producto que ya existe', async () => {
    const fixture = await createFixture();
    const productIds: string[] = [];

    try {
      const primero = await createWithFirstBatch(newProduct(), newBatch(fixture, { stock: '5' }), new Date(), ambito(fixture));
      productIds.push(primero.id);

      const agregado = await addBatchToAlive(primero.id, newBatch(fixture, { stock: '8' }), new Date(), ambito(fixture));
      if (agregado === null || agregado === 'finished_product') {
        throw new Error('el producto deberia seguir vivo');
      }

      await assertLedgerBalances(primero.batchId);
      await assertLedgerBalances(agregado.batchId);
    } finally {
      await dropFixture(fixture, productIds);
    }
  });

  it('cuadra con un lote ajustado -stock = alta + ajustes, sumando y restando', async () => {
    const fixture = await createFixture();
    const productIds: string[] = [];

    try {
      const creado = await createWithFirstBatch(newProduct(), newBatch(fixture, { stock: '20' }), new Date(), ambito(fixture));
      productIds.push(creado.id);

      const sumado = await adjustByDelta(creado.batchId, '6', 'conteo_fisico', fixture.actorId, new Date(), ambito(fixture));
      if (sumado.kind !== 'adjusted') {
        throw new Error('el lote deberia existir');
      }
      expect(sumado.stock).toBe('26.0000');

      const restado = await adjustByDelta(creado.batchId, '-9', 'merma', fixture.actorId, new Date(), ambito(fixture));
      if (restado.kind !== 'adjusted') {
        throw new Error('el lote deberia existir');
      }
      expect(restado.stock).toBe('17.0000');

      await assertLedgerBalances(creado.batchId);
    } finally {
      await dropFixture(fixture, productIds);
    }
  });

  // QC-223 2026-10-08: la salida de producto terminado deja el libro cuadrado.
  it('QC-223 R23, R24: cuadra con un lote de producto terminado del que sale una entrega', async () => {
    const fixture = await createFixture();
    const marker = token();
    let recipeId: string | null = null;
    let orderId: string | null = null;
    let customerId: string | null = null;
    let productId: string | null = null;

    try {
      const recipe = await prisma.recipe.create({
        data: { name: `Receta ${marker}`, nameNormalized: `receta${marker}`, companyId: fixture.companyId },
        select: { id: true },
      });
      recipeId = recipe.id;
      const product = await prisma.product.create({
        data: {
          name: `Terminado ${marker}`,
          nameNormalized: `terminado${marker}`,
          type: 'FINISHED_PRODUCT',
          unitId: await unidadDeSistema(prisma),
          recipeId,
          presentationId: fixture.presentationId,
          companyId: fixture.companyId,
        },
        select: { id: true },
      });
      productId = product.id;
      const order = await prisma.order.create({
        data: {
          orderYear: new Date().getUTCFullYear(),
          orderSequence: 1,
          recipeId,
          quantity: '10',
          companyId: fixture.companyId,
        },
        select: { id: true },
      });
      orderId = order.id;
      const customer = await prisma.customer.create({
        data: {
          firstNames: 'Luis',
          firstNamesNormalized: 'luis',
          lastNames: 'Rojas',
          lastNamesNormalized: 'rojas',
          city: 'Cali',
          cityNormalized: 'cali',
          companyId: fixture.companyId,
        },
        select: { id: true },
      });
      customerId = customer.id;
      const delivery = await prisma.orderDelivery.create({
        data: {
          companyId: fixture.companyId,
          orderId,
          customerId,
          deliveryKey: randomUUID(),
          createdBy: fixture.actorId,
        },
        select: { id: true },
      });

      const finishedProductId = productId;
      const { batchId } = await prisma.$transaction((tx) =>
        addImportedFinishedGoodsBatch(
          tx,
          finishedProductId,
          newBatch(fixture, { stock: '12' }),
          '2.0000',
          new Date(),
          ambito(fixture),
        ),
      );
      const deliveryOrderId = orderId;
      const finishedRecipeId = recipeId;
      const outcome = await prisma.$transaction((tx) =>
        createFinishedGoodsDispatch(tx).dispatchForDelivery({
          companyId: fixture.companyId,
          orderId: deliveryOrderId,
          orderDeliveryId: delivery.id,
          recipeId: finishedRecipeId,
          presentationId: fixture.presentationId,
          allocations: [{ batchId, packages: 4 }],
          actorId: fixture.actorId,
          now: new Date(),
        }),
      );
      expect(outcome.kind).toBe('dispatched');

      const batch = await prisma.productBatch.findUniqueOrThrow({ where: { id: batchId }, select: { stock: true } });
      expect(batch.stock.toFixed(4)).toBe('4.0000');
      await assertLedgerBalances(batchId);
    } finally {
      await prisma.inventoryMovement.deleteMany({ where: { companyId: fixture.companyId } });
      await prisma.orderDelivery.deleteMany({ where: { companyId: fixture.companyId } });
      await prisma.productBatch.deleteMany({ where: { companyId: fixture.companyId } });
      if (productId !== null) await prisma.product.deleteMany({ where: { id: productId } });
      if (orderId !== null) await prisma.order.deleteMany({ where: { id: orderId } });
      if (customerId !== null) await prisma.customer.deleteMany({ where: { id: customerId } });
      if (recipeId !== null) await prisma.recipe.deleteMany({ where: { id: recipeId } });
      await dropFixture(fixture, []);
    }
  });

  it('detecta un stock alterado por SQL crudo sin su asiento', async () => {
    const fixture = await createFixture();
    const productIds: string[] = [];

    try {
      const creado = await createWithFirstBatch(newProduct(), newBatch(fixture, { stock: '4' }), new Date(), ambito(fixture));
      productIds.push(creado.id);

      // Ningun camino del repositorio escribe asi: es exactamente el descuadre que R29 vigila.
      await prisma.$executeRaw`UPDATE "product_batches" SET "stock" = "stock" + 5 WHERE "id" = ${creado.batchId}::uuid`;

      await expect(assertLedgerBalances(creado.batchId)).rejects.toThrow();
    } finally {
      await dropFixture(fixture, productIds);
    }
  });
});

describe('la excepcion permanente de los lotes anteriores a LEDGER_START (R30)', () => {
  it('un lote fabricado antes del corte y sin asientos no rompe el cuadre, y el mismo lote despues del corte si lo rompe', async () => {
    const fixture = await createFixture();
    const productIds: string[] = [];

    try {
      const producto = await prisma.product.create({
        data: {
          name: `Producto ${token()}`,
          nameNormalized: normalizeForTest(token()),
          // La misma unidad que `fixture.presentationId`: sin ella, `product_batches_check_unit`
          // rechazaria los dos lotes fabricados a mano mas abajo.
          unitId: await unidadDeSistema(prisma),
          companyId: fixture.companyId,
        },
        select: { id: true },
      });
      productIds.push(producto.id);

      // Un dia antes del corte, sin ningun asiento: representa un lote que ya existia cuando el
      // libro nacio. Nunca tendra asiento -R14- y por eso el cuadre no debe mirarlo.
      const antesDelCorte = new Date(ledgerStartDate().getTime() - 24 * 60 * 60 * 1000);
      const loteAntiguo = await createBatchDirectly(fixture, producto.id, antesDelCorte, 33);
      await assertLedgerBalances(loteAntiguo);

      // El mismo escenario -stock sin asientos- pero DESPUES del corte: si el cuadre exceptuara
      // por "cero asientos" en vez de por fecha, esto tambien pasaria en silencio. No pasa: el
      // corte es la fecha, y un lote nacido en el libro sin su asiento es justo el descuadre que
      // R29/R30 existen para atrapar.
      const despuesDelCorte = new Date(ledgerStartDate().getTime() + 24 * 60 * 60 * 1000);
      const loteNuevoSinAsiento = await createBatchDirectly(fixture, producto.id, despuesDelCorte, 33);
      await expect(assertLedgerBalances(loteNuevoSinAsiento)).rejects.toThrow();
    } finally {
      await dropFixture(fixture, productIds);
    }
  });
});
