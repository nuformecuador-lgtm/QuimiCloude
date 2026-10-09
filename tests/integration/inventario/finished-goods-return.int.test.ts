/**
 * La vuelta al lote de una entrega anulada (`createFinishedGoodsReturn` -> `returnFinishedGoods`) y
 * el directorio de lotes (`batchLotDirectoryPrisma`) contra Postgres REAL.
 *
 * AISLAMIENTO: la devolucion trabaja sobre la `tx` de quien llama, asi que sus casos corren dentro
 * de `prisma.$transaction` interactiva y terminan lanzando `RollbackSignal`. `findLots` y el
 * historial del lote leen con el cliente GLOBAL, que no ve lo que una transaccion abierta no
 * confirmo: su caso escribe de verdad sobre dos empresas efimeras y las borra en un `finally`.
 */
import { randomUUID } from 'node:crypto'

import { Prisma } from '@prisma/client'
import { afterAll, describe, expect, it } from 'vitest'

import { normalizeCompanyName } from '@/lib/modules/identity'
import { findBatchMovements } from '@/lib/modules/inventario/adapters/driven/persistence/batch-movement-prisma'
import {
  batchLotDirectoryPrisma,
  createFinishedGoodsReturn,
} from '@/lib/modules/inventario/adapters/driven/persistence/finished-goods-return-prisma'
import { prisma } from '@/lib/shared/db/prisma'

type Db = Prisma.TransactionClient | typeof prisma

class RollbackSignal extends Error {
  constructor() {
    super('rollback de aislamiento del test')
    this.name = 'RollbackSignal'
  }
}

async function inRolledBackTransaction(body: (tx: Prisma.TransactionClient) => Promise<void>): Promise<void> {
  try {
    await prisma.$transaction(
      async (tx) => {
        await body(tx)
        throw new RollbackSignal()
      },
      { maxWait: 10_000, timeout: 60_000 },
    )
  } catch (error) {
    if (!(error instanceof RollbackSignal)) throw error
  }
}

function token(): string {
  return randomUUID().replace(/-/gu, '')
}

function asUuid(id: string): Prisma.Sql {
  return Prisma.sql`CAST(${id} AS uuid)`
}

let nextSequence = 940_000
function freshSequence(): number {
  nextSequence += 1
  return nextSequence
}

type Tenant = {
  readonly companyId: string
  readonly userId: string
  readonly roleId: string
  readonly documentTypeCode: string
  readonly unitId: string
  readonly orderId: string
  readonly deliveryId: string
  readonly presentationId: string
  readonly productId: string
}

/** Empresa con usuario, cliente, receta, presentacion, pedido, producto terminado y una entrega. */
async function createTenant(db: Db, label: string): Promise<Tenant> {
  const marca = token()
  const name = `Empresa ${label} ${marca}`
  const { id: companyId } = await db.company.create({
    data: { name, nameNormalized: normalizeCompanyName(name) },
    select: { id: true },
  })
  const { code: documentTypeCode } = await db.documentType.create({
    data: { code: `DOC${marca.slice(0, 8)}`, name: 'Tipo de documento de prueba' },
    select: { code: true },
  })
  const { id: roleId } = await db.role.create({
    data: { name: `rol-${marca}`, description: 'Rol de prueba' },
    select: { id: true },
  })
  const { id: userId } = await db.user.create({
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
  })
  const { id: customerId } = await db.customer.create({
    data: {
      firstNames: 'Luis',
      firstNamesNormalized: 'luis',
      lastNames: 'Rojas',
      lastNamesNormalized: 'rojas',
      city: 'Cali',
      cityNormalized: 'cali',
      companyId,
    },
    select: { id: true },
  })
  const { id: recipeId } = await db.recipe.create({
    data: { name: `Receta ${marca}`, nameNormalized: `receta${marca}`, companyId },
    select: { id: true },
  })
  const orderId = randomUUID()
  await db.$executeRaw`
    INSERT INTO "orders" ("id", "company_id", "order_year", "order_sequence", "recipe_id", "quantity", "updated_at")
    VALUES (
      ${asUuid(orderId)}, ${asUuid(companyId)}, ${new Date().getUTCFullYear()}, ${freshSequence()},
      ${asUuid(recipeId)}, CAST('10' AS decimal(14,4)), CURRENT_TIMESTAMP
    )`
  const { id: unitId } = await db.unit.create({
    data: { name: `Unidad ${marca}`, nameNormalized: `unidad${marca}`, symbol: `u${marca.slice(0, 8)}` },
    select: { id: true },
  })
  const { id: presentationId } = await db.presentation.create({
    data: { name: `Presentacion ${marca}`, nameNormalized: `presentacion${marca}`, unitId, companyId },
    select: { id: true },
  })
  const { id: productId } = await db.product.create({
    data: {
      name: `Terminado ${marca}`,
      nameNormalized: `terminado${marca}`,
      type: 'FINISHED_PRODUCT',
      unitId,
      recipeId,
      presentationId,
      companyId,
    },
    select: { id: true },
  })
  const { id: deliveryId } = await db.orderDelivery.create({
    data: { companyId, orderId, customerId, deliveryKey: randomUUID(), createdBy: userId },
    select: { id: true },
  })
  return { companyId, userId, roleId, documentTypeCode, unitId, orderId, deliveryId, presentationId, productId }
}

/** Borra todo lo de una empresa efimera confirmada, en el orden que exigen las FK. */
async function dropTenant(t: Tenant): Promise<void> {
  const where = { companyId: t.companyId }
  await prisma.inventoryMovement.deleteMany({ where })
  await prisma.orderDeliveryVoid.deleteMany({ where })
  await prisma.orderDelivery.deleteMany({ where })
  await prisma.productBatch.deleteMany({ where })
  await prisma.product.deleteMany({ where })
  await prisma.presentation.deleteMany({ where })
  await prisma.unit.deleteMany({ where: { id: t.unitId } })
  await prisma.order.deleteMany({ where })
  await prisma.recipe.deleteMany({ where })
  await prisma.customer.deleteMany({ where })
  await prisma.user.deleteMany({ where: { id: t.userId } })
  await prisma.role.deleteMany({ where: { id: t.roleId } })
  await prisma.documentType.deleteMany({ where: { code: t.documentTypeCode } })
  await prisma.company.deleteMany({ where: { id: t.companyId } })
}

async function createBatch(
  db: Db,
  t: Tenant,
  stock: string,
  productId: string = t.productId,
): Promise<{ readonly id: string; readonly lot: string }> {
  return db.productBatch.create({
    data: {
      productId,
      presentationId: t.presentationId,
      stock: new Prisma.Decimal(stock),
      unitCost: new Prisma.Decimal('1.0000'),
      packageContent: new Prisma.Decimal('5.0000'),
      lot: `L-${randomUUID()}`,
      purchaseDate: new Date('2026-09-01T00:00:00Z'),
      companyId: t.companyId,
    },
    select: { id: true, lot: true },
  })
}

async function createVoid(db: Db, t: Tenant): Promise<string> {
  const { id } = await db.orderDeliveryVoid.create({
    data: {
      companyId: t.companyId,
      deliveryId: t.deliveryId,
      voidKey: randomUUID(),
      reason: 'Cliente devolvio el pedido',
      createdBy: t.userId,
    },
    select: { id: true },
  })
  return id
}

function returnInput(t: Tenant, voidId: string, lines: readonly { batchId: string; quantity: string }[]) {
  return {
    companyId: t.companyId,
    orderId: t.orderId,
    orderDeliveryVoidId: voidId,
    lines,
    actorId: t.userId,
    now: new Date(),
  }
}

async function stockOf(db: Db, batchId: string): Promise<string> {
  const row = await db.productBatch.findUniqueOrThrow({ where: { id: batchId }, select: { stock: true } })
  return row.stock.toFixed(4)
}

async function productStockOf(db: Db, productId: string): Promise<string> {
  const row = await db.product.findUniqueOrThrow({ where: { id: productId }, select: { stock: true } })
  return row.stock.toFixed(4)
}

afterAll(async () => {
  await prisma.$disconnect()
})

describe('returnFinishedGoods contra Postgres real', () => {
  it('R23: cada lote queda en antes + cantidad y products.stock es la suma de todos sus lotes', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const lote1 = await createBatch(tx, a, '5.0000')
      const lote2 = await createBatch(tx, a, '0.0000')
      const intacto = await createBatch(tx, a, '7.2500')
      const voidId = await createVoid(tx, a)

      const outcome = await createFinishedGoodsReturn(tx).returnForDeliveryVoid(
        returnInput(a, voidId, [
          { batchId: lote1.id, quantity: '15.0000' },
          { batchId: lote2.id, quantity: '2.5000' },
        ]),
      )

      expect(outcome).toEqual({ kind: 'returned' })
      expect(await stockOf(tx, lote1.id)).toBe('20.0000')
      expect(await stockOf(tx, lote2.id)).toBe('2.5000')
      expect(await stockOf(tx, intacto.id)).toBe('7.2500')
      expect(await productStockOf(tx, a.productId)).toBe('29.7500')
    })
  })

  it('R24: un asiento delivery_void por lote, en positivo, con pedido, anulacion, autor y sin motivo', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const lote1 = await createBatch(tx, a, '0.0000')
      const lote2 = await createBatch(tx, a, '0.0000')
      const voidId = await createVoid(tx, a)
      const now = new Date('2026-10-09T15:30:00.000Z')

      await createFinishedGoodsReturn(tx).returnForDeliveryVoid({
        ...returnInput(a, voidId, [
          { batchId: lote1.id, quantity: '10.0000' },
          { batchId: lote2.id, quantity: '0.7500' },
        ]),
        now,
      })

      const asientos = await tx.inventoryMovement.findMany({
        where: { orderDeliveryVoidId: voidId },
        orderBy: { quantity: 'desc' },
        select: {
          batchId: true,
          kind: true,
          quantity: true,
          orderId: true,
          orderDeliveryId: true,
          orderPresentationLineId: true,
          reason: true,
          createdBy: true,
          createdAt: true,
          companyId: true,
        },
      })
      expect(asientos).toEqual(
        [
          [lote1.id, '10'],
          [lote2.id, '0.75'],
        ].map(([batchId, quantity]) => ({
          batchId,
          kind: 'delivery_void',
          quantity: new Prisma.Decimal(quantity as string),
          orderId: a.orderId,
          orderDeliveryId: null,
          orderPresentationLineId: null,
          reason: null,
          createdBy: a.userId,
          createdAt: now,
          companyId: a.companyId,
        })),
      )
    })
  })

  it('R31: el producto dado de baja recupera igual sus envases y su existencia se recalcula', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const lote = await createBatch(tx, a, '1.0000')
      await tx.product.update({ where: { id: a.productId }, data: { deletedAt: new Date() } })
      const voidId = await createVoid(tx, a)

      const outcome = await createFinishedGoodsReturn(tx).returnForDeliveryVoid(
        returnInput(a, voidId, [{ batchId: lote.id, quantity: '4.0000' }]),
      )

      expect(outcome).toEqual({ kind: 'returned' })
      expect(await stockOf(tx, lote.id)).toBe('5.0000')
      expect(await productStockOf(tx, a.productId)).toBe('5.0000')
      expect(await tx.inventoryMovement.count({ where: { batchId: lote.id, kind: 'delivery_void' } })).toBe(1)
      const product = await tx.product.findUniqueOrThrow({ where: { id: a.productId }, select: { deletedAt: true } })
      expect(product.deletedAt).not.toBeNull()
    })
  })

  it('R29: un lote de la empresa B pedido con el ambito de A da batch_not_found y no toca nada', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const b = await createTenant(tx, 'B')
      const loteA = await createBatch(tx, a, '3.0000')
      const loteB = await createBatch(tx, b, '20.0000')
      const voidId = await createVoid(tx, a)

      const outcome = await createFinishedGoodsReturn(tx).returnForDeliveryVoid(
        returnInput(a, voidId, [
          { batchId: loteA.id, quantity: '1.0000' },
          { batchId: loteB.id, quantity: '5.0000' },
        ]),
      )

      expect(outcome).toEqual({ kind: 'batch_not_found', batchId: loteB.id })
      expect(await stockOf(tx, loteA.id)).toBe('3.0000')
      expect(await stockOf(tx, loteB.id)).toBe('20.0000')
      expect(await tx.inventoryMovement.count({ where: { orderDeliveryVoidId: voidId } })).toBe(0)
      expect(await tx.inventoryMovement.count({ where: { batchId: loteB.id } })).toBe(0)
    })
  })
})

describe('batchLotDirectoryPrisma.findLots y el historial del lote, sobre filas confirmadas', () => {
  it('R7, R24: findLots devuelve solo los lotes de la empresa y el historial muestra el asiento delivery_void', async () => {
    const tenants: Tenant[] = []
    try {
      const a = await createTenant(prisma, 'A')
      tenants.push(a)
      const b = await createTenant(prisma, 'B')
      tenants.push(b)
      const loteA = await createBatch(prisma, a, '2.0000')
      const loteB = await createBatch(prisma, b, '2.0000')
      // El lote de un producto dado de baja tambien tiene que verse.
      await prisma.product.update({ where: { id: a.productId }, data: { deletedAt: new Date() } })

      const lots = await batchLotDirectoryPrisma.findLots([loteA.id, loteB.id, randomUUID()], a.companyId)
      expect([...lots.entries()]).toEqual([[loteA.id, loteA.lot]])
      expect(await batchLotDirectoryPrisma.findLots([], a.companyId)).toEqual(new Map())

      const voidId = await createVoid(prisma, a)
      await prisma.$transaction((tx) =>
        createFinishedGoodsReturn(tx).returnForDeliveryVoid(
          returnInput(a, voidId, [{ batchId: loteA.id, quantity: '3.0000' }]),
        ),
      )

      const history = await findBatchMovements(loteA.id, { companyId: a.companyId })
      expect(history?.map((entry) => [entry.kind, entry.quantity, entry.reason, entry.orderNumberText])).toEqual([
        ['delivery_void', '3.0000', null, a.orderId],
      ])
    } finally {
      for (const t of tenants) await dropTenant(t)
    }
  })
})
