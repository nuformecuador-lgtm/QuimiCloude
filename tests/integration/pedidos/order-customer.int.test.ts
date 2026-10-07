/**
 * El cliente del pedido contra Postgres real: el cambio de cliente escribe solo `customer_id`,
 * `updated_by` y `updated_at`; la edicion que solo cambia el cliente no recalcula ni toca lo
 * apartado; y los filtros «cliente» y «sin cliente» del listado se resuelven en la base, sin
 * salir de la empresa.
 *
 * Los casos de uso se cablean a mano con los adaptadores driven REALES, los mismos que ata
 * `lib/composition`, sin cargar la composicion entera.
 *
 * AISLAMIENTO: `withOrderTransaction` abre su PROPIA `prisma.$transaction` sobre el cliente
 * global, asi que envolver el caso en una transaccion del test no lo aislaria. Cada caso fabrica
 * sus empresas efimeras con randomUUID y las borra en un `finally`, en orden de FK.
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';

import { normalizeCustomerText } from '@/lib/modules/clientes/domain/customer-text';
import {
  findAliveCustomerRefById,
  findCustomerRefsIncludingDeleted,
} from '@/lib/modules/clientes/adapters/driven/persistence/customer-catalog-prisma';
import { normalizeCompanyName } from '@/lib/modules/identity';
import { findPackagingCostingBatches, findPackagingRefs } from '@/lib/modules/inventario/adapters/driven/persistence/packaging-catalog-prisma';
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
import { findMassVolumeBridge, findUnitRefs } from '@/lib/modules/unidades/adapters/driven/persistence/unit-catalog-prisma';
import { findUnitRefsSharingBaseInCompany } from '@/lib/modules/unidades/adapters/driven/persistence/unit-prisma';
import { prisma } from '@/lib/shared/db/prisma';
import {
  createCreateOrder,
  createListOrders,
  createSetOrderCustomer,
  createUpdateOrder,
} from '@/lib/modules/pedidos';

import type { Actor } from '@/lib/modules/pedidos';
import type { PackagingCatalog, PresentationCatalog, ProductCatalog } from '@/lib/modules/inventario';
import type { OrderRepository } from '@/lib/modules/pedidos/ports/order-repository';
import type { OrderTransactionScope, OrderUnitOfWork } from '@/lib/modules/pedidos/ports/order-unit-of-work';
import type { RecipeCatalog } from '@/lib/modules/recetas';
import type { UnitCatalog } from '@/lib/modules/unidades';

import { orderScopeReaders } from '../../helpers/order-scope-readers';

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
// El cableado REAL
// ---------------------------------------------------------------------------

const customerCatalog = {
  findAliveRefById: (id: string, companyId: string) => findAliveCustomerRefById(id, { companyId }),
  findRefsIncludingDeleted: (ids: readonly string[], companyId: string) =>
    findCustomerRefsIncludingDeleted(ids, { companyId }),
};

const orders: OrderRepository = { findAliveById: findAliveOrderById, listAlive: listAliveOrders, findBlockedIds: findBlockedOrderIds };

const unitOfWork: OrderUnitOfWork = {
  run: (work) =>
    withOrderTransaction((tx) => {
      const scope: OrderTransactionScope = {
        orders: createOrderWriteRepository(tx),
        reservations: createMaterialReservations(tx),
        recipes: createRecipeExecutionReader(tx),
        ...orderScopeReaders(tx),
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
const packaging: PackagingCatalog = { findRefs: findPackagingRefs, findCostingBatches: findPackagingCostingBatches };
const units: UnitCatalog = {
  findRefs: findUnitRefs,
  listVisibleRefs: () => Promise.reject(new Error('no se usa')),
  findMassVolumeBridge: () => findMassVolumeBridge(),
  findRefsSharingBaseInCompany: findUnitRefsSharingBaseInCompany,
};

const createOrder = createCreateOrder({ customerCatalog, recipes, products, units, presentations, packaging, unitOfWork, now: () => new Date() });
const updateOrder = createUpdateOrder({ customerCatalog, orders, recipes, products, units, presentations, packaging, unitOfWork, now: () => new Date() });
const setOrderCustomer = createSetOrderCustomer({ orders, customerCatalog, unitOfWork, now: () => new Date() });
const listOrders = createListOrders({
  orders,
  recipes,
  presentations,
  packaging,
  units,
  customerCatalog,
  log: { ignoredFields: () => undefined },
});

// ---------------------------------------------------------------------------
// Empresa efimera
// ---------------------------------------------------------------------------

type Fixture = {
  readonly companyId: string;
  readonly actorId: string;
  readonly otherActorId: string;
  readonly roleId: string;
  readonly documentTypeCode: string;
  readonly presentationId: string;
  readonly unitId: string;
  readonly productIds: string[];
};

function actorDe(fixture: Fixture, id: string = fixture.actorId): Actor {
  return { id, companyId: fixture.companyId, permissions: ['pedidos.consultar', 'pedidos.modificar'] };
}

async function crearUsuario(companyId: string, roleId: string, documentTypeCode: string): Promise<string> {
  const marca = token();
  const user = await prisma.user.create({
    data: {
      firstNames: 'Ana Maria',
      lastNames: 'Perez Gomez',
      birthDate: new Date('1990-05-17T00:00:00.000Z'),
      email: `ana.${marca}@quimicloude.test`,
      phone: '+57 300 111 2233',
      documentTypeCode,
      documentNumber: marca.slice(0, 12),
      username: `ana.${marca}`,
      passwordHash: 'hash-de-prueba-no-es-un-algoritmo-real',
      roleId,
      companyId,
    },
    select: { id: true },
  });
  return user.id;
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
  const actorId = await crearUsuario(company.id, role.id, documentType.code);
  const otherActorId = await crearUsuario(company.id, role.id, documentType.code);
  const unit = await prisma.unit.create({
    data: { name: `Unidad ${marca}`, nameNormalized: `unidad${marca}`, symbol: `kg${marca}` },
    select: { id: true },
  });
  const presentation = await prisma.presentation.create({
    data: {
      name: `Bidon ${marca}`,
      nameNormalized: normalizeForTest(`Bidon ${marca}`),
      unitId: unit.id,
      companyId: company.id,
      content: '1.0000',
    },
    select: { id: true },
  });
  return {
    companyId: company.id,
    actorId,
    otherActorId,
    roleId: role.id,
    documentTypeCode: documentType.code,
    presentationId: presentation.id,
    unitId: unit.id,
    productIds: [],
  };
}

async function borrarFixture(fixture: Fixture): Promise<void> {
  const { companyId } = fixture;
  await prisma.reservationMovement.deleteMany({ where: { companyId } });
  await prisma.inventoryMovement.deleteMany({ where: { companyId } });
  await prisma.orderAssignment.deleteMany({ where: { companyId } });
  await prisma.order.deleteMany({ where: { companyId } });
  await prisma.customer.deleteMany({ where: { companyId } });
  await prisma.recipeLine.deleteMany({ where: { recipe: { companyId } } });
  await prisma.recipe.deleteMany({ where: { companyId } });
  await prisma.productBatch.deleteMany({ where: { productId: { in: fixture.productIds } } });
  await prisma.product.deleteMany({ where: { id: { in: fixture.productIds } } });
  await prisma.presentation.deleteMany({ where: { id: fixture.presentationId } });
  await prisma.unit.deleteMany({ where: { id: fixture.unitId } });
  await prisma.user.deleteMany({ where: { id: { in: [fixture.actorId, fixture.otherActorId] } } });
  await prisma.role.deleteMany({ where: { id: fixture.roleId } });
  await prisma.documentType.deleteMany({ where: { code: fixture.documentTypeCode } });
  await prisma.company.deleteMany({ where: { id: companyId } });
}

async function crearCliente(fixture: Fixture, lastNames: string): Promise<string> {
  const city = 'Bogota';
  const created = await prisma.customer.create({
    data: {
      firstNames: 'Cliente',
      firstNamesNormalized: normalizeCustomerText('Cliente'),
      lastNames,
      lastNamesNormalized: normalizeCustomerText(lastNames),
      city,
      cityNormalized: normalizeCustomerText(city),
      companyId: fixture.companyId,
    },
    select: { id: true },
  });
  return created.id;
}

/** Receta de una sola linea al 100 % sobre un producto con existencias de sobra. */
async function crearReceta(fixture: Fixture, name: string): Promise<string> {
  const created = await createWithFirstBatch(
    { name: `Producto ${token()}` },
    {
      presentationId: fixture.presentationId,
      stock: '1000',
      unitCost: '2.5000',
      lot: null,
      purchaseDate: '2026-09-01',
      expiryDate: null,
      createdBy: fixture.actorId,
    },
    new Date(),
    { companyId: fixture.companyId },
  );
  fixture.productIds.push(created.id);
  const recipe = await prisma.recipe.create({
    data: { name, nameNormalized: normalizeForTest(name), companyId: fixture.companyId, createdBy: fixture.actorId },
    select: { id: true },
  });
  await prisma.recipeLine.create({
    data: { recipeId: recipe.id, productId: created.id, percentage: new Prisma.Decimal('100.00') },
  });
  return recipe.id;
}

function entrada(fixture: Fixture, recipeId: string, customerId: string | null) {
  return { recipeId, quantity: '2.0000', priority: 'BAJA', unitId: fixture.unitId, presentationLines: [], customerId: customerId ?? '' };
}

async function crearPedido(fixture: Fixture, recipeId: string, customerId: string | null): Promise<string> {
  const creado = await createOrder(entrada(fixture, recipeId, customerId), actorDe(fixture));
  return creado.id;
}

/** La fila completa del pedido, tal como la guarda la base. */
async function filaDe(orderId: string): Promise<Record<string, unknown>> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>(
    Prisma.sql`SELECT * FROM "orders" WHERE "id" = ${orderId}::uuid`,
  );
  const row = rows[0];
  if (row === undefined) throw new Error(`no existe el pedido ${orderId}`);
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : String(value)]),
  );
}

function sinColumnas(row: Record<string, unknown>, columnas: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !columnas.includes(key)));
}

/** Los tres libros que el cambio de cliente no puede tocar, de toda la empresa. */
async function librosDe(companyId: string): Promise<string> {
  const [reservas, movimientos, asignaciones] = await Promise.all([
    prisma.reservationMovement.findMany({ where: { companyId }, orderBy: { id: 'asc' } }),
    prisma.inventoryMovement.findMany({ where: { companyId }, orderBy: { id: 'asc' } }),
    prisma.orderAssignment.findMany({ where: { companyId }, orderBy: [{ orderId: 'asc' }, { userId: 'asc' }] }),
  ]);
  return JSON.stringify({ reservas, movimientos, asignaciones });
}

const ESCRITAS_DEL_CLIENTE = ['customer_id', 'updated_by', 'updated_at'] as const;
const INTACTAS = ['reserved_at', 'ingredients_cost', 'packaging_cost', 'status', 'packed_by', 'finished_at'] as const;

async function listar(fixture: Fixture, filters: Record<string, unknown>, search = ''): Promise<{ ids: string[]; total: number }> {
  const page = await listOrders({ page: 1, pageSize: 25, sort: null, filters, search }, actorDe(fixture));
  return { ids: page.items.map((item) => item.id).sort(), total: page.total };
}

afterAll(async () => {
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------

describe('setCustomerAlive escribe solo el cliente y el sello de modificacion', () => {
  it('R14, R15: en un pedido entregado y empacado, solo cambian customer_id, updated_by y updated_at; los libros no cambian', async () => {
    const fixture = await crearFixture();
    try {
      const recipeId = await crearReceta(fixture, `Receta ${token()}`);
      const orderId = await crearPedido(fixture, recipeId, null);
      const clienteId = await crearCliente(fixture, `Uno ${token()}`);
      // Estado final con quien empaco y fecha de terminado: las columnas que no se pueden tocar
      // llevan valor, para que un cambio se note.
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'ENTREGADO',
          packedBy: fixture.actorId,
          finishedAt: new Date('2026-09-02T10:00:00.000Z'),
          updatedAt: new Date('2026-09-02T10:00:00.000Z'),
        },
      });
      await prisma.orderAssignment.create({ data: { orderId, userId: fixture.actorId, companyId: fixture.companyId } });

      const antes = await filaDe(orderId);
      const librosAntes = await librosDe(fixture.companyId);
      for (const columna of INTACTAS) expect(antes[columna], columna).not.toBe('null');

      await setOrderCustomer(orderId, { customerId: clienteId }, actorDe(fixture, fixture.otherActorId));

      const despues = await filaDe(orderId);
      expect(sinColumnas(despues, ESCRITAS_DEL_CLIENTE)).toEqual(sinColumnas(antes, ESCRITAS_DEL_CLIENTE));
      for (const columna of INTACTAS) expect(despues[columna], columna).toBe(antes[columna]);
      expect(despues['customer_id']).toBe(clienteId);
      expect(despues['updated_by']).toBe(fixture.otherActorId);
      expect(despues['updated_at']).not.toBe(antes['updated_at']);
      expect(await librosDe(fixture.companyId)).toBe(librosAntes);

      // Quitarlo tampoco toca nada mas.
      await setOrderCustomer(orderId, { customerId: null }, actorDe(fixture));
      const sinCliente = await filaDe(orderId);
      expect(sinCliente['customer_id']).toBe('null');
      expect(sinColumnas(sinCliente, ESCRITAS_DEL_CLIENTE)).toEqual(sinColumnas(antes, ESCRITAS_DEL_CLIENTE));
      expect(await librosDe(fixture.companyId)).toBe(librosAntes);
    } finally {
      await borrarFixture(fixture);
    }
  });

  it('R15: con el ambito de otra empresa no escribe nada y responde not_found', async () => {
    const A = await crearFixture();
    const B = await crearFixture();
    try {
      const recipeId = await crearReceta(A, `Receta ${token()}`);
      const orderId = await crearPedido(A, recipeId, null);
      const antes = await filaDe(orderId);

      const resultado = await createOrderWriteRepository(prisma).setCustomerAlive(
        orderId,
        null,
        B.actorId,
        new Date(),
        { companyId: B.companyId },
      );

      expect(resultado).toBe('not_found');
      expect(await filaDe(orderId)).toEqual(antes);
    } finally {
      await borrarFixture(A);
      await borrarFixture(B);
    }
  });
});

describe('la edicion que solo cambia el cliente', () => {
  it('R13: no recalcula ni toca lo apartado; solo cambian customer_id, updated_by y updated_at', async () => {
    const fixture = await crearFixture();
    try {
      const recipeId = await crearReceta(fixture, `Receta ${token()}`);
      const orderId = await crearPedido(fixture, recipeId, null);
      const clienteId = await crearCliente(fixture, `Uno ${token()}`);
      // Si la edicion recalculara, este importe a mano no sobreviviria.
      await prisma.order.update({
        where: { id: orderId },
        data: {
          ingredientsCost: new Prisma.Decimal('123.4567'),
          packagingCost: new Prisma.Decimal('0.0000'),
          updatedAt: new Date('2026-09-02T10:00:00.000Z'),
        },
      });

      const antes = await filaDe(orderId);
      const librosAntes = await librosDe(fixture.companyId);

      await updateOrder(orderId, entrada(fixture, recipeId, clienteId), actorDe(fixture, fixture.otherActorId));

      const despues = await filaDe(orderId);
      expect(sinColumnas(despues, ESCRITAS_DEL_CLIENTE)).toEqual(sinColumnas(antes, ESCRITAS_DEL_CLIENTE));
      expect(despues['ingredients_cost']).toBe('123.4567');
      expect(despues['customer_id']).toBe(clienteId);
      expect(despues['updated_by']).toBe(fixture.otherActorId);
      expect(despues['updated_at']).not.toBe(antes['updated_at']);
      expect(await librosDe(fixture.companyId)).toBe(librosAntes);
    } finally {
      await borrarFixture(fixture);
    }
  });
});

describe('los filtros de cliente del listado, en la base', () => {
  it('R23, R24: por cliente, «sin cliente» y los dos a la vez, sin salir de la empresa', async () => {
    const A = await crearFixture();
    const B = await crearFixture();
    try {
      const marca = token();
      const alfa = await crearReceta(A, `Alfa ${marca}`);
      const beta = await crearReceta(A, `Beta ${marca}`);
      const uno = await crearCliente(A, `Uno ${marca}`);
      const dos = await crearCliente(A, `Dos ${marca}`);

      const alfaUno = await crearPedido(A, alfa, uno);
      const betaUno = await crearPedido(A, beta, uno);
      const alfaDos = await crearPedido(A, alfa, dos);
      const alfaSin = await crearPedido(A, alfa, null);
      const betaSin = await crearPedido(A, beta, null);
      await prisma.order.update({ where: { id: betaUno }, data: { status: 'EN_CURSO' } });

      // En B: un pedido sin cliente y otro con un cliente suyo.
      const recetaB = await crearReceta(B, `Alfa ${marca}`);
      const deB = await crearCliente(B, `Uno ${marca}`);
      await crearPedido(B, recetaB, null);
      await crearPedido(B, recetaB, deB);

      const porCliente = { customerId: { kind: 'select', values: [uno] } };
      const sinCliente = { customerPresence: { kind: 'select', values: ['none'] } };

      expect(await listar(A, porCliente)).toEqual({ ids: [alfaUno, betaUno].sort(), total: 2 });
      expect(
        await listar(A, { ...porCliente, status: { kind: 'select', values: ['PENDIENTE'] } }),
      ).toEqual({ ids: [alfaUno], total: 1 });
      expect(await listar(A, porCliente, `Alfa ${marca}`)).toEqual({ ids: [alfaUno], total: 1 });
      expect(await listar(B, porCliente)).toEqual({ ids: [], total: 0 });

      // El pedido sin cliente de B no aparece.
      expect(await listar(A, sinCliente)).toEqual({ ids: [alfaSin, betaSin].sort(), total: 2 });

      expect(
        await listar(A, { customerId: { kind: 'select', values: [dos] }, ...sinCliente }),
      ).toEqual({ ids: [alfaDos, alfaSin, betaSin].sort(), total: 3 });
      expect(
        await listar(A, { customerId: { kind: 'select', values: [dos] }, ...sinCliente }, `Beta ${marca}`),
      ).toEqual({ ids: [betaSin], total: 1 });
    } finally {
      await borrarFixture(A);
      await borrarFixture(B);
    }
  });

  it('R19, R20: la pagina trae el nombre del cliente, tambien si se dio de baja', async () => {
    const fixture = await crearFixture();
    try {
      const recipeId = await crearReceta(fixture, `Receta ${token()}`);
      const lastNames = `Baja ${token()}`;
      const clienteId = await crearCliente(fixture, lastNames);
      const orderId = await crearPedido(fixture, recipeId, clienteId);
      await prisma.customer.update({ where: { id: clienteId }, data: { deletedAt: new Date() } });

      const page = await listOrders({ page: 1, pageSize: 25, sort: null, filters: {}, search: '' }, actorDe(fixture));
      const item = page.items.find((candidate) => candidate.id === orderId);
      expect(item?.customer).toEqual({ id: clienteId, name: `Cliente ${lastNames}`, isDeleted: true });
    } finally {
      await borrarFixture(fixture);
    }
  });
});
