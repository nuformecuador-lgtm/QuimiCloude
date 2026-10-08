/**
 * `DemoSeedGateway` real. Toda ESCRITURA pasa por un caso de uso ya cableado en
 * `lib/composition` (con su autorizacion, su validacion y sus invariantes); Prisma solo
 * se usa para LEER, siempre con la empresa en el `where`, y asi saber si algo ya existe.
 *
 * Excepcion: `units`, `orders` y `order_assignments` NO se leen con Prisma. Sus modulos
 * (`unidades`, `pedidos`, `asignaciones`) prohiben en su contrato que nadie fuera de sus
 * adaptadores consulte esas tablas, tambien desde `scripts/`. Esas lecturas van por los
 * casos de uso de consulta de `lib/composition`, con el Administrador base como actor.
 *
 * El actor de cada caso de uso se construye con el mismo lector que usa la sesion
 * (`findActiveSessionUserById`): los permisos salen de la base, no de una lista copiada.
 *
 * Imports relativos, como `scripts/seed.ts`. Este archivo carga Prisma al importarse:
 * quien lo use tiene que cargar el entorno antes.
 */
import { randomUUID } from 'node:crypto'

import { Prisma } from '@prisma/client'

import { asignaciones, clientes, identity, inventario, pedidos, proveedores, recetas, unidades } from '../../lib/composition'
import { normalizeCustomerText } from '../../lib/modules/clientes'
import {
  DOCUMENT_TYPE_CC,
  INITIAL_COMPANY_NAME,
  ROLE_ACONDICIONAMIENTO,
  ROLE_ADMINISTRADOR,
  ROLE_EMPACADOR,
  ROLE_OPERADOR,
  normalizeCompanyName,
  normalizeWorkGroupName,
} from '../../lib/modules/identity'
import { findActiveSessionUserById } from '../../lib/modules/identity/adapters/driven/persistence/session-user-prisma'
import { normalizePresentationName, normalizeProductName, type MovementReason } from '../../lib/modules/inventario'
import { normalizeSupplierName } from '../../lib/modules/proveedores'
import { normalizeRecipeName } from '../../lib/modules/recetas'
import { normalizeUnitName } from '../../lib/modules/unidades'
import { prisma } from '../../lib/shared/db/prisma'

import type { DemoProduct, DemoUser } from './data'
import type { DemoSeedGateway, OrderStep, StepActors } from './run'

type Actor = { readonly id: string; readonly companyId: string; readonly permissions: readonly string[] }

const ROLE_NAMES: Readonly<Record<DemoUser['role'], string>> = {
  operador: ROLE_OPERADOR,
  empacador: ROLE_EMPACADOR,
  acondicionamiento: ROLE_ACONDICIONAMIENTO,
}

const DEMO_USERNAME_PREFIX = 'demo.'
const DEMO_BIRTH_DATE = '1990-01-01'

/** Un paso del seed como documento de pasos de receta: un parrafo de texto plano. */
function stepDocument(text: string): { blocks: { kind: 'paragraph'; spans: { text: string }[] }[] } {
  return { blocks: [{ kind: 'paragraph', spans: [{ text }] }] }
}

export type PrismaDemoSeedGatewayOptions = {
  /** Sin valor, la empresa del seed base. Los tests de integracion pasan una propia. */
  readonly companyId?: string
}

export function createPrismaDemoSeedGateway(options: PrismaDemoSeedGatewayOptions = {}): DemoSeedGateway {
  let companyId: string | null = null
  let baseAdminId: string | null = null
  const actors = new Map<string, Actor>()

  const company = (): string => {
    if (companyId === null) throw new Error('el gateway de demo se uso antes de resolver la empresa')
    return companyId
  }

  /** El actor de las lecturas que no reciben uno: el Administrador base de la empresa. */
  const reader = (): Promise<Actor> => {
    if (baseAdminId === null) throw new Error('el gateway de demo se uso antes de resolver la empresa')
    return actor(baseAdminId)
  }

  /** Las unidades que ve la empresa (las suyas mas las de sistema), con el mismo nombre. */
  const unitsNamed = async (name: string) => {
    const wanted = normalizeUnitName(name)
    const catalog = await unidades.listUnits(undefined, await reader())
    return catalog.filter((unit) => normalizeUnitName(unit.name) === wanted)
  }

  const actor = async (userId: string): Promise<Actor> => {
    const cached = actors.get(userId)
    if (cached !== undefined) return cached
    const record = await findActiveSessionUserById(userId, randomUUID())
    if (record === null || record.companyId === null) {
      throw new Error(`el usuario ${userId} no existe o no tiene empresa: no puede actuar en el seed de demo`)
    }
    const built: Actor = { id: record.id, companyId: record.companyId, permissions: record.permissions }
    actors.set(userId, built)
    return built
  }

  return {
    async resolveBaseCompany() {
      const row =
        options.companyId !== undefined
          ? await prisma.company.findFirst({ where: { id: options.companyId, deletedAt: null }, select: { id: true } })
          : await prisma.company.findFirst({
              where: { nameNormalized: normalizeCompanyName(INITIAL_COMPANY_NAME), deletedAt: null },
              orderBy: { createdAt: 'asc' },
              select: { id: true },
            })
      if (row === null) throw new Error('no existe la empresa del seed base: corre `pnpm db:seed` antes')
      companyId = row.id
      const admin = await prisma.user.findFirst({
        where: {
          companyId: row.id,
          deletedAt: null,
          accountStatus: 'active',
          role: { name: ROLE_ADMINISTRADOR },
          NOT: { username: { startsWith: DEMO_USERNAME_PREFIX } },
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      })
      if (admin === null) {
        throw new Error('la empresa del seed base no tiene ningun Administrador activo: corre `pnpm db:seed` antes')
      }
      baseAdminId = admin.id
      return { companyId: row.id, baseAdminId: admin.id }
    },

    async findRoleId(role) {
      const row = await prisma.role.findUnique({ where: { name: ROLE_NAMES[role] }, select: { id: true } })
      if (row === null) throw new Error(`falta el rol "${ROLE_NAMES[role]}": corre \`pnpm db:seed\` antes`)
      return row.id
    },

    async findSystemUnitId(name) {
      const found = (await unitsNamed(name)).find((unit) => unit.isSystem)
      if (found === undefined) throw new Error(`falta la unidad de sistema "${name}": aplica las migraciones antes`)
      return found.id
    },

    async findUser(username) {
      const row = await prisma.user.findFirst({
        where: { username, deletedAt: null },
        select: { id: true, accountStatus: true, companyId: true },
      })
      if (row === null) return null
      if (row.companyId !== company()) {
        throw new Error(`el usuario "${username}" ya existe en otra empresa: el seed de demo no lo toca`)
      }
      return { id: row.id, active: row.accountStatus === 'active' }
    },

    async createUser(as, user, roleId, credential) {
      const result = await identity.createUser(await actor(as), {
        firstNames: user.firstNames,
        lastNames: user.lastNames,
        birthDate: DEMO_BIRTH_DATE,
        email: `${user.username}@usuarios.demo.test`,
        phone: user.phone,
        documentTypeCode: DOCUMENT_TYPE_CC,
        documentNumber: user.documentNumber,
        username: user.username,
        roleId,
        credential,
      })
      return result.id
    },

    async activateUser(as, userId) {
      await identity.setUserAccountStatus(await actor(as), userId, { accountStatus: 'active' })
    },

    async findWorkGroup(name) {
      const row = await prisma.workGroup.findFirst({
        where: { companyId: company(), nameNormalized: normalizeWorkGroupName(name), deletedAt: null },
        select: { id: true },
      })
      return row?.id ?? null
    },

    async createWorkGroup(as, name) {
      return (await identity.createWorkGroup(await actor(as), { name })).id
    },

    async isWorkGroupMember(workGroupId, userId) {
      const row = await prisma.workGroupMember.findFirst({
        where: { workGroupId, userId, companyId: company() },
        select: { userId: true },
      })
      return row !== null
    },

    async addWorkGroupMember(as, workGroupId, userId) {
      await identity.addWorkGroupMember(await actor(as), { workGroupId, userId })
    },

    async findUnit(name) {
      const found = (await unitsNamed(name)).find((unit) => !unit.isSystem)
      return found?.id ?? null
    },

    async createUnit(as, unit, baseUnitId) {
      const input = { name: unit.name, symbol: unit.symbol, baseUnitId, factor: unit.factor }
      return (await unidades.createUnit(input, await actor(as))).id
    },

    async findPresentation(name) {
      const row = await prisma.presentation.findFirst({
        where: { companyId: company(), nameNormalized: normalizePresentationName(name) },
        select: { id: true },
      })
      return row?.id ?? null
    },

    async createPresentation(as, name, unitId, content) {
      return (await inventario.createPresentation({ name, unitId, content }, await actor(as))).id
    },

    async findProduct(name) {
      const row = await prisma.product.findFirst({
        where: { companyId: company(), nameNormalized: normalizeProductName(name), deletedAt: null },
        select: { id: true },
      })
      return row?.id ?? null
    },

    async findBatch(lot) {
      const row = await prisma.productBatch.findFirst({
        where: { companyId: company(), lot },
        select: { id: true, stock: true },
      })
      return row === null ? null : { id: row.id, stock: row.stock.toFixed() }
    },

    async receiveBatch(as, product, batch, refs) {
      await inventario.createProduct(productInput(product, batch, refs), await actor(as))
    },

    async hasAdjustment(batchId) {
      const count = await prisma.inventoryMovement.count({
        where: { batchId, companyId: company(), kind: 'adjustment' },
      })
      return count > 0
    },

    async adjustBatch(as, batchId, seenStock, delta, reason) {
      const countedStock = new Prisma.Decimal(seenStock).plus(delta).toFixed()
      await inventario.adjustBatchStock(
        { batchId, countedStock, seenStock, reason: reason as MovementReason },
        await actor(as),
      )
    },

    async findSupplier(name) {
      const row = await prisma.supplier.findFirst({
        where: { companyId: company(), nameNormalized: normalizeSupplierName(name), deletedAt: null },
        select: { id: true },
      })
      return row?.id ?? null
    },

    async createSupplier(as, name, phone, email) {
      return (await proveedores.createSupplier({ name, phone, email }, await actor(as))).id
    },

    async findCatalogLine(supplierId, name) {
      const row = await prisma.supplierCatalogLine.findFirst({
        where: { companyId: company(), supplierId, name, deletedAt: null },
        select: { id: true },
      })
      return row?.id ?? null
    },

    async createCatalogLine(as, supplierId, line, refs) {
      const input = {
        supplierId,
        name: line.name,
        presentationId: refs.presentationId,
        unitId: refs.unitId,
        cost: line.cost,
        minPurchase: line.minPurchase,
        deliveryTime: line.deliveryTime,
        material: line.material,
      }
      return (await proveedores.createCatalogLine(input, await actor(as))).id
    },

    async findCustomer(firstNames, lastNames) {
      const row = await prisma.customer.findFirst({
        where: {
          companyId: company(),
          firstNamesNormalized: normalizeCustomerText(firstNames),
          lastNamesNormalized: normalizeCustomerText(lastNames),
          deletedAt: null,
        },
        select: { id: true },
      })
      return row?.id ?? null
    },

    async createCustomer(as, customer) {
      const input = {
        firstNames: customer.firstNames,
        lastNames: customer.lastNames,
        city: customer.city,
        phone: customer.phone,
        email: customer.email,
        address: customer.address,
      }
      return (await clientes.createCustomer(input, await actor(as))).id
    },

    async findRecipe(name) {
      const row = await prisma.recipe.findFirst({
        where: { companyId: company(), nameNormalized: normalizeRecipeName(name), parentRecipeId: null, deletedAt: null },
        select: { id: true },
      })
      return row?.id ?? null
    },

    async createRecipe(as, recipe, lines, tools) {
      const input = {
        name: recipe.name,
        description: recipe.description,
        steps: recipe.steps.map(stepDocument),
        packingSteps: recipe.packingSteps.map(stepDocument),
        lines,
        tools,
      }
      return (await recetas.createRecipe(input, await actor(as))).id
    },

    async findRecipeVersion(originalId, name) {
      const row = await prisma.recipe.findFirst({
        where: { companyId: company(), parentRecipeId: originalId, name, deletedAt: null },
        select: { id: true },
      })
      return row?.id ?? null
    },

    async createRecipeVersion(as, originalId, version, lines) {
      return (await recetas.createRecipeVersion(originalId, { name: version.name, lines }, await actor(as))).id
    },

    async findOrder(recipeId, quantity) {
      // El listado no filtra por receta ni por cantidad: se recorre entero, del mas antiguo al
      // mas nuevo, y gana el primero que coincide. Los borrados no salen nunca del listado.
      const wanted = new Prisma.Decimal(quantity)
      const as = await reader()
      for (let page = 1; ; page += 1) {
        const result = await pedidos.listOrders({ page, sort: { columnId: 'createdAt', direction: 'asc' } }, as)
        const found = result.items.find((order) => order.recipeId === recipeId && wanted.equals(order.quantity))
        if (found !== undefined) return { id: found.id, status: found.status }
        if (page >= result.totalPages) return null
      }
    },

    async createOrder(as, input) {
      const created = await pedidos.createOrder(
        {
          recipeId: input.recipeId,
          recipeVersionId: input.recipeVersionId,
          quantity: input.quantity,
          unitId: input.unitId,
          priority: input.priority,
          presentationLines: input.packaging,
          customerId: input.customerId ?? undefined,
          confirmBlocked: input.confirmBlocked,
        },
        await actor(as),
      )
      return { id: created.id, status: (await pedidos.getOrder(created.id, await reader())).status }
    },

    async hasResponsibles(orderId) {
      return (await asignaciones.listOrderResponsibles(await reader(), orderId)).length > 0
    },

    async assignResponsibles(as, orderId, userIds, workGroupIds) {
      await asignaciones.assignResponsibles(
        await actor(as),
        { orderId, userIds: [...userIds], workGroupIds: [...workGroupIds] },
        new Date(),
      )
    },

    async applyStep(step, orderId, stepActors, cancellationReason) {
      await applyOrderStep(step, orderId, stepActors, cancellationReason, actor)
    },

    async findOrderStatus(orderId) {
      return (await pedidos.getOrder(orderId, await reader())).status
    },
  }
}

async function applyOrderStep(
  step: OrderStep,
  orderId: string,
  actors: StepActors,
  cancellationReason: string | undefined,
  actor: (userId: string) => Promise<Actor>,
): Promise<void> {
  switch (step) {
    case 'start':
      await asignaciones.startAssignedOrder(await actor(actors.operator), { orderId })
      return
    case 'finish':
      await asignaciones.finishAssignedOrder(await actor(actors.operator), { orderId, stepPosition: null })
      return
    case 'startPacking':
      await asignaciones.startPacking(await actor(actors.packer), { orderId })
      return
    case 'finishPacking':
      await asignaciones.finishPacking(await actor(actors.packer), { orderId })
      return
    case 'startConditioning':
      await asignaciones.startConditioning(await actor(actors.conditioner), { orderId })
      return
    case 'finishConditioning':
      await asignaciones.finishConditioning(await actor(actors.conditioner), { orderId })
      return
    case 'cancel':
      if (cancellationReason === undefined) throw new Error(`cancelar el pedido ${orderId} exige un motivo en el dataset`)
      await pedidos.cancelOrder(orderId, { reason: cancellationReason }, await actor(actors.admin))
      return
  }
}

function productInput(
  product: DemoProduct,
  batch: { readonly lot: string; readonly stock: string; readonly unitCost: string | null; readonly purchaseDate: string; readonly expiryDate?: string },
  refs: { readonly unitId: string | null; readonly presentationId: string | null },
): Record<string, unknown> {
  const common = { name: product.name, stock: batch.stock, lot: batch.lot, purchaseDate: batch.purchaseDate, unitCost: batch.unitCost }
  switch (product.type) {
    case 'PRODUCT':
      return { ...common, type: 'PRODUCT', unitId: refs.unitId, qtyAlert: product.qtyAlert, expiryDate: batch.expiryDate ?? null }
    case 'PACKAGING':
      return { ...common, type: 'PACKAGING', presentationId: refs.presentationId, qtyAlert: product.qtyAlert }
    case 'MACHINE':
      return { ...common, type: 'MACHINE', expiryDate: batch.expiryDate ?? null }
  }
}
