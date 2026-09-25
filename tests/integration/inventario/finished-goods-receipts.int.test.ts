/**
 * `findFinishedGoodsReceipts` (R14, `design.md > 4`) contra Postgres real.
 *
 * AISLAMIENTO: la funcion lee con el cliente Prisma GLOBAL (no acepta `tx`), asi que una
 * transaccion del test con ROLLBACK no la alimentaria: el asiento `production` tiene que quedar
 * CONFIRMADO para que la lectura lo vea. Cada caso escribe el asiento con `receiveFinishedGoods`
 * -misma ruta que produccion, envuelta en su propia `prisma.$transaction`, igual que
 * `finished-goods.int.test.ts`- y limpia lo suyo en un `finally`, en el orden que exigen las FK:
 * asientos -> lotes -> productos -> pedidos -> receta -> presentacion -> unidad -> usuario -> rol
 * -> tipo de documento -> empresa. Se apoya en que la base de la corrida es suya.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import {
  findFinishedGoodsReceipts,
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
  const role = await prisma.role.create({
    data: { name: `rol-${marca}`, description: 'Rol de prueba' },
    select: { id: true },
  });
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

async function borrarEmpresa(fixture: Company): Promise<void> {
  await prisma.user.deleteMany({ where: { id: fixture.userId } });
  await prisma.role.deleteMany({ where: { id: fixture.roleId } });
  await prisma.documentType.deleteMany({ where: { code: fixture.documentTypeCode } });
  await prisma.company.deleteMany({ where: { id: fixture.companyId } });
}

const empresasCreadas: Company[] = [];

async function nuevaEmpresa(): Promise<Company> {
  const fixture = await sembrarEmpresa();
  empresasCreadas.push(fixture);
  return fixture;
}

afterAll(async () => {
  for (const fixture of empresasCreadas) {
    await borrarEmpresa(fixture);
  }
  await prisma.$disconnect();
});

function ambito(companyId: string): InventoryScope {
  return { companyId };
}

async function sembrarUnidad(): Promise<string> {
  const marca = token();
  const { id } = await prisma.unit.create({
    data: { name: `unidad ${marca}`, nameNormalized: `unidad${marca}`, symbol: `u${marca}` },
    select: { id: true },
  });
  return id;
}

async function sembrarPresentacion(
  companyId: string,
  unitId: string,
  content: string,
): Promise<string> {
  const marca = token();
  const nombre = `Presentacion ${marca}`;
  const { id } = await prisma.presentation.create({
    data: {
      name: nombre,
      nameNormalized: nombre.toLowerCase().replace(/[^a-z0-9]/gu, ''),
      unitId,
      companyId,
      content,
    },
    select: { id: true },
  });
  return id;
}

async function sembrarReceta(companyId: string): Promise<string> {
  const marca = token();
  const nombre = `Receta ${marca}`;
  const { id } = await prisma.recipe.create({
    data: { name: nombre, nameNormalized: nombre.toLowerCase().replace(/[^a-z0-9]/gu, ''), companyId },
    select: { id: true },
  });
  return id;
}

let sequenceCounter = 1;

async function sembrarPedido(companyId: string, recipeId: string, presentationId: string): Promise<string> {
  const now = new Date();
  const { id } = await prisma.order.create({
    data: {
      orderYear: now.getUTCFullYear(),
      orderSequence: sequenceCounter++,
      recipeId,
      quantity: '10',
      companyId,
      presentationId,
      presentationContent: null,
      createdAt: now,
    },
    select: { id: true },
  });
  return id;
}

async function limpiarProducto(productId: string): Promise<void> {
  await prisma.inventoryMovement.deleteMany({ where: { batch: { productId } } });
  await prisma.productBatch.deleteMany({ where: { productId } });
  await prisma.product.deleteMany({ where: { id: productId } });
}

/** Escribe el asiento `production` de verdad, por la MISMA ruta que el Finalizar, envuelta en su
 *  propia transaccion que CONFIRMA -igual que `finished-goods.int.test.ts`-. */
async function recibir(
  companyId: string,
  input: {
    readonly orderId: string;
    readonly recipeId: string;
    readonly presentationId: string;
    readonly orderQuantity: string;
    readonly lotCost: string;
    readonly actorId: string;
  },
): Promise<{ readonly productId: string }> {
  const outcome = await prisma.$transaction((tx) =>
    receiveFinishedGoods(
      tx,
      {
        orderId: input.orderId,
        recipeId: input.recipeId,
        recipeName: `Receta ${input.orderId}`,
        presentationId: input.presentationId,
        orderQuantity: input.orderQuantity,
        orderContent: null,
        lotCost: input.lotCost,
        actorId: input.actorId,
        now: new Date(),
      },
      ambito(companyId),
    ),
  );
  if (outcome.kind !== 'received') throw new Error(`esperaba received, llego ${outcome.kind}`);
  return { productId: outcome.productId };
}

type Fixture = {
  readonly empresa: Company;
  readonly unitId: string;
  readonly presentationId: string;
  readonly recipeId: string;
};

async function sembrarFixture(content = '1'): Promise<Fixture> {
  const empresa = await nuevaEmpresa();
  const unitId = await sembrarUnidad();
  const presentationId = await sembrarPresentacion(empresa.companyId, unitId, content);
  const recipeId = await sembrarReceta(empresa.companyId);
  return { empresa, unitId, presentationId, recipeId };
}

async function limpiarFixture(fixture: Fixture, orderIds: readonly string[]): Promise<void> {
  await prisma.order.deleteMany({ where: { id: { in: [...orderIds] } } });
  await prisma.recipe.deleteMany({ where: { id: fixture.recipeId } });
  await prisma.presentation.deleteMany({ where: { id: fixture.presentationId } });
  await prisma.unit.deleteMany({ where: { id: fixture.unitId } });
}

describe('R14 — findFinishedGoodsReceipts: los envases que de verdad entraron por pedido', () => {
  it('un pedido con asiento production devuelve los envases enteros que entraron', async () => {
    const fixture = await sembrarFixture('2');
    const orderId = await sembrarPedido(fixture.empresa.companyId, fixture.recipeId, fixture.presentationId);
    let productId: string | null = null;

    try {
      const recibido = await recibir(fixture.empresa.companyId, {
        orderId,
        recipeId: fixture.recipeId,
        presentationId: fixture.presentationId,
        orderQuantity: '10',
        lotCost: '20',
        actorId: fixture.empresa.userId,
      });
      productId = recibido.productId;

      const receipts = await findFinishedGoodsReceipts([orderId], fixture.empresa.companyId);

      expect(receipts).toEqual([{ orderId, packages: '5' }]);
    } finally {
      if (productId !== null) await limpiarProducto(productId);
      await limpiarFixture(fixture, [orderId]);
    }
  });

  it('varios pedidos de la misma empresa en una sola llamada, cada uno con su propia fila', async () => {
    const fixture = await sembrarFixture('1');
    const orderId1 = await sembrarPedido(fixture.empresa.companyId, fixture.recipeId, fixture.presentationId);
    const orderId2 = await sembrarPedido(fixture.empresa.companyId, fixture.recipeId, fixture.presentationId);
    let productId: string | null = null;

    try {
      const primero = await recibir(fixture.empresa.companyId, {
        orderId: orderId1,
        recipeId: fixture.recipeId,
        presentationId: fixture.presentationId,
        orderQuantity: '3',
        lotCost: '3',
        actorId: fixture.empresa.userId,
      });
      productId = primero.productId;
      await recibir(fixture.empresa.companyId, {
        orderId: orderId2,
        recipeId: fixture.recipeId,
        presentationId: fixture.presentationId,
        orderQuantity: '7',
        lotCost: '7',
        actorId: fixture.empresa.userId,
      });

      const receipts = await findFinishedGoodsReceipts([orderId1, orderId2], fixture.empresa.companyId);

      expect([...receipts].sort((a, b) => a.orderId.localeCompare(b.orderId))).toEqual(
        [
          { orderId: orderId1, packages: '3' },
          { orderId: orderId2, packages: '7' },
        ].sort((a, b) => a.orderId.localeCompare(b.orderId)),
      );
    } finally {
      if (productId !== null) await limpiarProducto(productId);
      await limpiarFixture(fixture, [orderId1, orderId2]);
    }
  });

  it('un pedido SIN asiento production simplemente no aparece', async () => {
    const fixture = await sembrarFixture('1');
    const orderId = await sembrarPedido(fixture.empresa.companyId, fixture.recipeId, fixture.presentationId);

    try {
      const receipts = await findFinishedGoodsReceipts([orderId], fixture.empresa.companyId);
      expect(receipts).toEqual([]);
    } finally {
      await limpiarFixture(fixture, [orderId]);
    }
  });

  it('un pedido de OTRA empresa no aparece, aunque tenga asiento production', async () => {
    const fixture = await sembrarFixture('1');
    const otraEmpresa = await nuevaEmpresa();
    const orderId = await sembrarPedido(fixture.empresa.companyId, fixture.recipeId, fixture.presentationId);
    let productId: string | null = null;

    try {
      const recibido = await recibir(fixture.empresa.companyId, {
        orderId,
        recipeId: fixture.recipeId,
        presentationId: fixture.presentationId,
        orderQuantity: '4',
        lotCost: '4',
        actorId: fixture.empresa.userId,
      });
      productId = recibido.productId;

      const receipts = await findFinishedGoodsReceipts([orderId], otraEmpresa.companyId);

      expect(receipts).toEqual([]);
    } finally {
      if (productId !== null) await limpiarProducto(productId);
      await limpiarFixture(fixture, [orderId]);
    }
  });

  it('con una lista vacia de pedidos no consulta la base y devuelve una lista vacia', async () => {
    const antes = await prisma.inventoryMovement.count({ where: { kind: 'production' } });

    const receipts = await findFinishedGoodsReceipts([], 'cualquier-empresa');

    expect(receipts).toEqual([]);
    const despues = await prisma.inventoryMovement.count({ where: { kind: 'production' } });
    expect(despues).toBe(antes);
  });
});
