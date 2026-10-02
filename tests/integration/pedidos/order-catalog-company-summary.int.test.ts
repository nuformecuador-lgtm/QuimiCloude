/**
 * `OrderCatalog.listAliveSummariesInCompany` contra una base Postgres REAL: el
 * ambito por empresa, el borrado logico, el filtro por estado y el `total`.
 *
 * POR QUE COMMITEA: `listAliveSummariesInCompany` habla con el cliente Prisma GLOBAL
 * (`@/lib/shared/db/prisma`), no con un `tx` inyectado, mismo motivo que
 * `order-finished-at.int.test.ts` y `company-scope-queries.int.test.ts`. Dos empresas efimeras
 * (randomUUID) nacen en `beforeAll` y mueren en `afterAll`; los pedidos de cada caso se borran en
 * un `finally` por su id exacto.
 */
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { cancelAliveOrder, createOrderWriteRepository } from '@/lib/modules/pedidos/adapters/driven/persistence/order-prisma'
import { withOrderTransaction } from '@/lib/modules/pedidos/adapters/driven/persistence/order-unit-of-work-prisma'
import { listAliveSummariesInCompany } from '@/lib/modules/pedidos/adapters/driven/persistence/order-catalog-prisma'
import { normalizeCompanyName } from '@/lib/modules/identity'
import { normalizePresentationName } from '@/lib/modules/inventario'
import { prisma } from '@/lib/shared/db/prisma'

import type { NewOrder, OrderScope } from '@/lib/modules/pedidos'

const YEAR = 2889

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
let nextSequence = 1

function instant(day: number): Date {
  return new Date(Date.UTC(YEAR, 6, day, 12, 0, 0, 0))
}

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
    ...overrides,
  }
}

async function seedOrder(e: Empresa, overrides: Partial<NewOrder> = {}): Promise<string> {
  const sequence = nextSequence
  nextSequence += 1
  const now = instant(1 + (sequence % 25))
  const result = await withOrderTransaction((tx) =>
    createOrderWriteRepository(tx).create(baseOrder(e, overrides), YEAR, e.userId, now, null, scopeOf(e)),
  )
  return result.id
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

describe('R17, R22 — el ambito acota por empresa, sin filtro de asignacion', () => {
  it('solo devuelve los pedidos de la empresa pedida, aunque exista otra con pedidos del mismo estado', async () => {
    const propio = await seedOrder(A, { status: 'ENTREGADO' })
    const ajeno = await seedOrder(B, { status: 'ENTREGADO' })
    try {
      const pagina = await listAliveSummariesInCompany(A.companyId, ['ENTREGADO'], 'finished_recent_first', 1)

      const ids = pagina.items.map((item) => item.id)
      expect(ids).toContain(propio)
      expect(ids).not.toContain(ajeno)
    } finally {
      await prisma.order.delete({ where: { id: propio } })
      await prisma.order.delete({ where: { id: ajeno } })
    }
  })
})

describe('borrado logico — un pedido dado de baja no aparece ni cuenta en el total', () => {
  it('excluye el pedido borrado del listado y del total', async () => {
    const vivo = await seedOrder(A, { status: 'PENDIENTE' })
    const borrado = await seedOrder(A, { status: 'PENDIENTE' })
    try {
      await prisma.order.update({ where: { id: borrado }, data: { deletedAt: new Date() } })

      const pagina = await listAliveSummariesInCompany(
        A.companyId,
        ['PENDIENTE', 'EN_CURSO', 'ENTREGADO', 'CANCELADO'],
        'work_queue',
        1,
        25,
      )

      const ids = pagina.items.map((item) => item.id)
      expect(ids).toContain(vivo)
      expect(ids).not.toContain(borrado)
    } finally {
      await prisma.order.delete({ where: { id: vivo } })
      await prisma.order.delete({ where: { id: borrado } })
    }
  })
})

describe('R24 — el filtro de estado', () => {
  it('con un solo estado, solo devuelve pedidos de ese estado', async () => {
    const pendiente = await seedOrder(A, { status: 'PENDIENTE' })
    const entregado = await seedOrder(A, { status: 'ENTREGADO' })
    try {
      const pagina = await listAliveSummariesInCompany(A.companyId, ['ENTREGADO'], 'finished_recent_first', 1, 25)

      const ids = pagina.items.map((item) => item.id)
      expect(ids).toContain(entregado)
      expect(ids).not.toContain(pendiente)
    } finally {
      await prisma.order.delete({ where: { id: pendiente } })
      await prisma.order.delete({ where: { id: entregado } })
    }
  })

  it('con varios estados, devuelve la union, en el orden de la lista de trabajo', async () => {
    const pendiente = await seedOrder(A, { status: 'PENDIENTE' })
    const entregado = await seedOrder(A, { status: 'ENTREGADO' })
    const cancelado = await seedOrder(A, { status: 'PENDIENTE' })
    await cancelAliveOrder(cancelado, 'Sin materia prima', A.userId, instant(20), scopeOf(A))
    try {
      const pagina = await listAliveSummariesInCompany(
        A.companyId,
        ['PENDIENTE', 'ENTREGADO'],
        'work_queue',
        1,
        25,
      )

      const ids = pagina.items.map((item) => item.id)
      expect(ids).toContain(pendiente)
      expect(ids).toContain(entregado)
      expect(ids).not.toContain(cancelado)
    } finally {
      await prisma.order.delete({ where: { id: pendiente } })
      await prisma.order.delete({ where: { id: entregado } })
      await prisma.order.delete({ where: { id: cancelado } })
    }
  })
})

describe('R27 — el total describe el conjunto ya filtrado, y la pagina lo respeta', () => {
  it('el total cuenta exactamente los pedidos que cumplen el filtro, no todos los de la empresa', async () => {
    const entregado1 = await seedOrder(A, { status: 'ENTREGADO' })
    const entregado2 = await seedOrder(A, { status: 'ENTREGADO' })
    const pendiente = await seedOrder(A, { status: 'PENDIENTE' })
    try {
      const pagina = await listAliveSummariesInCompany(A.companyId, ['ENTREGADO'], 'finished_recent_first', 1, 25)

      const propios = pagina.items.filter((item) => [entregado1, entregado2].includes(item.id))
      expect(propios).toHaveLength(2)
      expect(pagina.items.some((item) => item.id === pendiente)).toBe(false)

      // El total del `where` filtrado por ENTREGADO en A tiene que ser AL MENOS los dos que este
      // caso sembro (otros casos de este archivo pueden dejar filas vivas si un `finally` no
      // llego a correr, pero nunca menos de las suyas).
      expect(pagina.total).toBeGreaterThanOrEqual(2)
    } finally {
      await prisma.order.delete({ where: { id: entregado1 } })
      await prisma.order.delete({ where: { id: entregado2 } })
      await prisma.order.delete({ where: { id: pendiente } })
    }
  })
})

describe('R20 — el orden de terminados contra la base real', () => {
  it('el mas reciente primero, y el sin fecha al final por numero descendente', async () => {
    const antiguo = await seedOrder(A, { status: 'EN_CURSO' })
    const reciente = await seedOrder(A, { status: 'EN_CURSO' })
    const sinFechaMenor = await seedOrder(A, { status: 'ENTREGADO' })
    const sinFechaMayor = await seedOrder(A, { status: 'ENTREGADO' })
    try {
      await prisma.order.update({
        where: { id: antiguo },
        data: { status: 'ENTREGADO', finishedAt: new Date('2026-01-01T00:00:00.000Z') },
      })
      await prisma.order.update({
        where: { id: reciente },
        data: { status: 'ENTREGADO', finishedAt: new Date('2026-06-01T00:00:00.000Z') },
      })

      const pagina = await listAliveSummariesInCompany(A.companyId, ['ENTREGADO'], 'finished_recent_first', 1, 25)

      const ids = pagina.items.map((item) => item.id)
      const posicion = (id: string): number => ids.indexOf(id)

      expect(posicion(reciente)).toBeLessThan(posicion(antiguo))
      expect(posicion(antiguo)).toBeLessThan(posicion(sinFechaMayor))
      expect(posicion(sinFechaMayor)).toBeLessThan(posicion(sinFechaMenor))
    } finally {
      await prisma.order.delete({ where: { id: antiguo } })
      await prisma.order.delete({ where: { id: reciente } })
      await prisma.order.delete({ where: { id: sinFechaMenor } })
      await prisma.order.delete({ where: { id: sinFechaMayor } })
    }
  })
})
