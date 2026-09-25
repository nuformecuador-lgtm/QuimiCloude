/**
 * La copia del contenido de la presentacion en el pedido, con el flujo REAL de alta y
 * edicion (`createCreateOrder`/`createUpdateOrder`) cableado a mano con los
 * adaptadores driven REALES de `pedidos`, `recetas`, `inventario` y `unidades` -el mismo
 * conjunto que `lib/composition` ata, sin pasar por `lib/composition` para no arrastrar el
 * resto de la aplicacion a un test de dominio-.
 *
 * AISLAMIENTO Y LIMPIEZA — mismo criterio que `order-ingredients-cost.int.test.ts`: los tests
 * de `tests/integration/` corren EN SERIE contra UNA base compartida
 * (`vitest.config.mts`, `fileParallelism: false`). Una empresa efimera nace en `beforeAll` y
 * muere en `afterAll`; cada caso siembra su propia receta/pedido y los borra en `finally` por su
 * `id` exacto.
 *
 * Sin producto ni lote: ninguno de los casos de aqui ejercita el coste de ingredientes, asi que
 * la receta se siembra sin lineas.
 */
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { normalizeCompanyName } from '@/lib/modules/identity'
import { findProductRefs, findCostingBatches } from '@/lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma'
import {
  findPresentationRefs,
  findPresentationsByNormalizedNames,
} from '@/lib/modules/inventario/adapters/driven/persistence/presentation-catalog-prisma'
import { createMaterialReservations } from '@/lib/modules/inventario/adapters/driven/persistence/reservation-prisma'
import { createFinishedGoodsIntake } from '@/lib/modules/inventario/adapters/driven/persistence/finished-goods-prisma';
import {
  createOrderWriteRepository,
  findAliveOrderById,
  listAliveOrders,
} from '@/lib/modules/pedidos/adapters/driven/persistence/order-prisma'
import { withOrderTransaction } from '@/lib/modules/pedidos/adapters/driven/persistence/order-unit-of-work-prisma'
import { createRecipe } from '@/lib/modules/recetas/adapters/driven/persistence/recipe-prisma'
import {
  createRecipeExecutionReader,
  findRecipeExecutionContentById,
  findAliveRecipeByNormalizedName,
  findRecipeIdsMatchingName,
  findRecipeRefsIncludingDeleted,
} from '@/lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma'
import { findUnitRefs } from '@/lib/modules/unidades/adapters/driven/persistence/unit-catalog-prisma'
import { findUnitRefsSharingBaseInCompany } from '@/lib/modules/unidades/adapters/driven/persistence/unit-prisma'
import { prisma } from '@/lib/shared/db/prisma'

import { createCreateOrder, createUpdateOrder } from '@/lib/modules/pedidos'

import type { Actor } from '@/lib/modules/pedidos'
import type { PresentationCatalog, ProductCatalog } from '@/lib/modules/inventario'
import type { RecipeCatalog } from '@/lib/modules/recetas'
import type { RecipeScope } from '@/lib/modules/recetas/domain/recipe-scope'
import type { UnitCatalog } from '@/lib/modules/unidades'
import type { OrderRepository } from '@/lib/modules/pedidos/ports/order-repository'
import type { OrderTransactionScope, OrderUnitOfWork } from '@/lib/modules/pedidos/ports/order-unit-of-work'

function token(): string {
  return randomUUID().replace(/-/gu, '')
}

function normalizeForTest(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]/gu, '')
}

// ---------------------------------------------------------------------------
// El cableado REAL: los mismos adaptadores que `lib/composition`, sin componer la app entera.
// ---------------------------------------------------------------------------

const orders: OrderRepository = {
  findAliveById: findAliveOrderById,
  listAlive: listAliveOrders,
}

const unitOfWork: OrderUnitOfWork = {
  run: (work) =>
    withOrderTransaction((tx) => {
      const scope: OrderTransactionScope = {
        orders: createOrderWriteRepository(tx),
        reservations: createMaterialReservations(tx),
        recipes: createRecipeExecutionReader(tx),
        finishedGoods: createFinishedGoodsIntake(tx),
      }
      return work(scope)
    }),
}

const recipes: RecipeCatalog = {
  findRefsIncludingDeleted: findRecipeRefsIncludingDeleted,
  findExecutionContentById: findRecipeExecutionContentById,
  findIdsMatchingName: findRecipeIdsMatchingName,
  findAliveByNormalizedName: findAliveRecipeByNormalizedName,
}

const products: ProductCatalog = { findRefs: findProductRefs, findCostingBatches }

const presentations: PresentationCatalog = {
  findRefs: findPresentationRefs,
  findByNormalizedNames: findPresentationsByNormalizedNames,
}

const units: UnitCatalog = {
  findRefs: findUnitRefs,
  findRefsSharingBaseInCompany: findUnitRefsSharingBaseInCompany,
}

// ---------------------------------------------------------------------------
// Empresa efimera
// ---------------------------------------------------------------------------

type Empresa = {
  readonly companyId: string
  readonly actorId: string
  readonly roleId: string
  readonly documentTypeCode: string
  readonly unitId: string
}

let A: Empresa

async function sembrarEmpresa(): Promise<Empresa> {
  const marca = token()
  const nombre = `Empresa copia-contenido ${marca}`
  const company = await prisma.company.create({
    data: { name: nombre, nameNormalized: normalizeCompanyName(nombre) },
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
  const unit = await prisma.unit.create({
    data: { name: `Unidad ${marca}`, nameNormalized: `unidad${marca}`, symbol: `u${marca}` },
    select: { id: true },
  })
  return {
    companyId: company.id,
    actorId: user.id,
    roleId: role.id,
    documentTypeCode: documentType.code,
    unitId: unit.id,
  }
}

beforeAll(async () => {
  A = await sembrarEmpresa()
})

afterAll(async () => {
  await prisma.unit.delete({ where: { id: A.unitId } })
  await prisma.user.delete({ where: { id: A.actorId } })
  await prisma.role.delete({ where: { id: A.roleId } })
  await prisma.documentType.delete({ where: { code: A.documentTypeCode } })
  await prisma.company.delete({ where: { id: A.companyId } })
  await prisma.$disconnect()
})

// ---------------------------------------------------------------------------
// Ayudantes de siembra por caso
// ---------------------------------------------------------------------------

function actorDe(empresa: Empresa): Actor {
  return { id: empresa.actorId, companyId: empresa.companyId, permissions: ['pedidos.modificar'] }
}

async function crearPresentacion(empresa: Empresa, content: string | null): Promise<string> {
  const marca = token()
  const nombre = `Presentacion ${marca}`
  const presentation = await prisma.presentation.create({
    data: {
      name: nombre,
      nameNormalized: normalizeForTest(nombre),
      unitId: empresa.unitId,
      companyId: empresa.companyId,
      content,
    },
    select: { id: true },
  })
  return presentation.id
}

async function crearReceta(empresa: Empresa): Promise<string> {
  const creada = await createRecipe(
    {
      name: `Receta ${token()}`,
      description: null,
      steps: [],
      lines: [],
      imagePath: null,
    },
    empresa.actorId,
    new Date(),
    { companyId: empresa.companyId } satisfies RecipeScope,
  )
  if (creada === 'duplicate') throw new Error('la receta de prueba choco con un nombre duplicado')
  return creada.id
}

function borrarReceta(recipeId: string): Promise<unknown> {
  return prisma.recipe.deleteMany({ where: { id: recipeId } })
}

function borrarPresentacion(presentationId: string): Promise<unknown> {
  return prisma.presentation.deleteMany({ where: { id: presentationId } })
}

async function borrarPedido(orderId: string): Promise<void> {
  await prisma.reservationMovement.deleteMany({ where: { orderId } })
  await prisma.order.deleteMany({ where: { id: orderId } })
}

async function presentationContentCrudo(orderId: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ presentation_content: string | null }[]>`
    SELECT "presentation_content"::text AS "presentation_content" FROM "orders" WHERE "id" = ${orderId}::uuid`
  const row = rows[0]
  if (row === undefined) throw new Error(`no existe el pedido ${orderId}`)
  return row.presentation_content
}

describe('R38 — el alta copia el contenido de su presentacion', () => {
  it('la presentacion tiene contenido: el pedido copia ese valor', async () => {
    const recipeId = await crearReceta(A)
    const presentationId = await crearPresentacion(A, '5.0000')
    const alta = createCreateOrder({ recipes, products, units, presentations, unitOfWork })

    const creado = await alta(
      { recipeId, quantity: '10.0000', priority: 'MEDIA', presentationId },
      actorDe(A),
    )

    try {
      expect(await presentationContentCrudo(creado.id)).toBe('5.0000')
    } finally {
      await borrarPedido(creado.id)
      await borrarPresentacion(presentationId)
      await borrarReceta(recipeId)
    }
  })

  it('la presentacion NO tiene contenido: el pedido no lleva copia', async () => {
    const recipeId = await crearReceta(A)
    const presentationId = await crearPresentacion(A, null)
    const alta = createCreateOrder({ recipes, products, units, presentations, unitOfWork })

    const creado = await alta(
      { recipeId, quantity: '10.0000', priority: 'MEDIA', presentationId },
      actorDe(A),
    )

    try {
      expect(await presentationContentCrudo(creado.id)).toBeNull()
    } finally {
      await borrarPedido(creado.id)
      await borrarPresentacion(presentationId)
      await borrarReceta(recipeId)
    }
  })
})

describe('R39 — la edicion sustituye la copia solo si cambia de presentacion', () => {
  it('cambiar de presentacion sustituye la copia por el contenido nuevo', async () => {
    const recipeId = await crearReceta(A)
    const presentationVieja = await crearPresentacion(A, '3.0000')
    const presentationNueva = await crearPresentacion(A, '9.0000')
    const alta = createCreateOrder({ recipes, products, units, presentations, unitOfWork })
    const edicion = createUpdateOrder({ orders, recipes, products, units, presentations, unitOfWork })

    const creado = await alta(
      { recipeId, quantity: '10.0000', priority: 'MEDIA', presentationId: presentationVieja },
      actorDe(A),
    )

    try {
      expect(await presentationContentCrudo(creado.id)).toBe('3.0000')

      await edicion(
        creado.id,
        { recipeId, quantity: '10.0000', priority: 'MEDIA', presentationId: presentationNueva },
        actorDe(A),
      )

      expect(await presentationContentCrudo(creado.id)).toBe('9.0000')
    } finally {
      await borrarPedido(creado.id)
      await borrarPresentacion(presentationVieja)
      await borrarPresentacion(presentationNueva)
      await borrarReceta(recipeId)
    }
  })

  it('editar cantidad, prioridad o receta SIN cambiar de presentacion no toca la copia', async () => {
    const recipeId = await crearReceta(A)
    const otraReceta = await crearReceta(A)
    const presentationId = await crearPresentacion(A, '4.0000')
    // El contenido VIGENTE de la presentacion cambia entre el alta y la edicion: si la edicion
    // recopiara sin que el id cambiara, el test lo detectaria.
    const alta = createCreateOrder({ recipes, products, units, presentations, unitOfWork })
    const edicion = createUpdateOrder({ orders, recipes, products, units, presentations, unitOfWork })

    const creado = await alta(
      { recipeId, quantity: '10.0000', priority: 'MEDIA', presentationId },
      actorDe(A),
    )

    try {
      expect(await presentationContentCrudo(creado.id)).toBe('4.0000')

      await prisma.presentation.update({ where: { id: presentationId }, data: { content: '99.0000' } })

      await edicion(
        creado.id,
        { recipeId: otraReceta, quantity: '25.0000', priority: 'CRITICA', presentationId },
        actorDe(A),
      )

      expect(await presentationContentCrudo(creado.id)).toBe('4.0000')
    } finally {
      await borrarPedido(creado.id)
      await borrarPresentacion(presentationId)
      await borrarReceta(recipeId)
      await borrarReceta(otraReceta)
    }
  })
})

describe('R40 — cambiar el contenido de la presentacion no toca la copia de ningun pedido', () => {
  it('el alta se hizo con un contenido, la presentacion cambia despues: la copia del pedido no se mueve', async () => {
    const recipeId = await crearReceta(A)
    const presentationId = await crearPresentacion(A, '1.0000')
    const alta = createCreateOrder({ recipes, products, units, presentations, unitOfWork })

    const creado = await alta(
      { recipeId, quantity: '10.0000', priority: 'MEDIA', presentationId },
      actorDe(A),
    )

    try {
      expect(await presentationContentCrudo(creado.id)).toBe('1.0000')

      await prisma.presentation.update({ where: { id: presentationId }, data: { content: '2.0000' } })

      const presentacionDespues = await prisma.presentation.findUniqueOrThrow({
        where: { id: presentationId },
        select: { content: true },
      })
      expect(presentacionDespues.content?.toFixed(4)).toBe('2.0000')
      expect(await presentationContentCrudo(creado.id)).toBe('1.0000')
    } finally {
      await borrarPedido(creado.id)
      await borrarPresentacion(presentationId)
      await borrarReceta(recipeId)
    }
  })
})
