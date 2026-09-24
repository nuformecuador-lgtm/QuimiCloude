/**
 * La migracion `db/migrations/*_reservations_and_decimal_stock` contra Postgres REAL.
 *
 * AISLAMIENTO -- cada `it` corre dentro de `prisma.$transaction` interactiva y termina lanzando
 * `RollbackSignal`, asi que ninguna fila ni ningun cambio de tipo sobrevive (mismo patron que
 * `identity/packer-role-migration.int.test.ts`).
 *
 * Se comprueba REVIRTIENDO primero las cuatro columnas a entero DENTRO de la transaccion
 * -asi se puede sembrar un entero "de antes"-, y aplicando despues, LEIDAS DEL ARCHIVO REAL, las
 * mismas sentencias `ALTER COLUMN ... TYPE DECIMAL(14,4)` que trae `migration.sql`: si alguien les
 * quita el `USING` o cambia la escala, este archivo lo nota aplicando el SQL real, no una copia.
 *
 * El `down.sql` real se aplica sobre una fila con parte decimal, dentro de un SAVEPOINT, y se
 * comprueba que el intento se rechaza y que nada cambio.
 */
import { randomUUID } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

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
      { maxWait: 10_000, timeout: 30_000 },
    )
  } catch (error) {
    if (!(error instanceof RollbackSignal)) throw error
  }
}

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
  const savepoint = `qc141_t2_sp_${String(savepointSeq)}`
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

// ---------------------------------------------------------------------------
// El SQL, leido del archivo (no copiado)
// ---------------------------------------------------------------------------

function findRepoRoot(startDir: string): string {
  let dir = startDir
  for (;;) {
    try {
      readFileSync(join(dir, 'package.json'))
      return dir
    } catch {
      const parent = dirname(dir)
      if (parent === dir) throw new Error(`no se encontro package.json subiendo desde ${startDir}`)
      dir = parent
    }
  }
}

function locateMigrationDir(): string {
  const migrationsDir = join(findRepoRoot(dirname(fileURLToPath(import.meta.url))), 'db', 'migrations')
  const carpetas = readdirSync(migrationsDir).filter((name) =>
    name.endsWith('_reservations_and_decimal_stock'),
  )
  expect(carpetas, 'debe existir exactamente una migracion *_reservations_and_decimal_stock').toHaveLength(1)
  return join(migrationsDir, carpetas[0] as string)
}

const migrationDir = locateMigrationDir()
const upSource = readFileSync(join(migrationDir, 'migration.sql'), 'utf8')
const downSource = readFileSync(join(migrationDir, 'down.sql'), 'utf8')

/**
 * Sentencias ejecutables, respetando el cuerpo `$$ ... $$` de un bloque `DO`: un `split(';')`
 * ingenuo lo rompe, porque el bloque lleva `;` dentro. Fuera de `$$`, cada `;` SI separa.
 */
function statementsOf(sql: string): readonly string[] {
  const withoutComments = sql
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')

  const statements: string[] = []
  let current = ''
  let inDollarBlock = false
  let i = 0
  while (i < withoutComments.length) {
    if (withoutComments.slice(i, i + 2) === '$$') {
      inDollarBlock = !inDollarBlock
      current += '$$'
      i += 2
      continue
    }
    const char = withoutComments[i]
    if (char === ';' && !inDollarBlock) {
      const trimmed = current.trim()
      if (trimmed.length > 0) statements.push(trimmed)
      current = ''
      i += 1
      continue
    }
    current += char
    i += 1
  }
  const trimmed = current.trim()
  if (trimmed.length > 0) statements.push(trimmed)
  return statements
}

/** Las cuatro sentencias `ALTER COLUMN ... TYPE DECIMAL(14,4)` del UP, en el orden del archivo. */
function decimalConversionStatements(): readonly string[] {
  const found = statementsOf(upSource).filter((statement) =>
    /ALTER COLUMN "(stock|quantity|qty_alert)" TYPE DECIMAL\(14,4\)/.test(statement),
  )
  expect(found, 'el UP debe traer exactamente cuatro conversiones a decimal(14,4)').toHaveLength(4)
  return found
}

async function applyStatements(tx: Prisma.TransactionClient, statements: readonly string[]): Promise<void> {
  for (const statement of statements) {
    await tx.$executeRawUnsafe(statement)
  }
}

// ---------------------------------------------------------------------------
// El escenario: producto, lote y movimiento sembrados a mano
// ---------------------------------------------------------------------------

function marker(): string {
  return randomUUID().replace(/-/gu, '').slice(0, 12)
}

async function createCompany(tx: Prisma.TransactionClient): Promise<string> {
  const name = `qc141-t2-${randomUUID()}`
  const company = await tx.company.create({
    data: { name, nameNormalized: normalizeCompanyName(name) },
    select: { id: true },
  })
  return company.id
}

async function systemUnitId(tx: Prisma.TransactionClient): Promise<string> {
  const unit = await tx.unit.findFirstOrThrow({
    where: { nameNormalized: 'kilogramo', companyId: null },
    select: { id: true },
  })
  return unit.id
}

type Scenario = {
  readonly companyId: string
  readonly productId: string
  readonly batchId: string
  readonly movementId: string
}

/**
 * Revierte las cuatro columnas a `INTEGER` -asi se puede sembrar "un entero de antes de esta
 * migracion"- y siembra un producto, un lote y un asiento con valores enteros exactos, DIRECTO
 * por SQL para no depender de que el cliente de Prisma, generado sobre el esquema DECIMAL,
 * acepte escribir en una columna que en ese instante ya es entera.
 */
async function seedIntegerScenario(tx: Prisma.TransactionClient): Promise<Scenario> {
  await tx.$executeRawUnsafe('ALTER TABLE "product_batches" ALTER COLUMN "stock" TYPE INTEGER USING "stock"::INTEGER')
  await tx.$executeRawUnsafe('ALTER TABLE "inventory_movements" ALTER COLUMN "quantity" TYPE INTEGER USING "quantity"::INTEGER')
  await tx.$executeRawUnsafe('ALTER TABLE "products" ALTER COLUMN "stock" TYPE INTEGER USING "stock"::INTEGER')
  await tx.$executeRawUnsafe('ALTER TABLE "products" ALTER COLUMN "qty_alert" TYPE INTEGER USING "qty_alert"::INTEGER')

  const companyId = await createCompany(tx)
  const unitId = await systemUnitId(tx)
  const tag = marker()

  const presentationRows = await tx.$queryRawUnsafe<ReadonlyArray<{ id: string }>>(
    `INSERT INTO "presentations" ("name", "name_normalized", "unit_id", "company_id", "updated_at")
     VALUES ($1, $2, $3::uuid, $4::uuid, now()) RETURNING "id"`,
    `Presentacion ${tag}`,
    `presentacion${tag}`,
    unitId,
    companyId,
  )
  const presentationId = presentationRows[0]?.id
  if (presentationId === undefined) throw new Error('no se pudo sembrar la presentacion')

  const productRows = await tx.$queryRawUnsafe<ReadonlyArray<{ id: string }>>(
    `INSERT INTO "products" ("name", "name_normalized", "unit_id", "stock", "qty_alert", "company_id", "updated_at")
     VALUES ($1, $2, $3::uuid, $4, $5, $6::uuid, now()) RETURNING "id"`,
    `Producto ${tag}`,
    `producto${tag}`,
    unitId,
    1234567890,
    42,
    companyId,
  )
  const productId = productRows[0]?.id
  if (productId === undefined) throw new Error('no se pudo sembrar el producto')

  const batchRows = await tx.$queryRawUnsafe<ReadonlyArray<{ id: string }>>(
    `INSERT INTO "product_batches"
       ("product_id", "presentation_id", "stock", "unit_cost", "lot", "purchase_date", "company_id", "updated_at")
     VALUES ($1::uuid, $2::uuid, $3, $4::numeric, $5, $6::date, $7::uuid, now()) RETURNING "id"`,
    productId,
    presentationId,
    555,
    '2.5000',
    `L-${tag}`,
    '2026-09-01',
    companyId,
  )
  const batchId = batchRows[0]?.id
  if (batchId === undefined) throw new Error('no se pudo sembrar el lote')

  const movementRows = await tx.$queryRawUnsafe<ReadonlyArray<{ id: string }>>(
    `INSERT INTO "inventory_movements" ("batch_id", "kind", "quantity", "reason", "company_id")
     VALUES ($1::uuid, 'adjustment'::"InventoryMovementKind", $2, 'conteo_fisico', $3::uuid) RETURNING "id"`,
    batchId,
    -77,
    companyId,
  )
  const movementId = movementRows[0]?.id
  if (movementId === undefined) throw new Error('no se pudo sembrar el asiento')

  return { companyId, productId, batchId, movementId }
}

async function decimalTextsOf(tx: Prisma.TransactionClient, scenario: Scenario) {
  const [product] = await tx.$queryRawUnsafe<ReadonlyArray<{ stock: string; qty_alert: string }>>(
    'SELECT "stock"::text, "qty_alert"::text FROM "products" WHERE "id" = $1::uuid',
    scenario.productId,
  )
  const [batch] = await tx.$queryRawUnsafe<ReadonlyArray<{ stock: string }>>(
    'SELECT "stock"::text FROM "product_batches" WHERE "id" = $1::uuid',
    scenario.batchId,
  )
  const [movement] = await tx.$queryRawUnsafe<ReadonlyArray<{ quantity: string }>>(
    'SELECT "quantity"::text FROM "inventory_movements" WHERE "id" = $1::uuid',
    scenario.movementId,
  )
  if (product === undefined || batch === undefined || movement === undefined) {
    throw new Error('no se pudo releer el escenario sembrado')
  }
  return {
    productStock: product.stock,
    productQtyAlert: product.qty_alert,
    batchStock: batch.stock,
    movementQuantity: movement.quantity,
  }
}

afterAll(async () => {
  await prisma.$disconnect()
})

describe('migracion reservations_and_decimal_stock contra Postgres real', () => {
  it('R2: convertir a decimal(14,4) conserva exactamente el valor de un entero ya guardado', async () => {
    await inRolledBackTransaction(async (tx) => {
      const scenario = await seedIntegerScenario(tx)

      const before = await tx.$queryRawUnsafe<ReadonlyArray<{ stock: string; qty_alert: string }>>(
        'SELECT "stock"::text, "qty_alert"::text FROM "products" WHERE "id" = $1::uuid',
        scenario.productId,
      )
      expect(before[0]).toEqual({ stock: '1234567890', qty_alert: '42' })

      await applyStatements(tx, decimalConversionStatements())

      const after = await decimalTextsOf(tx, scenario)
      expect(after).toEqual({
        productStock: '1234567890.0000',
        productQtyAlert: '42.0000',
        batchStock: '555.0000',
        movementQuantity: '-77.0000',
      })
    })
  })

  it('R45: el DOWN sin ninguna parte decimal revierte los cuatro tipos a entero', async () => {
    await inRolledBackTransaction(async (tx) => {
      const scenario = await seedIntegerScenario(tx)
      await applyStatements(tx, decimalConversionStatements())

      await applyStatements(tx, statementsOf(downSource))

      const [row] = await tx.$queryRawUnsafe<ReadonlyArray<{ data_type: string }>>(
        `SELECT data_type FROM information_schema.columns
          WHERE table_name = 'product_batches' AND column_name = 'stock'`,
      )
      expect(row?.data_type).toBe('integer')

      const [batch] = await tx.$queryRawUnsafe<ReadonlyArray<{ stock: number }>>(
        'SELECT "stock" FROM "product_batches" WHERE "id" = $1::uuid',
        scenario.batchId,
      )
      expect(batch?.stock).toBe(555)
    })
  })

  it('R45: el DOWN con una existencia con parte decimal se rechaza con SQLSTATE 23514, y no cambia nada', async () => {
    await inRolledBackTransaction(async (tx) => {
      const scenario = await seedIntegerScenario(tx)
      await applyStatements(tx, decimalConversionStatements())

      await tx.$executeRawUnsafe(
        'UPDATE "product_batches" SET "stock" = $1::numeric WHERE "id" = $2::uuid',
        '10.5000',
        scenario.batchId,
      )

      const sqlState = await expectRejectedByDatabase(
        tx,
        () => applyStatements(tx, statementsOf(downSource)),
        'DOWN de reservations_and_decimal_stock con un lote con parte decimal',
      )
      expect(sqlState).toBe('23514')

      // Nada cambio: el tipo sigue siendo decimal y la tabla de reservas sigue existiendo.
      const [row] = await tx.$queryRawUnsafe<ReadonlyArray<{ data_type: string }>>(
        `SELECT data_type FROM information_schema.columns
          WHERE table_name = 'product_batches' AND column_name = 'stock'`,
      )
      expect(row?.data_type).toBe('numeric')

      const [reservationTable] = await tx.$queryRawUnsafe<ReadonlyArray<{ tablename: string }>>(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'reservation_movements'`,
      )
      expect(reservationTable?.tablename).toBe('reservation_movements')
    })
  })
})
