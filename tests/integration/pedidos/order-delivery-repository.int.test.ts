/**
 * `createOrderDeliveryRepository` contra Postgres REAL: el alta de la entrega y su clave, la suma
 * de envases entregados por linea con el ambito de empresa, y las lineas atadas a la empresa por
 * las claves foraneas compuestas.
 *
 * AISLAMIENTO: cada `it` corre dentro de `prisma.$transaction` interactiva y termina lanzando
 * `RollbackSignal`. Lo que se espera que falle (la clave repetida, la FK de otra empresa) va en su
 * propio `SAVEPOINT`, porque el error aborta la transaccion.
 */
import { randomUUID } from 'node:crypto'

import { Prisma } from '@prisma/client'
import { afterAll, describe, expect, it } from 'vitest'

import { normalizeCompanyName } from '@/lib/modules/identity'
import { createOrderDeliveryRepository } from '@/lib/modules/pedidos/adapters/driven/persistence/order-delivery-prisma'
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

let savepointSeq = 0

async function inSavepoint<T>(tx: Prisma.TransactionClient, run: () => Promise<T>): Promise<T> {
  savepointSeq += 1
  const savepoint = `delivery_repo_sp_${String(savepointSeq)}`
  await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`)
  try {
    return await run()
  } finally {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`)
  }
}

async function errorOf(tx: Prisma.TransactionClient, run: () => Promise<unknown>): Promise<unknown> {
  return inSavepoint(tx, () =>
    run().then(
      () => null,
      (error: unknown) => error,
    ),
  )
}

function token(): string {
  return randomUUID().replace(/-/gu, '')
}

function asUuid(id: string): Prisma.Sql {
  return Prisma.sql`CAST(${id} AS uuid)`
}

const AHORA = new Date('2026-10-08T10:00:00.000Z')

// --- Fixtures -------------------------------------------------------------------------------

type Tenant = {
  readonly companyId: string
  readonly userId: string
  readonly customerId: string
  readonly orderId: string
  readonly lineIds: readonly [string, string]
  readonly batchId: string
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
  const presentationIds: string[] = []
  for (const sufijo of ['a', 'b']) {
    const { id } = await tx.presentation.create({
      data: { name: `Presentacion ${sufijo} ${marca}`, nameNormalized: `presentacion${sufijo}${marca}`, unitId, companyId },
      select: { id: true },
    })
    presentationIds.push(id)
  }
  const lineIds: string[] = []
  for (const presentationId of presentationIds) {
    const { id } = await tx.orderPresentationLine.create({
      data: { orderId, companyId, presentationId, packages: 10 },
      select: { id: true },
    })
    lineIds.push(id)
  }
  const { id: productId } = await tx.product.create({
    data: { name: `Producto ${marca}`, nameNormalized: `producto${marca}`, companyId, unitId },
    select: { id: true },
  })
  const { id: batchId } = await tx.productBatch.create({
    data: {
      productId,
      presentationId: presentationIds[0],
      stock: 10,
      unitCost: new Prisma.Decimal('1.0000'),
      lot: `L-${randomUUID()}`,
      purchaseDate: new Date('2026-09-01T00:00:00Z'),
      companyId,
    },
    select: { id: true },
  })

  return { companyId, userId, customerId, orderId, lineIds: [lineIds[0] as string, lineIds[1] as string], batchId }
}

async function newBatch(tx: Prisma.TransactionClient, t: Tenant): Promise<string> {
  const base = await tx.productBatch.findUniqueOrThrow({
    where: { id: t.batchId },
    select: { productId: true, presentationId: true },
  })
  const { id } = await tx.productBatch.create({
    data: {
      productId: base.productId,
      presentationId: base.presentationId,
      stock: 10,
      unitCost: new Prisma.Decimal('1.0000'),
      lot: `L-${randomUUID()}`,
      purchaseDate: new Date('2026-09-02T00:00:00Z'),
      companyId: t.companyId,
    },
    select: { id: true },
  })
  return id
}

function newDelivery(t: Tenant, deliveryKey: string = randomUUID()) {
  return { deliveryKey, orderId: t.orderId, customerId: t.customerId, actorId: t.userId, now: AHORA }
}

async function createdId(
  repo: ReturnType<typeof createOrderDeliveryRepository>,
  t: Tenant,
  deliveryKey?: string,
): Promise<string> {
  const outcome = await repo.create(newDelivery(t, deliveryKey), { companyId: t.companyId })
  if (outcome.kind !== 'created') throw new Error('se esperaba una entrega creada')
  return outcome.id
}

function prismaCode(error: unknown): string | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return null
  return error.code
}

afterAll(async () => {
  await prisma.$disconnect()
})

// --- Casos ----------------------------------------------------------------------------------

describe('OrderDeliveryRepository contra Postgres real', () => {
  it('R25: create guarda la entrega con su empresa, pedido, cliente, clave, autor e instante', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const repo = createOrderDeliveryRepository(tx)
      const key = randomUUID()

      const outcome = await repo.create(newDelivery(a, key), { companyId: a.companyId })

      expect(outcome.kind).toBe('created')
      const id = outcome.kind === 'created' ? outcome.id : ''
      const fila = await tx.orderDelivery.findUniqueOrThrow({ where: { id } })
      expect(fila).toMatchObject({
        companyId: a.companyId,
        orderId: a.orderId,
        customerId: a.customerId,
        deliveryKey: key,
        createdBy: a.userId,
        createdAt: AHORA,
      })
    })
  })

  it('R29: la misma clave en la misma empresa da duplicate_key y no deja una segunda fila', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const repo = createOrderDeliveryRepository(tx)
      const key = randomUUID()
      await createdId(repo, a, key)

      const segunda = await inSavepoint(tx, () => repo.create(newDelivery(a, key), { companyId: a.companyId }))

      expect(segunda).toEqual({ kind: 'duplicate_key' })
      expect(await tx.orderDelivery.count({ where: { companyId: a.companyId, deliveryKey: key } })).toBe(1)
    })
  })

  it('R29: la clave es unica por empresa: otra empresa puede usar la misma', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const b = await createTenant(tx, 'B')
      const repo = createOrderDeliveryRepository(tx)
      const key = randomUUID()
      await createdId(repo, a, key)

      const enB = await repo.create(newDelivery(b, key), { companyId: b.companyId })
      expect(enB.kind).toBe('created')
    })
  })

  it('R29: findByKey devuelve la entrega de la empresa con su pedido, y no ve la clave de otra empresa', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const b = await createTenant(tx, 'B')
      const repo = createOrderDeliveryRepository(tx)
      const key = randomUUID()
      const id = await createdId(repo, a, key)

      expect(await repo.findByKey(key, { companyId: a.companyId })).toEqual({ id, orderId: a.orderId })
      expect(await repo.findByKey(key, { companyId: b.companyId })).toBeNull()
      expect(await repo.findByKey(randomUUID(), { companyId: a.companyId })).toBeNull()
    })
  })

  it('R31: create con el ambito de otra empresa no puede apuntar al pedido de A', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const b = await createTenant(tx, 'B')
      const repo = createOrderDeliveryRepository(tx)

      const error = await errorOf(tx, () =>
        repo.create({ ...newDelivery(a), customerId: b.customerId, actorId: b.userId }, { companyId: b.companyId }),
      )
      expect(prismaCode(error)).toBe('P2003')
    })
  })

  it('R25: addLines guarda linea del reparto, lote, envases y cantidad con la empresa del ambito', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const repo = createOrderDeliveryRepository(tx)
      const deliveryId = await createdId(repo, a)
      const otroLote = await newBatch(tx, a)

      await repo.addLines(
        deliveryId,
        [
          { presentationLineId: a.lineIds[0], batchId: a.batchId, packages: 2, quantity: '2.5000' },
          { presentationLineId: a.lineIds[0], batchId: otroLote, packages: 1, quantity: '1.2500' },
        ],
        { companyId: a.companyId },
      )

      const filas = await tx.orderDeliveryLine.findMany({ where: { deliveryId }, orderBy: { packages: 'desc' } })
      expect(
        filas.map((f) => [f.companyId, f.orderPresentationLineId, f.batchId, f.packages, f.quantity.toFixed(4)]),
      ).toEqual([
        [a.companyId, a.lineIds[0], a.batchId, 2, '2.5000'],
        [a.companyId, a.lineIds[0], otroLote, 1, '1.2500'],
      ])
    })
  })

  it('R31: addLines rechaza por FK el lote de otra empresa y no escribe ninguna linea', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const b = await createTenant(tx, 'B')
      const repo = createOrderDeliveryRepository(tx)
      const deliveryId = await createdId(repo, a)

      const error = await errorOf(tx, () =>
        repo.addLines(
          deliveryId,
          [
            { presentationLineId: a.lineIds[0], batchId: a.batchId, packages: 1, quantity: '1.0000' },
            { presentationLineId: a.lineIds[1], batchId: b.batchId, packages: 1, quantity: '1.0000' },
          ],
          { companyId: a.companyId },
        ),
      )

      expect(prismaCode(error)).toBe('P2003')
      expect(await tx.orderDeliveryLine.count({ where: { deliveryId } })).toBe(0)
    })
  })

  it('R31: addLines con el ambito de B no puede colgar lineas de una entrega de A', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const b = await createTenant(tx, 'B')
      const repo = createOrderDeliveryRepository(tx)
      const deliveryId = await createdId(repo, a)

      const error = await errorOf(tx, () =>
        repo.addLines(
          deliveryId,
          [{ presentationLineId: b.lineIds[0], batchId: b.batchId, packages: 1, quantity: '1.0000' }],
          { companyId: b.companyId },
        ),
      )
      expect(prismaCode(error)).toBe('P2003')
    })
  })

  it('R6: sumDeliveredPackages suma los envases por linea entre varias entregas, y una linea sin entregas no aparece', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const repo = createOrderDeliveryRepository(tx)
      const scope = { companyId: a.companyId }
      const otroLote = await newBatch(tx, a)

      const primera = await createdId(repo, a)
      await repo.addLines(
        primera,
        [
          { presentationLineId: a.lineIds[0], batchId: a.batchId, packages: 2, quantity: '2.0000' },
          { presentationLineId: a.lineIds[0], batchId: otroLote, packages: 3, quantity: '3.0000' },
        ],
        scope,
      )
      const segunda = await createdId(repo, a)
      await repo.addLines(
        segunda,
        [{ presentationLineId: a.lineIds[0], batchId: a.batchId, packages: 1, quantity: '1.0000' }],
        scope,
      )

      const suma = await repo.sumDeliveredPackages(a.orderId, scope)
      expect([...suma]).toEqual([[a.lineIds[0], 6]])
      expect(suma.has(a.lineIds[1])).toBe(false)
    })
  })

  it('R5: sumDeliveredPackages no ve las entregas de la empresa B, ni con el ambito de B sobre el pedido de A', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const b = await createTenant(tx, 'B')
      const repo = createOrderDeliveryRepository(tx)

      const deA = await createdId(repo, a)
      await repo.addLines(
        deA,
        [{ presentationLineId: a.lineIds[0], batchId: a.batchId, packages: 4, quantity: '4.0000' }],
        { companyId: a.companyId },
      )
      const deB = await createdId(repo, b)
      await repo.addLines(
        deB,
        [{ presentationLineId: b.lineIds[0], batchId: b.batchId, packages: 7, quantity: '7.0000' }],
        { companyId: b.companyId },
      )

      expect([...(await repo.sumDeliveredPackages(a.orderId, { companyId: a.companyId }))]).toEqual([[a.lineIds[0], 4]])
      expect([...(await repo.sumDeliveredPackages(a.orderId, { companyId: b.companyId }))]).toEqual([])
      expect([...(await repo.sumDeliveredPackages(b.orderId, { companyId: a.companyId }))]).toEqual([])
    })
  })

  // Nota 2026-10-09: caso añadido por la anulacion de entregas; los anteriores no cambian.
  it('R26: sumDeliveredPackages no suma las lineas anuladas, y una linea con todo anulado no aparece', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const repo = createOrderDeliveryRepository(tx)
      const scope = { companyId: a.companyId }
      const otroLote = await newBatch(tx, a)

      const deliveryId = await createdId(repo, a)
      await repo.addLines(
        deliveryId,
        [
          { presentationLineId: a.lineIds[0], batchId: a.batchId, packages: 2, quantity: '2.0000' },
          { presentationLineId: a.lineIds[1], batchId: otroLote, packages: 3, quantity: '3.0000' },
        ],
        scope,
      )
      const segunda = await createdId(repo, a)
      await repo.addLines(
        segunda,
        [{ presentationLineId: a.lineIds[0], batchId: a.batchId, packages: 4, quantity: '4.0000' }],
        scope,
      )
      expect(new Map(await repo.sumDeliveredPackages(a.orderId, scope))).toEqual(
        new Map([
          [a.lineIds[0], 6],
          [a.lineIds[1], 3],
        ]),
      )

      const anuladas = await tx.orderDeliveryLine.findMany({
        where: { deliveryId, orderPresentationLineId: a.lineIds[1] },
        select: { id: true },
      })
      const { id: voidId } = await tx.orderDeliveryVoid.create({
        data: {
          companyId: a.companyId,
          deliveryId,
          voidKey: randomUUID(),
          reason: 'Devuelto por el cliente',
          createdBy: a.userId,
          createdAt: AHORA,
        },
        select: { id: true },
      })
      await tx.orderDeliveryVoidLine.createMany({
        data: anuladas.map((l) => ({ companyId: a.companyId, voidId, deliveryId, deliveryLineId: l.id })),
      })

      const suma = await repo.sumDeliveredPackages(a.orderId, scope)
      expect([...suma]).toEqual([[a.lineIds[0], 6]])
      expect(suma.has(a.lineIds[1])).toBe(false)
    })
  })
})
