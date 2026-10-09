import { describe, expect, it } from 'vitest'

import { ORDER_PRIORITY_VALUES, ORDER_STATUS_VALUES, type OrderStatus } from '@/lib/modules/pedidos'

import { DEMO_DATASET, DEMO_PREFIX, UNREACHABLE_ORDER_STATUSES } from '../../../scripts/seed-demo/data'
import { runDemoSeed, stepsToReach, type DemoSeedGateway, type OrderStep } from '../../../scripts/seed-demo/run'

const CREDENTIALS = { operador: 'x-operador', empacador: 'x-empacador', acondicionamiento: 'x-acond' }

const NEXT: Readonly<Partial<Record<OrderStep, OrderStatus>>> = {
  start: 'EN_CURSO',
  finish: 'POR_EMPACAR',
  startPacking: 'EN_EMPAQUE',
  finishPacking: 'POR_ACONDICIONAR',
  startConditioning: 'EN_ACONDICIONAMIENTO',
  finishConditioning: 'TERMINADO',
  cancel: 'CANCELADO',
}

/** Doble en memoria: cada `create*` deja la fila donde la buscara el `find*` correspondiente. */
function memoryGateway() {
  const rows = new Map<string, string>()
  const orders = new Map<string, { id: string; status: OrderStatus }>()
  const statusById = new Map<string, OrderStatus>()
  const writes: string[] = []
  let seq = 0
  const newId = (kind: string): string => `${kind}-${++seq}`
  const put = (key: string, kind: string): string => {
    const id = newId(kind)
    rows.set(key, id)
    writes.push(kind)
    return id
  }
  const get = async (key: string): Promise<string | null> => rows.get(key) ?? null

  const gateway: DemoSeedGateway = {
    resolveBaseCompany: async () => ({ companyId: 'company-1', baseAdminId: 'base-admin' }),
    findRoleId: async (role) => `role-${role}`,
    findSystemUnitId: async (name) => `system-unit-${name}`,
    findUser: async (username) => {
      const id = rows.get(`user:${username}`)
      return id === undefined ? null : { id, active: rows.has(`active:${id}`) }
    },
    createUser: async (_as, user) => put(`user:${user.username}`, 'user'),
    activateUser: async (_as, userId) => {
      rows.set(`active:${userId}`, userId)
      writes.push('activate')
    },
    findWorkGroup: (name) => get(`group:${name}`),
    createWorkGroup: async (_as, name) => put(`group:${name}`, 'group'),
    isWorkGroupMember: async (groupId, userId) => rows.has(`member:${groupId}:${userId}`),
    addWorkGroupMember: async (_as, groupId, userId) => {
      put(`member:${groupId}:${userId}`, 'member')
    },
    findUnit: (name) => get(`unit:${name}`),
    createUnit: async (_as, unit) => put(`unit:${unit.name}`, 'unit'),
    findPresentation: (name) => get(`presentation:${name}`),
    createPresentation: async (_as, name) => put(`presentation:${name}`, 'presentation'),
    findProduct: (name) => get(`product:${name}`),
    findBatch: async (lot) => {
      const id = rows.get(`batch:${lot}`)
      return id === undefined ? null : { id, stock: '10' }
    },
    receiveBatch: async (_as, product, batch) => {
      if (!rows.has(`product:${product.name}`)) rows.set(`product:${product.name}`, newId('product'))
      put(`batch:${batch.lot}`, 'batch')
    },
    hasAdjustment: async (batchId) => rows.has(`adjustment:${batchId}`),
    adjustBatch: async (_as, batchId) => {
      put(`adjustment:${batchId}`, 'adjustment')
    },
    findSupplier: (name) => get(`supplier:${name}`),
    createSupplier: async (_as, name) => put(`supplier:${name}`, 'supplier'),
    findCatalogLine: (supplierId, name) => get(`line:${supplierId}:${name}`),
    createCatalogLine: async (_as, supplierId, line) => put(`line:${supplierId}:${line.name}`, 'line'),
    findCustomer: (first, last) => get(`customer:${first}:${last}`),
    createCustomer: async (_as, customer) => put(`customer:${customer.firstNames}:${customer.lastNames}`, 'customer'),
    findRecipe: (name) => get(`recipe:${name}`),
    createRecipe: async (_as, recipe) => put(`recipe:${recipe.name}`, 'recipe'),
    findRecipeVersion: (originalId, name) => get(`version:${originalId}:${name}`),
    createRecipeVersion: async (_as, originalId, version) => put(`version:${originalId}:${version.name}`, 'version'),
    findOrder: async (recipeId, quantity) => {
      const order = orders.get(`${recipeId}:${quantity}`)
      return order === undefined ? null : { id: order.id, status: statusById.get(order.id) ?? order.status }
    },
    createOrder: async (_as, input) => {
      const effective = input.recipeVersionId ?? input.recipeId
      const order = { id: newId('order'), status: (input.confirmBlocked ? 'BLOQUEADO' : 'PENDIENTE') as OrderStatus }
      orders.set(`${effective}:${input.quantity}`, order)
      statusById.set(order.id, order.status)
      writes.push('order')
      return order
    },
    hasResponsibles: async (orderId) => rows.has(`assigned:${orderId}`),
    assignResponsibles: async (_as, orderId) => {
      put(`assigned:${orderId}`, 'assignment')
    },
    applyStep: async (step, orderId) => {
      const next = NEXT[step]
      if (next === undefined) throw new Error(`paso desconocido ${step}`)
      statusById.set(orderId, next)
      writes.push(`step:${step}`)
    },
    findOrderStatus: async (orderId) => statusById.get(orderId) ?? 'PENDIENTE',
  }
  return { gateway, writes, statusById, orders }
}

describe('seed de demo — recorrido', () => {
  it('la primera corrida crea todo el dataset y deja cada pedido en su estado objetivo', async () => {
    const { gateway, statusById } = memoryGateway()
    const report = await runDemoSeed(gateway, DEMO_DATASET, CREDENTIALS)

    expect(report.created.usuarios).toBe(DEMO_DATASET.users.length)
    expect(report.created.pedidos).toBe(DEMO_DATASET.orders.length)
    expect(report.created.recetas).toBe(DEMO_DATASET.recipes.length)
    expect(report.created.lotes).toBe(DEMO_DATASET.products.flatMap((product) => product.batches).length)
    expect([...statusById.values()].sort()).toEqual(DEMO_DATASET.orders.map((order) => order.target).sort())
    expect(report.warnings.filter((warning) => warning.startsWith('pedido'))).toEqual([])
  })

  it('es idempotente: la segunda corrida no escribe nada y lo cuenta todo como existente', async () => {
    const { gateway, writes } = memoryGateway()
    const first = await runDemoSeed(gateway, DEMO_DATASET, CREDENTIALS)
    const writesAfterFirst = writes.length

    const second = await runDemoSeed(gateway, DEMO_DATASET, CREDENTIALS)

    expect(writes.length).toBe(writesAfterFirst)
    expect(Object.values(second.created).every((count) => count === 0)).toBe(true)
    expect(second.existing.pedidos).toBe(first.created.pedidos)
    expect(second.existing.usuarios).toBe(first.created.usuarios)
  })

  it('retoma un pedido que quedo a medias desde su estado actual, sin crear otro', async () => {
    const { gateway, writes, statusById, orders } = memoryGateway()
    await runDemoSeed(gateway, DEMO_DATASET, CREDENTIALS)
    const terminado = DEMO_DATASET.orders.find((order) => order.target === 'TERMINADO')
    expect(terminado).toBeDefined()
    const stored = [...orders.values()].find((order) => statusById.get(order.id) === 'TERMINADO')
    expect(stored).toBeDefined()
    statusById.set(stored!.id, 'EN_EMPAQUE')
    const before = writes.length

    const report = await runDemoSeed(gateway, DEMO_DATASET, CREDENTIALS)

    expect(report.created.pedidos).toBe(0)
    expect(writes.slice(before)).toEqual(['step:finishPacking', 'step:startConditioning', 'step:finishConditioning'])
    expect(statusById.get(stored!.id)).toBe('TERMINADO')
  })

  it('activa un usuario de demo que existe pero no esta activo', async () => {
    const { gateway, writes } = memoryGateway()
    await runDemoSeed(gateway, DEMO_DATASET, CREDENTIALS)
    const user = DEMO_DATASET.users[0]
    const found = await gateway.findUser(user.username)
    const activations = writes.filter((write) => write === 'activate').length
    // Un usuario sin la marca de activo: la siguiente corrida solo lo activa.
    const original = gateway.findUser
    gateway.findUser = async (username) =>
      username === user.username && found !== null ? { id: found.id, active: false } : original(username)

    await runDemoSeed(gateway, DEMO_DATASET, CREDENTIALS)

    expect(writes.filter((write) => write === 'activate').length).toBe(activations + 1)
  })
})

describe('seed de demo — cobertura del dataset', () => {
  it('hay un pedido en cada estado alcanzable del enum y solo ENTREGADO queda fuera', () => {
    const targets = new Set(DEMO_DATASET.orders.map((order) => order.target))
    const missing = ORDER_STATUS_VALUES.filter((status) => !targets.has(status))
    expect(missing).toEqual([...UNREACHABLE_ORDER_STATUSES])
  })

  it('hay pedidos con todas las prioridades', () => {
    const priorities = new Set(DEMO_DATASET.orders.map((order) => order.priority))
    expect([...priorities].sort()).toEqual([...ORDER_PRIORITY_VALUES].sort())
  })

  it('hay insumos, envases e instrumentos, y un lote de cada uno', () => {
    const types = new Set(DEMO_DATASET.products.map((product) => product.type))
    expect([...types].sort()).toEqual(['MACHINE', 'PACKAGING', 'PRODUCT'])
    expect(DEMO_DATASET.products.every((product) => product.batches.length > 0)).toBe(true)
  })

  it('una receta tiene dos versiones', () => {
    expect(DEMO_DATASET.recipes.some((recipe) => recipe.versions.length === 2)).toBe(true)
  })

  it('cada pedido es unico por receta efectiva y cantidad, que es su clave de idempotencia', () => {
    const keys = DEMO_DATASET.orders.map((order) => `${order.recipe}/${order.version ?? ''}:${order.quantity}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('todo nombre, lote y usuario lleva el marcador de demo', () => {
    const names = [
      ...DEMO_DATASET.units.map((unit) => unit.name),
      ...DEMO_DATASET.presentations.map((presentation) => presentation.name),
      ...DEMO_DATASET.products.map((product) => product.name),
      ...DEMO_DATASET.suppliers.map((supplier) => supplier.name),
      ...DEMO_DATASET.suppliers.flatMap((supplier) => supplier.catalog.map((line) => line.name)),
      ...DEMO_DATASET.customers.map((customer) => customer.firstNames),
      ...DEMO_DATASET.recipes.map((recipe) => recipe.name),
      ...DEMO_DATASET.recipes.flatMap((recipe) => recipe.versions.map((version) => version.name)),
      ...DEMO_DATASET.workGroups.map((group) => group.name),
      ...DEMO_DATASET.users.map((user) => user.firstNames),
    ]
    expect(names.filter((name) => !name.startsWith(`${DEMO_PREFIX} `))).toEqual([])
    const lots = DEMO_DATASET.products.flatMap((product) => product.batches.map((batch) => batch.lot))
    expect(lots.filter((lot) => !lot.startsWith(`${DEMO_PREFIX}-`))).toEqual([])
    expect(DEMO_DATASET.users.filter((user) => !user.username.startsWith('demo.'))).toEqual([])
  })
})

describe('seed de demo — caminos de estado', () => {
  it('recorre el flujo completo de PENDIENTE a TERMINADO', () => {
    expect(stepsToReach('PENDIENTE', 'TERMINADO')).toEqual([
      'start',
      'finish',
      'startPacking',
      'finishPacking',
      'startConditioning',
      'finishConditioning',
    ])
  })

  it('no hay camino a ENTREGADO, ni hacia atras, ni hacia BLOQUEADO', () => {
    expect(stepsToReach('TERMINADO', 'ENTREGADO')).toBeNull()
    expect(stepsToReach('EN_CURSO', 'PENDIENTE')).toBeNull()
    expect(stepsToReach('PENDIENTE', 'BLOQUEADO')).toBeNull()
  })

  it('solo se cancela antes de consumir material: PENDIENTE, EN_CURSO o BLOQUEADO', () => {
    expect(stepsToReach('PENDIENTE', 'CANCELADO')).toEqual(['cancel'])
    expect(stepsToReach('EN_CURSO', 'CANCELADO')).toEqual(['cancel'])
    expect(stepsToReach('BLOQUEADO', 'CANCELADO')).toEqual(['cancel'])
    expect(stepsToReach('POR_EMPACAR', 'CANCELADO')).toBeNull()
  })

  it('un pedido que ya esta en su objetivo no necesita pasos', () => {
    expect(stepsToReach('EN_EMPAQUE', 'EN_EMPAQUE')).toEqual([])
  })
})
