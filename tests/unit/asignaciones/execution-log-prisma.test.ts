// Los dos adaptadores driven del registro de ejecucion, contra un doble del cliente Prisma. Lo que
// hacen contra Postgres lo prueban los tests de integracion; aqui, la forma de lo que envian.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { PrismaClient } from '@prisma/client'
import { OrderExecutionAction } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { transaction } = vi.hoisted(() => ({ transaction: vi.fn() }))
vi.mock('@/lib/shared/db/prisma', () => ({ prisma: { $transaction: transaction } }))

import {
  EXECUTION_ACTION_TO_PRISMA,
  createExecutionLogRepository,
} from '@/lib/modules/asignaciones/adapters/driven/persistence/execution-log-prisma'
import { withExecutionTransaction } from '@/lib/modules/asignaciones/adapters/driven/persistence/execution-transaction-prisma'
import { EXECUTION_ACTIONS, type NewExecutionEntry } from '@/lib/modules/asignaciones/domain/execution-entry'

const COMPANY = '11111111-1111-4111-8111-111111111111'
const ORDER = '22222222-2222-4222-8222-222222222222'
const USER = '33333333-3333-4333-8333-333333333333'
const NOW = new Date('2026-10-06T12:00:00.000Z')

const base = { companyId: COMPANY, orderId: ORDER, userId: USER, occurredAt: NOW } as const

const REGISTRO_ABS = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../lib/modules/asignaciones/adapters/driven/persistence/execution-log-prisma.ts',
)

function clienteDoble() {
  const create = vi.fn().mockResolvedValue({})
  const findFirst = vi.fn().mockResolvedValue(null)
  const db = { orderExecutionEntry: { create, findFirst } } as unknown as PrismaClient
  return { db, create, findFirst }
}

function entradaDe(action: (typeof EXECUTION_ACTIONS)[number]): NewExecutionEntry {
  if (action === 'cancel') return { ...base, action, stepPosition: 2, reason: 'sin material' }
  if (action === 'pack_start' || action === 'pack_finish') return { ...base, action, stepPosition: null }
  return { ...base, action, stepPosition: 3 }
}

describe('execution-log-prisma: el mapa al enum (R1)', () => {
  it('R1: el mapa tiene exactamente ocho pares, uno por accion del dominio', () => {
    expect(Object.keys(EXECUTION_ACTION_TO_PRISMA)).toHaveLength(8)
    expect(Object.keys(EXECUTION_ACTION_TO_PRISMA).sort()).toEqual([...EXECUTION_ACTIONS].sort())
  })

  it('R1: los ocho valores del mapa son los ocho del enum de Prisma, sin repetir', () => {
    expect(new Set(Object.values(EXECUTION_ACTION_TO_PRISMA)).size).toBe(8)
    expect(Object.values(EXECUTION_ACTION_TO_PRISMA).sort()).toEqual(
      [...Object.values(OrderExecutionAction)].sort(),
    )
  })

  it.each(EXECUTION_ACTIONS)('R1: append de %s escribe su valor del enum', async (action) => {
    const { db, create } = clienteDoble()
    await createExecutionLogRepository(db).append(entradaDe(action))
    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0][0].data.action).toBe(action.toUpperCase())
  })
})

describe('execution-log-prisma: append', () => {
  it('R8: cancel escribe su motivo, con occurredAt explicito y la posicion recibida', async () => {
    const { db, create } = clienteDoble()
    await createExecutionLogRepository(db).append({ ...base, action: 'cancel', stepPosition: 2, reason: 'sin material' })
    expect(create).toHaveBeenCalledWith({
      data: {
        companyId: COMPANY,
        orderId: ORDER,
        userId: USER,
        action: 'CANCEL',
        stepPosition: 2,
        reason: 'sin material',
        occurredAt: NOW,
      },
    })
  })

  it('R8: una accion que no es cancel escribe reason null', async () => {
    const { db, create } = clienteDoble()
    await createExecutionLogRepository(db).append({ ...base, action: 'advance', stepPosition: 4 })
    expect(create.mock.calls[0][0].data).toMatchObject({ action: 'ADVANCE', stepPosition: 4, reason: null, occurredAt: NOW })
  })

  it('R5bis: pack_finish escribe stepPosition null', async () => {
    const { db, create } = clienteDoble()
    await createExecutionLogRepository(db).append({ ...base, action: 'pack_finish', stepPosition: null })
    expect(create.mock.calls[0][0].data).toMatchObject({ action: 'PACK_FINISH', stepPosition: null, reason: null })
  })
})

describe('execution-log-prisma: findLastStepPosition (R14)', () => {
  it('R14: la ultima fila con posicion de ese pedido en esa empresa, ordenada por instante e id', async () => {
    const { db, findFirst } = clienteDoble()
    findFirst.mockResolvedValue({ stepPosition: 5 })
    await expect(createExecutionLogRepository(db).findLastStepPosition(COMPANY, ORDER)).resolves.toBe(5)
    expect(findFirst).toHaveBeenCalledWith({
      where: { companyId: COMPANY, orderId: ORDER, stepPosition: { not: null } },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      select: { stepPosition: true },
    })
  })

  it('R14: sin anotaciones con posicion devuelve null', async () => {
    const { db } = clienteDoble()
    await expect(createExecutionLogRepository(db).findLastStepPosition(COMPANY, ORDER)).resolves.toBeNull()
  })
})

describe('execution-log-prisma: solo anexar (R31)', () => {
  it('R31: el archivo del registro no contiene update, upsert ni delete sobre ningun modelo', () => {
    const fuente = readFileSync(REGISTRO_ABS, 'utf8')
    expect(fuente).not.toMatch(/\.\s*(update|updateMany|upsert|delete|deleteMany)\s*\(/)
    expect(fuente).not.toMatch(/\$executeRaw|\$queryRaw|\bUPDATE\b|\bDELETE\b/)
  })

  it('R31: las unicas operaciones sobre orderExecutionEntry son create y findFirst', () => {
    const fuente = readFileSync(REGISTRO_ABS, 'utf8')
    const operaciones = [...fuente.matchAll(/orderExecutionEntry\s*\.\s*(\w+)/g)].map((m) => m[1])
    expect([...new Set(operaciones)].sort()).toEqual(['create', 'findFirst'])
  })
})

describe('execution-transaction-prisma: withExecutionTransaction (R24)', () => {
  beforeEach(() => {
    transaction.mockReset()
  })

  it('R24: abre prisma.$transaction con maxWait 10_000 y timeout 30_000 y devuelve lo que devuelve run', async () => {
    const tx = { marca: 'tx' }
    transaction.mockImplementation((run: (t: unknown) => Promise<unknown>) => run(tx))
    const run = vi.fn().mockResolvedValue('hecho')

    await expect(withExecutionTransaction(run)).resolves.toBe('hecho')
    expect(run).toHaveBeenCalledWith(tx)
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(transaction.mock.calls[0][1]).toEqual({ maxWait: 10_000, timeout: 30_000 })
  })

  it('R24: si run lanza, el error sale tal cual de la transaccion', async () => {
    const fallo = new Error('aborta')
    transaction.mockImplementation((run: (t: unknown) => Promise<unknown>) => run({}))
    await expect(withExecutionTransaction(() => Promise.reject(fallo))).rejects.toBe(fallo)
  })
})
