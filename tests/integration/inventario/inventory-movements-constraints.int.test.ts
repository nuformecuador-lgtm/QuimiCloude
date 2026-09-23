/**
 * Contra Postgres real, con las migraciones `20260917130000_inventory_movements` y
 * `20260918120000_inventory_movement_kind_enum_and_reason_catalog` aplicadas.
 *
 * AISLAMIENTO -- cada caso corre dentro de `prisma.$transaction` interactiva y termina
 * lanzando `RollbackSignal`, asi que ninguna fila escrita sobrevive. Un error de constraint
 * aborta la transaccion entera, asi que cada intento que se espera que falle va dentro de
 * su propio SAVEPOINT (mismo patron que `unidades-constraints.int.test.ts`).
 */
import { randomUUID } from 'node:crypto'

import { Prisma } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { MOVEMENT_REASONS } from '@/lib/modules/inventario/domain/movement-reason'
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
const INVALID_TEXT_REPRESENTATION = '22P02'

const MOTIVO_FUERA_DEL_CATALOGO = 'inventado'

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
  unitId: string | null = null,
): Promise<string> {
  const product = await tx.product.create({
    data: { name: `Producto ${marker}`, nameNormalized: `producto${marker}`, companyId, unitId },
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
  // El producto del fixture gana la unidad de su presentacion: sin ella,
  // `product_batches_check_unit` rechazaria el lote de mas abajo.
  const productId = await createProduct(tx, marker, companyId, unitId)
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
 *
 * El `CAST(... AS "InventoryMovementKind")` no es adorno: desde que `kind` es un enum, el
 * parametro llega como texto y Postgres rechaza el INSERT con 42804 -medido- antes de poder
 * llegar al CHECK o al disparador que el caso quiere ejercitar. Con el cast, un valor que no
 * es del enum cae donde tiene que caer: en 22P02.
 */
async function rawInsertMovement(
  tx: Prisma.TransactionClient,
  columns: { batchId: string; kind: string; quantity: number; reason: string | null; companyId: string },
): Promise<number> {
  return tx.$executeRaw`
    INSERT INTO "inventory_movements" ("batch_id", "kind", "quantity", "reason", "company_id")
    VALUES (
      CAST(${columns.batchId} AS uuid), CAST(${columns.kind} AS "InventoryMovementKind"),
      ${columns.quantity}, ${columns.reason},
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

  it('acepta todos los motivos del catalogo en un ajuste (R36)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const companyId = await createCompany(tx, marker)
      const batchId = await createBatch(tx, marker, companyId)

      // Sin esto, un catalogo vacio dejaria el bucle sin insertar nada y el caso pasaria en verde.
      expect(MOVEMENT_REASONS.length).toBeGreaterThan(0)

      for (const reason of MOVEMENT_REASONS) {
        await rawInsertMovement(tx, { batchId, kind: 'adjustment', quantity: -1, reason, companyId })
      }

      const escritos = await tx.inventoryMovement.findMany({
        where: { batchId },
        select: { reason: true },
        orderBy: { reason: 'asc' },
      })
      expect(escritos.map((movimiento) => movimiento.reason)).toEqual([...MOVEMENT_REASONS].sort())
    })
  })

  it('rechaza un motivo que no esta en el catalogo con SQLSTATE 23514 e inventory_movements_reason_in_catalog (R36)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const companyId = await createCompany(tx, marker)
      const batchId = await createBatch(tx, marker, companyId)

      const catalogo: readonly string[] = MOVEMENT_REASONS
      expect(catalogo).not.toContain(MOTIVO_FUERA_DEL_CATALOGO)

      const rejection = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsertMovement(tx, {
            batchId,
            kind: 'adjustment',
            quantity: -1,
            reason: MOTIVO_FUERA_DEL_CATALOGO,
            companyId,
          }),
        'ajuste con un motivo fuera del catalogo',
      )
      expect(rejection.sqlState).toBe(CHECK_VIOLATION)
      expect(rejection.message).toContain('inventory_movements_reason_in_catalog')

      expect(await tx.inventoryMovement.findMany({ where: { batchId }, select: { id: true } })).toEqual([])
    })
  })

  it('rechaza una clase que no es del enum con SQLSTATE 22P02 (R35)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const companyId = await createCompany(tx, marker)
      const batchId = await createBatch(tx, marker, companyId)

      const rejection = await expectRejectedByDatabase(
        tx,
        // `consumption` YA NO SIRVE de ejemplo aqui: entro al enum. Cualquier otro texto que el
        // tipo no declare sigue dando 22P02.
        () => rawInsertMovement(tx, { batchId, kind: 'bogus_kind', quantity: -1, reason: 'merma', companyId }),
        'asiento con una clase que el enum no declara',
      )
      expect(rejection.sqlState).toBe(INVALID_TEXT_REPRESENTATION)
      // Por el nombre del tipo y el valor rechazado, no por el texto: el mensaje de Postgres esta
      // traducido y decir «invalid input value for enum» ata el caso al idioma del servidor.
      expect(rejection.message).toContain('InventoryMovementKind')
      expect(rejection.message).toContain('bogus_kind')

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
      expect(batch.stock.toFixed(4)).toBe('3.0000')
    })
  })
})
