/**
 * Las restricciones de `order_deliveries`, `order_delivery_lines` y del asiento `delivery` de
 * `inventory_movements` contra Postgres REAL: un `INSERT` crudo por cada restriccion, todos
 * rechazados con su SQLSTATE, y un caso de control que la fila valida se acepta.
 *
 * AISLAMIENTO: cada `it` corre dentro de `prisma.$transaction` interactiva y termina lanzando
 * `RollbackSignal`, asi que ninguna fila sobrevive. Lo que se espera que la base rechace va en su
 * propio `SAVEPOINT` y con `$executeRaw`: solo el SQL crudo propaga el SQLSTATE en `meta.code`.
 */
import { randomUUID } from 'node:crypto'

import { Prisma } from '@prisma/client'
import { afterAll, describe, expect, it } from 'vitest'

import { normalizeCompanyName } from '@/lib/modules/identity'
import { prisma } from '@/lib/shared/db/prisma'

class RollbackSignal extends Error {
  constructor() {
    super('rollback de aislamiento del test')
    this.name = 'RollbackSignal'
  }
}

async function inRolledBackTransaction(
  body: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<void> {
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

const FOREIGN_KEY_VIOLATION = '23503'
const UNIQUE_VIOLATION = '23505'
const CHECK_VIOLATION = '23514'

let savepointSeq = 0

function sqlStateOf(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const meta: unknown = error.meta
    if (typeof meta === 'object' && meta !== null && 'code' in meta) {
      const code: unknown = (meta as { code: unknown }).code
      if (typeof code === 'string') return code
    }
    return error.code
  }
  return error instanceof Error ? error.message : String(error)
}

async function expectRejectedByDatabase(
  tx: Prisma.TransactionClient,
  run: () => Promise<unknown>,
  what: string,
): Promise<string> {
  savepointSeq += 1
  const savepoint = `delivery_sp_${String(savepointSeq)}`
  await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`)
  try {
    await run()
  } catch (error) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`)
    return sqlStateOf(error)
  }
  await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`)
  throw new Error(`se esperaba que la base rechazara la operacion, pero la acepto: ${what}`)
}

function token(): string {
  return randomUUID().replace(/-/gu, '')
}

function asUuid(id: string): Prisma.Sql {
  return Prisma.sql`CAST(${id} AS uuid)`
}

// --- Fixtures -------------------------------------------------------------------------------

type Tenant = {
  readonly companyId: string
  readonly userId: string
  readonly customerId: string
  readonly orderId: string
  readonly presentationLineId: string
  readonly batchId: string
}

let nextSequence = 910_000
function freshSequence(): number {
  nextSequence += 1
  return nextSequence
}

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
  const { id: presentationLineId } = await tx.orderPresentationLine.create({
    data: { orderId, companyId, presentationId, packages: 10 },
    select: { id: true },
  })

  const { id: productId } = await tx.product.create({
    data: { name: `Producto ${marca}`, nameNormalized: `producto${marca}`, companyId, unitId },
    select: { id: true },
  })
  const { id: batchId } = await tx.productBatch.create({
    data: {
      productId,
      presentationId,
      stock: 10,
      unitCost: new Prisma.Decimal('1.0000'),
      lot: `L-${randomUUID()}`,
      purchaseDate: new Date('2026-09-01T00:00:00Z'),
      companyId,
    },
    select: { id: true },
  })

  return { companyId, userId, customerId, orderId, presentationLineId, batchId }
}

// --- INSERT crudos --------------------------------------------------------------------------

async function rawInsertDelivery(
  tx: Prisma.TransactionClient,
  row: { companyId: string; orderId: string; customerId: string; createdBy: string; deliveryKey?: string },
): Promise<string> {
  const id = randomUUID()
  await tx.$executeRaw`
    INSERT INTO "order_deliveries" ("id", "company_id", "order_id", "customer_id", "delivery_key", "created_by")
    VALUES (
      ${asUuid(id)}, ${asUuid(row.companyId)}, ${asUuid(row.orderId)}, ${asUuid(row.customerId)},
      ${asUuid(row.deliveryKey ?? randomUUID())}, ${asUuid(row.createdBy)}
    )`
  return id
}

async function rawInsertDeliveryLine(
  tx: Prisma.TransactionClient,
  row: {
    companyId: string
    deliveryId: string
    presentationLineId: string
    batchId: string
    packages?: number
    quantity?: string
  },
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO "order_delivery_lines" ("company_id", "delivery_id", "order_presentation_line_id", "batch_id", "packages", "quantity")
    VALUES (
      ${asUuid(row.companyId)}, ${asUuid(row.deliveryId)}, ${asUuid(row.presentationLineId)}, ${asUuid(row.batchId)},
      ${row.packages ?? 2}, CAST(${row.quantity ?? '2'} AS decimal(14,4))
    )`
}

async function rawInsertMovement(
  tx: Prisma.TransactionClient,
  row: {
    companyId: string
    batchId: string
    kind: string
    quantity: string
    orderId: string | null
    orderDeliveryId: string | null
    reason?: string | null
  },
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO "inventory_movements" ("batch_id", "kind", "quantity", "reason", "order_id", "order_delivery_id", "company_id")
    VALUES (
      ${asUuid(row.batchId)}, CAST(${row.kind} AS "InventoryMovementKind"), CAST(${row.quantity} AS decimal(14,4)),
      ${row.reason ?? null},
      ${row.orderId === null ? null : asUuid(row.orderId)},
      ${row.orderDeliveryId === null ? null : asUuid(row.orderDeliveryId)},
      ${asUuid(row.companyId)}
    )`
}

/** Una entrega valida de la empresa, con su linea y su asiento. */
async function validDelivery(tx: Prisma.TransactionClient, t: Tenant): Promise<string> {
  const deliveryId = await rawInsertDelivery(tx, {
    companyId: t.companyId,
    orderId: t.orderId,
    customerId: t.customerId,
    createdBy: t.userId,
  })
  await rawInsertDeliveryLine(tx, {
    companyId: t.companyId,
    deliveryId,
    presentationLineId: t.presentationLineId,
    batchId: t.batchId,
  })
  await rawInsertMovement(tx, {
    companyId: t.companyId,
    batchId: t.batchId,
    kind: 'delivery',
    quantity: '-2',
    orderId: t.orderId,
    orderDeliveryId: deliveryId,
  })
  return deliveryId
}

afterAll(async () => {
  await prisma.$disconnect()
})

// --- Casos ----------------------------------------------------------------------------------

describe('order_deliveries y order_delivery_lines contra Postgres real', () => {
  it('R31: control positivo: una entrega de la empresa con su linea y su asiento delivery se acepta', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const deliveryId = await validDelivery(tx, a)

      expect(await tx.orderDelivery.count({ where: { id: deliveryId } })).toBe(1)
      expect(await tx.orderDeliveryLine.count({ where: { deliveryId } })).toBe(1)
      const asientos = await tx.inventoryMovement.findMany({ where: { orderDeliveryId: deliveryId } })
      expect(asientos.map((m) => [m.kind, m.quantity.toString(), m.orderId])).toEqual([['delivery', '-2', a.orderId]])
    })
  })

  it('R31: la entrega no puede apuntar al pedido, al cliente ni a la empresa de otra', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const b = await createTenant(tx, 'B')
      const base = { companyId: a.companyId, orderId: a.orderId, customerId: a.customerId, createdBy: a.userId }

      expect(
        await expectRejectedByDatabase(tx, () => rawInsertDelivery(tx, { ...base, orderId: b.orderId }), 'pedido de B'),
      ).toBe(FOREIGN_KEY_VIOLATION)
      expect(
        await expectRejectedByDatabase(
          tx,
          () => rawInsertDelivery(tx, { ...base, customerId: b.customerId }),
          'cliente de B',
        ),
      ).toBe(FOREIGN_KEY_VIOLATION)
      expect(
        await expectRejectedByDatabase(
          tx,
          () => rawInsertDelivery(tx, { ...base, companyId: randomUUID() }),
          'empresa inexistente',
        ),
      ).toBe(FOREIGN_KEY_VIOLATION)
      expect(
        await expectRejectedByDatabase(
          tx,
          () => rawInsertDelivery(tx, { ...base, createdBy: randomUUID() }),
          'autor inexistente',
        ),
      ).toBe(FOREIGN_KEY_VIOLATION)
    })
  })

  it('R29, R31: la clave de entrega es unica por empresa; la misma clave en otra empresa se acepta', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const b = await createTenant(tx, 'B')
      const deliveryKey = randomUUID()
      await rawInsertDelivery(tx, {
        companyId: a.companyId,
        orderId: a.orderId,
        customerId: a.customerId,
        createdBy: a.userId,
        deliveryKey,
      })

      expect(
        await expectRejectedByDatabase(
          tx,
          () =>
            rawInsertDelivery(tx, {
              companyId: a.companyId,
              orderId: a.orderId,
              customerId: a.customerId,
              createdBy: a.userId,
              deliveryKey,
            }),
          'misma clave en la misma empresa',
        ),
      ).toBe(UNIQUE_VIOLATION)

      await rawInsertDelivery(tx, {
        companyId: b.companyId,
        orderId: b.orderId,
        customerId: b.customerId,
        createdBy: b.userId,
        deliveryKey,
      })
    })
  })

  it('R31: la linea no puede apuntar a la entrega, a la linea del reparto ni al lote de otra empresa', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const b = await createTenant(tx, 'B')
      const deliveryA = await rawInsertDelivery(tx, {
        companyId: a.companyId,
        orderId: a.orderId,
        customerId: a.customerId,
        createdBy: a.userId,
      })
      const base = {
        companyId: a.companyId,
        deliveryId: deliveryA,
        presentationLineId: a.presentationLineId,
        batchId: a.batchId,
      }

      expect(
        await expectRejectedByDatabase(
          tx,
          () => rawInsertDeliveryLine(tx, { ...base, companyId: b.companyId, presentationLineId: b.presentationLineId, batchId: b.batchId }),
          'linea de B sobre la entrega de A',
        ),
      ).toBe(FOREIGN_KEY_VIOLATION)
      expect(
        await expectRejectedByDatabase(
          tx,
          () => rawInsertDeliveryLine(tx, { ...base, presentationLineId: b.presentationLineId }),
          'linea del reparto de B',
        ),
      ).toBe(FOREIGN_KEY_VIOLATION)
      expect(
        await expectRejectedByDatabase(tx, () => rawInsertDeliveryLine(tx, { ...base, batchId: b.batchId }), 'lote de B'),
      ).toBe(FOREIGN_KEY_VIOLATION)
    })
  })

  it('R31: envases y cantidad positivos, y un lote una sola vez por entrega', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const deliveryId = await rawInsertDelivery(tx, {
        companyId: a.companyId,
        orderId: a.orderId,
        customerId: a.customerId,
        createdBy: a.userId,
      })
      const base = { companyId: a.companyId, deliveryId, presentationLineId: a.presentationLineId, batchId: a.batchId }

      for (const [packages, quantity, what] of [
        [0, '2', 'cero envases'],
        [-1, '2', 'envases negativos'],
        [2, '0', 'cantidad cero'],
        [2, '-2', 'cantidad negativa'],
      ] as const) {
        expect(
          await expectRejectedByDatabase(tx, () => rawInsertDeliveryLine(tx, { ...base, packages, quantity }), what),
          what,
        ).toBe(CHECK_VIOLATION)
      }

      await rawInsertDeliveryLine(tx, base)
      expect(
        await expectRejectedByDatabase(tx, () => rawInsertDeliveryLine(tx, base), 'mismo lote dos veces'),
      ).toBe(UNIQUE_VIOLATION)
    })
  })
})

describe('el asiento delivery de inventory_movements contra Postgres real', () => {
  it('R24, R31: delivery exige su entrega, su pedido, cantidad negativa y ningun motivo', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const deliveryId = await rawInsertDelivery(tx, {
        companyId: a.companyId,
        orderId: a.orderId,
        customerId: a.customerId,
        createdBy: a.userId,
      })
      const base = {
        companyId: a.companyId,
        batchId: a.batchId,
        kind: 'delivery',
        quantity: '-2',
        orderId: a.orderId as string | null,
        orderDeliveryId: deliveryId as string | null,
      }

      const casos: ReadonlyArray<readonly [string, Partial<typeof base> & { reason?: string }]> = [
        ['delivery sin entrega', { orderDeliveryId: null }],
        ['delivery sin pedido', { orderId: null }],
        ['delivery con cantidad positiva', { quantity: '2' }],
        ['delivery con motivo', { reason: 'merma' }],
      ]
      for (const [what, cambio] of casos) {
        expect(await expectRejectedByDatabase(tx, () => rawInsertMovement(tx, { ...base, ...cambio }), what), what).toBe(
          CHECK_VIOLATION,
        )
      }

      expect(
        await expectRejectedByDatabase(
          tx,
          () => rawInsertMovement(tx, { ...base, kind: 'adjustment', quantity: '-1', orderId: null, reason: 'merma' }),
          'un ajuste con entrega',
        ),
      ).toBe(CHECK_VIOLATION)
    })
  })

  it('R24, R31: un solo asiento delivery por lote y entrega', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const deliveryId = await validDelivery(tx, a)

      expect(
        await expectRejectedByDatabase(
          tx,
          () =>
            rawInsertMovement(tx, {
              companyId: a.companyId,
              batchId: a.batchId,
              kind: 'delivery',
              quantity: '-1',
              orderId: a.orderId,
              orderDeliveryId: deliveryId,
            }),
          'segundo asiento del mismo lote en la misma entrega',
        ),
      ).toBe(UNIQUE_VIOLATION)
    })
  })

  it('R31: el asiento no puede apuntar a la entrega de otra empresa', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const b = await createTenant(tx, 'B')
      const deliveryB = await rawInsertDelivery(tx, {
        companyId: b.companyId,
        orderId: b.orderId,
        customerId: b.customerId,
        createdBy: b.userId,
      })

      expect(
        await expectRejectedByDatabase(
          tx,
          () =>
            rawInsertMovement(tx, {
              companyId: a.companyId,
              batchId: a.batchId,
              kind: 'delivery',
              quantity: '-1',
              orderId: a.orderId,
              orderDeliveryId: deliveryB,
            }),
          'asiento de A con la entrega de B',
        ),
      ).toBe(FOREIGN_KEY_VIOLATION)
    })
  })

  it('R31: las dos tablas nuevas tienen RLS activada y forzada', async () => {
    const filas = await prisma.$queryRaw<Array<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>>`
      SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
      WHERE relname IN ('order_deliveries', 'order_delivery_lines') AND relkind = 'r'
      ORDER BY relname`
    expect(filas).toEqual([
      { relname: 'order_deliveries', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'order_delivery_lines', relrowsecurity: true, relforcerowsecurity: true },
    ])
  })
})
