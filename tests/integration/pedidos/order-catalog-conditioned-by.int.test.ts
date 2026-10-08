/**
 * `OrderCatalog.listAliveSummariesInCompany` con `filter.conditionedBy` contra una base Postgres
 * REAL: el filtro va en la consulta (total y paginacion del conjunto filtrado), un
 * `conditioned_by` nulo no entra, sin filtro nada cambia y el resumen publica `conditionedBy`.
 *
 * Commitea por el mismo motivo que `order-catalog-company-summary.int.test.ts`: los adaptadores
 * hablan con el cliente Prisma GLOBAL. Dos empresas efimeras nacen en `beforeAll` y mueren en
 * `afterAll`; cada caso borra sus pedidos y usuarios en un `finally`.
 */
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createOrderWriteRepository } from '@/lib/modules/pedidos/adapters/driven/persistence/order-prisma'
import { withOrderTransaction } from '@/lib/modules/pedidos/adapters/driven/persistence/order-unit-of-work-prisma'
import { normalizeCompanyName } from '@/lib/modules/identity'
import { prisma } from '@/lib/shared/db/prisma'

import type { NewOrder, OrderStatus } from '@/lib/modules/pedidos'
import { realOrderSummaries } from '../../helpers/order-summaries'

const { listAliveSummariesInCompany } = realOrderSummaries()

const YEAR = 2887

function token(): string {
  return randomUUID().replace(/-/gu, '')
}

type Empresa = {
  readonly companyId: string
  readonly userId: string
  readonly roleId: string
  readonly documentTypeCode: string
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
  const recipe = await prisma.recipe.create({
    data: { name: `Receta ${etiqueta} ${marca}`, nameNormalized: `receta${marca}`, companyId: company.id },
    select: { id: true },
  })
  const userId = await crearUsuario(company.id, role.id, documentType.code, 'Ana Maria')
  return {
    companyId: company.id,
    userId,
    roleId: role.id,
    documentTypeCode: documentType.code,
    recipeId: recipe.id,
    unitId: unit.id,
  }
}

async function crearUsuario(
  companyId: string,
  roleId: string,
  documentTypeCode: string,
  firstNames: string,
): Promise<string> {
  const marca = token()
  const user = await prisma.user.create({
    data: {
      firstNames,
      lastNames: 'Perez Gomez',
      birthDate: new Date('1990-05-17T00:00:00.000Z'),
      email: `u.${marca}@quimicloude.test`,
      phone: '+57 300 111 2233',
      documentTypeCode,
      documentNumber: marca.slice(0, 12),
      username: `u.${marca}`,
      passwordHash: 'hash-de-prueba-no-es-un-algoritmo-real',
      roleId,
      companyId,
    },
    select: { id: true },
  })
  return user.id
}

async function crearAcondicionador(e: Empresa): Promise<string> {
  return crearUsuario(e.companyId, e.roleId, e.documentTypeCode, 'Luz')
}

async function limpiarEmpresa(e: Empresa): Promise<void> {
  await prisma.user.delete({ where: { id: e.userId } })
  await prisma.recipe.delete({ where: { id: e.recipeId } })
  await prisma.company.delete({ where: { id: e.companyId } })
  await prisma.role.delete({ where: { id: e.roleId } })
  await prisma.documentType.delete({ where: { code: e.documentTypeCode } })
  await prisma.unit.delete({ where: { id: e.unitId } })
}

let A: Empresa
let B: Empresa
let nextSequence = 1

function baseOrder(e: Empresa): NewOrder {
  return {
    recipeId: e.recipeId,
    quantity: '10.0000',
    priority: 'MEDIA',
    status: 'PENDIENTE',
    unitId: e.unitId,
    customerId: null,
    presentationLines: [],
  }
}

/**
 * Siembra el pedido en `PENDIENTE` y lo lleva al estado pedido en una sola escritura, cumpliendo
 * los `CHECK` de la tabla: `packed_by` en los estados del acondicionamiento, `conditioned_by` en
 * `EN_ACONDICIONAMIENTO` y `TERMINADO`, y `finished_at` en `TERMINADO`.
 */
async function seedOrder(e: Empresa, status: OrderStatus, conditionedBy: string | null): Promise<string> {
  const sequence = nextSequence
  nextSequence += 1
  const now = new Date(Date.UTC(YEAR, 6, 1 + (sequence % 25), 12, 0, 0, 0))
  const { id } = await withOrderTransaction((tx) =>
    createOrderWriteRepository(tx).create(baseOrder(e), YEAR, e.userId, now, null, { companyId: e.companyId }),
  )
  await prisma.order.update({
    where: { id },
    data: {
      status,
      packedBy: e.userId,
      conditionedBy,
      finishedAt: status === 'TERMINADO' || status === 'ENTREGADO' ? now : null,
    },
  })
  return id
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

describe('R11 — `conditionedBy` filtra en la base, con total y paginacion del conjunto filtrado', () => {
  it('R11: con `conditionedBy` solo vuelven los de esa persona; el total y las paginas cuentan solo esos', async () => {
    const yo = await crearAcondicionador(A)
    const otro = await crearAcondicionador(A)
    const mios = [
      await seedOrder(A, 'TERMINADO', yo),
      await seedOrder(A, 'TERMINADO', yo),
      await seedOrder(A, 'TERMINADO', yo),
    ]
    const delOtro = await seedOrder(A, 'TERMINADO', otro)
    const todos = [...mios, delOtro]
    try {
      const primera = await listAliveSummariesInCompany(A.companyId, ['TERMINADO'], 'finished_recent_first', 1, 2, {
        conditionedBy: yo,
      })
      const segunda = await listAliveSummariesInCompany(A.companyId, ['TERMINADO'], 'finished_recent_first', 2, 2, {
        conditionedBy: yo,
      })

      expect(primera.total).toBe(3)
      expect(primera.totalPages).toBe(2)
      expect(primera.items).toHaveLength(2)
      expect(segunda.items).toHaveLength(1)
      const vistos = [...primera.items, ...segunda.items]
      expect(vistos.map((item) => item.id).sort()).toEqual([...mios].sort())
      expect(vistos.every((item) => item.conditionedBy === yo)).toBe(true)
    } finally {
      await prisma.order.deleteMany({ where: { id: { in: todos } } })
      await prisma.user.deleteMany({ where: { id: { in: [yo, otro] } } })
    }
  })

  it('R11: un `conditioned_by` nulo no entra con el filtro', async () => {
    const yo = await crearAcondicionador(A)
    const mio = await seedOrder(A, 'ENTREGADO', yo)
    const sinAcondicionador = await seedOrder(A, 'ENTREGADO', null)
    try {
      const filtrada = await listAliveSummariesInCompany(A.companyId, ['ENTREGADO'], 'finished_recent_first', 1, 25, {
        conditionedBy: yo,
      })

      expect(filtrada.items.map((item) => item.id)).toEqual([mio])
      expect(filtrada.total).toBe(1)
    } finally {
      await prisma.order.deleteMany({ where: { id: { in: [mio, sinAcondicionador] } } })
      await prisma.user.delete({ where: { id: yo } })
    }
  })

  it('R11: sin filtro, o con un filtro vacio, el resultado es el mismo e incluye a todos', async () => {
    const yo = await crearAcondicionador(A)
    const mio = await seedOrder(A, 'TERMINADO', yo)
    const enCola = await seedOrder(A, 'POR_ACONDICIONAR', null)
    try {
      const estados: OrderStatus[] = ['POR_ACONDICIONAR', 'TERMINADO']
      const sinFiltro = await listAliveSummariesInCompany(A.companyId, estados, 'work_queue', 1, 25)
      const filtroVacio = await listAliveSummariesInCompany(A.companyId, estados, 'work_queue', 1, 25, {})

      expect(filtroVacio).toEqual(sinFiltro)
      const ids = sinFiltro.items.map((item) => item.id)
      expect(ids).toContain(mio)
      expect(ids).toContain(enCola)
    } finally {
      await prisma.order.deleteMany({ where: { id: { in: [mio, enCola] } } })
      await prisma.user.delete({ where: { id: yo } })
    }
  })

  it('R11: el filtro no cruza empresas, quien acondiciona en otra empresa no devuelve nada en esta', async () => {
    const deB = await crearAcondicionador(B)
    const pedidoB = await seedOrder(B, 'TERMINADO', deB)
    try {
      const pagina = await listAliveSummariesInCompany(A.companyId, ['TERMINADO'], 'finished_recent_first', 1, 25, {
        conditionedBy: deB,
      })

      expect(pagina.items).toEqual([])
      expect(pagina.total).toBe(0)
    } finally {
      await prisma.order.delete({ where: { id: pedidoB } })
      await prisma.user.delete({ where: { id: deB } })
    }
  })
})

describe('R7 — el resumen publica quien acondiciona', () => {
  it('R7: `conditionedBy` viaja en el resumen, y es `null` en POR_ACONDICIONAR', async () => {
    const yo = await crearAcondicionador(A)
    const enCola = await seedOrder(A, 'POR_ACONDICIONAR', null)
    const enCurso = await seedOrder(A, 'EN_ACONDICIONAMIENTO', yo)
    try {
      const pagina = await listAliveSummariesInCompany(
        A.companyId,
        ['POR_ACONDICIONAR', 'EN_ACONDICIONAMIENTO'],
        'work_queue',
        1,
        25,
      )

      const porId = new Map(pagina.items.map((item) => [item.id, item]))
      expect(porId.get(enCola)?.conditionedBy).toBeNull()
      expect(porId.get(enCurso)?.conditionedBy).toBe(yo)
    } finally {
      await prisma.order.deleteMany({ where: { id: { in: [enCola, enCurso] } } })
      await prisma.user.delete({ where: { id: yo } })
    }
  })
})
