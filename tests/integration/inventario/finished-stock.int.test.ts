/**
 * `listStockGroups` contra Postgres real: la pestana de producto terminado, una fila por pedido.
 *
 * AISLAMIENTO: el listado usa el cliente Prisma GLOBAL, asi que lo sembrado tiene que quedar
 * CONFIRMADO. Cada caso crea su empresa efimera, escribe los lotes con `receiveFinishedGoods`
 * -misma ruta que Terminar- y limpia lo suyo en un `finally`.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import { createListFinishedStock } from '@/lib/modules/inventario/domain/list-finished-stock';
import { listStockGroups } from '@/lib/modules/inventario/adapters/driven/persistence/finished-stock-prisma';
import {
  findBatchesOfOrder,
  receiveFinishedGoods,
} from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import { adjustByDelta } from '../../helpers/adjust-by-delta';
import { formatOrderNumber } from '@/lib/modules/pedidos';
import { prisma } from '@/lib/shared/db/prisma';

import type { FinishedStockGroup } from '@/lib/modules/inventario/domain/finished-stock';
import type { InventoryScope } from '@/lib/modules/inventario/domain/inventory-scope';
import type { ListQuery } from '@/lib/modules/inventario/domain/list-query';

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/gu, '');
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
  readonly recipeIds: string[];
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
  return { empresa, scope: { companyId: empresa.companyId }, unitId: unit.id, recipeIds: [], presentationIds: [], orderIds: [] };
}

type Receta = { readonly id: string; readonly name: string };

async function sembrarReceta(fixture: Fixture, nombre: string): Promise<Receta> {
  const { id } = await prisma.recipe.create({
    data: { name: nombre, nameNormalized: normalizar(nombre), companyId: fixture.empresa.companyId },
    select: { id: true },
  });
  fixture.recipeIds.push(id);
  return { id, name: nombre };
}

async function sembrarPresentacion(fixture: Fixture, nombre: string, content: string): Promise<string> {
  const { id } = await prisma.presentation.create({
    data: {
      name: nombre,
      nameNormalized: `${normalizar(nombre)}${token()}`,
      unitId: fixture.unitId,
      companyId: fixture.empresa.companyId,
      content,
    },
    select: { id: true },
  });
  fixture.presentationIds.push(id);
  return id;
}

async function sembrarPedido(fixture: Fixture, receta: Receta, year: number, sequence: number): Promise<string> {
  const { id } = await prisma.order.create({
    data: {
      orderYear: year,
      orderSequence: sequence,
      recipeId: receta.id,
      quantity: '10',
      companyId: fixture.empresa.companyId,
      // El ano del correlativo tiene que ser el de `created_at` (CHECK de la tabla).
      createdAt: new Date(Date.UTC(year, 5, 15)),
    },
    select: { id: true },
  });
  fixture.orderIds.push(id);
  return id;
}

async function recibir(
  fixture: Fixture,
  receta: Receta,
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
        recipeId: receta.id,
        recipeName: receta.name,
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

/** Un lote de producto terminado sin asiento `production`, como los que quedaron de antes. */
async function sembrarLoteSinPedido(fixture: Fixture, productId: string, presentationId: string, stock: string): Promise<string> {
  const { id } = await prisma.productBatch.create({
    data: {
      productId,
      presentationId,
      stock,
      lot: `legado-${token()}`,
      purchaseDate: new Date('2026-01-01T00:00:00.000Z'),
      companyId: fixture.empresa.companyId,
    },
    select: { id: true },
  });
  return id;
}

async function ajustar(fixture: Fixture, batchId: string, delta: string): Promise<void> {
  await adjustByDelta(batchId, delta, 'merma', fixture.empresa.userId, new Date(), fixture.scope);
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
  await prisma.recipe.deleteMany({ where: { id: { in: fixture.recipeIds } } });
  await prisma.presentation.deleteMany({ where: { id: { in: fixture.presentationIds } } });
  await prisma.unit.deleteMany({ where: { id: fixture.unitId } });
}

function consulta(overrides: Partial<ListQuery> = {}): ListQuery {
  return { page: 1, sort: null, filters: {}, search: '', ...overrides };
}

/** Lo que identifica una fila: el pedido o el producto sin pedido. */
function claves(items: readonly FinishedStockGroup[]): string[] {
  return items.map((group) => (group.kind === 'order' ? `order:${group.orderId}` : `product:${group.product.id}`));
}

const listar = createListFinishedStock({
  finishedOrders: { findBatchesOfOrder, listStockGroups },
  orderNumbers: { format: formatOrderNumber },
  log: { ignoredFields: () => undefined },
});

function lector(fixture: Fixture) {
  return { id: fixture.empresa.userId, companyId: fixture.empresa.companyId, permissions: ['inventario.consultar'] };
}

describe('listStockGroups: la pestana de producto terminado por pedido', () => {
  it('un pedido en varias presentaciones es una fila con la existencia en envases de cada una', async () => {
    const fixture = await sembrarFixture();
    try {
      const receta = await sembrarReceta(fixture, `Limpiador ${token()}`);
      const pedido = await sembrarPedido(fixture, receta, 2026, 1);
      await recibir(fixture, receta, pedido, await sembrarPresentacion(fixture, 'Botella 250 ml', '0.25'), 6);
      await recibir(fixture, receta, pedido, await sembrarPresentacion(fixture, 'Botella 1 L', '1'), 1);

      const page = await listar({}, lector(fixture));

      expect(page.total).toBe(1);
      const [fila] = page.items;
      if (fila?.kind !== 'order') throw new Error('esperaba una fila de pedido');
      expect(fila).toMatchObject({
        orderId: pedido,
        orderNumber: { year: 2026, sequence: 1 },
        numberText: formatOrderNumber({ year: 2026, sequence: 1 }),
        recipeName: receta.name,
        packagedStock: [
          { name: 'Botella 1 L', packages: '1', remainder: null, unitId: fixture.unitId },
          { name: 'Botella 250 ml', packages: '6', remainder: null, unitId: fixture.unitId },
        ],
      });
      expect(fila.products.map((linea) => [linea.product.name, linea.stock])).toEqual([
        [`${receta.name} · Botella 1 L`, '1.0000'],
        [`${receta.name} · Botella 250 ml`, '1.5000'],
      ]);
      expect(fila.products[0]?.product).toMatchObject({ type: 'FINISHED_PRODUCT', qtyAlert: null, unitId: fixture.unitId });
    } finally {
      await limpiar(fixture);
    }
  });

  it('dos pedidos de la misma receta son dos filas aunque compartan producto, cada una con su existencia', async () => {
    const fixture = await sembrarFixture();
    try {
      const receta = await sembrarReceta(fixture, `Limpiador ${token()}`);
      const botella = await sembrarPresentacion(fixture, 'Botella 500 ml', '0.5');
      const primero = await sembrarPedido(fixture, receta, 2026, 1);
      const segundo = await sembrarPedido(fixture, receta, 2026, 2);
      const a = await recibir(fixture, receta, primero, botella, 10);
      const b = await recibir(fixture, receta, segundo, botella, 4);
      expect(a.productId).toBe(b.productId);

      const { items } = await listStockGroups(consulta(), fixture.scope);

      expect(claves(items)).toEqual([`order:${segundo}`, `order:${primero}`]);
      expect(items.map((group) => group.batches.map((batch) => batch.stock))).toEqual([['2.0000'], ['5.0000']]);
    } finally {
      await limpiar(fixture);
    }
  });

  it('tras un ajuste el resto va en la unidad de la presentacion, y los envases no pasan de los de la linea', async () => {
    const fixture = await sembrarFixture();
    try {
      const receta = await sembrarReceta(fixture, `Limpiador ${token()}`);
      const pedido = await sembrarPedido(fixture, receta, 2026, 1);
      const { batchId } = await recibir(fixture, receta, pedido, await sembrarPresentacion(fixture, 'Botella 250 ml', '0.25'), 6);
      await ajustar(fixture, batchId, '-0.05');

      const [fila] = (await listar({}, lector(fixture))).items;
      expect(fila?.kind === 'order' ? fila.packagedStock : undefined).toEqual([
        { name: 'Botella 250 ml', packages: '5', remainder: '0.2', unitId: fixture.unitId },
      ]);

      // Aunque el lote creciera por encima de lo pedido, los envases se quedan en los de la linea.
      await prisma.productBatch.update({ where: { id: batchId }, data: { stock: '3.0000' } });
      const [crecida] = (await listar({}, lector(fixture))).items;
      expect(crecida?.kind === 'order' ? crecida.packagedStock : undefined).toEqual([
        { name: 'Botella 250 ml', packages: '6', remainder: '1.5', unitId: fixture.unitId },
      ]);
    } finally {
      await limpiar(fixture);
    }
  });

  it('un pedido con todos sus lotes a cero no sale; sus productos siguen saliendo en el otro pedido', async () => {
    const fixture = await sembrarFixture();
    try {
      const receta = await sembrarReceta(fixture, `Limpiador ${token()}`);
      const botella = await sembrarPresentacion(fixture, 'Botella 500 ml', '0.5');
      const agotado = await sembrarPedido(fixture, receta, 2026, 1);
      const vivo = await sembrarPedido(fixture, receta, 2026, 2);
      const { batchId } = await recibir(fixture, receta, agotado, botella, 2);
      await recibir(fixture, receta, vivo, botella, 2);
      await ajustar(fixture, batchId, '-1');

      const page = await listStockGroups(consulta(), fixture.scope);

      expect(page.total).toBe(1);
      expect(claves(page.items)).toEqual([`order:${vivo}`]);
    } finally {
      await limpiar(fixture);
    }
  });

  it('ordena por (ano, correlativo) descendente y pagina en la base', async () => {
    const fixture = await sembrarFixture();
    try {
      const receta = await sembrarReceta(fixture, `Limpiador ${token()}`);
      const botella = await sembrarPresentacion(fixture, 'Botella 500 ml', '0.5');
      const p2025 = await sembrarPedido(fixture, receta, 2025, 30);
      const p9 = await sembrarPedido(fixture, receta, 2026, 9);
      const p10 = await sembrarPedido(fixture, receta, 2026, 10);
      for (const pedido of [p2025, p9, p10]) await recibir(fixture, receta, pedido, botella, 1);

      const primera = await listStockGroups(consulta({ pageSize: 2 }), fixture.scope);
      const segunda = await listStockGroups(consulta({ page: 2, pageSize: 2 }), fixture.scope);

      expect(claves(primera.items)).toEqual([`order:${p10}`, `order:${p9}`]);
      expect(claves(segunda.items)).toEqual([`order:${p2025}`]);
      expect([primera.total, primera.totalPages, segunda.total]).toEqual([3, 2, 3]);
    } finally {
      await limpiar(fixture);
    }
  });

  it('busca por el numero visible del pedido y por el nombre actual de la receta', async () => {
    const fixture = await sembrarFixture();
    try {
      const desengrasante = await sembrarReceta(fixture, `Desengrasante ${token()}`);
      const jabon = await sembrarReceta(fixture, `Jabón ${token()}`);
      const botella = await sembrarPresentacion(fixture, 'Botella 500 ml', '0.5');
      const p7 = await sembrarPedido(fixture, desengrasante, 2026, 7);
      const p12 = await sembrarPedido(fixture, jabon, 2026, 12);
      await recibir(fixture, desengrasante, p7, botella, 1);
      await recibir(fixture, jabon, p12, botella, 1);
      await prisma.recipe.update({
        where: { id: jabon.id },
        data: { name: 'Jabón líquido renombrado', nameNormalized: normalizar('Jabón líquido renombrado') },
      });

      const porNumero = await listStockGroups(consulta({ search: formatOrderNumber({ year: 2026, sequence: 12 }) }), fixture.scope);
      const porTrozo = await listStockGroups(consulta({ search: '0000007' }), fixture.scope);
      const porReceta = await listStockGroups(consulta({ search: 'JABON LIQUIDO' }), fixture.scope);
      const nada = await listStockGroups(consulta({ search: 'no-existe-xyz' }), fixture.scope);

      expect(claves(porNumero.items)).toEqual([`order:${p12}`]);
      expect(claves(porTrozo.items)).toEqual([`order:${p7}`]);
      expect(claves(porReceta.items)).toEqual([`order:${p12}`]);
      expect(porReceta.items[0]?.kind === 'order' ? porReceta.items[0].recipeName : undefined).toBe('Jabón líquido renombrado');
      expect(nada.total).toBe(0);
    } finally {
      await limpiar(fixture);
    }
  });

  it('los lotes sin asiento production son una fila «Sin pedido» por producto, al final', async () => {
    const fixture = await sembrarFixture();
    try {
      const receta = await sembrarReceta(fixture, `Limpiador ${token()}`);
      const botella = await sembrarPresentacion(fixture, 'Botella 500 ml', '0.5');
      const pedido = await sembrarPedido(fixture, receta, 2026, 1);
      const { productId } = await recibir(fixture, receta, pedido, botella, 2);
      const legado = await sembrarLoteSinPedido(fixture, productId, botella, '0.7500');
      await sembrarLoteSinPedido(fixture, productId, botella, '0.2500');

      const page = await listar({}, lector(fixture));

      expect(page.items.map((fila) => fila.key)).toEqual([`order:${pedido}`, `product:${productId}`]);
      expect(page.items[1]).toMatchObject({ kind: 'withoutOrder', productId, stock: '1.0000', unitId: fixture.unitId });
      expect(page.items[0]?.kind === 'order' ? page.items[0].products[0]?.stock : undefined).toBe('1.0000');

      const lotesSinPedido = await findBatchesOfOrder(null, fixture.scope, productId);
      expect(lotesSinPedido.map((lote) => lote.id)).toContain(legado);
      expect(lotesSinPedido).toHaveLength(2);
      const delPedido = await findBatchesOfOrder(pedido, fixture.scope, productId);
      expect(delPedido).toHaveLength(1);
      expect(await findBatchesOfOrder(pedido, fixture.scope, randomUUID())).toEqual([]);
    } finally {
      await limpiar(fixture);
    }
  });

  it('una empresa no ve las filas de otra, ni buscando su numero', async () => {
    const fixture = await sembrarFixture();
    const ajena = await sembrarFixture();
    try {
      const receta = await sembrarReceta(fixture, `Limpiador ${token()}`);
      const pedido = await sembrarPedido(fixture, receta, 2026, 1);
      await recibir(fixture, receta, pedido, await sembrarPresentacion(fixture, 'Botella 500 ml', '0.5'), 2);

      expect((await listStockGroups(consulta(), fixture.scope)).total).toBe(1);
      expect(await listStockGroups(consulta(), ajena.scope)).toMatchObject({ items: [], total: 0 });
      expect(
        (await listStockGroups(consulta({ search: formatOrderNumber({ year: 2026, sequence: 1 }) }), ajena.scope)).total,
      ).toBe(0);
    } finally {
      await limpiar(fixture);
      await limpiar(ajena);
    }
  });
});
