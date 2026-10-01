/**
 * Tests de integracion de la migracion `order_packing_states` contra una base Postgres REAL.
 *
 * Los helpers de aislamiento son copia del patron de `pedidos-constraints.int.test.ts`: cada
 * `it` corre dentro de una transaccion que siempre termina en `ROLLBACK`, y toda operacion que
 * se espera que la base rechace se envuelve en un SAVEPOINT para poder seguir afirmando despues
 * del rechazo, dentro de la misma transaccion. Y, por el mismo motivo que ese archivo, TODA
 * operacion que se espera que la base rechace va con `$executeRaw`: solo el SQL crudo propaga el
 * SQLSTATE en `meta.code`, la API tipada lo traduce a su propio codigo y el SQLSTATE se pierde.
 *
 * Se afirma sobre el SQLSTATE, nunca sobre el texto del mensaje: en esta maquina Postgres
 * responde en espanol y los nombres de las restricciones los vigila
 * `tests/unit/pedidos/schema/order-packing-states-migration.test.ts`.
 *
 * Requisitos cubiertos: R1, R3, R8, R28, R46.
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
  const savepoint = `sp_packing_${String(savepointSeq)}`
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
  /** Empacador de la MISMA empresa que el pedido: el unico valor que la FK compuesta admite. */
  readonly packerId: string
  /** Usuario de OTRA empresa, para demostrar que la FK compuesta rechaza el cruce. */
  readonly otherCompanyUserId: string
}

async function createCompany(tx: Prisma.TransactionClient, label: string): Promise<string> {
  const marca = token()
  const name = `Empresa ${label} ${marca}`
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
  const otherCompanyId = await createCompany(tx, 'ajena')
  const otherCompanyUserId = await createUser(tx, otherCompanyId)
  return { companyId, recipeId: recipe.id, packerId, otherCompanyUserId }
}

let nextSequence = 700_000
function freshSequence(): number {
  nextSequence += 1
  return nextSequence
}

function currentUtcYear(): number {
  return new Date().getUTCFullYear()
}

/** Crea un pedido con la API tipada: el camino feliz, cuando no se espera ningun rechazo. */
async function createOrder(
  tx: Prisma.TransactionClient,
  f: Fixtures,
  overrides: Partial<{
    status: 'PENDIENTE' | 'EN_CURSO' | 'ENTREGADO' | 'CANCELADO' | 'POR_EMPACAR' | 'EN_EMPAQUE'
    packedBy: string | null
  }> = {},
): Promise<string> {
  const order = await tx.order.create({
    data: {
      companyId: f.companyId,
      orderYear: currentUtcYear(),
      orderSequence: freshSequence(),
      recipeId: f.recipeId,
      quantity: new Prisma.Decimal('10'),
      status: overrides.status,
      packedBy: overrides.packedBy,
      ...(overrides.status === 'CANCELADO' ? { cancellationReason: 'motivo de prueba' } : {}),
    },
    select: { id: true },
  })
  return order.id
}

/** Valor SQL de un uuid: el parametro llega como texto y hay que castearlo. */
function asUuid(id: string): Prisma.Sql {
  return Prisma.sql`CAST(${id} AS uuid)`
}

/** `INSERT` crudo en `orders`, con lo minimo obligatorio mas lo que cada caso quiere forzar. */
function rawInsertOrder(
  tx: Prisma.TransactionClient,
  f: Fixtures,
  overrides: {
    readonly status: Prisma.Sql
    readonly packedBy?: Prisma.Sql
    readonly finishedAt?: Prisma.Sql
  },
): Promise<number> {
  const columns = [
    Prisma.raw('"company_id"'),
    Prisma.raw('"order_year"'),
    Prisma.raw('"order_sequence"'),
    Prisma.raw('"recipe_id"'),
    Prisma.raw('"quantity"'),
    Prisma.raw('"status"'),
    Prisma.raw('"updated_at"'),
  ]
  const values = [
    asUuid(f.companyId),
    Prisma.sql`${currentUtcYear()}`,
    Prisma.sql`${freshSequence()}`,
    asUuid(f.recipeId),
    Prisma.sql`CAST('10' AS decimal(14,4))`,
    overrides.status,
    Prisma.sql`CURRENT_TIMESTAMP`,
  ]
  if (overrides.packedBy !== undefined) {
    columns.push(Prisma.raw('"packed_by"'))
    values.push(overrides.packedBy)
  }
  if (overrides.finishedAt !== undefined) {
    columns.push(Prisma.raw('"finished_at"'))
    values.push(overrides.finishedAt)
  }
  return tx.$executeRaw`INSERT INTO "orders" (${Prisma.join(columns)}) VALUES (${Prisma.join(values)})`
}

afterAll(async () => {
  await prisma.$disconnect()
})

describe('orders_packed_by_matches_status', () => {
  it('rechaza EN_EMPAQUE sin quien empaca, con SQLSTATE 23514 (R28)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const estado = await expectRejectedByDatabase(
        tx,
        () => rawInsertOrder(tx, f, { status: Prisma.raw(`CAST('EN_EMPAQUE' AS "OrderStatus")`) }),
        'pedido EN_EMPAQUE sin packed_by',
      )
      expect(estado).toBe(CHECK_VIOLATION)
    })
  })

  it('rechaza packed_by fuera de EN_EMPAQUE/ENTREGADO, con SQLSTATE 23514 (R28)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      for (const status of ['PENDIENTE', 'EN_CURSO', 'POR_EMPACAR', 'CANCELADO'] as const) {
        const estado = await expectRejectedByDatabase(
          tx,
          () =>
            rawInsertOrder(tx, f, {
              status: Prisma.raw(`CAST('${status}' AS "OrderStatus")`),
              packedBy: asUuid(f.packerId),
            }),
          `pedido ${status} con packed_by`,
        )
        expect(estado, status).toBe(CHECK_VIOLATION)
      }
    })
  })

  it('acepta EN_EMPAQUE con quien empaca de la MISMA empresa, y ENTREGADO con o sin el (R28)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const enEmpaque = await createOrder(tx, f, { status: 'EN_EMPAQUE', packedBy: f.packerId })
      const stored = await tx.order.findUniqueOrThrow({
        where: { id: enEmpaque },
        select: { status: true, packedBy: true },
      })
      expect(stored.status).toBe('EN_EMPAQUE')
      expect(stored.packedBy).toBe(f.packerId)

      const entregadoConEmpacador = await createOrder(tx, f, {
        status: 'ENTREGADO',
        packedBy: f.packerId,
      })
      expect(
        (await tx.order.findUniqueOrThrow({ where: { id: entregadoConEmpacador } })).packedBy,
      ).toBe(f.packerId)

      const entregadoSinEmpacador = await createOrder(tx, f, { status: 'ENTREGADO' })
      expect(
        (await tx.order.findUniqueOrThrow({ where: { id: entregadoSinEmpacador } })).packedBy,
      ).toBeNull()
    })
  })

  it('rechaza a un empacador de OTRA empresa con SQLSTATE 23503, aunque el estado sea correcto (R28)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const estado = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsertOrder(tx, f, {
            status: Prisma.raw(`CAST('EN_EMPAQUE' AS "OrderStatus")`),
            packedBy: asUuid(f.otherCompanyUserId),
          }),
        'pedido EN_EMPAQUE con empacador de otra empresa',
      )
      expect(estado).toBe(FOREIGN_KEY_VIOLATION)
    })
  })
})

describe('orders_delivered_not_deleted amplia POR_EMPACAR y EN_EMPAQUE', () => {
  it('rechaza el borrado logico de un pedido POR_EMPACAR o EN_EMPAQUE, con SQLSTATE 23514 (R3)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)

      const porEmpacar = await createOrder(tx, f, { status: 'POR_EMPACAR' })
      const rechazoUno = await expectRejectedByDatabase(
        tx,
        () =>
          tx.$executeRaw`UPDATE "orders" SET "deleted_at" = CURRENT_TIMESTAMP WHERE "id" = CAST(${porEmpacar} AS uuid)`,
        'borrado logico de un pedido POR_EMPACAR',
      )
      expect(rechazoUno).toBe(CHECK_VIOLATION)

      const enEmpaque = await createOrder(tx, f, { status: 'EN_EMPAQUE', packedBy: f.packerId })
      const rechazoDos = await expectRejectedByDatabase(
        tx,
        () =>
          tx.$executeRaw`UPDATE "orders" SET "deleted_at" = CURRENT_TIMESTAMP WHERE "id" = CAST(${enEmpaque} AS uuid)`,
        'borrado logico de un pedido EN_EMPAQUE',
      )
      expect(rechazoDos).toBe(CHECK_VIOLATION)

      // Y las dos filas quedan vivas: el rechazo no dejo nada a medias.
      const vivos = await tx.order.findMany({
        where: { id: { in: [porEmpacar, enEmpaque] } },
        select: { deletedAt: true },
      })
      expect(vivos.every((row) => row.deletedAt === null)).toBe(true)
    })
  })
})

describe('orders_finished_at_requires_delivered sigue aplicando en POR_EMPACAR', () => {
  it('rechaza finished_at en un pedido POR_EMPACAR, con SQLSTATE 23514 (R8)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const estado = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsertOrder(tx, f, {
            status: Prisma.raw(`CAST('POR_EMPACAR' AS "OrderStatus")`),
            finishedAt: Prisma.sql`CURRENT_TIMESTAMP`,
          }),
        'pedido POR_EMPACAR con finished_at',
      )
      expect(estado).toBe(CHECK_VIOLATION)
    })
  })
})
