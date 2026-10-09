/**
 * El recorrido del seed de demostracion. No conoce Prisma ni la composicion: todo lo que
 * lee o escribe pasa por `DemoSeedGateway`, para que la idempotencia se pueda probar con
 * un doble en memoria.
 *
 * Idempotencia: cada entidad se busca por su clave antes de crearla, y un pedido que ya
 * existe se retoma desde su estado actual hasta el estado objetivo, por las mismas
 * transiciones del dominio.
 */
import type { OrderStatus } from '../../lib/modules/pedidos'

import {
  UNREACHABLE_ORDER_STATUSES,
  type DemoBatch,
  type DemoCatalogLine,
  type DemoCustomer,
  type DemoDataset,
  type DemoOrder,
  type DemoProduct,
  type DemoRecipe,
  type DemoRecipeVersion,
  type DemoUnit,
  type DemoUser,
} from './data'
import type { DemoCredentials } from './guard'

export type OrderStep =
  | 'start'
  | 'finish'
  | 'startPacking'
  | 'finishPacking'
  | 'startConditioning'
  | 'finishConditioning'
  | 'cancel'

const FLOW: readonly { readonly from: OrderStatus; readonly step: OrderStep; readonly to: OrderStatus }[] = [
  { from: 'PENDIENTE', step: 'start', to: 'EN_CURSO' },
  { from: 'EN_CURSO', step: 'finish', to: 'POR_EMPACAR' },
  { from: 'POR_EMPACAR', step: 'startPacking', to: 'EN_EMPAQUE' },
  { from: 'EN_EMPAQUE', step: 'finishPacking', to: 'POR_ACONDICIONAR' },
  { from: 'POR_ACONDICIONAR', step: 'startConditioning', to: 'EN_ACONDICIONAMIENTO' },
  { from: 'EN_ACONDICIONAMIENTO', step: 'finishConditioning', to: 'TERMINADO' },
]

/** Los mismos estados que `pedidos` deja cancelar: antes de consumir material. */
const CANCELLABLE: readonly OrderStatus[] = ['PENDIENTE', 'EN_CURSO', 'BLOQUEADO']

/**
 * Los pasos que llevan un pedido de `current` a `target`, o `null` si el dominio no tiene
 * camino (retroceder, saltar a BLOQUEADO, llegar a ENTREGADO).
 */
export function stepsToReach(current: OrderStatus, target: OrderStatus): readonly OrderStep[] | null {
  if (current === target) return []
  if (target === 'CANCELADO') return CANCELLABLE.includes(current) ? ['cancel'] : null
  const steps: OrderStep[] = []
  let status = current
  while (status !== target) {
    const next = FLOW.find((edge) => edge.from === status)
    if (next === undefined) return null
    steps.push(next.step)
    status = next.to
  }
  return steps
}

/** Quien ejecuta cada paso: el id de un usuario ya sembrado. */
export type StepActors = {
  readonly admin: string
  readonly operator: string
  readonly packer: string
  readonly conditioner: string
}

export type ResolvedRecipeLine = { readonly productId: string; readonly percentage: string }

export type DemoSeedGateway = {
  resolveBaseCompany(): Promise<{ readonly companyId: string; readonly baseAdminId: string }>
  findRoleId(role: DemoUser['role']): Promise<string>
  findSystemUnitId(name: string): Promise<string>

  findUser(username: string): Promise<{ readonly id: string; readonly active: boolean } | null>
  createUser(as: string, user: DemoUser, roleId: string, credential: string): Promise<string>
  activateUser(as: string, userId: string): Promise<void>

  findWorkGroup(name: string): Promise<string | null>
  createWorkGroup(as: string, name: string): Promise<string>
  isWorkGroupMember(workGroupId: string, userId: string): Promise<boolean>
  addWorkGroupMember(as: string, workGroupId: string, userId: string): Promise<void>

  findUnit(name: string): Promise<string | null>
  createUnit(as: string, unit: DemoUnit, baseUnitId: string): Promise<string>

  findPresentation(name: string): Promise<string | null>
  createPresentation(as: string, name: string, unitId: string, content: string): Promise<string>

  findProduct(name: string): Promise<string | null>
  findBatch(lot: string): Promise<{ readonly id: string; readonly stock: string } | null>
  receiveBatch(
    as: string,
    product: DemoProduct,
    batch: DemoBatch,
    refs: { readonly unitId: string | null; readonly presentationId: string | null },
  ): Promise<void>
  hasAdjustment(batchId: string): Promise<boolean>
  adjustBatch(as: string, batchId: string, seenStock: string, delta: string, reason: string): Promise<void>

  findSupplier(name: string): Promise<string | null>
  createSupplier(as: string, name: string, phone: string, email: string): Promise<string>
  findCatalogLine(supplierId: string, name: string): Promise<string | null>
  createCatalogLine(
    as: string,
    supplierId: string,
    line: DemoCatalogLine,
    refs: { readonly presentationId: string; readonly unitId: string | null },
  ): Promise<string>

  findCustomer(firstNames: string, lastNames: string): Promise<string | null>
  createCustomer(as: string, customer: DemoCustomer): Promise<string>

  findRecipe(name: string): Promise<string | null>
  createRecipe(
    as: string,
    recipe: DemoRecipe,
    lines: readonly ResolvedRecipeLine[],
    tools: readonly { readonly productId: string; readonly quantity: number }[],
  ): Promise<string>
  findRecipeVersion(originalId: string, name: string): Promise<string | null>
  createRecipeVersion(
    as: string,
    originalId: string,
    version: DemoRecipeVersion,
    lines: readonly ResolvedRecipeLine[],
  ): Promise<string>

  findOrder(recipeId: string, quantity: string): Promise<{ readonly id: string; readonly status: OrderStatus } | null>
  createOrder(
    as: string,
    input: {
      readonly recipeId: string
      readonly recipeVersionId: string | null
      readonly quantity: string
      readonly unitId: string
      readonly priority: DemoOrder['priority']
      readonly packaging: readonly { readonly packagingProductId: string; readonly packages: number }[]
      readonly customerId: string | null
      readonly confirmBlocked: boolean
    },
  ): Promise<{ readonly id: string; readonly status: OrderStatus }>
  hasResponsibles(orderId: string): Promise<boolean>
  assignResponsibles(as: string, orderId: string, userIds: readonly string[], workGroupIds: readonly string[]): Promise<void>
  applyStep(step: OrderStep, orderId: string, actors: StepActors, cancellationReason: string | undefined): Promise<void>
  findOrderStatus(orderId: string): Promise<OrderStatus>
}

export type DemoSeedKind =
  | 'usuarios'
  | 'grupos'
  | 'miembros'
  | 'unidades'
  | 'presentaciones'
  | 'lotes'
  | 'ajustes'
  | 'proveedores'
  | 'catalogo'
  | 'clientes'
  | 'recetas'
  | 'versiones'
  | 'pedidos'
  | 'asignaciones'
  | 'transiciones'

export type DemoSeedReport = {
  readonly created: Readonly<Record<DemoSeedKind, number>>
  readonly existing: Readonly<Record<DemoSeedKind, number>>
  readonly warnings: readonly string[]
}

const KINDS: readonly DemoSeedKind[] = [
  'usuarios',
  'grupos',
  'miembros',
  'unidades',
  'presentaciones',
  'lotes',
  'ajustes',
  'proveedores',
  'catalogo',
  'clientes',
  'recetas',
  'versiones',
  'pedidos',
  'asignaciones',
  'transiciones',
]

class Tally {
  readonly created = Object.fromEntries(KINDS.map((kind) => [kind, 0])) as Record<DemoSeedKind, number>
  readonly existing = Object.fromEntries(KINDS.map((kind) => [kind, 0])) as Record<DemoSeedKind, number>
  readonly warnings: string[] = []

  async ensure(kind: DemoSeedKind, find: () => Promise<string | null>, create: () => Promise<string>): Promise<string> {
    const found = await find()
    if (found !== null) {
      this.existing[kind] += 1
      return found
    }
    const id = await create()
    this.created[kind] += 1
    return id
  }
}

function lookup(map: ReadonlyMap<string, string>, key: string, what: string): string {
  const id = map.get(key)
  if (id === undefined) throw new Error(`el dataset de demo nombra ${what} "${key}", que no esta definido`)
  return id
}

export async function runDemoSeed(
  gateway: DemoSeedGateway,
  dataset: DemoDataset,
  credentials: DemoCredentials,
): Promise<DemoSeedReport> {
  const tally = new Tally()
  const { baseAdminId } = await gateway.resolveBaseCompany()

  const userIds = new Map<string, string>([['admin', baseAdminId]])
  for (const user of dataset.users) {
    const found = await gateway.findUser(user.username)
    if (found !== null) {
      tally.existing.usuarios += 1
      if (!found.active) await gateway.activateUser(baseAdminId, found.id)
      userIds.set(user.key, found.id)
      continue
    }
    const roleId = await gateway.findRoleId(user.role)
    const id = await gateway.createUser(baseAdminId, user, roleId, credentials[user.role])
    await gateway.activateUser(baseAdminId, id)
    tally.created.usuarios += 1
    userIds.set(user.key, id)
  }
  // El rol Administrador no se concede por el alta de usuarios: actua el del seed base.
  const admin = baseAdminId

  const groupIds = new Map<string, string>()
  for (const group of dataset.workGroups) {
    const id = await tally.ensure('grupos', () => gateway.findWorkGroup(group.name), () => gateway.createWorkGroup(admin, group.name))
    groupIds.set(group.key, id)
    for (const member of group.members) {
      const userId = lookup(userIds, member, 'el usuario')
      if (await gateway.isWorkGroupMember(id, userId)) {
        tally.existing.miembros += 1
      } else {
        await gateway.addWorkGroupMember(admin, id, userId)
        tally.created.miembros += 1
      }
    }
  }

  const unitIds = new Map<string, string>()
  const systemUnitId = async (name: string): Promise<string> => {
    const cached = unitIds.get(name)
    if (cached !== undefined) return cached
    const id = await gateway.findSystemUnitId(name)
    unitIds.set(name, id)
    return id
  }
  for (const unit of dataset.units) {
    const baseUnitId = await systemUnitId(unit.baseSystemUnit)
    const id = await tally.ensure('unidades', () => gateway.findUnit(unit.name), () => gateway.createUnit(admin, unit, baseUnitId))
    unitIds.set(unit.key, id)
  }
  const unitId = async (key: string): Promise<string> => unitIds.get(key) ?? systemUnitId(key)

  const presentationIds = new Map<string, string>()
  for (const presentation of dataset.presentations) {
    const presentationUnitId = await unitId(presentation.unit)
    const id = await tally.ensure(
      'presentaciones',
      () => gateway.findPresentation(presentation.name),
      () => gateway.createPresentation(admin, presentation.name, presentationUnitId, presentation.content),
    )
    presentationIds.set(presentation.key, id)
  }

  const productIds = new Map<string, string>()
  for (const product of dataset.products) {
    const refs = {
      unitId: product.type === 'PRODUCT' ? await unitId(product.unit) : null,
      presentationId: product.type === 'PACKAGING' ? lookup(presentationIds, product.presentation, 'la presentacion') : null,
    }
    for (const batch of product.batches) {
      if ((await gateway.findBatch(batch.lot)) !== null) {
        tally.existing.lotes += 1
        continue
      }
      await gateway.receiveBatch(admin, product, batch, refs)
      tally.created.lotes += 1
    }
    const id = await gateway.findProduct(product.name)
    if (id === null) throw new Error(`el producto "${product.name}" no aparece tras dar de alta sus lotes`)
    productIds.set(product.key, id)
  }

  for (const adjustment of dataset.adjustments) {
    const batch = await gateway.findBatch(adjustment.lot)
    if (batch === null) throw new Error(`el ajuste nombra el lote "${adjustment.lot}", que no existe`)
    if (await gateway.hasAdjustment(batch.id)) {
      tally.existing.ajustes += 1
      continue
    }
    await gateway.adjustBatch(admin, batch.id, batch.stock, adjustment.delta, adjustment.reason)
    tally.created.ajustes += 1
  }

  for (const supplier of dataset.suppliers) {
    const supplierId = await tally.ensure(
      'proveedores',
      () => gateway.findSupplier(supplier.name),
      () => gateway.createSupplier(admin, supplier.name, supplier.phone, supplier.email),
    )
    for (const line of supplier.catalog) {
      const refs = {
        presentationId: lookup(presentationIds, line.presentation, 'la presentacion'),
        unitId: line.unit === null ? null : await unitId(line.unit),
      }
      await tally.ensure(
        'catalogo',
        () => gateway.findCatalogLine(supplierId, line.name),
        () => gateway.createCatalogLine(admin, supplierId, line, refs),
      )
    }
  }

  const customerIds = new Map<string, string>()
  for (const customer of dataset.customers) {
    const id = await tally.ensure(
      'clientes',
      () => gateway.findCustomer(customer.firstNames, customer.lastNames),
      () => gateway.createCustomer(admin, customer),
    )
    customerIds.set(customer.key, id)
  }

  const resolveLines = (lines: DemoRecipe['lines']): readonly ResolvedRecipeLine[] =>
    lines.map((line) => ({ productId: lookup(productIds, line.product, 'el producto'), percentage: line.percentage }))

  const recipeIds = new Map<string, string>()
  const versionIds = new Map<string, string>()
  for (const recipe of dataset.recipes) {
    const tools = recipe.tools.map((tool) => ({ productId: lookup(productIds, tool.product, 'el producto'), quantity: tool.quantity }))
    const recipeId = await tally.ensure(
      'recetas',
      () => gateway.findRecipe(recipe.name),
      () => gateway.createRecipe(admin, recipe, resolveLines(recipe.lines), tools),
    )
    recipeIds.set(recipe.key, recipeId)
    for (const version of recipe.versions) {
      const versionId = await tally.ensure(
        'versiones',
        () => gateway.findRecipeVersion(recipeId, version.name),
        () => gateway.createRecipeVersion(admin, recipeId, version, resolveLines(version.lines)),
      )
      versionIds.set(`${recipe.key}/${version.key}`, versionId)
    }
  }

  for (const order of dataset.orders) {
    await seedOrder(gateway, tally, order, {
      admin,
      userIds,
      groupIds,
      unitId,
      recipeId: lookup(recipeIds, order.recipe, 'la receta'),
      versionId: order.version === undefined ? null : lookup(versionIds, `${order.recipe}/${order.version}`, 'la version'),
      productIds,
      customerIds,
    })
  }

  for (const status of UNREACHABLE_ORDER_STATUSES) {
    tally.warnings.push(`ningun pedido en ${status}: el dominio no tiene una transicion que llegue ahi`)
  }

  return { created: tally.created, existing: tally.existing, warnings: tally.warnings }
}

type OrderRefs = {
  readonly admin: string
  readonly userIds: ReadonlyMap<string, string>
  readonly groupIds: ReadonlyMap<string, string>
  readonly unitId: (key: string) => Promise<string>
  readonly recipeId: string
  readonly versionId: string | null
  readonly productIds: ReadonlyMap<string, string>
  readonly customerIds: ReadonlyMap<string, string>
}

async function seedOrder(gateway: DemoSeedGateway, tally: Tally, order: DemoOrder, refs: OrderRefs): Promise<void> {
  const effectiveRecipeId = refs.versionId ?? refs.recipeId
  let current = await gateway.findOrder(effectiveRecipeId, order.quantity)
  if (current === null) {
    current = await gateway.createOrder(refs.admin, {
      recipeId: refs.recipeId,
      recipeVersionId: refs.versionId,
      quantity: order.quantity,
      unitId: await refs.unitId(order.unit),
      priority: order.priority,
      packaging: order.packaging.map((line) => ({
        packagingProductId: lookup(refs.productIds, line.product, 'el envase'),
        packages: line.packages,
      })),
      customerId: order.customer === null ? null : lookup(refs.customerIds, order.customer, 'el cliente'),
      confirmBlocked: order.target === 'BLOQUEADO',
    })
    tally.created.pedidos += 1
  } else {
    tally.existing.pedidos += 1
  }
  const orderId = current.id

  if (await gateway.hasResponsibles(orderId)) {
    tally.existing.asignaciones += 1
  } else {
    await gateway.assignResponsibles(
      refs.admin,
      orderId,
      order.responsibles.users.map((key) => lookup(refs.userIds, key, 'el usuario')),
      order.responsibles.groups.map((key) => lookup(refs.groupIds, key, 'el grupo')),
    )
    tally.created.asignaciones += 1
  }

  const steps = stepsToReach(current.status, order.target)
  if (steps === null) {
    tally.warnings.push(`pedido "${order.key}": esta en ${current.status} y no hay camino a ${order.target}; se deja como esta`)
    return
  }
  const actors: StepActors = {
    admin: refs.admin,
    operator: lookup(refs.userIds, order.operator, 'el usuario'),
    packer: lookup(refs.userIds, order.packer, 'el usuario'),
    conditioner: lookup(refs.userIds, order.conditioner, 'el usuario'),
  }
  for (const step of steps) {
    await gateway.applyStep(step, orderId, actors, order.cancellationReason)
    tally.created.transiciones += 1
  }
  const reached = await gateway.findOrderStatus(orderId)
  if (reached !== order.target) {
    tally.warnings.push(`pedido "${order.key}": se esperaba ${order.target} y quedo en ${reached}`)
  }
}
