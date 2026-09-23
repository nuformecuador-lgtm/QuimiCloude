/**
 * Concurrencia de la reserva contra Postgres real, con DOS conexiones autenticas compitiendo
 * por la misma fila de producto: dos altas simultaneas, una merma simultanea a un apartado, y
 * cien vueltas de combinaciones de crear/editar/cancelar/borrar/Finalizar sobre el mismo
 * producto sin interbloqueo.
 *
 * AISLAMIENTO — mismo criterio que `order-reservation.int.test.ts`: `withOrderTransaction` y
 * `adjustBatchStock` abren cada uno SU PROPIA `prisma.$transaction` contra el cliente GLOBAL, asi
 * que envolver la corrida en una transaccion del test seria aislamiento de mentira -correrian en
 * otra conexion del pool y no competirian por la misma fila-. `Promise.all`, sin `await` entre
 * las dos llamadas, es lo que las hace competir de verdad por el bloqueo `FOR NO KEY UPDATE` del
 * producto, igual que `product-stock.int.test.ts`. Cada caso fabrica su propia empresa efimera
 * con randomUUID y la limpia en un `finally`.
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import { findCostingBatches, findProductRefs } from '@/lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma';
import { adjustBatchStock, createWithFirstBatch } from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import { createMaterialReservations } from '@/lib/modules/inventario/adapters/driven/persistence/reservation-prisma';
import { findPresentationRefs } from '@/lib/modules/inventario/adapters/driven/persistence/presentation-catalog-prisma';
import {
  findAliveOrderById,
  listAliveOrders,
  createOrderWriteRepository,
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
  createCancelOrder,
  createCreateOrder,
  createDeleteOrder,
  createTransitionOrder,
  createUpdateOrder,
} from '@/lib/modules/pedidos';

import type { Actor, NewOrder, OrderCatalog } from '@/lib/modules/pedidos';
import type { InventoryScope } from '@/lib/modules/inventario/domain/inventory-scope';
import type { PresentationCatalog, ProductCatalog } from '@/lib/modules/inventario';
import type { OrderRepository } from '@/lib/modules/pedidos/ports/order-repository';
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

const orders: OrderRepository = { findAliveById: findAliveOrderById, listAlive: listAliveOrders };

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
const updateOrder = createUpdateOrder({ orders, recipes, products, units, presentations, unitOfWork, now: () => new Date() });
const cancelOrder = createCancelOrder({ orders, unitOfWork, now: () => new Date() });
const deleteOrder = createDeleteOrder({ orders, unitOfWork, now: () => new Date() });
const transitionAliveById: OrderCatalog['transitionAliveById'] = createTransitionOrder({ unitOfWork, recipes });

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

function ambitoDe(fixture: Fixture): InventoryScope {
  return { companyId: fixture.companyId };
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

/** Una unica linea al 100 %: la necesidad queda igual a la cantidad del pedido. */
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

function nuevoPedido(recipeId: string, presentationId: string, quantity: string, status: NewOrder['status'] = 'PENDIENTE'): NewOrder {
  return { recipeId, quantity, priority: 'BAJA', status, presentationId };
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

async function reservedAtDe(orderId: string): Promise<Date | null> {
  const row = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { reservedAt: true } });
  return row.reservedAt;
}

async function stockDe(batchId: string): Promise<string> {
  const row = await prisma.productBatch.findUniqueOrThrow({ where: { id: batchId }, select: { stock: true } });
  return row.stock.toFixed(4);
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('R16 — dos altas simultaneas de 1.500 sobre 2.000 disponibles dejan exactamente una apartada', () => {
  it('con cinco lotes independientes de 2.000, cada carrera deja una reserva de 1.500 y la otra sin apartar', async () => {
    for (let vuelta = 0; vuelta < 5; vuelta += 1) {
      const fixture = await crearFixture();
      const { productId, batchId } = await crearProductoConLote(fixture, '2000');
      const recipeId = await crearReceta(fixture);
      await crearLineaCompleta(recipeId, productId);

      try {
        // Sin `await` entre las dos llamadas: compiten de verdad por el bloqueo del producto.
        const [primero, segundo] = await Promise.all([
          createOrder(nuevoPedido(recipeId, fixture.presentationId, '1500.0000'), actorDe(fixture)),
          createOrder(nuevoPedido(recipeId, fixture.presentationId, '1500.0000'), actorDe(fixture)),
        ]);

        const [reservedAtPrimero, reservedAtSegundo, movimientosPrimero, movimientosSegundo] = await Promise.all([
          reservedAtDe(primero.id),
          reservedAtDe(segundo.id),
          movimientosDe(primero.id),
          movimientosDe(segundo.id),
        ]);

        const apartados = [reservedAtPrimero, reservedAtSegundo].filter((valor) => valor !== null);
        expect(apartados).toHaveLength(1);

        const sumaApartada = [...movimientosPrimero, ...movimientosSegundo]
          .filter((movimiento) => movimiento.kind === 'reserve')
          .reduce((acumulado, movimiento) => acumulado + Number(movimiento.quantity), 0);
        expect(sumaApartada).toBe(1500);
        expect(sumaApartada).toBeLessThanOrEqual(2000);

        const movimientosDelQueNoAparto = reservedAtPrimero === null ? movimientosPrimero : movimientosSegundo;
        expect(movimientosDelQueNoAparto).toEqual([]);
        expect(await stockDe(batchId)).toBe('2000.0000');
      } finally {
        await borrarFixture(fixture, [productId]);
      }
    }
  });
});

describe('una merma simultanea a un apartado sobre el mismo producto no deja el lote en negativo', () => {
  it('con 50 disponibles, un apartado de 50 y una merma de -50 a la vez dejan el lote exactamente en cero', async () => {
    const fixture = await crearFixture();
    const { productId, batchId } = await crearProductoConLote(fixture, '50');
    const recipeId = await crearReceta(fixture);
    await crearLineaCompleta(recipeId, productId);

    try {
      // La reserva no toca `stock` -solo asienta en `reservation_movements`-, asi que el unico
      // camino hacia negativo es la propia merma; lo que aqui se comprueba es que el bloqueo del
      // producto deja a la merma leer el `stock` comprometido, gane quien gane la carrera.
      const [creado] = await Promise.all([
        createOrder(nuevoPedido(recipeId, fixture.presentationId, '50.0000'), actorDe(fixture)),
        adjustBatchStock(batchId, '-50', 'merma', fixture.actorId, new Date(), ambitoDe(fixture)),
      ]);

      expect(await stockDe(batchId)).toBe('0.0000');

      const reservedAtFinal = await reservedAtDe(creado.id);
      const movimientos = await movimientosDe(creado.id);
      if (reservedAtFinal !== null) {
        // El apartado gano la carrera: aparto 50 sobre el stock aun sin mermar.
        expect(movimientos).toEqual([{ kind: 'reserve', quantity: '50.0000', createdBy: fixture.actorId }]);
      } else {
        // La merma gano la carrera: dejo el stock en cero antes de que el apartado calculara
        // disponible, y el pedido queda sin apartar (E1/insuficiente), sin ningun asiento.
        expect(movimientos).toEqual([]);
      }
    } finally {
      await borrarFixture(fixture, [productId]);
    }
  });
});

describe('cien vueltas de crear, editar, cancelar, borrar y Finalizar sobre el mismo producto sin interbloqueo', () => {
  it('ninguna combinacion de las operaciones de T9 y T10 dispara un 40P01 en cien vueltas', async () => {
    const fixture = await crearFixture();
    const { productId } = await crearProductoConLote(fixture, '1000000');
    const recipeId = await crearReceta(fixture);
    await crearLineaCompleta(recipeId, productId);

    try {
      async function nuevaOrden(): Promise<string> {
        const creado = await createOrder(nuevoPedido(recipeId, fixture.presentationId, '1.0000'), actorDe(fixture));
        return creado.id;
      }

      const crear = () => createOrder(nuevoPedido(recipeId, fixture.presentationId, '1.0000'), actorDe(fixture));
      const editar = (orderId: string) => updateOrder(orderId, nuevoPedido(recipeId, fixture.presentationId, '2.0000'), actorDe(fixture));
      const cancelar = (orderId: string) => cancelOrder(orderId, { reason: 'vuelta de concurrencia' }, actorDe(fixture));
      const borrar = (orderId: string) => deleteOrder(orderId, actorDe(fixture));
      const finalizar = (orderId: string) =>
        transitionAliveById(orderId, fixture.companyId, 'PENDIENTE', 'ENTREGADO', fixture.actorId, new Date());

      // Cada constructor de combo prepara lo que haga falta (secuencial, fuera de la carrera) y
      // devuelve las DOS promesas ya lanzadas -sin `await` entre ellas- para que compitan de
      // verdad por la fila del producto compartido.
      const combos: ReadonlyArray<() => Promise<readonly [Promise<unknown>, Promise<unknown>]>> = [
        async () => [crear(), crear()],
        async () => {
          const id = await nuevaOrden();
          return [crear(), editar(id)];
        },
        async () => {
          const id = await nuevaOrden();
          return [crear(), cancelar(id)];
        },
        async () => {
          const id = await nuevaOrden();
          return [crear(), borrar(id)];
        },
        async () => {
          const id = await nuevaOrden();
          return [crear(), finalizar(id)];
        },
        async () => {
          const [a, b] = await Promise.all([nuevaOrden(), nuevaOrden()]);
          return [editar(a), cancelar(b)];
        },
        async () => {
          const [a, b] = await Promise.all([nuevaOrden(), nuevaOrden()]);
          return [editar(a), borrar(b)];
        },
        async () => {
          const [a, b] = await Promise.all([nuevaOrden(), nuevaOrden()]);
          return [editar(a), finalizar(b)];
        },
        async () => {
          const [a, b] = await Promise.all([nuevaOrden(), nuevaOrden()]);
          return [cancelar(a), borrar(b)];
        },
        async () => {
          const [a, b] = await Promise.all([nuevaOrden(), nuevaOrden()]);
          return [finalizar(a), cancelar(b)];
        },
        async () => {
          const [a, b] = await Promise.all([nuevaOrden(), nuevaOrden()]);
          return [editar(a), editar(b)];
        },
      ];

      const VUELTAS = 100;
      for (let vuelta = 0; vuelta < VUELTAS; vuelta += 1) {
        const combo = combos[vuelta % combos.length];
        if (combo === undefined) throw new Error('combo indefinido: revisar el modulo de la vuelta');
        const [primero, segundo] = await combo();

        const resultados = await Promise.allSettled([primero, segundo]);
        for (const resultado of resultados) {
          if (resultado.status !== 'rejected') continue;
          const motivo = resultado.reason;
          const codigo = motivo !== null && typeof motivo === 'object' && 'code' in motivo ? motivo.code : undefined;
          if (codigo === '40P01') {
            throw new Error(`interbloqueo (40P01) en la vuelta ${vuelta}, combo ${vuelta % combos.length}`);
          }
          throw motivo;
        }
      }
    } finally {
      await borrarFixture(fixture, [productId]);
    }
  }, 120_000);
});
