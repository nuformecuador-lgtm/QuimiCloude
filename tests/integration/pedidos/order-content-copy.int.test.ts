/**
 * La copia del contenido de la presentacion en el reparto del pedido (R3), con el flujo REAL de
 * alta y edicion (`createCreateOrder`/`createUpdateOrder`) cableado a mano con los adaptadores
 * driven REALES de `pedidos`, `recetas`, `inventario` y `unidades` -el mismo conjunto que
 * `lib/composition` ata, sin pasar por `lib/composition` para no arrastrar el resto de la
 * aplicacion a un test de dominio-.
 *
 * QC-170: el reparto sustituye a la presentacion UNICA de QC-146. La copia ya no vive en
 * `orders.presentation_content` -esa columna deja de escribirse (R4)- sino en
 * `order_presentation_lines.presentation_content`, una por linea.
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
import { findFinishedGoodsReceipts } from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma'
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
  findBlockedOrderIds,
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
import { findPackagingCostingBatches, findPackagingRefs } from '@/lib/modules/inventario/adapters/driven/persistence/packaging-catalog-prisma';
import type { PackagingCatalog } from '@/lib/modules/inventario';

import { dropPackaging, seedPackaging } from '../../helpers/packaging-seed';

const packagingCatalog: PackagingCatalog = { findRefs: findPackagingRefs, findCostingBatches: findPackagingCostingBatches };

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
  findBlockedIds: findBlockedOrderIds,
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

const products: ProductCatalog = { findRefs: findProductRefs, findCostingBatches, findFinishedGoodsReceipts }

const presentations: PresentationCatalog = {
  findRefs: findPresentationRefs,
  findByNormalizedNames: findPresentationsByNormalizedNames,
}

const units: UnitCatalog = {
  findRefs: findUnitRefs,
  listVisibleRefs: () => Promise.reject(new Error('no se usa')),
  findMassVolumeBridge: () => Promise.reject(new Error('no se usa')),
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
      tools: [],
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

/** Un envase con su presentacion fija, del contenido dado: lo que el reparto nombra. */
async function crearEnvase(
  empresa: Empresa,
  content: string | null,
): Promise<{ readonly presentationId: string; readonly packagingProductId: string }> {
  const presentationId = await crearPresentacion(empresa, content)
  const packagingProductId = await seedPackaging({
    companyId: empresa.companyId,
    presentationId,
    createdBy: empresa.actorId,
  })
  return { presentationId, packagingProductId }
}

async function borrarEnvase(envase: { readonly presentationId: string; readonly packagingProductId: string }): Promise<void> {
  await dropPackaging([envase.packagingProductId])
  await borrarPresentacion(envase.presentationId)
}

async function borrarPedido(orderId: string): Promise<void> {
  await prisma.reservationMovement.deleteMany({ where: { orderId } })
  await prisma.orderPresentationLine.deleteMany({ where: { orderId } })
  await prisma.order.deleteMany({ where: { id: orderId } })
}

/** La copia vigente para UNA presentacion del reparto de un pedido: `null` si esa presentacion
 *  no tiene ninguna linea en ese pedido (R2: a lo sumo una por presentacion). */
async function lineContentCrudo(orderId: string, presentationId: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ presentation_content: string | null }[]>`
    SELECT "presentation_content"::text AS "presentation_content"
      FROM "order_presentation_lines"
     WHERE "order_id" = ${orderId}::uuid AND "presentation_id" = ${presentationId}::uuid`
  return rows[0]?.presentation_content ?? null
}

describe('R3 — el alta copia el contenido de cada presentacion del reparto', () => {
  it('la presentacion del envase tiene contenido: la linea copia ese valor (QC-195 R14)', async () => {
    const recipeId = await crearReceta(A)
    const envase = await crearEnvase(A, '5.0000')
    const alta = createCreateOrder({ recipes, products, units, presentations, packaging: packagingCatalog, unitOfWork })

    const creado = await alta(
      {
        recipeId,
        quantity: '10.0000',
        priority: 'MEDIA',
        unitId: A.unitId,
        presentationLines: [{ packagingProductId: envase.packagingProductId, packages: 1 }],
      },
      actorDe(A),
    )

    try {
      expect(await lineContentCrudo(creado.id, envase.presentationId)).toBe('5.0000')
    } finally {
      await borrarPedido(creado.id)
      await borrarEnvase(envase)
      await borrarReceta(recipeId)
    }
  })

  it('R35: la presentacion del envase NO tiene contenido, rechaza con presentation_without_content y no crea nada (QC-195 R13)', async () => {
    const recipeId = await crearReceta(A)
    const envase = await crearEnvase(A, null)
    const alta = createCreateOrder({ recipes, products, units, presentations, packaging: packagingCatalog, unitOfWork })

    try {
      await expect(
        alta(
          {
            recipeId,
            quantity: '10.0000',
            priority: 'MEDIA',
            unitId: A.unitId,
            presentationLines: [{ packagingProductId: envase.packagingProductId, packages: 1 }],
          },
          actorDe(A),
        ),
      ).rejects.toMatchObject({ code: 'presentation_without_content' })
      expect(await prisma.order.count({ where: { companyId: A.companyId, recipeId } })).toBe(0)
    } finally {
      await borrarEnvase(envase)
      await borrarReceta(recipeId)
    }
  })
})

describe('R3 — la edicion reemplaza el reparto y copia el contenido vigente', () => {
  it('cambiar de envase sustituye la linea por la de su presentacion, con el contenido nuevo (QC-195 R14)', async () => {
    const recipeId = await crearReceta(A)
    const envaseViejo = await crearEnvase(A, '3.0000')
    const envaseNuevo = await crearEnvase(A, '9.0000')
    const presentationVieja = envaseViejo.presentationId
    const presentationNueva = envaseNuevo.presentationId
    const alta = createCreateOrder({ recipes, products, units, presentations, packaging: packagingCatalog, unitOfWork })
    const edicion = createUpdateOrder({ orders, recipes, products, units, presentations, packaging: packagingCatalog, unitOfWork })

    const creado = await alta(
      {
        recipeId,
        quantity: '10.0000',
        priority: 'MEDIA',
        unitId: A.unitId,
        presentationLines: [{ packagingProductId: envaseViejo.packagingProductId, packages: 1 }],
      },
      actorDe(A),
    )

    try {
      expect(await lineContentCrudo(creado.id, presentationVieja)).toBe('3.0000')

      await edicion(
        creado.id,
        {
          recipeId,
          quantity: '10.0000',
          priority: 'MEDIA',
          unitId: A.unitId,
          presentationLines: [{ packagingProductId: envaseNuevo.packagingProductId, packages: 1 }],
        },
        actorDe(A),
      )

      expect(await lineContentCrudo(creado.id, presentationVieja)).toBeNull()
      expect(await lineContentCrudo(creado.id, presentationNueva)).toBe('9.0000')
    } finally {
      await borrarPedido(creado.id)
      await borrarEnvase(envaseViejo)
      await borrarEnvase(envaseNuevo)
      await borrarReceta(recipeId)
    }
  })

  it('editar cantidad, prioridad o receta SIN cambiar el reparto recopia el contenido VIGENTE de la presentacion', async () => {
    const recipeId = await crearReceta(A)
    const otraReceta = await crearReceta(A)
    const envase = await crearEnvase(A, '4.0000')
    const presentationId = envase.presentationId
    // El contenido VIGENTE de la presentacion cambia entre el alta y la edicion: la edicion
    // reemplaza el CONJUNTO de lineas y vuelve a copiar el contenido de HOY (R3), a diferencia
    // de la presentacion unica de QC-146, que solo recopiaba si el id cambiaba.
    const alta = createCreateOrder({ recipes, products, units, presentations, packaging: packagingCatalog, unitOfWork })
    const edicion = createUpdateOrder({ orders, recipes, products, units, presentations, packaging: packagingCatalog, unitOfWork })

    const creado = await alta(
      {
        recipeId,
        quantity: '10.0000',
        priority: 'MEDIA',
        unitId: A.unitId,
        presentationLines: [{ packagingProductId: envase.packagingProductId, packages: 1 }],
      },
      actorDe(A),
    )

    try {
      expect(await lineContentCrudo(creado.id, presentationId)).toBe('4.0000')

      // El contenido nuevo tiene que seguir cabiendo en la cantidad EDITADA (R36): 1 envase de
      // 20 no pasa de 25.
      await prisma.presentation.update({ where: { id: presentationId }, data: { content: '20.0000' } })

      await edicion(
        creado.id,
        {
          recipeId: otraReceta,
          quantity: '25.0000',
          priority: 'CRITICA',
          unitId: A.unitId,
          presentationLines: [{ packagingProductId: envase.packagingProductId, packages: 1 }],
        },
        actorDe(A),
      )

      expect(await lineContentCrudo(creado.id, presentationId)).toBe('20.0000')
    } finally {
      await borrarPedido(creado.id)
      await borrarEnvase(envase)
      await borrarReceta(recipeId)
      await borrarReceta(otraReceta)
    }
  })
})

describe('R3 — cambiar el contenido de la presentacion no toca la copia de un pedido que no se edita', () => {
  it('el alta se hizo con un contenido, la presentacion cambia despues: la copia de la linea no se mueve sin editar', async () => {
    const recipeId = await crearReceta(A)
    const envase = await crearEnvase(A, '1.0000')
    const presentationId = envase.presentationId
    const alta = createCreateOrder({ recipes, products, units, presentations, packaging: packagingCatalog, unitOfWork })

    const creado = await alta(
      {
        recipeId,
        quantity: '10.0000',
        priority: 'MEDIA',
        unitId: A.unitId,
        presentationLines: [{ packagingProductId: envase.packagingProductId, packages: 1 }],
      },
      actorDe(A),
    )

    try {
      expect(await lineContentCrudo(creado.id, presentationId)).toBe('1.0000')

      await prisma.presentation.update({ where: { id: presentationId }, data: { content: '2.0000' } })

      const presentacionDespues = await prisma.presentation.findUniqueOrThrow({
        where: { id: presentationId },
        select: { content: true },
      })
      expect(presentacionDespues.content?.toFixed(4)).toBe('2.0000')
      expect(await lineContentCrudo(creado.id, presentationId)).toBe('1.0000')
    } finally {
      await borrarPedido(creado.id)
      await borrarEnvase(envase)
      await borrarReceta(recipeId)
    }
  })
})
