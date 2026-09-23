/**
 * La fecha de terminado contra una base Postgres REAL, con la migracion
 * `20260923120000_orders_finished_at` aplicada.
 *
 * POR QUE COMMITEA Y NO SE ENVUELVE EN UNA TRANSACCION CON ROLLBACK: `transitionAliveOrder`,
 * `createOrder`, `updateAliveOrder` y `cancelAliveOrder` hablan con el cliente Prisma GLOBAL
 * (`@/lib/shared/db/prisma`), no con un `tx` inyectado -mismo motivo que
 * `order-repository.int.test.ts`-, y `createOrder` ademas abre su PROPIA `prisma.$transaction`
 * con el lock de aviso del correlativo dentro. Envolver la corrida en una transaccion del test
 * seria un aislamiento de mentira: esas llamadas correrian en otra conexion del pool. Cada caso
 * siembra su propio pedido y lo borra en un `finally`, por su `id` exacto.
 *
 * El `CHECK` es la unica excepcion que usa SQL crudo dentro de un `SAVEPOINT`: la escritura
 * se espera que falle y no puede dejar la conexion del caso en un estado abortado para el resto
 * del archivo.
 */
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  cancelAliveOrder,
  createOrder,
  updateAliveOrder,
} from '@/lib/modules/pedidos/adapters/driven/persistence/order-prisma'
import { transitionAliveOrder } from '@/lib/modules/pedidos/adapters/driven/persistence/order-catalog-prisma'
import { normalizeCompanyName } from '@/lib/modules/identity'
import { normalizePresentationName } from '@/lib/modules/inventario'
import { prisma } from '@/lib/shared/db/prisma'

import type { NewOrder, OrderEdit, OrderScope } from '@/lib/modules/pedidos'

/** Un ano de prueba propio, distinto de los que ya usan `order-repository.int.test.ts` y
 *  `order-sequence.int.test.ts`, para que ningun archivo pueda heredar su secuencia. */
const YEAR = 2888

function token(): string {
  return randomUUID().replace(/-/gu, '')
}

let unitId: string
let documentTypeCode: string
let roleId: string
let companyId: string
let presentationId: string
let recipeId: string
let actorId: string

async function seedFixtures(): Promise<void> {
  const marca = token()
  unitId = (
    await prisma.unit.create({
      data: { name: `Unidad ${marca}`, nameNormalized: `unidad${marca}`, symbol: `kg${marca}` },
      select: { id: true },
    })
  ).id
  documentTypeCode = (
    await prisma.documentType.create({
      data: { code: `DOC${marca.slice(0, 8)}`, name: 'Tipo de documento de prueba' },
      select: { code: true },
    })
  ).code
  roleId = (
    await prisma.role.create({
      data: { name: `rol-${marca}`, description: 'Rol de prueba' },
      select: { id: true },
    })
  ).id
  companyId = (
    await prisma.company.create({
      data: { name: `Empresa ${marca}`, nameNormalized: normalizeCompanyName(`Empresa ${marca}`) },
      select: { id: true },
    })
  ).id
  presentationId = (
    await prisma.presentation.create({
      data: {
        name: `Bidon ${marca}`,
        nameNormalized: normalizePresentationName(`Bidon ${marca}`),
        unitId,
        companyId,
      },
      select: { id: true },
    })
  ).id
  recipeId = (
    await prisma.recipe.create({
      data: { name: `Receta ${marca}`, nameNormalized: `receta${marca}`, companyId },
      select: { id: true },
    })
  ).id
  actorId = (
    await prisma.user.create({
      data: {
        firstNames: 'Ana Maria',
        lastNames: 'Perez Gomez',
        birthDate: new Date('1990-05-17T00:00:00.000Z'),
        email: `ana.${marca}@quimicloude.test`,
        phone: '+57 300 111 2233',
        documentTypeCode,
        documentNumber: marca.slice(0, 12),
        username: `ana.${marca}`,
        passwordHash: 'hash-de-prueba-no-es-un-algoritmo-real',
        roleId,
        companyId,
      },
      select: { id: true },
    })
  ).id
}

async function dropFixtures(): Promise<void> {
  await prisma.user.delete({ where: { id: actorId } })
  await prisma.recipe.delete({ where: { id: recipeId } })
  await prisma.presentation.delete({ where: { id: presentationId } })
  await prisma.company.delete({ where: { id: companyId } })
  await prisma.role.delete({ where: { id: roleId } })
  await prisma.documentType.delete({ where: { code: documentTypeCode } })
  await prisma.unit.delete({ where: { id: unitId } })
}

function scope(): OrderScope {
  return { companyId }
}

function instant(day: number): Date {
  return new Date(Date.UTC(YEAR, 5, day, 12, 0, 0, 0))
}

let nextSequence = 1

function baseOrder(overrides: Partial<NewOrder> = {}): NewOrder {
  return {
    recipeId,
    quantity: '10.0000',
    priority: 'MEDIA',
    status: 'PENDIENTE',
    presentationId,
    ...overrides,
  }
}

async function seedOrder(overrides: Partial<NewOrder> = {}): Promise<string> {
  const sequence = nextSequence
  nextSequence += 1
  const now = instant(1 + (sequence % 25))
  const result = await createOrder(baseOrder(overrides), YEAR, actorId, now, null, scope())
  if (result === 'duplicate_number') throw new Error('el alta de siembra choco con un numero duplicado')
  return result.id
}

async function readFinishedAt(id: string): Promise<{ status: string; finishedAt: Date | null }> {
  const row = await prisma.order.findUniqueOrThrow({
    where: { id },
    select: { status: true, finishedAt: true },
  })
  return row
}

beforeAll(async () => {
  const columnas = await prisma.$queryRaw<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'finished_at'`
  if (columnas.length !== 1) {
    throw new Error(
      'la base de pruebas no tiene la columna `orders.finished_at`: falta la migracion ' +
        '`20260923120000_orders_finished_at` de QC-145. Corre `pnpm run db:migrate`.',
    )
  }
  await seedFixtures()
})

afterAll(async () => {
  await dropFixtures()
  await prisma.$disconnect()
})

describe('R3 — Finalizar deja ENTREGADO y finished_at = now, en la misma escritura', () => {
  it('transitionAliveOrder de EN_CURSO a ENTREGADO escribe la fecha del reloj inyectado', async () => {
    const id = await seedOrder({ status: 'EN_CURSO' })
    try {
      const now = new Date(Date.UTC(YEAR, 6, 1, 9, 30, 0, 0))
      const resultado = await transitionAliveOrder(id, companyId, 'EN_CURSO', 'ENTREGADO', actorId, now)
      expect(resultado).toBe('ok')

      const stored = await readFinishedAt(id)
      expect(stored.status).toBe('ENTREGADO')
      expect(stored.finishedAt?.toISOString()).toBe(now.toISOString())
    } finally {
      await prisma.order.delete({ where: { id } })
    }
  })

  it('transitionAliveOrder de PENDIENTE a EN_CURSO NO escribe finished_at', async () => {
    const id = await seedOrder({ status: 'PENDIENTE' })
    try {
      const now = new Date(Date.UTC(YEAR, 6, 2, 9, 30, 0, 0))
      const resultado = await transitionAliveOrder(id, companyId, 'PENDIENTE', 'EN_CURSO', actorId, now)
      expect(resultado).toBe('ok')

      const stored = await readFinishedAt(id)
      expect(stored.status).toBe('EN_CURSO')
      expect(stored.finishedAt).toBeNull()
    } finally {
      await prisma.order.delete({ where: { id } })
    }
  })
})

describe('R2 — un pedido entregado sin pasar por Finalizar no tiene fecha de terminado', () => {
  it('un ENTREGADO sembrado directamente (como los previos a esta ficha) queda con finished_at NULL', async () => {
    const id = await seedOrder({ status: 'ENTREGADO' })
    try {
      const stored = await readFinishedAt(id)
      expect(stored.status).toBe('ENTREGADO')
      expect(stored.finishedAt).toBeNull()
    } finally {
      await prisma.order.delete({ where: { id } })
    }
  })
})

describe('R4 — la base rechaza una fecha de terminado en un pedido que no es ENTREGADO', () => {
  it('un UPDATE crudo que pone finished_at en un pedido PENDIENTE sale con 23514 y no deja rastro', async () => {
    const id = await seedOrder({ status: 'PENDIENTE' })
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SAVEPOINT sp_finished_at_check')
        await expect(
          tx.$executeRaw`UPDATE "orders" SET "finished_at" = CURRENT_TIMESTAMP WHERE "id" = CAST(${id} AS uuid)`,
        ).rejects.toMatchObject({
          code: 'P2010',
          meta: expect.objectContaining({ code: '23514' }),
        })
        await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT sp_finished_at_check')
      })

      const stored = await readFinishedAt(id)
      expect(stored.status).toBe('PENDIENTE')
      expect(stored.finishedAt).toBeNull()
    } finally {
      await prisma.order.delete({ where: { id } })
    }
  })
})

describe('R5, R9 — editar y cancelar no tocan finished_at', () => {
  it('updateAliveOrder no anade ni cambia finished_at', async () => {
    const id = await seedOrder({ status: 'PENDIENTE' })
    try {
      const edit: OrderEdit = {
        recipeId,
        quantity: '20.0000',
        priority: 'ALTA',
        presentationId,
      }
      const resultado = await updateAliveOrder(id, edit, actorId, instant(20), null, scope())
      expect(resultado).toBe('ok')

      const stored = await readFinishedAt(id)
      expect(stored.status).toBe('PENDIENTE')
      expect(stored.finishedAt).toBeNull()
    } finally {
      await prisma.order.delete({ where: { id } })
    }
  })

  it('cancelAliveOrder no anade ni cambia finished_at', async () => {
    const id = await seedOrder({ status: 'PENDIENTE' })
    try {
      const resultado = await cancelAliveOrder(id, 'El cliente rectifico el pedido', actorId, instant(21), scope())
      expect(resultado).toBe('ok')

      const stored = await readFinishedAt(id)
      expect(stored.status).toBe('CANCELADO')
      expect(stored.finishedAt).toBeNull()
    } finally {
      await prisma.order.delete({ where: { id } })
    }
  })
})
