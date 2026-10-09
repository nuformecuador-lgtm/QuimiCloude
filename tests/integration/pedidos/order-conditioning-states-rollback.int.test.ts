/**
 * El DOWN de `order_conditioning_states` y `order_terminated_finished_index` contra Postgres REAL.
 *
 * Aislamiento: cada `it` corre dentro de una transaccion interactiva que termina en `ROLLBACK`,
 * contra la base efimera de la corrida. El `DO $$ ... RAISE EXCEPTION` deja la transaccion
 * abortada, asi que va dentro de un SAVEPOINT para poder seguir consultando.
 *
 * El SQL se lee de los archivos, no se copia: si alguien reordena el `down.sql`, esto lo nota.
 * Orden de una reversion real: primero el DOWN del indice, que compara contra `TERMINADO`, y
 * despues el de los estados.
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
      { maxWait: 10_000, timeout: 60_000 },
    )
  } catch (error) {
    if (!(error instanceof RollbackSignal)) throw error
  }
}

let savepointSeq = 0

async function expectRejectedByDatabase(
  tx: Prisma.TransactionClient,
  run: () => Promise<unknown>,
  what: string,
): Promise<string> {
  savepointSeq += 1
  const savepoint = `sp_conditioning_down_${String(savepointSeq)}`
  await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`)
  try {
    await run()
  } catch (error) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`)
    return error instanceof Error ? error.message : String(error)
  }
  await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`)
  throw new Error(`se esperaba que la base rechazara la operacion, pero la acepto: ${what}`)
}

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

function locateMigrationDir(suffix: string): string {
  const migrationsDir = join(findRepoRoot(dirname(fileURLToPath(import.meta.url))), 'db', 'migrations')
  const carpetas = readdirSync(migrationsDir).filter((name) => name.endsWith(suffix))
  expect(carpetas, `debe existir exactamente una migracion ${suffix}`).toHaveLength(1)
  return join(migrationsDir, carpetas[0] as string)
}

const STATES_DOWN_SQL = readFileSync(join(locateMigrationDir('_order_conditioning_states'), 'down.sql'), 'utf8')
const INDEX_DOWN_SQL = readFileSync(
  join(locateMigrationDir('_order_terminated_finished_index'), 'down.sql'),
  'utf8',
)

/** El bloque `DO $$ ... END $$;` del principio: tiene `;` internos, se recorta entero. */
function extractAbortBlock(sql: string): string {
  const marker = 'END $$;'
  const index = sql.indexOf(marker)
  if (index === -1) throw new Error('down.sql no contiene el bloque DO $$ ... END $$ esperado')
  return sql.slice(0, index + marker.length)
}

/** Sentencias sin comentarios, troceadas por `;`: ninguna tiene `;` internos. */
function plainStatementsOf(sql: string): readonly string[] {
  return sql
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0)
}

const ABORT_BLOCK = extractAbortBlock(STATES_DOWN_SQL)
const STATES_DOWN_STATEMENTS: readonly string[] = [
  ABORT_BLOCK,
  ...plainStatementsOf(STATES_DOWN_SQL.slice(STATES_DOWN_SQL.indexOf(ABORT_BLOCK) + ABORT_BLOCK.length)),
]
const INDEX_DOWN_STATEMENTS = plainStatementsOf(INDEX_DOWN_SQL)

async function applyStatements(tx: Prisma.TransactionClient, statements: readonly string[]): Promise<void> {
  for (const statement of statements) await tx.$executeRawUnsafe(statement)
}

function token(): string {
  return randomUUID().replace(/-/gu, '')
}

async function seedPendingConditioningOrder(tx: Prisma.TransactionClient): Promise<string> {
  const marca = token()
  const name = `Empresa acondicionamiento ${marca}`
  const company = await tx.company.create({
    data: { name, nameNormalized: normalizeCompanyName(name) },
    select: { id: true },
  })
  const recipe = await tx.recipe.create({
    data: { name: `Receta ${marca}`, nameNormalized: `receta${marca}`, companyId: company.id },
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
  const packer = await tx.user.create({
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
  const order = await tx.order.create({
    data: {
      companyId: company.id,
      orderYear: new Date().getUTCFullYear(),
      orderSequence: 950_001,
      recipeId: recipe.id,
      quantity: new Prisma.Decimal('10'),
      status: 'POR_ACONDICIONAR',
      packedBy: packer.id,
    },
    select: { id: true },
  })
  return order.id
}

async function enumValues(tx: Prisma.TransactionClient): Promise<readonly string[]> {
  const rows = await tx.$queryRaw<ReadonlyArray<{ value: string }>>(Prisma.sql`
    SELECT e.enumlabel AS value
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'OrderStatus'
     ORDER BY e.enumsortorder
  `)
  return rows.map((row) => row.value)
}

async function columnExists(tx: Prisma.TransactionClient, column: string): Promise<boolean> {
  const rows = await tx.$queryRaw<ReadonlyArray<{ exists: boolean }>>(Prisma.sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'orders' AND column_name = ${column}
    ) AS "exists"
  `)
  return rows[0]?.exists === true
}

/** Definicion de cada CHECK de `orders` que nombra "status", tal como la guarda Postgres. */
async function statusChecks(tx: Prisma.TransactionClient): Promise<Readonly<Record<string, string>>> {
  const rows = await tx.$queryRaw<ReadonlyArray<{ name: string; definition: string }>>(Prisma.sql`
    SELECT conname::text AS name, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
     WHERE conrelid = 'orders'::regclass AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%status%'
     ORDER BY conname
  `)
  return Object.fromEntries(rows.map((row) => [row.name, row.definition]))
}

async function indexNames(tx: Prisma.TransactionClient): Promise<readonly string[]> {
  const rows = await tx.$queryRaw<ReadonlyArray<{ name: string }>>(Prisma.sql`
    SELECT indexname::text AS name FROM pg_indexes WHERE tablename = 'orders' ORDER BY indexname
  `)
  return rows.map((row) => row.name)
}

afterAll(async () => {
  await prisma.$disconnect()
})

describe('down.sql de order_conditioning_states', () => {
  it('R27: un pedido POR_ACONDICIONAR aborta el DOWN entero y deja el esquema intacto', async () => {
    await inRolledBackTransaction(async (tx) => {
      await seedPendingConditioningOrder(tx)
      const enumAntes = await enumValues(tx)
      const checksAntes = await statusChecks(tx)
      const indicesAntes = await indexNames(tx)

      const mensaje = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRawUnsafe(ABORT_BLOCK),
        'DOWN con un pedido POR_ACONDICIONAR',
      )
      expect(mensaje).toContain('ROLLBACK ABORTADO')

      expect(await enumValues(tx)).toEqual(enumAntes)
      expect(await statusChecks(tx)).toEqual(checksAntes)
      expect(await indexNames(tx)).toEqual(indicesAntes)
      expect(await columnExists(tx, 'conditioned_by')).toBe(true)
      expect(await tx.order.count({ where: { status: 'POR_ACONDICIONAR' } })).toBeGreaterThan(0)
    })
  })

  it('R27: sin pedidos en los estados nuevos, revierte entero y deja el enum, la columna y los CHECK de antes', async () => {
    await inRolledBackTransaction(async (tx) => {
      expect(
        await tx.order.count({
          where: { status: { in: ['POR_ACONDICIONAR', 'EN_ACONDICIONAMIENTO', 'TERMINADO'] } },
        }),
      ).toBe(0)
      expect(await indexNames(tx)).toContain('orders_company_terminated_idx')

      await applyStatements(tx, INDEX_DOWN_STATEMENTS)
      expect(await indexNames(tx)).not.toContain('orders_company_terminated_idx')

      await applyStatements(tx, STATES_DOWN_STATEMENTS)

      expect(await enumValues(tx)).toEqual([
        'PENDIENTE',
        'EN_CURSO',
        'ENTREGADO',
        'CANCELADO',
        'POR_EMPACAR',
        'EN_EMPAQUE',
        'BLOQUEADO',
      ])
      expect(await columnExists(tx, 'conditioned_by')).toBe(false)

      const checks = await statusChecks(tx)
      expect(Object.keys(checks)).toEqual([
        'orders_cancellation_reason_matches_status',
        'orders_delivered_not_deleted',
        'orders_finished_at_requires_delivered',
        'orders_packed_by_matches_status',
      ])
      for (const definition of Object.values(checks)) {
        expect(definition).not.toMatch(/ACONDICION|TERMINADO/)
      }

      const indices = await indexNames(tx)
      for (const nombre of [
        'orders_status_idx',
        'orders_expirable_idx',
        'orders_company_finished_idx',
        'orders_blocked_company_created_idx',
      ]) {
        expect(indices, nombre).toContain(nombre)
      }
      expect(indices).not.toContain('orders_conditioned_by_idx')
    })
  })
})
