/**
 * `findDeliverableBatches` contra Postgres real: los lotes de producto terminado que el sheet de
 * entrega ofrece para una receta y sus presentaciones.
 *
 * AISLAMIENTO: `findDeliverableBatches` lee con el cliente Prisma GLOBAL, asi que lo sembrado
 * tiene que quedar CONFIRMADO. Cada caso crea sus empresas efimeras, siembra los lotes por las
 * rutas reales (`receiveFinishedGoods` para el de produccion, `addImportedFinishedGoodsBatch` para
 * el de importacion) o directo para los que no deben salir, y limpia lo suyo en un `finally`.
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import { findDeliverableBatches } from '@/lib/modules/inventario/adapters/driven/persistence/deliverable-batches-prisma';
import {
  addImportedFinishedGoodsBatch,
  receiveFinishedGoods,
} from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import { prisma } from '@/lib/shared/db/prisma';

import type { InventoryScope } from '@/lib/modules/inventario/domain/inventory-scope';

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

function normalizar(texto: string): string {
  return texto.toLowerCase().replace(/[^a-z0-9]/gu, '');
}

type Empresa = {
  readonly companyId: string;
  readonly userId: string;
  readonly roleId: string;
  readonly documentTypeCode: string;
  readonly unitId: string;
  readonly scope: InventoryScope;
};

const empresasCreadas: Empresa[] = [];

async function sembrarEmpresa(): Promise<Empresa> {
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
  const unit = await prisma.unit.create({
    data: { name: `unidad ${marca}`, nameNormalized: `unidad${marca}`, symbol: `u${marca}` },
    select: { id: true },
  });
  const empresa: Empresa = {
    companyId: company.id,
    userId: user.id,
    roleId: role.id,
    documentTypeCode: documentType.code,
    unitId: unit.id,
    scope: { companyId: company.id },
  };
  empresasCreadas.push(empresa);
  return empresa;
}

async function limpiar(empresa: Empresa): Promise<void> {
  const companyId = empresa.companyId;
  await prisma.inventoryMovement.deleteMany({ where: { companyId } });
  await prisma.productBatch.deleteMany({ where: { companyId } });
  await prisma.product.deleteMany({ where: { companyId } });
  await prisma.orderPresentationLine.deleteMany({ where: { companyId } });
  await prisma.order.deleteMany({ where: { companyId } });
  await prisma.recipe.deleteMany({ where: { companyId } });
  await prisma.presentation.deleteMany({ where: { companyId } });
  await prisma.unit.deleteMany({ where: { id: empresa.unitId } });
}

afterAll(async () => {
  for (const empresa of empresasCreadas) {
    await prisma.user.deleteMany({ where: { id: empresa.userId } });
    await prisma.role.deleteMany({ where: { id: empresa.roleId } });
    await prisma.documentType.deleteMany({ where: { code: empresa.documentTypeCode } });
    await prisma.company.deleteMany({ where: { id: empresa.companyId } });
  }
  await prisma.$disconnect();
});

async function sembrarReceta(empresa: Empresa): Promise<string> {
  const nombre = `Receta ${token()}`;
  const { id } = await prisma.recipe.create({
    data: { name: nombre, nameNormalized: normalizar(nombre), companyId: empresa.companyId },
    select: { id: true },
  });
  return id;
}

async function sembrarPresentacion(empresa: Empresa, content: string): Promise<string> {
  const nombre = `Botella ${token()}`;
  const { id } = await prisma.presentation.create({
    data: { name: nombre, nameNormalized: normalizar(nombre), unitId: empresa.unitId, companyId: empresa.companyId, content },
    select: { id: true },
  });
  return id;
}

/** Producto terminado vivo (o dado de baja) de la combinacion, creado directo. */
async function sembrarTerminado(
  empresa: Empresa,
  recipeId: string,
  presentationId: string,
  deletedAt: Date | null = null,
): Promise<string> {
  const nombre = `Terminado ${token()}`;
  const { id } = await prisma.product.create({
    data: {
      name: nombre,
      nameNormalized: normalizar(nombre),
      type: 'FINISHED_PRODUCT',
      unitId: empresa.unitId,
      recipeId,
      presentationId,
      companyId: empresa.companyId,
      deletedAt,
    },
    select: { id: true },
  });
  return id;
}

/** Lote sembrado directo, sin asiento: solo para los que la lectura NO debe devolver. */
async function sembrarLoteDirecto(
  empresa: Empresa,
  productId: string,
  presentationId: string,
  stock: string,
  packageContent: string | null,
): Promise<string> {
  const { id } = await prisma.productBatch.create({
    data: {
      productId,
      presentationId,
      stock: new Prisma.Decimal(stock),
      unitCost: new Prisma.Decimal('1.0000'),
      packageContent: packageContent === null ? null : new Prisma.Decimal(packageContent),
      lot: `L-${randomUUID()}`,
      purchaseDate: new Date('2026-09-01T00:00:00Z'),
      companyId: empresa.companyId,
    },
    select: { id: true },
  });
  return id;
}

let secuencia = 1;

/** Lote de produccion por la ruta real de Terminar el empaque. */
async function recibirPorProduccion(
  empresa: Empresa,
  recipeId: string,
  presentationId: string,
  packages: number,
): Promise<{ productId: string; batchId: string }> {
  const { id: orderId } = await prisma.order.create({
    data: {
      orderYear: new Date().getUTCFullYear(),
      orderSequence: secuencia++,
      recipeId,
      quantity: '10',
      companyId: empresa.companyId,
      createdAt: new Date(),
    },
    select: { id: true },
  });
  const line = await prisma.orderPresentationLine.create({
    data: { orderId, companyId: empresa.companyId, presentationId, packages, presentationContent: null },
    select: { id: true },
  });
  const outcome = await prisma.$transaction((tx) =>
    receiveFinishedGoods(
      tx,
      {
        orderId,
        recipeId,
        recipeName: 'Limpiador',
        presentationId,
        orderPresentationLineId: line.id,
        packages,
        orderContent: null,
        unitCost: '1.0000',
        actorId: empresa.userId,
        now: new Date(),
      },
      empresa.scope,
    ),
  );
  if (outcome.kind !== 'received') throw new Error(`esperaba received, llego ${outcome.kind}`);
  const movement = await prisma.inventoryMovement.findFirstOrThrow({
    where: { orderPresentationLineId: line.id, kind: 'production' },
    select: { batchId: true },
  });
  return { productId: outcome.productId, batchId: movement.batchId };
}

/** Lote de importacion (asiento `opening`) por la ruta real. */
async function recibirPorImportacion(
  empresa: Empresa,
  productId: string,
  presentationId: string,
  stock: string,
  packageContent: string,
  lot: string,
  purchaseDate: string,
): Promise<string> {
  const { batchId } = await prisma.$transaction((tx) =>
    addImportedFinishedGoodsBatch(
      tx,
      productId,
      {
        presentationId,
        stock,
        unitCost: '1.0000',
        lot,
        purchaseDate,
        expiryDate: '2027-03-01',
        createdBy: empresa.userId,
      },
      packageContent,
      new Date(),
      empresa.scope,
    ),
  );
  return batchId;
}

describe('findDeliverableBatches (R7)', () => {
  it('R7: devuelve los lotes de produccion e importacion con al menos un envase, por fecha de entrada y luego por lote', async () => {
    const a = await sembrarEmpresa();
    const b = await sembrarEmpresa();
    try {
      const receta = await sembrarReceta(a);
      const otraReceta = await sembrarReceta(a);
      const p1 = await sembrarPresentacion(a, '2.0000');
      const p2 = await sembrarPresentacion(a, '1.0000');
      const pDeBaja = await sembrarPresentacion(a, '1.0000');

      // Produccion: 5 envases de 2 -> stock 10, fecha de hoy, lote automatico.
      const produccion = await recibirPorProduccion(a, receta, p1, 5);
      // Importacion: dos lotes del 2026-09-01, uno con lote alfabeticamente anterior al otro.
      const marca = token();
      const importadoB = await recibirPorImportacion(a, produccion.productId, p1, '6.0000', '2.0000', `${marca}-B`, '2026-09-01');
      const importadoA = await recibirPorImportacion(a, produccion.productId, p1, '4.5000', '2.0000', `${marca}-A`, '2026-09-01');

      // No deben salir: menos de un envase, sin existencia, sin contenido de envase.
      await sembrarLoteDirecto(a, produccion.productId, p1, '1.9999', '2.0000');
      await sembrarLoteDirecto(a, produccion.productId, p1, '0.0000', '2.0000');
      await sembrarLoteDirecto(a, produccion.productId, p1, '8.0000', null);
      // Otra presentacion de la misma receta: solo sale si se pide esa presentacion.
      const terminadoP2 = await sembrarTerminado(a, receta, p2);
      const loteP2 = await sembrarLoteDirecto(a, terminadoP2, p2, '3.0000', '1.0000');
      // Otra receta en la misma presentacion.
      const terminadoOtraReceta = await sembrarTerminado(a, otraReceta, p1);
      await sembrarLoteDirecto(a, terminadoOtraReceta, p1, '8.0000', '2.0000');
      // Producto terminado dado de baja.
      const terminadoDeBaja = await sembrarTerminado(a, receta, pDeBaja, new Date());
      await sembrarLoteDirecto(a, terminadoDeBaja, pDeBaja, '8.0000', '1.0000');
      // Empresa B: su propio terminado con existencia.
      const recetaB = await sembrarReceta(b);
      const pB = await sembrarPresentacion(b, '1.0000');
      const terminadoB = await sembrarTerminado(b, recetaB, pB);
      const loteB = await sembrarLoteDirecto(b, terminadoB, pB, '9.0000', '1.0000');

      const soloP1 = await findDeliverableBatches(receta, [p1], a.companyId);
      expect(soloP1.map((lote) => lote.batchId)).toEqual([importadoA, importadoB, produccion.batchId]);
      expect(soloP1[0]).toEqual({
        batchId: importadoA,
        presentationId: p1,
        lot: `${marca}-A`,
        purchaseDate: '2026-09-01',
        expiryDate: '2027-03-01',
        packageContent: '2.0000',
        availablePackages: 2,
      });
      expect(soloP1.map((lote) => lote.availablePackages)).toEqual([2, 3, 5]);

      const conP2YBaja = await findDeliverableBatches(receta, [p1, p2, pDeBaja], a.companyId);
      expect(conP2YBaja.map((lote) => lote.batchId).sort()).toEqual(
        [importadoA, importadoB, produccion.batchId, loteP2].sort(),
      );
      expect(conP2YBaja.find((lote) => lote.batchId === loteP2)?.presentationId).toBe(p2);
      expect(conP2YBaja.map((lote) => lote.batchId)).not.toContain(loteB);

      // La empresa B no ve la receta de A, y A no ve la de B.
      expect(await findDeliverableBatches(receta, [p1, p2], b.companyId)).toEqual([]);
      expect(await findDeliverableBatches(recetaB, [pB], a.companyId)).toEqual([]);
      expect((await findDeliverableBatches(recetaB, [pB], b.companyId)).map((lote) => lote.batchId)).toEqual([loteB]);
    } finally {
      await limpiar(a);
      await limpiar(b);
    }
  });

  it('R7: sin presentaciones pedidas no consulta y devuelve vacio', async () => {
    expect(await findDeliverableBatches(randomUUID(), [], randomUUID())).toEqual([]);
  });
});
