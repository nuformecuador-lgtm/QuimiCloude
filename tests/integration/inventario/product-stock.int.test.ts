/**
 * QC-121 (`design.md > 4`, `> 5`; R1, R5, R6, R7, R8, R9, R10): el alta busca el producto vivo
 * por NOMBRE y UNIDAD -no solo por nombre-, y `products.stock` lo recalcula la aplicacion en la
 * MISMA transaccion que escribe cada lote, a partir de la suma de todos los lotes del producto.
 *
 * AISLAMIENTO -- `createWithFirstBatch` y `addBatchToAlive` usan el cliente Prisma GLOBAL y
 * abren cada uno SU PROPIA `prisma.$transaction`, igual que `ledger-cuadre.int.test.ts`:
 * envolverlos en una transaccion del test seria aislamiento de mentira -correrian en otra
 * conexion del pool y no verian las filas del fixture-, y las dos altas concurrentes de R10
 * necesitan que cada una CONFIRME para que la otra vea su lote. Cada caso fabrica su empresa
 * efimera con randomUUID, escribe solo en ella y la limpia en un `finally`.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import {
  addBatchToAlive,
  createWithFirstBatch,
  findAliveIdByNameInPresentationUnit,
} from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import { adjustByDelta } from '../../helpers/adjust-by-delta';
import { BatchStockNegativeError } from '@/lib/modules/inventario/domain/errors';
import { prisma } from '@/lib/shared/db/prisma';

import type { InventoryScope } from '@/lib/modules/inventario/domain/inventory-scope';
import type { NewProductBatch } from '@/lib/modules/inventario/domain/product-batch';
import type { NewProduct } from '@/lib/modules/inventario/domain/product-view';

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

/** `product_batches.created_by`/`updated_by` son FK reales a `users` aunque el esquema Prisma
 *  las declare escalares: un uuid inventado no vale. */
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

/** Las cuatro del arrancador (`db/migrations/20260903121404_units_catalog`): sin empresa. */
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
  readonly kgPresentationId: string;
  readonly litroPresentationId: string;
};

function ambito(fixture: Fixture): InventoryScope {
  return { companyId: fixture.companyId };
}

async function createFixture(): Promise<Fixture> {
  const { userId, companyId } = await createTestUser();
  const kgUnit = await unidadDeSistema('kilogramo');
  const litroUnit = await unidadDeSistema('litro');
  const kgPresentationId = await createTestPresentation(companyId, kgUnit);
  const litroPresentationId = await createTestPresentation(companyId, litroUnit);
  return { actorId: userId, companyId, kgPresentationId, litroPresentationId };
}

/** En orden de FK: asientos, lotes, productos, las dos presentaciones, usuario. */
async function dropFixture(fixture: Fixture, productIds: readonly string[]): Promise<void> {
  await prisma.inventoryMovement.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.productBatch.deleteMany({ where: { productId: { in: [...productIds] } } });
  await prisma.product.deleteMany({ where: { id: { in: [...productIds] } } });
  await prisma.presentation.deleteMany({
    where: { id: { in: [fixture.kgPresentationId, fixture.litroPresentationId] } },
  });
  await deleteTestUser(fixture.actorId);
}

function newProduct(overrides: Partial<NewProduct> = {}): NewProduct {
  return { name: `Producto ${token()}`, ...overrides };
}

function newBatch(
  fixture: Fixture,
  presentationId: string,
  overrides: Partial<NewProductBatch> = {},
): NewProductBatch {
  return {
    presentationId,
    stock: '5',
    unitCost: '2.5000',
    lot: null,
    purchaseDate: '2026-09-01',
    expiryDate: null,
    createdBy: fixture.actorId,
    ...overrides,
  };
}

async function stockOf(productId: string): Promise<string> {
  const product = await prisma.product.findUniqueOrThrow({
    where: { id: productId },
    select: { stock: true },
  });
  return product.stock.toFixed(4);
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('R1, R8, R9 — el alta fija la unidad del producto y guarda la suma de sus lotes', () => {
  it('tres lotes de 5 en la misma unidad dejan products.stock en 15', async () => {
    const fixture = await createFixture();
    const productIds: string[] = [];

    try {
      const creado = await createWithFirstBatch(
        newProduct(),
        newBatch(fixture, fixture.kgPresentationId),
        new Date(),
        ambito(fixture),
      );
      productIds.push(creado.id);
      expect(await stockOf(creado.id)).toBe('5.0000');

      await addBatchToAlive(
        creado.id,
        newBatch(fixture, fixture.kgPresentationId),
        new Date(),
        ambito(fixture),
      );
      expect(await stockOf(creado.id)).toBe('10.0000');

      await addBatchToAlive(
        creado.id,
        newBatch(fixture, fixture.kgPresentationId),
        new Date(),
        ambito(fixture),
      );
      expect(await stockOf(creado.id)).toBe('15.0000');

      const producto = await prisma.product.findUniqueOrThrow({
        where: { id: creado.id },
        select: { unitId: true },
      });
      const presentacion = await prisma.presentation.findUniqueOrThrow({
        where: { id: fixture.kgPresentationId },
        select: { unitId: true },
      });
      expect(producto.unitId).toBe(presentacion.unitId);
    } finally {
      await dropFixture(fixture, productIds);
    }
  });

  it('un lote vencido sigue sumando en products.stock (R8)', async () => {
    const fixture = await createFixture();
    const productIds: string[] = [];

    try {
      // Los dos lotes pasan por el camino real de escritura, que es quien recalcula la columna:
      // el primero ya esta vencido, el segundo caduca dentro de anos.
      const creado = await createWithFirstBatch(
        newProduct(),
        newBatch(fixture, fixture.kgPresentationId, {
          stock: '7',
          purchaseDate: '2019-06-01',
          expiryDate: '2020-01-31',
        }),
        new Date(),
        ambito(fixture),
      );
      productIds.push(creado.id);
      expect(await stockOf(creado.id)).toBe('7.0000');

      const agregado = await addBatchToAlive(
        creado.id,
        newBatch(fixture, fixture.kgPresentationId, { stock: '4', expiryDate: '2099-12-31' }),
        new Date(),
        ambito(fixture),
      );
      expect(agregado).not.toBeNull();

      // Que el lote vencido lo este de verdad: si no, el caso se volveria tautologico.
      const lotes = await prisma.productBatch.findMany({
        where: { productId: creado.id },
        select: { stock: true, expiryDate: true },
        orderBy: { stock: 'asc' },
      });
      expect(lotes.map((lote) => lote.stock.toFixed(4))).toEqual(['4.0000', '7.0000']);
      const vencido = lotes.find((lote) => lote.stock.toFixed(4) === '7.0000');
      expect(vencido?.expiryDate).not.toBeNull();
      expect(vencido?.expiryDate?.getTime()).toBeLessThan(Date.now());

      // 11 = 7 vencido + 4 vigente. Un recalculo que excluyera los vencidos dejaria 4.
      expect(await stockOf(creado.id)).toBe('11.0000');
    } finally {
      await dropFixture(fixture, productIds);
    }
  });

  it('R3: dos lotes con decimales exactos suman sin rastro de coma flotante', async () => {
    const fixture = await createFixture();
    const productIds: string[] = [];

    try {
      const creado = await createWithFirstBatch(
        newProduct(),
        newBatch(fixture, fixture.kgPresentationId, { stock: '1.5' }),
        new Date(),
        ambito(fixture),
      );
      productIds.push(creado.id);
      expect(await stockOf(creado.id)).toBe('1.5000');

      await addBatchToAlive(
        creado.id,
        newBatch(fixture, fixture.kgPresentationId, { stock: '0.0001' }),
        new Date(),
        ambito(fixture),
      );
      // 1.5 + 0.0001 = 1.5001 exacto: 0.1 + 0.0001 en coma flotante binaria no da esto.
      expect(await stockOf(creado.id)).toBe('1.5001');
    } finally {
      await dropFixture(fixture, productIds);
    }
  });

  it('un producto sin ningun lote tiene existencia 0 (R8), aunque nadie la haya recalculado nunca', async () => {
    // Directo con Prisma, sin pasar por ningun camino de escritura: es el `DEFAULT 0` de la
    // columna, no un recalculo que corriera y diera 0.
    const fixture = await createFixture();
    const nombre = `Producto ${token()}`;
    const producto = await prisma.product.create({
      data: { name: nombre, nameNormalized: normalizeForTest(nombre), companyId: fixture.companyId },
      select: { id: true },
    });

    try {
      expect(await stockOf(producto.id)).toBe('0.0000');
      expect(await prisma.productBatch.count({ where: { productId: producto.id } })).toBe(0);
    } finally {
      await dropFixture(fixture, [producto.id]);
    }
  });
});

describe('R5, R6, R7 — el alta busca por nombre Y unidad, no por nombre solo', () => {
  it('el mismo nombre en kg y en L crea DOS productos, cada uno con su propia existencia', async () => {
    const fixture = await createFixture();
    const productIds: string[] = [];
    const nombre = `Hipoclorito ${token()}`;

    try {
      const enKg = await createWithFirstBatch(
        newProduct({ name: nombre }),
        newBatch(fixture, fixture.kgPresentationId, { stock: '5' }),
        new Date(),
        ambito(fixture),
      );
      productIds.push(enKg.id);

      // R5: SIN el producto en kg todavia, la busqueda en L tampoco lo encuentra -es OTRA
      // unidad- y el alta crea uno nuevo (R6), sin rechazar ni avisar.
      const idEnLitro = await findAliveIdByNameInPresentationUnit(
        nombre,
        fixture.litroPresentationId,
        ambito(fixture),
      );
      expect(idEnLitro).toBeNull();

      const enLitro = await createWithFirstBatch(
        newProduct({ name: nombre }),
        newBatch(fixture, fixture.litroPresentationId, { stock: '20' }),
        new Date(),
        ambito(fixture),
      );
      productIds.push(enLitro.id);

      expect(enLitro.id).not.toBe(enKg.id);
      expect(await stockOf(enKg.id)).toBe('5.0000');
      expect(await stockOf(enLitro.id)).toBe('20.0000');

      // Y AHORA que el producto en kg existe, la busqueda en kg SI lo encuentra (R5): un
      // segundo lote en kg se le agrega a el, no crea un tercero.
      const idEnKg = await findAliveIdByNameInPresentationUnit(
        nombre,
        fixture.kgPresentationId,
        ambito(fixture),
      );
      expect(idEnKg).toEqual({ id: enKg.id, type: 'PRODUCT' });

      const agregado = await addBatchToAlive(
        enKg.id,
        newBatch(fixture, fixture.kgPresentationId, { stock: '3' }),
        new Date(),
        ambito(fixture),
      );
      expect(agregado).not.toBeNull();
      expect(await stockOf(enKg.id)).toBe('8.0000');
      expect(await stockOf(enLitro.id)).toBe('20.0000');
      expect(await prisma.product.count({ where: { id: { in: [enKg.id, enLitro.id] } } })).toBe(2);
    } finally {
      await dropFixture(fixture, productIds);
    }
  });
});

describe('R10 — dos altas concurrentes sobre el mismo producto suman las dos, sin perder ninguna', () => {
  it('dos addBatchToAlive simultaneos sobre el mismo producto dejan stock = suma de los tres lotes', async () => {
    const fixture = await createFixture();
    const productIds: string[] = [];

    try {
      const creado = await createWithFirstBatch(
        newProduct(),
        newBatch(fixture, fixture.kgPresentationId, { stock: '5' }),
        new Date(),
        ambito(fixture),
      );
      productIds.push(creado.id);

      // Sin `await` entre las dos, para que compitan de verdad por la misma fila del producto.
      const [primero, segundo] = await Promise.all([
        addBatchToAlive(
          creado.id,
          newBatch(fixture, fixture.kgPresentationId, { stock: '7' }),
          new Date(),
          ambito(fixture),
        ),
        addBatchToAlive(
          creado.id,
          newBatch(fixture, fixture.kgPresentationId, { stock: '11' }),
          new Date(),
          ambito(fixture),
        ),
      ]);

      expect(primero).not.toBeNull();
      expect(segundo).not.toBeNull();
      expect(await prisma.productBatch.count({ where: { productId: creado.id } })).toBe(3);
      // 5 + 7 + 11: si el recalculo de uno pisara al del otro, esto quedaria en 16 o en 12.
      expect(await stockOf(creado.id)).toBe('23.0000');
    } finally {
      await dropFixture(fixture, productIds);
    }
  });
});

describe('R29, R32 — el ajuste de lote recalcula stock sin tocar el resto del producto', () => {
  it('tres lotes de 5 y un ajuste +6 y -9 dejan stock en 12, y name/qty_alert/unit_id/updated_at intactos', async () => {
    const fixture = await createFixture();
    const productIds: string[] = [];

    try {
      const creado = await createWithFirstBatch(
        newProduct({ qtyAlert: '4' }),
        newBatch(fixture, fixture.kgPresentationId),
        new Date(),
        ambito(fixture),
      );
      productIds.push(creado.id);
      await addBatchToAlive(creado.id, newBatch(fixture, fixture.kgPresentationId), new Date(), ambito(fixture));
      await addBatchToAlive(creado.id, newBatch(fixture, fixture.kgPresentationId), new Date(), ambito(fixture));
      expect(await stockOf(creado.id)).toBe('15.0000');

      const antes = await prisma.product.findUniqueOrThrow({ where: { id: creado.id } });

      const subida = await adjustByDelta(
        creado.batchId,
        '6',
        'conteo_fisico',
        fixture.actorId,
        new Date(Date.now() + 60_000),
        ambito(fixture),
      );
      expect(subida).toMatchObject({ kind: 'adjusted', stock: '11.0000', reserved: '0.0000', overReserved: false });
      expect(await stockOf(creado.id)).toBe('21.0000');

      const bajada = await adjustByDelta(
        creado.batchId,
        '-9',
        'merma',
        fixture.actorId,
        new Date(Date.now() + 120_000),
        ambito(fixture),
      );
      expect(bajada).toMatchObject({ kind: 'adjusted', stock: '2.0000', reserved: '0.0000', overReserved: false });
      expect(await stockOf(creado.id)).toBe('12.0000');

      // R32: la unica columna del producto que cambio es `stock`.
      const despues = await prisma.product.findUniqueOrThrow({ where: { id: creado.id } });
      expect(despues.name).toBe(antes.name);
      expect(despues.qtyAlert?.toFixed(4)).toBe(antes.qtyAlert?.toFixed(4));
      expect(despues.unitId).toBe(antes.unitId);
      expect(despues.updatedAt.toISOString()).toBe(antes.updatedAt.toISOString());
    } finally {
      await dropFixture(fixture, productIds);
    }
  });
});

describe('R30 — un ajuste rechazado no cambia la existencia guardada', () => {
  it('un ajuste que dejaria el lote en negativo rechaza con BatchStockNegativeError y stock no cambia', async () => {
    const fixture = await createFixture();
    const productIds: string[] = [];

    try {
      const creado = await createWithFirstBatch(
        newProduct(),
        newBatch(fixture, fixture.kgPresentationId, { stock: '5' }),
        new Date(),
        ambito(fixture),
      );
      productIds.push(creado.id);

      await expect(
        adjustByDelta(creado.batchId, '-6', 'merma', fixture.actorId, new Date(), ambito(fixture)),
      ).rejects.toBeInstanceOf(BatchStockNegativeError);

      expect(await stockOf(creado.id)).toBe('5.0000');
    } finally {
      await dropFixture(fixture, productIds);
    }
  });

  it('un lote de otra empresa devuelve null y no cambia el stock de ninguno de los dos productos', async () => {
    const fixtureA = await createFixture();
    const fixtureB = await createFixture();
    const productIdsA: string[] = [];
    const productIdsB: string[] = [];

    try {
      const productoDeA = await createWithFirstBatch(
        newProduct(),
        newBatch(fixtureA, fixtureA.kgPresentationId, { stock: '5' }),
        new Date(),
        ambito(fixtureA),
      );
      productIdsA.push(productoDeA.id);

      const productoDeB = await createWithFirstBatch(
        newProduct(),
        newBatch(fixtureB, fixtureB.kgPresentationId, { stock: '9' }),
        new Date(),
        ambito(fixtureB),
      );
      productIdsB.push(productoDeB.id);

      // El lote es de A, pero el ambito con el que se ajusta es el de B.
      const resultado = await adjustByDelta(
        productoDeA.batchId,
        '3',
        'conteo_fisico',
        fixtureB.actorId,
        new Date(),
        ambito(fixtureB),
      );
      expect(resultado).toEqual({ kind: 'batch_not_found' });

      expect(await stockOf(productoDeA.id)).toBe('5.0000');
      expect(await stockOf(productoDeB.id)).toBe('9.0000');
    } finally {
      await dropFixture(fixtureA, productIdsA);
      await dropFixture(fixtureB, productIdsB);
    }
  });
});

describe('R31 — dos escrituras concurrentes sobre el mismo producto suman las dos', () => {
  it('dos ajustes simultaneos sobre dos lotes del mismo producto dejan stock = suma de los tres', async () => {
    const fixture = await createFixture();
    const productIds: string[] = [];

    try {
      const creado = await createWithFirstBatch(
        newProduct(),
        newBatch(fixture, fixture.kgPresentationId, { stock: '10' }),
        new Date(),
        ambito(fixture),
      );
      productIds.push(creado.id);
      const segundo = await addBatchToAlive(
        creado.id,
        newBatch(fixture, fixture.kgPresentationId, { stock: '20' }),
        new Date(),
        ambito(fixture),
      );
      if (segundo === null || segundo === 'finished_product') {
        throw new Error('addBatchToAlive devolvio null con el producto vivo');
      }
      expect(await stockOf(creado.id)).toBe('30.0000');

      // Sin `await` entre los dos: compiten de verdad por la fila del producto.
      const [primero, segundoAjuste] = await Promise.all([
        adjustByDelta(creado.batchId, '5', 'conteo_fisico', fixture.actorId, new Date(), ambito(fixture)),
        adjustByDelta(segundo.batchId, '-3', 'merma', fixture.actorId, new Date(), ambito(fixture)),
      ]);
      expect(primero).toMatchObject({ kind: 'adjusted' });
      expect(segundoAjuste).toMatchObject({ kind: 'adjusted' });

      // 10 + 5 + 20 - 3: si el recalculo de uno pisara al del otro, esto quedaria en 32 o en 27.
      expect(await stockOf(creado.id)).toBe('32.0000');
    } finally {
      await dropFixture(fixture, productIds);
    }
  });

  it('un ajuste y una alta de lote simultaneos sobre el mismo producto suman los dos cambios', async () => {
    const fixture = await createFixture();
    const productIds: string[] = [];

    try {
      const creado = await createWithFirstBatch(
        newProduct(),
        newBatch(fixture, fixture.kgPresentationId, { stock: '10' }),
        new Date(),
        ambito(fixture),
      );
      productIds.push(creado.id);

      const [ajuste, agregado] = await Promise.all([
        adjustByDelta(creado.batchId, '4', 'conteo_fisico', fixture.actorId, new Date(), ambito(fixture)),
        addBatchToAlive(
          creado.id,
          newBatch(fixture, fixture.kgPresentationId, { stock: '6' }),
          new Date(),
          ambito(fixture),
        ),
      ]);
      expect(ajuste).toMatchObject({ kind: 'adjusted' });
      expect(agregado).not.toBeNull();

      // 10 + 4 + 6: ninguno de los dos cambios se pierde.
      expect(await stockOf(creado.id)).toBe('20.0000');
    } finally {
      await dropFixture(fixture, productIds);
    }
  });
});
