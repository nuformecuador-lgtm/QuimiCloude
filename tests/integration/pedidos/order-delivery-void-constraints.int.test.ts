/**
 * Las restricciones de `order_delivery_voids`, `order_delivery_void_lines` y del asiento
 * `delivery_void` de `inventory_movements` contra Postgres REAL: un `INSERT` crudo por cada
 * restriccion, todos rechazados con su SQLSTATE, y un caso de control que la fila valida se acepta.
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
  const savepoint = `delivery_void_sp_${String(savepointSeq)}`
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
  readonly otherBatchId: string
}

let nextSequence = 920_000
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
  const batch = (lot: string) =>
    tx.productBatch.create({
      data: {
        productId,
        presentationId,
        stock: 10,
        unitCost: new Prisma.Decimal('1.0000'),
        lot,
        purchaseDate: new Date('2026-09-01T00:00:00Z'),
        companyId,
      },
      select: { id: true },
    })
  const { id: batchId } = await batch(`L-${randomUUID()}`)
  const { id: otherBatchId } = await batch(`L-${randomUUID()}`)

  return { companyId, userId, customerId, orderId, presentationLineId, batchId, otherBatchId }
}

// --- INSERT crudos --------------------------------------------------------------------------

/** Una entrega de la empresa con una linea por lote dado; devuelve la entrega y sus lineas. */
async function insertDelivery(
  tx: Prisma.TransactionClient,
  t: Tenant,
  batchIds: readonly string[],
): Promise<{ deliveryId: string; lineIds: readonly string[] }> {
  const deliveryId = randomUUID()
  await tx.$executeRaw`
    INSERT INTO "order_deliveries" ("id", "company_id", "order_id", "customer_id", "delivery_key", "created_by")
    VALUES (
      ${asUuid(deliveryId)}, ${asUuid(t.companyId)}, ${asUuid(t.orderId)}, ${asUuid(t.customerId)},
      ${asUuid(randomUUID())}, ${asUuid(t.userId)}
    )`
  const lineIds: string[] = []
  for (const batchId of batchIds) {
    const lineId = randomUUID()
    await tx.$executeRaw`
      INSERT INTO "order_delivery_lines" ("id", "company_id", "delivery_id", "order_presentation_line_id", "batch_id", "packages", "quantity")
      VALUES (
        ${asUuid(lineId)}, ${asUuid(t.companyId)}, ${asUuid(deliveryId)}, ${asUuid(t.presentationLineId)},
        ${asUuid(batchId)}, 2, CAST('2' AS decimal(14,4))
      )`
    lineIds.push(lineId)
  }
  return { deliveryId, lineIds }
}

async function rawInsertVoid(
  tx: Prisma.TransactionClient,
  row: { companyId: string; deliveryId: string; createdBy: string; voidKey?: string; reason?: string },
): Promise<string> {
  const id = randomUUID()
  await tx.$executeRaw`
    INSERT INTO "order_delivery_voids" ("id", "company_id", "delivery_id", "void_key", "reason", "created_by")
    VALUES (
      ${asUuid(id)}, ${asUuid(row.companyId)}, ${asUuid(row.deliveryId)}, ${asUuid(row.voidKey ?? randomUUID())},
      ${row.reason ?? 'Se entrego al cliente equivocado'}, ${asUuid(row.createdBy)}
    )`
  return id
}

async function rawInsertVoidLine(
  tx: Prisma.TransactionClient,
  row: { companyId: string; voidId: string; deliveryId: string; deliveryLineId: string },
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO "order_delivery_void_lines" ("company_id", "void_id", "delivery_id", "delivery_line_id")
    VALUES (
      ${asUuid(row.companyId)}, ${asUuid(row.voidId)}, ${asUuid(row.deliveryId)}, ${asUuid(row.deliveryLineId)}
    )`
}

type MovementRow = {
  companyId: string
  batchId: string
  kind: string
  quantity: string
  orderId: string | null
  orderDeliveryId?: string | null
  orderDeliveryVoidId: string | null
  reason?: string | null
}

async function rawInsertMovement(tx: Prisma.TransactionClient, row: MovementRow): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO "inventory_movements" ("batch_id", "kind", "quantity", "reason", "order_id", "order_delivery_id", "order_delivery_void_id", "company_id")
    VALUES (
      ${asUuid(row.batchId)}, CAST(${row.kind} AS "InventoryMovementKind"), CAST(${row.quantity} AS decimal(14,4)),
      ${row.reason ?? null},
      ${row.orderId === null ? null : asUuid(row.orderId)},
      ${row.orderDeliveryId === undefined || row.orderDeliveryId === null ? null : asUuid(row.orderDeliveryId)},
      ${row.orderDeliveryVoidId === null ? null : asUuid(row.orderDeliveryVoidId)},
      ${asUuid(row.companyId)}
    )`
}

/** Una entrega de un lote anulada entera, con su linea anulada; sin asiento. */
async function voidedDelivery(
  tx: Prisma.TransactionClient,
  t: Tenant,
): Promise<{ deliveryId: string; lineId: string; voidId: string }> {
  const { deliveryId, lineIds } = await insertDelivery(tx, t, [t.batchId])
  const lineId = lineIds[0] as string
  const voidId = await rawInsertVoid(tx, { companyId: t.companyId, deliveryId, createdBy: t.userId })
  await rawInsertVoidLine(tx, { companyId: t.companyId, voidId, deliveryId, deliveryLineId: lineId })
  return { deliveryId, lineId, voidId }
}

afterAll(async () => {
  await prisma.$disconnect()
})

// --- Casos ----------------------------------------------------------------------------------

describe('order_delivery_voids y order_delivery_void_lines contra Postgres real', () => {
  it('R32: control positivo: una anulacion de la empresa con su linea y su asiento delivery_void se acepta', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const { voidId } = await voidedDelivery(tx, a)
      await rawInsertMovement(tx, {
        companyId: a.companyId,
        batchId: a.batchId,
        kind: 'delivery_void',
        quantity: '2',
        orderId: a.orderId,
        orderDeliveryVoidId: voidId,
      })

      expect(await tx.orderDeliveryVoid.count({ where: { id: voidId } })).toBe(1)
      expect(await tx.orderDeliveryVoidLine.count({ where: { voidId } })).toBe(1)
      const asientos = await tx.inventoryMovement.findMany({ where: { orderDeliveryVoidId: voidId } })
      expect(asientos.map((m) => [m.kind, m.quantity.toString(), m.orderId, m.reason])).toEqual([
        ['delivery_void', '2', a.orderId, null],
      ])
    })
  })

  it('R32: la anulacion no puede apuntar a la entrega, a la empresa ni al usuario de otra', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const b = await createTenant(tx, 'B')
      const { deliveryId: deliveryA } = await insertDelivery(tx, a, [a.batchId])
      const { deliveryId: deliveryB } = await insertDelivery(tx, b, [b.batchId])
      const base = { companyId: a.companyId, deliveryId: deliveryA, createdBy: a.userId }

      const casos: ReadonlyArray<readonly [string, Partial<typeof base>]> = [
        ['entrega de B', { deliveryId: deliveryB }],
        ['empresa de B con la entrega de A', { companyId: b.companyId }],
        ['empresa inexistente', { companyId: randomUUID() }],
        ['usuario de B', { createdBy: b.userId }],
        ['autor inexistente', { createdBy: randomUUID() }],
      ]
      for (const [what, cambio] of casos) {
        expect(await expectRejectedByDatabase(tx, () => rawInsertVoid(tx, { ...base, ...cambio }), what), what).toBe(
          FOREIGN_KEY_VIOLATION,
        )
      }
    })
  })

  it('R32: la clave de anulacion es unica por empresa; la misma clave en otra empresa se acepta', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const b = await createTenant(tx, 'B')
      const { deliveryId: deliveryA } = await insertDelivery(tx, a, [a.batchId])
      const { deliveryId: deliveryB } = await insertDelivery(tx, b, [b.batchId])
      const voidKey = randomUUID()
      await rawInsertVoid(tx, { companyId: a.companyId, deliveryId: deliveryA, createdBy: a.userId, voidKey })

      expect(
        await expectRejectedByDatabase(
          tx,
          () => rawInsertVoid(tx, { companyId: a.companyId, deliveryId: deliveryA, createdBy: a.userId, voidKey }),
          'misma clave en la misma empresa',
        ),
      ).toBe(UNIQUE_VIOLATION)

      await rawInsertVoid(tx, { companyId: b.companyId, deliveryId: deliveryB, createdBy: b.userId, voidKey })
    })
  })

  it('R32: el motivo vacio, solo con espacios o de mas de 500 caracteres es rechazado', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const { deliveryId } = await insertDelivery(tx, a, [a.batchId])

      for (const [reason, what] of [
        ['', 'motivo vacio'],
        ['    ', 'motivo de espacios'],
        ['x'.repeat(501), 'motivo de 501 caracteres'],
      ] as const) {
        expect(
          await expectRejectedByDatabase(
            tx,
            () => rawInsertVoid(tx, { companyId: a.companyId, deliveryId, createdBy: a.userId, reason }),
            what,
          ),
          what,
        ).toBe(CHECK_VIOLATION)
      }
    })
  })

  it('R32: una segunda linea de anulacion para la misma linea de entrega es rechazada, tambien desde otra anulacion', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const { deliveryId, lineId, voidId } = await voidedDelivery(tx, a)
      const otraAnulacion = await rawInsertVoid(tx, { companyId: a.companyId, deliveryId, createdBy: a.userId })

      expect(
        await expectRejectedByDatabase(
          tx,
          () => rawInsertVoidLine(tx, { companyId: a.companyId, voidId, deliveryId, deliveryLineId: lineId }),
          'la misma linea dos veces en la misma anulacion',
        ),
      ).toBe(UNIQUE_VIOLATION)
      expect(
        await expectRejectedByDatabase(
          tx,
          () =>
            rawInsertVoidLine(tx, { companyId: a.companyId, voidId: otraAnulacion, deliveryId, deliveryLineId: lineId }),
          'la misma linea en otra anulacion',
        ),
      ).toBe(UNIQUE_VIOLATION)
    })
  })

  it('R32: la linea de anulacion no puede apuntar a una linea de otra entrega', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const uno = await insertDelivery(tx, a, [a.batchId])
      const otra = await insertDelivery(tx, a, [a.otherBatchId])
      const voidId = await rawInsertVoid(tx, { companyId: a.companyId, deliveryId: uno.deliveryId, createdBy: a.userId })
      const lineaDeOtra = otra.lineIds[0] as string

      expect(
        await expectRejectedByDatabase(
          tx,
          () =>
            rawInsertVoidLine(tx, {
              companyId: a.companyId,
              voidId,
              deliveryId: uno.deliveryId,
              deliveryLineId: lineaDeOtra,
            }),
          'linea de otra entrega con la entrega de la anulacion',
        ),
      ).toBe(FOREIGN_KEY_VIOLATION)
      expect(
        await expectRejectedByDatabase(
          tx,
          () =>
            rawInsertVoidLine(tx, {
              companyId: a.companyId,
              voidId,
              deliveryId: otra.deliveryId,
              deliveryLineId: lineaDeOtra,
            }),
          'linea de otra entrega con la entrega de esa linea',
        ),
      ).toBe(FOREIGN_KEY_VIOLATION)
    })
  })

  it('R32: la linea de anulacion no puede declarar otra empresa que la de su anulacion', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const b = await createTenant(tx, 'B')
      const { deliveryId, lineIds } = await insertDelivery(tx, a, [a.batchId])
      const voidId = await rawInsertVoid(tx, { companyId: a.companyId, deliveryId, createdBy: a.userId })

      expect(
        await expectRejectedByDatabase(
          tx,
          () =>
            rawInsertVoidLine(tx, {
              companyId: b.companyId,
              voidId,
              deliveryId,
              deliveryLineId: lineIds[0] as string,
            }),
          'linea de anulacion con la empresa de B',
        ),
      ).toBe(FOREIGN_KEY_VIOLATION)
    })
  })
})

describe('el asiento delivery_void de inventory_movements contra Postgres real', () => {
  it('R24, R32: delivery_void exige su anulacion, su pedido, cantidad positiva y ningun motivo', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const { voidId } = await voidedDelivery(tx, a)
      const base: MovementRow = {
        companyId: a.companyId,
        batchId: a.batchId,
        kind: 'delivery_void',
        quantity: '2',
        orderId: a.orderId,
        orderDeliveryVoidId: voidId,
      }

      const casos: ReadonlyArray<readonly [string, Partial<MovementRow>]> = [
        ['delivery_void sin anulacion', { orderDeliveryVoidId: null }],
        ['delivery_void sin pedido', { orderId: null }],
        ['delivery_void con cantidad cero', { quantity: '0' }],
        ['delivery_void con cantidad negativa', { quantity: '-2' }],
        ['delivery_void con motivo', { reason: 'merma' }],
      ]
      for (const [what, cambio] of casos) {
        expect(await expectRejectedByDatabase(tx, () => rawInsertMovement(tx, { ...base, ...cambio }), what), what).toBe(
          CHECK_VIOLATION,
        )
      }
    })
  })

  it('R32: un asiento que no es delivery_void no puede llevar una anulacion', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const { deliveryId, voidId } = await voidedDelivery(tx, a)

      const casos: ReadonlyArray<readonly [string, MovementRow]> = [
        [
          'un ajuste con anulacion',
          {
            companyId: a.companyId,
            batchId: a.batchId,
            kind: 'adjustment',
            quantity: '-1',
            orderId: null,
            orderDeliveryVoidId: voidId,
            reason: 'merma',
          },
        ],
        [
          'una entrega con anulacion',
          {
            companyId: a.companyId,
            batchId: a.batchId,
            kind: 'delivery',
            quantity: '-2',
            orderId: a.orderId,
            orderDeliveryId: deliveryId,
            orderDeliveryVoidId: voidId,
          },
        ],
        [
          'una produccion con anulacion',
          {
            companyId: a.companyId,
            batchId: a.batchId,
            kind: 'production',
            quantity: '2',
            orderId: a.orderId,
            orderDeliveryVoidId: voidId,
          },
        ],
      ]
      for (const [what, row] of casos) {
        expect(await expectRejectedByDatabase(tx, () => rawInsertMovement(tx, row), what), what).toBe(CHECK_VIOLATION)
      }
    })
  })

  it('R24, R32: un solo asiento delivery_void por lote y anulacion; otro lote de la misma anulacion se acepta', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const { deliveryId, lineIds } = await insertDelivery(tx, a, [a.batchId, a.otherBatchId])
      const voidId = await rawInsertVoid(tx, { companyId: a.companyId, deliveryId, createdBy: a.userId })
      for (const deliveryLineId of lineIds) {
        await rawInsertVoidLine(tx, { companyId: a.companyId, voidId, deliveryId, deliveryLineId })
      }
      const base: MovementRow = {
        companyId: a.companyId,
        batchId: a.batchId,
        kind: 'delivery_void',
        quantity: '2',
        orderId: a.orderId,
        orderDeliveryVoidId: voidId,
      }
      await rawInsertMovement(tx, base)

      expect(
        await expectRejectedByDatabase(
          tx,
          () => rawInsertMovement(tx, { ...base, quantity: '1' }),
          'segundo asiento del mismo lote en la misma anulacion',
        ),
      ).toBe(UNIQUE_VIOLATION)

      await rawInsertMovement(tx, { ...base, batchId: a.otherBatchId })
      expect(await tx.inventoryMovement.count({ where: { orderDeliveryVoidId: voidId } })).toBe(2)
    })
  })

  it('R32: el asiento no puede apuntar a la anulacion de otra empresa ni a un lote de otra empresa', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const b = await createTenant(tx, 'B')
      const { voidId: voidA } = await voidedDelivery(tx, a)
      const { voidId: voidB } = await voidedDelivery(tx, b)

      expect(
        await expectRejectedByDatabase(
          tx,
          () =>
            rawInsertMovement(tx, {
              companyId: a.companyId,
              batchId: a.batchId,
              kind: 'delivery_void',
              quantity: '2',
              orderId: a.orderId,
              orderDeliveryVoidId: voidB,
            }),
          'asiento de A con la anulacion de B',
        ),
      ).toBe(FOREIGN_KEY_VIOLATION)
      expect(
        await expectRejectedByDatabase(
          tx,
          () =>
            rawInsertMovement(tx, {
              companyId: a.companyId,
              batchId: b.batchId,
              kind: 'delivery_void',
              quantity: '2',
              orderId: a.orderId,
              orderDeliveryVoidId: voidA,
            }),
          'asiento de A sobre el lote de B',
        ),
      ).toBe(CHECK_VIOLATION)
    })
  })

  it('R32: las dos tablas nuevas tienen RLS activada y forzada', async () => {
    const filas = await prisma.$queryRaw<Array<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>>`
      SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
      WHERE relname IN ('order_delivery_voids', 'order_delivery_void_lines') AND relkind = 'r'
      ORDER BY relname`
    expect(filas).toEqual([
      { relname: 'order_delivery_void_lines', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'order_delivery_voids', relrowsecurity: true, relforcerowsecurity: true },
    ])
  })
})
