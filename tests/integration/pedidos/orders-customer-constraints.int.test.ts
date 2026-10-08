/**
 * La migracion `orders_customer` contra Postgres REAL: la FK compuesta, el `NULL` valido, que los
 * pedidos previos quedan sin cliente y que bajar y volver a subir deja el esquema igual.
 *
 * AISLAMIENTO: cada `it` corre dentro de `prisma.$transaction` interactiva y termina lanzando
 * `RollbackSignal`, asi que ni las filas ni el DDL del DOWN/UP sobreviven (el DDL de Postgres es
 * transaccional). Lo que se espera que la base rechace va en su propio `SAVEPOINT` y con
 * `$executeRaw`: solo el SQL crudo propaga el SQLSTATE en `meta.code`.
 *
 * EL SQL DE LA MIGRACION SE LEE DEL ARCHIVO, no se copia a mano.
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
const FOREIGN_KEY_VIOLATION = '23503'

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
  const savepoint = `qc156_sp_${String(savepointSeq)}`
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
  const carpetas = readdirSync(migrationsDir).filter((name) => /^\d{14}_orders_customer$/.test(name))
  expect(carpetas, 'debe existir exactamente una migracion orders_customer').toHaveLength(1)
  return join(migrationsDir, carpetas[0] as string)
}

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

const migrationDir = locateMigrationDir()
const UP_STATEMENTS = statementsOf(readFileSync(join(migrationDir, 'migration.sql'), 'utf8'))
const DOWN_STATEMENTS = statementsOf(readFileSync(join(migrationDir, 'down.sql'), 'utf8'))

async function applyStatements(tx: Prisma.TransactionClient, statements: readonly string[]): Promise<void> {
  for (const statement of statements) {
    await tx.$executeRawUnsafe(statement)
  }
}

async function createCompany(tx: Prisma.TransactionClient, label: string): Promise<string> {
  const name = `Empresa ${label} ${token()}`
  const company = await tx.company.create({
    data: { name, nameNormalized: normalizeCompanyName(name) },
    select: { id: true },
  })
  return company.id
}

async function createRecipe(tx: Prisma.TransactionClient, companyId: string): Promise<string> {
  const marca = token()
  const recipe = await tx.recipe.create({
    data: { name: `Receta ${marca}`, nameNormalized: `receta${marca}`, companyId },
    select: { id: true },
  })
  return recipe.id
}

async function createCustomer(tx: Prisma.TransactionClient, companyId: string): Promise<string> {
  const customer = await tx.customer.create({
    data: {
      firstNames: 'Ana',
      firstNamesNormalized: 'ana',
      lastNames: 'Perez',
      lastNamesNormalized: 'perez',
      city: 'Bogota',
      cityNormalized: 'bogota',
      companyId,
    },
    select: { id: true },
  })
  return customer.id
}

let nextSequence = 900_000
function freshSequence(): number {
  nextSequence += 1
  return nextSequence
}

/** `INSERT` crudo en `orders` con lo minimo obligatorio. `customerId` `undefined` = no se nombra
 *  la columna, que es la unica forma de insertar cuando el DOWN ya la quito. */
async function rawInsertOrder(
  tx: Prisma.TransactionClient,
  companyId: string,
  recipeId: string,
  customerId?: string | null,
): Promise<string> {
  const id = randomUUID()
  const customerColumn = customerId === undefined ? Prisma.empty : Prisma.sql`, "customer_id"`
  const customerValue =
    customerId === undefined
      ? Prisma.empty
      : customerId === null
        ? Prisma.sql`, NULL`
        : Prisma.sql`, ${asUuid(customerId)}`
  await tx.$executeRaw`
    INSERT INTO "orders" ("id", "company_id", "order_year", "order_sequence", "recipe_id", "quantity", "updated_at"${customerColumn})
    VALUES (
      ${asUuid(id)}, ${asUuid(companyId)}, ${new Date().getUTCFullYear()}, ${freshSequence()},
      ${asUuid(recipeId)}, CAST('10' AS decimal(14,4)), CURRENT_TIMESTAMP${customerValue}
    )`
  return id
}

/** Lo que el DOWN tiene que devolver a su estado previo: columnas, restricciones e indices de
 *  `orders` y `customers`. Sin `ordinal_position`: Postgres no reutiliza el numero de una columna
 *  borrada, asi que tras bajar y subir `customer_id` cambia de posicion fisica sin cambiar de
 *  definicion. */
async function schemaSnapshot(tx: Prisma.TransactionClient): Promise<unknown> {
  const columns = await tx.$queryRaw<unknown[]>`
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name IN ('orders', 'customers')
    ORDER BY table_name, column_name`
  const constraints = await tx.$queryRaw<unknown[]>`
    SELECT rel.relname AS table_name, con.conname, pg_get_constraintdef(con.oid) AS definition
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = current_schema() AND rel.relname IN ('orders', 'customers')
    ORDER BY rel.relname, con.conname`
  const indexes = await tx.$queryRaw<unknown[]>`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = current_schema() AND tablename IN ('orders', 'customers')
    ORDER BY tablename, indexname`
  return { columns, constraints, indexes }
}

async function orderRowWithoutCustomer(tx: Prisma.TransactionClient, id: string): Promise<unknown> {
  const rows = await tx.$queryRaw<Array<{ row: unknown }>>`
    SELECT to_jsonb(o) - 'customer_id' AS row FROM "orders" o WHERE o.id = ${asUuid(id)}`
  return rows[0]?.row
}

afterAll(async () => {
  await prisma.$disconnect()
})

describe('orders.customer_id contra Postgres real', () => {
  it('R3: un pedido con cliente de otra empresa da 23503; con cliente de su empresa se acepta', async () => {
    await inRolledBackTransaction(async (tx) => {
      const companyId = await createCompany(tx, 'pedido')
      const otherCompanyId = await createCompany(tx, 'ajena')
      const recipeId = await createRecipe(tx, companyId)
      const ownCustomerId = await createCustomer(tx, companyId)
      const foreignCustomerId = await createCustomer(tx, otherCompanyId)

      const ownOrder = await rawInsertOrder(tx, companyId, recipeId, ownCustomerId)
      const stored = await tx.order.findUniqueOrThrow({ where: { id: ownOrder }, select: { customerId: true } })
      expect(stored.customerId).toBe(ownCustomerId)

      const cruce = await expectRejectedByDatabase(
        tx,
        () => rawInsertOrder(tx, companyId, recipeId, foreignCustomerId),
        'pedido con cliente de otra empresa',
      )
      expect(cruce).toBe(FOREIGN_KEY_VIOLATION)

      const inexistente = await expectRejectedByDatabase(
        tx,
        () => rawInsertOrder(tx, companyId, recipeId, randomUUID()),
        'pedido con cliente inexistente',
      )
      expect(inexistente).toBe(FOREIGN_KEY_VIOLATION)

      // Tambien al cambiar el cliente de un pedido existente, no solo en el alta.
      const update = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`
          UPDATE "orders" SET "customer_id" = ${asUuid(foreignCustomerId)} WHERE "id" = ${asUuid(ownOrder)}`,
        'cambio a cliente de otra empresa',
      )
      expect(update).toBe(FOREIGN_KEY_VIOLATION)
    })
  })

  it('R1, R3: un pedido sin cliente (NULL) es valido, y la columna no tiene valor por defecto', async () => {
    await inRolledBackTransaction(async (tx) => {
      const companyId = await createCompany(tx, 'pedido')
      const recipeId = await createRecipe(tx, companyId)

      const explicito = await rawInsertOrder(tx, companyId, recipeId, null)
      const omitido = await rawInsertOrder(tx, companyId, recipeId)
      const rows = await tx.order.findMany({
        where: { id: { in: [explicito, omitido] } },
        select: { customerId: true },
      })
      expect(rows).toHaveLength(2)
      expect(rows.map((row) => row.customerId)).toEqual([null, null])
    })
  })

  it('R2: los pedidos previos a la migracion quedan sin cliente y ninguna otra columna cambia', async () => {
    await inRolledBackTransaction(async (tx) => {
      const companyId = await createCompany(tx, 'pedido')
      const recipeId = await createRecipe(tx, companyId)

      await applyStatements(tx, DOWN_STATEMENTS)
      const previo = await rawInsertOrder(tx, companyId, recipeId)
      const antes = await orderRowWithoutCustomer(tx, previo)
      expect(antes).toBeDefined()

      await applyStatements(tx, UP_STATEMENTS)

      const rows = await tx.$queryRaw<Array<{ customer_id: string | null }>>`
        SELECT "customer_id" FROM "orders" WHERE "id" = ${asUuid(previo)}`
      expect(rows).toEqual([{ customer_id: null }])
      expect(await orderRowWithoutCustomer(tx, previo)).toEqual(antes)
    })
  })

  it('R4: aplicar el DOWN quita columna, indice y FK; volver a subir deja el esquema igual', async () => {
    await inRolledBackTransaction(async (tx) => {
      const conMigracion = await schemaSnapshot(tx)

      await applyStatements(tx, DOWN_STATEMENTS)
      const sinMigracion = (await schemaSnapshot(tx)) as {
        columns: Array<{ table_name: string; column_name: string }>
        constraints: Array<{ conname: string }>
        indexes: Array<{ indexname: string }>
      }
      expect(sinMigracion.columns.map((c) => `${c.table_name}.${c.column_name}`)).not.toContain(
        'orders.customer_id',
      )
      expect(sinMigracion.constraints.map((c) => c.conname)).not.toContain(
        'orders_company_id_customer_id_fkey',
      )
      expect(sinMigracion.indexes.map((i) => i.indexname)).not.toContain(
        'orders_company_id_customer_id_idx',
      )
      // `customers` sigue con su clave candidata: el DOWN no la toca.
      expect(sinMigracion.indexes.map((i) => i.indexname)).toContain('customers_company_id_id_key')

      // Fuera de esos tres objetos, nada mas cambia ni en `orders` ni en `customers`.
      const conMigracionSinCliente = conMigracion as typeof sinMigracion
      expect(sinMigracion).toEqual({
        columns: conMigracionSinCliente.columns.filter(
          (c) => `${c.table_name}.${c.column_name}` !== 'orders.customer_id',
        ),
        constraints: conMigracionSinCliente.constraints.filter(
          (c) => c.conname !== 'orders_company_id_customer_id_fkey',
        ),
        indexes: conMigracionSinCliente.indexes.filter(
          (i) => i.indexname !== 'orders_company_id_customer_id_idx',
        ),
      })

      await applyStatements(tx, UP_STATEMENTS)
      expect(await schemaSnapshot(tx)).toEqual(conMigracion)
    })
  })
})
