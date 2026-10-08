/**
 * Las restricciones de `order_execution_entries` contra una base Postgres REAL.
 *
 * Lo que vigila el SQL escrito es el test de esquema de la migracion; aqui se comprueba lo que la
 * base HACE cuando alguien lo intenta.
 *
 * Cada `it` corre dentro de una transaccion interactiva que siempre termina en `ROLLBACK`, y cada
 * operacion que se espera rechazada va en un SAVEPOINT para poder seguir afirmando despues dentro
 * de la misma transaccion. Todo `INSERT` sobre la tabla es SQL crudo: solo asi llega el SQLSTATE en
 * `meta.code`, y se afirma sobre el SQLSTATE, nunca sobre el texto (Postgres responde en espanol en
 * esta maquina).
 *
 * Cada transaccion fabrica sus dos empresas efimeras con nombre irrepetible: nada depende del seed.
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

const CHECK_VIOLATION = '23514'
const FOREIGN_KEY_VIOLATION = '23503'
const INVALID_TEXT_REPRESENTATION = '22P02'

const ACTIONS = [
  'START',
  'RESUME',
  'ADVANCE',
  'GO_BACK',
  'CANCEL',
  'FINISH',
  'PACK_START',
  'PACK_FINISH',
] as const
type Action = (typeof ACTIONS)[number]

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
  const savepoint = `sp_execution_${String(savepointSeq)}`
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

let nextSequence = 820_000

async function createOrder(tx: Prisma.TransactionClient, companyId: string): Promise<string> {
  const marca = token()
  const recipe = await tx.recipe.create({
    data: { name: `Receta ${marca}`, nameNormalized: `receta${marca}`, companyId },
    select: { id: true },
  })
  nextSequence += 1
  const order = await tx.order.create({
    data: {
      companyId,
      orderYear: new Date().getUTCFullYear(),
      orderSequence: nextSequence,
      recipeId: recipe.id,
      quantity: new Prisma.Decimal('10'),
    },
    select: { id: true },
  })
  return order.id
}

interface Company {
  readonly companyId: string
  readonly orderId: string
  readonly userId: string
}

interface Fixtures {
  readonly a: Company
  readonly b: Company
}

async function seedCompany(tx: Prisma.TransactionClient, label: string): Promise<Company> {
  const companyId = await createCompany(tx, label)
  const orderId = await createOrder(tx, companyId)
  const userId = await createUser(tx, companyId)
  return { companyId, orderId, userId }
}

async function seedFixtures(tx: Prisma.TransactionClient): Promise<Fixtures> {
  return { a: await seedCompany(tx, 'A'), b: await seedCompany(tx, 'B') }
}

interface EntryValues {
  readonly companyId: string
  readonly orderId: string
  readonly userId: string
  /** Texto crudo: un valor fuera del enum tiene que llegar a la base tal cual. */
  readonly action: string
  readonly stepPosition: number | null
  readonly reason: string | null
}

function rawInsertEntry(tx: Prisma.TransactionClient, v: EntryValues): Promise<number> {
  return tx.$executeRaw`
    INSERT INTO "order_execution_entries"
      ("company_id", "order_id", "user_id", "action", "step_position", "reason", "occurred_at")
    VALUES (
      CAST(${v.companyId} AS uuid),
      CAST(${v.orderId} AS uuid),
      CAST(${v.userId} AS uuid),
      CAST(${v.action} AS "OrderExecutionAction"),
      CAST(${v.stepPosition} AS integer),
      CAST(${v.reason} AS text),
      CURRENT_TIMESTAMP
    )`
}

/** Fila valida de la empresa A; cada caso cambia solo lo que quiere forzar. */
function entryOf(
  f: Fixtures,
  action: Action | string,
  overrides: Partial<EntryValues> = {},
): EntryValues {
  return {
    companyId: f.a.companyId,
    orderId: f.a.orderId,
    userId: f.a.userId,
    action,
    stepPosition: null,
    reason: action === 'CANCEL' ? 'motivo de prueba' : null,
    ...overrides,
  }
}

async function countEntries(tx: Prisma.TransactionClient, orderId: string): Promise<number> {
  const rows = await tx.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM "order_execution_entries" WHERE "order_id" = CAST(${orderId} AS uuid)`
  return rows[0]?.n ?? 0
}

afterAll(async () => {
  await prisma.$disconnect()
})

describe('order_execution_entries — la accion', () => {
  it('R1: rechaza una accion fuera de las ocho, con SQLSTATE 22P02', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const estado = await expectRejectedByDatabase(
        tx,
        () => rawInsertEntry(tx, entryOf(f, 'PAUSE')),
        'accion PAUSE',
      )
      expect(estado).toBe(INVALID_TEXT_REPRESENTATION)
      expect(await countEntries(tx, f.a.orderId)).toBe(0)
    })
  })

  it('R1: acepta cada una de las ocho acciones', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      for (const action of ACTIONS) {
        expect(await rawInsertEntry(tx, entryOf(f, action)), action).toBe(1)
      }
      expect(await countEntries(tx, f.a.orderId)).toBe(ACTIONS.length)
    })
  })
})

describe('order_execution_entries_reason_matches_action', () => {
  it('R8: rechaza CANCEL sin motivo y ADVANCE con motivo, con SQLSTATE 23514', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const sinMotivo = await expectRejectedByDatabase(
        tx,
        () => rawInsertEntry(tx, entryOf(f, 'CANCEL', { reason: null })),
        'CANCEL sin motivo',
      )
      expect(sinMotivo).toBe(CHECK_VIOLATION)

      const conMotivo = await expectRejectedByDatabase(
        tx,
        () => rawInsertEntry(tx, entryOf(f, 'ADVANCE', { stepPosition: 1, reason: 'no toca' })),
        'ADVANCE con motivo',
      )
      expect(conMotivo).toBe(CHECK_VIOLATION)
      expect(await countEntries(tx, f.a.orderId)).toBe(0)
    })
  })

  it('R8: acepta CANCEL con motivo y ADVANCE sin motivo', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      expect(await rawInsertEntry(tx, entryOf(f, 'CANCEL', { reason: 'se acabo el material' }))).toBe(1)
      expect(await rawInsertEntry(tx, entryOf(f, 'ADVANCE', { stepPosition: 2 }))).toBe(1)
      expect(await countEntries(tx, f.a.orderId)).toBe(2)
    })
  })
})

describe('order_execution_entries_step_position_positive', () => {
  it('R5: rechaza la posicion 0, con SQLSTATE 23514', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const estado = await expectRejectedByDatabase(
        tx,
        () => rawInsertEntry(tx, entryOf(f, 'ADVANCE', { stepPosition: 0 })),
        'ADVANCE en la posicion 0',
      )
      expect(estado).toBe(CHECK_VIOLATION)
      expect(await countEntries(tx, f.a.orderId)).toBe(0)
    })
  })

  it('R5: acepta la posicion 1 y una accion de receta sin posicion (START con NULL)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      expect(await rawInsertEntry(tx, entryOf(f, 'ADVANCE', { stepPosition: 1 }))).toBe(1)
      expect(await rawInsertEntry(tx, entryOf(f, 'START', { stepPosition: null }))).toBe(1)
      expect(await countEntries(tx, f.a.orderId)).toBe(2)
    })
  })
})

describe('order_execution_entries_packing_has_no_step', () => {
  it('R5bis: rechaza PACK_START y PACK_FINISH con posicion, con SQLSTATE 23514', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      for (const action of ['PACK_START', 'PACK_FINISH'] as const) {
        const estado = await expectRejectedByDatabase(
          tx,
          () => rawInsertEntry(tx, entryOf(f, action, { stepPosition: 1 })),
          `${action} con posicion`,
        )
        expect(estado, action).toBe(CHECK_VIOLATION)
      }
      expect(await countEntries(tx, f.a.orderId)).toBe(0)
    })
  })

  it('R5bis: acepta PACK_START y PACK_FINISH con posicion NULL', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      expect(await rawInsertEntry(tx, entryOf(f, 'PACK_START', { stepPosition: null }))).toBe(1)
      expect(await rawInsertEntry(tx, entryOf(f, 'PACK_FINISH', { stepPosition: null }))).toBe(1)
      expect(await countEntries(tx, f.a.orderId)).toBe(2)
    })
  })
})

describe('order_execution_entries — el pedido y la persona', () => {
  it('R6: rechaza un pedido inexistente, con SQLSTATE 23503', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const estado = await expectRejectedByDatabase(
        tx,
        () => rawInsertEntry(tx, entryOf(f, 'START', { orderId: randomUUID() })),
        'pedido inexistente',
      )
      expect(estado).toBe(FOREIGN_KEY_VIOLATION)
    })
  })

  it('R6: acepta un pedido existente de la misma empresa', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      expect(await rawInsertEntry(tx, entryOf(f, 'START'))).toBe(1)
      expect(await countEntries(tx, f.a.orderId)).toBe(1)
    })
  })

  it('R7: rechaza el pedido de la empresa B y la persona de la B en una fila de la A, con SQLSTATE 23503', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      const pedidoAjeno = await expectRejectedByDatabase(
        tx,
        () => rawInsertEntry(tx, entryOf(f, 'START', { orderId: f.b.orderId })),
        'pedido de la empresa B en una fila de la A',
      )
      expect(pedidoAjeno).toBe(FOREIGN_KEY_VIOLATION)

      const personaAjena = await expectRejectedByDatabase(
        tx,
        () => rawInsertEntry(tx, entryOf(f, 'START', { userId: f.b.userId })),
        'persona de la empresa B en una fila de la A',
      )
      expect(personaAjena).toBe(FOREIGN_KEY_VIOLATION)
      expect(await countEntries(tx, f.b.orderId)).toBe(0)
      expect(await countEntries(tx, f.a.orderId)).toBe(0)
    })
  })

  it('R7: acepta pedido y persona de la misma empresa que la fila, en la A y en la B', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx)
      expect(await rawInsertEntry(tx, entryOf(f, 'START'))).toBe(1)
      expect(await rawInsertEntry(tx, entryOf(f, 'START', { ...f.b }))).toBe(1)
      expect(await countEntries(tx, f.a.orderId)).toBe(1)
      expect(await countEntries(tx, f.b.orderId)).toBe(1)
    })
  })
})

describe('order_execution_entries — RLS', () => {
  it('R32: la RLS esta activada y forzada, sin policies', async () => {
    await inRolledBackTransaction(async (tx) => {
      const rls = await tx.$queryRaw<{ relrowsecurity: boolean; relforcerowsecurity: boolean }[]>`
        SELECT relrowsecurity, relforcerowsecurity FROM pg_class
        WHERE relname = 'order_execution_entries' AND relkind = 'r'`
      expect(rls).toEqual([{ relrowsecurity: true, relforcerowsecurity: true }])

      const policies = await tx.$queryRaw<{ n: number }[]>`
        SELECT COUNT(*)::int AS n FROM pg_policies WHERE tablename = 'order_execution_entries'`
      expect(policies).toEqual([{ n: 0 }])
    })
  })

  it('R32: control: la misma consulta ve false si se quita FORCE, dentro de la transaccion revertida', async () => {
    await inRolledBackTransaction(async (tx) => {
      await tx.$executeRawUnsafe('ALTER TABLE "order_execution_entries" NO FORCE ROW LEVEL SECURITY')
      const rls = await tx.$queryRaw<{ relforcerowsecurity: boolean }[]>`
        SELECT relforcerowsecurity FROM pg_class
        WHERE relname = 'order_execution_entries' AND relkind = 'r'`
      expect(rls).toEqual([{ relforcerowsecurity: false }])
    })
  })
})
