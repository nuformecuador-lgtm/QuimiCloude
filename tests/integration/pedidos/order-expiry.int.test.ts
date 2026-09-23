/**
 * El proceso diario contra Postgres real: `createExpireStaleOrders` cableado con el directorio
 * REAL de empresas de `identity` (`listActiveCompanyIds`) y el `findExpirableOrders` REAL de
 * `pedidos`, sobre `withOrderTransaction` -el mismo conjunto que `lib/composition` ata, sin
 * pasar por `lib/composition` para no arrastrar el resto de la aplicacion a un test de dominio-.
 *
 * AISLAMIENTO — `withOrderTransaction` abre su PROPIA `prisma.$transaction` sobre el cliente
 * global, igual que `order-reservation.int.test.ts`: envolver la corrida en una transaccion del
 * test seria aislamiento de mentira. Cada caso fabrica sus propias empresas efimeras con
 * randomUUID y las limpia en un `finally`.
 *
 * `listActiveCompanyIds` lee TODAS las empresas de la base de la corrida -tambien las que
 * siembran otros archivos de esta misma corrida-, pero ninguna de ellas tiene un pedido cuyo
 * `reserved_at` caiga antes del umbral de estos casos, asi que no aportan candidatos y no
 * afectan las cuentas de abajo.
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import { listActiveCompanyIds } from '@/lib/modules/identity/adapters/driven/persistence/company-directory-prisma';
import { findCostingBatches, findProductRefs } from '@/lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma';
import { createWithFirstBatch } from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import { createMaterialReservations } from '@/lib/modules/inventario/adapters/driven/persistence/reservation-prisma';
import { findPresentationRefs } from '@/lib/modules/inventario/adapters/driven/persistence/presentation-catalog-prisma';
import {
  createOrderWriteRepository,
  findExpirableOrders,
} from '@/lib/modules/pedidos/adapters/driven/persistence/order-prisma';
import { withOrderTransaction } from '@/lib/modules/pedidos/adapters/driven/persistence/order-unit-of-work-prisma';
import {
  findRecipeExecutionContentById,
  findRecipeIdsMatchingName,
  findRecipeRefsIncludingDeleted,
} from '@/lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma';
import { findUnitRefs } from '@/lib/modules/unidades/adapters/driven/persistence/unit-catalog-prisma';
import { findUnitRefsSharingBaseInCompany } from '@/lib/modules/unidades/adapters/driven/persistence/unit-prisma';
import { prisma } from '@/lib/shared/db/prisma';

import {
  createCreateOrder,
  createExpireStaleOrders,
  EXPIRED_ORDER_REASON,
  ORDER_RESERVATION_TTL_DAYS,
} from '@/lib/modules/pedidos';

import type { Actor, NewOrder } from '@/lib/modules/pedidos';
import type { PresentationCatalog, ProductCatalog } from '@/lib/modules/inventario';
import type { OrderTransactionScope, OrderUnitOfWork } from '@/lib/modules/pedidos/ports/order-unit-of-work';
import type { RecipeCatalog } from '@/lib/modules/recetas';
import type { UnitCatalog } from '@/lib/modules/unidades';

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

// ---------------------------------------------------------------------------
// El cableado REAL: los mismos adaptadores que `lib/composition`.
// ---------------------------------------------------------------------------

const unitOfWork: OrderUnitOfWork = {
  run: (work) =>
    withOrderTransaction((tx) => {
      const scope: OrderTransactionScope = {
        orders: createOrderWriteRepository(tx),
        reservations: createMaterialReservations(tx),
      };
      return work(scope);
    }),
};

const recipes: RecipeCatalog = {
  findRefsIncludingDeleted: findRecipeRefsIncludingDeleted,
  findExecutionContentById: findRecipeExecutionContentById,
  findIdsMatchingName: findRecipeIdsMatchingName,
};

const products: ProductCatalog = { findRefs: findProductRefs, findCostingBatches };
const presentations: PresentationCatalog = { findRefs: findPresentationRefs };
const units: UnitCatalog = {
  findRefs: findUnitRefs,
  findRefsSharingBaseInCompany: findUnitRefsSharingBaseInCompany,
};

const createOrder = createCreateOrder({ recipes, products, units, presentations, unitOfWork, now: () => new Date() });

const expireStaleOrders = createExpireStaleOrders({
  listCompanyIds: listActiveCompanyIds,
  findExpirable: findExpirableOrders,
  unitOfWork,
});

// ---------------------------------------------------------------------------
// Empresa efimera
// ---------------------------------------------------------------------------

type Fixture = {
  readonly companyId: string;
  readonly actorId: string;
  readonly roleId: string;
  readonly documentTypeCode: string;
  readonly presentationId: string;
  readonly unitId: string;
};

function actorDe(fixture: Fixture): Actor {
  return { id: fixture.actorId, companyId: fixture.companyId, permissions: ['pedidos.consultar', 'pedidos.modificar'] };
}

async function crearFixture(): Promise<Fixture> {
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
  return {
    companyId: company.id,
    actorId: user.id,
    roleId: role.id,
    documentTypeCode: documentType.code,
    presentationId: presentation.id,
    unitId: unit.id,
  };
}

async function borrarFixture(fixture: Fixture, productIds: readonly string[]): Promise<void> {
  await prisma.reservationMovement.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.inventoryMovement.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.order.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.recipeLine.deleteMany({ where: { recipe: { companyId: fixture.companyId } } });
  await prisma.recipe.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.productBatch.deleteMany({ where: { productId: { in: [...productIds] } } });
  await prisma.product.deleteMany({ where: { id: { in: [...productIds] } } });
  await prisma.presentation.deleteMany({ where: { id: fixture.presentationId } });
  await prisma.unit.deleteMany({ where: { id: fixture.unitId } });
  await prisma.user.deleteMany({ where: { id: fixture.actorId } });
  await prisma.role.deleteMany({ where: { id: fixture.roleId } });
  await prisma.documentType.deleteMany({ where: { code: fixture.documentTypeCode } });
  await prisma.company.deleteMany({ where: { id: fixture.companyId } });
}

async function crearReceta(fixture: Fixture): Promise<string> {
  const marca = token();
  const recipe = await prisma.recipe.create({
    data: { name: `Receta ${marca}`, nameNormalized: normalizeForTest(`Receta ${marca}`), companyId: fixture.companyId, createdBy: fixture.actorId },
    select: { id: true },
  });
  return recipe.id;
}

async function crearLineaCompleta(recipeId: string, productId: string): Promise<void> {
  await prisma.recipeLine.create({ data: { recipeId, productId, percentage: new Prisma.Decimal('100.00') } });
}

async function crearProductoConLote(fixture: Fixture, stock: string): Promise<{ productId: string; batchId: string }> {
  const created = await createWithFirstBatch(
    { name: `Producto ${token()}` },
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
    { companyId: fixture.companyId },
  );
  return { productId: created.id, batchId: created.batchId };
}

function nuevoPedido(recipeId: string, presentationId: string, quantity: string): NewOrder {
  return { recipeId, quantity, priority: 'BAJA', status: 'PENDIENTE', presentationId };
}

/** Crea un pedido reservado y lo hace CADUCADO a proposito: `reserved_at` pasa a un instante
 *  anterior al umbral de los 15 dias, con `$executeRaw` para no mover `updated_at`. */
async function crearPedidoCaducado(fixture: Fixture, recipeId: string): Promise<string> {
  const creado = await createOrder(nuevoPedido(recipeId, fixture.presentationId, '10.0000'), actorDe(fixture));
  const vencido = new Date(Date.now() - (ORDER_RESERVATION_TTL_DAYS + 1) * 24 * 60 * 60 * 1000);
  await prisma.$executeRaw`UPDATE "orders" SET "reserved_at" = ${vencido}::timestamptz WHERE "id" = ${creado.id}::uuid`;
  return creado.id;
}

async function estadoDe(orderId: string): Promise<{ status: string; cancellationReason: string | null; reservedAt: Date | null }> {
  const row = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { status: true, cancellationReason: true, reservedAt: true },
  });
  return row;
}

type ReservaResumen = { readonly kind: string; readonly quantity: string; readonly createdBy: string | null };

async function movimientosDe(orderId: string): Promise<readonly ReservaResumen[]> {
  const rows = await prisma.reservationMovement.findMany({
    where: { orderId },
    select: { kind: true, quantity: true, createdBy: true },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((row) => ({ kind: row.kind, quantity: row.quantity.toFixed(4), createdBy: row.createdBy }));
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('R21 — el proceso diario cancela con el motivo exacto, sin autor, y libera como expire', () => {
  it('un pedido PENDIENTE cuya reserva vencio se cancela y libera en la MISMA operacion', async () => {
    const fixture = await crearFixture();
    const { productId } = await crearProductoConLote(fixture, '100');
    const recipeId = await crearReceta(fixture);
    await crearLineaCompleta(recipeId, productId);

    try {
      const orderId = await crearPedidoCaducado(fixture, recipeId);

      const resultado = await expireStaleOrders();

      expect(resultado.expired).toBeGreaterThanOrEqual(1);
      expect(resultado.failed).toEqual([]);
      const estado = await estadoDe(orderId);
      expect(estado.status).toBe('CANCELADO');
      expect(estado.cancellationReason).toBe(EXPIRED_ORDER_REASON);
      expect(estado.reservedAt).toBeNull();
      const movimientos = await movimientosDe(orderId);
      expect(movimientos.at(-1)).toEqual({ kind: 'expire', quantity: '10.0000', createdBy: null });
    } finally {
      await borrarFixture(fixture, [productId]);
    }
  });
});

describe('R22 — el proceso diario NO toca lo que no debe', () => {
  it('un pedido PENDIENTE sin material apartado (sin reserved_at) no se cancela', async () => {
    const fixture = await crearFixture();
    const recipeId = await crearReceta(fixture); // sin lineas: no aparta nada (E2)

    try {
      const creado = await createOrder(nuevoPedido(recipeId, fixture.presentationId, '10.0000'), actorDe(fixture));
      expect((await estadoDe(creado.id)).reservedAt).toBeNull();

      await expireStaleOrders();

      const estado = await estadoDe(creado.id);
      expect(estado.status).toBe('PENDIENTE');
    } finally {
      await borrarFixture(fixture, []);
    }
  });

  it('un pedido reservado pero AUN dentro del plazo no se cancela', async () => {
    const fixture = await crearFixture();
    const { productId } = await crearProductoConLote(fixture, '100');
    const recipeId = await crearReceta(fixture);
    await crearLineaCompleta(recipeId, productId);

    try {
      const creado = await createOrder(nuevoPedido(recipeId, fixture.presentationId, '10.0000'), actorDe(fixture));

      await expireStaleOrders();

      const estado = await estadoDe(creado.id);
      expect(estado.status).toBe('PENDIENTE');
      expect(estado.reservedAt).not.toBeNull();
    } finally {
      await borrarFixture(fixture, [productId]);
    }
  });
});

describe('R53 — una edicion intercalada entre el lote y el candado gana', () => {
  it('si la edicion reinicia reserved_at entre findExpirableOrders y el bloqueo, el pedido sigue PENDIENTE con su material', async () => {
    const fixture = await crearFixture();
    const { productId } = await crearProductoConLote(fixture, '100');
    const recipeId = await crearReceta(fixture);
    await crearLineaCompleta(recipeId, productId);

    try {
      const orderId = await crearPedidoCaducado(fixture, recipeId);

      // Doble de `findExpirableOrders`: devuelve el lote real y, ANTES de que el caso de uso
      // bloquee la fila, otra conexion -otra edicion, fuera de esta transaccion- reinicia
      // `reserved_at` al instante presente.
      const findExpirableConEdicionIntercalada: typeof findExpirableOrders = async (
        companyId,
        threshold,
        limit,
      ) => {
        const lote = await findExpirableOrders(companyId, threshold, limit);
        await prisma.$executeRaw`UPDATE "orders" SET "reserved_at" = ${new Date()}::timestamptz WHERE "id" = ${orderId}::uuid`;
        return lote;
      };
      const expireConEdicionIntercalada = createExpireStaleOrders({
        listCompanyIds: listActiveCompanyIds,
        findExpirable: findExpirableConEdicionIntercalada,
        unitOfWork,
      });

      const resultado = await expireConEdicionIntercalada();

      expect(resultado.failed).toEqual([]);
      const estado = await estadoDe(orderId);
      expect(estado.status).toBe('PENDIENTE');
      expect(estado.reservedAt).not.toBeNull();
    } finally {
      await borrarFixture(fixture, [productId]);
    }
  });
});

describe('R25 — idempotente ante una repeticion o un solape', () => {
  it('dos ejecuciones SEGUIDAS cancelan y liberan una sola vez', async () => {
    const fixture = await crearFixture();
    const { productId } = await crearProductoConLote(fixture, '100');
    const recipeId = await crearReceta(fixture);
    await crearLineaCompleta(recipeId, productId);

    try {
      const orderId = await crearPedidoCaducado(fixture, recipeId);

      await expireStaleOrders();
      const segunda = await expireStaleOrders();

      // La segunda vuelta no puede volver a contar ESTE pedido: ya esta CANCELADO bajo el
      // candado. Puede seguir contando candidatos de OTRAS corridas concurrentes, pero no este.
      const movimientos = await movimientosDe(orderId);
      expect(movimientos.filter((m) => m.kind === 'expire')).toHaveLength(1);
      expect(segunda.failed).toEqual([]);
      const estado = await estadoDe(orderId);
      expect(estado.status).toBe('CANCELADO');
    } finally {
      await borrarFixture(fixture, [productId]);
    }
  });

  it('dos ejecuciones SOLAPADAS cancelan y liberan una sola vez', async () => {
    const fixture = await crearFixture();
    const { productId } = await crearProductoConLote(fixture, '100');
    const recipeId = await crearReceta(fixture);
    await crearLineaCompleta(recipeId, productId);

    try {
      const orderId = await crearPedidoCaducado(fixture, recipeId);

      const [primera, segunda] = await Promise.all([expireStaleOrders(), expireStaleOrders()]);

      expect(primera.failed).toEqual([]);
      expect(segunda.failed).toEqual([]);
      const movimientos = await movimientosDe(orderId);
      expect(movimientos.filter((m) => m.kind === 'expire')).toHaveLength(1);
      const estado = await estadoDe(orderId);
      expect(estado.status).toBe('CANCELADO');
    } finally {
      await borrarFixture(fixture, [productId]);
    }
  });
});

describe('R17, R21 — aislamiento por empresa: la busqueda de A no devuelve pedidos de B', () => {
  it('findExpirableOrders(companyA, ...) no incluye el candidato de la empresa B', async () => {
    const fixtureA = await crearFixture();
    const fixtureB = await crearFixture();
    const { productId: productIdA } = await crearProductoConLote(fixtureA, '100');
    const { productId: productIdB } = await crearProductoConLote(fixtureB, '100');
    const recipeIdA = await crearReceta(fixtureA);
    const recipeIdB = await crearReceta(fixtureB);
    await crearLineaCompleta(recipeIdA, productIdA);
    await crearLineaCompleta(recipeIdB, productIdB);

    try {
      const orderIdA = await crearPedidoCaducado(fixtureA, recipeIdA);
      const orderIdB = await crearPedidoCaducado(fixtureB, recipeIdB);
      const threshold = new Date();

      const candidatosDeA = await findExpirableOrders(fixtureA.companyId, threshold, 100);
      const candidatosDeB = await findExpirableOrders(fixtureB.companyId, threshold, 100);

      expect(candidatosDeA).toContain(orderIdA);
      expect(candidatosDeA).not.toContain(orderIdB);
      expect(candidatosDeB).toContain(orderIdB);
      expect(candidatosDeB).not.toContain(orderIdA);

      // El proceso completo, que recorre TODAS las empresas, cancela las dos: cada una por su
      // propia consulta acotada, nunca por una consulta conjunta.
      const resultado = await expireStaleOrders();
      expect(resultado.failed).toEqual([]);
      expect((await estadoDe(orderIdA)).status).toBe('CANCELADO');
      expect((await estadoDe(orderIdB)).status).toBe('CANCELADO');
    } finally {
      await borrarFixture(fixtureA, [productIdA]);
      await borrarFixture(fixtureB, [productIdB]);
    }
  });
});
