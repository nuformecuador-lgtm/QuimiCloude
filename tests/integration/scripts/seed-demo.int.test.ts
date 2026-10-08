/**
 * El seed de demostracion contra Postgres real, con el gateway de verdad: los casos de uso de
 * `lib/composition` para escribir y Prisma solo para leer.
 *
 * Commitea: el seed llama a casos de uso que abren sus propias transacciones sobre el cliente
 * global, asi que una transaccion de test con ROLLBACK no los envolveria. Para no tocar la
 * empresa inicial de la plantilla, corre sobre una empresa efimera con su Administrador y la
 * borra entera en `afterAll`, en el orden que exigen las FK.
 */
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ROLE_ADMINISTRADOR, normalizeCompanyName } from '@/lib/modules/identity'
import { prisma } from '@/lib/shared/db/prisma'

import { DEMO_DATASET } from '../../../scripts/seed-demo/data'
import { createPrismaDemoSeedGateway } from '../../../scripts/seed-demo/gateway'
import { runDemoSeed } from '../../../scripts/seed-demo/run'

const CREDENTIALS = {
  operador: 'Demo-Integracion-0p1!',
  empacador: 'Demo-Integracion-Em2!',
  acondicionamiento: 'Demo-Integracion-Ac3!',
}

const marker = randomUUID().slice(0, 8)
let companyId = ''
let adminId = ''

async function countByTable(company: string): Promise<Record<string, number>> {
  const scope = { companyId: company }
  const recipe = { recipe: scope }
  return {
    users: await prisma.user.count({ where: scope }),
    workGroups: await prisma.workGroup.count({ where: scope }),
    workGroupMembers: await prisma.workGroupMember.count({ where: scope }),
    units: await prisma.unit.count({ where: scope }),
    presentations: await prisma.presentation.count({ where: scope }),
    products: await prisma.product.count({ where: scope }),
    productBatches: await prisma.productBatch.count({ where: scope }),
    inventoryMovements: await prisma.inventoryMovement.count({ where: scope }),
    reservationMovements: await prisma.reservationMovement.count({ where: scope }),
    suppliers: await prisma.supplier.count({ where: scope }),
    supplierCatalogLines: await prisma.supplierCatalogLine.count({ where: scope }),
    customers: await prisma.customer.count({ where: scope }),
    recipes: await prisma.recipe.count({ where: scope }),
    recipeLines: await prisma.recipeLine.count({ where: recipe }),
    recipeTools: await prisma.recipeTool.count({ where: recipe }),
    orders: await prisma.order.count({ where: scope }),
    orderPresentationLines: await prisma.orderPresentationLine.count({ where: scope }),
    orderAssignments: await prisma.orderAssignment.count({ where: scope }),
    orderExecutionEntries: await prisma.orderExecutionEntry.count({ where: scope }),
  }
}

async function deleteCompany(company: string): Promise<void> {
  const scope = { companyId: company }
  await prisma.orderExecutionEntry.deleteMany({ where: scope })
  await prisma.orderAssignment.deleteMany({ where: scope })
  await prisma.reservationMovement.deleteMany({ where: scope })
  await prisma.inventoryMovement.deleteMany({ where: scope })
  await prisma.orderPresentationLine.deleteMany({ where: scope })
  await prisma.order.deleteMany({ where: scope })
  await prisma.productBatch.deleteMany({ where: scope })
  await prisma.recipeLine.deleteMany({ where: { recipe: scope } })
  await prisma.recipeTool.deleteMany({ where: { recipe: scope } })
  await prisma.product.deleteMany({ where: scope })
  await prisma.recipe.deleteMany({ where: { ...scope, parentRecipeId: { not: null } } })
  await prisma.recipe.deleteMany({ where: scope })
  await prisma.supplierCatalogLine.deleteMany({ where: scope })
  await prisma.supplier.deleteMany({ where: scope })
  await prisma.customer.deleteMany({ where: scope })
  await prisma.presentation.deleteMany({ where: scope })
  await prisma.unit.deleteMany({ where: scope })
  await prisma.workGroupMember.deleteMany({ where: scope })
  await prisma.workGroup.deleteMany({ where: scope })
  await prisma.user.deleteMany({ where: { ...scope, NOT: { id: adminId } } })
  await prisma.user.deleteMany({ where: scope })
  await prisma.company.delete({ where: { id: company } })
}

beforeAll(async () => {
  const name = `QC230 demo ${marker}`
  const company = await prisma.company.create({
    data: { name, nameNormalized: normalizeCompanyName(name) },
    select: { id: true },
  })
  companyId = company.id
  const role = await prisma.role.findUniqueOrThrow({ where: { name: ROLE_ADMINISTRADOR }, select: { id: true } })
  const admin = await prisma.user.create({
    data: {
      firstNames: 'Admin',
      lastNames: `Seed demo ${marker}`,
      birthDate: new Date('1990-01-01T00:00:00.000Z'),
      email: `admin.${marker}@quimicloude.test`,
      phone: '+57 300 000 0000',
      documentTypeCode: 'CC',
      documentNumber: `QC230-${marker}`,
      username: `admin.qc230.${marker}`,
      passwordHash: 'hash-de-prueba-no-es-un-algoritmo-real',
      roleId: role.id,
      companyId,
      accountStatus: 'active',
    },
    select: { id: true },
  })
  adminId = admin.id
})

afterAll(async () => {
  if (companyId !== '') await deleteCompany(companyId)
  await prisma.$disconnect()
})

describe('seed de demo contra la base real', () => {
  it('dos corridas dejan los mismos conteos por tabla, y la primera deja cada pedido en su estado', async () => {
    const first = await runDemoSeed(createPrismaDemoSeedGateway({ companyId }), DEMO_DATASET, CREDENTIALS)
    const afterFirst = await countByTable(companyId)

    expect(first.warnings.filter((warning) => warning.startsWith('pedido'))).toEqual([])
    expect(afterFirst.orders).toBe(DEMO_DATASET.orders.length)
    expect(afterFirst.users).toBe(DEMO_DATASET.users.length + 1)
    expect(Object.values(afterFirst).every((count) => count > 0)).toBe(true)

    const statuses = await prisma.order.findMany({ where: { companyId }, select: { status: true } })
    expect(statuses.map((row) => row.status).sort()).toEqual(DEMO_DATASET.orders.map((order) => order.target).sort())

    const users = await prisma.user.findMany({
      where: { companyId, username: { startsWith: 'demo.' } },
      select: { accountStatus: true },
    })
    expect(users.every((user) => user.accountStatus === 'active')).toBe(true)

    const second = await runDemoSeed(createPrismaDemoSeedGateway({ companyId }), DEMO_DATASET, CREDENTIALS)

    expect(await countByTable(companyId)).toEqual(afterFirst)
    expect(Object.values(second.created).every((count) => count === 0)).toBe(true)
  }, 180_000)
})
