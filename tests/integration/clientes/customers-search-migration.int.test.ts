// La migracion `db/migrations/20260924200000_customers_search_normalized/` contra Postgres REAL.
//
// AISLAMIENTO — mismo patron que `clientes/customers-migration.int.test.ts`: cada `it` corre
// dentro de `prisma.$transaction` interactiva y termina lanzando `RollbackSignal`. La operacion
// que se espera que falle va en su propio `SAVEPOINT` (`expectRejectedByDatabase`).
//
// EL SQL DE LA MIGRACION SE LEE DEL ARCHIVO, no se copia a mano.
import { randomUUID } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Prisma } from '@prisma/client'
import { afterAll, describe, expect, it } from 'vitest'

import { normalizeCustomerText } from '@/lib/modules/clientes/domain/customer-text'
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
const NOT_NULL_VIOLATION = '23502'

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
  const savepoint = `qc154_sp_${String(savepointSeq)}`
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

async function createCompany(tx: Prisma.TransactionClient): Promise<string> {
  const name = `Empresa ${token()}`
  const company = await tx.company.create({
    data: { name, nameNormalized: normalizeCompanyName(name) },
    select: { id: true },
  })
  return company.id
}

function asUuid(id: string): Prisma.Sql {
  return Prisma.sql`CAST(${id} AS uuid)`
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

function locateSearchMigrationDir(): string {
  const migrationsDir = join(findRepoRoot(dirname(fileURLToPath(import.meta.url))), 'db', 'migrations')
  const carpetas = readdirSync(migrationsDir).filter((name) => /_customers_search_normalized$/.test(name))
  expect(carpetas, 'debe existir exactamente una migracion de busqueda normalizada').toHaveLength(1)
  return join(migrationsDir, carpetas[0] as string)
}

const migrationDir = locateSearchMigrationDir()

function statementsOf(sql: string): readonly string[] {
  return sql
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0)
}

const UP_STATEMENTS = statementsOf(readFileSync(join(migrationDir, 'migration.sql'), 'utf8'))
const DOWN_STATEMENTS = statementsOf(readFileSync(join(migrationDir, 'down.sql'), 'utf8'))

async function applyStatements(tx: Prisma.TransactionClient, statements: readonly string[]): Promise<void> {
  for (const statement of statements) {
    await tx.$executeRawUnsafe(statement)
  }
}

/** Inserta una fila cruda con solo las columnas de QC-153 (sin las tres normalizadas): la
 *  forma que la tabla tiene justo despues del DOWN de esta migracion. */
async function rawInsertBaseCustomer(
  tx: Prisma.TransactionClient,
  companyId: string,
  values: { readonly firstNames: string; readonly lastNames: string; readonly city: string; readonly deletedAt?: Date },
): Promise<string> {
  const id = randomUUID()
  await tx.$executeRaw`
    INSERT INTO "customers" (id, first_names, last_names, city, company_id, deleted_at, updated_at)
    VALUES (
      ${asUuid(id)}, ${values.firstNames}, ${values.lastNames}, ${values.city}, ${asUuid(companyId)},
      ${values.deletedAt ?? null}, CURRENT_TIMESTAMP
    )`
  return id
}

afterAll(async () => {
  await prisma.$disconnect()
})

describe('migracion customers_search_normalized contra Postgres real', () => {
  it('R43: el relleno de vivos y dados de baja coincide con normalizeCustomerText', async () => {
    await inRolledBackTransaction(async (tx) => {
      const companyId = await createCompany(tx)

      // Se vuelve a la forma de QC-153 (sin las tres columnas) para poder insertar filas SIN
      // ellas, tal como estarian si esta migracion nunca se hubiera aplicado.
      await applyStatements(tx, DOWN_STATEMENTS)

      const vivo = await rawInsertBaseCustomer(tx, companyId, {
        firstNames: 'María José',
        lastNames: 'Pérez Muñoz',
        city: 'Bogotá',
      })
      const dadoDeBaja = await rawInsertBaseCustomer(tx, companyId, {
        firstNames: 'Andrés',
        lastNames: 'Niño Peña',
        city: 'Medellín',
        deletedAt: new Date(),
      })

      await applyStatements(tx, UP_STATEMENTS)

      const filas = await tx.customer.findMany({
        where: { id: { in: [vivo, dadoDeBaja] } },
        orderBy: { firstNames: 'asc' },
      })
      expect(filas).toHaveLength(2)

      for (const fila of filas) {
        expect(fila.firstNamesNormalized).toBe(normalizeCustomerText(fila.firstNames))
        expect(fila.lastNamesNormalized).toBe(normalizeCustomerText(fila.lastNames))
        expect(fila.cityNormalized).toBe(normalizeCustomerText(fila.city))
      }

      const filaViva = filas.find((f) => f.id === vivo)
      const filaDeBaja = filas.find((f) => f.id === dadoDeBaja)
      expect(filaViva?.deletedAt).toBeNull()
      expect(filaDeBaja?.deletedAt).not.toBeNull()
      expect(filaDeBaja?.firstNamesNormalized).toBe('andres')
      expect(filaDeBaja?.lastNamesNormalized).toBe('ninopena')
      expect(filaDeBaja?.cityNormalized).toBe('medellin')
    })
  })

  it('R44: la base rechaza con 23502 una forma normalizada nula', async () => {
    await inRolledBackTransaction(async (tx) => {
      const companyId = await createCompany(tx)
      const id = randomUUID()

      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          tx.$executeRaw`
            INSERT INTO "customers"
              (id, first_names, last_names, city, last_names_normalized, city_normalized, company_id, updated_at)
            VALUES
              (${asUuid(id)}, 'Sin', 'Normalizar', 'Cali', 'normalizar', 'cali', ${asUuid(companyId)}, CURRENT_TIMESTAMP)`,
        'cliente sin first_names_normalized',
      )
      expect(sqlState).toBe(NOT_NULL_VIOLATION)
    })
  })

  it('R45: los tres indices GIN de trigramas existen, parciales sobre los vivos', async () => {
    await inRolledBackTransaction(async (tx) => {
      const indices = await tx.$queryRaw<{ indexname: string; indexdef: string }[]>`
        SELECT indexname, indexdef FROM pg_indexes
        WHERE tablename = 'customers' AND indexname LIKE '%_trgm_idx'
        ORDER BY indexname`
      expect(indices.map((i) => i.indexname)).toEqual([
        'customers_city_normalized_trgm_idx',
        'customers_first_names_normalized_trgm_idx',
        'customers_last_names_normalized_trgm_idx',
      ])
      for (const indice of indices) {
        expect(indice.indexdef).toMatch(/gin_trgm_ops/)
        expect(indice.indexdef).toMatch(/deleted_at IS NULL/i)
      }
    })
  })
})
