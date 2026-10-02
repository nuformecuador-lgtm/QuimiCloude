/**
 * `pedidos.quoteOrderCost` contra Postgres real. Mismo patron que
 * `order-ingredients-cost.int.test.ts`: los adaptadores driven REALES de `pedidos`, `recetas`,
 * `inventario` y `unidades`, cableados a mano sin pasar por `lib/composition`.
 *
 * Dos empresas efimeras (`A` para el flujo normal, `Q` para el aislamiento) nacen en
 * `beforeAll` y mueren en `afterAll`; cada caso siembra su propio producto/lote/receta y los
 * borra en su `finally`. NINGUNA AFIRMACION GLOBAL sobre cuantas filas hay en una tabla.
 */
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { normalizeCompanyName } from '@/lib/modules/identity'
import {
  findProductRefs,
  findCostingBatches,
} from '@/lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma'
import { createWithFirstBatch, findFinishedGoodsReceipts } from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma'
import {
  createOrderWriteRepository,
  findAliveOrderById,
  listAliveOrders,
  findBlockedOrderIds,
} from '@/lib/modules/pedidos/adapters/driven/persistence/order-prisma'
import { withOrderTransaction } from '@/lib/modules/pedidos/adapters/driven/persistence/order-unit-of-work-prisma'
import { createMaterialReservations } from '@/lib/modules/inventario/adapters/driven/persistence/reservation-prisma'
import { createFinishedGoodsIntake } from '@/lib/modules/inventario/adapters/driven/persistence/finished-goods-prisma';
import { createRecipe } from '@/lib/modules/recetas/adapters/driven/persistence/recipe-prisma'
import {
  createRecipeExecutionReader,
  findRecipeExecutionContentById,
  findAliveRecipeByNormalizedName,
  findRecipeIdsMatchingName,
  findRecipeRefsIncludingDeleted,
} from '@/lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma'
import {
  findPresentationRefs,
  findPresentationsByNormalizedNames,
} from '@/lib/modules/inventario/adapters/driven/persistence/presentation-catalog-prisma'
import { findUnitRefs } from '@/lib/modules/unidades/adapters/driven/persistence/unit-catalog-prisma'
import { findUnitRefsSharingBaseInCompany } from '@/lib/modules/unidades/adapters/driven/persistence/unit-prisma'
import { prisma } from '@/lib/shared/db/prisma'

import { createCreateOrder, createQuoteOrderCost, createUpdateOrder } from '@/lib/modules/pedidos'

import type { Actor, NewOrder } from '@/lib/modules/pedidos'
import type { PresentationCatalog, ProductCatalog } from '@/lib/modules/inventario'
import type { NewProductBatch } from '@/lib/modules/inventario/domain/product-batch'
import type { InventoryScope } from '@/lib/modules/inventario/domain/inventory-scope'
import type { RecipeCatalog } from '@/lib/modules/recetas'
import type { RecipeScope } from '@/lib/modules/recetas/domain/recipe-scope'
import type { UnitCatalog } from '@/lib/modules/unidades'
import type { OrderRepository } from '@/lib/modules/pedidos/ports/order-repository'
import type { OrderTransactionScope, OrderUnitOfWork } from '@/lib/modules/pedidos/ports/order-unit-of-work'

function token(): string {
  return randomUUID().replace(/-/gu, '')
}

function normalizeForTest(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]/gu, '')
}

const orders: OrderRepository = {
  findAliveById: findAliveOrderById,
  listAlive: listAliveOrders,
  findBlockedIds: findBlockedOrderIds,
}

// Mismo cableado que `lib/composition` para `orderUnitOfWork`: abre la transaccion compartida
// con `inventario` y ata, sobre el MISMO `tx`, la escritura de `pedidos` y las reservas.
const unitOfWork: OrderUnitOfWork = {
  run: (work) =>
    withOrderTransaction((tx) => {
      const scope: OrderTransactionScope = {
        orders: createOrderWriteRepository(tx),
        reservations: createMaterialReservations(tx),
        recipes: createRecipeExecutionReader(tx),
        finishedGoods: createFinishedGoodsIntake(tx),
      }
      return work(scope)
    }),
}

const recipes: RecipeCatalog = {
  findRefsIncludingDeleted: findRecipeRefsIncludingDeleted,
  findExecutionContentById: findRecipeExecutionContentById,
  findIdsMatchingName: findRecipeIdsMatchingName,
  findAliveByNormalizedName: findAliveRecipeByNormalizedName,
}

const products: ProductCatalog = { findRefs: findProductRefs, findCostingBatches, findFinishedGoodsReceipts }

const presentations: PresentationCatalog = {
  findRefs: findPresentationRefs,
  findByNormalizedNames: findPresentationsByNormalizedNames,
}

const units: UnitCatalog = {
  findRefs: findUnitRefs,
  findRefsSharingBaseInCompany: findUnitRefsSharingBaseInCompany,
}

type Empresa = {
  readonly companyId: string
  readonly actorId: string
  readonly roleId: string
  readonly documentTypeCode: string
  readonly presentationId: string
}

let unitId: string
let A: Empresa
let Q: Empresa

async function sembrarUnidadDeSistema(): Promise<string> {
  const marca = token()
  const unit = await prisma.unit.create({
    data: { name: `Unidad ${marca}`, nameNormalized: `unidad${marca}`, symbol: `u${marca}` },
    select: { id: true },
  })
  return unit.id
}

async function sembrarEmpresa(etiqueta: string): Promise<Empresa> {
  const marca = token()
  const nombre = `Empresa ${etiqueta} ${marca}`
  const company = await prisma.company.create({
    data: { name: nombre, nameNormalized: normalizeCompanyName(nombre) },
    select: { id: true },
  })
  const documentType = await prisma.documentType.create({
    data: { code: `DOC${marca.slice(0, 8)}`, name: 'Tipo de documento de prueba' },
    select: { code: true },
  })
  const role = await prisma.role.create({
    data: { name: `rol-${marca}`, description: 'Rol de prueba' },
    select: { id: true },
  })
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
  })
  const presentationName = `Presentacion ${marca}`
  const presentation = await prisma.presentation.create({
    data: {
      name: presentationName,
      nameNormalized: normalizeForTest(presentationName),
      unitId,
      companyId: company.id,
    },
    select: { id: true },
  })
  return {
    companyId: company.id,
    actorId: user.id,
    roleId: role.id,
    documentTypeCode: documentType.code,
    presentationId: presentation.id,
  }
}

async function borrarEmpresa(empresa: Empresa): Promise<void> {
  await prisma.presentation.delete({ where: { id: empresa.presentationId } })
  await prisma.user.delete({ where: { id: empresa.actorId } })
  await prisma.role.delete({ where: { id: empresa.roleId } })
  await prisma.documentType.delete({ where: { code: empresa.documentTypeCode } })
  await prisma.company.delete({ where: { id: empresa.companyId } })
}

beforeAll(async () => {
  unitId = await sembrarUnidadDeSistema()
  A = await sembrarEmpresa('A')
  Q = await sembrarEmpresa('Q')
})

afterAll(async () => {
  await borrarEmpresa(A)
  await borrarEmpresa(Q)
  await prisma.unit.delete({ where: { id: unitId } })
  await prisma.$disconnect()
})

function actorDe(empresa: Empresa): Actor {
  return { id: empresa.actorId, companyId: empresa.companyId, permissions: ['pedidos.modificar'] }
}

function newBatch(empresa: Empresa, overrides: Partial<NewProductBatch> = {}): NewProductBatch {
  return {
    presentationId: empresa.presentationId,
    stock: '10',
    unitCost: '5.0000',
    lot: null,
    purchaseDate: '2026-01-01',
    expiryDate: null,
    createdBy: empresa.actorId,
    ...overrides,
  }
}

async function crearProductoConLote(
  empresa: Empresa,
  overrides: Partial<NewProductBatch> = {},
): Promise<{ readonly productId: string; readonly batchId: string }> {
  const creado = await createWithFirstBatch(
    { name: `Producto ${token()}` },
    newBatch(empresa, overrides),
    new Date(),
    { companyId: empresa.companyId } satisfies InventoryScope,
  )
  return { productId: creado.id, batchId: creado.batchId }
}

async function crearReceta(empresa: Empresa, productId: string): Promise<string> {
  const creada = await createRecipe(
    {
      name: `Receta ${token()}`,
      description: null,
      steps: [],
      lines: [{ productId, percentage: '100.00' }],
      imagePath: null,
    },
    empresa.actorId,
    new Date(),
    { companyId: empresa.companyId } satisfies RecipeScope,
  )
  if (creada === 'duplicate') throw new Error('la receta de prueba choco con un nombre duplicado')
  return creada.id
}

async function borrarProducto(productId: string): Promise<void> {
  const lotes = await prisma.productBatch.findMany({ where: { productId }, select: { id: true } })
  await prisma.inventoryMovement.deleteMany({ where: { batchId: { in: lotes.map((lote) => lote.id) } } })
  await prisma.productBatch.deleteMany({ where: { productId } })
  await prisma.product.deleteMany({ where: { id: productId } })
}

function borrarReceta(recipeId: string): Promise<unknown> {
  return prisma.recipe.deleteMany({ where: { id: recipeId } })
}

/** El alta pasa por la reserva real -el mismo `unitOfWork` que `lib/composition`-, asi que
 *  cada pedido puede haber dejado asientos en `reservation_movements`
 *  (`reservation_movements_order_id_fkey` es `RESTRICT`): hay que borrarlos antes que el
 *  pedido. */
async function borrarPedido(orderId: string): Promise<void> {
  await prisma.reservationMovement.deleteMany({ where: { orderId } })
  await prisma.order.deleteMany({ where: { id: orderId } })
}

async function ingredientsCostCrudo(orderId: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ ingredients_cost: string | null }[]>`
    SELECT "ingredients_cost"::text AS "ingredients_cost" FROM "orders" WHERE "id" = ${orderId}::uuid`
  const row = rows[0]
  if (row === undefined) throw new Error(`no existe el pedido ${orderId}`)
  return row.ingredients_cost
}

async function fotoDeInventario(
  empresa: Empresa,
): Promise<{ readonly batches: string; readonly movements: string }> {
  const batches = await prisma.productBatch.findMany({
    where: { companyId: empresa.companyId },
    orderBy: { id: 'asc' },
  })
  const movements = await prisma.inventoryMovement.findMany({
    where: { companyId: empresa.companyId },
    orderBy: { id: 'asc' },
  })
  return { batches: JSON.stringify(batches), movements: JSON.stringify(movements) }
}

async function contarPedidos(empresa: Empresa): Promise<number> {
  return prisma.order.count({ where: { companyId: empresa.companyId } })
}

describe('R1: la cotizacion coincide con el importe que guarda el alta', () => {
  it('con existencia suficiente, la cotizacion y el alta dan el mismo importe (R62)', async () => {
    const { productId } = await crearProductoConLote(A, { stock: '10', unitCost: '5.0000' })
    const recipeId = await crearReceta(A, productId)
    let orderId: string | null = null

    try {
      const cotizar = createQuoteOrderCost({ recipes, products, units })
      const cotizacion = await cotizar({ recipeId, quantity: '6.0000' }, actorDe(A))
      expect(cotizacion.ingredientsCost).toBe('30.0000')

      const alta = createCreateOrder({
        unitOfWork,
        recipes,
        products,
        units,
        presentations,
        now: () => new Date('2026-05-01T12:00:00.000Z'),
      })
      const creado = await alta(
        { recipeId, quantity: '6.0000', priority: 'MEDIA', unitId },
        actorDe(A),
      )
      orderId = creado.id

      expect(await ingredientsCostCrudo(orderId)).toBe(cotizacion.ingredientsCost)
    } finally {
      if (orderId !== null) await borrarPedido(orderId)
      await borrarReceta(recipeId)
      await borrarProducto(productId)
    }
  })

  it('sin existencia suficiente, la cotizacion y el alta dan las dos null (R62)', async () => {
    const { productId } = await crearProductoConLote(A, { stock: '10', unitCost: '5.0000' })
    const recipeId = await crearReceta(A, productId)
    let orderId: string | null = null

    try {
      const cotizar = createQuoteOrderCost({ recipes, products, units })
      const cotizacion = await cotizar({ recipeId, quantity: '200.0000' }, actorDe(A))
      expect(cotizacion.ingredientsCost).toBeNull()

      const alta = createCreateOrder({
        unitOfWork,
        recipes,
        products,
        units,
        presentations,
        now: () => new Date('2026-05-01T12:00:00.000Z'),
      })
      // QC-138 R6/R8: sin confirmar, un alta que no alcanza no se guarda; confirmada queda
      // BLOQUEADO y es ahi donde se compara el importe con la cotizacion.
      const creado = await alta(
        { recipeId, quantity: '200.0000', priority: 'MEDIA', unitId, confirmBlocked: true },
        actorDe(A),
      )
      orderId = creado.id

      expect(await ingredientsCostCrudo(orderId)).toBeNull()
      const pedido = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } })
      expect(pedido.status).toBe('BLOQUEADO')
    } finally {
      if (orderId !== null) await borrarPedido(orderId)
      await borrarReceta(recipeId)
      await borrarProducto(productId)
    }
  })
})

describe('R2: cotizar no escribe ninguna fila', () => {
  it('los lotes, los asientos y el numero de pedidos quedan intactos', async () => {
    const { productId } = await crearProductoConLote(A, { stock: '10', unitCost: '5.0000' })
    const recipeId = await crearReceta(A, productId)

    try {
      const antes = await fotoDeInventario(A)
      const pedidosAntes = await contarPedidos(A)

      const cotizar = createQuoteOrderCost({ recipes, products, units })
      await cotizar({ recipeId, quantity: '6.0000' }, actorDe(A))
      await cotizar({ recipeId, quantity: '200.0000' }, actorDe(A))

      const despues = await fotoDeInventario(A)
      expect(despues.batches).toBe(antes.batches)
      expect(despues.movements).toBe(antes.movements)
      expect(await contarPedidos(A)).toBe(pedidosAntes)
    } finally {
      await borrarReceta(recipeId)
      await borrarProducto(productId)
    }
  })
})

describe('R6: una receta de otra empresa da sin importe, igual que una receta sin lineas', () => {
  it('cotizar la receta de Q con el actor de A da null, sin leer los lotes de Q', async () => {
    const { productId: productIdQ } = await crearProductoConLote(Q, { stock: '999', unitCost: '1000.0000' })
    const recipeIdQ = await crearReceta(Q, productIdQ)

    try {
      const cotizar = createQuoteOrderCost({ recipes, products, units })
      const cotizacion = await cotizar({ recipeId: recipeIdQ, quantity: '6.0000' }, actorDe(A))
      expect(cotizacion.ingredientsCost).toBeNull()

      // Control: la misma receta, cotizada por su propia empresa, SI da importe -asi que el
      // null de arriba es por el ambito, no porque la receta este mal sembrada.
      const propia = await cotizar({ recipeId: recipeIdQ, quantity: '6.0000' }, actorDe(Q))
      expect(propia.ingredientsCost).toBe('6000.0000')
    } finally {
      await borrarReceta(recipeIdQ)
      await borrarProducto(productIdQ)
    }
  })
})

describe('R65: un pedido que ya existe cuenta lo que EL MISMO tiene apartado como disponible', () => {
  it('editar sin cambiar nada conserva el importe, aunque el pedido haya apartado el unico lote entero', async () => {
    const { productId } = await crearProductoConLote(A, { stock: '6', unitCost: '5.0000', purchaseDate: '2026-01-01' })
    const recipeId = await crearReceta(A, productId)
    let orderId: string | null = null

    try {
      const now = () => new Date('2026-05-12T12:00:00.000Z')
      const alta = createCreateOrder({ recipes, products, units, presentations, unitOfWork, now })
      const edicion = createUpdateOrder({ orders, recipes, products, units, presentations, unitOfWork, now })

      // necesaria = 6 * 100 % = 6: aparta el UNICO lote entero. Sin excluir la reserva propia del
      // pedido, el lote quedaria con disponible cero para el calculo de la propia edicion y el
      // importe se perderia.
      const creado = await alta({ recipeId, quantity: '6.0000', priority: 'MEDIA', unitId }, actorDe(A))
      orderId = creado.id
      expect(await ingredientsCostCrudo(orderId)).toBe('30.0000')

      const sinCambios: NewOrder = { recipeId, quantity: '6.0000', priority: 'MEDIA', status: 'PENDIENTE', unitId, presentationLines: [] }
      await edicion(orderId, sinCambios, actorDe(A))
      expect(await ingredientsCostCrudo(orderId)).toBe('30.0000')

      // La cotizacion de EDICION, con el `orderId` del propio pedido, coincide con lo guardado.
      const cotizar = createQuoteOrderCost({ recipes, products, units })
      const cotizacion = await cotizar({ recipeId, quantity: '6.0000', orderId }, actorDe(A))
      expect(cotizacion.ingredientsCost).toBe('30.0000')

      // Sin el `orderId`, la cotizacion es la de un pedido NUEVO: como el unico lote ya esta
      // apartado por este pedido, no queda nada disponible para nadie mas.
      const cotizacionSinOrderId = await cotizar({ recipeId, quantity: '6.0000' }, actorDe(A))
      expect(cotizacionSinOrderId.ingredientsCost).toBeNull()
    } finally {
      if (orderId !== null) await borrarPedido(orderId)
      await borrarReceta(recipeId)
      await borrarProducto(productId)
    }
  })
})

describe('aislamiento: `orderId` de OTRA empresa no cambia nada (R65, ambito)', () => {
  it('cotizar la receta de A con el `orderId` de un pedido de Q da el mismo resultado que sin `orderId`', async () => {
    const { productId } = await crearProductoConLote(A, { stock: '6', unitCost: '5.0000', purchaseDate: '2026-01-01' })
    const recipeId = await crearReceta(A, productId)
    const { productId: productIdQ } = await crearProductoConLote(Q, { stock: '6', unitCost: '5.0000', purchaseDate: '2026-01-01' })
    const recipeIdQ = await crearReceta(Q, productIdQ)
    let orderIdDeQ: string | null = null

    try {
      const now = () => new Date('2026-05-13T12:00:00.000Z')
      const alta = createCreateOrder({ recipes, products, units, presentations, unitOfWork, now })

      // El unico pedido que existe aparta el material de Q, no el de A: el lote de A sigue
      // entero disponible para la cotizacion de abajo.
      const creadoQ = await alta(
        { recipeId: recipeIdQ, quantity: '6.0000', priority: 'MEDIA', unitId },
        actorDe(Q),
      )
      orderIdDeQ = creadoQ.id

      const cotizar = createQuoteOrderCost({ recipes, products, units })
      const sinOrderId = await cotizar({ recipeId, quantity: '6.0000' }, actorDe(A))
      // El `orderId` es de Q, de OTRA empresa: la consulta de A sigue acotada a `companyId` de A,
      // asi que excluirlo no puede devolver nada distinto de no excluir nada.
      const conOrderIdAjeno = await cotizar({ recipeId, quantity: '6.0000', orderId: orderIdDeQ }, actorDe(A))

      expect(sinOrderId.ingredientsCost).toBe('30.0000')
      expect(conOrderIdAjeno.ingredientsCost).toBe('30.0000')
    } finally {
      if (orderIdDeQ !== null) await borrarPedido(orderIdDeQ)
      await borrarReceta(recipeIdQ)
      await borrarProducto(productIdQ)
      await borrarReceta(recipeId)
      await borrarProducto(productId)
    }
  })
})
