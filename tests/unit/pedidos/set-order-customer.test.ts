// QC-156 B4 — El cambio de cliente dedicado (R11, R12, R14-R18).
// QC-215 B7 (T21) — R14 enmendada por D14: se rechaza con `action_not_allowed` en `ENTREGADO` y
// `CANCELADO` (R36) y se acepta en los otros ocho estados (R37).
//
// La unidad de trabajo es el doble compartido: todo metodo que no sea `lockAliveById` o
// `setCustomerAlive` explota si se le llama, y aun asi se comprueba al final que ninguno se llamo.

import { describe, expect, it, vi } from 'vitest'

import { ORDER_STATUS_VALUES, type OrderStatus } from '@/lib/modules/pedidos/domain/order-classification'
import {
  CUSTOMER_EDITABLE_STATUSES,
  createSetOrderCustomer,
  type SetOrderCustomerDeps,
} from '@/lib/modules/pedidos/domain/set-order-customer'
import { fakeUnitOfWork } from '@/tests/helpers/order-unit-of-work-double'

import type { CustomerRef } from '@/lib/modules/clientes'
import type { Actor } from '@/lib/modules/pedidos/domain/actor'
import type { PedidosError } from '@/lib/modules/pedidos/domain/errors'
import type { OrderRow } from '@/lib/modules/pedidos/domain/order-view'
import type { OrderRepository } from '@/lib/modules/pedidos/ports/order-repository'
import type { LockedOrderRow } from '@/lib/modules/pedidos/ports/order-write-repository'

const EMPRESA = '33333333-3333-4333-8333-333333333333'
const OTRA_EMPRESA = '44444444-4444-4444-8444-444444444444'
const ACTOR: Actor = { id: 'admin-1', companyId: EMPRESA, permissions: ['pedidos.modificar'] }
const SCOPE = { companyId: EMPRESA }
const AHORA = new Date('2026-10-06T10:00:00.000Z')
const ORDER_ID = '11111111-1111-4111-8111-111111111111'

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

function fila(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    id: ORDER_ID,
    number: { year: 2026, sequence: 7 },
    recipeId: '22222222-2222-4222-8222-222222222222',
    quantity: '10.0000',
    priority: 'MEDIA',
    status: 'PENDIENTE',
    cancellationReason: null,
    ingredientsCost: '12.5000',
    createdAt: new Date('2026-01-02T03:04:05.000Z'),
    updatedAt: new Date('2026-01-02T03:04:05.000Z'),
    createdBy: 'admin-0',
    updatedBy: 'admin-0',
    presentationLines: [],
    unitId: '77777777-7777-4777-8777-777777777777',
    customerId: CLIENTE_A,
    ...overrides,
  }
}

const ESTADOS_CERRADOS: readonly OrderStatus[] = ['ENTREGADO', 'CANCELADO']
const ESTADOS_ABIERTOS: readonly OrderStatus[] = ORDER_STATUS_VALUES.filter((s) => !ESTADOS_CERRADOS.includes(s))

function bloqueada(row: OrderRow): LockedOrderRow {
  return { ...row, reservedAt: null, packagingCost: null }
}

function escenario(
  opciones: {
    fila?: OrderRow | null
    /** La fila que ve `lockAliveById` dentro de la transaccion; por defecto, la misma que se leyo. */
    bloqueada?: OrderRow | null
    setCustomerAlive?: 'ok' | 'not_found'
    /** El catalogo de clientes, la unidad de trabajo y la escritura explotan si se tocan. */
    explotaSiEscribe?: boolean
  } = {},
) {
  const row = opciones.fila === undefined ? fila() : opciones.fila
  const filaBloqueada = opciones.bloqueada === undefined ? row : opciones.bloqueada
  const explota = (nombre: string) => (): never => {
    throw new Error(`${nombre} no deberia llamarse en un pedido cerrado`)
  }
  const findAliveById = vi.fn(async (id: string, scope: { companyId: string }) => {
    void id
    // Como el puerto real: un pedido de otra empresa no vuelve.
    return scope.companyId === EMPRESA ? row : null
  })
  const orders = {
    findAliveById,
    listAlive: vi.fn(() => {
      throw new Error('listAlive no deberia llamarse')
    }),
  }
  const findAliveRefById = vi.fn(async (id: string, companyId: string): Promise<CustomerRef | null> => {
    if (opciones.explotaSiEscribe === true) explota('customerCatalog.findAliveRefById')()
    const guardado = CLIENTES.find((c) => c.ref.id === id)
    if (guardado === undefined || guardado.companyId !== companyId || guardado.ref.isDeleted) return null
    return guardado.ref
  })
  const setCustomerAlive = vi.fn(async () => {
    if (opciones.explotaSiEscribe === true) explota('orders.setCustomerAlive')()
    return opciones.setCustomerAlive ?? ('ok' as const)
  })
  const lockAliveById = vi.fn(async () => {
    if (opciones.explotaSiEscribe === true) explota('orders.lockAliveById')()
    return filaBloqueada === null ? null : bloqueada(filaBloqueada)
  })
  const uow = fakeUnitOfWork({ orders: { lockAliveById, setCustomerAlive } })
  const run = vi.spyOn(uow.unitOfWork, 'run')
  if (opciones.explotaSiEscribe === true) run.mockImplementation(explota('unitOfWork.run'))
  const deps: SetOrderCustomerDeps = {
    orders: orders as unknown as OrderRepository,
    customerCatalog: { findAliveRefById },
    unitOfWork: uow.unitOfWork,
    now: () => AHORA,
  }
  return {
    deps,
    uow,
    run,
    findAliveById,
    findAliveRefById,
    lockAliveById,
    setCustomerAlive,
    setOrderCustomer: createSetOrderCustomer(deps),
  }
}

/** Todo lo que la unidad de trabajo vio, salvo `lockAliveById` y `setCustomerAlive`. */
function otrasLlamadas(uow: ReturnType<typeof fakeUnitOfWork>): string[] {
  const vistas: string[] = []
  for (const [nombre, metodo] of Object.entries(uow.orders)) {
    if (nombre === 'setCustomerAlive' || nombre === 'lockAliveById') continue
    if (metodo.mock.calls.length > 0) vistas.push(`orders.${nombre}`)
  }
  for (const [nombre, metodo] of Object.entries(uow.reservations)) {
    if (metodo.mock.calls.length > 0) vistas.push(`reservations.${nombre}`)
  }
  for (const [nombre, metodo] of Object.entries(uow.finishedGoods)) {
    if (metodo.mock.calls.length > 0) vistas.push(`finishedGoods.${nombre}`)
  }
  if (uow.recipes.findExecutionContentById.mock.calls.length > 0) vistas.push('recipes.findExecutionContentById')
  return vistas
}

async function codigoDelFallo(operacion: () => Promise<unknown>): Promise<string> {
  const error = await operacion().then(
    () => null,
    (e: unknown) => e,
  )
  expect(error, 'la operacion tenia que fallar').not.toBeNull()
  return (error as PedidosError).code
}

describe('setOrderCustomer — en los estados de cliente abierto (R14 enmendada, R15, QC-215 R37)', () => {
  it('R14: los diez estados son exactamente los del catalogo', () => {
    expect([...ORDER_STATUS_VALUES].sort()).toEqual(
      [
        'BLOQUEADO',
        'CANCELADO',
        'EN_ACONDICIONAMIENTO',
        'EN_CURSO',
        'EN_EMPAQUE',
        'ENTREGADO',
        'PENDIENTE',
        'POR_ACONDICIONAR',
        'POR_EMPACAR',
        'TERMINADO',
      ].sort(),
    )
  })

  it('R37: CUSTOMER_EDITABLE_STATUSES son los ocho estados abiertos, sin ENTREGADO ni CANCELADO', () => {
    expect([...CUSTOMER_EDITABLE_STATUSES].sort()).toEqual(
      [
        'PENDIENTE',
        'EN_CURSO',
        'BLOQUEADO',
        'POR_EMPACAR',
        'EN_EMPAQUE',
        'POR_ACONDICIONAR',
        'EN_ACONDICIONAMIENTO',
        'TERMINADO',
      ].sort(),
    )
    expect([...CUSTOMER_EDITABLE_STATUSES].sort()).toEqual([...ESTADOS_ABIERTOS].sort())
    expect(ESTADOS_ABIERTOS).toHaveLength(8)
  })

  it.each<OrderStatus>([...ESTADOS_ABIERTOS])(
    'R37 R15: en %s acepta el cambio; bloquea la fila y solo escribe setCustomerAlive(id, cliente, actor, ahora, scope)',
    async (status) => {
      const e = escenario({ fila: fila({ status }) })

      await e.setOrderCustomer(ORDER_ID, { customerId: CLIENTE_B }, ACTOR)

      expect(e.lockAliveById).toHaveBeenCalledWith(ORDER_ID, SCOPE)
      expect(e.setCustomerAlive).toHaveBeenCalledTimes(1)
      expect(e.setCustomerAlive).toHaveBeenCalledWith(ORDER_ID, CLIENTE_B, ACTOR.id, AHORA, SCOPE)
      expect(otrasLlamadas(e.uow)).toEqual([])
      expect(e.run).toHaveBeenCalledTimes(1)
    },
  )

  it.each<OrderStatus>(['BLOQUEADO', 'POR_ACONDICIONAR', 'EN_ACONDICIONAMIENTO', 'TERMINADO'])(
    'R37: en %s tambien se quita el cliente, sin consultar el catalogo ni ninguna otra escritura',
    async (status) => {
      const e = escenario({ fila: fila({ status }) })

      await e.setOrderCustomer(ORDER_ID, { customerId: null }, ACTOR)

      expect(e.setCustomerAlive).toHaveBeenCalledWith(ORDER_ID, null, ACTOR.id, AHORA, SCOPE)
      expect(e.findAliveRefById).not.toHaveBeenCalled()
      // Ni setStatus ni ninguna otra escritura: estado, finishedAt, packedBy y quien acondiciona
      // no los puede mover este caso de uso.
      expect(otrasLlamadas(e.uow)).toEqual([])
    },
  )
})

describe('setOrderCustomer — los estados de cliente cerrado (QC-215 R36)', () => {
  const entradas: readonly (readonly [string, string | null])[] = [
    ['el mismo cliente', CLIENTE_A],
    ['quitar el cliente', null],
    ['un cliente nuevo', CLIENTE_B],
  ]

  for (const status of ESTADOS_CERRADOS) {
    it.each(entradas)(
      `R36: en ${status}, %s da action_not_allowed sin tocar el catalogo, la unidad de trabajo ni la escritura`,
      async (_caso, customerId) => {
        const e = escenario({
          fila: fila({ status, cancellationReason: status === 'CANCELADO' ? 'anulado' : null }),
          explotaSiEscribe: true,
        })

        expect(await codigoDelFallo(() => e.setOrderCustomer(ORDER_ID, { customerId }, ACTOR))).toBe(
          'action_not_allowed',
        )
        expect(e.findAliveById).toHaveBeenCalledWith(ORDER_ID, SCOPE)
        expect(e.findAliveRefById).not.toHaveBeenCalled()
        expect(e.run).not.toHaveBeenCalled()
        expect(e.lockAliveById).not.toHaveBeenCalled()
        expect(e.setCustomerAlive).not.toHaveBeenCalled()
        expect(otrasLlamadas(e.uow)).toEqual([])
      },
    )
  }

  it('R36: un pedido que no existe sigue dando order_not_found, no action_not_allowed', async () => {
    const e = escenario({ fila: null, explotaSiEscribe: true })

    expect(await codigoDelFallo(() => e.setOrderCustomer(ORDER_ID, { customerId: CLIENTE_B }, ACTOR))).toBe(
      'order_not_found',
    )
  })

  it.each<OrderStatus>([...ESTADOS_CERRADOS])(
    'R36: si el pedido pasa a %s entre la lectura y el candado, action_not_allowed sin escribir',
    async (status) => {
      const e = escenario({ fila: fila({ status: 'TERMINADO' }), bloqueada: fila({ status }) })

      expect(await codigoDelFallo(() => e.setOrderCustomer(ORDER_ID, { customerId: CLIENTE_B }, ACTOR))).toBe(
        'action_not_allowed',
      )
      expect(e.lockAliveById).toHaveBeenCalledWith(ORDER_ID, SCOPE)
      expect(e.setCustomerAlive).not.toHaveBeenCalled()
      expect(otrasLlamadas(e.uow)).toEqual([])
    },
  )

  it('R18: si el pedido desaparece entre la lectura y el candado, order_not_found sin escribir', async () => {
    const e = escenario({ bloqueada: null })

    expect(await codigoDelFallo(() => e.setOrderCustomer(ORDER_ID, { customerId: CLIENTE_B }, ACTOR))).toBe(
      'order_not_found',
    )
    expect(e.setCustomerAlive).not.toHaveBeenCalled()
  })
})

describe('setOrderCustomer — quitar, mismo cliente y comprobacion (R11, R12, R16, R17)', () => {
  it('R16: quitar el cliente con null escribe null sin consultar el catalogo', async () => {
    const e = escenario()

    await e.setOrderCustomer(ORDER_ID, { customerId: null }, ACTOR)

    expect(e.setCustomerAlive).toHaveBeenCalledWith(ORDER_ID, null, ACTOR.id, AHORA, SCOPE)
    expect(e.findAliveRefById).not.toHaveBeenCalled()
    expect(otrasLlamadas(e.uow)).toEqual([])
  })

  it('R16: quitar el cliente con la cadena vacia es lo mismo que null', async () => {
    const e = escenario()

    await e.setOrderCustomer(ORDER_ID, { customerId: '' }, ACTOR)

    expect(e.setCustomerAlive).toHaveBeenCalledWith(ORDER_ID, null, ACTOR.id, AHORA, SCOPE)
  })

  it('R16 R17: quitar el cliente de un pedido que no lo tiene no escribe', async () => {
    const e = escenario({ fila: fila({ customerId: null }) })

    await e.setOrderCustomer(ORDER_ID, { customerId: null }, ACTOR)

    expect(e.run).not.toHaveBeenCalled()
  })

  it('R17: el mismo cliente no escribe nada ni consulta el catalogo', async () => {
    const e = escenario()

    await e.setOrderCustomer(ORDER_ID, { customerId: CLIENTE_A }, ACTOR)

    expect(e.run).not.toHaveBeenCalled()
    expect(e.setCustomerAlive).not.toHaveBeenCalled()
    expect(e.findAliveRefById).not.toHaveBeenCalled()
  })

  it('R12: el mismo cliente, aunque este dado de baja, se acepta sin escribir', async () => {
    const e = escenario({ fila: fila({ customerId: CLIENTE_DE_BAJA }) })

    await expect(e.setOrderCustomer(ORDER_ID, { customerId: CLIENTE_DE_BAJA }, ACTOR)).resolves.toBeUndefined()
    expect(e.run).not.toHaveBeenCalled()
  })

  it.each([
    ['no existe', CLIENTE_INEXISTENTE],
    ['esta dado de baja', CLIENTE_DE_BAJA],
    ['es de otra empresa', CLIENTE_AJENO],
  ])('R11: un cliente que %s da customer_not_found y no escribe', async (_causa, customerId) => {
    const e = escenario()

    expect(await codigoDelFallo(() => e.setOrderCustomer(ORDER_ID, { customerId }, ACTOR))).toBe('customer_not_found')
    expect(e.findAliveRefById).toHaveBeenCalledWith(customerId, EMPRESA)
    expect(e.run).not.toHaveBeenCalled()
  })

  it('R11: un id sin forma de uuid da customer_not_found con CERO llamadas al catalogo', async () => {
    const e = escenario()

    expect(await codigoDelFallo(() => e.setOrderCustomer(ORDER_ID, { customerId: 'no-uuid' }, ACTOR))).toBe(
      'customer_not_found',
    )
    expect(e.findAliveRefById).not.toHaveBeenCalled()
    expect(e.run).not.toHaveBeenCalled()
  })
})

describe('setOrderCustomer — el pedido y la entrada (R18)', () => {
  it('R18: un pedido que no existe o esta borrado da order_not_found y no escribe', async () => {
    const e = escenario({ fila: null })

    expect(await codigoDelFallo(() => e.setOrderCustomer(ORDER_ID, { customerId: CLIENTE_B }, ACTOR))).toBe(
      'order_not_found',
    )
    expect(e.findAliveRefById).not.toHaveBeenCalled()
    expect(e.run).not.toHaveBeenCalled()
  })

  it('R18: un pedido de otra empresa da order_not_found: la empresa sale del actor', async () => {
    const e = escenario()
    const deOtra: Actor = { ...ACTOR, companyId: OTRA_EMPRESA }

    expect(await codigoDelFallo(() => e.setOrderCustomer(ORDER_ID, { customerId: CLIENTE_AJENO }, deOtra))).toBe(
      'order_not_found',
    )
    expect(e.findAliveById).toHaveBeenCalledWith(ORDER_ID, { companyId: OTRA_EMPRESA })
    expect(e.run).not.toHaveBeenCalled()
  })

  it('R18: si el pedido desaparece entre la lectura y la escritura, order_not_found', async () => {
    const e = escenario({ setCustomerAlive: 'not_found' })

    expect(await codigoDelFallo(() => e.setOrderCustomer(ORDER_ID, { customerId: CLIENTE_B }, ACTOR))).toBe(
      'order_not_found',
    )
  })

  it('R18: las claves de mas no tienen efecto: solo viaja el cliente', async () => {
    const e = escenario()

    await e.setOrderCustomer(
      ORDER_ID,
      {
        customerId: CLIENTE_B,
        status: 'ENTREGADO',
        quantity: '99',
        companyId: OTRA_EMPRESA,
        ingredientsCost: '0',
        updatedBy: 'otro',
      },
      ACTOR,
    )

    expect(e.setCustomerAlive).toHaveBeenCalledWith(ORDER_ID, CLIENTE_B, ACTOR.id, AHORA, SCOPE)
    expect(e.findAliveById).toHaveBeenCalledWith(ORDER_ID, SCOPE)
    expect(otrasLlamadas(e.uow)).toEqual([])
  })

  it('R18: una entrada sin la clave customerId es invalid_input y no lee nada', async () => {
    const e = escenario()

    for (const entrada of [{}, null, 'texto', { customerId: 3 }]) {
      expect(await codigoDelFallo(() => e.setOrderCustomer(ORDER_ID, entrada, ACTOR))).toBe('invalid_input')
    }
    expect(e.findAliveById).not.toHaveBeenCalled()
    expect(e.run).not.toHaveBeenCalled()
  })
})

describe('setOrderCustomer — dependencias (R15)', () => {
  it('R15: las dependencias no incluyen catalogos de recetas, inventario ni unidades', () => {
    const claves: readonly (keyof SetOrderCustomerDeps)[] = ['orders', 'customerCatalog', 'unitOfWork', 'now']
    expect([...claves].sort()).toEqual(['customerCatalog', 'now', 'orders', 'unitOfWork'])

    const sinRecetas: 'recipes' extends keyof SetOrderCustomerDeps ? false : true = true
    const sinProductos: 'products' extends keyof SetOrderCustomerDeps ? false : true = true
    const sinUnidades: 'units' extends keyof SetOrderCustomerDeps ? false : true = true
    const sinPresentaciones: 'presentations' extends keyof SetOrderCustomerDeps ? false : true = true
    const sinEnvases: 'packaging' extends keyof SetOrderCustomerDeps ? false : true = true
    expect([sinRecetas, sinProductos, sinUnidades, sinPresentaciones, sinEnvases]).toEqual([true, true, true, true, true])

    const e = escenario()
    expect(Object.keys(e.deps).sort()).toEqual(['customerCatalog', 'now', 'orders', 'unitOfWork'])
  })
})
