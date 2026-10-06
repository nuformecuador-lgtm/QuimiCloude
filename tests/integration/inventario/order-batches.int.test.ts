/**
 * `findBatchesOfOrder` contra Postgres real: los lotes de producto terminado que entraron por un
 * pedido, para el panel de lotes de la fila de ese pedido.
 *
 * AISLAMIENTO: `findBatchesOfOrder` y `adjustBatchStock` usan el cliente Prisma GLOBAL, asi que lo
 * sembrado tiene que quedar CONFIRMADO. Cada caso crea su empresa efimera, escribe los lotes con
 * `receiveFinishedGoods` -misma ruta que Terminar- y limpia lo suyo en un `finally`.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import {
  adjustBatchStock,
  createWithFirstBatch,
  findBatchesOfAliveProduct,
  findBatchesOfOrder,
  receiveFinishedGoods,
} from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import { prisma } from '@/lib/shared/db/prisma';

import type { InventoryScope } from '@/lib/modules/inventario/domain/inventory-scope';

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

type Company = { readonly companyId: string; readonly userId: string; readonly roleId: string; readonly documentTypeCode: string };

async function sembrarEmpresa(): Promise<Company> {
  const marca = token();
  const documentType = await prisma.documentType.create({
    data: { code: `DOC${marca.slice(0, 8)}`, name: 'Tipo de documento de prueba' },
    select: { code: true },
  });
  const role = await prisma.role.create({ data: { name: `rol-${marca}`, description: 'Rol de prueba' }, select: { id: true } });
  const nombreEmpresa = `Empresa ${marca}`;
  const company = await prisma.company.create({
    data: { name: nombreEmpresa, nameNormalized: normalizeCompanyName(nombreEmpresa) },
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
  return { companyId: company.id, userId: user.id, roleId: role.id, documentTypeCode: documentType.code };
}

const empresasCreadas: Company[] = [];

afterAll(async () => {
  for (const fixture of empresasCreadas) {
    await prisma.user.deleteMany({ where: { id: fixture.userId } });
    await prisma.role.deleteMany({ where: { id: fixture.roleId } });
    await prisma.documentType.deleteMany({ where: { code: fixture.documentTypeCode } });
    await prisma.company.deleteMany({ where: { id: fixture.companyId } });
  }
  await prisma.$disconnect();
});

type Fixture = {
  readonly empresa: Company;
  readonly scope: InventoryScope;
  readonly unitId: string;
  readonly recipeId: string;
  readonly presentationIds: string[];
  readonly orderIds: string[];
};

async function sembrarFixture(): Promise<Fixture> {
  const empresa = await sembrarEmpresa();
  empresasCreadas.push(empresa);
  const marca = token();
  const unit = await prisma.unit.create({
    data: { name: `unidad ${marca}`, nameNormalized: `unidad${marca}`, symbol: `u${marca}` },
    select: { id: true },
  });
  const nombreReceta = `Receta ${marca}`;
  const recipe = await prisma.recipe.create({
    data: { name: nombreReceta, nameNormalized: nombreReceta.toLowerCase().replace(/[^a-z0-9]/gu, ''), companyId: empresa.companyId },
    select: { id: true },
  });
  return {
    empresa,
    scope: { companyId: empresa.companyId },
    unitId: unit.id,
    recipeId: recipe.id,
    presentationIds: [],
    orderIds: [],
  };
}

async function sembrarPresentacion(fixture: Fixture, nombre: string, content: string): Promise<string> {
  const { id } = await prisma.presentation.create({
    data: {
      name: nombre,
      nameNormalized: `${nombre}${token()}`.toLowerCase().replace(/[^a-z0-9]/gu, ''),
      unitId: fixture.unitId,
      companyId: fixture.empresa.companyId,
      content,
    },
    select: { id: true },
  });
  fixture.presentationIds.push(id);
  return id;
}

let sequenceCounter = 1;

async function sembrarPedido(fixture: Fixture): Promise<string> {
  const now = new Date();
  const { id } = await prisma.order.create({
    data: {
      orderYear: now.getUTCFullYear(),
      orderSequence: sequenceCounter++,
      recipeId: fixture.recipeId,
      quantity: '10',
      companyId: fixture.empresa.companyId,
      createdAt: now,
    },
    select: { id: true },
  });
  fixture.orderIds.push(id);
  return id;
}

/** Una linea del reparto y su entrada por Terminar; devuelve el producto y el lote creados. */
async function recibir(
  fixture: Fixture,
  orderId: string,
  presentationId: string,
  packages: number,
): Promise<{ readonly productId: string; readonly batchId: string }> {
  const line = await prisma.orderPresentationLine.create({
    data: { orderId, companyId: fixture.empresa.companyId, presentationId, packages, presentationContent: null },
    select: { id: true },
  });
  const outcome = await prisma.$transaction((tx) =>
    receiveFinishedGoods(
      tx,
      {
        orderId,
        recipeId: fixture.recipeId,
        recipeName: 'Limpiador',
        presentationId,
        orderPresentationLineId: line.id,
        packages,
        orderContent: null,
        unitCost: '1.0000',
        actorId: fixture.empresa.userId,
        now: new Date(),
      },
      fixture.scope,
    ),
  );
  if (outcome.kind !== 'received') throw new Error(`esperaba received, llego ${outcome.kind}`);
  const movement = await prisma.inventoryMovement.findFirstOrThrow({
    where: { orderPresentationLineId: line.id, kind: 'production' },
    select: { batchId: true },
  });
  return { productId: outcome.productId, batchId: movement.batchId };
}

async function limpiar(fixture: Fixture): Promise<void> {
  const products = await prisma.product.findMany({ where: { companyId: fixture.empresa.companyId }, select: { id: true } });
  const productIds = products.map((product) => product.id);
  await prisma.reservationMovement.deleteMany({ where: { companyId: fixture.empresa.companyId } });
  await prisma.inventoryMovement.deleteMany({ where: { batch: { productId: { in: productIds } } } });
  await prisma.productBatch.deleteMany({ where: { productId: { in: productIds } } });
  await prisma.product.deleteMany({ where: { id: { in: productIds } } });
  await prisma.orderPresentationLine.deleteMany({ where: { orderId: { in: fixture.orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: fixture.orderIds } } });
  await prisma.recipe.deleteMany({ where: { id: fixture.recipeId } });
  await prisma.presentation.deleteMany({ where: { id: { in: fixture.presentationIds } } });
  await prisma.unit.deleteMany({ where: { id: fixture.unitId } });
}

describe('findBatchesOfOrder: los lotes de producto terminado de un pedido', () => {
  it('dos pedidos de la misma receta y presentacion comparten producto, pero cada uno ve solo su lote', async () => {
    const fixture = await sembrarFixture();
    try {
      const botella = await sembrarPresentacion(fixture, 'Botella 500 ml', '0.5');
      const primerPedido = await sembrarPedido(fixture);
      const segundoPedido = await sembrarPedido(fixture);
      const primero = await recibir(fixture, primerPedido, botella, 10);
      const segundo = await recibir(fixture, segundoPedido, botella, 4);
      expect(primero.productId).toBe(segundo.productId);

      const delPrimero = await findBatchesOfOrder(primerPedido, fixture.scope);
      const delSegundo = await findBatchesOfOrder(segundoPedido, fixture.scope);

      expect(delPrimero.map((lote) => lote.id)).toEqual([primero.batchId]);
      expect(delSegundo.map((lote) => lote.id)).toEqual([segundo.batchId]);
      expect(delPrimero[0]).toMatchObject({
        stock: '5.0000',
        unitId: fixture.unitId,
        packageContent: '0.5000',
        presentationName: 'Botella 500 ml',
        reserved: '0.0000',
        available: '5.0000',
        overReserved: false,
      });
    } finally {
      await limpiar(fixture);
    }
  });

  it('un pedido en varias presentaciones trae un lote por presentacion, cada uno con su nombre', async () => {
    const fixture = await sembrarFixture();
    try {
      const pedido = await sembrarPedido(fixture);
      const chica = await recibir(fixture, pedido, await sembrarPresentacion(fixture, 'Botella 250 ml', '0.25'), 6);
      const grande = await recibir(fixture, pedido, await sembrarPresentacion(fixture, 'Garrafa 1 L', '1'), 2);
      expect(chica.productId).not.toBe(grande.productId);

      const lotes = await findBatchesOfOrder(pedido, fixture.scope);

      expect(new Map(lotes.map((lote) => [lote.id, lote.presentationName]))).toEqual(
        new Map([
          [chica.batchId, 'Botella 250 ml'],
          [grande.batchId, 'Garrafa 1 L'],
        ]),
      );
    } finally {
      await limpiar(fixture);
    }
  });

  it('el ajuste que resta se hace con el batchId del panel y el panel lo refleja; el lote agotado sigue listado', async () => {
    const fixture = await sembrarFixture();
    try {
      const pedido = await sembrarPedido(fixture);
      const { batchId } = await recibir(fixture, pedido, await sembrarPresentacion(fixture, 'Botella 500 ml', '0.5'), 2);

      const parcial = await adjustBatchStock(batchId, '-0.2', 'merma', fixture.empresa.userId, new Date(), fixture.scope);
      expect(parcial).toMatchObject({ stock: '0.8000' });
      expect((await findBatchesOfOrder(pedido, fixture.scope))[0]?.stock).toBe('0.8000');

      await adjustBatchStock(batchId, '-0.8', 'merma', fixture.empresa.userId, new Date(), fixture.scope);
      expect((await findBatchesOfOrder(pedido, fixture.scope)).map((lote) => [lote.id, lote.stock])).toEqual([
        [batchId, '0.0000'],
      ]);
    } finally {
      await limpiar(fixture);
    }
  });

  it('el pedido de otra empresa, uno inexistente y uno sin produccion devuelven la lista vacia', async () => {
    const fixture = await sembrarFixture();
    const ajena = await sembrarFixture();
    try {
      const pedido = await sembrarPedido(fixture);
      await recibir(fixture, pedido, await sembrarPresentacion(fixture, 'Botella 500 ml', '0.5'), 3);
      const sinProduccion = await sembrarPedido(fixture);

      expect(await findBatchesOfOrder(pedido, ajena.scope)).toEqual([]);
      expect(await findBatchesOfOrder(randomUUID(), fixture.scope)).toEqual([]);
      expect(await findBatchesOfOrder(sinProduccion, fixture.scope)).toEqual([]);
    } finally {
      await limpiar(fixture);
      await limpiar(ajena);
    }
  });

  it('los lotes de un producto dado de baja no salen', async () => {
    const fixture = await sembrarFixture();
    try {
      const pedido = await sembrarPedido(fixture);
      const { productId } = await recibir(fixture, pedido, await sembrarPresentacion(fixture, 'Botella 500 ml', '0.5'), 3);
      await prisma.product.update({ where: { id: productId }, data: { deletedAt: new Date() } });

      expect(await findBatchesOfOrder(pedido, fixture.scope)).toEqual([]);
    } finally {
      await limpiar(fixture);
    }
  });
});

describe('QC-199 — la unidad del lote es la de su producto', () => {
  it('R18 lote de envase y de producto terminado conservan su unidad', async () => {
    const fixture = await sembrarFixture();
    try {
      const botella = await sembrarPresentacion(fixture, 'Botella 500 ml', '0.5');
      const pedido = await sembrarPedido(fixture);
      const terminado = await recibir(fixture, pedido, botella, 4);

      const delPedido = await findBatchesOfOrder(pedido, fixture.scope);
      expect(delPedido.map((lote) => [lote.id, lote.unitId, lote.presentationName])).toEqual([
        [terminado.batchId, fixture.unitId, 'Botella 500 ml'],
      ]);
      expect((await findBatchesOfAliveProduct(terminado.productId, fixture.scope)).map((lote) => lote.unitId)).toEqual([
        fixture.unitId,
      ]);

      const unidadDeEnvases = await prisma.unit.findFirstOrThrow({
        where: { companyId: null, nameNormalized: 'unidad' },
        select: { id: true },
      });
      const envase = await createWithFirstBatch(
        { name: `Botella vacia ${token()}`, qtyAlert: '0', type: 'PACKAGING' },
        {
          presentationId: null,
          stock: '10',
          unitCost: '0.5000',
          lot: null,
          purchaseDate: '2026-09-01',
          expiryDate: null,
          createdBy: fixture.empresa.userId,
        },
        new Date(),
        fixture.scope,
        { presentationId: botella, unitId: unidadDeEnvases.id },
      );
      expect((await findBatchesOfAliveProduct(envase.id, fixture.scope)).map((lote) => lote.unitId)).toEqual([
        unidadDeEnvases.id,
      ]);
    } finally {
      await limpiar(fixture);
    }
  });
});
