/**
 * QC-219 — `createFinishedBatchLabels` contra Postgres real: lee los lotes de produccion de un
 * pedido y escribe su lote, vencimiento y dia de produccion sin tocar existencias ni asientos.
 *
 * AISLAMIENTO: `listOfOrder` lee con el cliente Prisma GLOBAL y `writeForOrder` abre su propia
 * transaccion, asi que lo sembrado tiene que quedar CONFIRMADO. Cada caso crea su empresa efimera,
 * escribe los lotes con `receiveFinishedGoods` -misma ruta que Terminar- y limpia lo suyo en un
 * `finally`. Mismo patron que `order-batches.int.test.ts`.
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { Client } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import { createFinishedBatchLabels } from '@/lib/modules/inventario/adapters/driven/persistence/finished-batch-labels-prisma';
import { receiveFinishedGoods } from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import { prisma } from '@/lib/shared/db/prisma';

import type { FinishedBatchLabel } from '@/lib/modules/inventario';
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

type Recibido = { readonly productId: string; readonly batchId: string; readonly lineId: string };

/** Una linea del reparto y su entrada por Terminar. */
async function recibir(fixture: Fixture, orderId: string, presentationId: string, packages: number): Promise<Recibido> {
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
  return { productId: outcome.productId, batchId: movement.batchId, lineId: line.id };
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

/** El lote entero, menos lo que la escritura debe cambiar, para comparar antes y despues. */
async function loteSinEtiqueta(batchId: string): Promise<Record<string, unknown>> {
  const row = await prisma.productBatch.findUniqueOrThrow({ where: { id: batchId } });
  return {
    id: row.id,
    productId: row.productId,
    presentationId: row.presentationId,
    stock: row.stock.toFixed(4),
    unitCost: row.unitCost?.toFixed(4) ?? null,
    purchaseDate: row.purchaseDate.toISOString(),
    companyId: row.companyId,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    packageContent: row.packageContent?.toFixed(4) ?? null,
  };
}

async function etiqueta(batchId: string): Promise<{ lot: string; expiryDate: string | null; productionDate: string | null }> {
  const row = await prisma.productBatch.findUniqueOrThrow({
    where: { id: batchId },
    select: { lot: true, expiryDate: true, productionDate: true },
  });
  return {
    lot: row.lot,
    expiryDate: row.expiryDate?.toISOString().slice(0, 10) ?? null,
    productionDate: row.productionDate?.toISOString().slice(0, 10) ?? null,
  };
}

async function asientos(companyId: string): Promise<unknown[]> {
  const rows = await prisma.inventoryMovement.findMany({ where: { companyId }, orderBy: { id: 'asc' } });
  return rows.map((row) => ({ ...row, quantity: row.quantity.toFixed(4) }));
}

async function sembrarLoteSinProduccion(fixture: Fixture, productId: string, presentationId: string): Promise<string> {
  const { id } = await prisma.productBatch.create({
    data: {
      productId,
      presentationId,
      stock: new Prisma.Decimal('1'),
      unitCost: new Prisma.Decimal('1'),
      lot: `SP-${token()}`,
      purchaseDate: new Date('2026-10-01T00:00:00.000Z'),
      companyId: fixture.empresa.companyId,
    },
    select: { id: true },
  });
  return id;
}

function label(batchId: string, lot: string): FinishedBatchLabel {
  return { batchId, lot, expiryDate: '2027-04-30', productionDate: '2026-10-01' };
}

const adapter = createFinishedBatchLabels();

describe('QC-219 — writeForOrder escribe los datos de lote', () => {
  it('R6, R19: escribe las tres columnas del lote enviado; no toca existencia, coste, fecha de compra, asientos ni el lote no enviado', async () => {
    const fixture = await sembrarFixture();
    try {
      const pedido = await sembrarPedido(fixture);
      const chica = await recibir(fixture, pedido, await sembrarPresentacion(fixture, 'Botella 250 ml', '0.25'), 6);
      const grande = await recibir(fixture, pedido, await sembrarPresentacion(fixture, 'Garrafa 1 L', '1'), 2);
      const antesChica = await loteSinEtiqueta(chica.batchId);
      const antesGrande = await loteSinEtiqueta(grande.batchId);
      const etiquetaGrande = await etiqueta(grande.batchId);
      const asientosAntes = await asientos(fixture.empresa.companyId);
      const lot = `REAL-${token()}`;
      const ahora = new Date('2026-10-09T15:00:00.000Z');

      const outcome = await adapter.writeForOrder({
        companyId: fixture.empresa.companyId,
        orderId: pedido,
        labels: [label(chica.batchId, lot)],
        actorId: fixture.empresa.userId,
        now: ahora,
      });

      expect(outcome).toEqual({ kind: 'written' });
      expect(await etiqueta(chica.batchId)).toEqual({ lot, expiryDate: '2027-04-30', productionDate: '2026-10-01' });
      expect(await loteSinEtiqueta(chica.batchId)).toEqual(antesChica);
      const autoria = await prisma.productBatch.findUniqueOrThrow({
        where: { id: chica.batchId },
        select: { updatedBy: true, updatedAt: true },
      });
      expect(autoria).toEqual({ updatedBy: fixture.empresa.userId, updatedAt: ahora });
      // La linea no enviada no cambia.
      expect(await loteSinEtiqueta(grande.batchId)).toEqual(antesGrande);
      expect(await etiqueta(grande.batchId)).toEqual(etiquetaGrande);
      // R19: el mismo registro; sus asientos le siguen apuntando y no hay asiento nuevo.
      expect(await asientos(fixture.empresa.companyId)).toEqual(asientosAntes);
      const movement = await prisma.inventoryMovement.findFirstOrThrow({
        where: { orderPresentationLineId: chica.lineId, kind: 'production' },
        select: { batchId: true },
      });
      expect(movement.batchId).toBe(chica.batchId);
    } finally {
      await limpiar(fixture);
    }
  });

  it('R12: batch_not_found para un lote de otro pedido, de otra empresa, sin asiento production o inexistente, sin escribir nada', async () => {
    const fixture = await sembrarFixture();
    const ajena = await sembrarFixture();
    try {
      const botella = await sembrarPresentacion(fixture, 'Botella 500 ml', '0.5');
      const pedido = await sembrarPedido(fixture);
      const otroPedido = await sembrarPedido(fixture);
      const propio = await recibir(fixture, pedido, botella, 4);
      const deOtroPedido = await recibir(fixture, otroPedido, botella, 2);
      const sinProduccion = await sembrarLoteSinProduccion(fixture, propio.productId, botella);
      const pedidoAjeno = await sembrarPedido(ajena);
      const deOtraEmpresa = await recibir(ajena, pedidoAjeno, await sembrarPresentacion(ajena, 'Botella 500 ml', '0.5'), 2);
      const etiquetaPropia = await etiqueta(propio.batchId);

      for (const fueraDelPedido of [deOtroPedido.batchId, sinProduccion, deOtraEmpresa.batchId, randomUUID()]) {
        const outcome = await adapter.writeForOrder({
          companyId: fixture.empresa.companyId,
          orderId: pedido,
          labels: [label(propio.batchId, `OK-${token()}`), label(fueraDelPedido, `X-${token()}`)],
          actorId: fixture.empresa.userId,
          now: new Date(),
        });
        expect(outcome).toEqual({ kind: 'batch_not_found', batchId: fueraDelPedido });
        expect(await etiqueta(propio.batchId), 'ninguna linea se escribe').toEqual(etiquetaPropia);
      }

      // El pedido de otra empresa, pedido con el ambito propio, tampoco encuentra su lote.
      const cruzado = await adapter.writeForOrder({
        companyId: fixture.empresa.companyId,
        orderId: pedidoAjeno,
        labels: [label(deOtraEmpresa.batchId, `X-${token()}`)],
        actorId: fixture.empresa.userId,
        now: new Date(),
      });
      expect(cruzado).toEqual({ kind: 'batch_not_found', batchId: deOtraEmpresa.batchId });
    } finally {
      await limpiar(fixture);
      await limpiar(ajena);
    }
  });

  it('R10: duplicate_lot si el lote ya es de otro lote de la empresa o de otra linea del pedido; no si es el suyo o uno de otra empresa', async () => {
    const fixture = await sembrarFixture();
    const ajena = await sembrarFixture();
    try {
      const pedido = await sembrarPedido(fixture);
      const otroPedido = await sembrarPedido(fixture);
      const chica = await recibir(fixture, pedido, await sembrarPresentacion(fixture, 'Botella 250 ml', '0.25'), 6);
      const grande = await recibir(fixture, pedido, await sembrarPresentacion(fixture, 'Garrafa 1 L', '1'), 2);
      const deOtroPedido = await recibir(fixture, otroPedido, await sembrarPresentacion(fixture, 'Bidon 5 L', '5'), 1);
      const pedidoAjeno = await sembrarPedido(ajena);
      const ajeno = await recibir(ajena, pedidoAjeno, await sembrarPresentacion(ajena, 'Botella 500 ml', '0.5'), 2);
      // Las dos series automaticas empiezan en 1: el lote ajeno se fija para no chocar dentro de
      // la empresa propia por casualidad.
      const loteAjeno = `AJENO-${token()}`;
      expect(
        await adapter.writeForOrder({
          companyId: ajena.empresa.companyId,
          orderId: pedidoAjeno,
          labels: [label(ajeno.batchId, loteAjeno)],
          actorId: ajena.empresa.userId,
          now: new Date(),
        }),
      ).toEqual({ kind: 'written' });
      const loteDeOtroPedido = (await etiqueta(deOtroPedido.batchId)).lot;
      const loteGrande = (await etiqueta(grande.batchId)).lot;
      const loteChica = (await etiqueta(chica.batchId)).lot;
      const base = { companyId: fixture.empresa.companyId, orderId: pedido, actorId: fixture.empresa.userId, now: new Date() };

      expect(await adapter.writeForOrder({ ...base, labels: [label(chica.batchId, loteDeOtroPedido)] })).toEqual({
        kind: 'duplicate_lot',
        batchId: chica.batchId,
      });
      expect(await adapter.writeForOrder({ ...base, labels: [label(chica.batchId, loteGrande)] })).toEqual({
        kind: 'duplicate_lot',
        batchId: chica.batchId,
      });
      // Intercambio en un solo guardado: tambien choca.
      expect(
        await adapter.writeForOrder({ ...base, labels: [label(chica.batchId, loteGrande), label(grande.batchId, loteChica)] }),
      ).toEqual({ kind: 'duplicate_lot', batchId: chica.batchId });
      expect(await etiqueta(chica.batchId), 'ningun rechazo escribio').toMatchObject({ lot: loteChica, productionDate: null });

      // Su propio valor no es choque, ni el de otra empresa.
      expect(await adapter.writeForOrder({ ...base, labels: [label(chica.batchId, loteChica)] })).toEqual({ kind: 'written' });
      expect(await adapter.writeForOrder({ ...base, labels: [label(grande.batchId, loteAjeno)] })).toEqual({ kind: 'written' });
      expect((await etiqueta(grande.batchId)).lot).toBe(loteAjeno);

      // Sensible a mayusculas, como el indice: el mismo texto en otra caja no es choque.
      const enMayusculas = `CASO-${token()}`;
      expect(
        await adapter.writeForOrder({ ...base, orderId: otroPedido, labels: [label(deOtroPedido.batchId, enMayusculas)] }),
      ).toEqual({ kind: 'written' });
      expect(
        await adapter.writeForOrder({ ...base, labels: [label(chica.batchId, enMayusculas.toLowerCase())] }),
      ).toEqual({ kind: 'written' });
      expect(
        await adapter.writeForOrder({ ...base, labels: [label(chica.batchId, enMayusculas)] }),
      ).toEqual({ kind: 'duplicate_lot', batchId: chica.batchId });
    } finally {
      await limpiar(fixture);
      await limpiar(ajena);
    }
  });

  it('R11: dos escrituras simultaneas del mismo lote en dos lotes: una gana y la otra no escribe ninguna de sus lineas', async () => {
    const fixture = await sembrarFixture();
    try {
      const pedidoA = await sembrarPedido(fixture);
      const pedidoB = await sembrarPedido(fixture);
      const a = await recibir(fixture, pedidoA, await sembrarPresentacion(fixture, 'Botella 250 ml', '0.25'), 4);
      const b1 = await recibir(fixture, pedidoB, await sembrarPresentacion(fixture, 'Garrafa 1 L', '1'), 2);
      const b2 = await recibir(fixture, pedidoB, await sembrarPresentacion(fixture, 'Bidon 5 L', '5'), 1);
      const etiquetasAntes = { a: await etiqueta(a.batchId), b1: await etiqueta(b1.batchId), b2: await etiqueta(b2.batchId) };
      const disputado = `CARRERA-${token()}`;
      const base = { companyId: fixture.empresa.companyId, actorId: fixture.empresa.userId, now: new Date() };

      const [deA, deB] = await Promise.all([
        adapter.writeForOrder({ ...base, orderId: pedidoA, labels: [label(a.batchId, disputado)] }),
        adapter.writeForOrder({
          ...base,
          orderId: pedidoB,
          labels: [label(b2.batchId, `SOLO-B-${token()}`), label(b1.batchId, disputado)],
        }),
      ]);

      const kinds = [deA.kind, deB.kind].sort();
      expect(kinds).toEqual(['duplicate_lot', 'written']);
      const conElLote = await prisma.productBatch.findMany({
        where: { companyId: fixture.empresa.companyId, lot: disputado },
        select: { id: true },
      });
      expect(conElLote).toHaveLength(1);
      if (deA.kind === 'written') {
        expect(await etiqueta(b1.batchId)).toEqual(etiquetasAntes.b1);
        expect(await etiqueta(b2.batchId), 'el perdedor no escribe ninguna linea').toEqual(etiquetasAntes.b2);
      } else {
        expect(await etiqueta(a.batchId)).toEqual(etiquetasAntes.a);
      }
    } finally {
      await limpiar(fixture);
    }
  });
});

function connectionString(): string {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (url === undefined || url.trim() === '') {
    throw new Error('falta DATABASE_URL (o DIRECT_URL) en el entorno de la corrida de integracion');
  }
  return url;
}

describe('QC-219 — la carrera la decide el indice unico', () => {
  it('R11: con el lote escrito por otra sesion sin confirmar, la escritura espera, recibe duplicate_lot y no escribe ninguna linea', async () => {
    const fixture = await sembrarFixture();
    const holder = new Client({ connectionString: connectionString() });
    try {
      const pedidoA = await sembrarPedido(fixture);
      const pedidoB = await sembrarPedido(fixture);
      const a = await recibir(fixture, pedidoA, await sembrarPresentacion(fixture, 'Botella 250 ml', '0.25'), 4);
      const b1 = await recibir(fixture, pedidoB, await sembrarPresentacion(fixture, 'Garrafa 1 L', '1'), 2);
      const b2 = await recibir(fixture, pedidoB, await sembrarPresentacion(fixture, 'Bidon 5 L', '5'), 1);
      const antesB1 = await etiqueta(b1.batchId);
      const antesB2 = await etiqueta(b2.batchId);
      const disputado = `CARRERA-${token()}`;

      await holder.connect();
      const holderPid = (await holder.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]?.pid;
      await holder.query('BEGIN');
      await holder.query('UPDATE "product_batches" SET "lot" = $1 WHERE "id" = $2::uuid', [disputado, a.batchId]);

      // El choque previo no ve el lote sin confirmar: solo el indice unico puede detenerla.
      const contendiente = adapter.writeForOrder({
        companyId: fixture.empresa.companyId,
        orderId: pedidoB,
        labels: [label(b2.batchId, `SOLO-B-${token()}`), label(b1.batchId, disputado)],
        actorId: fixture.empresa.userId,
        now: new Date(),
      });

      let bloqueado = false;
      for (let intento = 0; intento < 200 && !bloqueado; intento += 1) {
        const rows = await prisma.$queryRaw<{ n: bigint }[]>`
          SELECT count(*) AS n FROM pg_stat_activity WHERE ${holderPid}::int = ANY(pg_blocking_pids(pid))`;
        bloqueado = Number(rows[0]?.n ?? 0) > 0;
        if (!bloqueado) await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(bloqueado, 'la escritura contendiente debia quedar esperando al indice unico').toBe(true);

      await holder.query('COMMIT');

      expect(await contendiente).toEqual({ kind: 'duplicate_lot', batchId: null });
      expect(await etiqueta(b1.batchId)).toEqual(antesB1);
      expect(await etiqueta(b2.batchId), 'el perdedor no escribe ninguna linea').toEqual(antesB2);
      expect((await etiqueta(a.batchId)).lot).toBe(disputado);
    } finally {
      await holder.end().catch(() => undefined);
      await limpiar(fixture);
    }
  });
});

describe('QC-219 — listOfOrder lee los lotes de produccion del pedido', () => {
  it('R12: una fila por linea con asiento production, con su presentacion y sus datos; ambito de empresa', async () => {
    const fixture = await sembrarFixture();
    const ajena = await sembrarFixture();
    try {
      const pedido = await sembrarPedido(fixture);
      const sinProduccion = await sembrarPedido(fixture);
      const botella = await sembrarPresentacion(fixture, 'Botella 250 ml', '0.25');
      const garrafa = await sembrarPresentacion(fixture, 'Garrafa 1 L', '1');
      const chica = await recibir(fixture, pedido, botella, 6);
      const grande = await recibir(fixture, pedido, garrafa, 2);
      await sembrarLoteSinProduccion(fixture, chica.productId, botella);
      const loteGrande = (await etiqueta(grande.batchId)).lot;
      const lot = `REAL-${token()}`;
      await adapter.writeForOrder({
        companyId: fixture.empresa.companyId,
        orderId: pedido,
        labels: [label(chica.batchId, lot)],
        actorId: fixture.empresa.userId,
        now: new Date(),
      });

      const lineas = await adapter.listOfOrder(fixture.empresa.companyId, pedido);

      const porLote = (x: { batchId: string }, y: { batchId: string }) => x.batchId.localeCompare(y.batchId);
      expect([...lineas].sort(porLote)).toEqual(
        [
          {
            batchId: chica.batchId,
            orderPresentationLineId: chica.lineId,
            presentationId: botella,
            lot,
            expiryDate: '2027-04-30',
            productionDate: '2026-10-01',
          },
          {
            batchId: grande.batchId,
            orderPresentationLineId: grande.lineId,
            presentationId: garrafa,
            lot: loteGrande,
            expiryDate: null,
            productionDate: null,
          },
        ].sort(porLote),
      );
      expect(await adapter.listOfOrder(ajena.empresa.companyId, pedido)).toEqual([]);
      expect(await adapter.listOfOrder(fixture.empresa.companyId, sinProduccion)).toEqual([]);
      expect(await adapter.listOfOrder(fixture.empresa.companyId, randomUUID())).toEqual([]);
    } finally {
      await limpiar(fixture);
      await limpiar(ajena);
    }
  });
});
