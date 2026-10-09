/**
 * La salida de producto terminado (`createFinishedGoodsDispatch` -> `dispatchFinishedGoods`) contra
 * Postgres REAL: el decremento de cada lote, el asiento `delivery` por lote, el recalculo de
 * `products.stock`, el acceso cruzado entre empresas y el rechazo por envases insuficientes.
 *
 * AISLAMIENTO: la salida trabaja sobre la `tx` de quien llama, asi que cada `it` corre dentro de
 * `prisma.$transaction` interactiva y termina lanzando `RollbackSignal`: ninguna fila sobrevive.
 */
import { randomUUID } from 'node:crypto'

import { Prisma } from '@prisma/client'
import { afterAll, describe, expect, it } from 'vitest'

import { normalizeCompanyName } from '@/lib/modules/identity'
import { createFinishedGoodsDispatch } from '@/lib/modules/inventario/adapters/driven/persistence/finished-goods-dispatch-prisma'
import { prisma } from '@/lib/shared/db/prisma'

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

let nextSequence = 930_000
function freshSequence(): number {
  nextSequence += 1
  return nextSequence
}

type Tenant = {
  readonly companyId: string
  readonly userId: string
  readonly orderId: string
  readonly deliveryId: string
  readonly recipeId: string
  readonly presentationId: string
  readonly productId: string
}

/** Empresa con usuario, cliente, receta, presentacion, pedido, producto terminado y una entrega. */
async function createTenant(tx: Prisma.TransactionClient, label: string): Promise<Tenant> {
  const marca = token()
  const name = `Empresa ${label} ${marca}`
  const { id: companyId } = await tx.company.create({
    data: { name, nameNormalized: normalizeCompanyName(name) },
    select: { id: true },
  })
  const documentType = await tx.documentType.create({
    data: { code: `DOC${marca.slice(0, 8)}`, name: 'Tipo de documento de prueba' },
    select: { code: true },
  })
  const role = await tx.role.create({
    data: { name: `rol-${marca}`, description: 'Rol de prueba' },
    select: { id: true },
  })
  const { id: userId } = await tx.user.create({
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
      companyId,
    },
    select: { id: true },
  })
  const { id: customerId } = await tx.customer.create({
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
  const { id: recipeId } = await tx.recipe.create({
    data: { name: `Receta ${marca}`, nameNormalized: `receta${marca}`, companyId },
    select: { id: true },
  })
  const orderId = randomUUID()
  await tx.$executeRaw`
    INSERT INTO "orders" ("id", "company_id", "order_year", "order_sequence", "recipe_id", "quantity", "updated_at")
    VALUES (
      ${asUuid(orderId)}, ${asUuid(companyId)}, ${new Date().getUTCFullYear()}, ${freshSequence()},
      ${asUuid(recipeId)}, CAST('10' AS decimal(14,4)), CURRENT_TIMESTAMP
    )`
  const { id: unitId } = await tx.unit.create({
    data: { name: `Unidad ${marca}`, nameNormalized: `unidad${marca}`, symbol: `u${marca.slice(0, 8)}` },
    select: { id: true },
  })
  const { id: presentationId } = await tx.presentation.create({
    data: { name: `Presentacion ${marca}`, nameNormalized: `presentacion${marca}`, unitId, companyId },
    select: { id: true },
  })
  const { id: productId } = await tx.product.create({
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
  const { id: deliveryId } = await tx.orderDelivery.create({
    data: { companyId, orderId, customerId, deliveryKey: randomUUID(), createdBy: userId },
    select: { id: true },
  })
  return { companyId, userId, orderId, deliveryId, recipeId, presentationId, productId }
}

async function createBatch(
  tx: Prisma.TransactionClient,
  t: Tenant,
  stock: string,
  packageContent: string,
): Promise<string> {
  const { id } = await tx.productBatch.create({
    data: {
      productId: t.productId,
      presentationId: t.presentationId,
      stock: new Prisma.Decimal(stock),
      unitCost: new Prisma.Decimal('1.0000'),
      packageContent: new Prisma.Decimal(packageContent),
      lot: `L-${randomUUID()}`,
      purchaseDate: new Date('2026-09-01T00:00:00Z'),
      companyId: t.companyId,
    },
    select: { id: true },
  })
  return id
}

function dispatchInput(t: Tenant, allocations: readonly { batchId: string; packages: number }[]) {
  return {
    companyId: t.companyId,
    orderId: t.orderId,
    orderDeliveryId: t.deliveryId,
    recipeId: t.recipeId,
    presentationId: t.presentationId,
    allocations,
    actorId: t.userId,
    now: new Date(),
  }
}

async function stockOf(tx: Prisma.TransactionClient, batchId: string): Promise<string> {
  const row = await tx.productBatch.findUniqueOrThrow({ where: { id: batchId }, select: { stock: true } })
  return row.stock.toFixed(4)
}

afterAll(async () => {
  await prisma.$disconnect()
})

describe('dispatchFinishedGoods contra Postgres real', () => {
  it('R23, R24: cada lote baja envases x contenido, products.stock es la suma de lotes y queda un asiento delivery por lote', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const lote1 = await createBatch(tx, a, '20.0000', '5.0000')
      const lote2 = await createBatch(tx, a, '7.5000', '2.5000')

      const outcome = await createFinishedGoodsDispatch(tx).dispatchForDelivery(
        dispatchInput(a, [
          { batchId: lote1, packages: 3 },
          { batchId: lote2, packages: 2 },
        ]),
      )

      expect(outcome).toEqual({
        kind: 'dispatched',
        lines: [
          { batchId: lote1, packages: 3, quantity: '15.0000' },
          { batchId: lote2, packages: 2, quantity: '5.0000' },
        ],
      })
      expect(await stockOf(tx, lote1)).toBe('5.0000')
      expect(await stockOf(tx, lote2)).toBe('2.5000')

      const product = await tx.product.findUniqueOrThrow({ where: { id: a.productId }, select: { stock: true } })
      expect(product.stock.toFixed(4)).toBe('7.5000')

      const asientos = await tx.inventoryMovement.findMany({
        where: { orderDeliveryId: a.deliveryId },
        orderBy: { quantity: 'asc' },
        select: { batchId: true, kind: true, quantity: true, orderId: true, reason: true, companyId: true },
      })
      expect(asientos.map((m) => [m.batchId, m.kind, m.quantity.toFixed(4), m.orderId, m.reason, m.companyId])).toEqual([
        [lote1, 'delivery', '-15.0000', a.orderId, null, a.companyId],
        [lote2, 'delivery', '-5.0000', a.orderId, null, a.companyId],
      ])
    })
  })

  it('R19: un lote de la empresa B pedido con el ambito de A da batch_not_found y no toca nada', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const b = await createTenant(tx, 'B')
      const loteB = await createBatch(tx, b, '20.0000', '5.0000')

      const outcome = await createFinishedGoodsDispatch(tx).dispatchForDelivery(
        dispatchInput(a, [{ batchId: loteB, packages: 1 }]),
      )

      expect(outcome).toEqual({ kind: 'batch_not_found', batchId: loteB })
      expect(await stockOf(tx, loteB)).toBe('20.0000')
      expect(await tx.inventoryMovement.count({ where: { batchId: loteB } })).toBe(0)
      expect(await tx.inventoryMovement.count({ where: { orderDeliveryId: a.deliveryId } })).toBe(0)
    })
  })

  it('R19: un lote de otro producto de la misma empresa da batch_not_found', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const otra = await createTenant(tx, 'A2')
      const loteAjeno = await createBatch(tx, otra, '20.0000', '5.0000')
      // Mismo pedido y entrega de A, pero el lote es del producto terminado de otra combinacion.
      const outcome = await createFinishedGoodsDispatch(tx).dispatchForDelivery(
        dispatchInput(a, [{ batchId: loteAjeno, packages: 1 }]),
      )

      expect(outcome).toEqual({ kind: 'batch_not_found', batchId: loteAjeno })
      expect(await stockOf(tx, loteAjeno)).toBe('20.0000')
    })
  })

  it('R20: pedir mas envases enteros de los que tiene el lote da insufficient con los disponibles y no escribe nada', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const lote = await createBatch(tx, a, '14.9999', '5.0000')

      const outcome = await createFinishedGoodsDispatch(tx).dispatchForDelivery(
        dispatchInput(a, [{ batchId: lote, packages: 3 }]),
      )

      expect(outcome).toEqual({ kind: 'insufficient', batchId: lote, availablePackages: 2 })
      expect(await stockOf(tx, lote)).toBe('14.9999')
      expect(await tx.inventoryMovement.count({ where: { batchId: lote } })).toBe(0)
      const product = await tx.product.findUniqueOrThrow({ where: { id: a.productId }, select: { stock: true } })
      expect(product.stock.toFixed(4)).toBe('0.0000')
    })
  })
})
