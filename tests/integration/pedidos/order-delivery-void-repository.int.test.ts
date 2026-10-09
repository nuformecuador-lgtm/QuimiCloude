/**
 * `createOrderDeliveryVoidRepository` y `createOrderDeliveryHistoryReader` contra Postgres REAL: el
 * alta de la anulacion y su clave, sus lineas y el unico que impide anular dos veces una linea, la
 * lectura de la entrega y sus lineas con el ambito de empresa, y la lista de entregas del pedido.
 *
 * AISLAMIENTO: cada `it` corre dentro de `prisma.$transaction` interactiva y termina lanzando
 * `RollbackSignal`. Lo que se espera que falle (la clave repetida, la linea ya anulada, la FK de otra
 * empresa) va en su propio `SAVEPOINT`, porque el error aborta la transaccion.
 */
import { randomUUID } from 'node:crypto'

import { Prisma } from '@prisma/client'
import { afterAll, describe, expect, it } from 'vitest'

import { normalizeCompanyName } from '@/lib/modules/identity'
import { createOrderDeliveryRepository } from '@/lib/modules/pedidos/adapters/driven/persistence/order-delivery-prisma'
import {
  createOrderDeliveryHistoryReader,
  createOrderDeliveryVoidRepository,
} from '@/lib/modules/pedidos/adapters/driven/persistence/order-delivery-void-prisma'
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
  const savepoint = `delivery_void_repo_sp_${String(savepointSeq)}`
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

function prismaCode(error: unknown): string | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return null
  return error.code
}

const ENTREGA_1 = new Date('2026-10-08T10:00:00.000Z')
const ENTREGA_2 = new Date('2026-10-08T12:00:00.000Z')
const ANULACION = new Date('2026-10-09T09:30:00.000Z')

// --- Fixtures -------------------------------------------------------------------------------

type Tenant = {
  readonly companyId: string
  readonly userId: string
  readonly customerId: string
  readonly orderId: string
  readonly lineIds: readonly [string, string]
  readonly batchIds: readonly [string, string]
}

let nextSequence = 930_000
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
  const batchIds: string[] = []
  for (const dia of ['01', '02']) {
    const { id } = await tx.productBatch.create({
      data: {
        productId,
        presentationId: presentationIds[0],
        stock: 10,
        unitCost: new Prisma.Decimal('1.0000'),
        lot: `L-${randomUUID()}`,
        purchaseDate: new Date(`2026-09-${dia}T00:00:00Z`),
        companyId,
      },
      select: { id: true },
    })
    batchIds.push(id)
  }

  return {
    companyId,
    userId,
    customerId,
    orderId,
    lineIds: [lineIds[0] as string, lineIds[1] as string],
    batchIds: [batchIds[0] as string, batchIds[1] as string],
  }
}

type SeededDelivery = {
  readonly deliveryId: string
  /** [presentacion 0 lote 0, presentacion 0 lote 1, presentacion 1 lote 0] */
  readonly lineIds: readonly [string, string, string]
}

/** Una entrega de A con tres lineas: la presentacion 0 en sus dos lotes y la 1 en el primero. */
async function seedDelivery(tx: Prisma.TransactionClient, t: Tenant, now: Date = ENTREGA_1): Promise<SeededDelivery> {
  const deliveries = createOrderDeliveryRepository(tx)
  const scope = { companyId: t.companyId }
  const outcome = await deliveries.create(
    { deliveryKey: randomUUID(), orderId: t.orderId, customerId: t.customerId, actorId: t.userId, now },
    scope,
  )
  if (outcome.kind !== 'created') throw new Error('se esperaba una entrega creada')
  const deliveryId = outcome.id
  await deliveries.addLines(
    deliveryId,
    [
      { presentationLineId: t.lineIds[0], batchId: t.batchIds[0], packages: 2, quantity: '2.5000' },
      { presentationLineId: t.lineIds[0], batchId: t.batchIds[1], packages: 1, quantity: '1.2500' },
    ],
    scope,
  )
  // Un lote sale una sola vez por entrega (unico entrega-lote): la presentacion 1 lleva uno propio.
  const base = await tx.productBatch.findUniqueOrThrow({
    where: { id: t.batchIds[0] },
    select: { productId: true, presentationId: true },
  })
  const { id: loteB } = await tx.productBatch.create({
    data: {
      productId: base.productId,
      presentationId: base.presentationId,
      stock: 10,
      unitCost: new Prisma.Decimal('1.0000'),
      lot: `L-${randomUUID()}`,
      purchaseDate: new Date('2026-09-03T00:00:00Z'),
      companyId: t.companyId,
    },
    select: { id: true },
  })
  await deliveries.addLines(
    deliveryId,
    [{ presentationLineId: t.lineIds[1], batchId: loteB, packages: 3, quantity: '3.0000' }],
    scope,
  )
  const lineas = await tx.orderDeliveryLine.findMany({
    where: { deliveryId },
    select: { id: true, orderPresentationLineId: true, batchId: true },
  })
  const idDe = (presentationLineId: string, batchId: string): string => {
    const linea = lineas.find((l) => l.orderPresentationLineId === presentationLineId && l.batchId === batchId)
    if (linea === undefined) throw new Error('linea de entrega no sembrada')
    return linea.id
  }
  return {
    deliveryId,
    lineIds: [idDe(t.lineIds[0], t.batchIds[0]), idDe(t.lineIds[0], t.batchIds[1]), idDe(t.lineIds[1], loteB)],
  }
}

function newVoid(t: Tenant, deliveryId: string, voidKey: string = randomUUID()) {
  return { voidKey, deliveryId, reason: 'Cliente devolvio la mercancia', actorId: t.userId, now: ANULACION }
}

async function createdVoidId(
  repo: ReturnType<typeof createOrderDeliveryVoidRepository>,
  t: Tenant,
  deliveryId: string,
  voidKey?: string,
): Promise<string> {
  const outcome = await repo.create(newVoid(t, deliveryId, voidKey), { companyId: t.companyId })
  if (outcome.kind !== 'created') throw new Error('se esperaba una anulacion creada')
  return outcome.id
}

afterAll(async () => {
  await prisma.$disconnect()
})

// --- Casos ----------------------------------------------------------------------------------

describe('OrderDeliveryVoidRepository contra Postgres real', () => {
  it('R22: create guarda la anulacion con su empresa, entrega, clave, motivo, autor e instante', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const { deliveryId } = await seedDelivery(tx, a)
      const repo = createOrderDeliveryVoidRepository(tx)
      const key = randomUUID()

      const outcome = await repo.create(newVoid(a, deliveryId, key), { companyId: a.companyId })

      expect(outcome.kind).toBe('created')
      const id = outcome.kind === 'created' ? outcome.id : ''
      expect(await tx.orderDeliveryVoid.findUniqueOrThrow({ where: { id } })).toMatchObject({
        companyId: a.companyId,
        deliveryId,
        voidKey: key,
        reason: 'Cliente devolvio la mercancia',
        createdBy: a.userId,
        createdAt: ANULACION,
      })
    })
  })

  it('R28: la misma clave en la misma empresa da duplicate_key y no deja una segunda fila', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const { deliveryId } = await seedDelivery(tx, a)
      const repo = createOrderDeliveryVoidRepository(tx)
      const key = randomUUID()
      await createdVoidId(repo, a, deliveryId, key)

      const segunda = await inSavepoint(tx, () => repo.create(newVoid(a, deliveryId, key), { companyId: a.companyId }))

      expect(segunda).toEqual({ kind: 'duplicate_key' })
      expect(await tx.orderDeliveryVoid.count({ where: { companyId: a.companyId, voidKey: key } })).toBe(1)
    })
  })

  it('R28: la clave es unica por empresa: otra empresa puede usar la misma', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const b = await createTenant(tx, 'B')
      const deA = await seedDelivery(tx, a)
      const deB = await seedDelivery(tx, b)
      const repo = createOrderDeliveryVoidRepository(tx)
      const key = randomUUID()
      await createdVoidId(repo, a, deA.deliveryId, key)

      const enB = await repo.create(newVoid(b, deB.deliveryId, key), { companyId: b.companyId })
      expect(enB.kind).toBe('created')
    })
  })

  it('R28: findByKey devuelve la anulacion de la empresa con el pedido de su entrega, y no ve la de otra empresa', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const b = await createTenant(tx, 'B')
      const { deliveryId } = await seedDelivery(tx, a)
      const repo = createOrderDeliveryVoidRepository(tx)
      const key = randomUUID()
      const id = await createdVoidId(repo, a, deliveryId, key)

      expect(await repo.findByKey(key, { companyId: a.companyId })).toEqual({ id, orderId: a.orderId })
      expect(await repo.findByKey(key, { companyId: b.companyId })).toBeNull()
      expect(await repo.findByKey(randomUUID(), { companyId: a.companyId })).toBeNull()
    })
  })

  it('R18: create con el ambito de B no puede apuntar a la entrega de A', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const b = await createTenant(tx, 'B')
      const { deliveryId } = await seedDelivery(tx, a)
      const repo = createOrderDeliveryVoidRepository(tx)

      const error = await errorOf(tx, () => repo.create(newVoid(b, deliveryId), { companyId: b.companyId }))

      expect(prismaCode(error)).toBe('P2003')
      expect(await tx.orderDeliveryVoid.count({ where: { deliveryId } })).toBe(0)
    })
  })

  it('R18: findDelivery devuelve la entrega de la empresa con su pedido; la de otra empresa y la que no existe salen null', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const b = await createTenant(tx, 'B')
      const { deliveryId } = await seedDelivery(tx, a)
      const repo = createOrderDeliveryVoidRepository(tx)

      expect(await repo.findDelivery(deliveryId, { companyId: a.companyId })).toEqual({
        id: deliveryId,
        orderId: a.orderId,
      })
      expect(await repo.findDelivery(deliveryId, { companyId: b.companyId })).toBeNull()
      expect(await repo.findDelivery(randomUUID(), { companyId: a.companyId })).toBeNull()
    })
  })

  it('R21, R22: findDeliveryLines trae todas las lineas con su cantidad y su marca de anulada; con el ambito de B, ninguna', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const b = await createTenant(tx, 'B')
      const seeded = await seedDelivery(tx, a)
      const repo = createOrderDeliveryVoidRepository(tx)
      const scope = { companyId: a.companyId }

      const antes = await repo.findDeliveryLines(seeded.deliveryId, scope)
      expect(antes).toHaveLength(3)
      expect(antes.every((l) => !l.voided)).toBe(true)
      const voidId = await createdVoidId(repo, a, seeded.deliveryId)
      await repo.addLines(voidId, seeded.deliveryId, [seeded.lineIds[0], seeded.lineIds[1]], scope)

      const despues = await repo.findDeliveryLines(seeded.deliveryId, scope)
      const porId = new Map(despues.map((l) => [l.id, l]))
      expect(porId.get(seeded.lineIds[0])).toEqual({
        id: seeded.lineIds[0],
        presentationLineId: a.lineIds[0],
        batchId: a.batchIds[0],
        packages: 2,
        quantity: '2.5000',
        voided: true,
      })
      expect(porId.get(seeded.lineIds[1])).toMatchObject({ quantity: '1.2500', voided: true })
      expect(porId.get(seeded.lineIds[2])).toMatchObject({
        presentationLineId: a.lineIds[1],
        packages: 3,
        quantity: '3.0000',
        voided: false,
      })
      expect(await repo.findDeliveryLines(seeded.deliveryId, { companyId: b.companyId })).toEqual([])
    })
  })

  it('R22: addLines guarda una linea por linea de entrega, con la anulacion, la entrega y la empresa del ambito', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const seeded = await seedDelivery(tx, a)
      const repo = createOrderDeliveryVoidRepository(tx)
      const scope = { companyId: a.companyId }
      const voidId = await createdVoidId(repo, a, seeded.deliveryId)

      const resultado = await repo.addLines(voidId, seeded.deliveryId, [seeded.lineIds[0], seeded.lineIds[1]], scope)

      expect(resultado).toBe('ok')
      const filas = await tx.orderDeliveryVoidLine.findMany({ where: { voidId } })
      expect(filas.map((f) => [f.companyId, f.deliveryId, f.deliveryLineId]).sort()).toEqual(
        [
          [a.companyId, seeded.deliveryId, seeded.lineIds[0]],
          [a.companyId, seeded.deliveryId, seeded.lineIds[1]],
        ].sort(),
      )
    })
  })

  it('R21, R30: addLines sobre una linea ya anulada responde already_voided y no escribe ninguna de las pedidas', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const seeded = await seedDelivery(tx, a)
      const repo = createOrderDeliveryVoidRepository(tx)
      const scope = { companyId: a.companyId }
      const primera = await createdVoidId(repo, a, seeded.deliveryId)
      await repo.addLines(primera, seeded.deliveryId, [seeded.lineIds[0]], scope)
      const segunda = await createdVoidId(repo, a, seeded.deliveryId)

      const resultado = await inSavepoint(tx, () =>
        repo.addLines(segunda, seeded.deliveryId, [seeded.lineIds[2], seeded.lineIds[0]], scope),
      )

      expect(resultado).toBe('already_voided')
      expect(await tx.orderDeliveryVoidLine.count({ where: { voidId: segunda } })).toBe(0)
      expect(await tx.orderDeliveryVoidLine.count({ where: { deliveryId: seeded.deliveryId } })).toBe(1)
    })
  })

  it('R18: addLines con el ambito de B no puede colgar lineas de la anulacion de A', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const b = await createTenant(tx, 'B')
      const seeded = await seedDelivery(tx, a)
      const repo = createOrderDeliveryVoidRepository(tx)
      const voidId = await createdVoidId(repo, a, seeded.deliveryId)

      const error = await errorOf(tx, () =>
        repo.addLines(voidId, seeded.deliveryId, [seeded.lineIds[0]], { companyId: b.companyId }),
      )

      expect(prismaCode(error)).toBe('P2003')
      expect(await tx.orderDeliveryVoidLine.count({ where: { voidId } })).toBe(0)
    })
  })
})

describe('OrderDeliveryHistoryReader contra Postgres real', () => {
  it('R7, R9: listByOrder ordena de la mas reciente a la mas antigua y trae la anulacion de cada linea', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const vieja = await seedDelivery(tx, a, ENTREGA_1)
      const nueva = await seedDelivery(tx, a, ENTREGA_2)
      const repo = createOrderDeliveryVoidRepository(tx)
      const scope = { companyId: a.companyId }
      const voidId = await createdVoidId(repo, a, vieja.deliveryId)
      await repo.addLines(voidId, vieja.deliveryId, [vieja.lineIds[0], vieja.lineIds[1]], scope)

      const filas = await createOrderDeliveryHistoryReader(tx).listByOrder(a.orderId, scope)

      expect(filas.map((f) => f.id)).toEqual([nueva.deliveryId, vieja.deliveryId])
      expect(filas[1]).toMatchObject({ customerId: a.customerId, createdBy: a.userId, createdAt: ENTREGA_1 })
      const lineasVieja = filas[1]?.lines ?? []
      expect(lineasVieja).toHaveLength(3)
      const anulacion = { reason: 'Cliente devolvio la mercancia', createdBy: a.userId, createdAt: ANULACION }
      expect(lineasVieja.filter((l) => l.presentationLineId === a.lineIds[0])).toEqual(
        expect.arrayContaining([
          { presentationLineId: a.lineIds[0], batchId: a.batchIds[0], packages: 2, void: anulacion },
          { presentationLineId: a.lineIds[0], batchId: a.batchIds[1], packages: 1, void: anulacion },
        ]),
      )
      expect(lineasVieja.find((l) => l.presentationLineId === a.lineIds[1])?.void).toBeNull()
      expect(filas[0]?.lines.every((l) => l.void === null)).toBe(true)
    })
  })

  it('R7: dos entregas en el mismo instante salen ordenadas por id', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const una = await seedDelivery(tx, a, ENTREGA_1)
      const otra = await seedDelivery(tx, a, ENTREGA_1)

      const filas = await createOrderDeliveryHistoryReader(tx).listByOrder(a.orderId, { companyId: a.companyId })

      expect(filas.map((f) => f.id)).toEqual([una.deliveryId, otra.deliveryId].sort())
    })
  })

  it('R6, R8: listByOrder solo ve las entregas del pedido y la empresa; con el ambito de B, ninguna', async () => {
    await inRolledBackTransaction(async (tx) => {
      const a = await createTenant(tx, 'A')
      const b = await createTenant(tx, 'B')
      const deA = await seedDelivery(tx, a)
      await seedDelivery(tx, b)
      const reader = createOrderDeliveryHistoryReader(tx)

      expect((await reader.listByOrder(a.orderId, { companyId: a.companyId })).map((f) => f.id)).toEqual([
        deA.deliveryId,
      ])
      expect(await reader.listByOrder(a.orderId, { companyId: b.companyId })).toEqual([])
      expect(await reader.listByOrder(randomUUID(), { companyId: a.companyId })).toEqual([])
    })
  })
})
