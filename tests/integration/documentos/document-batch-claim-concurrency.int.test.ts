/**
 * Contra Postgres real, con la migracion `20260918130000_document_batches_and_files` aplicada.
 *
 * AISLAMIENTO -- `claim` (`document-batch-repository-prisma.ts`) llama al cliente Prisma GLOBAL
 * con un `$queryRaw` suelto, sin abrir su propia transaccion: es exactamente la atomicidad de ESE
 * `UPDATE ... WHERE status='queued' ... RETURNING` lo que este archivo mide, y eso solo existe si
 * dos llamadas concurrentes compiten de verdad por la misma fila con commits reales. Envolver la
 * corrida en una transaccion del test que termina en ROLLBACK (el patron de
 * `document-batches-and-files-constraints.int.test.ts`) no mediria nada: dentro de una unica
 * transaccion no hay dos conexiones compitiendo. Construccion propia con `randomUUID`, escritura
 * real y limpieza por caso en un `finally`, en el orden que exigen las FK (archivo -> tanda ->
 * empresa); ver `tests/integration/aislamiento.json`.
 */
import { randomUUID } from 'node:crypto'

import { afterAll, describe, expect, it } from 'vitest'

import { normalizeCompanyName } from '@/lib/modules/identity'
import { claim } from '@/lib/modules/documentos/adapters/driven/persistence/document-batch-repository-prisma'
import { prisma } from '@/lib/shared/db/prisma'

async function seedQueuedFile(marker: string): Promise<{ companyId: string; batchId: string; fileId: string }> {
  const name = `Empresa claim ${marker}`
  const company = await prisma.company.create({
    data: { name, nameNormalized: normalizeCompanyName(name) },
    select: { id: true },
  })
  const batch = await prisma.documentBatch.create({
    data: { companyId: company.id, strategy: 'catalogo' },
    select: { id: true },
  })
  const file = await prisma.documentFile.create({
    data: { batchId: batch.id, companyId: company.id, path: `empresa/${marker}/archivo.pdf`, status: 'queued' },
    select: { id: true },
  })
  return { companyId: company.id, batchId: batch.id, fileId: file.id }
}

async function cleanup(fixture: { companyId: string; batchId: string; fileId: string }): Promise<void> {
  await prisma.documentFile.deleteMany({ where: { id: fixture.fileId } })
  await prisma.documentBatch.deleteMany({ where: { id: fixture.batchId } })
  await prisma.company.deleteMany({ where: { id: fixture.companyId } })
}

afterAll(async () => {
  await prisma.$disconnect()
})

describe('document-batch-repository-prisma.claim — atomicidad bajo concurrencia (R10)', () => {
  it('de dos claim concurrentes sobre la misma fila, exactamente uno se lleva el RETURNING', async () => {
    const marker = randomUUID().replaceAll('-', '')
    const fixture = await seedQueuedFile(marker)
    try {
      const [first, second] = await Promise.all([
        claim(fixture.fileId, `msg-a-${marker}`),
        claim(fixture.fileId, `msg-b-${marker}`),
      ])

      const winners = [first, second].filter((result) => result !== null)
      const losers = [first, second].filter((result) => result === null)
      expect(winners).toHaveLength(1)
      expect(losers).toHaveLength(1)
      expect(winners[0]).toMatchObject({ id: fixture.fileId, batchId: fixture.batchId, companyId: fixture.companyId })

      const row = await prisma.documentFile.findUniqueOrThrow({
        where: { id: fixture.fileId },
        select: { status: true, attempts: true },
      })
      expect(row.status).toBe('processing')
      expect(row.attempts).toBe(1)
    } finally {
      await cleanup(fixture)
    }
  })

  it('un tercer claim posterior, con la fila ya en processing, tambien devuelve null (R10)', async () => {
    const marker = randomUUID().replaceAll('-', '')
    const fixture = await seedQueuedFile(marker)
    try {
      const first = await claim(fixture.fileId, `msg-a-${marker}`)
      expect(first).not.toBeNull()

      const second = await claim(fixture.fileId, `msg-c-${marker}`)
      expect(second).toBeNull()

      const row = await prisma.documentFile.findUniqueOrThrow({
        where: { id: fixture.fileId },
        select: { status: true, attempts: true },
      })
      expect(row.status).toBe('processing')
      expect(row.attempts).toBe(1)
    } finally {
      await cleanup(fixture)
    }
  })
})
