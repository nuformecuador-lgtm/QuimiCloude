/**
 * Contra Postgres real, con la migracion `20260918130000_document_batches_and_files` aplicada.
 *
 * AISLAMIENTO -- cada caso corre dentro de `prisma.$transaction` interactiva y termina lanzando
 * `RollbackSignal`, asi que ninguna fila escrita sobrevive. Un error de constraint aborta la
 * transaccion entera, asi que cada intento que se espera que falle va dentro de su propio
 * SAVEPOINT. Mismo patron que `tests/integration/inventario/inventory-movements-constraints.int.test.ts`.
 */
import { randomUUID } from 'node:crypto'

import { Prisma } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

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
const UNIQUE_VIOLATION = '23505'

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
 * casos necesitan seguir consultando despues del rechazo.
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
  return randomUUID().replaceAll('-', '')
}

async function createCompany(tx: Prisma.TransactionClient, marker: string): Promise<string> {
  const name = `Empresa ${marker}`
  const company = await tx.company.create({
    data: { name, nameNormalized: normalizeCompanyName(name) },
    select: { id: true },
  })
  return company.id
}

async function createBatch(
  tx: Prisma.TransactionClient,
  companyId: string,
): Promise<string> {
  const batch = await tx.documentBatch.create({
    data: { companyId, strategy: 'catalogo' },
    select: { id: true },
  })
  return batch.id
}

beforeAll(async () => {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'document_files'`
  if (tables.length !== 1) {
    throw new Error(
      'la base de pruebas no tiene aplicada la migracion de QC-111 (tabla `document_files`). ' +
        'Corre `pnpm run db:migrate` antes de estos tests.',
    )
  }
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('document_batches / document_files — restricciones', () => {
  it('rechaza una fila done sin texto con SQLSTATE 23514 (document_files_text_matches_status)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const companyId = await createCompany(tx, marker)
      const batchId = await createBatch(tx, companyId)

      const rejection = await expectRejectedByDatabase(
        tx,
        () =>
          tx.documentFile.create({
            data: {
              batchId,
              companyId,
              path: `empresa/${marker}/archivo.pdf`,
              status: 'done',
            },
          }),
        'fila lista sin texto extraido',
      )
      expect(rejection.sqlState).toBe(CHECK_VIOLATION)
      expect(rejection.message).toContain('document_files_text_matches_status')

      expect(await tx.documentFile.findMany({ where: { batchId }, select: { id: true } })).toEqual([])
    })
  })

  it('rechaza una fila error sin motivo con SQLSTATE 23514 (document_files_error_matches_status)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const companyId = await createCompany(tx, marker)
      const batchId = await createBatch(tx, companyId)

      const rejection = await expectRejectedByDatabase(
        tx,
        () =>
          tx.documentFile.create({
            data: {
              batchId,
              companyId,
              path: `empresa/${marker}/archivo.pdf`,
              status: 'error',
            },
          }),
        'fila en error sin codigo ni motivo',
      )
      expect(rejection.sqlState).toBe(CHECK_VIOLATION)
      expect(rejection.message).toContain('document_files_error_matches_status')

      expect(await tx.documentFile.findMany({ where: { batchId }, select: { id: true } })).toEqual([])
    })
  })

  it('rechaza un archivo cuya tanda es de otra empresa con SQLSTATE 23503 (FK compuesta)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const companyA = await createCompany(tx, `a${marker}`)
      const companyB = await createCompany(tx, `b${marker}`)
      const batchDeA = await createBatch(tx, companyA)

      const rejection = await expectRejectedByDatabase(
        tx,
        () =>
          tx.documentFile.create({
            data: {
              batchId: batchDeA,
              companyId: companyB,
              path: `empresa/${marker}/cruzado.pdf`,
              status: 'queued',
            },
          }),
        'archivo con la tanda de otra empresa',
      )
      expect(rejection.sqlState).toBe(FOREIGN_KEY_VIOLATION)
      expect(rejection.message).toContain('document_files_batch_id_company_id_fkey')

      expect(await tx.documentFile.findMany({ where: { batchId: batchDeA }, select: { id: true } })).toEqual([])
    })
  })

  it('rechaza la ruta repetida en la misma empresa con SQLSTATE 23505 (document_files_company_path_key)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const companyId = await createCompany(tx, marker)
      const batchId = await createBatch(tx, companyId)
      const path = `empresa/${marker}/repetido.pdf`

      await tx.documentFile.create({ data: { batchId, companyId, path, status: 'queued' } })

      const rejection = await expectRejectedByDatabase(
        tx,
        () => tx.documentFile.create({ data: { batchId, companyId, path, status: 'queued' } }),
        'la misma ruta dos veces en la misma empresa',
      )
      expect(rejection.sqlState).toBe(UNIQUE_VIOLATION)
      expect(rejection.message).toContain('document_files_company_path_key')

      expect(await tx.documentFile.findMany({ where: { batchId }, select: { id: true } })).toHaveLength(1)
    })
  })
})
