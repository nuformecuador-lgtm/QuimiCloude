/**
 * Producto terminado de un pedido cuya receta es una version, contra Postgres real.
 *
 * El nombre de la receta sale del catalogo de `recetas` (`findRecipeRefsIncludingDeleted`), el mismo
 * que usa Terminar el empaque (QC-170 movio alli la entrada, que antes daba Finalizar), y la entrada
 * de cada linea del reparto la da `receiveFinishedGoods` dentro de una `prisma.$transaction`
 * que CONFIRMA, como `finished-goods.int.test.ts`: el catalogo lee con el cliente global y no veria
 * filas de una transaccion del test. Cada caso fabrica su empresa con randomUUID y limpia en un
 * `finally` en el orden de las FK: asientos -> lotes -> productos -> lineas de reparto -> pedidos ->
 * version -> original ->
 * presentacion -> unidad; la empresa (usuario, rol, tipo de documento) cae en el `afterAll`.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import { receiveFinishedGoods } from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import { normalizeRecipeName } from '@/lib/modules/recetas';
import { findRecipeRefsIncludingDeleted } from '@/lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma';
import { prisma } from '@/lib/shared/db/prisma';

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

type Company = { readonly companyId: string; readonly userId: string; readonly roleId: string; readonly documentTypeCode: string };

const empresasCreadas: Company[] = [];

async function nuevaEmpresa(): Promise<Company> {
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
  const fixture = { companyId: company.id, userId: user.id, roleId: role.id, documentTypeCode: documentType.code };
  empresasCreadas.push(fixture);
  return fixture;
}

afterAll(async () => {
  for (const fixture of empresasCreadas) {
    await prisma.user.deleteMany({ where: { id: fixture.userId } });
    await prisma.role.deleteMany({ where: { id: fixture.roleId } });
    await prisma.documentType.deleteMany({ where: { code: fixture.documentTypeCode } });
    await prisma.company.deleteMany({ where: { id: fixture.companyId } });
  }
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

async function sembrarPresentacion(companyId: string, unitId: string, nombre: string): Promise<string> {
  const { id } = await prisma.presentation.create({
    data: {
      name: nombre,
      nameNormalized: nombre.toLowerCase().replace(/[^a-z0-9]/gu, ''),
      unitId,
      companyId,
      content: '1',
    },
    select: { id: true },
  });
  return id;
}

async function sembrarReceta(companyId: string, nombre: string, parentRecipeId: string | null = null): Promise<string> {
  const { id } = await prisma.recipe.create({
    data: { name: nombre, nameNormalized: normalizeRecipeName(nombre), companyId, parentRecipeId },
    select: { id: true },
  });
  return id;
}

let sequenceCounter = 1;

async function sembrarPedido(
  companyId: string,
  recipeId: string,
  unitId: string,
  presentationId: string,
): Promise<{ readonly id: string; readonly lineId: string }> {
  const now = new Date();
  const { id } = await prisma.order.create({
    data: {
      orderYear: now.getUTCFullYear(),
      orderSequence: sequenceCounter++,
      recipeId,
      quantity: '10',
      companyId,
      unitId,
      createdAt: now,
    },
    select: { id: true },
  });
  // QC-170: el pedido ya no tiene presentacion unica; se reparte en lineas. Una sola linea de
  // 10 envases de contenido 1 equivale a la presentacion unica de antes.
  const { id: lineId } = await prisma.orderPresentationLine.create({
    data: { orderId: id, companyId, presentationId, packages: 10, presentationContent: '1' },
    select: { id: true },
  });
  return { id, lineId };
}

/** Lo que hace Terminar el empaque por cada linea: nombre del catalogo de recetas y entrada de
 *  producto terminado. */
async function finalizar(
  empresa: Company,
  pedido: { readonly id: string; readonly lineId: string },
  recipeId: string,
  presentationId: string,
) {
  const [ref] = await findRecipeRefsIncludingDeleted([recipeId], empresa.companyId);
  if (ref === undefined) throw new Error('la receta no volvio del catalogo');
  return prisma.$transaction((tx) =>
    receiveFinishedGoods(
      tx,
      {
        orderId: pedido.id,
        recipeId,
        recipeName: ref.name,
        presentationId,
        orderPresentationLineId: pedido.lineId,
        packages: 10,
        orderContent: '1',
        unitCost: '1.0000',
        actorId: empresa.userId,
        now: new Date(),
      },
      { companyId: empresa.companyId },
    ),
  );
}

describe('producto terminado de un pedido con version de receta', () => {
  it('R36: nace un producto distinto del de la original para la misma presentacion, llamado «Original · Version · Presentacion», con su propio stock', async () => {
    const empresa = await nuevaEmpresa();
    const unitId = await sembrarUnidad();
    const presentationId = await sembrarPresentacion(empresa.companyId, unitId, 'Envase 1 L');
    const originalId = await sembrarReceta(empresa.companyId, 'Crema base');
    const versionId = await sembrarReceta(empresa.companyId, 'Sin perfume', originalId);
    const pedidoOriginal = await sembrarPedido(empresa.companyId, originalId, unitId, presentationId);
    const pedidoVersion = await sembrarPedido(empresa.companyId, versionId, unitId, presentationId);
    const pedidoVersionBis = await sembrarPedido(empresa.companyId, versionId, unitId, presentationId);

    try {
      const deLaOriginal = await finalizar(empresa, pedidoOriginal, originalId, presentationId);
      const deLaVersion = await finalizar(empresa, pedidoVersion, versionId, presentationId);
      if (deLaOriginal.kind !== 'received' || deLaVersion.kind !== 'received') {
        throw new Error('esperaba received en los dos');
      }

      expect(deLaVersion.productId).not.toBe(deLaOriginal.productId);
      expect(deLaVersion.productName).toBe('Crema base · Sin perfume · Envase 1 L');
      expect(deLaOriginal.productName).toBe('Crema base · Envase 1 L');

      const producto = await prisma.product.findUniqueOrThrow({ where: { id: deLaVersion.productId } });
      expect(producto.type).toBe('FINISHED_PRODUCT');
      expect(producto.name).toBe('Crema base · Sin perfume · Envase 1 L');
      expect(producto.recipeId).toBe(versionId);
      expect(producto.presentationId).toBe(presentationId);
      expect(producto.stock.toFixed(4)).toBe('10.0000');

      // Un segundo pedido de la misma version suma al mismo producto y no toca el de la original.
      const otraVez = await finalizar(empresa, pedidoVersionBis, versionId, presentationId);
      if (otraVez.kind !== 'received') throw new Error('esperaba received');
      expect(otraVez.productId).toBe(deLaVersion.productId);

      const stocks = await prisma.product.findMany({
        where: { id: { in: [deLaOriginal.productId, deLaVersion.productId] } },
        select: { id: true, stock: true },
      });
      const stockDe = new Map(stocks.map((fila) => [fila.id, fila.stock.toFixed(4)]));
      expect(stockDe.get(deLaVersion.productId)).toBe('20.0000');
      expect(stockDe.get(deLaOriginal.productId)).toBe('10.0000');
    } finally {
      const productos = await prisma.product.findMany({
        where: { recipeId: { in: [originalId, versionId] } },
        select: { id: true },
      });
      const productIds = productos.map((fila) => fila.id);
      await prisma.inventoryMovement.deleteMany({ where: { batch: { productId: { in: productIds } } } });
      await prisma.productBatch.deleteMany({ where: { productId: { in: productIds } } });
      await prisma.product.deleteMany({ where: { id: { in: productIds } } });
      const pedidos = [pedidoOriginal.id, pedidoVersion.id, pedidoVersionBis.id];
      await prisma.orderPresentationLine.deleteMany({ where: { orderId: { in: pedidos } } });
      await prisma.order.deleteMany({ where: { id: { in: pedidos } } });
      await prisma.recipe.deleteMany({ where: { id: versionId } });
      await prisma.recipe.deleteMany({ where: { id: originalId } });
      await prisma.presentation.deleteMany({ where: { id: presentationId } });
      await prisma.unit.deleteMany({ where: { id: unitId } });
    }
  });
});
