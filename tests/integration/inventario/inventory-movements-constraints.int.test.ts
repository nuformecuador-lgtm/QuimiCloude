/**
 * Contra Postgres real, con la migracion `20260917130000_inventory_movements` aplicada.
 *
 * AISLAMIENTO -- cada caso corre dentro de `prisma.$transaction` interactiva y termina
 * lanzando `RollbackSignal`, asi que ninguna fila escrita sobrevive. Un error de constraint
 * aborta la transaccion entera, asi que cada intento que se espera que falle va dentro de
 * su propio SAVEPOINT (mismo patron que `unidades-constraints.int.test.ts`).
 */
import { randomUUID } from 'node:crypto'

import { Prisma } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

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
      { maxWait: 10_000, timeout: 30_000 },
    )
  } catch (error) {
    if (!(error instanceof RollbackSignal)) throw error
  }
}

let savepointSeq = 0

const CHECK_VIOLATION = '23514'

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

interface Rejection {
  readonly sqlState: string
  readonly message: string
}

/**
 * Va dentro de un SAVEPOINT porque un error de constraint aborta la transaccion entera, y los
 * casos necesitan seguir consultando despues del rechazo. Devuelve el SQLSTATE y el mensaje:
 * el mensaje hace falta para reconocer el disparador por su identificador.
 */
async function expectRejectedByDatabase(
  tx: Prisma.TransactionClient,
  run: () => Promise<unknown>,
  what: string,
): Promise<Rejection> {
  savepointSeq += 1
  const savepoint = `sp_${String(savepointSeq)}`
  await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`)
  try {
    await run()
  } catch (error) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`)
    return {
      sqlState: sqlStateOf(error),
      message: error instanceof Error ? error.message : String(error),
    }
  }
  await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`)
  throw new Error(`se esperaba que la base rechazara la operacion, pero la acepto: ${what}`)
}

function token(): string {
  return randomUUID().replace(/-/gu, '')
}

async function createCompany(tx: Prisma.TransactionClient, marker: string): Promise<string> {
  const company = await tx.company.create({
    data: { name: `Empresa ${marker}`, nameNormalized: `empresa${marker}` },
    select: { id: true },
  })
  return company.id
}

async function createUnit(tx: Prisma.TransactionClient, marker: string): Promise<string> {
  const unit = await tx.unit.create({
    data: { name: `Unidad ${marker}`, nameNormalized: `unidad${marker}`, symbol: `u${marker.slice(0, 8)}` },
    select: { id: true },
  })
  return unit.id
}

async function createProduct(
  tx: Prisma.TransactionClient,
  marker: string,
  companyId: string,
): Promise<string> {
  const product = await tx.product.create({
    data: { name: `Producto ${marker}`, nameNormalized: `producto${marker}`, companyId },
    select: { id: true },
  })
  return product.id
}

async function createPresentation(
  tx: Prisma.TransactionClient,
  marker: string,
  unitId: string,
  companyId: string,
): Promise<string> {
  const presentation = await tx.presentation.create({
    data: { name: `Presentacion ${marker}`, nameNormalized: `presentacion${marker}`, unitId, companyId },
    select: { id: true },
  })
  return presentation.id
}

/** Un lote completo de una sola empresa: producto, presentacion (con su propia unidad) y lote. */
async function createBatch(
  tx: Prisma.TransactionClient,
  marker: string,
  companyId: string,
  stock = 10,
): Promise<string> {
  const unitId = await createUnit(tx, marker)
  const productId = await createProduct(tx, marker, companyId)
  const presentationId = await createPresentation(tx, marker, unitId, companyId)
  const batch = await tx.productBatch.create({
    data: {
      productId,
      presentationId,
      stock,
      unitCost: new Prisma.Decimal('1.0000'),
      lot: `L-${randomUUID()}`,
      purchaseDate: new Date('2026-09-01T00:00:00Z'),
      companyId,
    },
    select: { id: true },
  })
  return batch.id
}

/**
 * `INSERT INTO inventory_movements` crudo: la API tipada traduciria el SQLSTATE a su propio
 * codigo (`P2010`/`P2002`, sin `meta.code`), asi que los casos que esperan un CHECK o un
 * disparador rechazados van por aqui para poder afirmar sobre el SQLSTATE real.
 */
async function rawInsertMovement(
  tx: Prisma.TransactionClient,
  columns: { batchId: string; kind: string; quantity: number; reason: string | null; companyId: string },
): Promise<number> {
  return tx.$executeRaw`
    INSERT INTO "inventory_movements" ("batch_id", "kind", "quantity", "reason", "company_id")
    VALUES (
      CAST(${columns.batchId} AS uuid), ${columns.kind}, ${columns.quantity}, ${columns.reason},
      CAST(${columns.companyId} AS uuid)
    )`
}

beforeAll(async () => {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'inventory_movements'`
  if (tables.length !== 1) {
    throw new Error(
      'la base de pruebas no tiene aplicada la migracion de QC-92 (tabla `inventory_movements`). ' +
        'Corre `pnpm run db:migrate` antes de estos tests.',
    )
  }
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('inventory_movements — restricciones', () => {
  it('rechaza quantity = 0 con SQLSTATE 23514 (R3)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const companyId = await createCompany(tx, marker)
      const batchId = await createBatch(tx, marker, companyId)

      const rejection = await expectRejectedByDatabase(
        tx,
        () => rawInsertMovement(tx, { batchId, kind: 'adjustment', quantity: 0, reason: 'merma', companyId }),
        'asiento con cantidad cero',
      )
      expect(rejection.sqlState).toBe(CHECK_VIOLATION)

      expect(await tx.inventoryMovement.findMany({ where: { batchId }, select: { id: true } })).toEqual([])
    })
  })

  it("rechaza kind='adjustment' sin motivo con SQLSTATE 23514 (R10)", async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const companyId = await createCompany(tx, marker)
      const batchId = await createBatch(tx, marker, companyId)

      const rejection = await expectRejectedByDatabase(
        tx,
        () => rawInsertMovement(tx, { batchId, kind: 'adjustment', quantity: -1, reason: null, companyId }),
        'ajuste sin motivo',
      )
      expect(rejection.sqlState).toBe(CHECK_VIOLATION)

      expect(await tx.inventoryMovement.findMany({ where: { batchId }, select: { id: true } })).toEqual([])
    })
  })

  it("rechaza kind='opening' con motivo con SQLSTATE 23514 (R10)", async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const companyId = await createCompany(tx, marker)
      const batchId = await createBatch(tx, marker, companyId)

      const rejection = await expectRejectedByDatabase(
        tx,
        () => rawInsertMovement(tx, { batchId, kind: 'opening', quantity: 10, reason: 'merma', companyId }),
        'alta con motivo',
      )
      expect(rejection.sqlState).toBe(CHECK_VIOLATION)

      expect(await tx.inventoryMovement.findMany({ where: { batchId }, select: { id: true } })).toEqual([])
    })
  })

  it('rechaza un asiento cuya empresa no coincide con la del lote, con el identificador del disparador (R19)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const companyA = await createCompany(tx, `a${marker}`)
      const companyB = await createCompany(tx, `b${marker}`)
      const batchId = await createBatch(tx, marker, companyA)

      const rejection = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsertMovement(tx, { batchId, kind: 'opening', quantity: 10, reason: null, companyId: companyB }),
        'asiento de una empresa distinta de la del lote',
      )
      expect(rejection.sqlState).toBe(CHECK_VIOLATION)
      expect(rejection.message).toContain('inventory_movements_company_differs_from_batch')

      expect(await tx.inventoryMovement.findMany({ where: { batchId }, select: { id: true } })).toEqual([])
    })
  })

  it('rechaza un stock negativo en product_batches por SQL crudo con SQLSTATE 23514 (R5)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const companyId = await createCompany(tx, marker)
      const batchId = await createBatch(tx, marker, companyId, 3)

      const rejection = await expectRejectedByDatabase(
        tx,
        () =>
          tx.$executeRaw`UPDATE "product_batches" SET "stock" = -1 WHERE "id" = CAST(${batchId} AS uuid)`,
        'stock negativo escrito directo',
      )
      expect(rejection.sqlState).toBe(CHECK_VIOLATION)

      const batch = await tx.productBatch.findUniqueOrThrow({ where: { id: batchId }, select: { stock: true } })
      expect(batch.stock).toBe(3)
    })
  })
})
