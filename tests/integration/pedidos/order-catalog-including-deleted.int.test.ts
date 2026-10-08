/**
 * `OrderCatalog.listSummariesByIdsIncludingDeleted` contra una base Postgres REAL: incluye los
 * dados de baja marcados, ordena por numero descendente estable entre paginas, respeta los
 * estados, el `total` cuenta lo filtrado, filtra por parte del numero y no cruza empresas.
 *
 * POR QUE COMMITEA: las dos lecturas del adaptador hablan con el cliente Prisma GLOBAL
 * (`@/lib/shared/db/prisma`), no con un `tx` inyectado, mismo motivo que
 * `order-catalog-company-summary.int.test.ts`. Dos empresas efimeras (randomUUID) nacen en
 * `beforeAll` y mueren en `afterAll`; los pedidos de cada caso se borran en un `finally` por su id
 * exacto. Los numeros se fijan con un `update` de `orderYear`/`orderSequence` tras el alta, para
 * poder elegirlos: la unicidad es por empresa, y las empresas son de este archivo.
 */
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { cancelAliveOrder, createOrderWriteRepository } from '@/lib/modules/pedidos/adapters/driven/persistence/order-prisma'
import { withOrderTransaction } from '@/lib/modules/pedidos/adapters/driven/persistence/order-unit-of-work-prisma'
import { normalizeCompanyName } from '@/lib/modules/identity'
import { normalizePresentationName } from '@/lib/modules/inventario'
import { prisma } from '@/lib/shared/db/prisma'

import type { NewOrder, OrderScope, OrderStatus } from '@/lib/modules/pedidos'
import { realOrderSummaries } from '../../helpers/order-summaries'

const { listSummariesByIdsIncludingDeleted, listAliveSummariesByIds } = realOrderSummaries()

const YEAR = 2890
const TODOS: readonly OrderStatus[] = ['PENDIENTE', 'EN_CURSO', 'POR_EMPACAR', 'EN_EMPAQUE', 'ENTREGADO', 'CANCELADO', 'BLOQUEADO']

function token(): string {
  return randomUUID().replace(/-/gu, '')
}

type Empresa = {
  readonly companyId: string
  readonly userId: string
  readonly roleId: string
  readonly documentTypeCode: string
  readonly presentationId: string
  readonly recipeId: string
  readonly unitId: string
}

async function sembrarEmpresa(etiqueta: string): Promise<Empresa> {
  const marca = token()
  const unit = await prisma.unit.create({
    data: { name: `Unidad ${etiqueta} ${marca}`, nameNormalized: `unidad${marca}`, symbol: `kg${marca}` },
    select: { id: true },
  })
  const documentType = await prisma.documentType.create({
    data: { code: `DOC${marca.slice(0, 8)}`, name: 'Tipo de documento de prueba' },
    select: { code: true },
  })
  const role = await prisma.role.create({
    data: { name: `rol-${marca}`, description: 'Rol de prueba' },
    select: { id: true },
  })
  const company = await prisma.company.create({
    data: { name: `Empresa ${etiqueta} ${marca}`, nameNormalized: normalizeCompanyName(`Empresa ${etiqueta} ${marca}`) },
    select: { id: true },
  })
  const presentation = await prisma.presentation.create({
    data: {
      name: `Bidon ${etiqueta} ${marca}`,
      nameNormalized: normalizePresentationName(`Bidon ${etiqueta} ${marca}`),
      unitId: unit.id,
      companyId: company.id,
    },
    select: { id: true },
  })
  const recipe = await prisma.recipe.create({
    data: { name: `Receta ${etiqueta} ${marca}`, nameNormalized: `receta${marca}`, companyId: company.id },
    select: { id: true },
  })
  const user = await prisma.user.create({
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
      companyId: company.id,
    },
    select: { id: true },
  })
  return {
    companyId: company.id,
    userId: user.id,
    roleId: role.id,
    documentTypeCode: documentType.code,
    presentationId: presentation.id,
    recipeId: recipe.id,
    unitId: unit.id,
  }
}

async function limpiarEmpresa(e: Empresa): Promise<void> {
  await prisma.order.deleteMany({ where: { companyId: e.companyId } })
  await prisma.user.delete({ where: { id: e.userId } })
  await prisma.recipe.delete({ where: { id: e.recipeId } })
  await prisma.presentation.delete({ where: { id: e.presentationId } })
  await prisma.company.delete({ where: { id: e.companyId } })
  await prisma.role.delete({ where: { id: e.roleId } })
  await prisma.documentType.delete({ where: { code: e.documentTypeCode } })
  await prisma.unit.delete({ where: { id: e.unitId } })
}

let A: Empresa
let B: Empresa

function scopeOf(e: Empresa): OrderScope {
  return { companyId: e.companyId }
}

function baseOrder(e: Empresa, overrides: Partial<NewOrder> = {}): NewOrder {
  return {
    recipeId: e.recipeId,
    quantity: '10.0000',
    priority: 'MEDIA',
    status: 'PENDIENTE',
    unitId: e.unitId,
    presentationLines: [],
    customerId: null,
    ...overrides,
  }
}

type Semilla = {
  readonly sequence: number
  readonly year?: number
  readonly status?: 'PENDIENTE' | 'EN_CURSO' | 'ENTREGADO' | 'CANCELADO'
  readonly deleted?: boolean
}

/** Da de alta un pedido en el anio elegido y le fija la secuencia; `CANCELADO` pasa por la
 *  cancelacion real. La base solo deja dar de baja un pedido `PENDIENTE`, `EN_CURSO` o
 *  `BLOQUEADO` (`orders_delivered_not_deleted`), asi que las semillas de baja usan esos. */
async function sembrar(e: Empresa, semilla: Semilla): Promise<string> {
  const status = semilla.status ?? 'EN_CURSO'
  const year = semilla.year ?? YEAR
  const now = new Date(Date.UTC(year, 6, 1, 12, 0, 0, 0))
  const { id } = await withOrderTransaction((tx) =>
    createOrderWriteRepository(tx).create(
      baseOrder(e, { status: status === 'CANCELADO' ? 'PENDIENTE' : status }),
      year,
      e.userId,
      now,
      null,
      scopeOf(e),
    ),
  )
  if (status === 'CANCELADO') await cancelAliveOrder(id, 'Sin materia prima', e.userId, now, scopeOf(e))
  await prisma.order.update({
    where: { id },
    data: {
      orderSequence: semilla.sequence,
      ...(semilla.deleted === true ? { deletedAt: now } : {}),
    },
  })
  return id
}

async function borrar(ids: readonly string[]): Promise<void> {
  await prisma.order.deleteMany({ where: { id: { in: [...ids] } } })
}

beforeAll(async () => {
  A = await sembrarEmpresa('A')
  B = await sembrarEmpresa('B')
})

afterAll(async () => {
  await limpiarEmpresa(A)
  await limpiarEmpresa(B)
  await prisma.$disconnect()
})

describe('listSummariesByIdsIncludingDeleted contra Postgres', () => {
  it('R1, R18: incluye el pedido dado de baja con `deleted: true` y el vivo con `deleted: false`', async () => {
    const vivo = await sembrar(A, { sequence: 9001 })
    const deBaja = await sembrar(A, { sequence: 9002, deleted: true })
    try {
      const pagina = await listSummariesByIdsIncludingDeleted(A.companyId, [vivo, deBaja], TODOS, 1, 25)

      expect(pagina.total).toBe(2)
      expect(pagina.items).toEqual([
        { id: deBaja, number: { year: YEAR, sequence: 9002 }, status: 'EN_CURSO', deleted: true },
        { id: vivo, number: { year: YEAR, sequence: 9001 }, status: 'EN_CURSO', deleted: false },
      ])
      expect(Object.keys(pagina.items[0] ?? {}).sort()).toEqual(['deleted', 'id', 'number', 'status'])
    } finally {
      await borrar([vivo, deBaja])
    }
  })

  it('R4: ordena por numero descendente (anio y secuencia) y es estable entre paginas', async () => {
    const ids = [
      await sembrar(A, { sequence: 9100, year: YEAR - 1 }),
      await sembrar(A, { sequence: 9101 }),
      await sembrar(A, { sequence: 9103, deleted: true }),
      await sembrar(A, { sequence: 9102, status: 'ENTREGADO' }),
      await sembrar(A, { sequence: 9999, year: YEAR - 1 }),
    ]
    try {
      const paginas = [
        await listSummariesByIdsIncludingDeleted(A.companyId, ids, TODOS, 1, 2),
        await listSummariesByIdsIncludingDeleted(A.companyId, ids, TODOS, 2, 2),
        await listSummariesByIdsIncludingDeleted(A.companyId, ids, TODOS, 3, 2),
      ]
      const otraVez = await listSummariesByIdsIncludingDeleted(A.companyId, ids, TODOS, 2, 2)

      expect(paginas.map((p) => p.items.length)).toEqual([2, 2, 1])
      expect(paginas[0]?.totalPages).toBe(3)
      const numeros = paginas.flatMap((p) => p.items.map((item) => `${item.number.year}-${item.number.sequence}`))
      expect(numeros).toEqual([
        `${YEAR}-9103`,
        `${YEAR}-9102`,
        `${YEAR}-9101`,
        `${YEAR - 1}-9999`,
        `${YEAR - 1}-9100`,
      ])
      expect(otraVez.items.map((item) => item.id)).toEqual(paginas[1]?.items.map((item) => item.id))
      expect(new Set(paginas.flatMap((p) => p.items.map((item) => item.id))).size).toBe(5)
    } finally {
      await borrar(ids)
    }
  })

  it('R9: respeta `statuses`: con solo CANCELADO vuelven solo los cancelados; con EN_CURSO, tambien el dado de baja', async () => {
    const cancelado = await sembrar(A, { sequence: 9201, status: 'CANCELADO' })
    const otroCancelado = await sembrar(A, { sequence: 9202, status: 'CANCELADO' })
    const enCurso = await sembrar(A, { sequence: 9203 })
    const enCursoDeBaja = await sembrar(A, { sequence: 9205, deleted: true })
    const entregado = await sembrar(A, { sequence: 9204, status: 'ENTREGADO' })
    const ids = [cancelado, otroCancelado, enCurso, enCursoDeBaja, entregado]
    try {
      const cancelados = await listSummariesByIdsIncludingDeleted(A.companyId, ids, ['CANCELADO'], 1, 25)
      expect(cancelados.items.map((item) => item.id)).toEqual([otroCancelado, cancelado])
      expect(cancelados.items.every((item) => item.status === 'CANCELADO')).toBe(true)
      expect(cancelados.total).toBe(2)

      const enCursos = await listSummariesByIdsIncludingDeleted(A.companyId, ids, ['EN_CURSO'], 1, 25)
      expect(enCursos.items.map((item) => [item.id, item.deleted])).toEqual([
        [enCursoDeBaja, true],
        [enCurso, false],
      ])
      expect(enCursos.total).toBe(2)
    } finally {
      await borrar(ids)
    }
  })

  it('R6: `42` encuentra `-0000042` y `-0000142` (tambien dado de baja) y no `-0000043`', async () => {
    const p42 = await sembrar(A, { sequence: 42 })
    const p142 = await sembrar(A, { sequence: 142, deleted: true })
    const p43 = await sembrar(A, { sequence: 43 })
    const ids = [p42, p142, p43]
    try {
      const pagina = await listSummariesByIdsIncludingDeleted(A.companyId, ids, TODOS, 1, 25, { numberContains: '42' })

      expect(pagina.items.map((item) => item.id)).toEqual([p142, p42])
      expect(pagina.items.map((item) => item.deleted)).toEqual([true, false])
      expect(pagina.total).toBe(2)

      const nada = await listSummariesByIdsIncludingDeleted(A.companyId, ids, TODOS, 1, 25, { numberContains: '-' })
      expect(nada.items).toEqual([])
      expect(nada.total).toBe(0)
    } finally {
      await borrar(ids)
    }
  })

  it('R10: estado y numero se combinan, y `total` y las paginas cuentan solo lo filtrado', async () => {
    const ids = [
      await sembrar(A, { sequence: 4201 }),
      await sembrar(A, { sequence: 4202, deleted: true }),
      await sembrar(A, { sequence: 4203 }),
      await sembrar(A, { sequence: 4204, status: 'CANCELADO' }),
      await sembrar(A, { sequence: 5301 }),
    ]
    try {
      const primera = await listSummariesByIdsIncludingDeleted(A.companyId, ids, ['EN_CURSO'], 1, 2, {
        numberContains: '42',
      })
      const segunda = await listSummariesByIdsIncludingDeleted(A.companyId, ids, ['EN_CURSO'], 2, 2, {
        numberContains: '42',
      })

      expect(primera.total).toBe(3)
      expect(primera.totalPages).toBe(2)
      expect([...primera.items, ...segunda.items].map((item) => item.number.sequence)).toEqual([4203, 4202, 4201])
    } finally {
      await borrar(ids)
    }
  })

  it('R23, R24: no devuelve pedidos de otra empresa, vivos ni dados de baja, aunque su id venga en la lista', async () => {
    const propio = await sembrar(A, { sequence: 9301 })
    const ajenoVivo = await sembrar(B, { sequence: 9302 })
    const ajenoDeBaja = await sembrar(B, { sequence: 9303, deleted: true })
    const ajenoCon42 = await sembrar(B, { sequence: 9342 })
    const ids = [propio, ajenoVivo, ajenoDeBaja, ajenoCon42]
    try {
      const pagina = await listSummariesByIdsIncludingDeleted(A.companyId, ids, TODOS, 1, 25)
      expect(pagina.items.map((item) => item.id)).toEqual([propio])
      expect(pagina.total).toBe(1)

      const filtrada = await listSummariesByIdsIncludingDeleted(A.companyId, ids, TODOS, 1, 25, { numberContains: '93' })
      expect(filtrada.items.map((item) => item.id)).toEqual([propio])
      expect(filtrada.total).toBe(1)
    } finally {
      await borrar(ids)
    }
  })

  it('R1: `listAliveSummariesByIds` sigue excluyendo el dado de baja que el historial si devuelve', async () => {
    const vivo = await sembrar(A, { sequence: 9401 })
    const deBaja = await sembrar(A, { sequence: 9402, deleted: true })
    try {
      const vivos = await listAliveSummariesByIds(A.companyId, [vivo, deBaja], TODOS, 1, 25)
      const historial = await listSummariesByIdsIncludingDeleted(A.companyId, [vivo, deBaja], TODOS, 1, 25)

      expect(vivos.items.map((item) => item.id)).toEqual([vivo])
      expect(historial.items.map((item) => item.id)).toEqual([deBaja, vivo])
    } finally {
      await borrar([vivo, deBaja])
    }
  })
})
