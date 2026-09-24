/**
 * Migracion `*_recipe_lines_percentage_nullable`: `percentage` admite NULL y el CHECK de
 * rango sigue rechazando 0 y 101. Mismo patron que `recipe-lines-percentage.int.test.ts`:
 * cada caso en su transaccion que termina en ROLLBACK, y lo que debe fallar con SAVEPOINT.
 * Se afirma sobre el SQLSTATE, nunca sobre el texto del mensaje.
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

async function expectRejectedByDatabase(
  tx: Prisma.TransactionClient,
  run: () => Promise<unknown>,
  what: string,
): Promise<string> {
  savepointSeq += 1
  const savepoint = `sp_nullable_${String(savepointSeq)}`
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

function normalizeProductNameForTest(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]/gu, '')
}

async function createProduct(tx: Prisma.TransactionClient, name = 'Insumo de prueba'): Promise<string> {
  const companyName = `Empresa nullable ${token()}`
  const company = await tx.company.create({
    data: { name: companyName, nameNormalized: normalizeCompanyName(companyName) },
    select: { id: true },
  })
  const product = await tx.product.create({
    data: {
      name,
      nameNormalized: normalizeProductNameForTest(name),
      companyId: company.id,
    },
    select: { id: true },
  })
  return product.id
}

async function createRecipe(tx: Prisma.TransactionClient, marker: string): Promise<string> {
  const companyName = `Empresa nullable ${token()}`
  const company = await tx.company.create({
    data: { name: companyName, nameNormalized: normalizeCompanyName(companyName) },
    select: { id: true },
  })
  const recipe = await tx.recipe.create({
    data: {
      name: `Receta ${marker}`,
      nameNormalized: `receta${marker}`,
      steps: [],
      companyId: company.id,
    },
    select: { id: true },
  })
  return recipe.id
}

afterAll(async () => {
  await prisma.$disconnect()
})

describe('recipe_lines.percentage nullable', () => {
  it('acepta NULL y lo relee como NULL', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const recipeId = await createRecipe(tx, marker)
      const productId = await createProduct(tx)

      const line = await tx.recipeLine.create({
        data: { recipeId, productId, percentage: null },
        select: { percentage: true },
      })
      expect(line.percentage).toBeNull()
    })
  })

  it('el CHECK de rango sigue rechazando 0 y 101 con SQLSTATE 23514', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const recipeId = await createRecipe(tx, marker)
      const productId = await createProduct(tx)

      for (const invalido of ['0', '101']) {
        const sqlState = await expectRejectedByDatabase(
          tx,
          () => tx.$executeRaw`
            INSERT INTO "recipe_lines" ("id", "recipe_id", "product_id", "percentage", "updated_at")
            VALUES (gen_random_uuid(), ${asUuid(recipeId)}, ${asUuid(productId)}, CAST(${invalido} AS numeric), CURRENT_TIMESTAMP)`,
          `linea con porcentaje ${invalido}`,
        )
        expect(sqlState, `porcentaje ${invalido}`).toBe(CHECK_VIOLATION)
      }
    })
  })
})
