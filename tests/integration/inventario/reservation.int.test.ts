/**
 * `createMaterialReservations` (`reservation-prisma.ts`) y `consumeBatchStock`/
 * `adjustBatchStock` (`product-prisma.ts`) contra Postgres real.
 *
 * AISLAMIENTO -- `createWithFirstBatch`, `addBatchToAlive` y `adjustBatchStock` usan el cliente
 * Prisma GLOBAL y abren cada uno SU PROPIA `prisma.$transaction` (mismo criterio que
 * `product-stock.int.test.ts` y `ledger-cuadre.int.test.ts`): envolver la corrida en una
 * transaccion del test seria aislamiento de mentira. Cada caso fabrica su propia empresa
 * efimera con randomUUID, escribe solo en ella y la limpia en un `finally`. El caso que
 * verifica «sin cambiar nada» envuelve SOLO esa llamada en su propia `prisma.$transaction` con
 * una senal de rollback -el mismo patron que usaria el llamante real (`pedidos`) al recibir
 * `insufficient`-, y comprueba el estado con el cliente global despues de deshacerla.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Prisma } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import {
  addBatchToAlive,
  adjustBatchStock,
  consumeBatchStock,
  createWithFirstBatch,
  findBatchesOfAliveProduct,
  listAliveProducts,
} from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import { findBatchMovements } from '@/lib/modules/inventario/adapters/driven/persistence/batch-movement-prisma';
import { createMaterialReservations } from '@/lib/modules/inventario/adapters/driven/persistence/reservation-prisma';
import { prisma } from '@/lib/shared/db/prisma';

import type { InventoryScope } from '@/lib/modules/inventario/domain/inventory-scope';
import type { ListQuery } from '@/lib/modules/inventario/domain/list-query';
import type { NewProductBatch } from '@/lib/modules/inventario/domain/product-batch';
import type { NewProduct } from '@/lib/modules/inventario/domain/product-view';
import type { ReservationRequirementLine } from '@/lib/modules/inventario/domain/reservation';

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

/** Senal de rollback: no es un fallo, es como se deshace la transaccion del caso. */
class RollbackSignal extends Error {
  constructor() {
    super('rollback de aislamiento del caso');
    this.name = 'RollbackSignal';
  }
}

/** `product_batches.created_by`/`updated_by` y `orders.created_by` son FK reales a `users`. */
async function createTestUser(): Promise<{ userId: string; companyId: string }> {
  const marker = token();
  const documentType = await prisma.documentType.create({
    data: { code: `DOC${marker.slice(0, 8)}`, name: 'Tipo de documento de prueba' },
    select: { code: true },
  });
  const role = await prisma.role.create({
    data: { name: `rol-${marker}`, description: 'Rol de prueba' },
    select: { id: true },
  });
  const companyName = `Empresa ${marker}`;
  const company = await prisma.company.create({
    data: { name: companyName, nameNormalized: normalizeCompanyName(companyName) },
    select: { id: true },
  });
  const user = await prisma.user.create({
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

async function deleteTestUser(userId: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { roleId: true, documentTypeCode: true, companyId: true },
  });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.role.delete({ where: { id: user.roleId } });
  await prisma.documentType.delete({ where: { code: user.documentTypeCode } });
  if (user.companyId === null) throw new Error('el usuario de prueba se creo con empresa');
  await prisma.company.delete({ where: { id: user.companyId } });
}

async function unidadDeSistema(nameNormalized: string): Promise<string> {
  const unit = await prisma.unit.findFirstOrThrow({
    where: { nameNormalized, companyId: null },
    select: { id: true },
  });
  return unit.id;
}

async function createTestPresentation(companyId: string, unitId: string): Promise<string> {
  const name = `Bidon ${token()}`;
  const presentation = await prisma.presentation.create({
    data: { name, nameNormalized: normalizeForTest(name), unitId, companyId },
    select: { id: true },
  });
  return presentation.id;
}

type Fixture = {
  readonly actorId: string;
  readonly companyId: string;
  readonly presentationId: string;
  readonly unitId: string;
  readonly recipeId: string;
};

function ambito(fixture: Fixture): InventoryScope {
  return { companyId: fixture.companyId };
}

async function createFixture(): Promise<Fixture> {
  const { userId, companyId } = await createTestUser();
  const unitId = await unidadDeSistema('kilogramo');
  const presentationId = await createTestPresentation(companyId, unitId);
  const recipeName = `Receta ${token()}`;
  const recipe = await prisma.recipe.create({
    data: { name: recipeName, nameNormalized: normalizeForTest(recipeName), companyId, createdBy: userId },
    select: { id: true },
  });
  return { actorId: userId, companyId, presentationId, unitId, recipeId: recipe.id };
}

let orderSequence = 0;

/** Un pedido REAL y minimo: la reserva exige la FK compuesta `(order_id, company_id)` contra
 *  `orders_id_company_id_key`, asi que no vale un uuid escrito a mano. */
async function createOrderRow(fixture: Fixture): Promise<string> {
  orderSequence += 1;
  const order = await prisma.order.create({
    data: {
      orderYear: new Date().getUTCFullYear(),
      orderSequence,
      recipeId: fixture.recipeId,
      quantity: new Prisma.Decimal('1'),
      companyId: fixture.companyId,
      createdBy: fixture.actorId,
      updatedBy: fixture.actorId,
    },
    select: { id: true },
  });
  return order.id;
}

function newProduct(overrides: Partial<NewProduct> = {}): NewProduct {
  return { name: `Producto ${token()}`, ...overrides };
}

function newBatch(
  fixture: Fixture,
  overrides: Partial<NewProductBatch> = {},
): NewProductBatch {
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

async function createProductWithBatch(
  fixture: Fixture,
  batchOverrides: Partial<NewProductBatch> = {},
): Promise<{ productId: string; batchId: string }> {
  const created = await createWithFirstBatch(newProduct(), newBatch(fixture, batchOverrides), new Date(), ambito(fixture));
  return { productId: created.id, batchId: created.batchId };
}

function requirementOf(productId: string, quantity: string): readonly ReservationRequirementLine[] {
  return [{ productId, quantity }];
}

function listQueryOf(): ListQuery {
  return { page: 1, pageSize: 25, sort: null, filters: {}, search: '' };
}

async function batchStockOf(batchId: string): Promise<string> {
  const batch = await prisma.productBatch.findUniqueOrThrow({ where: { id: batchId }, select: { stock: true } });
  return batch.stock.toFixed(4);
}

async function productStockOf(productId: string): Promise<string> {
  const product = await prisma.product.findUniqueOrThrow({ where: { id: productId }, select: { stock: true } });
  return product.stock.toFixed(4);
}

type MovementRow = { readonly batchId: string; readonly kind: string; readonly quantity: string };

async function reservationMovementsOf(orderId: string): Promise<readonly MovementRow[]> {
  const rows = await prisma.reservationMovement.findMany({
    where: { orderId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { batchId: true, kind: true, quantity: true },
  });
  return rows.map((row) => ({ batchId: row.batchId, kind: row.kind, quantity: row.quantity.toFixed(4) }));
}

async function inventoryMovementsOf(batchId: string): Promise<
  readonly { readonly kind: string; readonly quantity: string; readonly orderId: string | null }[]
> {
  const rows = await prisma.inventoryMovement.findMany({
    where: { batchId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { kind: true, quantity: true, orderId: true },
  });
  return rows.map((row) => ({ kind: row.kind, quantity: row.quantity.toFixed(4), orderId: row.orderId }));
}

/** Orden de FK: asientos de los dos libros, pedidos, lotes, productos, receta, presentacion,
 *  usuario. */
async function dropFixture(fixture: Fixture, productIds: readonly string[], orderIds: readonly string[]): Promise<void> {
  await prisma.reservationMovement.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.inventoryMovement.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.order.deleteMany({ where: { id: { in: [...orderIds] } } });
  await prisma.productBatch.deleteMany({ where: { productId: { in: [...productIds] } } });
  await prisma.product.deleteMany({ where: { id: { in: [...productIds] } } });
  await prisma.recipe.delete({ where: { id: fixture.recipeId } });
  await prisma.presentation.delete({ where: { id: fixture.presentationId } });
  await deleteTestUser(fixture.actorId);
}

afterAll(async () => {
  await prisma.$disconnect();
});

// -------------------------------------------------------------------------------------------
// Deteccion estatica: ningun UPDATE/DELETE sobre los dos libros en todo `lib/`.
// -------------------------------------------------------------------------------------------

const RAIZ_REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CARPETAS_IGNORADAS = new Set(['node_modules', '.next', '.git', 'dist', 'coverage']);

function archivosBajoLib(): string[] {
  const encontrados: string[] = [];
  const base = join(RAIZ_REPO, 'lib');

  const recorrer = (directorio: string, relativa: string) => {
    for (const entrada of readdirSync(directorio, { withFileTypes: true })) {
      const completa = join(directorio, entrada.name);
      const relativaHija = relativa === '' ? entrada.name : `${relativa}/${entrada.name}`;
      if (entrada.isDirectory()) {
        if (CARPETAS_IGNORADAS.has(entrada.name)) continue;
        recorrer(completa, relativaHija);
        continue;
      }
      if (entrada.name.endsWith('.ts') || entrada.name.endsWith('.tsx')) {
        encontrados.push(`lib/${relativaHija}`);
      }
    }
  };

  recorrer(base, '');
  return encontrados.sort();
}

function stripComments(fuente: string): string {
  let salida = '';
  let i = 0;
  while (i < fuente.length) {
    const c = fuente[i];
    const siguiente = fuente[i + 1];
    if (c === '/' && siguiente === '/') {
      while (i < fuente.length && fuente[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && siguiente === '*') {
      const fin = fuente.indexOf('*/', i + 2);
      i = fin === -1 ? fuente.length : fin + 2;
      salida += ' ';
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const inicio = i;
      i += 1;
      while (i < fuente.length && fuente[i] !== c) {
        if (fuente[i] === '\\') i += 1;
        i += 1;
      }
      i += 1;
      salida += fuente.slice(inicio, i);
      continue;
    }
    salida += c;
    i += 1;
  }
  return salida;
}

const LIBROS = ['reservationMovement', 'inventoryMovement'] as const;
const TABLAS = { reservationMovement: 'reservation_movements', inventoryMovement: 'inventory_movements' } as const;
const METODOS_PROHIBIDOS = ['update', 'updateMany', 'delete', 'deleteMany'] as const;

/** Los hallazgos de un archivo dado, ya leido: un asiento no se corrige ni se borra, solo se le
 *  asienta encima. */
function hallazgosDe(fuente: string, archivo = 'lib/fabricado.ts'): string[] {
  const codigo = stripComments(fuente);
  const hallazgos: string[] = [];
  for (const libro of LIBROS) {
    for (const metodo of METODOS_PROHIBIDOS) {
      if (new RegExp(`\\.${libro}\\.${metodo}\\s*\\(`).test(codigo)) {
        hallazgos.push(`${archivo}: .${libro}.${metodo}(`);
      }
    }
    const tabla = TABLAS[libro];
    if (new RegExp(`UPDATE\\s+"?${tabla}"?\\s+SET`, 'i').test(codigo)) {
      hallazgos.push(`${archivo}: UPDATE crudo sobre ${tabla}`);
    }
    if (new RegExp(`DELETE\\s+FROM\\s+"?${tabla}"?`, 'i').test(codigo)) {
      hallazgos.push(`${archivo}: DELETE crudo sobre ${tabla}`);
    }
  }
  return hallazgos;
}

function escrituraDestructivaDeLosLibros(): string[] {
  const archivos = archivosBajoLib();
  if (archivos.length < 50) {
    throw new Error(`el recorrido de lib/ encontro ${String(archivos.length)} archivos: revisa la ruta`);
  }
  return archivos.flatMap((archivo) => hallazgosDe(readFileSync(join(RAIZ_REPO, archivo), 'utf8'), archivo));
}

describe('R12 — editar recalcula desde cero, pero solo asienta la DIFERENCIA por lote', () => {
  it('bajar de 10 a 6 deja un reserve de 10 y un release de 4, no dos entradas que se cancelen', async () => {
    const fixture = await createFixture();
    const { productId, batchId } = await createProductWithBatch(fixture, { stock: '20' });
    const orderId = await createOrderRow(fixture);
    const reservations = createMaterialReservations(prisma);

    try {
      const primero = await reservations.syncForOrder({
        orderId,
        companyId: fixture.companyId,
        requirement: requirementOf(productId, '10'),
        actorId: fixture.actorId,
        now: new Date(),
      });
      expect(primero).toEqual({ kind: 'reserved' });

      const segundo = await reservations.syncForOrder({
        orderId,
        companyId: fixture.companyId,
        requirement: requirementOf(productId, '6'),
        actorId: fixture.actorId,
        now: new Date(),
      });
      expect(segundo).toEqual({ kind: 'reserved' });

      const movimientos = await reservationMovementsOf(orderId);
      expect(movimientos).toEqual([
        { batchId, kind: 'reserve', quantity: '10.0000' },
        { batchId, kind: 'release', quantity: '4.0000' },
      ]);
    } finally {
      await dropFixture(fixture, [productId], [orderId]);
    }
  });
});

describe('R13 — si tras editar ya no cubre, libera TODO lo que tenia apartado', () => {
  it('un pedido que ya no cabe en su lote libera su apartado entero', async () => {
    const fixture = await createFixture();
    const { productId, batchId } = await createProductWithBatch(fixture, { stock: '5' });
    const orderId = await createOrderRow(fixture);
    const reservations = createMaterialReservations(prisma);

    try {
      const primero = await reservations.syncForOrder({
        orderId,
        companyId: fixture.companyId,
        requirement: requirementOf(productId, '5'),
        actorId: fixture.actorId,
        now: new Date(),
      });
      expect(primero).toEqual({ kind: 'reserved' });

      // La edicion pide MAS de lo que el unico lote tiene en total: ya no cabe -> insufficient.
      const segundo = await reservations.syncForOrder({
        orderId,
        companyId: fixture.companyId,
        requirement: requirementOf(productId, '999'),
        actorId: fixture.actorId,
        now: new Date(),
      });
      expect(segundo).toEqual({ kind: 'insufficient', productIds: [productId] });

      const movimientos = await reservationMovementsOf(orderId);
      expect(movimientos).toEqual([
        { batchId, kind: 'reserve', quantity: '5.0000' },
        { batchId, kind: 'release', quantity: '5.0000' },
      ]);
    } finally {
      await dropFixture(fixture, [productId], [orderId]);
    }
  });
});

/** Un producto vivo SIN lotes: su unidad queda nula, que es lo que la reserva lee como «no
 *  alcanza». `createWithFirstBatch` siempre crea un lote, asi que se inserta a mano. */
async function createProductWithoutBatches(fixture: Fixture): Promise<string> {
  const name = `Producto ${token()}`;
  const product = await prisma.product.create({
    data: { name, nameNormalized: normalizeForTest(name), companyId: fixture.companyId },
    select: { id: true },
  });
  return product.id;
}

describe('QC-138 — la reserva distingue insufficient de not_reserved', () => {
  it('R1, R5 — disponible insuficiente: insufficient con los productos que faltan, sin apartar nada', async () => {
    const fixture = await createFixture();
    const cubierto = await createProductWithBatch(fixture, { stock: '20' });
    const corto = await createProductWithBatch(fixture, { stock: '3' });
    const orderId = await createOrderRow(fixture);
    const reservations = createMaterialReservations(prisma);

    try {
      const outcome = await reservations.syncForOrder({
        orderId,
        companyId: fixture.companyId,
        requirement: [
          { productId: cubierto.productId, quantity: '5' },
          { productId: corto.productId, quantity: '4' },
        ],
        actorId: fixture.actorId,
        now: new Date(),
      });

      expect(outcome).toEqual({ kind: 'insufficient', productIds: [corto.productId] });
      expect(await reservationMovementsOf(orderId)).toEqual([]);
    } finally {
      await dropFixture(fixture, [cubierto.productId, corto.productId], [orderId]);
    }
  });

  it('R1 — mide contra el disponible: lo apartado por otro pedido no cuenta', async () => {
    const fixture = await createFixture();
    const { productId } = await createProductWithBatch(fixture, { stock: '10' });
    const otro = await createOrderRow(fixture);
    const orderId = await createOrderRow(fixture);
    const reservations = createMaterialReservations(prisma);

    try {
      expect(
        await reservations.syncForOrder({
          orderId: otro,
          companyId: fixture.companyId,
          requirement: requirementOf(productId, '8'),
          actorId: fixture.actorId,
          now: new Date(),
        }),
      ).toEqual({ kind: 'reserved' });

      const outcome = await reservations.syncForOrder({
        orderId,
        companyId: fixture.companyId,
        requirement: requirementOf(productId, '3'),
        actorId: fixture.actorId,
        now: new Date(),
      });

      expect(outcome).toEqual({ kind: 'insufficient', productIds: [productId] });
      expect(await reservationMovementsOf(orderId)).toEqual([]);
    } finally {
      await dropFixture(fixture, [productId], [otro, orderId]);
    }
  });

  it('R1 — en la edicion, lo apartado por el propio pedido cuenta como disponible', async () => {
    const fixture = await createFixture();
    const { productId, batchId } = await createProductWithBatch(fixture, { stock: '10' });
    const orderId = await createOrderRow(fixture);
    const otro = await createOrderRow(fixture);
    const reservations = createMaterialReservations(prisma);

    try {
      expect(
        await reservations.syncForOrder({
          orderId,
          companyId: fixture.companyId,
          requirement: requirementOf(productId, '6'),
          actorId: fixture.actorId,
          now: new Date(),
        }),
      ).toEqual({ kind: 'reserved' });
      expect(
        await reservations.syncForOrder({
          orderId: otro,
          companyId: fixture.companyId,
          requirement: requirementOf(productId, '4'),
          actorId: fixture.actorId,
          now: new Date(),
        }),
      ).toEqual({ kind: 'reserved' });

      // El lote ya no tiene disponible para nadie mas, pero los 6 del pedido siguen siendo suyos.
      const edicion = await reservations.syncForOrder({
        orderId,
        companyId: fixture.companyId,
        requirement: requirementOf(productId, '6'),
        actorId: fixture.actorId,
        now: new Date(),
      });

      expect(edicion).toEqual({ kind: 'reserved' });
      expect(await reservationMovementsOf(orderId)).toEqual([{ batchId, kind: 'reserve', quantity: '6.0000' }]);
    } finally {
      await dropFixture(fixture, [productId], [orderId, otro]);
    }
  });

  it('R2 — una receta sin lineas devuelve not_reserved y no escribe nada', async () => {
    const fixture = await createFixture();
    const orderId = await createOrderRow(fixture);
    const reservations = createMaterialReservations(prisma);

    try {
      const outcome = await reservations.syncForOrder({
        orderId,
        companyId: fixture.companyId,
        requirement: [],
        actorId: fixture.actorId,
        now: new Date(),
      });

      expect(outcome).toEqual({ kind: 'not_reserved' });
      expect(await reservationMovementsOf(orderId)).toEqual([]);
    } finally {
      await dropFixture(fixture, [], [orderId]);
    }
  });

  it('R4 — un producto sin lotes, y por tanto sin unidad, cuenta como insufficient', async () => {
    const fixture = await createFixture();
    const sinLotes = await createProductWithoutBatches(fixture);
    const orderId = await createOrderRow(fixture);
    const reservations = createMaterialReservations(prisma);

    try {
      const outcome = await reservations.syncForOrder({
        orderId,
        companyId: fixture.companyId,
        requirement: requirementOf(sinLotes, '1'),
        actorId: fixture.actorId,
        now: new Date(),
      });

      expect(outcome).toEqual({ kind: 'insufficient', productIds: [sinLotes] });
      expect(await reservationMovementsOf(orderId)).toEqual([]);
    } finally {
      await dropFixture(fixture, [sinLotes], [orderId]);
    }
  });

  it('R5 — un pedido con material apartado que deja de alcanzar lo libera todo', async () => {
    const fixture = await createFixture();
    const { productId, batchId } = await createProductWithBatch(fixture, { stock: '5' });
    const sinLotes = await createProductWithoutBatches(fixture);
    const orderId = await createOrderRow(fixture);
    const reservations = createMaterialReservations(prisma);

    try {
      await reservations.syncForOrder({
        orderId,
        companyId: fixture.companyId,
        requirement: requirementOf(productId, '5'),
        actorId: fixture.actorId,
        now: new Date(),
      });

      // La edicion sigue pidiendo lo mismo del producto con lote, pero suma uno sin lotes.
      const outcome = await reservations.syncForOrder({
        orderId,
        companyId: fixture.companyId,
        requirement: [
          { productId, quantity: '5' },
          { productId: sinLotes, quantity: '1' },
        ],
        actorId: fixture.actorId,
        now: new Date(),
      });

      expect(outcome).toEqual({ kind: 'insufficient', productIds: [sinLotes] });
      expect(await reservationMovementsOf(orderId)).toEqual([
        { batchId, kind: 'reserve', quantity: '5.0000' },
        { batchId, kind: 'release', quantity: '5.0000' },
      ]);
    } finally {
      await dropFixture(fixture, [productId, sinLotes], [orderId]);
    }
  });
});

describe('R17 — ningun asiento de reserva puede apuntar a un pedido de otra empresa', () => {
  it('la FK compuesta (order_id, company_id) rechaza un pedido ajeno', async () => {
    const fixtureA = await createFixture();
    const fixtureB = await createFixture();
    const { productId, batchId } = await createProductWithBatch(fixtureA, { stock: '5' });
    const orderDeB = await createOrderRow(fixtureB);

    try {
      await expect(
        prisma.reservationMovement.create({
          data: {
            companyId: fixtureA.companyId,
            orderId: orderDeB,
            batchId,
            kind: 'reserve',
            quantity: new Prisma.Decimal('1'),
            createdBy: fixtureA.actorId,
          },
        }),
      ).rejects.toMatchObject({ code: expect.any(String) });

      expect(await reservationMovementsOf(orderDeB)).toEqual([]);
    } finally {
      await dropFixture(fixtureA, [productId], []);
      await dropFixture(fixtureB, [], [orderDeB]);
    }
  });
});

describe('R27, R28 — entregar consume: baja el lote, asienta la salida y recalcula products.stock', () => {
  it('consumeForOrder baja el lote apartado, asienta consumption y consume, y recalcula el producto', async () => {
    const fixture = await createFixture();
    const { productId, batchId } = await createProductWithBatch(fixture, { stock: '10' });
    const orderId = await createOrderRow(fixture);
    const reservations = createMaterialReservations(prisma);

    try {
      await reservations.syncForOrder({
        orderId,
        companyId: fixture.companyId,
        requirement: requirementOf(productId, '4'),
        actorId: fixture.actorId,
        now: new Date(),
      });

      const resultado = await reservations.consumeForOrder({
        orderId,
        companyId: fixture.companyId,
        fallbackRequirement: [],
        actorId: fixture.actorId,
        now: new Date(),
      });
      expect(resultado).toEqual({ kind: 'consumed' });

      expect(await batchStockOf(batchId)).toBe('6.0000');
      expect(await productStockOf(productId)).toBe('6.0000');

      const asientos = await inventoryMovementsOf(batchId);
      expect(asientos.at(-1)).toEqual({ kind: 'consumption', quantity: '-4.0000', orderId });

      const reservaciones = await reservationMovementsOf(orderId);
      expect(reservaciones).toEqual([
        { batchId, kind: 'reserve', quantity: '4.0000' },
        { batchId, kind: 'consume', quantity: '4.0000' },
      ]);
    } finally {
      await dropFixture(fixture, [productId], [orderId]);
    }
  });
});

describe('QC-195 R25, R26 — consumeForOrder por subconjunto de productos', () => {
  it('R26 — con productIds solo consume lo apartado de esos productos y deja intacto lo demas del pedido', async () => {
    const fixture = await createFixture();
    const a = await createProductWithBatch(fixture, { stock: '10' });
    const b = await createProductWithBatch(fixture, { stock: '10' });
    const orderId = await createOrderRow(fixture);
    const reservations = createMaterialReservations(prisma);

    try {
      await reservations.syncForOrder({
        orderId,
        companyId: fixture.companyId,
        requirement: [
          { productId: a.productId, quantity: '4' },
          { productId: b.productId, quantity: '3' },
        ],
        actorId: fixture.actorId,
        now: new Date(),
      });

      const resultado = await reservations.consumeForOrder({
        orderId,
        companyId: fixture.companyId,
        fallbackRequirement: [{ productId: a.productId, quantity: '4' }],
        productIds: [a.productId],
        actorId: fixture.actorId,
        now: new Date(),
      });
      expect(resultado).toEqual({ kind: 'consumed' });

      expect(await batchStockOf(a.batchId)).toBe('6.0000');
      expect(await productStockOf(a.productId)).toBe('6.0000');
      expect(await batchStockOf(b.batchId)).toBe('10.0000');
      expect(await productStockOf(b.productId)).toBe('10.0000');
      expect(await inventoryMovementsOf(b.batchId)).toEqual([expect.objectContaining({ kind: 'opening' })]);

      const libro = await reservationMovementsOf(orderId);
      expect(libro.filter((row) => row.batchId === b.batchId)).toEqual([
        { batchId: b.batchId, kind: 'reserve', quantity: '3.0000' },
      ]);
      expect(libro.filter((row) => row.batchId === a.batchId)).toEqual([
        { batchId: a.batchId, kind: 'reserve', quantity: '4.0000' },
        { batchId: a.batchId, kind: 'consume', quantity: '4.0000' },
      ]);
    } finally {
      await dropFixture(fixture, [a.productId, b.productId], [orderId]);
    }
  });

  it('R25 — sin nada apartado de esos productos, el respaldo se filtra a productIds y no toca lo apartado de los demas', async () => {
    const fixture = await createFixture();
    const a = await createProductWithBatch(fixture, { stock: '10' });
    const b = await createProductWithBatch(fixture, { stock: '10' });
    const orderId = await createOrderRow(fixture);
    const reservations = createMaterialReservations(prisma);

    try {
      await reservations.syncForOrder({
        orderId,
        companyId: fixture.companyId,
        requirement: requirementOf(a.productId, '4'),
        actorId: fixture.actorId,
        now: new Date(),
      });

      const resultado = await reservations.consumeForOrder({
        orderId,
        companyId: fixture.companyId,
        fallbackRequirement: [
          { productId: a.productId, quantity: '4' },
          { productId: b.productId, quantity: '3' },
        ],
        productIds: [b.productId],
        actorId: fixture.actorId,
        now: new Date(),
      });
      expect(resultado).toEqual({ kind: 'consumed' });

      expect(await batchStockOf(b.batchId)).toBe('7.0000');
      expect(await batchStockOf(a.batchId)).toBe('10.0000');
      expect(await reservationMovementsOf(orderId)).toEqual([
        { batchId: a.batchId, kind: 'reserve', quantity: '4.0000' },
      ]);
    } finally {
      await dropFixture(fixture, [a.productId, b.productId], [orderId]);
    }
  });

  it('R25 — con productIds y respaldo que no alcanza devuelve insufficient sin consumir lo de los demas', async () => {
    const fixture = await createFixture();
    const a = await createProductWithBatch(fixture, { stock: '10' });
    const b = await createProductWithBatch(fixture, { stock: '2' });
    const orderId = await createOrderRow(fixture);
    const reservations = createMaterialReservations(prisma);

    try {
      await reservations.syncForOrder({
        orderId,
        companyId: fixture.companyId,
        requirement: requirementOf(a.productId, '4'),
        actorId: fixture.actorId,
        now: new Date(),
      });

      const resultado = await reservations.consumeForOrder({
        orderId,
        companyId: fixture.companyId,
        fallbackRequirement: [{ productId: b.productId, quantity: '3' }],
        productIds: [b.productId],
        actorId: fixture.actorId,
        now: new Date(),
      });
      expect(resultado).toEqual({ kind: 'insufficient', productIds: [b.productId] });
      expect(await batchStockOf(a.batchId)).toBe('10.0000');
      expect(await batchStockOf(b.batchId)).toBe('2.0000');
    } finally {
      await dropFixture(fixture, [a.productId, b.productId], [orderId]);
    }
  });
});

describe('R32 — el sistema no consume dos veces el material de un mismo pedido', () => {
  it('una segunda llamada de entrega, sin nada que respaldarla, no vuelve a tocar el lote', async () => {
    const fixture = await createFixture();
    const { productId, batchId } = await createProductWithBatch(fixture, { stock: '10' });
    const orderId = await createOrderRow(fixture);
    const reservations = createMaterialReservations(prisma);

    try {
      await reservations.syncForOrder({
        orderId,
        companyId: fixture.companyId,
        requirement: requirementOf(productId, '4'),
        actorId: fixture.actorId,
        now: new Date(),
      });
      await reservations.consumeForOrder({
        orderId,
        companyId: fixture.companyId,
        fallbackRequirement: [],
        actorId: fixture.actorId,
        now: new Date(),
      });

      const stockTrasPrimeraEntrega = await batchStockOf(batchId);
      const asientosTrasPrimeraEntrega = await inventoryMovementsOf(batchId);

      // Segunda entrega del MISMO pedido: ya no tiene nada apartado, y sin necesidad de
      // respaldo no hay nada que consumir.
      const segunda = await reservations.consumeForOrder({
        orderId,
        companyId: fixture.companyId,
        fallbackRequirement: [],
        actorId: fixture.actorId,
        now: new Date(),
      });
      expect(segunda).toEqual({ kind: 'nothing_to_consume' });

      expect(await batchStockOf(batchId)).toBe(stockTrasPrimeraEntrega);
      expect(await inventoryMovementsOf(batchId)).toEqual(asientosTrasPrimeraEntrega);
    } finally {
      await dropFixture(fixture, [productId], [orderId]);
    }
  });
});

describe('R50 — entregar sin apartado y sin necesidad de respaldo no consume nada', () => {
  it('un pedido sin nada apartado y con la receta sin lineas devuelve nothing_to_consume sin escribir nada', async () => {
    const fixture = await createFixture();
    const { productId, batchId } = await createProductWithBatch(fixture, { stock: '10' });
    const orderId = await createOrderRow(fixture);
    const reservations = createMaterialReservations(prisma);

    try {
      const resultado = await reservations.consumeForOrder({
        orderId,
        companyId: fixture.companyId,
        fallbackRequirement: [],
        actorId: fixture.actorId,
        now: new Date(),
      });
      expect(resultado).toEqual({ kind: 'nothing_to_consume' });

      expect(await batchStockOf(batchId)).toBe('10.0000');
      expect(await productStockOf(productId)).toBe('10.0000');
      expect(await reservationMovementsOf(orderId)).toEqual([]);
      expect(await inventoryMovementsOf(batchId)).toEqual([expect.objectContaining({ kind: 'opening' })]);
    } finally {
      await dropFixture(fixture, [productId], [orderId]);
    }
  });
});

describe('R30 — una merma sobre el lote apartado completa desde otros lotes con disponible', () => {
  it('lo que falte en el lote apartado se cubre del siguiente lote mas antiguo con disponible', async () => {
    const fixture = await createFixture();
    const { productId, batchId: batchIdViejo } = await createProductWithBatch(fixture, {
      stock: '10',
      purchaseDate: '2026-01-01',
    });
    const agregado = await addBatchToAlive(
      productId,
      newBatch(fixture, { stock: '10', purchaseDate: '2026-06-01' }),
      new Date(),
      ambito(fixture),
    );
    if (agregado === null || agregado === 'finished_product') {
      throw new Error('el producto deberia seguir vivo');
    }
    const batchIdNuevo = agregado.batchId;

    const orderId = await createOrderRow(fixture);
    const reservations = createMaterialReservations(prisma);

    try {
      // Reparte 8 en el lote mas antiguo: el unico con disponible en ese momento.
      await reservations.syncForOrder({
        orderId,
        companyId: fixture.companyId,
        requirement: requirementOf(productId, '8'),
        actorId: fixture.actorId,
        now: new Date(),
      });
      expect(await reservationMovementsOf(orderId)).toEqual([{ batchId: batchIdViejo, kind: 'reserve', quantity: '8.0000' }]);

      // Merma: el lote viejo pierde 5 -queda sobre-reservado, con solo 5 de verdad para los 8 apartados-.
      await adjustBatchStock(batchIdViejo, '-5', 'merma', fixture.actorId, new Date(), ambito(fixture));
      expect(await batchStockOf(batchIdViejo)).toBe('5.0000');

      const resultado = await reservations.consumeForOrder({
        orderId,
        companyId: fixture.companyId,
        fallbackRequirement: [],
        actorId: fixture.actorId,
        now: new Date(),
      });
      expect(resultado).toEqual({ kind: 'consumed' });

      // El lote viejo da lo que tiene (5) y queda en 0; el nuevo completa el resto (3).
      expect(await batchStockOf(batchIdViejo)).toBe('0.0000');
      expect(await batchStockOf(batchIdNuevo)).toBe('7.0000');
      expect(await productStockOf(productId)).toBe('7.0000');

      const asientosViejo = await inventoryMovementsOf(batchIdViejo);
      expect(asientosViejo.at(-1)).toEqual({ kind: 'consumption', quantity: '-5.0000', orderId });
      const asientosNuevo = await inventoryMovementsOf(batchIdNuevo);
      expect(asientosNuevo.at(-1)).toEqual({ kind: 'consumption', quantity: '-3.0000', orderId });

      // El apartado del pedido en el lote viejo queda resuelto por lo que TENIA reservado (8),
      // sin importar que solo diera 5 de verdad; el lote nuevo no tenia nada apartado, asi que
      // no gana ninguna entrada en el libro de reservas.
      const reservaciones = await reservationMovementsOf(orderId);
      expect(reservaciones).toEqual([
        { batchId: batchIdViejo, kind: 'reserve', quantity: '8.0000' },
        { batchId: batchIdViejo, kind: 'consume', quantity: '8.0000' },
      ]);
    } finally {
      await dropFixture(fixture, [productId], [orderId]);
    }
  });

  it('SI NI ASI ALCANZA, rechaza la entrega con insufficient sin cambiar el pedido ni el inventario', async () => {
    const fixture = await createFixture();
    const { productId, batchId } = await createProductWithBatch(fixture, { stock: '10' });
    const orderId = await createOrderRow(fixture);
    const reservations = createMaterialReservations(prisma);

    try {
      await reservations.syncForOrder({
        orderId,
        companyId: fixture.companyId,
        requirement: requirementOf(productId, '10'),
        actorId: fixture.actorId,
        now: new Date(),
      });

      // Merma total: el UNICO lote se queda sin nada, y no hay ningun otro lote del producto.
      await adjustBatchStock(batchId, '-10', 'merma', fixture.actorId, new Date(), ambito(fixture));
      expect(await batchStockOf(batchId)).toBe('0.0000');

      const movimientosAntes = await reservationMovementsOf(orderId);
      const asientosAntes = await inventoryMovementsOf(batchId);

      // La transaccion la abriria `pedidos` en produccion; aqui se simula ese contorno para
      // demostrar que, si el llamante aborta ante `insufficient`, no queda NADA escrito.
      let resultado: unknown;
      try {
        await prisma.$transaction(async (tx) => {
          resultado = await createMaterialReservations(tx).consumeForOrder({
            orderId,
            companyId: fixture.companyId,
            fallbackRequirement: [],
            actorId: fixture.actorId,
            now: new Date(),
          });
          throw new RollbackSignal();
        });
      } catch (error) {
        if (!(error instanceof RollbackSignal)) throw error;
      }

      expect(resultado).toEqual({ kind: 'insufficient', productIds: [productId] });
      expect(await batchStockOf(batchId)).toBe('0.0000');
      expect(await reservationMovementsOf(orderId)).toEqual(movimientosAntes);
      expect(await inventoryMovementsOf(batchId)).toEqual(asientosAntes);
    } finally {
      await dropFixture(fixture, [productId], [orderId]);
    }
  });
});

describe('R33 — un ajuste que deja el apartado por encima de la existencia se acepta y se marca', () => {
  it('adjustBatchStock devuelve overReserved cuando la merma deja el lote por debajo de lo apartado', async () => {
    const fixture = await createFixture();
    const { productId, batchId } = await createProductWithBatch(fixture, { stock: '10' });
    const orderId = await createOrderRow(fixture);
    const reservations = createMaterialReservations(prisma);

    try {
      await reservations.syncForOrder({
        orderId,
        companyId: fixture.companyId,
        requirement: requirementOf(productId, '8'),
        actorId: fixture.actorId,
        now: new Date(),
      });

      const ajuste = await adjustBatchStock(batchId, '-5', 'merma', fixture.actorId, new Date(), ambito(fixture));
      expect(ajuste).toEqual({ stock: '5.0000', reserved: '8.0000', overReserved: true });
    } finally {
      await dropFixture(fixture, [productId], [orderId]);
    }
  });
});

describe('R34, R37 — el lote sobre-reservado se marca, con su apartado y su disponible', () => {
  it('findBatchesOfAliveProduct trae reserved/available/overReserved de un lote sano y de uno sobre-reservado', async () => {
    const fixture = await createFixture();
    const { productId, batchId } = await createProductWithBatch(fixture, { stock: '10' });
    const orderId = await createOrderRow(fixture);
    const reservations = createMaterialReservations(prisma);

    try {
      await reservations.syncForOrder({
        orderId,
        companyId: fixture.companyId,
        requirement: requirementOf(productId, '8'),
        actorId: fixture.actorId,
        now: new Date(),
      });

      const sano = await findBatchesOfAliveProduct(productId, ambito(fixture));
      expect(sano).toEqual([
        expect.objectContaining({ id: batchId, reserved: '8.0000', available: '2.0000', overReserved: false }),
      ]);

      // La merma deja el apartado (8) por encima de la existencia nueva (5): sobre-reservado.
      await adjustBatchStock(batchId, '-5', 'merma', fixture.actorId, new Date(), ambito(fixture));

      const sobreReservado = await findBatchesOfAliveProduct(productId, ambito(fixture));
      expect(sobreReservado).toEqual([
        expect.objectContaining({ id: batchId, reserved: '8.0000', available: '0.0000', overReserved: true }),
      ]);
    } finally {
      await dropFixture(fixture, [productId], [orderId]);
    }
  });
});

describe('R36 — por producto: total, reservado y disponible, incluido el caso sobre-reservado', () => {
  it('total = reservado + disponible mientras nada este sobre-reservado', async () => {
    const fixture = await createFixture();
    const { productId } = await createProductWithBatch(fixture, { stock: '10' });
    const orderId = await createOrderRow(fixture);
    const reservations = createMaterialReservations(prisma);

    try {
      await reservations.syncForOrder({
        orderId,
        companyId: fixture.companyId,
        requirement: requirementOf(productId, '6'),
        actorId: fixture.actorId,
        now: new Date(),
      });

      const pagina = await listAliveProducts(listQueryOf(), ambito(fixture));
      const vista = pagina.items.find((item) => item.id === productId);
      expect(vista).toEqual(expect.objectContaining({ stock: '10.0000', reserved: '6.0000', available: '4.0000' }));
    } finally {
      await dropFixture(fixture, [productId], [orderId]);
    }
  });

  it('con un lote sobre-reservado, total NO es igual a reservado + disponible', async () => {
    const fixture = await createFixture();
    const { productId, batchId } = await createProductWithBatch(fixture, { stock: '10' });
    const orderId = await createOrderRow(fixture);
    const reservations = createMaterialReservations(prisma);

    try {
      await reservations.syncForOrder({
        orderId,
        companyId: fixture.companyId,
        requirement: requirementOf(productId, '8'),
        actorId: fixture.actorId,
        now: new Date(),
      });
      await adjustBatchStock(batchId, '-5', 'merma', fixture.actorId, new Date(), ambito(fixture));

      const pagina = await listAliveProducts(listQueryOf(), ambito(fixture));
      const vista = pagina.items.find((item) => item.id === productId);
      // total 5, reservado 8 (por encima de lo que hay), disponible 0: 5 != 8 + 0.
      expect(vista).toEqual(expect.objectContaining({ stock: '5.0000', reserved: '8.0000', available: '0.0000' }));
    } finally {
      await dropFixture(fixture, [productId], [orderId]);
    }
  });
});

describe('R38 — el historial de un lote une los dos libros, del mas reciente al mas antiguo', () => {
  it('intercala apartados, liberaciones y consumos con el alta y el ajuste, con el pedido crudo en orderNumberText', async () => {
    const fixture = await createFixture();
    const { productId, batchId } = await createProductWithBatch(fixture, { stock: '10' });
    const orderId = await createOrderRow(fixture);
    const reservations = createMaterialReservations(prisma);

    try {
      await reservations.syncForOrder({
        orderId,
        companyId: fixture.companyId,
        requirement: requirementOf(productId, '4'),
        actorId: fixture.actorId,
        now: new Date(),
      });
      await adjustBatchStock(batchId, '-1', 'merma', fixture.actorId, new Date(), ambito(fixture));
      await reservations.releaseForOrder({
        orderId,
        companyId: fixture.companyId,
        reason: 'release',
        actorId: fixture.actorId,
        now: new Date(),
      });

      const historial = await findBatchMovements(batchId, ambito(fixture));
      expect(historial, 'el lote deberia existir').not.toBeNull();
      const kinds = (historial ?? []).map((entry) => entry.kind);
      // Del mas reciente al mas antiguo: release, adjustment (la merma), reserve, opening (el alta).
      expect(kinds).toEqual(['release', 'adjustment', 'reserve', 'opening']);
      // Cada asiento trae el id de su propia fila, no el de otro libro.
      expect(new Set((historial ?? []).map((entry) => entry.id)).size).toBe((historial ?? []).length);

      const reserva = (historial ?? []).find((entry) => entry.kind === 'reserve');
      expect(reserva).toEqual(
        expect.objectContaining({ quantity: '4.0000', orderNumberText: orderId, authorName: fixture.actorId }),
      );
      const alta = (historial ?? []).find((entry) => entry.kind === 'opening');
      expect(alta).toEqual(expect.objectContaining({ orderNumberText: null, reason: null }));
    } finally {
      await dropFixture(fixture, [productId], [orderId]);
    }
  });
});

describe('R42 — el historial y lo reservado de un lote de otra empresa responden como inexistente', () => {
  it('findBatchMovements devuelve null para un lote de otra empresa', async () => {
    const fixtureA = await createFixture();
    const fixtureB = await createFixture();
    const { productId, batchId } = await createProductWithBatch(fixtureA, { stock: '10' });

    try {
      expect(await findBatchMovements(batchId, ambito(fixtureB))).toBeNull();
      expect(await findBatchMovements(batchId, ambito(fixtureA))).not.toBeNull();
    } finally {
      await dropFixture(fixtureA, [productId], []);
      await dropFixture(fixtureB, [], []);
    }
  });

  it('findBatchesOfAliveProduct de otra empresa no devuelve el lote ajeno', async () => {
    const fixtureA = await createFixture();
    const fixtureB = await createFixture();
    const { productId } = await createProductWithBatch(fixtureA, { stock: '10' });

    try {
      expect(await findBatchesOfAliveProduct(productId, ambito(fixtureB))).toEqual([]);
    } finally {
      await dropFixture(fixtureA, [productId], []);
      await dropFixture(fixtureB, [], []);
    }
  });
});

describe('R39 — el libro append-only: ningun UPDATE ni DELETE en lib/** sobre los dos libros', () => {
  it('ni reservation_movements ni inventory_movements se corrigen nunca en produccion, solo se les asienta encima', () => {
    const hallazgos = escrituraDestructivaDeLosLibros();
    expect(hallazgos, `hallazgos: ${JSON.stringify(hallazgos, null, 2)}`).toEqual([]);
  });

  it('el detector muerde sobre fuentes fabricadas con cada forma prohibida', () => {
    expect(hallazgosDe('await tx.reservationMovement.update({ where, data: {} });')).toEqual([
      'lib/fabricado.ts: .reservationMovement.update(',
    ]);
    expect(hallazgosDe('await tx.reservationMovement.updateMany({ where, data: {} });')).toEqual([
      'lib/fabricado.ts: .reservationMovement.updateMany(',
    ]);
    expect(hallazgosDe('await tx.reservationMovement.delete({ where });')).toEqual([
      'lib/fabricado.ts: .reservationMovement.delete(',
    ]);
    expect(hallazgosDe('await tx.reservationMovement.deleteMany({ where });')).toEqual([
      'lib/fabricado.ts: .reservationMovement.deleteMany(',
    ]);
    expect(hallazgosDe('await tx.inventoryMovement.update({ where, data: {} });')).toEqual([
      'lib/fabricado.ts: .inventoryMovement.update(',
    ]);
    expect(hallazgosDe('await tx.$executeRaw`UPDATE "reservation_movements" SET quantity = 0`;')).toEqual([
      'lib/fabricado.ts: UPDATE crudo sobre reservation_movements',
    ]);
    expect(hallazgosDe('await tx.$executeRaw`DELETE FROM "inventory_movements" WHERE id = ${id}`;')).toEqual([
      'lib/fabricado.ts: DELETE crudo sobre inventory_movements',
    ]);
    // `create` es como se asienta: no es un hallazgo.
    expect(hallazgosDe('await tx.reservationMovement.create({ data: {} });')).toEqual([]);
    expect(hallazgosDe('await tx.inventoryMovement.create({ data: {} });')).toEqual([]);
  });
});

describe('directo — consumeBatchStock (R27) sin pasar por la reserva', () => {
  it('decrementa condicionalmente y asienta la salida negativa con el pedido', async () => {
    const fixture = await createFixture();
    const { productId, batchId } = await createProductWithBatch(fixture, { stock: '10' });
    const orderId = await createOrderRow(fixture);

    try {
      const resultado = await prisma.$transaction((tx) =>
        consumeBatchStock(tx, { batchId, quantity: '4', orderId, actorId: fixture.actorId }, new Date(), ambito(fixture)),
      );
      expect(resultado).toEqual({ kind: 'consumed', stock: '6.0000' });
      expect(await inventoryMovementsOf(batchId)).toEqual([
        expect.objectContaining({ kind: 'opening' }),
        { kind: 'consumption', quantity: '-4.0000', orderId },
      ]);

      const insuficiente = await prisma.$transaction((tx) =>
        consumeBatchStock(tx, { batchId, quantity: '100', orderId, actorId: fixture.actorId }, new Date(), ambito(fixture)),
      );
      expect(insuficiente).toEqual({ kind: 'insufficient', available: '6.0000' });
    } finally {
      await dropFixture(fixture, [productId], [orderId]);
    }
  });
});
