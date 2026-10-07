// QC-156 B3 — El cliente en el alta y en la edicion general (R10, R11, R12, R13, R15).
//
// El catalogo de clientes es un doble que se comporta como el de verdad: `findAliveRefById`
// devuelve `null` para un id inexistente, dado de baja o de otra empresa, y CUENTA sus llamadas
// para demostrar que un id sin forma de uuid no llega a consultarse.
//
// El atajo de la edicion (R13): cuando solo cambia el cliente, los dobles de recetas, productos,
// unidades, presentaciones y envases FALLAN si se les llama, y de la unidad de trabajo solo se
// admite `setCustomerAlive`.

import { describe, expect, it, vi } from 'vitest'

import { createCreateOrder, type CreateOrderDeps } from '@/lib/modules/pedidos/domain/create-order'
import { createUpdateOrder, type UpdateOrderDeps } from '@/lib/modules/pedidos/domain/update-order'
import { fakePackagingCatalog, packagingRef } from '@/tests/helpers/packaging-catalog-double'
import { fakeUnitOfWork } from '@/tests/helpers/order-unit-of-work-double'

import type { CustomerRef } from '@/lib/modules/clientes'
import type { PackagingCatalog, PresentationCatalog, ProductCatalog } from '@/lib/modules/inventario'
import type { Actor } from '@/lib/modules/pedidos/domain/actor'
import type { PedidosError } from '@/lib/modules/pedidos/domain/errors'
import type { OrderStatus } from '@/lib/modules/pedidos/domain/order-classification'
import type { OrderRow } from '@/lib/modules/pedidos/domain/order-view'
import type { OrderRepository } from '@/lib/modules/pedidos/ports/order-repository'
import type { RecipeCatalog, RecipeRef } from '@/lib/modules/recetas'
import type { UnitCatalog } from '@/lib/modules/unidades'

const EMPRESA = '33333333-3333-4333-8333-333333333333'
const OTRA_EMPRESA = '44444444-4444-4444-8444-444444444444'
const ACTOR: Actor = { id: 'admin-1', companyId: EMPRESA, permissions: ['pedidos.consultar', 'pedidos.modificar'] }
const SCOPE = { companyId: EMPRESA }
const AHORA = new Date('2026-10-06T10:00:00.000Z')

const ORDER_ID = '11111111-1111-4111-8111-111111111111'
const RECETA = '22222222-2222-4222-8222-222222222222'
const VERSION = '25252525-2525-4525-8525-252525252525'
const UNIDAD = '77777777-7777-4777-8777-777777777777'
const OTRA_UNIDAD = '78787878-7878-4878-8878-787878787878'
const ENVASE_A = 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1'
const ENVASE_B = 'e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2'
const PRES_A = '66666666-6666-4666-8666-666666666666'
const PRES_B = '67676767-6767-4767-8767-676767676767'

const CLIENTE_A = 'c0000000-0000-4000-8000-00000000000a'
const CLIENTE_B = 'c0000000-0000-4000-8000-00000000000b'
const CLIENTE_DE_BAJA = 'c0000000-0000-4000-8000-0000000000dd'
const CLIENTE_AJENO = 'c0000000-0000-4000-8000-0000000000ee'
const CLIENTE_INEXISTENTE = 'c0000000-0000-4000-8000-0000000000ff'

const CLIENTES: readonly { readonly companyId: string; readonly ref: CustomerRef }[] = [
  { companyId: EMPRESA, ref: { id: CLIENTE_A, firstNames: 'Ana', lastNames: 'Perez', isDeleted: false } },
  { companyId: EMPRESA, ref: { id: CLIENTE_B, firstNames: 'Luis', lastNames: 'Rojas', isDeleted: false } },
  { companyId: EMPRESA, ref: { id: CLIENTE_DE_BAJA, firstNames: 'Eva', lastNames: 'Baja', isDeleted: true } },
  { companyId: OTRA_EMPRESA, ref: { id: CLIENTE_AJENO, firstNames: 'Otro', lastNames: 'Ajeno', isDeleted: false } },
]

const REFS_RECETA: readonly RecipeRef[] = [
  { id: RECETA, name: 'Crema', ownName: 'Crema', isDeleted: false, isUnderReview: false, original: null },
  {
    id: VERSION,
    name: 'Crema · Suave',
    ownName: 'Suave',
    isDeleted: false,
    isUnderReview: false,
    original: { id: RECETA, name: 'Crema' },
  },
]

function catalogoDeClientes() {
  const findAliveRefById = vi.fn(async (id: string, companyId: string): Promise<CustomerRef | null> => {
    const guardado = CLIENTES.find((c) => c.ref.id === id)
    if (guardado === undefined || guardado.companyId !== companyId || guardado.ref.isDeleted) return null
    return guardado.ref
  })
  return { customerCatalog: { findAliveRefById }, findAliveRefById }
}

function explota(nombre: string) {
  return vi.fn(() => {
    throw new Error(`${nombre} no deberia llamarse en este caso`)
  })
}

/** Catalogos que funcionan, para el camino completo del alta y de la edicion. */
function catalogosVivos() {
  const recipes = {
    findRefsIncludingDeleted: vi.fn(async (ids: readonly string[]) => REFS_RECETA.filter((r) => ids.includes(r.id))),
    findExecutionContentById: vi.fn(async (id: string) => ({ id, name: 'Crema', isDeleted: false, steps: [], lines: [] })),
  }
  const products = { findRefs: vi.fn(async () => []), findCostingBatches: vi.fn(async () => []) }
  const units = {
    findRefs: vi.fn(async (ids: readonly string[]) =>
      ids.flatMap((id) => ([UNIDAD, OTRA_UNIDAD].includes(id) ? [{ id, baseUnitId: null, factor: null }] : [])),
    ),
    findRefsSharingBaseInCompany: vi.fn(async () => []),
    findMassVolumeBridge: vi.fn(async () => null),
  }
  const presentations = { findRefs: vi.fn(async () => []) }
  const packaging = fakePackagingCatalog([
    packagingRef({ id: ENVASE_A, presentationId: PRES_A, content: '1.0000', unitId: UNIDAD }),
    packagingRef({ id: ENVASE_B, presentationId: PRES_B, content: '1.0000', unitId: UNIDAD }),
  ])
  return {
    recipes: recipes as unknown as RecipeCatalog,
    products: products as unknown as ProductCatalog,
    units: units as unknown as UnitCatalog,
    presentations: presentations as unknown as PresentationCatalog,
    packaging: packaging as PackagingCatalog,
    espias: [
      ...Object.values(recipes),
      ...Object.values(products),
      ...Object.values(units),
      ...Object.values(presentations),
      packaging.findRefs,
      packaging.findCostingBatches,
    ],
  }
}

/** Catalogos que fallan si se les llama: el atajo no puede leer ninguno. */
function catalogosQueExplotan() {
  return {
    recipes: { findRefsIncludingDeleted: explota('recipes.findRefsIncludingDeleted'), findExecutionContentById: explota('recipes.findExecutionContentById') } as unknown as RecipeCatalog,
    products: { findRefs: explota('products.findRefs'), findCostingBatches: explota('products.findCostingBatches') } as unknown as ProductCatalog,
    units: {
      findRefs: explota('units.findRefs'),
      findRefsSharingBaseInCompany: explota('units.findRefsSharingBaseInCompany'),
      findMassVolumeBridge: explota('units.findMassVolumeBridge'),
    } as unknown as UnitCatalog,
    presentations: { findRefs: explota('presentations.findRefs') } as unknown as PresentationCatalog,
    packaging: { findRefs: explota('packaging.findRefs'), findCostingBatches: explota('packaging.findCostingBatches') } as unknown as PackagingCatalog,
  }
}

function filaGuardada(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    id: ORDER_ID,
    number: { year: 2026, sequence: 7 },
    recipeId: RECETA,
    quantity: '10.0000',
    priority: 'MEDIA',
    status: 'PENDIENTE',
    cancellationReason: null,
    ingredientsCost: null,
    createdAt: new Date('2026-01-02T03:04:05.000Z'),
    updatedAt: new Date('2026-01-02T03:04:05.000Z'),
    createdBy: 'admin-0',
    updatedBy: 'admin-0',
    presentationLines: [
      { presentationId: PRES_A, packages: 2, packagingProductId: ENVASE_A },
      { presentationId: PRES_B, packages: 3, packagingProductId: ENVASE_B },
    ],
    unitId: UNIDAD,
    customerId: CLIENTE_A,
    ...overrides,
  }
}

/** La edicion que deja todo igual que `filaGuardada()`, salvo lo que el caso cambie. */
function edicionIgual(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    recipeId: RECETA,
    quantity: '10.0000',
    priority: 'MEDIA',
    unitId: UNIDAD,
    presentationLines: [
      { packagingProductId: ENVASE_A, packages: 2 },
      { packagingProductId: ENVASE_B, packages: 3 },
    ],
    customerId: CLIENTE_A,
    ...overrides,
  }
}

function unidadDeTrabajo(fila: OrderRow, setCustomerAliveResult: 'ok' | 'not_found' = 'ok') {
  const created = { ...fila, customerId: null }
  return fakeUnitOfWork({
    orders: {
      create: vi.fn(async () => created),
      lockAliveById: vi.fn(async () => ({ ...fila, reservedAt: null, packagingCost: null })),
      updateAlive: vi.fn(async () => 'ok' as const),
      setReservedAt: vi.fn(async () => undefined),
      setCustomerAlive: vi.fn(async () => setCustomerAliveResult),
    },
  })
}

function escenarioDeEdicion(opciones: {
  fila?: Partial<OrderRow>
  catalogos?: 'vivos' | 'explotan'
  setCustomerAlive?: 'ok' | 'not_found'
} = {}) {
  const fila = filaGuardada(opciones.fila)
  const uow = unidadDeTrabajo(fila, opciones.setCustomerAlive)
  const clientes = catalogoDeClientes()
  const vivos = catalogosVivos()
  const catalogos = opciones.catalogos === 'explotan' ? catalogosQueExplotan() : vivos
  const orders = { findAliveById: vi.fn(async () => fila), listAlive: explota('orders.listAlive') }
  const deps: UpdateOrderDeps = {
    orders: orders as unknown as OrderRepository,
    recipes: catalogos.recipes,
    products: catalogos.products,
    units: catalogos.units,
    presentations: catalogos.presentations,
    packaging: catalogos.packaging,
    customerCatalog: clientes.customerCatalog,
    unitOfWork: uow.unitOfWork,
    now: () => AHORA,
  }
  return { deps, uow, clientes, vivos, updateOrder: createUpdateOrder(deps) }
}

function escenarioDeAlta() {
  const uow = unidadDeTrabajo(filaGuardada({ customerId: null }))
  const clientes = catalogoDeClientes()
  const vivos = catalogosVivos()
  const deps: CreateOrderDeps = {
    recipes: vivos.recipes,
    products: vivos.products,
    units: vivos.units,
    presentations: vivos.presentations,
    packaging: vivos.packaging,
    customerCatalog: clientes.customerCatalog,
    unitOfWork: uow.unitOfWork,
    now: () => AHORA,
  }
  return { uow, clientes, createOrder: createCreateOrder(deps) }
}

const ALTA = { recipeId: RECETA, quantity: '10', unitId: UNIDAD }

async function codigoDelFallo(operacion: () => Promise<unknown>): Promise<string> {
  const error = await operacion().then(
    () => null,
    (e: unknown) => e,
  )
  expect(error, 'la operacion tenia que fallar').not.toBeNull()
  return (error as PedidosError).code
}

/** El `customerId` que recibio el puerto en su primera llamada al metodo dado. */
function customerIdEscrito(metodo: ReturnType<typeof vi.fn>): unknown {
  const args = (metodo.mock.calls[0] ?? []) as readonly unknown[]
  const data = args.find((arg) => typeof arg === 'object' && arg !== null && 'customerId' in arg)
  if (data === undefined) throw new Error('el puerto no recibio datos con customerId')
  return (data as { customerId: unknown }).customerId
}

/** Lo que la unidad de trabajo vio, salvo `setCustomerAlive`: tiene que estar vacio en el atajo. */
function otrasLlamadasDeLaUnidad(uow: ReturnType<typeof unidadDeTrabajo>): string[] {
  const vistas: string[] = []
  for (const [nombre, metodo] of Object.entries(uow.orders)) {
    if (nombre !== 'setCustomerAlive' && metodo.mock.calls.length > 0) vistas.push(`orders.${nombre}`)
  }
  for (const [nombre, metodo] of Object.entries(uow.reservations)) {
    if (metodo.mock.calls.length > 0) vistas.push(`reservations.${nombre}`)
  }
  if (uow.recipes.findExecutionContentById.mock.calls.length > 0) vistas.push('recipes.findExecutionContentById')
  return vistas
}

describe('createOrder — el cliente en el alta (R10, R11)', () => {
  it('R10: con un cliente vivo de la empresa guarda su referencia', async () => {
    const e = escenarioDeAlta()

    await e.createOrder({ ...ALTA, customerId: CLIENTE_A }, ACTOR)

    expect(e.clientes.findAliveRefById).toHaveBeenCalledTimes(1)
    expect(e.clientes.findAliveRefById).toHaveBeenCalledWith(CLIENTE_A, EMPRESA)
    expect(customerIdEscrito(e.uow.orders.create)).toBe(CLIENTE_A)
  })

  it('R10: sin cliente guarda el pedido sin cliente y no consulta el catalogo', async () => {
    const e = escenarioDeAlta()

    await e.createOrder(ALTA, ACTOR)

    expect(e.clientes.findAliveRefById).not.toHaveBeenCalled()
    expect(customerIdEscrito(e.uow.orders.create)).toBeNull()
  })

  it('R10: con el cliente vacio guarda el pedido sin cliente y no consulta el catalogo', async () => {
    const e = escenarioDeAlta()

    await e.createOrder({ ...ALTA, customerId: '' }, ACTOR)

    expect(e.clientes.findAliveRefById).not.toHaveBeenCalled()
    expect(customerIdEscrito(e.uow.orders.create)).toBeNull()
  })

  it.each([
    ['no existe', CLIENTE_INEXISTENTE],
    ['esta dado de baja', CLIENTE_DE_BAJA],
    ['es de otra empresa', CLIENTE_AJENO],
  ])('R11: un cliente que %s da customer_not_found y no escribe nada', async (_causa, customerId) => {
    const e = escenarioDeAlta()

    expect(await codigoDelFallo(() => e.createOrder({ ...ALTA, customerId }, ACTOR))).toBe('customer_not_found')
    expect(e.clientes.findAliveRefById).toHaveBeenCalledTimes(1)
    expect(e.uow.orders.create).not.toHaveBeenCalled()
    expect(e.uow.reservations.syncForOrder).not.toHaveBeenCalled()
  })

  it('R11: un id sin forma de uuid da customer_not_found con CERO llamadas al catalogo y sin escribir', async () => {
    const e = escenarioDeAlta()

    for (const customerId of ['no-es-uuid', '123', `${CLIENTE_A}x`]) {
      expect(await codigoDelFallo(() => e.createOrder({ ...ALTA, customerId }, ACTOR))).toBe('customer_not_found')
    }
    expect(e.clientes.findAliveRefById).not.toHaveBeenCalled()
    expect(e.uow.orders.create).not.toHaveBeenCalled()
  })
})

describe('updateOrder — el cliente en la edicion por el camino completo (R11, R12, R13)', () => {
  // Todas cambian la cantidad: el atajo no aplica y se ejercita el reemplazo completo.
  it('R12: el MISMO cliente, aunque este dado de baja, se acepta sin consultar el catalogo', async () => {
    const e = escenarioDeEdicion({ fila: { customerId: CLIENTE_DE_BAJA } })

    await e.updateOrder(ORDER_ID, edicionIgual({ quantity: '12', customerId: CLIENTE_DE_BAJA }), ACTOR)

    expect(e.clientes.findAliveRefById).not.toHaveBeenCalled()
    expect(customerIdEscrito(e.uow.orders.updateAlive)).toBe(CLIENTE_DE_BAJA)
  })

  it('R11: un cliente DISTINTO dado de baja se rechaza y no escribe nada', async () => {
    const e = escenarioDeEdicion()

    expect(
      await codigoDelFallo(() =>
        e.updateOrder(ORDER_ID, edicionIgual({ quantity: '12', customerId: CLIENTE_DE_BAJA }), ACTOR),
      ),
    ).toBe('customer_not_found')
    expect(e.uow.orders.updateAlive).not.toHaveBeenCalled()
    expect(e.uow.orders.lockAliveById).not.toHaveBeenCalled()
    expect(e.uow.orders.setCustomerAlive).not.toHaveBeenCalled()
  })

  it.each([
    ['no existe', CLIENTE_INEXISTENTE],
    ['es de otra empresa', CLIENTE_AJENO],
  ])('R11: un cliente distinto que %s se rechaza y no escribe nada', async (_causa, customerId) => {
    const e = escenarioDeEdicion()

    expect(
      await codigoDelFallo(() => e.updateOrder(ORDER_ID, edicionIgual({ quantity: '12', customerId }), ACTOR)),
    ).toBe('customer_not_found')
    expect(e.uow.orders.updateAlive).not.toHaveBeenCalled()
  })

  it('R11: un id sin forma en la edicion da customer_not_found sin consultar el catalogo', async () => {
    const e = escenarioDeEdicion()

    expect(
      await codigoDelFallo(() =>
        e.updateOrder(ORDER_ID, edicionIgual({ quantity: '12', customerId: 'no-es-uuid' }), ACTOR),
      ),
    ).toBe('customer_not_found')
    expect(e.clientes.findAliveRefById).not.toHaveBeenCalled()
    expect(e.uow.orders.updateAlive).not.toHaveBeenCalled()
  })

  it('R13: sin cliente en la edicion el pedido queda sin cliente (reemplazo completo)', async () => {
    const e = escenarioDeEdicion()
    const { customerId: _quitado, ...sinCliente } = edicionIgual({ quantity: '12' })
    void _quitado

    await e.updateOrder(ORDER_ID, sinCliente, ACTOR)

    expect(e.clientes.findAliveRefById).not.toHaveBeenCalled()
    expect(customerIdEscrito(e.uow.orders.updateAlive)).toBeNull()
  })

  it('R10: un cliente vivo distinto con otro dato cambiado se comprueba y se escribe con el resto', async () => {
    const e = escenarioDeEdicion()

    await e.updateOrder(ORDER_ID, edicionIgual({ quantity: '12', customerId: CLIENTE_B }), ACTOR)

    expect(e.clientes.findAliveRefById).toHaveBeenCalledWith(CLIENTE_B, EMPRESA)
    expect(customerIdEscrito(e.uow.orders.updateAlive)).toBe(CLIENTE_B)
    expect(e.uow.reservations.syncForOrder).toHaveBeenCalledTimes(1)
    expect(e.uow.orders.setCustomerAlive).not.toHaveBeenCalled()
  })
})

describe('updateOrder — el atajo de la edicion que solo cambia el cliente (R13, R15)', () => {
  it('R13: solo cambia el cliente -> solo setCustomerAlive(id, cliente, actor, ahora, scope), sin catalogos', async () => {
    const e = escenarioDeEdicion({ catalogos: 'explotan' })

    await e.updateOrder(ORDER_ID, edicionIgual({ customerId: CLIENTE_B }), ACTOR)

    expect(e.uow.orders.setCustomerAlive).toHaveBeenCalledTimes(1)
    expect(e.uow.orders.setCustomerAlive).toHaveBeenCalledWith(ORDER_ID, CLIENTE_B, ACTOR.id, AHORA, SCOPE)
    expect(otrasLlamadasDeLaUnidad(e.uow)).toEqual([])
    expect(e.clientes.findAliveRefById).toHaveBeenCalledTimes(1)
  })

  it('R13: la cantidad "10" frente a la guardada "10.0000" sigue siendo el atajo', async () => {
    const e = escenarioDeEdicion({ catalogos: 'explotan' })

    await e.updateOrder(ORDER_ID, edicionIgual({ quantity: '10', customerId: CLIENTE_B }), ACTOR)

    expect(e.uow.orders.setCustomerAlive).toHaveBeenCalledTimes(1)
    expect(otrasLlamadasDeLaUnidad(e.uow)).toEqual([])
  })

  it('R13: el reparto en otro orden sigue siendo el atajo', async () => {
    const e = escenarioDeEdicion({ catalogos: 'explotan' })

    await e.updateOrder(
      ORDER_ID,
      edicionIgual({
        customerId: CLIENTE_B,
        presentationLines: [
          { packagingProductId: ENVASE_B, packages: 3 },
          { packagingProductId: ENVASE_A, packages: 2 },
        ],
      }),
      ACTOR,
    )

    expect(e.uow.orders.setCustomerAlive).toHaveBeenCalledTimes(1)
    expect(otrasLlamadasDeLaUnidad(e.uow)).toEqual([])
  })

  it('R13: quitar el cliente sin cambiar nada mas es el atajo con null y sin consultar el catalogo', async () => {
    const e = escenarioDeEdicion({ catalogos: 'explotan' })

    await e.updateOrder(ORDER_ID, edicionIgual({ customerId: '' }), ACTOR)

    expect(e.uow.orders.setCustomerAlive).toHaveBeenCalledWith(ORDER_ID, null, ACTOR.id, AHORA, SCOPE)
    expect(e.clientes.findAliveRefById).not.toHaveBeenCalled()
    expect(otrasLlamadasDeLaUnidad(e.uow)).toEqual([])
  })

  it('R13: poner cliente a un pedido que no tenia es el atajo', async () => {
    const e = escenarioDeEdicion({ catalogos: 'explotan', fila: { customerId: null } })

    await e.updateOrder(ORDER_ID, edicionIgual({ customerId: CLIENTE_A }), ACTOR)

    expect(e.uow.orders.setCustomerAlive).toHaveBeenCalledWith(ORDER_ID, CLIENTE_A, ACTOR.id, AHORA, SCOPE)
  })

  it('R11: en el atajo, un cliente dado de baja distinto se rechaza sin escribir', async () => {
    const e = escenarioDeEdicion({ catalogos: 'explotan' })

    expect(await codigoDelFallo(() => e.updateOrder(ORDER_ID, edicionIgual({ customerId: CLIENTE_DE_BAJA }), ACTOR))).toBe(
      'customer_not_found',
    )
    expect(e.uow.orders.setCustomerAlive).not.toHaveBeenCalled()
  })

  it('R11: en el atajo, un id sin forma se rechaza sin consultar el catalogo', async () => {
    const e = escenarioDeEdicion({ catalogos: 'explotan' })

    expect(await codigoDelFallo(() => e.updateOrder(ORDER_ID, edicionIgual({ customerId: 'xyz' }), ACTOR))).toBe(
      'customer_not_found',
    )
    expect(e.clientes.findAliveRefById).not.toHaveBeenCalled()
    expect(e.uow.orders.setCustomerAlive).not.toHaveBeenCalled()
  })

  it('R13: si el pedido desaparecio al escribir, order_not_found', async () => {
    const e = escenarioDeEdicion({ catalogos: 'explotan', setCustomerAlive: 'not_found' })

    expect(await codigoDelFallo(() => e.updateOrder(ORDER_ID, edicionIgual({ customerId: CLIENTE_B }), ACTOR))).toBe(
      'order_not_found',
    )
  })

  it('R13: el mismo cliente y nada mas cambia -> camino de siempre (recalcula y sincroniza)', async () => {
    const e = escenarioDeEdicion()

    await e.updateOrder(ORDER_ID, edicionIgual(), ACTOR)

    expect(e.uow.orders.setCustomerAlive).not.toHaveBeenCalled()
    expect(e.uow.orders.updateAlive).toHaveBeenCalledTimes(1)
    expect(e.uow.reservations.syncForOrder).toHaveBeenCalledTimes(1)
    expect(customerIdEscrito(e.uow.orders.updateAlive)).toBe(CLIENTE_A)
  })

  it.each<[string, Record<string, unknown>]>([
    ['la cantidad', { quantity: '11' }],
    ['la prioridad', { priority: 'ALTA' }],
    ['la unidad', { unitId: OTRA_UNIDAD, presentationLines: [] }],
    ['la receta (eligiendo una version)', { recipeVersionId: VERSION }],
    [
      'una linea del reparto',
      {
        presentationLines: [
          { packagingProductId: ENVASE_A, packages: 4 },
          { packagingProductId: ENVASE_B, packages: 3 },
        ],
      },
    ],
  ])('R13: cliente distinto y cambia %s -> camino de siempre', async (_dato, cambio) => {
    const e = escenarioDeEdicion()

    await e.updateOrder(ORDER_ID, edicionIgual({ customerId: CLIENTE_B, ...cambio }), ACTOR)

    expect(e.uow.orders.setCustomerAlive).not.toHaveBeenCalled()
    expect(e.uow.orders.updateAlive).toHaveBeenCalledTimes(1)
    expect(e.uow.reservations.syncForOrder).toHaveBeenCalledTimes(1)
    expect(e.vivos.espias.some((espia) => espia.mock.calls.length > 0)).toBe(true)
    expect(customerIdEscrito(e.uow.orders.updateAlive)).toBe(CLIENTE_B)
  })

  it('R13: un pedido guardado sin unidad nunca toma el atajo', async () => {
    const e = escenarioDeEdicion({ fila: { unitId: null, presentationLines: [] } })

    await e.updateOrder(ORDER_ID, edicionIgual({ customerId: CLIENTE_B, presentationLines: [] }), ACTOR)

    expect(e.uow.orders.setCustomerAlive).not.toHaveBeenCalled()
    expect(e.uow.orders.updateAlive).toHaveBeenCalledTimes(1)
  })

  it.each<OrderStatus>(['POR_EMPACAR', 'EN_EMPAQUE', 'ENTREGADO', 'CANCELADO'])(
    'R13: en %s assertTransition rechaza ANTES del atajo',
    async (status) => {
      const e = escenarioDeEdicion({ catalogos: 'explotan', fila: { status } })

      expect(await codigoDelFallo(() => e.updateOrder(ORDER_ID, edicionIgual({ customerId: CLIENTE_B }), ACTOR))).toBe(
        'invalid_transition',
      )
      expect(e.clientes.findAliveRefById).not.toHaveBeenCalled()
      expect(e.uow.orders.setCustomerAlive).not.toHaveBeenCalled()
    },
  )
})
