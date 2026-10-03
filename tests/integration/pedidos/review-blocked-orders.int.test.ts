/**
 * La revision de pedidos bloqueados contra Postgres real.
 *
 * Dos cableados. El caso de uso `createReviewBlockedOrders` atado a mano a los adaptadores
 * driven reales, como `order-expiry.int.test.ts`, para medir el desbloqueo, el orden y la
 * concurrencia. Y la fachada `inventario` de `lib/composition`, para medir que un alta o un
 * ajuste de verdad dispara la revision de su empresa y de ninguna otra.
 *
 * AISLAMIENTO — `withOrderTransaction` abre su PROPIA transaccion sobre el cliente global y los
 * casos de concurrencia necesitan que cada rama confirme para que la otra la vea bajo el
 * candado: una transaccion del test no los envolveria. Cada caso fabrica sus empresas efimeras
 * y las limpia en un `finally`.
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { inventario } from '@/lib/composition';
import { normalizeCompanyName } from '@/lib/modules/identity';
import { findCostingBatches, findProductRefs } from '@/lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma';
import { createWithFirstBatch, findFinishedGoodsReceipts } from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import { createMaterialReservations } from '@/lib/modules/inventario/adapters/driven/persistence/reservation-prisma';
import { createFinishedGoodsIntake } from '@/lib/modules/inventario/adapters/driven/persistence/finished-goods-prisma';
import {
  findPresentationRefs,
  findPresentationsByNormalizedNames,
} from '@/lib/modules/inventario/adapters/driven/persistence/presentation-catalog-prisma';
import {
  createOrderWriteRepository,
  findAliveOrderById,
  findBlockedOrderIds,
  listAliveOrders,
} from '@/lib/modules/pedidos/adapters/driven/persistence/order-prisma';
import { withOrderTransaction } from '@/lib/modules/pedidos/adapters/driven/persistence/order-unit-of-work-prisma';
import {
  createRecipeExecutionReader,
  findAliveRecipeByNormalizedName,
  findRecipeExecutionContentById,
  findRecipeIdsMatchingName,
  findRecipeRefsIncludingDeleted,
} from '@/lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma';
import { findUnitRefs } from '@/lib/modules/unidades/adapters/driven/persistence/unit-catalog-prisma';
import { findUnitRefsSharingBaseInCompany } from '@/lib/modules/unidades/adapters/driven/persistence/unit-prisma';
import { prisma } from '@/lib/shared/db/prisma';

import { createCancelOrder, createCreateOrder, createReviewBlockedOrders } from '@/lib/modules/pedidos';

import type { Actor as InventarioActor, PresentationCatalog, ProductCatalog } from '@/lib/modules/inventario';
import type { Actor } from '@/lib/modules/pedidos';
import type { OrderRepository } from '@/lib/modules/pedidos/ports/order-repository';
import type { OrderTransactionScope, OrderUnitOfWork } from '@/lib/modules/pedidos/ports/order-unit-of-work';
import type { RecipeCatalog } from '@/lib/modules/recetas';
import type { UnitCatalog } from '@/lib/modules/unidades';
import { findPackagingCostingBatches, findPackagingRefs } from '@/lib/modules/inventario/adapters/driven/persistence/packaging-catalog-prisma';
import type { PackagingCatalog } from '@/lib/modules/inventario';

const packagingCatalog: PackagingCatalog = { findRefs: findPackagingRefs, findCostingBatches: findPackagingCostingBatches };

// `lib/composition` pide su logger al cargarse: el espia tiene que existir antes del import.
const { registroPedidos } = vi.hoisted(() => ({ registroPedidos: vi.fn() }));

vi.mock('@/lib/shared/observability/logger', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/shared/observability/logger')>();
  return {
    ...real,
    forModule: (modulo: string) =>
      modulo === 'pedidos' ? { info: () => undefined, warn: () => undefined, error: registroPedidos } : real.forModule(modulo),
  };
});

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

const orders: OrderRepository = {
  findAliveById: findAliveOrderById,
  listAlive: listAliveOrders,
  findBlockedIds: findBlockedOrderIds,
};

const unitOfWork: OrderUnitOfWork = {
  run: (work) =>
    withOrderTransaction((tx) => {
      const scope: OrderTransactionScope = {
        orders: createOrderWriteRepository(tx),
        reservations: createMaterialReservations(tx),
        recipes: createRecipeExecutionReader(tx),
        finishedGoods: createFinishedGoodsIntake(tx),
      };
      return work(scope);
    }),
};

const recipes: RecipeCatalog = {
  findRefsIncludingDeleted: findRecipeRefsIncludingDeleted,
  findExecutionContentById: findRecipeExecutionContentById,
  findIdsMatchingName: findRecipeIdsMatchingName,
  findAliveByNormalizedName: findAliveRecipeByNormalizedName,
};

const products: ProductCatalog = { findRefs: findProductRefs, findCostingBatches, findFinishedGoodsReceipts };
const presentations: PresentationCatalog = {
  findRefs: findPresentationRefs,
  findByNormalizedNames: findPresentationsByNormalizedNames,
};
const units: UnitCatalog = {
  findRefs: findUnitRefs,
  findRefsSharingBaseInCompany: findUnitRefsSharingBaseInCompany,
};

const createOrder = createCreateOrder({ recipes, products, units, presentations, packaging: packagingCatalog, unitOfWork, now: () => new Date() });
const cancelOrder = createCancelOrder({ orders, unitOfWork, now: () => new Date() });
const reviewBlockedOrders = createReviewBlockedOrders({ orders, recipes, products, units, unitOfWork });

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

/** Quien registra existencia sin ningun permiso de `pedidos`. */
function almacenistaDe(fixture: Fixture): InventarioActor {
  return { id: fixture.actorId, companyId: fixture.companyId, permissions: ['inventario.modificar'] };
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

async function borrarFixture(fixture: Fixture): Promise<void> {
  await prisma.reservationMovement.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.inventoryMovement.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.order.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.recipeLine.deleteMany({ where: { recipe: { companyId: fixture.companyId } } });
  await prisma.recipe.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.productBatch.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.product.deleteMany({ where: { companyId: fixture.companyId } });
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

type Producto = { readonly productId: string; readonly batchId: string; readonly name: string };

async function crearProductoConLote(fixture: Fixture, stock: string): Promise<Producto> {
  const name = `Producto ${token()}`;
  const created = await createWithFirstBatch(
    { name },
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
  return { productId: created.id, batchId: created.batchId, name };
}

/** Un lote mas, escrito directamente: sube la existencia SIN pasar por la fachada que avisa. */
async function sumarLoteSinAvisar(
  fixture: Fixture,
  productId: string,
  stock: string,
  unitCost: string | null = '2.5000',
): Promise<void> {
  await prisma.productBatch.create({
    data: {
      productId,
      presentationId: fixture.presentationId,
      stock: new Prisma.Decimal(stock),
      unitCost: unitCost === null ? null : new Prisma.Decimal(unitCost),
      lot: `L${token().slice(0, 12)}`,
      purchaseDate: new Date('2026-09-02T00:00:00.000Z'),
      companyId: fixture.companyId,
    },
  });
}

/** Un pedido guardado BLOQUEADO por el alta real, con su receta de una linea al 100 %. */
async function crearBloqueado(fixture: Fixture, recipeId: string, quantity: string): Promise<string> {
  const creado = await createOrder(
    { recipeId, quantity, unitId: fixture.unitId, confirmBlocked: true },
    actorDe(fixture),
  );
  expect((await filaDe(creado.id)).status).toBe('BLOQUEADO');
  return creado.id;
}

async function filaDe(orderId: string) {
  const row = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      status: true,
      reservedAt: true,
      ingredientsCost: true,
      updatedAt: true,
      updatedBy: true,
    },
  });
  return { ...row, ingredientsCost: row.ingredientsCost === null ? null : row.ingredientsCost.toFixed(4) };
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

/** Lo apartado neto por el pedido, exigiendo que todo asiento sea un `reserve` sin autor. */
async function apartadoSinAutor(orderId: string): Promise<string> {
  const movimientos = await movimientosDe(orderId);
  expect(movimientos.every((m) => m.kind === 'reserve' && m.createdBy === null)).toBe(true);
  return movimientos.reduce((total, m) => total.add(new Prisma.Decimal(m.quantity)), new Prisma.Decimal(0)).toFixed(4);
}

/** Espera a que alguna sesion de esta base este bloqueada esperando un candado de fila. */
async function esperarAlguienEsperandoCandado(): Promise<void> {
  for (let intento = 0; intento < 200; intento += 1) {
    const [fila] = await prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'`;
    if ((fila?.n ?? 0) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('nadie llego a esperar el candado de la fila');
}

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// T7 — el caso de uso
// ---------------------------------------------------------------------------

describe('reviewBlockedOrders contra la base — desbloqueo', () => {
  it('R14, R15, R22: el que alcanza aparta sin autor, pasa a PENDIENTE, reserved_at al instante de la revision y recalcula el importe', async () => {
    const fixture = await crearFixture();
    try {
      const { productId } = await crearProductoConLote(fixture, '4');
      const recipeId = await crearReceta(fixture);
      await crearLineaCompleta(recipeId, productId);
      const orderId = await crearBloqueado(fixture, recipeId, '10.0000');
      expect((await filaDe(orderId)).ingredientsCost).toBeNull();
      await sumarLoteSinAvisar(fixture, productId, '6');
      const instante = new Date();

      const resultado = await reviewBlockedOrders({ companyId: fixture.companyId, now: instante });

      expect(resultado).toEqual({ unblocked: 1, failed: [] });
      const fila = await filaDe(orderId);
      expect(fila.status).toBe('PENDIENTE');
      expect(fila.reservedAt?.toISOString()).toBe(instante.toISOString());
      expect(fila.updatedAt.toISOString()).toBe(instante.toISOString());
      expect(fila.updatedBy).toBeNull();
      // 10 unidades a 2.5000, repartidas entre los dos lotes al mismo coste.
      expect(fila.ingredientsCost).toBe('25.0000');
      const movimientos = await movimientosDe(orderId);
      expect(movimientos.every((m) => m.kind === 'reserve' && m.createdBy === null)).toBe(true);
      expect(movimientos.map((m) => m.quantity).sort()).toEqual(['4.0000', '6.0000']);
    } finally {
      await borrarFixture(fixture);
    }
  });

  it('R15: el importe se sustituye tambien cuando sale sin calcular', async () => {
    const fixture = await crearFixture();
    try {
      const { productId } = await crearProductoConLote(fixture, '4');
      const recipeId = await crearReceta(fixture);
      await crearLineaCompleta(recipeId, productId);
      const orderId = await crearBloqueado(fixture, recipeId, '10.0000');
      // La reserva cuenta todos los lotes; el coste no cuenta un lote sin coste.
      await sumarLoteSinAvisar(fixture, productId, '20', null);

      const resultado = await reviewBlockedOrders({ companyId: fixture.companyId, now: new Date() });

      expect(resultado.unblocked).toBe(1);
      const fila = await filaDe(orderId);
      expect(fila.status).toBe('PENDIENTE');
      expect(fila.ingredientsCost).toBeNull();
    } finally {
      await borrarFixture(fixture);
    }
  });

  it('R17: el que sigue sin alcanzar queda intacto, ni estado ni importe ni updated_at', async () => {
    const fixture = await crearFixture();
    try {
      const { productId } = await crearProductoConLote(fixture, '4');
      const recipeId = await crearReceta(fixture);
      await crearLineaCompleta(recipeId, productId);
      const orderId = await crearBloqueado(fixture, recipeId, '10.0000');
      await sumarLoteSinAvisar(fixture, productId, '1');
      const antes = await filaDe(orderId);

      const resultado = await reviewBlockedOrders({ companyId: fixture.companyId, now: new Date() });

      expect(resultado).toEqual({ unblocked: 0, failed: [] });
      expect(await filaDe(orderId)).toEqual(antes);
      expect(await movimientosDe(orderId)).toEqual([]);
    } finally {
      await borrarFixture(fixture);
    }
  });

  it('R2: un BLOQUEADO cuya receta se quedo sin lineas se desbloquea sin apartar', async () => {
    const fixture = await crearFixture();
    try {
      const { productId } = await crearProductoConLote(fixture, '4');
      const recipeId = await crearReceta(fixture);
      await crearLineaCompleta(recipeId, productId);
      const orderId = await crearBloqueado(fixture, recipeId, '10.0000');
      await prisma.recipeLine.deleteMany({ where: { recipeId } });

      expect(await reviewBlockedOrders({ companyId: fixture.companyId, now: new Date() })).toEqual({
        unblocked: 1,
        failed: [],
      });
      const fila = await filaDe(orderId);
      expect(fila.status).toBe('PENDIENTE');
      expect(fila.reservedAt).toBeNull();
      expect(await movimientosDe(orderId)).toEqual([]);
    } finally {
      await borrarFixture(fixture);
    }
  });
});

describe('reviewBlockedOrders contra la base — orden y alcance', () => {
  it('R16: con material para uno solo, se desbloquea el mas antiguo aunque se haya creado despues en la tabla', async () => {
    const fixture = await crearFixture();
    try {
      const { productId } = await crearProductoConLote(fixture, '1');
      const recipeId = await crearReceta(fixture);
      await crearLineaCompleta(recipeId, productId);
      const nuevo = await crearBloqueado(fixture, recipeId, '10.0000');
      const viejo = await crearBloqueado(fixture, recipeId, '10.0000');
      // El segundo insertado pasa a ser el mas antiguo: el orden sale de `created_at`.
      const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000);
      await prisma.$executeRaw`UPDATE "orders" SET "created_at" = ${ayer}::timestamptz, "order_year" = ${ayer.getUTCFullYear()} WHERE "id" = ${viejo}::uuid`;
      await sumarLoteSinAvisar(fixture, productId, '10');

      const resultado = await reviewBlockedOrders({ companyId: fixture.companyId, now: new Date() });

      expect(resultado).toEqual({ unblocked: 1, failed: [] });
      expect((await filaDe(viejo)).status).toBe('PENDIENTE');
      expect((await filaDe(nuevo)).status).toBe('BLOQUEADO');
    } finally {
      await borrarFixture(fixture);
    }
  });

  it('R18, R38: no toca un PENDIENTE de la empresa ni un BLOQUEADO de otra empresa', async () => {
    const a = await crearFixture();
    const b = await crearFixture();
    try {
      const prodA = await crearProductoConLote(a, '100');
      const recetaA = await crearReceta(a);
      await crearLineaCompleta(recetaA, prodA.productId);
      const pendiente = await createOrder(
        { recipeId: recetaA, quantity: '10.0000', unitId: a.unitId },
        actorDe(a),
      );
      const pendienteAntes = await filaDe(pendiente.id);

      const prodB = await crearProductoConLote(b, '1');
      const recetaB = await crearReceta(b);
      await crearLineaCompleta(recetaB, prodB.productId);
      const bloqueadoB = await crearBloqueado(b, recetaB, '10.0000');
      await sumarLoteSinAvisar(b, prodB.productId, '50');

      const resultado = await reviewBlockedOrders({ companyId: a.companyId, now: new Date() });

      expect(resultado).toEqual({ unblocked: 0, failed: [] });
      expect(await filaDe(pendiente.id)).toEqual(pendienteAntes);
      expect((await filaDe(bloqueadoB)).status).toBe('BLOQUEADO');
      expect(await movimientosDe(bloqueadoB)).toEqual([]);
    } finally {
      await borrarFixture(a);
      await borrarFixture(b);
    }
  });
});

describe('reviewBlockedOrders contra la base — concurrencia', () => {
  it('R24: dos revisiones concurrentes, cada una en su transaccion, desbloquean una sola vez', async () => {
    const fixture = await crearFixture();
    try {
      const { productId } = await crearProductoConLote(fixture, '1');
      const recipeId = await crearReceta(fixture);
      await crearLineaCompleta(recipeId, productId);
      const orderId = await crearBloqueado(fixture, recipeId, '10.0000');
      await sumarLoteSinAvisar(fixture, productId, '50');

      const [primera, segunda] = await Promise.all([
        reviewBlockedOrders({ companyId: fixture.companyId, now: new Date() }),
        reviewBlockedOrders({ companyId: fixture.companyId, now: new Date() }),
      ]);

      expect(primera.unblocked + segunda.unblocked).toBe(1);
      expect([...primera.failed, ...segunda.failed]).toEqual([]);
      expect((await filaDe(orderId)).status).toBe('PENDIENTE');
      expect(await apartadoSinAutor(orderId)).toBe('10.0000');
    } finally {
      await borrarFixture(fixture);
    }
  });

  it('R24: una cancelacion que tiene la fila bloqueada cuando llega la revision gana, y el pedido no se desbloquea', async () => {
    const fixture = await crearFixture();
    try {
      const { productId } = await crearProductoConLote(fixture, '1');
      const recipeId = await crearReceta(fixture);
      await crearLineaCompleta(recipeId, productId);
      const orderId = await crearBloqueado(fixture, recipeId, '10.0000');
      await sumarLoteSinAvisar(fixture, productId, '50');

      let soltar: () => void = () => undefined;
      const suelta = new Promise<void>((resolve) => {
        soltar = resolve;
      });
      let avisarCandado: () => void = () => undefined;
      const candadoTomado = new Promise<void>((resolve) => {
        avisarCandado = resolve;
      });
      const cancelacion = prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "orders" WHERE "id" = ${orderId}::uuid FOR UPDATE`;
          await tx.order.update({
            where: { id: orderId },
            data: { status: 'CANCELADO', cancellationReason: 'Cliente anulo' },
          });
          avisarCandado();
          await suelta;
        },
        { maxWait: 10_000, timeout: 30_000 },
      );
      await candadoTomado;

      const revision = reviewBlockedOrders({ companyId: fixture.companyId, now: new Date() });
      await esperarAlguienEsperandoCandado();
      soltar();
      await cancelacion;
      const resultado = await revision;

      expect(resultado).toEqual({ unblocked: 0, failed: [] });
      expect((await filaDe(orderId)).status).toBe('CANCELADO');
      expect(await movimientosDe(orderId)).toEqual([]);
    } finally {
      await borrarFixture(fixture);
    }
  });

  it('R24: un BLOQUEADO cancelado antes de la revision no se desbloquea', async () => {
    const fixture = await crearFixture();
    try {
      const { productId } = await crearProductoConLote(fixture, '1');
      const recipeId = await crearReceta(fixture);
      await crearLineaCompleta(recipeId, productId);
      const orderId = await crearBloqueado(fixture, recipeId, '10.0000');
      await cancelOrder(orderId, { reason: 'Cliente anulo' }, actorDe(fixture));
      await sumarLoteSinAvisar(fixture, productId, '50');

      expect(await reviewBlockedOrders({ companyId: fixture.companyId, now: new Date() })).toEqual({
        unblocked: 0,
        failed: [],
      });
      expect((await filaDe(orderId)).status).toBe('CANCELADO');
    } finally {
      await borrarFixture(fixture);
    }
  });
});

// ---------------------------------------------------------------------------
// T8 — el disparo desde `inventario`, por la fachada cableada
// ---------------------------------------------------------------------------

describe('la fachada de inventario dispara la revision', () => {
  it('R13, R37, R38: un lote adicional en A, con solo inventario.modificar, desbloquea A y no toca B', async () => {
    const a = await crearFixture();
    const b = await crearFixture();
    try {
      const prodA = await crearProductoConLote(a, '1');
      const recetaA = await crearReceta(a);
      await crearLineaCompleta(recetaA, prodA.productId);
      const bloqueadoA = await crearBloqueado(a, recetaA, '10.0000');

      const prodB = await crearProductoConLote(b, '1');
      const recetaB = await crearReceta(b);
      await crearLineaCompleta(recetaB, prodB.productId);
      const bloqueadoB = await crearBloqueado(b, recetaB, '10.0000');
      // B ya alcanza, pero nadie le aviso: solo una entrada de material en B lo revisaria.
      await sumarLoteSinAvisar(b, prodB.productId, '50');

      const alta = await inventario.createProduct(
        { name: prodA.name, stock: '20', presentationId: a.presentationId, unitCost: '2.5000', qtyAlert: '1' },
        almacenistaDe(a),
      );

      expect(alta.id).toBe(prodA.productId);
      expect((await filaDe(bloqueadoA)).status).toBe('PENDIENTE');
      expect((await filaDe(bloqueadoB)).status).toBe('BLOQUEADO');
      expect(await movimientosDe(bloqueadoB)).toEqual([]);
    } finally {
      await borrarFixture(a);
      await borrarFixture(b);
    }
  });

  it('R13: el primer lote de un producto nuevo tambien dispara la revision', async () => {
    const fixture = await crearFixture();
    try {
      const { productId } = await crearProductoConLote(fixture, '1');
      const recipeId = await crearReceta(fixture);
      await crearLineaCompleta(recipeId, productId);
      const orderId = await crearBloqueado(fixture, recipeId, '10.0000');
      // Sin lineas ya no le falta nada: lo unico que lo saca de BLOQUEADO es que alguien revise.
      await prisma.recipeLine.deleteMany({ where: { recipeId } });

      await inventario.createProduct(
        { name: `Otro ${token()}`, stock: '1', presentationId: fixture.presentationId, unitCost: '1.0000', qtyAlert: '1' },
        almacenistaDe(fixture),
      );

      expect((await filaDe(orderId)).status).toBe('PENDIENTE');
    } finally {
      await borrarFixture(fixture);
    }
  });

  it('R13: un ajuste positivo desbloquea', async () => {
    const fixture = await crearFixture();
    try {
      const { productId, batchId } = await crearProductoConLote(fixture, '4');
      const recipeId = await crearReceta(fixture);
      await crearLineaCompleta(recipeId, productId);
      const orderId = await crearBloqueado(fixture, recipeId, '10.0000');

      await inventario.adjustBatchStock({ batchId, delta: '6', reason: 'conteo_fisico' }, almacenistaDe(fixture));

      expect((await filaDe(orderId)).status).toBe('PENDIENTE');
      expect(await movimientosDe(orderId)).toEqual([{ kind: 'reserve', quantity: '10.0000', createdBy: null }]);
    } finally {
      await borrarFixture(fixture);
    }
  });

  it('R20: un ajuste negativo no dispara la revision aunque el bloqueado ya alcance', async () => {
    const fixture = await crearFixture();
    try {
      const { productId, batchId } = await crearProductoConLote(fixture, '4');
      const recipeId = await crearReceta(fixture);
      await crearLineaCompleta(recipeId, productId);
      const orderId = await crearBloqueado(fixture, recipeId, '10.0000');
      await sumarLoteSinAvisar(fixture, productId, '50');

      await inventario.adjustBatchStock({ batchId, delta: '-1', reason: 'merma' }, almacenistaDe(fixture));

      expect((await filaDe(orderId)).status).toBe('BLOQUEADO');
    } finally {
      await borrarFixture(fixture);
    }
  });

  it('R19: un ajuste negativo que deja sin cubrir a un PENDIENTE no lo bloquea', async () => {
    const fixture = await crearFixture();
    try {
      const { productId, batchId } = await crearProductoConLote(fixture, '10');
      const recipeId = await crearReceta(fixture);
      await crearLineaCompleta(recipeId, productId);
      const pendiente = await createOrder(
        { recipeId, quantity: '10.0000', unitId: fixture.unitId },
        actorDe(fixture),
      );

      await inventario.adjustBatchStock({ batchId, delta: '-5', reason: 'merma' }, almacenistaDe(fixture));

      expect((await filaDe(pendiente.id)).status).toBe('PENDIENTE');
    } finally {
      await borrarFixture(fixture);
    }
  });

  it('R23: si la revision falla, el alta del lote no falla, el lote queda escrito y el fallo se registra', async () => {
    const fixture = await crearFixture();
    const sufijo = token().slice(0, 16);
    const funcion = `qc_review_fails_${sufijo}`;
    const disparador = `qc_review_fails_trg_${sufijo}`;
    try {
      const { productId, name } = await crearProductoConLote(fixture, '1');
      const recipeId = await crearReceta(fixture);
      await crearLineaCompleta(recipeId, productId);
      const orderId = await crearBloqueado(fixture, recipeId, '10.0000');
      // Cualquier UPDATE sobre ESTE pedido falla: la revision no puede desbloquearlo.
      await prisma.$executeRawUnsafe(
        `CREATE FUNCTION "${funcion}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fallo provocado'; END $$`,
      );
      await prisma.$executeRawUnsafe(
        `CREATE TRIGGER "${disparador}" BEFORE UPDATE ON "orders" FOR EACH ROW WHEN (OLD."id" = '${orderId}'::uuid) EXECUTE FUNCTION "${funcion}"()`,
      );
      registroPedidos.mockClear();
      const lotesAntes = await prisma.productBatch.count({ where: { productId } });

      const alta = await inventario.createProduct(
        { name, stock: '20', presentationId: fixture.presentationId, unitCost: '2.5000', qtyAlert: '1' },
        almacenistaDe(fixture),
      );

      expect(alta.id).toBe(productId);
      expect(await prisma.productBatch.count({ where: { productId } })).toBe(lotesAntes + 1);
      expect((await filaDe(orderId)).status).toBe('BLOQUEADO');
      expect(await movimientosDe(orderId)).toEqual([]);
      const avisos = registroPedidos.mock.calls.filter(([evento]) => evento === 'blocked_orders_review_failed');
      expect(avisos).toHaveLength(1);
      const campos = avisos[0]?.[1];
      expect(campos).toMatchObject({ companyId: fixture.companyId, failedCount: 1 });
      expect(JSON.parse(String(campos?.failed))).toEqual([{ orderId, code: expect.any(String) }]);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${disparador}" ON "orders"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${funcion}"()`);
      await borrarFixture(fixture);
    }
  });
});
