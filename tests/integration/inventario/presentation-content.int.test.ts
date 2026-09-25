/**
 * El contenido de la presentacion. Adaptador Prisma real: solo la base demuestra que el
 * `CHECK presentations_content_positive` acepta un contenido valido y que cambiarlo no toca
 * ni la copia de un pedido ni el contenido guardado de un lote.
 * Sin transaccion con ROLLBACK, mismo motivo que `presentation-unit.int.test.ts`: cada fila se
 * borra en el `afterAll` por su `id`.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { inventario } from '@/lib/composition';
import type { Actor } from '@/lib/modules/inventario';
import { prisma } from '@/lib/shared/db/prisma';

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

let empresaDelArchivo: string;
let secuenciaPedido = 0;

beforeAll(async () => {
  const nombre = `Empresa presentacion-contenido ${token()}`;
  const { id } = await prisma.company.create({
    data: { name: nombre, nameNormalized: nombre.toLowerCase().replace(/[^a-z0-9]/gu, '') },
    select: { id: true },
  });
  empresaDelArchivo = id;
});

function actorAutorizado(): Actor {
  return { id: randomUUID(), companyId: empresaDelArchivo, permissions: ['inventario.modificar'] };
}

const pedidosSembrados: string[] = [];
const recetasSembradas: string[] = [];
const lotesSembrados: string[] = [];
const productosSembrados: string[] = [];
const presentacionesSembradas: string[] = [];
const unidadesSembradas: string[] = [];

async function sembrarUnidad(): Promise<string> {
  const marca = token();
  const { id } = await prisma.unit.create({
    data: { name: `unidad ${marca}`, nameNormalized: `unidad${marca}`, symbol: `u${marca}` },
    select: { id: true },
  });
  unidadesSembradas.push(id);
  return id;
}

async function sembrarPresentacion(unitId: string, content: string | null): Promise<string> {
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
  presentacionesSembradas.push(id);
  return id;
}

async function sembrarProducto(unitId: string): Promise<string> {
  const marca = token();
  const { id } = await prisma.product.create({
    data: {
      name: `Producto ${marca}`,
      nameNormalized: `producto${marca}`,
      unitId,
      companyId: empresaDelArchivo,
    },
    select: { id: true },
  });
  productosSembrados.push(id);
  return id;
}

/** `packageContent` es el contenido guardado en el lote; aqui se siembra a mano porque la
 *  escritura real (`receiveFinishedGoods`) esta cubierta en su propio archivo de integracion. */
async function sembrarLote(
  productId: string,
  presentationId: string,
  packageContent: string,
): Promise<string> {
  const { id } = await prisma.productBatch.create({
    data: {
      productId,
      presentationId,
      stock: 17,
      unitCost: '123.4500',
      lot: `L-${randomUUID()}`,
      purchaseDate: new Date('2026-09-01T00:00:00Z'),
      companyId: empresaDelArchivo,
      packageContent,
    },
    select: { id: true },
  });
  lotesSembrados.push(id);
  return id;
}

/** La copia del contenido en el pedido se escribe en la creacion del pedido, no aqui: esta
 *  funcion siembra a mano la fila de `orders` con esa copia ya puesta. */
async function sembrarPedido(presentationId: string, presentationContent: string): Promise<string> {
  const recetaMarca = token();
  const { id: recipeId } = await prisma.recipe.create({
    data: {
      name: `Receta ${recetaMarca}`,
      nameNormalized: `receta${recetaMarca}`,
      companyId: empresaDelArchivo,
    },
    select: { id: true },
  });
  recetasSembradas.push(recipeId);

  secuenciaPedido += 1;
  const { id } = await prisma.order.create({
    data: {
      orderYear: 2026,
      orderSequence: secuenciaPedido,
      recipeId,
      quantity: '10.0000',
      companyId: empresaDelArchivo,
      presentationId,
      presentationContent,
    },
    select: { id: true },
  });
  pedidosSembrados.push(id);
  return id;
}

function anotarParaBorrar(id: string): string {
  presentacionesSembradas.push(id);
  return id;
}

afterAll(async () => {
  await prisma.order.deleteMany({ where: { id: { in: pedidosSembrados } } });
  await prisma.recipe.deleteMany({ where: { id: { in: recetasSembradas } } });
  await prisma.inventoryMovement.deleteMany({ where: { batchId: { in: lotesSembrados } } });
  await prisma.productBatch.deleteMany({ where: { id: { in: lotesSembrados } } });
  await prisma.product.deleteMany({ where: { id: { in: productosSembrados } } });
  await prisma.presentation.deleteMany({ where: { id: { in: presentacionesSembradas } } });
  await prisma.unit.deleteMany({ where: { id: { in: unidadesSembradas } } });
  await prisma.company.deleteMany({ where: { id: empresaDelArchivo } });
  await prisma.$disconnect();
});

describe('R6 — el contenido se guarda y se vacia', () => {
  it('el alta guarda el contenido con los 4 decimales de DECIMAL(14,4)', async () => {
    const unitId = await sembrarUnidad();
    const marca = token();

    const creada = await inventario.createPresentation(
      { name: `Botella ${marca}`, unitId, content: '1' },
      actorAutorizado(),
    );
    anotarParaBorrar(creada.id);

    const despues = await prisma.presentation.findUniqueOrThrow({
      where: { id: creada.id },
      select: { content: true },
    });
    expect(despues.content?.toFixed(4)).toBe('1.0000');
  });

  it('la edicion vacia un contenido ya guardado', async () => {
    const unitId = await sembrarUnidad();
    const presentationId = await sembrarPresentacion(unitId, '1.0000');
    const marca = token();

    await inventario.updatePresentation(
      presentationId,
      { name: `Botella editada ${marca}`, unitId },
      actorAutorizado(),
    );

    const despues = await prisma.presentation.findUniqueOrThrow({
      where: { id: presentationId },
      select: { content: true },
    });
    expect(despues.content).toBeNull();
  });
});

describe('R40 — cambiar el contenido se acepta con pedidos o lotes, y no los modifica', () => {
  it('la edicion del contenido no toca la copia del pedido ni el contenido guardado del lote', async () => {
    const unitId = await sembrarUnidad();
    const presentationId = await sembrarPresentacion(unitId, '1.0000');
    const productId = await sembrarProducto(unitId);
    const loteId = await sembrarLote(productId, presentationId, '1.0000');
    const pedidoId = await sembrarPedido(presentationId, '1.0000');
    const marca = token();

    await inventario.updatePresentation(
      presentationId,
      { name: `Botella ${marca}`, unitId, content: '2' },
      actorAutorizado(),
    );

    const presentacionDespues = await prisma.presentation.findUniqueOrThrow({
      where: { id: presentationId },
      select: { content: true },
    });
    expect(presentacionDespues.content?.toFixed(4)).toBe('2.0000');

    const loteDespues = await prisma.productBatch.findUniqueOrThrow({ where: { id: loteId } });
    expect(loteDespues.packageContent?.toFixed(4)).toBe('1.0000');

    const pedidoDespues = await prisma.order.findUniqueOrThrow({ where: { id: pedidoId } });
    expect(pedidoDespues.presentationContent?.toFixed(4)).toBe('1.0000');
  });
});
