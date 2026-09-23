/**
 * `OrderUnitOfWork` contra Postgres real: `withOrderTransaction` cableado a mano con
 * `createOrderWriteRepository` (`pedidos`) y `createMaterialReservations` (`inventario`), el
 * MISMO par que ata `lib/composition`.
 *
 * AISLAMIENTO POR COMMIT: `withOrderTransaction` abre su PROPIA `prisma.$transaction` sobre el
 * cliente global, asi que envolver la corrida en una transaccion del test seria aislamiento de
 * mentira. Cada caso fabrica su propia empresa efimera con randomUUID (usuario, presentacion,
 * receta, producto y lote) y la limpia en un `finally`. Un caso fuerza el fallo DESPUES de
 * apartar y comprueba, con el cliente global, que no quedo ni el pedido ni la reserva. El caso del
 * reintento reutiliza el trigger determinista de `order-duplicate-number.int.test.ts` -sin el no
 * hay forma de provocar el choque del correlativo sin una carrera de verdad- para demostrar que
 * `withOrderTransaction` reintenta la unidad ENTERA hasta el mismo tope que `createOrder`.
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { Client, DatabaseError } from 'pg';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import { createWithFirstBatch } from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import { createMaterialReservations } from '@/lib/modules/inventario/adapters/driven/persistence/reservation-prisma';
import { createOrderWriteRepository } from '@/lib/modules/pedidos/adapters/driven/persistence/order-prisma';
import { withOrderTransaction } from '@/lib/modules/pedidos/adapters/driven/persistence/order-unit-of-work-prisma';
import { createRecipeExecutionReader } from '@/lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma';
import { prisma } from '@/lib/shared/db/prisma';

import type { InventoryScope } from '@/lib/modules/inventario/domain/inventory-scope';
import type { NewProduct } from '@/lib/modules/inventario/domain/product-view';
import type { OrderTransactionScope } from '@/lib/modules/pedidos/ports/order-unit-of-work';
import type { NewOrder } from '@/lib/modules/pedidos/domain/order-view';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

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

function connectionString(): string {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (url === undefined || url.trim() === '') {
    throw new Error('falta DATABASE_URL (o DIRECT_URL) en el entorno de la corrida de integracion');
  }
  return url;
}

/** El mismo cableado que `lib/composition`: los dos repositorios sobre el `tx` de la MISMA
 *  transaccion, sin `unitCatalog`. */
function runInOrderTransaction<T>(work: (scope: OrderTransactionScope) => Promise<T>): Promise<T> {
  return withOrderTransaction((tx) =>
    work({
      orders: createOrderWriteRepository(tx),
      reservations: createMaterialReservations(tx),
      recipes: createRecipeExecutionReader(tx),
    }),
  );
}

type Fixture = {
  readonly actorId: string;
  readonly companyId: string;
  readonly roleId: string;
  readonly documentTypeCode: string;
  readonly presentationId: string;
  readonly unitId: string;
  readonly recipeId: string;
};

async function createFixture(): Promise<Fixture> {
  const marca = token();
  const documentType = await prisma.documentType.create({
    data: { code: `DOC${marca.slice(0, 8)}`, name: 'Tipo de documento de prueba' },
    select: { code: true },
  });
  const role = await prisma.role.create({
    data: { name: `rol-${marca}`, description: 'Rol de prueba' },
    select: { id: true },
  });
  const nombre = `Empresa ${marca}`;
  const company = await prisma.company.create({
    data: { name: nombre, nameNormalized: normalizeCompanyName(nombre) },
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
    data: { name: `Unidad ${marca}`, nameNormalized: `unidad${marca}`, symbol: `kg${marca}` },
    select: { id: true },
  });
  const presentation = await prisma.presentation.create({
    data: { name: `Bidon ${marca}`, nameNormalized: normalizeForTest(`Bidon ${marca}`), unitId: unit.id, companyId: company.id },
    select: { id: true },
  });
  const recipeName = `Receta ${marca}`;
  const recipe = await prisma.recipe.create({
    data: { name: recipeName, nameNormalized: normalizeForTest(recipeName), companyId: company.id, createdBy: user.id },
    select: { id: true },
  });
  return {
    actorId: user.id,
    companyId: company.id,
    roleId: role.id,
    documentTypeCode: documentType.code,
    presentationId: presentation.id,
    unitId: unit.id,
    recipeId: recipe.id,
  };
}

async function dropFixture(fixture: Fixture, productIds: readonly string[]): Promise<void> {
  await prisma.reservationMovement.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.inventoryMovement.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.order.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.productBatch.deleteMany({ where: { productId: { in: [...productIds] } } });
  await prisma.product.deleteMany({ where: { id: { in: [...productIds] } } });
  await prisma.recipe.deleteMany({ where: { id: fixture.recipeId } });
  await prisma.presentation.deleteMany({ where: { id: fixture.presentationId } });
  await prisma.unit.deleteMany({ where: { id: fixture.unitId } });
  await prisma.user.deleteMany({ where: { id: fixture.actorId } });
  await prisma.role.deleteMany({ where: { id: fixture.roleId } });
  await prisma.documentType.deleteMany({ where: { code: fixture.documentTypeCode } });
  await prisma.company.deleteMany({ where: { id: fixture.companyId } });
}

async function createProductWithBatch(fixture: Fixture, stock: string): Promise<{ productId: string; batchId: string }> {
  const scope: InventoryScope = { companyId: fixture.companyId };
  const product: NewProduct = { name: `Producto ${token()}` };
  const created = await createWithFirstBatch(
    product,
    {
      presentationId: fixture.presentationId,
      stock,
      unitCost: '2.5000',
      lot: null,
      purchaseDate: '2026-09-01',
      expiryDate: null,
      createdBy: fixture.actorId,
    },
    new Date(),
    scope,
  );
  return { productId: created.id, batchId: created.batchId };
}

function newOrder(fixture: Fixture, quantity = '1.0000'): NewOrder {
  return {
    recipeId: fixture.recipeId,
    quantity,
    priority: 'BAJA',
    status: 'PENDIENTE',
    presentationId: fixture.presentationId,
  };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('R15 — un fallo forzado despues de apartar no deja escrito ni el pedido ni la reserva', () => {
  it('el pedido creado y la reserva sincronizada dentro de `run` se deshacen si `run` lanza despues', async () => {
    const fixture = await createFixture();
    const { productId } = await createProductWithBatch(fixture, '10');
    const now = new Date();

    let createdOrderId: string | null = null;
    const fallo = new Error('fallo forzado tras apartar, para demostrar R15');

    await expect(
      runInOrderTransaction(async (scope) => {
        const order = await scope.orders.create(newOrder(fixture), now.getUTCFullYear(), fixture.actorId, now, null, {
          companyId: fixture.companyId,
        });
        createdOrderId = order.id;

        const outcome = await scope.reservations.syncForOrder({
          orderId: order.id,
          companyId: fixture.companyId,
          requirement: [{ productId, quantity: '5.0000' }],
          actorId: fixture.actorId,
          now,
        });
        expect(outcome.kind).toBe('reserved');

        throw fallo;
      }),
    ).rejects.toBe(fallo);

    expect(createdOrderId).not.toBeNull();
    try {
      const ordenes = await prisma.order.count({ where: { companyId: fixture.companyId } });
      expect(ordenes).toBe(0);

      const reservas = await prisma.reservationMovement.count({ where: { companyId: fixture.companyId } });
      expect(reservas).toBe(0);

      const batch = await prisma.productBatch.findFirstOrThrow({
        where: { productId },
        select: { stock: true },
      });
      expect(batch.stock.toFixed(4)).toBe('10.0000');
    } finally {
      await dropFixture(fixture, [productId]);
    }
  });
});

describe('el reintento del correlativo (sin carrera artificial, con el trigger determinista de order-duplicate-number)', () => {
  it('withOrderTransaction reintenta la unidad completa hasta el mismo tope que createOrder, y no deja nada escrito si los tres chocan', async () => {
    const fixture = await createFixture();
    const now = new Date();

    // El numero 1 queda ocupado por un alta normal, DENTRO de la unidad de trabajo.
    const primera = await runInOrderTransaction((scope) =>
      scope.orders.create(newOrder(fixture), now.getUTCFullYear(), fixture.actorId, now, null, {
        companyId: fixture.companyId,
      }),
    );
    expect(primera.number.sequence).toBe(1);

    const sufijo = token();
    const funcion = `test_force_order_seq_uow_${sufijo}`;
    const trigger = `test_force_order_seq_uow_trg_${sufijo}`;
    const admin = new Client({ connectionString: connectionString() });
    let spy: ReturnType<typeof vi.spyOn> | undefined;
    try {
      await admin.connect();
      if (!UUID.test(fixture.companyId)) throw new Error(`companyId inesperado: ${fixture.companyId}`);

      await admin.query(
        `CREATE FUNCTION public."${funcion}"() RETURNS trigger LANGUAGE plpgsql AS $$
           BEGIN NEW.order_sequence := 1; RETURN NEW; END $$`,
      );
      await admin.query(
        `CREATE TRIGGER "${trigger}" BEFORE INSERT ON public.orders FOR EACH ROW
           WHEN (NEW.company_id = '${fixture.companyId}'::uuid)
           EXECUTE FUNCTION public."${funcion}"()`,
      );

      // Control: el trigger produce de verdad el 23505 del indice del correlativo.
      const control = await admin
        .query(
          `INSERT INTO orders (company_id, order_year, order_sequence, recipe_id, quantity, priority,
                               status, created_by, updated_by, created_at, updated_at)
           VALUES ($1::uuid, $2::int, 999, $3::uuid, 1, 'BAJA', 'PENDIENTE', $4::uuid, $4::uuid, $5, $5)`,
          [fixture.companyId, primera.number.year, fixture.recipeId, fixture.actorId, now],
        )
        .then(
          () => null,
          (error: unknown) => error,
        );
      expect(control).toBeInstanceOf(DatabaseError);
      expect((control as DatabaseError).code).toBe('23505');
      expect((control as DatabaseError).constraint).toBe('orders_company_year_sequence_key');

      spy = vi.spyOn(prisma, '$transaction');

      const rechazo = await runInOrderTransaction((scope) =>
        scope.orders.create(newOrder(fixture), now.getUTCFullYear(), fixture.actorId, now, null, {
          companyId: fixture.companyId,
        }),
      ).then(
        () => null,
        (error: unknown) => error,
      );
      expect(rechazo).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      expect((rechazo as Prisma.PrismaClientKnownRequestError).meta).toMatchObject({ code: '23505' });

      // Tres transacciones: la unidad entera se reintento, no solo el `INSERT`.
      expect(spy).toHaveBeenCalledTimes(3);

      // Ninguno de los tres intentos dejo una segunda fila: solo sigue la semilla.
      const guardados = await prisma.order.count({ where: { companyId: fixture.companyId } });
      expect(guardados).toBe(1);
    } finally {
      spy?.mockRestore();
      await admin.query(`DROP TRIGGER IF EXISTS "${trigger}" ON public.orders`).catch(() => undefined);
      await admin.query(`DROP FUNCTION IF EXISTS public."${funcion}"()`).catch(() => undefined);
      await admin.end().catch(() => undefined);
      await dropFixture(fixture, []);
    }
  });
});
