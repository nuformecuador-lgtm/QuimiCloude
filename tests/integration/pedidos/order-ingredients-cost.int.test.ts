/**
 * QC-123 T10 — el importe del pedido, con el flujo REAL de alta y edicion, contra Postgres
 * real: `createCreateOrder`/`createUpdateOrder` del dominio de `pedidos`, cableados a mano con
 * los adaptadores driven REALES de `pedidos`, `recetas`, `inventario` y `unidades` -el mismo
 * conjunto que `lib/composition` ata, sin pasar por `lib/composition` para no arrastrar el
 * resto de la aplicacion (sesion, storage) a un test de dominio-.
 *
 * AISLAMIENTO Y LIMPIEZA — mismo criterio que `order-repository.int.test.ts` y
 * `company-scope-queries.int.test.ts`: los tests de `tests/integration/` corren EN SERIE
 * contra UNA base compartida (`vitest.config.mts`, `fileParallelism: false`). Dos empresas
 * efimeras (`A` para el flujo normal, `Q` para el aislamiento) nacen en `beforeAll` y mueren en
 * `afterAll`; cada caso siembra su propio producto/lote/receta/pedido y los borra en `finally`
 * por su `id` exacto. NINGUNA AFIRMACION GLOBAL sobre cuantas filas hay en una tabla.
 *
 * UNA SOLA UNIDAD, DE SISTEMA, compartida por toda receta, presentacion y lote de este
 * archivo: lo que aqui se prueba es el importe guardado, no la conversion de unidades -eso es
 * `tests/unit/pedidos/order-cost.test.ts`-, asi que todo el archivo evita esa variable
 * usando siempre la misma unidad.
 *
 * SQLSTATE, nunca el texto del mensaje: en esta maquina Postgres responde en espanol.
 */
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { normalizeCompanyName } from '@/lib/modules/identity'
import {
  findProductRefs,
  findCostingBatches,
} from '@/lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma'
import {
  addBatchToAlive,
  createWithFirstBatch,
} from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma'
import {
  createOrderWriteRepository,
  findAliveOrderById,
  listAliveOrders,
} from '@/lib/modules/pedidos/adapters/driven/persistence/order-prisma'
import { withOrderTransaction } from '@/lib/modules/pedidos/adapters/driven/persistence/order-unit-of-work-prisma'
import { createMaterialReservations } from '@/lib/modules/inventario/adapters/driven/persistence/reservation-prisma'
import { createRecipe } from '@/lib/modules/recetas/adapters/driven/persistence/recipe-prisma'
import {
  createRecipeExecutionReader,
  findRecipeExecutionContentById,
  findRecipeIdsMatchingName,
  findRecipeRefsIncludingDeleted,
} from '@/lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma'
import { findPresentationRefs } from '@/lib/modules/inventario/adapters/driven/persistence/presentation-catalog-prisma'
import { findUnitRefs } from '@/lib/modules/unidades/adapters/driven/persistence/unit-catalog-prisma'
import { findUnitRefsSharingBaseInCompany } from '@/lib/modules/unidades/adapters/driven/persistence/unit-prisma'
import { prisma } from '@/lib/shared/db/prisma'

import { createCreateOrder, createUpdateOrder } from '@/lib/modules/pedidos'

import type { Actor, NewOrder, OrderScope } from '@/lib/modules/pedidos'
import type { PresentationCatalog, ProductCatalog } from '@/lib/modules/inventario'
import type { NewProductBatch } from '@/lib/modules/inventario/domain/product-batch'
import type { InventoryScope } from '@/lib/modules/inventario/domain/inventory-scope'
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

// Mismo cableado que `lib/composition` para `orderUnitOfWork`: abre la transaccion compartida
// con `inventario` y ata, sobre el MISMO `tx`, la escritura de `pedidos` y las reservas.
const unitOfWork: OrderUnitOfWork = {
  run: (work) =>
    withOrderTransaction((tx) => {
      const scope: OrderTransactionScope = {
        orders: createOrderWriteRepository(tx),
        reservations: createMaterialReservations(tx),
        recipes: createRecipeExecutionReader(tx),
      }
      return work(scope)
    }),
}

const recipes: RecipeCatalog = {
  findRefsIncludingDeleted: findRecipeRefsIncludingDeleted,
  findExecutionContentById: findRecipeExecutionContentById,
  findIdsMatchingName: findRecipeIdsMatchingName,
}

const products: ProductCatalog = { findRefs: findProductRefs, findCostingBatches }

const presentations: PresentationCatalog = { findRefs: findPresentationRefs }

const units: UnitCatalog = {
  findRefs: findUnitRefs,
  findRefsSharingBaseInCompany: findUnitRefsSharingBaseInCompany,
}

// ---------------------------------------------------------------------------
// Empresas efimeras
// ---------------------------------------------------------------------------

type Empresa = {
  readonly companyId: string
  readonly actorId: string
  readonly roleId: string
  readonly documentTypeCode: string
  readonly presentationId: string
}

let unitId: string
let A: Empresa
let Q: Empresa

async function sembrarUnidadDeSistema(): Promise<string> {
  const marca = token()
  const unit = await prisma.unit.create({
    data: { name: `Unidad ${marca}`, nameNormalized: `unidad${marca}`, symbol: `u${marca}` },
    select: { id: true },
  })
  return unit.id
}

async function sembrarEmpresa(etiqueta: string): Promise<Empresa> {
  const marca = token()
  const nombre = `Empresa ${etiqueta} ${marca}`
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
  const presentationName = `Presentacion ${marca}`
  const presentation = await prisma.presentation.create({
    data: {
      name: presentationName,
      nameNormalized: normalizeForTest(presentationName),
      unitId,
      companyId: company.id,
    },
    select: { id: true },
  })
  return {
    companyId: company.id,
    actorId: user.id,
    roleId: role.id,
    documentTypeCode: documentType.code,
    presentationId: presentation.id,
  }
}

async function borrarEmpresa(empresa: Empresa): Promise<void> {
  await prisma.presentation.delete({ where: { id: empresa.presentationId } })
  await prisma.user.delete({ where: { id: empresa.actorId } })
  await prisma.role.delete({ where: { id: empresa.roleId } })
  await prisma.documentType.delete({ where: { code: empresa.documentTypeCode } })
  await prisma.company.delete({ where: { id: empresa.companyId } })
}

beforeAll(async () => {
  unitId = await sembrarUnidadDeSistema()
  A = await sembrarEmpresa('A')
  Q = await sembrarEmpresa('Q')
})

afterAll(async () => {
  await borrarEmpresa(A)
  await borrarEmpresa(Q)
  await prisma.unit.delete({ where: { id: unitId } })
  await prisma.$disconnect()
})

// ---------------------------------------------------------------------------
// Ayudantes de siembra por caso
// ---------------------------------------------------------------------------

function ambitoDe(empresa: Empresa): OrderScope {
  return { companyId: empresa.companyId }
}

function actorDe(empresa: Empresa): Actor {
  return { id: empresa.actorId, companyId: empresa.companyId, permissions: ['pedidos.modificar'] }
}

function newBatch(empresa: Empresa, overrides: Partial<NewProductBatch> = {}): NewProductBatch {
  return {
    presentationId: empresa.presentationId,
    stock: '10',
    unitCost: '5.0000',
    lot: null,
    purchaseDate: '2026-01-01',
    expiryDate: null,
    createdBy: empresa.actorId,
    ...overrides,
  }
}

async function crearProductoConLote(
  empresa: Empresa,
  overrides: Partial<NewProductBatch> = {},
): Promise<{ readonly productId: string; readonly batchId: string }> {
  const creado = await createWithFirstBatch(
    { name: `Producto ${token()}` },
    newBatch(empresa, overrides),
    new Date(),
    { companyId: empresa.companyId } satisfies InventoryScope,
  )
  return { productId: creado.id, batchId: creado.batchId }
}

/** Una receta con una unica linea al 100 %: la cantidad necesaria queda igual a la del
 *  pedido. La unidad del insumo ya no la guarda la receta: sale de `products.unit_id`, que
 *  el disparador de existencia fija al primer lote sembrado. */
async function crearReceta(empresa: Empresa, productId: string): Promise<string> {
  const creada = await createRecipe(
    {
      name: `Receta ${token()}`,
      description: null,
      steps: [],
      lines: [{ productId, percentage: '100.00' }],
      imagePath: null,
    },
    empresa.actorId,
    new Date(),
    { companyId: empresa.companyId } satisfies RecipeScope,
  )
  if (creada === 'duplicate') throw new Error('la receta de prueba choco con un nombre duplicado')
  return creada.id
}

/**
 * Cada alta de lote escribe su propio asiento de apertura (`writeMovement`,
 * `product-prisma.ts`): `inventory_movements_batch_id_fkey` es `ON DELETE RESTRICT`, asi que
 * los asientos se borran antes que los lotes, y los lotes antes que el producto
 * (`product_batches_product_id_fkey`, tambien `RESTRICT`).
 */
async function borrarProducto(productId: string): Promise<void> {
  const lotes = await prisma.productBatch.findMany({ where: { productId }, select: { id: true } })
  await prisma.inventoryMovement.deleteMany({ where: { batchId: { in: lotes.map((lote) => lote.id) } } })
  await prisma.productBatch.deleteMany({ where: { productId } })
  await prisma.product.deleteMany({ where: { id: productId } })
}

function borrarReceta(recipeId: string): Promise<unknown> {
  return prisma.recipe.deleteMany({ where: { id: recipeId } })
}

/**
 * El alta y la edicion de este archivo pasan por la reserva real -el mismo `unitOfWork` que
 * `lib/composition`-, asi que cada pedido puede haber dejado asientos en
 * `reservation_movements`. `reservation_movements_order_id_fkey` es `RESTRICT`: hay que
 * borrarlos antes que el pedido, igual que `inventory_movements` antes que el lote.
 */
async function borrarPedido(orderId: string): Promise<void> {
  await prisma.reservationMovement.deleteMany({ where: { orderId } })
  await prisma.order.deleteMany({ where: { id: orderId } })
}

/** Coste de la columna, leido con `::text` para no perder ni un decimal ni confundir `NULL`
 *  con `'0.0000'`. */
async function ingredientsCostCrudo(orderId: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ ingredients_cost: string | null }[]>`
    SELECT "ingredients_cost"::text AS "ingredients_cost" FROM "orders" WHERE "id" = ${orderId}::uuid`
  const row = rows[0]
  if (row === undefined) throw new Error(`no existe el pedido ${orderId}`)
  return row.ingredients_cost
}

async function fotoDeInventario(
  empresa: Empresa,
): Promise<{ readonly batches: string; readonly movements: string }> {
  const batches = await prisma.productBatch.findMany({
    where: { companyId: empresa.companyId },
    orderBy: { id: 'asc' },
  })
  const movements = await prisma.inventoryMovement.findMany({
    where: { companyId: empresa.companyId },
    orderBy: { id: 'asc' },
  })
  return { batches: JSON.stringify(batches), movements: JSON.stringify(movements) }
}

// ---------------------------------------------------------------------------

describe('el alta lo deja guardado en la fila (R10)', () => {
  it('calcula el coste con los lotes vigentes y lo persiste en `ingredients_cost`', async () => {
    const { productId } = await crearProductoConLote(A, { stock: '10', unitCost: '5.0000' })
    const recipeId = await crearReceta(A, productId)
    let orderId: string | null = null

    try {
      const alta = createCreateOrder({ recipes, products, units, presentations, unitOfWork, now: () => new Date('2026-05-01T12:00:00.000Z') })
      const creado = await alta({ recipeId, quantity: '6.0000', priority: 'MEDIA', presentationId: A.presentationId }, actorDe(A))
      orderId = creado.id

      // necesaria = 6.0000 * 100 % = 6.0000, cubierta por el unico lote (stock 10, coste 5.0000).
      // importe = 6.0000 * 5.0000 = 30.0000.
      expect(await ingredientsCostCrudo(orderId)).toBe('30.0000')
    } finally {
      if (orderId !== null) await borrarPedido(orderId)
      await borrarReceta(recipeId)
      await borrarProducto(productId)
    }
  })
})

describe('la edicion lo reescribe, incluso a nulo (R11)', () => {
  it('recalcula con los lotes de hoy, y deja el importe en NULL cuando ya no cubre', async () => {
    const { productId } = await crearProductoConLote(A, { stock: '10', unitCost: '5.0000' })
    const recipeId = await crearReceta(A, productId)
    let orderId: string | null = null

    try {
      const now = () => new Date('2026-05-02T12:00:00.000Z')
      const alta = createCreateOrder({ recipes, products, units, presentations, unitOfWork, now })
      const edicion = createUpdateOrder({ orders, recipes, products, units, presentations, unitOfWork, now })

      const creado = await alta({ recipeId, quantity: '4.0000', priority: 'MEDIA', presentationId: A.presentationId }, actorDe(A))
      orderId = creado.id
      // necesaria = 4 * 100 % = 4, cubierta -> 4 * 5 = 20.0000.
      expect(await ingredientsCostCrudo(orderId)).toBe('20.0000')

      // Edicion #1: sube la cantidad sin desbordar la existencia. Recalcula a OTRO numero.
      const editadoInput: NewOrder = { recipeId, quantity: '8.0000', priority: 'MEDIA', status: 'PENDIENTE', presentationId: A.presentationId, presentationContent: null }
      await edicion(orderId, editadoInput, actorDe(A))
      // necesaria = 8 * 100 % = 8, cubierta (stock 10) -> 8 * 5 = 40.0000.
      expect(await ingredientsCostCrudo(orderId)).toBe('40.0000')

      // Edicion #2: sube la cantidad hasta que la existencia YA NO cubre -> sustituye por NULL.
      const editadoSinCubrir: NewOrder = { recipeId, quantity: '200.0000', priority: 'MEDIA', status: 'PENDIENTE', presentationId: A.presentationId, presentationContent: null }
      await edicion(orderId, editadoSinCubrir, actorDe(A))
      expect(await ingredientsCostCrudo(orderId)).toBeNull()
    } finally {
      if (orderId !== null) await borrarPedido(orderId)
      await borrarReceta(recipeId)
      await borrarProducto(productId)
    }
  })
})

describe('comprar un lote despues no cambia el importe de un pedido ya creado (R12)', () => {
  it('un lote nuevo del mismo producto deja el importe guardado intacto', async () => {
    const { productId } = await crearProductoConLote(A, { stock: '10', unitCost: '5.0000' })
    const recipeId = await crearReceta(A, productId)
    let orderId: string | null = null

    try {
      const alta = createCreateOrder({ recipes, products, units, presentations, unitOfWork, now: () => new Date('2026-05-03T12:00:00.000Z') })
      const creado = await alta({ recipeId, quantity: '6.0000', priority: 'MEDIA', presentationId: A.presentationId }, actorDe(A))
      orderId = creado.id
      expect(await ingredientsCostCrudo(orderId)).toBe('30.0000')

      // Un lote nuevo, mas barato y con muchisima existencia: si el importe se recalculara al
      // leer, este lote lo cambiaria de inmediato.
      await addBatchToAlive(
        productId,
        newBatch(A, { stock: '5000', unitCost: '0.5000', purchaseDate: '2026-05-04' }),
        new Date('2026-05-04T12:00:00.000Z'),
        { companyId: A.companyId },
      )

      const releido = await orders.findAliveById(orderId, ambitoDe(A))
      expect(releido?.ingredientsCost).toBe('30.0000')
    } finally {
      if (orderId !== null) await borrarPedido(orderId)
      await borrarReceta(recipeId)
      await borrarProducto(productId)
    }
  })
})

describe('un pedido anterior a la columna sigue sin importe (R8, R13)', () => {
  it('con `ingredients_cost` en NULL por fuera de la aplicacion, leerlo no lo recalcula', async () => {
    const { productId } = await crearProductoConLote(A, { stock: '10', unitCost: '5.0000' })
    const recipeId = await crearReceta(A, productId)
    let orderId: string | null = null

    try {
      const alta = createCreateOrder({ recipes, products, units, presentations, unitOfWork, now: () => new Date('2026-05-05T12:00:00.000Z') })
      const creado = await alta({ recipeId, quantity: '6.0000', priority: 'MEDIA', presentationId: A.presentationId }, actorDe(A))
      orderId = creado.id
      expect(await ingredientsCostCrudo(orderId)).toBe('30.0000')

      // Simula un pedido anterior a la columna: se pone en NULL por fuera de la aplicacion.
      await prisma.$executeRaw`UPDATE "orders" SET "ingredients_cost" = NULL WHERE "id" = ${orderId}::uuid`
      expect(await ingredientsCostCrudo(orderId)).toBeNull()

      // La LECTURA -ficha y listado- no recibe `products` ni `units`: no puede recalcular
      // aunque el lote siga con existencia de sobra.
      const ficha = await orders.findAliveById(orderId, ambitoDe(A))
      expect(ficha?.ingredientsCost).toBeNull()

      const listado = await orders.listAlive(
        { page: 1, pageSize: 25, sort: null, filters: {}, search: '' },
        null,
        ambitoDe(A),
      )
      const enListado = listado.items.find((row) => row.id === orderId)
      expect(enListado?.ingredientsCost).toBeNull()

      // Y la lectura, en si misma, no escribio nada: sigue en NULL.
      expect(await ingredientsCostCrudo(orderId)).toBeNull()
    } finally {
      if (orderId !== null) await borrarPedido(orderId)
      await borrarReceta(recipeId)
      await borrarProducto(productId)
    }
  })
})

describe('un lote de otra empresa no entra en el calculo (R21)', () => {
  it('`findCostingBatches` con el ambito de otra empresa no devuelve el lote, ni por identificador', async () => {
    const { productId } = await crearProductoConLote(Q, { stock: '999', unitCost: '1000.0000' })

    try {
      // Con el AMBITO correcto (Q), el lote SI aparece: control positivo.
      const propio = await products.findCostingBatches([productId], Q.companyId)
      expect(propio.map((batch) => batch.productId)).toContain(productId)

      // Con el ambito de OTRA empresa (A), el MISMO identificador de producto no devuelve nada:
      // ni el lote de Q se cuela en el calculo de A.
      const ajeno = await products.findCostingBatches([productId], A.companyId)
      expect(ajeno).toEqual([])
    } finally {
      await borrarProducto(productId)
    }
  })
})

describe('un pedido de otra empresa no se alcanza ni por identificador (R14, R21)', () => {
  it('la ficha de un pedido de A pedida desde Q es null, y desde A trae el importe', async () => {
    const { productId } = await crearProductoConLote(A, { stock: '10', unitCost: '5.0000' })
    const recipeId = await crearReceta(A, productId)
    let orderId: string | null = null

    try {
      const alta = createCreateOrder({ recipes, products, units, presentations, unitOfWork, now: () => new Date('2026-05-06T12:00:00.000Z') })
      const creado = await alta({ recipeId, quantity: '6.0000', priority: 'MEDIA', presentationId: A.presentationId }, actorDe(A))
      orderId = creado.id

      expect(await orders.findAliveById(orderId, ambitoDe(Q))).toBeNull()

      const propio = await orders.findAliveById(orderId, ambitoDe(A))
      expect(propio?.id).toBe(orderId)
      expect(propio?.ingredientsCost).toBe('30.0000')
    } finally {
      if (orderId !== null) await borrarPedido(orderId)
      await borrarReceta(recipeId)
      await borrarProducto(productId)
    }
  })
})

describe('tras el alta y la edicion, los lotes y los asientos quedan intactos (R22)', () => {
  it('`product_batches` e `inventory_movements` de la empresa son byte a byte iguales', async () => {
    const { productId } = await crearProductoConLote(A, { stock: '10', unitCost: '5.0000' })
    const recipeId = await crearReceta(A, productId)
    let orderId: string | null = null

    try {
      const antesDeAlta = await fotoDeInventario(A)

      const now = () => new Date('2026-05-07T12:00:00.000Z')
      const alta = createCreateOrder({ recipes, products, units, presentations, unitOfWork, now })
      const edicion = createUpdateOrder({ orders, recipes, products, units, presentations, unitOfWork, now })

      const creado = await alta({ recipeId, quantity: '6.0000', priority: 'MEDIA', presentationId: A.presentationId }, actorDe(A))
      orderId = creado.id

      const despuesDeAlta = await fotoDeInventario(A)
      expect(despuesDeAlta.batches).toBe(antesDeAlta.batches)
      expect(despuesDeAlta.movements).toBe(antesDeAlta.movements)

      const editado: NewOrder = { recipeId, quantity: '8.0000', priority: 'ALTA', status: 'PENDIENTE', presentationId: A.presentationId, presentationContent: null }
      await edicion(orderId, editado, actorDe(A))

      const despuesDeEdicion = await fotoDeInventario(A)
      expect(despuesDeEdicion.batches).toBe(antesDeAlta.batches)
      expect(despuesDeEdicion.movements).toBe(antesDeAlta.movements)
    } finally {
      if (orderId !== null) await borrarPedido(orderId)
      await borrarReceta(recipeId)
      await borrarProducto(productId)
    }
  })
})

describe('D22: el importe promedia TODOS los lotes con disponible, sin acumular hasta cubrir (R59, R60, R64)', () => {
  it('30 con A 20@10, B 20@12, C 50@15 -> 370.0000; la reserva sigue tomando solo A y B, nada de C', async () => {
    const { productId, batchId: idA } = await crearProductoConLote(A, {
      stock: '20',
      unitCost: '10.0000',
      lot: `A-${token()}`,
      purchaseDate: '2026-01-01',
    })
    const loteB = await addBatchToAlive(
      productId,
      newBatch(A, { stock: '20', unitCost: '12.0000', lot: `B-${token()}`, purchaseDate: '2026-01-02' }),
      new Date('2026-01-02T00:00:00.000Z'),
      { companyId: A.companyId },
    )
    const loteC = await addBatchToAlive(
      productId,
      newBatch(A, { stock: '50', unitCost: '15.0000', lot: `C-${token()}`, purchaseDate: '2026-01-03' }),
      new Date('2026-01-03T00:00:00.000Z'),
      { companyId: A.companyId },
    )
    if (
      loteB === null ||
      loteB === 'finished_product' ||
      loteC === null ||
      loteC === 'finished_product'
    ) {
      throw new Error('no se pudo sembrar B o C')
    }
    const recipeId = await crearReceta(A, productId)
    let orderId: string | null = null

    try {
      const alta = createCreateOrder({ recipes, products, units, presentations, unitOfWork, now: () => new Date('2026-05-09T12:00:00.000Z') })
      const creado = await alta({ recipeId, quantity: '30.0000', priority: 'MEDIA', presentationId: A.presentationId }, actorDe(A))
      orderId = creado.id

      // promedio simple (10 + 12 + 15) / 3 = 12,333333333333; * 30 = 369,99999999999 -> 370,0000.
      expect(await ingredientsCostCrudo(orderId)).toBe('370.0000')

      const reservas = await prisma.reservationMovement.findMany({
        where: { orderId },
        select: { batchId: true, quantity: true },
      })
      const porLote = new Map(reservas.map((row) => [row.batchId, row.quantity.toFixed(4)]))
      expect(porLote.get(idA)).toBe('20.0000')
      expect(porLote.get(loteB.batchId)).toBe('10.0000')
      expect(porLote.has(loteC.batchId)).toBe(false)
    } finally {
      if (orderId !== null) await borrarPedido(orderId)
      await borrarReceta(recipeId)
      await borrarProducto(productId)
    }
  })

  it('un lote apartado entero por OTRO pedido queda fuera del promedio de este (R60)', async () => {
    const { productId } = await crearProductoConLote(A, {
      stock: '10',
      unitCost: '3.0000',
      lot: `V-${token()}`,
      purchaseDate: '2026-01-01',
    })
    const loteNuevo = await addBatchToAlive(
      productId,
      newBatch(A, { stock: '10', unitCost: '9.0000', lot: `N-${token()}`, purchaseDate: '2026-01-02' }),
      new Date('2026-01-02T00:00:00.000Z'),
      { companyId: A.companyId },
    )
    if (loteNuevo === null || loteNuevo === 'finished_product') {
      throw new Error('no se pudo sembrar el lote nuevo')
    }
    const recipeId = await crearReceta(A, productId)
    let ordenQueApartaTodo: string | null = null
    let ordenBajoPrueba: string | null = null

    try {
      const alta = createCreateOrder({ recipes, products, units, presentations, unitOfWork, now: () => new Date('2026-05-10T12:00:00.000Z') })

      // El primer pedido necesita exactamente lo del lote mas antiguo: lo aparta entero, y ese
      // lote queda con disponible cero para cualquier OTRO pedido.
      const primero = await alta({ recipeId, quantity: '10.0000', priority: 'MEDIA', presentationId: A.presentationId }, actorDe(A))
      ordenQueApartaTodo = primero.id
      // Al crearse, los dos lotes siguen enteros: promedio (3+9)/2=6; 10 * 6 = 60.
      expect(await ingredientsCostCrudo(ordenQueApartaTodo)).toBe('60.0000')

      const segundo = await alta({ recipeId, quantity: '5.0000', priority: 'MEDIA', presentationId: A.presentationId }, actorDe(A))
      ordenBajoPrueba = segundo.id

      // Si el lote agotado entrara en el promedio, saldria (3+9)/2=6 -> 30.0000. Al quedar fuera,
      // el promedio es solo el del lote nuevo: 5 * 9.0000 = 45.0000.
      expect(await ingredientsCostCrudo(ordenBajoPrueba)).toBe('45.0000')

      const reservasDelSegundo = await prisma.reservationMovement.findMany({
        where: { orderId: ordenBajoPrueba },
        select: { batchId: true },
      })
      expect(reservasDelSegundo.map((row) => row.batchId)).toEqual([loteNuevo.batchId])
    } finally {
      if (ordenBajoPrueba !== null) await borrarPedido(ordenBajoPrueba)
      if (ordenQueApartaTodo !== null) await borrarPedido(ordenQueApartaTodo)
      await borrarReceta(recipeId)
      await borrarProducto(productId)
    }
  })

  it('disponible insuficiente aunque la existencia TOTAL alcance deja el pedido sin importe (R61)', async () => {
    const { productId } = await crearProductoConLote(A, { stock: '10', unitCost: '4.0000', purchaseDate: '2026-01-01' })
    const recipeId = await crearReceta(A, productId)
    let ordenQueAparta: string | null = null
    let ordenBajoPrueba: string | null = null

    try {
      const alta = createCreateOrder({ recipes, products, units, presentations, unitOfWork, now: () => new Date('2026-05-11T12:00:00.000Z') })

      // Aparta 8 de los 10: quedan solo 2 disponibles, aunque la existencia total siga siendo 10.
      const primero = await alta({ recipeId, quantity: '8.0000', priority: 'MEDIA', presentationId: A.presentationId }, actorDe(A))
      ordenQueAparta = primero.id

      const segundo = await alta({ recipeId, quantity: '3.0000', priority: 'MEDIA', presentationId: A.presentationId }, actorDe(A))
      ordenBajoPrueba = segundo.id

      expect(await ingredientsCostCrudo(ordenBajoPrueba)).toBeNull()
    } finally {
      if (ordenBajoPrueba !== null) await borrarPedido(ordenBajoPrueba)
      if (ordenQueAparta !== null) await borrarPedido(ordenQueAparta)
      await borrarReceta(recipeId)
      await borrarProducto(productId)
    }
  })

  it('un lote de maquina sin presentacion ni coste, con disponible, no contamina el promedio (R66)', async () => {
    const { productId, batchId: idConCoste } = await crearProductoConLote(A, {
      stock: '10',
      unitCost: '5.0000',
      lot: `X-${token()}`,
      purchaseDate: '2026-01-01',
    })
    const loteMaquina = await addBatchToAlive(
      productId,
      newBatch(A, {
        presentationId: null,
        unitCost: null,
        stock: '1000',
        lot: `M-${token()}`,
        purchaseDate: '2026-01-02',
      }),
      new Date('2026-01-02T00:00:00.000Z'),
      { companyId: A.companyId },
    )
    if (loteMaquina === null) throw new Error('no se pudo sembrar el lote de maquina')
    const recipeId = await crearReceta(A, productId)
    let orderId: string | null = null

    try {
      const alta = createCreateOrder({ recipes, products, units, presentations, unitOfWork, now: () => new Date('2026-05-12T12:00:00.000Z') })
      const creado = await alta({ recipeId, quantity: '10.0000', priority: 'MEDIA', presentationId: A.presentationId }, actorDe(A))
      orderId = creado.id

      // Si el lote de maquina entrara en el promedio, sobraria disponible de sobra (10 + 1000) y
      // el coste promediaria dos costes distintos. Al quedar fuera de `findCostingBatches`, el
      // importe sale solo del lote con coste: 10 * 5.0000 = 50.0000.
      expect(await ingredientsCostCrudo(orderId)).toBe('50.0000')

      const reservas = await prisma.reservationMovement.findMany({
        where: { orderId },
        select: { batchId: true },
      })
      expect(reservas.map((row) => row.batchId)).toEqual([idConCoste])
    } finally {
      if (orderId !== null) await borrarPedido(orderId)
      await borrarReceta(recipeId)
      await borrarProducto(productId)
    }
  })

  it('un lote de maquina sin presentacion ni coste, aunque cubriria por si solo, no cuenta en la cobertura (R66)', async () => {
    const { productId } = await crearProductoConLote(A, {
      stock: '3',
      unitCost: '5.0000',
      lot: `X-${token()}`,
      purchaseDate: '2026-01-01',
    })
    const loteMaquina = await addBatchToAlive(
      productId,
      newBatch(A, {
        presentationId: null,
        unitCost: null,
        stock: '1000',
        lot: `M-${token()}`,
        purchaseDate: '2026-01-02',
      }),
      new Date('2026-01-02T00:00:00.000Z'),
      { companyId: A.companyId },
    )
    if (loteMaquina === null) throw new Error('no se pudo sembrar el lote de maquina')
    const recipeId = await crearReceta(A, productId)
    let orderId: string | null = null

    try {
      const alta = createCreateOrder({ recipes, products, units, presentations, unitOfWork, now: () => new Date('2026-05-13T12:00:00.000Z') })
      const creado = await alta({ recipeId, quantity: '10.0000', priority: 'MEDIA', presentationId: A.presentationId }, actorDe(A))
      orderId = creado.id

      // El lote de maquina, sin coste, tiene disponible de sobra (1000) para cubrir la necesidad
      // de 10 el solo, pero `findCostingBatches` lo deja fuera: el unico disponible que cuenta es
      // el del lote con coste (3), que no alcanza -> sin importe.
      expect(await ingredientsCostCrudo(orderId)).toBeNull()
    } finally {
      if (orderId !== null) await borrarPedido(orderId)
      await borrarReceta(recipeId)
      await borrarProducto(productId)
    }
  })
})

describe('el pedido queda creado con el importe en blanco y la base no lanza 22003 (R24)', () => {
  it('un coste que desborda `Decimal(14,4)` no aborta el alta', async () => {
    // Un lote al maximo de `Decimal(14,4)`: la linea necesita exactamente ese stock, asi que
    // el importe es `necesaria * unit_cost`, muy por encima de lo que la columna admite.
    const { productId } = await crearProductoConLote(A, { stock: '100', unitCost: '9999999999.9999' })
    const recipeId = await crearReceta(A, productId)
    let orderId: string | null = null

    try {
      const alta = createCreateOrder({ recipes, products, units, presentations, unitOfWork, now: () => new Date('2026-05-08T12:00:00.000Z') })

      // necesaria = 100 * 100 % = 100, cubierta EXACTAMENTE por el lote (stock 100).
      // importe = 100 * 9999999999.9999 = 999999999999.9900, muy por encima de 9999999999.9999.
      const creado = await alta({ recipeId, quantity: '100.0000', priority: 'MEDIA', presentationId: A.presentationId }, actorDe(A))
      orderId = creado.id

      expect(await ingredientsCostCrudo(orderId)).toBeNull()
    } finally {
      if (orderId !== null) await borrarPedido(orderId)
      await borrarReceta(recipeId)
      await borrarProducto(productId)
    }
  })
})
