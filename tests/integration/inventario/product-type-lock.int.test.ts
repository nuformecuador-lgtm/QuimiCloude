/**
 * La edicion nunca cambia el tipo de o hacia `FINISHED_PRODUCT`. Contra Postgres real, con un
 * producto terminado sembrado a mano (con su `recipe_id`/`presentation_id`, que
 * exige el CHECK `products_finished_identity_matches_type`) para probar el `UPDATE` condicional
 * de `updateAliveProduct` -que ni un mock puede demostrar-.
 *
 * AISLAMIENTO: `updateAliveProduct` abre su propia `prisma.$transaction` contra el cliente
 * GLOBAL, igual que `product-crud.int.test.ts`, asi que una transaccion del test no la
 * envolveria. Cada caso siembra su propio fixture y lo borra en un `finally`.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { receiveFinishedGoods, updateAliveProduct } from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import { prisma } from '@/lib/shared/db/prisma';

import type { InventoryScope } from '@/lib/modules/inventario/domain/inventory-scope';
import type { NewProduct } from '@/lib/modules/inventario/domain/product-view';

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

let empresaDelArchivo: string;
let actorDelArchivo: string;
let roleDelArchivo: string;
let documentTypeDelArchivo: string;

function ambito(): InventoryScope {
  return { companyId: empresaDelArchivo };
}

beforeAll(async () => {
  const marca = token();
  const nombre = `Empresa tipo-bloqueado ${marca}`;
  const { id } = await prisma.company.create({
    data: { name: nombre, nameNormalized: nombre.toLowerCase().replace(/[^a-z0-9]/gu, '') },
    select: { id: true },
  });
  empresaDelArchivo = id;

  const documentType = await prisma.documentType.create({
    data: { code: `DOC${marca.slice(0, 8)}`, name: 'Tipo de documento de prueba' },
    select: { code: true },
  });
  documentTypeDelArchivo = documentType.code;
  const role = await prisma.role.create({
    data: { name: `rol-${marca}`, description: 'Rol de prueba' },
    select: { id: true },
  });
  roleDelArchivo = role.id;
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
      companyId: id,
    },
    select: { id: true },
  });
  actorDelArchivo = user.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: actorDelArchivo } });
  await prisma.role.deleteMany({ where: { id: roleDelArchivo } });
  await prisma.documentType.deleteMany({ where: { code: documentTypeDelArchivo } });
  await prisma.company.deleteMany({ where: { id: empresaDelArchivo } });
  await prisma.$disconnect();
});

async function sembrarUnidad(): Promise<string> {
  const marca = token();
  const { id } = await prisma.unit.create({
    data: { name: `unidad ${marca}`, nameNormalized: `unidad${marca}`, symbol: `u${marca}` },
    select: { id: true },
  });
  return id;
}

async function sembrarPresentacion(unitId: string, content: string | null = null): Promise<string> {
  const marca = token();
  const { id } = await prisma.presentation.create({
    data: {
      name: `Presentacion ${marca}`,
      nameNormalized: `presentacion${marca}`,
      unitId,
      companyId: empresaDelArchivo,
      content,
    },
    select: { id: true },
  });
  return id;
}

let sequenceDelArchivo = 1;

async function sembrarPedido(recipeId: string): Promise<string> {
  const now = new Date();
  const { id } = await prisma.order.create({
    data: {
      orderYear: now.getUTCFullYear(),
      orderSequence: sequenceDelArchivo++,
      recipeId,
      quantity: '10',
      companyId: empresaDelArchivo,
      createdAt: now,
    },
    select: { id: true },
  });
  return id;
}

/** La linea del reparto que `receiveFinishedGoods` exige por `orderPresentationLineId`. */
async function sembrarLinea(orderId: string, presentationId: string, packages: number): Promise<string> {
  const { id } = await prisma.orderPresentationLine.create({
    data: { orderId, companyId: empresaDelArchivo, presentationId, packages, presentationContent: '1' },
    select: { id: true },
  });
  return id;
}

async function sembrarReceta(): Promise<string> {
  const marca = token();
  const { id } = await prisma.recipe.create({
    data: { name: `Receta ${marca}`, nameNormalized: `receta${marca}`, companyId: empresaDelArchivo },
    select: { id: true },
  });
  return id;
}

async function sembrarProductoTerminado(recipeId: string, presentationId: string, unitId: string): Promise<string> {
  const marca = token();
  const { id } = await prisma.product.create({
    data: {
      name: `Terminado ${marca}`,
      nameNormalized: `terminado${marca}`,
      type: 'FINISHED_PRODUCT',
      unitId,
      companyId: empresaDelArchivo,
      recipeId,
      presentationId,
    },
    select: { id: true },
  });
  return id;
}

async function sembrarProductoNormal(): Promise<string> {
  const marca = token();
  const { id } = await prisma.product.create({
    data: {
      name: `Producto ${marca}`,
      nameNormalized: `producto${marca}`,
      type: 'PRODUCT',
      companyId: empresaDelArchivo,
    },
    select: { id: true },
  });
  return id;
}

function edicion(overrides: Partial<NewProduct> = {}): NewProduct {
  return { name: `Editado ${token()}`, qtyAlert: '0', ...overrides };
}

describe('R4 — la edicion no cambia el tipo de o hacia FINISHED_PRODUCT', () => {
  it('cambiar un producto normal a FINISHED_PRODUCT se rechaza sin modificar la fila', async () => {
    const productId = await sembrarProductoNormal();
    try {
      const antes = await prisma.product.findUniqueOrThrow({ where: { id: productId } });

      const resultado = await updateAliveProduct(
        productId,
        edicion({ type: 'FINISHED_PRODUCT' }),
        new Date(),
        ambito(),
      );

      expect(resultado).toBe('type_locked');
      const despues = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
      expect(despues).toEqual(antes);
    } finally {
      await prisma.product.deleteMany({ where: { id: productId } });
    }
  });

  it('cambiar un producto terminado a PRODUCT se rechaza sin modificar la fila', async () => {
    const unitId = await sembrarUnidad();
    const presentationId = await sembrarPresentacion(unitId);
    const recipeId = await sembrarReceta();
    const productId = await sembrarProductoTerminado(recipeId, presentationId, unitId);

    try {
      const antes = await prisma.product.findUniqueOrThrow({ where: { id: productId } });

      const resultado = await updateAliveProduct(productId, edicion({ type: 'PRODUCT' }), new Date(), ambito());

      expect(resultado).toBe('type_locked');
      const despues = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
      expect(despues).toEqual(antes);
    } finally {
      await prisma.product.deleteMany({ where: { id: productId } });
      await prisma.recipe.deleteMany({ where: { id: recipeId } });
      await prisma.presentation.deleteMany({ where: { id: presentationId } });
      await prisma.unit.deleteMany({ where: { id: unitId } });
    }
  });

  it('D23 — editar un producto terminado con su mismo tipo si se acepta (nombre, alerta)', async () => {
    const unitId = await sembrarUnidad();
    const presentationId = await sembrarPresentacion(unitId);
    const recipeId = await sembrarReceta();
    const productId = await sembrarProductoTerminado(recipeId, presentationId, unitId);

    try {
      const nuevaEdicion = edicion({ type: 'FINISHED_PRODUCT' });

      const resultado = await updateAliveProduct(productId, nuevaEdicion, new Date(), ambito());

      expect(resultado).toBe(true);
      const despues = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
      expect(despues.name).toBe(nuevaEdicion.name);
      expect(despues.type).toBe('FINISHED_PRODUCT');
      // La unidad no la toca la edicion, para ningun tipo: se mantiene tal cual.
      expect(despues.unitId).toBe(unitId);
    } finally {
      await prisma.product.deleteMany({ where: { id: productId } });
      await prisma.recipe.deleteMany({ where: { id: recipeId } });
      await prisma.presentation.deleteMany({ where: { id: presentationId } });
      await prisma.unit.deleteMany({ where: { id: unitId } });
    }
  });

  it('D23 — renombrar un producto terminado y volver a recibir la misma combinacion suma el lote al mismo producto', async () => {
    const unitId = await sembrarUnidad();
    const presentationId = await sembrarPresentacion(unitId, '1');
    const recipeId = await sembrarReceta();
    const orderId1 = await sembrarPedido(recipeId);
    const orderId2 = await sembrarPedido(recipeId);
    const lineId1 = await sembrarLinea(orderId1, presentationId, 10);
    const lineId2 = await sembrarLinea(orderId2, presentationId, 5);
    let productId: string | null = null;

    try {
      const primero = await prisma.$transaction((tx) =>
        receiveFinishedGoods(
          tx,
          {
            orderId: orderId1,
            recipeId,
            recipeName: 'Receta renombrable',
            presentationId,
            orderPresentationLineId: lineId1,
            packages: 10,
            orderContent: '1',
            unitCost: '1.0000',
            actorId: actorDelArchivo,
            now: new Date(),
          },
          ambito(),
        ),
      );
      if (primero.kind !== 'received') throw new Error('esperaba received');
      productId = primero.productId;

      const nuevoNombre = `Renombrado ${token()}`;
      const resultado = await updateAliveProduct(
        productId,
        edicion({ name: nuevoNombre, type: 'FINISHED_PRODUCT' }),
        new Date(),
        ambito(),
      );
      expect(resultado).toBe(true);

      const segundo = await prisma.$transaction((tx) =>
        receiveFinishedGoods(
          tx,
          {
            orderId: orderId2,
            recipeId,
            recipeName: 'Receta renombrable',
            presentationId,
            orderPresentationLineId: lineId2,
            packages: 5,
            orderContent: '1',
            unitCost: '1.0000',
            actorId: actorDelArchivo,
            now: new Date(),
          },
          ambito(),
        ),
      );
      if (segundo.kind !== 'received') throw new Error('esperaba received');
      expect(segundo.productId).toBe(productId);

      const vivos = await prisma.product.findMany({
        where: { companyId: empresaDelArchivo, recipeId, presentationId, type: 'FINISHED_PRODUCT', deletedAt: null },
      });
      expect(vivos).toHaveLength(1);
      expect(vivos[0]!.name).toBe(nuevoNombre);

      const lotes = await prisma.productBatch.findMany({ where: { productId } });
      expect(lotes).toHaveLength(2);
    } finally {
      if (productId !== null) {
        await prisma.inventoryMovement.deleteMany({ where: { batch: { productId } } });
        await prisma.productBatch.deleteMany({ where: { productId } });
        await prisma.product.deleteMany({ where: { id: productId } });
      }
      await prisma.orderPresentationLine.deleteMany({ where: { orderId: { in: [orderId1, orderId2] } } });
      await prisma.order.deleteMany({ where: { id: { in: [orderId1, orderId2] } } });
      await prisma.recipe.deleteMany({ where: { id: recipeId } });
      await prisma.presentation.deleteMany({ where: { id: presentationId } });
      await prisma.unit.deleteMany({ where: { id: unitId } });
    }
  });
});
