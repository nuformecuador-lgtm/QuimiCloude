/**
 * T21 — concurrencia y edicion de cantidad/unidad contra el reparto vigente, contra Postgres
 * REAL (`design.md > 2.2 bis`, `> 4.2`, `> 4.5`).
 *
 * El cableado es el MISMO que usan `order-reservation-concurrency.int.test.ts` y
 * `order-sequence-race.int.test.ts`: los adaptadores driven reales de `pedidos`, `inventario`,
 * `recetas` y `unidades`, sin dobles.
 *
 * R38 (caso 1) es secuencial: una edicion que baja la cantidad o cambia la unidad deja el
 * reparto vigente sin caber, y se rechaza sin escribir nada. No hace falta ninguna carrera para
 * demostrarlo -la transaccion de `updateOrder` ya bloquea la fila SOLA-.
 *
 * R37 (caso 2) usa DOS llamadas reales sin `await` entre ellas (mismo patron que las cien
 * vueltas de `order-reservation-concurrency.int.test.ts`): Postgres decide quien gana el `FOR
 * UPDATE` de `orders`, y la propiedad que se comprueba -la suma nunca pasa del total- vale
 * cualquiera que sea el orden real.
 *
 * R48 (caso 4) SI necesita un orden forzado en los dos sentidos, as: un `pg.Client` (`holder`)
 * toma el `SELECT ... FOR UPDATE` de la fila del pedido con SQL crudo -el MISMO que toma el
 * primer paso de `startPackingAliveOrder`/`updatePresentationLinesAliveOrder`- y lo retiene sin
 * confirmar; la llamada REAL contraria (por el pool de Prisma) se bloquea esperandolo; una vez
 * bloqueada, `holder` ejecuta la escritura exacta de la operacion que esta "ganando" la carrera
 * y confirma, soltando a la contraria para que la vea ya escrita. Mismo mecanismo medido en
 * `presentation-unit-race.int.test.ts`.
 *
 * R30/R46 (caso 5) es censo: se cuenta `reservation_movements`/`inventory_movements` del pedido
 * antes y despues de un cambio de unidad en `POR_EMPACAR`, y tiene que ser el mismo censo.
 *
 * AISLAMIENTO: por COMMIT, no por transaccion de test -cada caso de uso abre su PROPIA
 * transaccion contra el cliente global-. Cada caso fabrica su empresa efimera y la borra en un
 * `finally`.
 */
import { randomUUID } from 'node:crypto';

import { Client } from 'pg';
import { Prisma } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import { normalizePresentationName } from '@/lib/modules/inventario';
import { normalizeUnitName } from '@/lib/modules/unidades';
import { findProductRefs, findCostingBatches } from '@/lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma';
import { createWithFirstBatch, findFinishedGoodsReceipts } from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import { createMaterialReservations } from '@/lib/modules/inventario/adapters/driven/persistence/reservation-prisma';
import { createFinishedGoodsIntake } from '@/lib/modules/inventario/adapters/driven/persistence/finished-goods-prisma';
import { findPresentationRefs, findPresentationsByNormalizedNames } from '@/lib/modules/inventario/adapters/driven/persistence/presentation-catalog-prisma';
import {
  findAliveOrderById,
  findBlockedOrderIds,
  listAliveOrders,
  createOrderWriteRepository,
  startPackingAliveOrder,
} from '@/lib/modules/pedidos/adapters/driven/persistence/order-prisma';
import { withOrderTransaction } from '@/lib/modules/pedidos/adapters/driven/persistence/order-unit-of-work-prisma';
import {
  createRecipeExecutionReader,
  findRecipeExecutionContentById,
  findAliveRecipeByNormalizedName,
  findRecipeIdsMatchingName,
  findRecipeRefsIncludingDeleted,
} from '@/lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma';
import { findMassVolumeBridge, findUnitRefs } from '@/lib/modules/unidades/adapters/driven/persistence/unit-catalog-prisma';
import { findUnitRefsSharingBaseInCompany } from '@/lib/modules/unidades/adapters/driven/persistence/unit-prisma';
import { prisma } from '@/lib/shared/db/prisma';

import {
  createCreateOrder,
  createTransitionOrder,
  createUpdateOrder,
  createUpdateOrderPresentationLines,
} from '@/lib/modules/pedidos';
import {
  IncompatibleUnitsError,
  OrderDistributionExceedsQuantityError,
} from '@/lib/modules/pedidos';

import type { Actor, OrderCatalog } from '@/lib/modules/pedidos';
import type { PresentationCatalog, ProductCatalog } from '@/lib/modules/inventario';
import type { OrderRepository } from '@/lib/modules/pedidos/ports/order-repository';
import type { OrderTransactionScope, OrderUnitOfWork } from '@/lib/modules/pedidos/ports/order-unit-of-work';
import type { RecipeCatalog } from '@/lib/modules/recetas';
import type { UnitCatalog } from '@/lib/modules/unidades';
import { findPackagingCostingBatches, findPackagingRefs } from '@/lib/modules/inventario/adapters/driven/persistence/packaging-catalog-prisma';
import type { PackagingCatalog } from '@/lib/modules/inventario';

import { dropPackaging, seedPackaging } from '../../helpers/packaging-seed';
import { orderScopeReaders } from '../../helpers/order-scope-readers';
import { findAliveCustomerRefById } from '@/lib/modules/clientes/adapters/driven/persistence/customer-catalog-prisma';

const customerCatalog = {
  findAliveRefById: (id: string, companyId: string) => findAliveCustomerRefById(id, { companyId }),
};

const packagingCatalog: PackagingCatalog = { findRefs: findPackagingRefs, findCostingBatches: findPackagingCostingBatches };

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

function connectionString(): string {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (url === undefined || url.trim() === '') {
    throw new Error('falta DATABASE_URL (o DIRECT_URL) en el entorno de la corrida de integracion');
  }
  return url;
}

// ---------------------------------------------------------------------------
// El cableado REAL: los mismos adaptadores que `lib/composition`.
// ---------------------------------------------------------------------------

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
const units: UnitCatalog = {
  findRefs: findUnitRefs,
  listVisibleRefs: () => Promise.reject(new Error('no se usa')),
  findMassVolumeBridge: () => findMassVolumeBridge(),
  findRefsSharingBaseInCompany: findUnitRefsSharingBaseInCompany,
};

const createOrder = createCreateOrder({ customerCatalog, recipes, products, units, presentations, packaging: packagingCatalog, unitOfWork, now: () => new Date() });
const updateOrder = createUpdateOrder({ customerCatalog, orders, recipes, products, units, presentations, packaging: packagingCatalog, unitOfWork, now: () => new Date() });
const updateOrderPresentationLines = createUpdateOrderPresentationLines({
  recipes,
  products,
  presentations, packaging: packagingCatalog,
  units,
  unitOfWork,
});
const transitionAliveById: OrderCatalog['transitionAliveById'] = createTransitionOrder({ unitOfWork });

// ---------------------------------------------------------------------------
// Empresa efimera con DOS unidades independientes y DOS presentaciones.
// ---------------------------------------------------------------------------

type Fixture = {
  readonly companyId: string;
  readonly actorId: string;
  readonly roleId: string;
  readonly documentTypeCode: string;
  /** Unidad del pedido. Base propia, sin relacion con `unitIncompatibleId`. */
  readonly unitId: string;
  /** Otra unidad, SIN unidad base comun con `unitId`: convertir entre las dos falla siempre. */
  readonly unitIncompatibleId: string;
  /** Comparte base con `unitId` (factor 1): sirve para "cambiar de unidad sin romper nada". */
  readonly unitConvertibleId: string;
  /** Presentacion con contenido `10.0000`, en `unitId`. */
  readonly presentationId: string;
  /** Envase con `presentationId` como presentacion fija: lo que nombra el reparto. */
  readonly packagingProductId: string;
  readonly recipeId: string;
};

function normalizeForTest(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]/gu, '');
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
    data: { name: `Unidad ${marca}`, nameNormalized: normalizeUnitName(`Unidad ${marca}`), symbol: `u${marca}` },
    select: { id: true },
  });
  const unitIncompatible = await prisma.unit.create({
    data: {
      name: `Unidad incompatible ${marca}`,
      nameNormalized: normalizeUnitName(`Unidad incompatible ${marca}`),
      symbol: `x${marca}`,
    },
    select: { id: true },
  });
  const unitConvertible = await prisma.unit.create({
    data: {
      name: `Unidad convertible ${marca}`,
      nameNormalized: normalizeUnitName(`Unidad convertible ${marca}`),
      symbol: `c${marca}`,
      baseUnitId: unit.id,
      factor: new Prisma.Decimal('1.0000'),
    },
    select: { id: true },
  });
  const presentation = await prisma.presentation.create({
    data: {
      name: `Bidon ${marca}`,
      nameNormalized: normalizePresentationName(`Bidon ${marca}`),
      unitId: unit.id,
      companyId: company.id,
      content: new Prisma.Decimal('10.0000'),
    },
    select: { id: true },
  });
  const recipe = await prisma.recipe.create({
    data: { name: `Receta ${marca}`, nameNormalized: normalizeForTest(`Receta ${marca}`), companyId: company.id, createdBy: user.id },
    select: { id: true },
  });
  return {
    companyId: company.id,
    actorId: user.id,
    roleId: role.id,
    documentTypeCode: documentType.code,
    unitId: unit.id,
    unitIncompatibleId: unitIncompatible.id,
    unitConvertibleId: unitConvertible.id,
    presentationId: presentation.id,
    packagingProductId: await seedPackaging({ companyId: company.id, presentationId: presentation.id, createdBy: user.id }),
    recipeId: recipe.id,
  };
}

async function borrarFixture(fixture: Fixture, productIds: readonly string[] = []): Promise<void> {
  await prisma.reservationMovement.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.inventoryMovement.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.orderPresentationLine.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.order.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.recipeLine.deleteMany({ where: { recipe: { companyId: fixture.companyId } } });
  await prisma.recipe.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.productBatch.deleteMany({ where: { productId: { in: [...productIds] } } });
  await prisma.product.deleteMany({ where: { id: { in: [...productIds] } } });
  await dropPackaging([fixture.packagingProductId]);
  await prisma.presentation.deleteMany({ where: { id: fixture.presentationId } });
  await prisma.unit.deleteMany({
    where: { id: { in: [fixture.unitConvertibleId, fixture.unitIncompatibleId, fixture.unitId] } },
  });
  await prisma.user.deleteMany({ where: { id: fixture.actorId } });
  await prisma.role.deleteMany({ where: { id: fixture.roleId } });
  await prisma.documentType.deleteMany({ where: { code: fixture.documentTypeCode } });
  await prisma.company.deleteMany({ where: { id: fixture.companyId } });
}

function actorDe(fixture: Fixture): Actor {
  return { id: fixture.actorId, companyId: fixture.companyId, permissions: ['pedidos.consultar', 'pedidos.modificar'] };
}

/** La entrada tal como la validan `createOrderSchema`/`updateOrderSchema`: el envase
 *  + `packages` por linea, SIN `content` -eso lo copia `resolveDistribution` del catalogo, no lo
 *  trae quien llama-. `createOrder`/`updateOrder` reciben `unknown` y parsean con `zod`, asi que
 *  este tipo NUNCA es `NewOrder`/`OrderEdit` -esos son la salida YA resuelta-. */
type PedidoInput = {
  readonly recipeId: string;
  readonly quantity: string;
  readonly priority: 'BAJA';
  readonly unitId: string;
  readonly presentationLines: ReadonlyArray<{ readonly packagingProductId: string; readonly packages: number }>;
};

function nuevoPedido(fixture: Fixture, quantity: string, lines: PedidoInput['presentationLines'] = []): PedidoInput {
  return {
    recipeId: fixture.recipeId,
    quantity,
    priority: 'BAJA',
    unitId: fixture.unitId,
    presentationLines: lines,
  };
}

async function leerOrden(orderId: string) {
  return prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { quantity: true, unitId: true, status: true, packedBy: true },
  });
}

async function leerLineas(orderId: string) {
  return prisma.orderPresentationLine.findMany({
    where: { orderId },
    select: { presentationId: true, packages: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
}

afterAll(async () => {
  await prisma.$disconnect();
});

// ===========================================================================
// Caso 1 (R38) — baja de cantidad o cambio de unidad que deja el reparto sin
// caber: rechazo sin escribir nada, pedido intacto.
// ===========================================================================
describe('R38 — una edicion que deja el reparto vigente sin caber se rechaza y el pedido queda igual', () => {
  it('bajar la cantidad por debajo de lo repartido rechaza con order_distribution_exceeds_quantity, sin tocar el pedido', async () => {
    const fixture = await crearFixture();
    try {
      const creado = await createOrder(
        nuevoPedido(fixture, '100.0000', [{ packagingProductId: fixture.packagingProductId, packages: 5 }]),
        actorDe(fixture),
      );
      // 5 envases x 10.0000 = 50.0000, cabe en 100.0000 (disponible 50).

      await expect(
        updateOrder(creado.id, nuevoPedido(fixture, '40.0000', [{ packagingProductId: fixture.packagingProductId, packages: 5 }]), actorDe(fixture)),
      ).rejects.toBeInstanceOf(OrderDistributionExceedsQuantityError);

      const fila = await leerOrden(creado.id);
      expect(fila.quantity.toFixed(4)).toBe('100.0000');
      expect(fila.unitId).toBe(fixture.unitId);
      const lineas = await leerLineas(creado.id);
      expect(lineas).toEqual([{ presentationId: fixture.presentationId, packages: 5 }]);
    } finally {
      await borrarFixture(fixture);
    }
  });

  it('cambiar a una unidad sin base comun con la de la presentacion rechaza con incompatible_units, sin tocar el pedido', async () => {
    const fixture = await crearFixture();
    try {
      const creado = await createOrder(
        nuevoPedido(fixture, '100.0000', [{ packagingProductId: fixture.packagingProductId, packages: 5 }]),
        actorDe(fixture),
      );

      await expect(
        updateOrder(
          creado.id,
          { ...nuevoPedido(fixture, '100.0000', [{ packagingProductId: fixture.packagingProductId, packages: 5 }]), unitId: fixture.unitIncompatibleId },
          actorDe(fixture),
        ),
      ).rejects.toBeInstanceOf(IncompatibleUnitsError);

      const fila = await leerOrden(creado.id);
      expect(fila.unitId).toBe(fixture.unitId);
      expect(fila.quantity.toFixed(4)).toBe('100.0000');
      const lineas = await leerLineas(creado.id);
      expect(lineas).toEqual([{ presentationId: fixture.presentationId, packages: 5 }]);
    } finally {
      await borrarFixture(fixture);
    }
  });
});

// ===========================================================================
// Caso 2 (R37) — guardados simultaneos del reparto (y del reparto con una
// bajada de cantidad) dejan siempre suma <= cantidad, sin await entre las
// dos llamadas: Postgres decide quien gana el `FOR UPDATE` de verdad.
// ===========================================================================
describe('R37 — guardados simultaneos del reparto nunca dejan una suma que pase del total', () => {
  it('dos guardados de reparto que caben cada uno por separado (pero no sumados) dejan, quien gane, un reparto valido por si solo', async () => {
    for (let vuelta = 0; vuelta < 8; vuelta += 1) {
      const fixture = await crearFixture();
      try {
        const creado = await createOrder(nuevoPedido(fixture, '100.0000'), actorDe(fixture));

        // Cada reparto, SOLO, cabe (60 <= 100); juntos (120) no cabrian si fueran aditivos -no
        // lo son: cada guardado REEMPLAZA el conjunto entero-, asi que la propiedad real que
        // demuestra el bloqueo es que el resultado final es SIEMPRE uno de los dos completos,
        // nunca una mezcla, y nunca pasa del total.
        const a = updateOrderPresentationLines(creado.id, actorDe(fixture), {
          unitId: fixture.unitId,
          lines: [{ packagingProductId: fixture.packagingProductId, packages: 6 }],
        });
        const b = updateOrderPresentationLines(creado.id, actorDe(fixture), {
          unitId: fixture.unitId,
          lines: [{ packagingProductId: fixture.packagingProductId, packages: 7 }],
        });

        const [resultadoA, resultadoB] = await Promise.all([a, b]);
        expect(resultadoA).toBe('ok');
        expect(resultadoB).toBe('ok');

        const lineas = await leerLineas(creado.id);
        expect(lineas).toHaveLength(1);
        expect([6, 7]).toContain(lineas[0]?.packages);

        const suma = (lineas[0]?.packages ?? 0) * 10;
        expect(suma).toBeLessThanOrEqual(100);
      } finally {
        await borrarFixture(fixture);
      }
    }
  });

  it('un guardado del reparto simultaneo con una bajada de cantidad del pedido nunca deja suma > cantidad final', async () => {
    for (let vuelta = 0; vuelta < 8; vuelta += 1) {
      const fixture = await crearFixture();
      try {
        // Reparto inicial de 5 envases (50.0000), cantidad 100: cabe con margen amplio.
        const creado = await createOrder(
          nuevoPedido(fixture, '100.0000', [{ packagingProductId: fixture.packagingProductId, packages: 5 }]),
          actorDe(fixture),
        );

        // El guardado sube el reparto a 8 envases (80.0000) -sigue cabiendo en 100-; la edicion
        // baja la cantidad a 55.0000 manteniendo el reparto ORIGINAL (50.0000, cabe en 55). Si
        // el guardado ganara la carrera DESPUES de que la edicion relea 100, dejaria 80 sobre
        // una cantidad que en realidad ya bajo a 55 -exactamente lo que R37 prohibe-; el
        // bloqueo de la fila hace que quien entre segundo vea lo que escribio el primero.
        const guardado = updateOrderPresentationLines(creado.id, actorDe(fixture), {
          unitId: fixture.unitId,
          lines: [{ packagingProductId: fixture.packagingProductId, packages: 8 }],
        });
        const edicion = updateOrder(
          creado.id,
          nuevoPedido(fixture, '55.0000', [{ packagingProductId: fixture.packagingProductId, packages: 5 }]),
          actorDe(fixture),
        ).then(
          () => ({ ok: true as const }),
          (error: unknown) => ({ ok: false as const, error }),
        );

        const [resultadoGuardado, resultadoEdicion] = await Promise.all([guardado, edicion]);

        const filaFinal = await leerOrden(creado.id);
        const lineasFinal = await leerLineas(creado.id);
        const sumaFinal = lineasFinal.reduce((acumulado, linea) => acumulado + linea.packages * 10, 0);

        expect(sumaFinal).toBeLessThanOrEqual(Number(filaFinal.quantity.toFixed(4)));

        // Ninguno de los dos caminos deberia fallar por una causa AJENA a R36/R38: si la
        // edicion se rechazo, tiene que ser exactamente porque el reparto de 8 (80.0000) ya no
        // cabia en 55.0000 -la unica interaccion que R37 prohibe dejar pasar sin rechazo-.
        expect(resultadoGuardado).toBe('ok');
        if (!resultadoEdicion.ok) {
          expect(resultadoEdicion.error).toBeInstanceOf(OrderDistributionExceedsQuantityError);
        }
      } finally {
        await borrarFixture(fixture);
      }
    }
  });
});

// ===========================================================================
// Caso 3 (R42, R46) — un pedido con `unit_id NULL` (el unico camino real:
// migrado antes de esta ficha, R44 retirado permite llegar a `POR_EMPACAR`
// sin unidad) acepta el reparto en cuanto la edicion le asigna una unidad,
// tanto en la edicion general como en la acotada de `POR_EMPACAR`.
//
// La MITAD de rechazo (`order_without_unit`) que describe R42 no tiene hoy
// ningun camino de entrada real: `createOrderSchema`/`updateOrderSchema` y
// `updateOrderDistributionSchema` exigen `unitId` como UUID siempre (nunca
// opcional ni nulo), y tanto `resolveDistribution` como
// `updateOrderPresentationLines` devuelven `unit_not_found` -no
// `without_unit`- en cuanto el id no resuelve. `validateDistribution` solo
// devuelve `'without_unit'` cuando alguien la llama con `orderUnit: null`
// explicito, y NINGUN llamador de produccion lo hace -los dos primero
// comprueban `findRefs` y salen antes-. Queda cubierto solo a nivel de
// dominio puro (`order-distribution.test.ts`, T20). No es un hallazgo NUEVO
// de esta tanda: T9 (tanda C) ya lo dejo asi y ninguna prueba unitaria de
// `update-order-presentation-lines.test.ts` ejercita ese `case`.
// ===========================================================================
describe('R42, R46 — un pedido sin unidad acepta el reparto en cuanto la edicion le asigna una', () => {
  it('en la edicion general (PENDIENTE), asignar unidad junto con el reparto tiene exito', async () => {
    const fixture = await crearFixture();
    try {
      // Simula un pedido migrado (R43): `unit_id NULL`, sin presentacion, sin reparto.
      const year = new Date().getUTCFullYear();
      const legado = await prisma.order.create({
        data: {
          orderYear: year,
          orderSequence: 1,
          recipeId: fixture.recipeId,
          quantity: new Prisma.Decimal('30.0000'),
          priority: 'BAJA',
          status: 'PENDIENTE',
          companyId: fixture.companyId,
          createdBy: fixture.actorId,
          updatedBy: fixture.actorId,
          unitId: null,
        },
        select: { id: true },
      });

      await updateOrder(
        legado.id,
        nuevoPedido(fixture, '30.0000', [{ packagingProductId: fixture.packagingProductId, packages: 2 }]),
        actorDe(fixture),
      );

      const fila = await leerOrden(legado.id);
      expect(fila.unitId).toBe(fixture.unitId);
      const lineas = await leerLineas(legado.id);
      expect(lineas).toEqual([{ presentationId: fixture.presentationId, packages: 2 }]);
    } finally {
      await borrarFixture(fixture);
    }
  });

  it('en POR_EMPACAR sin unidad (R44 retirado), la edicion acotada asigna unidad y reparto', async () => {
    const fixture = await crearFixture();
    try {
      const year = new Date().getUTCFullYear();
      const legado = await prisma.order.create({
        data: {
          orderYear: year,
          orderSequence: 1,
          recipeId: fixture.recipeId,
          quantity: new Prisma.Decimal('30.0000'),
          priority: 'BAJA',
          status: 'POR_EMPACAR',
          companyId: fixture.companyId,
          createdBy: fixture.actorId,
          updatedBy: fixture.actorId,
          unitId: null,
        },
        select: { id: true },
      });

      const resultado = await updateOrderPresentationLines(legado.id, actorDe(fixture), {
        unitId: fixture.unitId,
        lines: [{ packagingProductId: fixture.packagingProductId, packages: 3 }],
      });
      expect(resultado).toBe('ok');

      const fila = await leerOrden(legado.id);
      expect(fila.unitId).toBe(fixture.unitId);
      expect(fila.status).toBe('POR_EMPACAR');
      const lineas = await leerLineas(legado.id);
      expect(lineas).toEqual([{ presentationId: fixture.presentationId, packages: 3 }]);
    } finally {
      await borrarFixture(fixture);
    }
  });
});

// ===========================================================================
// Caso 4 (R48) — carrera Comenzar vs guardado del reparto, en los DOS
// ordenes, forzada con un `pg.Client` que retiene el `FOR UPDATE` de la fila.
// ===========================================================================

const COTA_DE_BLOQUEO_MS = 3_000;

type Vigilada<T> = { readonly promesa: Promise<T>; readonly terminada: () => boolean };

function vigilar<T>(promesa: Promise<T>): Vigilada<T> {
  let terminada = false;
  const anotar = (): void => {
    terminada = true;
  };
  promesa.then(anotar, anotar);
  return { promesa, terminada: () => terminada };
}

/** Cuenta backends esperando CUALQUIER lock -mismo criterio que
 *  `order-sequence-race.int.test.ts`-: solo hay DOS conexiones en juego (holder + contender por
 *  el pool de Prisma) y el holder nunca espera nada, asi que un conteo positivo solo puede ser
 *  la contraria bloqueada en el `FOR UPDATE`. */
async function esperarBloqueada(observada: Vigilada<unknown>, siTerminaAntes: string): Promise<void> {
  const limite = Date.now() + COTA_DE_BLOQUEO_MS;
  for (;;) {
    const filas = await prisma.$queryRaw<ReadonlyArray<{ n: number }>>`
      SELECT count(*)::int AS "n"
        FROM pg_stat_activity
       WHERE datname = current_database()
         AND wait_event_type = 'Lock'`;
    if ((filas[0]?.n ?? 0) > 0) return;
    if (observada.terminada()) throw new Error(siTerminaAntes);
    if (Date.now() > limite) {
      throw new Error(`${siTerminaAntes}: nadie quedo esperando un lock en ${String(COTA_DE_BLOQUEO_MS)} ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('R48 — Comenzar y el guardado del reparto se serializan sobre la fila del pedido', () => {
  it('orden a: el guardado VACIA el reparto primero -> Comenzar ve cero lineas y da without_distribution, el pedido sigue POR_EMPACAR', async () => {
    const fixture = await crearFixture();
    const holder = new Client({ connectionString: connectionString() });
    try {
      const creado = await createOrder(
        nuevoPedido(fixture, '100.0000', [{ packagingProductId: fixture.packagingProductId, packages: 3 }]),
        actorDe(fixture),
      );
      await prisma.order.update({ where: { id: creado.id }, data: { status: 'POR_EMPACAR' } });

      await holder.connect();
      await holder.query('BEGIN');
      // El MISMO `SELECT ... FOR UPDATE` que abren `startPackingAliveOrder` y
      // `updatePresentationLinesAliveOrder` como primera sentencia de su transaccion.
      await holder.query(
        'SELECT "id" FROM "orders" WHERE "id" = $1 AND "company_id" = $2 AND "deleted_at" IS NULL FOR UPDATE',
        [creado.id, fixture.companyId],
      );

      // Comenzar REAL, por el pool de Prisma: se bloquea esperando la fila que retiene `holder`.
      const comenzar = vigilar(startPackingAliveOrder(creado.id, fixture.actorId, new Date(), { companyId: fixture.companyId }));
      await esperarBloqueada(comenzar, 'Comenzar no quedo esperando el FOR UPDATE del guardado (orden a)');

      // El guardado GANA: vacia el reparto (mismo efecto que `updatePresentationLinesAliveOrder`
      // con `lines: []`, sin cambio de unidad) y confirma.
      await holder.query('DELETE FROM "order_presentation_lines" WHERE "order_id" = $1 AND "company_id" = $2', [
        creado.id,
        fixture.companyId,
      ]);
      await holder.query(
        'UPDATE "orders" SET "updated_at" = now(), "updated_by" = $2 WHERE "id" = $1',
        [creado.id, fixture.actorId],
      );
      await holder.query('COMMIT');

      const resultado = await comenzar.promesa;
      expect(resultado).toBe('without_distribution');

      const fila = await leerOrden(creado.id);
      expect(fila.status).toBe('POR_EMPACAR');
      expect(fila.packedBy).toBeNull();
      const lineas = await leerLineas(creado.id);
      expect(lineas).toEqual([]);
    } finally {
      await holder.end().catch(() => undefined);
      await borrarFixture(fixture);
    }
  });

  it('orden b: Comenzar entra primero -> el guardado ve EN_EMPAQUE y rechaza con not_editable, las lineas quedan como estaban', async () => {
    const fixture = await crearFixture();
    const holder = new Client({ connectionString: connectionString() });
    try {
      const creado = await createOrder(
        nuevoPedido(fixture, '100.0000', [{ packagingProductId: fixture.packagingProductId, packages: 3 }]),
        actorDe(fixture),
      );
      await prisma.order.update({ where: { id: creado.id }, data: { status: 'POR_EMPACAR' } });

      await holder.connect();
      await holder.query('BEGIN');
      await holder.query(
        'SELECT "id" FROM "orders" WHERE "id" = $1 AND "company_id" = $2 AND "deleted_at" IS NULL FOR UPDATE',
        [creado.id, fixture.companyId],
      );

      // El guardado REAL, por el pool de Prisma: se bloquea esperando la fila que retiene `holder`.
      const guardado = vigilar(
        updateOrderPresentationLines(creado.id, actorDe(fixture), {
          unitId: fixture.unitId,
          lines: [{ packagingProductId: fixture.packagingProductId, packages: 9 }],
        }),
      );
      await esperarBloqueada(guardado, 'el guardado no quedo esperando el FOR UPDATE de Comenzar (orden b)');

      // Comenzar GANA: la escritura exacta de `startPackingAliveOrder` (la cuenta de lineas ya
      // paso, este pedido nace con una).
      await holder.query(
        `UPDATE "orders" SET "status" = 'EN_EMPAQUE', "packed_by" = $2, "updated_at" = now(), "updated_by" = $2 WHERE "id" = $1`,
        [creado.id, fixture.actorId],
      );
      await holder.query('COMMIT');

      const resultado = await guardado.promesa;
      expect(resultado).toBe('not_editable');

      const fila = await leerOrden(creado.id);
      expect(fila.status).toBe('EN_EMPAQUE');
      expect(fila.packedBy).toBe(fixture.actorId);
      // El guardado NO escribio: las lineas siguen siendo las de antes de la carrera.
      const lineas = await leerLineas(creado.id);
      expect(lineas).toEqual([{ presentationId: fixture.presentationId, packages: 3 }]);
    } finally {
      await holder.end().catch(() => undefined);
      await borrarFixture(fixture);
    }
  });
});

// ===========================================================================
// Caso 5 (R30, R46) — en `POR_EMPACAR`, cambiar la unidad no toca reservas ni
// asientos de inventario: mismo censo antes y despues.
// ===========================================================================
describe('R30, R46 — cambiar la unidad en POR_EMPACAR no altera reservas ni asientos de inventario', () => {
  it('el censo de reservation_movements e inventory_movements del pedido es igual antes y despues del cambio de unidad', async () => {
    const fixture = await crearFixture();
    const productIds: string[] = [];
    try {
      // Receta con una linea al 100 % y un producto con lote, para que el alta SI aparte
      // material de verdad -si no hubiera reserva, el censo "antes" ya seria cero y la prueba
      // no demostraria nada-.
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
      productIds.push(created.id);
      await prisma.recipeLine.create({
        data: { recipeId: fixture.recipeId, productId: created.id, percentage: new Prisma.Decimal('100.00') },
      });

      const creado = await createOrder(
        nuevoPedido(fixture, '20.0000', [{ packagingProductId: fixture.packagingProductId, packages: 2 }]),
        actorDe(fixture),
      );
      await transitionAliveById(creado.id, fixture.companyId, 'PENDIENTE', 'EN_CURSO', fixture.actorId, new Date());
      await transitionAliveById(creado.id, fixture.companyId, 'EN_CURSO', 'POR_EMPACAR', fixture.actorId, new Date());

      async function censo() {
        const reservas = await prisma.reservationMovement.count({ where: { orderId: creado.id } });
        const movimientos = await prisma.inventoryMovement.count({ where: { orderId: creado.id } });
        return { reservas, movimientos };
      }

      const antes = await censo();
      expect(antes.reservas).toBeGreaterThan(0); // hubo reserva y consumo de verdad al Finalizar.

      // Cambia SOLO la unidad, con el MISMO reparto (`unitConvertibleId` comparte base con
      // `unitId`, factor 1: la conversion es trivial y valida).
      const resultado = await updateOrderPresentationLines(creado.id, actorDe(fixture), {
        unitId: fixture.unitConvertibleId,
        lines: [{ packagingProductId: fixture.packagingProductId, packages: 2 }],
      });
      expect(resultado).toBe('ok');

      const despues = await censo();
      expect(despues).toEqual(antes);

      const fila = await leerOrden(creado.id);
      expect(fila.unitId).toBe(fixture.unitConvertibleId);
      expect(fila.status).toBe('POR_EMPACAR');
    } finally {
      await borrarFixture(fixture, productIds);
    }
  });
});
