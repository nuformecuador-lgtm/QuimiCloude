/**
 * Las restricciones de `orders` que trae `order_conditioning_states`, contra Postgres REAL.
 *
 * Aislamiento: cada `it` corre dentro de una transaccion que termina en `ROLLBACK`, y cada
 * escritura que se espera rechazada va en un SAVEPOINT para poder seguir afirmando despues. Las
 * escrituras son SQL crudo para que el SQLSTATE llegue en `meta.code`; se afirma sobre el
 * SQLSTATE, nunca sobre el texto, porque Postgres puede responder en otro idioma.
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

let savepointSeq = 0
const CHECK_VIOLATION = '23514'
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
  const savepoint = `sp_conditioning_${String(savepointSeq)}`
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

interface Fixtures {
  readonly companyId: string
  readonly recipeId: string
  readonly packerId: string
  readonly conditionerId: string
  readonly otherCompanyUserId: string
}

async function createCompany(tx: Prisma.TransactionClient, label: string): Promise<string> {
  const name = `Empresa ${label} ${token()}`
  const company = await tx.company.create({
    data: { name, nameNormalized: normalizeCompanyName(name) },
    select: { id: true },
  })
  return company.id
}

async function createUser(tx: Prisma.TransactionClient, companyId: string): Promise<string> {
  const marca = token()
  const documentType = await tx.documentType.create({
    data: { code: `DOC${marca.slice(0, 8)}`, name: 'Tipo de documento de prueba' },
    select: { code: true },
  })
  const role = await tx.role.create({
    data: { name: `rol-${marca}`, description: 'Rol de prueba' },
    select: { id: true },
  })
  const user = await tx.user.create({
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
  return user.id
}

async function seedFixtures(tx: Prisma.TransactionClient): Promise<Fixtures> {
  const marca = token()
  const companyId = await createCompany(tx, 'pedido')
  const recipe = await tx.recipe.create({
    data: { name: `Receta ${marca}`, nameNormalized: `receta${marca}`, companyId },
    select: { id: true },
  })
  const packerId = await createUser(tx, companyId)
  const conditionerId = await createUser(tx, companyId)
  const otherCompanyUserId = await createUser(tx, await createCompany(tx, 'ajena'))
  return { companyId, recipeId: recipe.id, packerId, conditionerId, otherCompanyUserId }
}

let nextSequence = 760_000
function freshSequence(): number {
  nextSequence += 1
  return nextSequence
}

type Status =
  | 'PENDIENTE'
  | 'EN_CURSO'
  | 'ENTREGADO'
  | 'CANCELADO'
  | 'POR_EMPACAR'
  | 'EN_EMPAQUE'
  | 'BLOQUEADO'
  | 'POR_ACONDICIONAR'
  | 'EN_ACONDICIONAMIENTO'
  | 'TERMINADO'

interface Row {
  readonly status: Status
  readonly packedBy?: string | null
  readonly conditionedBy?: string | null
  readonly finishedAt?: boolean
  readonly deleted?: boolean
}

/** La fila valida minima de cada estado: cada caso cambia una sola columna sobre ella. */
function validRow(f: Fixtures, status: Status): Row {
  switch (status) {
    case 'EN_EMPAQUE':
    case 'POR_ACONDICIONAR':
      return { status, packedBy: f.packerId }
    case 'EN_ACONDICIONAMIENTO':
      return { status, packedBy: f.packerId, conditionedBy: f.conditionerId }
    case 'TERMINADO':
      return { status, packedBy: f.packerId, conditionedBy: f.conditionerId, finishedAt: true }
    default:
      return { status }
  }
}

function uuidOrNull(id: string | null | undefined): Prisma.Sql {
  return id === null || id === undefined ? Prisma.sql`NULL` : Prisma.sql`CAST(${id} AS uuid)`
}

function rawInsertOrder(tx: Prisma.TransactionClient, f: Fixtures, row: Row): Promise<number> {
  const cancellationReason = row.status === 'CANCELADO' ? Prisma.sql`'motivo de prueba'` : Prisma.sql`NULL`
  return tx.$executeRaw`
    INSERT INTO "orders" (
      "company_id", "order_year", "order_sequence", "recipe_id", "quantity", "status",
      "cancellation_reason", "packed_by", "conditioned_by", "finished_at", "deleted_at", "updated_at"
    ) VALUES (
      CAST(${f.companyId} AS uuid), ${new Date().getUTCFullYear()}, ${freshSequence()},
      CAST(${f.recipeId} AS uuid), CAST('10' AS decimal(14,4)),
      CAST(${row.status} AS "OrderStatus"), ${cancellationReason},
      ${uuidOrNull(row.packedBy)}, ${uuidOrNull(row.conditionedBy)},
      ${row.finishedAt === true ? Prisma.sql`CURRENT_TIMESTAMP` : Prisma.sql`NULL`},
      ${row.deleted === true ? Prisma.sql`CURRENT_TIMESTAMP` : Prisma.sql`NULL`},
      CURRENT_TIMESTAMP
    )`
}

async function expectAccepted(tx: Prisma.TransactionClient, f: Fixtures, row: Row): Promise<void> {
  expect(await rawInsertOrder(tx, f, row), JSON.stringify(row)).toBe(1)
}

async function expectCheckViolation(tx: Prisma.TransactionClient, f: Fixtures, row: Row): Promise<void> {
  const estado = await expectRejectedByDatabase(tx, () => rawInsertOrder(tx, f, row), JSON.stringify(row))
  expect(estado, JSON.stringify(row)).toBe(CHECK_VIOLATION)
}

const CONDITIONING = ['POR_ACONDICIONAR', 'EN_ACONDICIONAMIENTO'] as const

afterAll(async () => {
  await prisma.$disconnect()
})

describe('estados de acondicionamiento: borrado, quien empaca y finished_at', () => {
  it('R24: acepta la fila valida de cada estado de acondicionamiento', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      for (const status of CONDITIONING) await expectAccepted(tx, f, validRow(f, status))
    })
  })

  it('R24: rechaza deleted_at no nulo, packed_by nulo o finished_at no nulo, con SQLSTATE 23514', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      for (const status of CONDITIONING) {
        const base = validRow(f, status)
        await expectCheckViolation(tx, f, { ...base, deleted: true })
        await expectCheckViolation(tx, f, { ...base, packedBy: null })
        await expectCheckViolation(tx, f, { ...base, finishedAt: true })
      }
    })
  })

  it('R24: rechaza el borrado logico de un pedido ya escrito en un estado de acondicionamiento', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      for (const status of CONDITIONING) {
        const id = randomUUID()
        const row = validRow(f, status)
        await tx.order.create({
          data: {
            id,
            companyId: f.companyId,
            orderYear: new Date().getUTCFullYear(),
            orderSequence: freshSequence(),
            recipeId: f.recipeId,
            quantity: new Prisma.Decimal('10'),
            status,
            packedBy: row.packedBy ?? null,
            conditionedBy: row.conditionedBy ?? null,
          },
        })
        const estado = await expectRejectedByDatabase(
          tx,
          () => tx.$executeRaw`UPDATE "orders" SET "deleted_at" = CURRENT_TIMESTAMP WHERE "id" = CAST(${id} AS uuid)`,
          `borrado logico de un pedido ${status}`,
        )
        expect(estado, status).toBe(CHECK_VIOLATION)
        expect((await tx.order.findUniqueOrThrow({ where: { id } })).deletedAt).toBeNull()
      }
    })
  })
})

describe('orders_conditioned_by_matches_status', () => {
  it('R25: exige quien acondiciona en EN_ACONDICIONAMIENTO y en TERMINADO', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      for (const status of ['EN_ACONDICIONAMIENTO', 'TERMINADO'] as const) {
        await expectCheckViolation(tx, f, { ...validRow(f, status), conditionedBy: null })
      }
    })
  })

  it('R25: prohibe quien acondiciona en los estados anteriores al acondicionamiento, en CANCELADO y en BLOQUEADO', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      for (const status of [
        'PENDIENTE',
        'EN_CURSO',
        'POR_EMPACAR',
        'EN_EMPAQUE',
        'POR_ACONDICIONAR',
        'CANCELADO',
        'BLOQUEADO',
      ] as const) {
        const base = validRow(f, status)
        // La fila sin quien acondiciona es valida: el rechazo se debe solo a esa columna.
        await expectAccepted(tx, f, base)
        await expectCheckViolation(tx, f, { ...base, conditionedBy: f.conditionerId })
      }
    })
  })

  it('R25: admite ENTREGADO con y sin quien acondiciona', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      await expectAccepted(tx, f, { status: 'ENTREGADO' })
      await expectAccepted(tx, f, {
        status: 'ENTREGADO',
        packedBy: f.packerId,
        conditionedBy: f.conditionerId,
        finishedAt: true,
      })
    })
  })

  it('R25: rechaza a quien acondiciona de OTRA empresa con SQLSTATE 23503', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const row = { ...validRow(f, 'EN_ACONDICIONAMIENTO'), conditionedBy: f.otherCompanyUserId }
      const estado = await expectRejectedByDatabase(tx, () => rawInsertOrder(tx, f, row), 'acondicionador ajeno')
      expect(estado).toBe(FOREIGN_KEY_VIOLATION)
    })
  })
})

describe('TERMINADO cerrado en la base', () => {
  it('R30: acepta TERMINADO con finished_at, quien empaca y quien acondiciona', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      await expectAccepted(tx, f, validRow(f, 'TERMINADO'))
    })
  })

  it('R30: rechaza TERMINADO sin finished_at, sin quien empaca, sin quien acondiciona o borrado', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const base = validRow(f, 'TERMINADO')
      await expectCheckViolation(tx, f, { ...base, finishedAt: false })
      await expectCheckViolation(tx, f, { ...base, packedBy: null })
      await expectCheckViolation(tx, f, { ...base, conditionedBy: null })
      await expectCheckViolation(tx, f, { ...base, deleted: true })
    })
  })

  it('R30: rechaza finished_at en cualquier estado distinto de TERMINADO y ENTREGADO', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      for (const status of [
        'PENDIENTE',
        'EN_CURSO',
        'POR_EMPACAR',
        'EN_EMPAQUE',
        'POR_ACONDICIONAR',
        'EN_ACONDICIONAMIENTO',
        'CANCELADO',
        'BLOQUEADO',
      ] as const) {
        await expectCheckViolation(tx, f, { ...validRow(f, status), finishedAt: true })
      }
    })
  })

  it('R26, R30: los ENTREGADO de antes siguen siendo validos, con o sin finished_at y packed_by', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      await expectAccepted(tx, f, { status: 'ENTREGADO' })
      await expectAccepted(tx, f, { status: 'ENTREGADO', finishedAt: true })
      await expectAccepted(tx, f, { status: 'ENTREGADO', packedBy: f.packerId })
      await expectAccepted(tx, f, { status: 'ENTREGADO', packedBy: f.packerId, finishedAt: true })
      // Y un EN_EMPAQUE como los de antes: con quien empaca y sin quien acondiciona.
      await expectAccepted(tx, f, validRow(f, 'EN_EMPAQUE'))
    })
  })
})

describe('las filas existentes cumplen las restricciones nuevas', () => {
  it('R26: las restricciones de la migracion estan validadas contra las filas que ya habia', async () => {
    const rows = await prisma.$queryRaw<ReadonlyArray<{ conname: string; convalidated: boolean }>>`
      SELECT conname::text AS conname, convalidated
        FROM pg_constraint
       WHERE conrelid = 'orders'::regclass
         AND conname IN (
           'orders_conditioned_by_matches_status',
           'orders_conditioned_by_company_id_fkey',
           'orders_packed_by_matches_status',
           'orders_delivered_not_deleted',
           'orders_finished_at_requires_delivered',
           'orders_finished_requires_finished_at'
         )
       ORDER BY conname`
    expect(rows.map((row) => row.conname)).toEqual([
      'orders_conditioned_by_company_id_fkey',
      'orders_conditioned_by_matches_status',
      'orders_delivered_not_deleted',
      'orders_finished_at_requires_delivered',
      'orders_finished_requires_finished_at',
      'orders_packed_by_matches_status',
    ])
    // `NOT VALID` dejaria filas antiguas sin comprobar: todas tienen que estar validadas.
    expect(rows.every((row) => row.convalidated)).toBe(true)
  })

  it('R26: ninguna fila de orders incumple las reglas nuevas', async () => {
    const [fila] = await prisma.$queryRaw<ReadonlyArray<{ incumplen: bigint }>>`
      SELECT count(*) AS incumplen
        FROM "orders"
       WHERE ("status"::text IN ('POR_ACONDICIONAR', 'EN_ACONDICIONAMIENTO', 'TERMINADO')
              AND ("deleted_at" IS NOT NULL OR "packed_by" IS NULL))
          OR ("finished_at" IS NOT NULL AND "status"::text NOT IN ('TERMINADO', 'ENTREGADO'))
          OR ("status"::text = 'TERMINADO' AND "finished_at" IS NULL)
          OR ("conditioned_by" IS NOT NULL
              AND "status"::text NOT IN ('EN_ACONDICIONAMIENTO', 'TERMINADO', 'ENTREGADO'))`
    expect(Number(fila?.incumplen)).toBe(0)
  })
})
