/**
 * `receiveFinishedGoods` contra Postgres real.
 *
 * AISLAMIENTO: `receiveFinishedGoods` recibe el `tx` de quien llama y no abre transaccion
 * propia -a diferencia de `createWithFirstBatch`-, asi que cada caso la envuelve con
 * `prisma.$transaction` sobre el cliente GLOBAL, igual que hara `withOrderTransaction` en
 * produccion. Envolver la corrida ENTERA en una transaccion del test seria aislamiento de
 * mentira: la escritura necesita CONFIRMAR para que una segunda llamada choque de verdad
 * contra el indice, y la prueba de concurrencia necesita dos conexiones reales a la vez. Cada
 * caso fabrica su propia empresa (y, cuando hace falta, una segunda) con randomUUID y limpia
 * en un `finally` en el orden que exigen las FK: asientos -> lotes -> productos -> pedidos -> receta ->
 * presentacion -> unidad -> usuario -> rol -> tipo de documento -> empresa.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import { receiveFinishedGoods } from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
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
  options: { readonly content?: string | null; readonly name?: string } = {},
): Promise<string> {
  const marca = token();
  const nombre = options.name ?? `Presentacion ${marca}`;
  const { id } = await prisma.presentation.create({
    data: {
      name: nombre,
      nameNormalized: nombre.toLowerCase().replace(/[^a-z0-9]/gu, ''),
      unitId,
      companyId,
      content: options.content === undefined ? '1' : options.content,
    },
    select: { id: true },
  });
  return id;
}

async function sembrarReceta(companyId: string, name?: string): Promise<string> {
  const marca = token();
  const nombre = name ?? `Receta ${marca}`;
  const { id } = await prisma.recipe.create({
    data: { name: nombre, nameNormalized: nombre.toLowerCase().replace(/[^a-z0-9]/gu, ''), companyId },
    select: { id: true },
  });
  return id;
}

let sequenceCounter = 1;

async function sembrarPedido(
  companyId: string,
  recipeId: string,
  presentationId: string | null,
  presentationContent: string | null = null,
): Promise<string> {
  const now = new Date();
  const { id } = await prisma.order.create({
    data: {
      orderYear: now.getUTCFullYear(),
      orderSequence: sequenceCounter++,
      recipeId,
      quantity: '10',
      companyId,
      presentationId,
      presentationContent,
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

function recibir(
  companyId: string,
  input: {
    readonly orderId: string;
    readonly recipeId: string;
    readonly recipeName: string;
    readonly presentationId: string;
    readonly orderQuantity: string;
    readonly orderContent: string | null;
    readonly lotCost: string;
    readonly actorId: string;
    readonly now: Date;
  },
) {
  return prisma.$transaction((tx) => receiveFinishedGoods(tx, input, ambito(companyId)));
}

describe('receiveFinishedGoods — R11, R13, R16, R17, R41, R43: primera entrada', () => {
  it('R11, R13, R16, R17, R41, R43: nace el producto, su lote y su asiento', async () => {
    const empresa = await nuevaEmpresa();
    const unitId = await sembrarUnidad();
    const presentationId = await sembrarPresentacion(empresa.companyId, unitId, { name: 'Botella 1L', content: '1' });
    const recipeId = await sembrarReceta(empresa.companyId, 'Desengrasante industrial');
    const orderId = await sembrarPedido(empresa.companyId, recipeId, presentationId, null);
    const now = new Date();

    try {
      const outcome = await recibir(empresa.companyId, {
        orderId,
        recipeId,
        recipeName: 'Desengrasante industrial',
        presentationId,
        orderQuantity: '50.5',
        orderContent: '1',
        lotCost: '100',
        actorId: empresa.userId,
        now,
      });

      expect(outcome).toMatchObject({ kind: 'received', productName: 'Desengrasante industrial · Botella 1L', packages: '50' });
      if (outcome.kind !== 'received') throw new Error('esperaba received');

      const product = await prisma.product.findUniqueOrThrow({ where: { id: outcome.productId } });
      expect(product.type).toBe('FINISHED_PRODUCT');
      expect(product.name).toBe('Desengrasante industrial · Botella 1L');
      expect(product.unitId).toBe(unitId);
      expect(product.recipeId).toBe(recipeId);
      expect(product.presentationId).toBe(presentationId);
      expect(product.stock.toFixed(4)).toBe('50.0000');

      const batches = await prisma.productBatch.findMany({ where: { productId: outcome.productId } });
      expect(batches).toHaveLength(1);
      const batch = batches[0]!;
      expect(batch.presentationId).toBe(presentationId);
      expect(batch.lot).toMatch(/^\d+$/);
      expect(batch.purchaseDate.toISOString().slice(0, 10)).toBe(now.toISOString().slice(0, 10));
      expect(batch.expiryDate).toBeNull();
      expect(batch.createdBy).toBe(empresa.userId);
      expect(batch.packageContent?.toFixed(4)).toBe('1.0000');
      expect(batch.unitCost?.toFixed(4)).toBe('2.0000');

      const movements = await prisma.inventoryMovement.findMany({ where: { batchId: batch.id } });
      expect(movements).toHaveLength(1);
      expect(movements[0]).toMatchObject({ kind: 'production', orderId, createdBy: empresa.userId });
      expect(movements[0]!.quantity.toFixed(4)).toBe('50.0000');

      await limpiarProducto(outcome.productId);
    } finally {
      await prisma.order.deleteMany({ where: { id: orderId } });
      await prisma.recipe.deleteMany({ where: { id: recipeId } });
      await prisma.presentation.deleteMany({ where: { id: presentationId } });
      await prisma.unit.deleteMany({ where: { id: unitId } });
    }
  });

  it('un segundo pedido de la misma combinacion reutiliza el producto y anade otro lote (R11, lote correlativo)', async () => {
    const empresa = await nuevaEmpresa();
    const unitId = await sembrarUnidad();
    const presentationId = await sembrarPresentacion(empresa.companyId, unitId, { content: '1' });
    const recipeId = await sembrarReceta(empresa.companyId);
    const orderId1 = await sembrarPedido(empresa.companyId, recipeId, presentationId, null);
    const orderId2 = await sembrarPedido(empresa.companyId, recipeId, presentationId, null);
    let productId: string | null = null;

    try {
      const primero = await recibir(empresa.companyId, {
        orderId: orderId1,
        recipeId,
        recipeName: 'Receta compartida',
        presentationId,
        orderQuantity: '10',
        orderContent: '1',
        lotCost: '10',
        actorId: empresa.userId,
        now: new Date(),
      });
      const segundo = await recibir(empresa.companyId, {
        orderId: orderId2,
        recipeId,
        recipeName: 'Receta compartida',
        presentationId,
        orderQuantity: '5',
        orderContent: '1',
        lotCost: '5',
        actorId: empresa.userId,
        now: new Date(),
      });

      if (primero.kind !== 'received' || segundo.kind !== 'received') throw new Error('esperaba received');
      expect(segundo.productId).toBe(primero.productId);
      productId = primero.productId;

      const batches = await prisma.productBatch.findMany({ where: { productId }, orderBy: { lot: 'asc' } });
      expect(batches).toHaveLength(2);
      expect(batches.map((b) => b.lot)).toEqual([...new Set(batches.map((b) => b.lot))]);

      const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
      expect(product.stock.toFixed(4)).toBe('15.0000');
    } finally {
      if (productId !== null) await limpiarProducto(productId);
      await prisma.order.deleteMany({ where: { id: { in: [orderId1, orderId2] } } });
      await prisma.recipe.deleteMany({ where: { id: recipeId } });
      await prisma.presentation.deleteMany({ where: { id: presentationId } });
      await prisma.unit.deleteMany({ where: { id: unitId } });
    }
  });
});

describe('receiveFinishedGoods — R21: idempotencia por pedido', () => {
  it('una segunda llamada con el mismo pedido la rechaza el indice unico, sin dejar un segundo lote', async () => {
    const empresa = await nuevaEmpresa();
    const unitId = await sembrarUnidad();
    const presentationId = await sembrarPresentacion(empresa.companyId, unitId, { content: '1' });
    const recipeId = await sembrarReceta(empresa.companyId);
    const orderId = await sembrarPedido(empresa.companyId, recipeId, presentationId, null);
    let productId: string | null = null;

    const input = {
      orderId,
      recipeId,
      recipeName: 'Receta idempotente',
      presentationId,
      orderQuantity: '10',
      orderContent: '1',
      lotCost: '10',
      actorId: empresa.userId,
      now: new Date(),
    };

    try {
      const primero = await recibir(empresa.companyId, input);
      if (primero.kind !== 'received') throw new Error('esperaba received');
      productId = primero.productId;

      await expect(recibir(empresa.companyId, input)).rejects.toBeTruthy();

      const batches = await prisma.productBatch.findMany({ where: { productId } });
      expect(batches).toHaveLength(1);
      const movements = await prisma.inventoryMovement.findMany({ where: { orderId, kind: 'production' } });
      expect(movements).toHaveLength(1);
    } finally {
      if (productId !== null) await limpiarProducto(productId);
      await prisma.order.deleteMany({ where: { id: orderId } });
      await prisma.recipe.deleteMany({ where: { id: recipeId } });
      await prisma.presentation.deleteMany({ where: { id: presentationId } });
      await prisma.unit.deleteMany({ where: { id: unitId } });
    }
  });
});

describe('receiveFinishedGoods — R22: dos pedidos de la misma combinacion, a la vez', () => {
  it('dos conexiones reales sin producto previo terminan con UN producto y DOS lotes', async () => {
    const empresa = await nuevaEmpresa();
    const unitId = await sembrarUnidad();
    const presentationId = await sembrarPresentacion(empresa.companyId, unitId, { content: '1' });
    const recipeId = await sembrarReceta(empresa.companyId);
    const orderId1 = await sembrarPedido(empresa.companyId, recipeId, presentationId, null);
    const orderId2 = await sembrarPedido(empresa.companyId, recipeId, presentationId, null);
    let productId: string | null = null;

    try {
      const [a, b] = await Promise.all([
        recibir(empresa.companyId, {
          orderId: orderId1,
          recipeId,
          recipeName: 'Receta concurrente',
          presentationId,
          orderQuantity: '10',
          orderContent: '1',
          lotCost: '10',
          actorId: empresa.userId,
          now: new Date(),
        }),
        recibir(empresa.companyId, {
          orderId: orderId2,
          recipeId,
          recipeName: 'Receta concurrente',
          presentationId,
          orderQuantity: '20',
          orderContent: '1',
          lotCost: '20',
          actorId: empresa.userId,
          now: new Date(),
        }),
      ]);

      if (a.kind !== 'received' || b.kind !== 'received') throw new Error('esperaba received en las dos');
      expect(a.productId).toBe(b.productId);
      productId = a.productId;

      const products = await prisma.product.findMany({
        where: { companyId: empresa.companyId, recipeId, presentationId, type: 'FINISHED_PRODUCT', deletedAt: null },
      });
      expect(products).toHaveLength(1);

      const batches = await prisma.productBatch.findMany({ where: { productId } });
      expect(batches).toHaveLength(2);
    } finally {
      if (productId !== null) await limpiarProducto(productId);
      await prisma.order.deleteMany({ where: { id: { in: [orderId1, orderId2] } } });
      await prisma.recipe.deleteMany({ where: { id: recipeId } });
      await prisma.presentation.deleteMany({ where: { id: presentationId } });
      await prisma.unit.deleteMany({ where: { id: unitId } });
    }
  });
});

describe('receiveFinishedGoods — R23: acotado por empresa', () => {
  it('dos empresas con receta y presentacion homonimas terminan con productos separados', async () => {
    const empresaA = await nuevaEmpresa();
    const empresaB = await nuevaEmpresa();
    const unitA = await sembrarUnidad();
    const unitB = await sembrarUnidad();
    const presentationA = await sembrarPresentacion(empresaA.companyId, unitA, { content: '1', name: 'Homonima' });
    const presentationB = await sembrarPresentacion(empresaB.companyId, unitB, { content: '1', name: 'Homonima' });
    const recipeA = await sembrarReceta(empresaA.companyId, 'Receta homonima');
    const recipeB = await sembrarReceta(empresaB.companyId, 'Receta homonima');
    const orderA = await sembrarPedido(empresaA.companyId, recipeA, presentationA, null);
    const orderB = await sembrarPedido(empresaB.companyId, recipeB, presentationB, null);
    let productIdA: string | null = null;
    let productIdB: string | null = null;

    try {
      const outcomeA = await recibir(empresaA.companyId, {
        orderId: orderA,
        recipeId: recipeA,
        recipeName: 'Receta homonima',
        presentationId: presentationA,
        orderQuantity: '10',
        orderContent: '1',
        lotCost: '10',
        actorId: empresaA.userId,
        now: new Date(),
      });
      const outcomeB = await recibir(empresaB.companyId, {
        orderId: orderB,
        recipeId: recipeB,
        recipeName: 'Receta homonima',
        presentationId: presentationB,
        orderQuantity: '10',
        orderContent: '1',
        lotCost: '10',
        actorId: empresaB.userId,
        now: new Date(),
      });

      if (outcomeA.kind !== 'received' || outcomeB.kind !== 'received') throw new Error('esperaba received');
      expect(outcomeA.productId).not.toBe(outcomeB.productId);
      productIdA = outcomeA.productId;
      productIdB = outcomeB.productId;

      const productA = await prisma.product.findUniqueOrThrow({ where: { id: productIdA } });
      const productB = await prisma.product.findUniqueOrThrow({ where: { id: productIdB } });
      expect(productA.companyId).toBe(empresaA.companyId);
      expect(productB.companyId).toBe(empresaB.companyId);

      const batchesOfA = await prisma.productBatch.findMany({ where: { productId: productIdA } });
      expect(batchesOfA.every((b) => b.companyId === empresaA.companyId)).toBe(true);
    } finally {
      if (productIdA !== null) await limpiarProducto(productIdA);
      if (productIdB !== null) await limpiarProducto(productIdB);
      await prisma.order.deleteMany({ where: { id: { in: [orderA, orderB] } } });
      await prisma.recipe.deleteMany({ where: { id: { in: [recipeA, recipeB] } } });
      await prisma.presentation.deleteMany({ where: { id: { in: [presentationA, presentationB] } } });
      await prisma.unit.deleteMany({ where: { id: { in: [unitA, unitB] } } });
    }
  });
});

describe('receiveFinishedGoods — R23 — acceso cruzado: presentacion de otra empresa', () => {
  it('R23 — acceso cruzado: la empresa B con la presentacion de la empresa A no escribe nada en ninguna de las dos', async () => {
    const empresaA = await nuevaEmpresa();
    const empresaB = await nuevaEmpresa();
    const unitA = await sembrarUnidad();
    const presentationA = await sembrarPresentacion(empresaA.companyId, unitA, { content: '1', name: 'Solo de A' });
    const recipeB = await sembrarReceta(empresaB.companyId, 'Receta de B');
    // El pedido de B no puede guardar la presentacion de A (la FK compuesta lo impide): el
    // ataque va directo al argumento de `receiveFinishedGoods`, no a la fila del pedido.
    const orderB = await sembrarPedido(empresaB.companyId, recipeB, null);

    const contarTodo = () =>
      Promise.all([
        prisma.product.count({ where: { companyId: { in: [empresaA.companyId, empresaB.companyId] } } }),
        prisma.productBatch.count({ where: { companyId: { in: [empresaA.companyId, empresaB.companyId] } } }),
        prisma.inventoryMovement.count({ where: { companyId: { in: [empresaA.companyId, empresaB.companyId] } } }),
      ]);

    try {
      const antes = await contarTodo();

      const outcome = await recibir(empresaB.companyId, {
        orderId: orderB,
        recipeId: recipeB,
        recipeName: 'Receta de B',
        presentationId: presentationA,
        orderQuantity: '10',
        orderContent: null,
        lotCost: '10',
        actorId: empresaB.userId,
        now: new Date(),
      });

      expect(outcome).toEqual({ kind: 'presentation_without_content' });

      const despues = await contarTodo();
      expect(despues).toEqual(antes);
    } finally {
      await prisma.order.deleteMany({ where: { id: orderB } });
      await prisma.recipe.deleteMany({ where: { id: recipeB } });
      await prisma.presentation.deleteMany({ where: { id: presentationA } });
      await prisma.unit.deleteMany({ where: { id: unitA } });
    }
  });
});

describe('receiveFinishedGoods — R35: producto dado de baja', () => {
  it('un pedido de la misma combinacion tras la baja crea un producto nuevo', async () => {
    const empresa = await nuevaEmpresa();
    const unitId = await sembrarUnidad();
    const presentationId = await sembrarPresentacion(empresa.companyId, unitId, { content: '1' });
    const recipeId = await sembrarReceta(empresa.companyId);
    const orderId1 = await sembrarPedido(empresa.companyId, recipeId, presentationId, null);
    const orderId2 = await sembrarPedido(empresa.companyId, recipeId, presentationId, null);
    let productId1: string | null = null;
    let productId2: string | null = null;

    try {
      const primero = await recibir(empresa.companyId, {
        orderId: orderId1,
        recipeId,
        recipeName: 'Receta dada de baja',
        presentationId,
        orderQuantity: '10',
        orderContent: '1',
        lotCost: '10',
        actorId: empresa.userId,
        now: new Date(),
      });
      if (primero.kind !== 'received') throw new Error('esperaba received');
      productId1 = primero.productId;

      await prisma.product.update({ where: { id: productId1 }, data: { deletedAt: new Date() } });

      const segundo = await recibir(empresa.companyId, {
        orderId: orderId2,
        recipeId,
        recipeName: 'Receta dada de baja',
        presentationId,
        orderQuantity: '10',
        orderContent: '1',
        lotCost: '10',
        actorId: empresa.userId,
        now: new Date(),
      });
      if (segundo.kind !== 'received') throw new Error('esperaba received');
      productId2 = segundo.productId;

      expect(productId2).not.toBe(productId1);
      const batchesDelViejo = await prisma.productBatch.findMany({ where: { productId: productId1 } });
      expect(batchesDelViejo).toHaveLength(1);
      const batchesDelNuevo = await prisma.productBatch.findMany({ where: { productId: productId2 } });
      expect(batchesDelNuevo).toHaveLength(1);
    } finally {
      if (productId1 !== null) await limpiarProducto(productId1);
      if (productId2 !== null) await limpiarProducto(productId2);
      await prisma.order.deleteMany({ where: { id: { in: [orderId1, orderId2] } } });
      await prisma.recipe.deleteMany({ where: { id: recipeId } });
      await prisma.presentation.deleteMany({ where: { id: presentationId } });
      await prisma.unit.deleteMany({ where: { id: unitId } });
    }
  });
});

describe('receiveFinishedGoods — R44: contenido del pedido', () => {
  it('sin copia del pedido usa el contenido vigente de la presentacion', async () => {
    const empresa = await nuevaEmpresa();
    const unitId = await sembrarUnidad();
    const presentationId = await sembrarPresentacion(empresa.companyId, unitId, { content: '2' });
    const recipeId = await sembrarReceta(empresa.companyId);
    const orderId = await sembrarPedido(empresa.companyId, recipeId, presentationId, null);
    let productId: string | null = null;

    try {
      const outcome = await recibir(empresa.companyId, {
        orderId,
        recipeId,
        recipeName: 'Receta sin copia',
        presentationId,
        orderQuantity: '10',
        orderContent: null,
        lotCost: '10',
        actorId: empresa.userId,
        now: new Date(),
      });

      expect(outcome).toMatchObject({ kind: 'received', packages: '5' });
      if (outcome.kind === 'received') productId = outcome.productId;
    } finally {
      if (productId !== null) await limpiarProducto(productId);
      await prisma.order.deleteMany({ where: { id: orderId } });
      await prisma.recipe.deleteMany({ where: { id: recipeId } });
      await prisma.presentation.deleteMany({ where: { id: presentationId } });
      await prisma.unit.deleteMany({ where: { id: unitId } });
    }
  });

  it('sin copia y sin contenido vigente rechaza el Finalizar sin escribir nada', async () => {
    const empresa = await nuevaEmpresa();
    const unitId = await sembrarUnidad();
    const presentationId = await sembrarPresentacion(empresa.companyId, unitId, { content: null });
    const recipeId = await sembrarReceta(empresa.companyId);
    const orderId = await sembrarPedido(empresa.companyId, recipeId, presentationId, null);

    try {
      const outcome = await recibir(empresa.companyId, {
        orderId,
        recipeId,
        recipeName: 'Receta sin contenido',
        presentationId,
        orderQuantity: '10',
        orderContent: null,
        lotCost: '10',
        actorId: empresa.userId,
        now: new Date(),
      });

      expect(outcome).toEqual({ kind: 'presentation_without_content' });
      const products = await prisma.product.findMany({ where: { companyId: empresa.companyId, recipeId, presentationId } });
      expect(products).toHaveLength(0);
      const movements = await prisma.inventoryMovement.findMany({ where: { orderId } });
      expect(movements).toHaveLength(0);
    } finally {
      await prisma.order.deleteMany({ where: { id: orderId } });
      await prisma.recipe.deleteMany({ where: { id: recipeId } });
      await prisma.presentation.deleteMany({ where: { id: presentationId } });
      await prisma.unit.deleteMany({ where: { id: unitId } });
    }
  });
});

describe('receiveFinishedGoods — D22: el nombre completo, sin recortar', () => {
  it('un nombre compuesto de 183 caracteres se guarda completo', async () => {
    const empresa = await nuevaEmpresa();
    const unitId = await sembrarUnidad();
    const nombreReceta = 'R'.repeat(120);
    const nombrePresentacion = 'P'.repeat(60);
    const presentationId = await sembrarPresentacion(empresa.companyId, unitId, { content: '1', name: nombrePresentacion });
    const recipeId = await sembrarReceta(empresa.companyId, nombreReceta);
    const orderId = await sembrarPedido(empresa.companyId, recipeId, presentationId, null);
    let productId: string | null = null;

    try {
      const outcome = await recibir(empresa.companyId, {
        orderId,
        recipeId,
        recipeName: nombreReceta,
        presentationId,
        orderQuantity: '10',
        orderContent: '1',
        lotCost: '10',
        actorId: empresa.userId,
        now: new Date(),
      });

      if (outcome.kind !== 'received') throw new Error('esperaba received');
      productId = outcome.productId;
      const nombreEsperado = `${nombreReceta} · ${nombrePresentacion}`;
      expect(nombreEsperado).toHaveLength(183);
      expect(outcome.productName).toBe(nombreEsperado);

      const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
      expect(product.name).toBe(nombreEsperado);
      expect(product.name).toHaveLength(183);
    } finally {
      if (productId !== null) await limpiarProducto(productId);
      await prisma.order.deleteMany({ where: { id: orderId } });
      await prisma.recipe.deleteMany({ where: { id: recipeId } });
      await prisma.presentation.deleteMany({ where: { id: presentationId } });
      await prisma.unit.deleteMany({ where: { id: unitId } });
    }
  });
});
