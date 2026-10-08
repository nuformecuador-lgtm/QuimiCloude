// QC-223 B4 — Registrar una entrega de producto terminado: el caso de uso contra dobles de sus
// puertos. La transaccion real, la base y la concurrencia van en los `.int` de B5.
//
// La unidad de trabajo doblada ejecuta el trabajo con el scope que se le da y recuerda si el
// trabajo lanzo: un error que sale de `run` es lo que, con la transaccion real, lo deshace todo.

import { describe, expect, it, vi } from 'vitest'

import { ROLE_ADMINISTRADOR, SEED_ROLE_PERMISSIONS } from '@/lib/modules/identity'
import { createDeliverOrder, type DeliverOrderDeps } from '@/lib/modules/pedidos/domain/deliver-order'
import { ORDER_STATUS_VALUES } from '@/lib/modules/pedidos/domain/order-classification'
import { DELIVERY_MAX_ALLOCATIONS } from '@/lib/modules/pedidos/domain/order-delivery'
import {
  COMPLETE_LINE_ID,
  DELIVERY_CUSTOMER_ID,
  DELIVERY_KEY,
  DELIVERY_ORDER_ID,
  NEWER_BATCH_ID,
  OLDER_BATCH_ID,
  PENDING_LINE_ID,
  deliverInput,
} from '@/tests/fixtures/order-delivery'
import { fakeOrderRow } from '@/tests/helpers/order-unit-of-work-double'

import type { CustomerRef } from '@/lib/modules/clientes'
import type { FinishedGoodsDispatchInput, FinishedGoodsDispatchOutcome } from '@/lib/modules/inventario'
import type { Actor } from '@/lib/modules/pedidos/domain/actor'
import type { PedidosError } from '@/lib/modules/pedidos/domain/errors'
import type { OrderStatus } from '@/lib/modules/pedidos/domain/order-classification'
import type { OrderRow } from '@/lib/modules/pedidos/domain/order-view'
import type { RegisteredOrderDelivery } from '@/lib/modules/pedidos/ports/order-delivery-repository'
import type { OrderDeliveryTransactionScope } from '@/lib/modules/pedidos/ports/order-delivery-unit-of-work'
import type { OrderRepository } from '@/lib/modules/pedidos/ports/order-repository'
import type { FinishPackingLine, LockedOrderRow } from '@/lib/modules/pedidos/ports/order-write-repository'

const EMPRESA = '33333333-3333-4333-8333-333333333333'
const SCOPE = { companyId: EMPRESA }
const AHORA = new Date('2026-10-08T10:00:00.000Z')
const RECETA = '22222222-2222-4222-8222-222222222222'
const DELIVERY_ID = '99999999-9999-4999-8999-999999999999'
const COMPLETE_PRESENTATION = 'f0000000-0000-4000-8000-000000000001'
const PENDING_PRESENTATION = 'f0000000-0000-4000-8000-000000000002'

const ENTREGADOR: Actor = { id: 'u-entrega', companyId: EMPRESA, permissions: ['entregas.modificar'] }

const CLIENTE: CustomerRef = { id: DELIVERY_CUSTOMER_ID, firstNames: 'Ana', lastNames: 'Perez', isDeleted: false }

const LINEAS: readonly FinishPackingLine[] = [
  { id: COMPLETE_LINE_ID, presentationId: COMPLETE_PRESENTATION, packages: 4, presentationContent: '4.0000', packagingProductId: null },
  { id: PENDING_LINE_ID, presentationId: PENDING_PRESENTATION, packages: 10, presentationContent: '1.0000', packagingProductId: null },
]

/** Pedidos 4 + 10; entregados 4 + 3: a la segunda linea le faltan 7. */
const ENTREGADOS = new Map([
  [COMPLETE_LINE_ID, 4],
  [PENDING_LINE_ID, 3],
])

function pedidoTerminado(overrides: Partial<LockedOrderRow> = {}): LockedOrderRow {
  return fakeOrderRow({ id: DELIVERY_ORDER_ID, status: 'TERMINADO', recipeId: RECETA, customerId: null, ...overrides })
}

function despachado(input: FinishedGoodsDispatchInput): FinishedGoodsDispatchOutcome {
  return {
    kind: 'dispatched',
    lines: input.allocations.map((a) => ({ batchId: a.batchId, packages: a.packages, quantity: `${String(a.packages)}.0000` })),
  }
}

type Montaje = {
  readonly deps: DeliverOrderDeps
  readonly tx: {
    readonly orders: {
      readonly lockAliveById: ReturnType<typeof vi.fn>
      readonly findPresentationLinesForFinish: ReturnType<typeof vi.fn>
      readonly setStatus: ReturnType<typeof vi.fn>
    }
    readonly deliveries: {
      readonly create: ReturnType<typeof vi.fn>
      readonly addLines: ReturnType<typeof vi.fn>
      readonly sumDeliveredPackages: ReturnType<typeof vi.fn>
    }
    readonly finishedGoods: { readonly dispatchForDelivery: ReturnType<typeof vi.fn> }
  }
  readonly run: ReturnType<typeof vi.fn>
  readonly findByKey: ReturnType<typeof vi.fn>
  readonly findAliveById: ReturnType<typeof vi.fn>
  readonly findAliveRefById: ReturnType<typeof vi.fn>
  /** Lo que lanzo el trabajo dentro de `run`, o `null` si termino bien. */
  readonly lanzoDentro: () => unknown
}

function montar(
  opciones: {
    pedido?: LockedOrderRow | null
    lineas?: readonly FinishPackingLine[]
    entregados?: ReadonlyMap<string, number>
    creada?: { kind: 'created'; id: string } | { kind: 'duplicate_key' }
    despacho?: (input: FinishedGoodsDispatchInput) => FinishedGoodsDispatchOutcome
    setStatus?: 'ok' | 'not_found' | 'stale'
    leido?: OrderRow | null
    cliente?: CustomerRef | null
    /** Lo que devuelve la lectura previa de la clave; sin el, `null` (clave nueva). */
    registrada?: RegisteredOrderDelivery | null
    /** Entregas registradas por `${companyId}:${clave}`; si se da, sustituye a `registrada` y a la
     *  relectura tras la carrera. */
    claves?: ReadonlyMap<string, RegisteredOrderDelivery>
  } = {},
): Montaje {
  const tx = {
    orders: {
      lockAliveById: vi.fn(async () => (opciones.pedido === undefined ? pedidoTerminado() : opciones.pedido)),
      findPresentationLinesForFinish: vi.fn(async () => opciones.lineas ?? LINEAS),
      setStatus: vi.fn(async () => opciones.setStatus ?? 'ok'),
    },
    deliveries: {
      create: vi.fn(async () => opciones.creada ?? { kind: 'created', id: DELIVERY_ID }),
      addLines: vi.fn(async () => undefined),
      sumDeliveredPackages: vi.fn(async () => opciones.entregados ?? ENTREGADOS),
    },
    finishedGoods: {
      dispatchForDelivery: vi.fn(async (input: FinishedGoodsDispatchInput) => (opciones.despacho ?? despachado)(input)),
    },
  }
  let lanzado: unknown = null
  const run = vi.fn(async (work: (scope: OrderDeliveryTransactionScope) => Promise<unknown>) => {
    try {
      return await work(tx as unknown as OrderDeliveryTransactionScope)
    } catch (error) {
      lanzado = error
      throw error
    }
  })
  const findAliveById = vi.fn(async () =>
    opciones.leido === undefined ? pedidoTerminado({ status: 'ENTREGADO' }) : opciones.leido,
  )
  const findAliveRefById = vi.fn(async () => (opciones.cliente === undefined ? CLIENTE : opciones.cliente))
  // La primera llamada es la lectura previa; una segunda solo ocurre tras `duplicate_key`, cuando
  // la otra peticion ya confirmo la entrega de este pedido.
  let lecturasDeClave = 0
  const findByKey = vi.fn(async (deliveryKey: string, scope: { companyId: string }) => {
    lecturasDeClave += 1
    if (opciones.claves !== undefined) return opciones.claves.get(`${scope.companyId}:${deliveryKey}`) ?? null
    if (lecturasDeClave === 1) return opciones.registrada ?? null
    return { id: DELIVERY_ID, orderId: DELIVERY_ORDER_ID }
  })
  const explota = (nombre: string) =>
    vi.fn(() => {
      throw new Error(`OrderRepository.${nombre} no deberia llamarse`)
    })
  const orders = { findAliveById, listAlive: explota('listAlive'), findBlockedIds: explota('findBlockedIds') }

  return {
    deps: {
      customerCatalog: { findAliveRefById },
      unitOfWork: { run } as unknown as DeliverOrderDeps['unitOfWork'],
      deliveries: { findByKey },
      orders: orders as unknown as OrderRepository,
      now: () => AHORA,
    },
    tx,
    run,
    findByKey,
    findAliveById,
    findAliveRefById,
    lanzoDentro: () => lanzado,
  }
}

async function codigoDelFallo(operacion: () => Promise<unknown>): Promise<string> {
  const error = await operacion().then(
    () => null,
    (e: unknown) => e,
  )
  expect(error, 'la operacion tenia que fallar').not.toBeNull()
  return (error as PedidosError).code
}

function nadaEscrito(m: Montaje): void {
  expect(m.tx.finishedGoods.dispatchForDelivery).not.toHaveBeenCalled()
  expect(m.tx.deliveries.addLines).not.toHaveBeenCalled()
  expect(m.tx.orders.setStatus).not.toHaveBeenCalled()
}

function ningunPuerto(m: Montaje): void {
  expect(m.findAliveRefById).not.toHaveBeenCalled()
  expect(m.findByKey).not.toHaveBeenCalled()
  expect(m.run).not.toHaveBeenCalled()
  expect(m.findAliveById).not.toHaveBeenCalled()
  expect(m.tx.orders.lockAliveById).not.toHaveBeenCalled()
  expect(m.tx.deliveries.create).not.toHaveBeenCalled()
}

describe('deliverOrder — acceso (R2, R3)', () => {
  it('R2: sin entregas.modificar responde unauthorized antes de validar, y ningun puerto se llama', async () => {
    const m = montar()
    const entregar = createDeliverOrder(m.deps)
    const soloPedidos: Actor = { ...ENTREGADOR, permissions: ['pedidos.consultar', 'pedidos.modificar'] }

    for (const actor of [null, undefined, { ...ENTREGADOR, permissions: [] }, soloPedidos]) {
      expect(await codigoDelFallo(() => entregar(deliverInput(), actor))).toBe('unauthorized')
      expect(await codigoDelFallo(() => entregar({ basura: true }, actor))).toBe('unauthorized')
    }
    ningunPuerto(m)
  })

  it('R3: un actor con entregas.modificar y otro rol es aceptado', async () => {
    const m = montar()
    const deOtroRol: Actor = { id: 'u-operador', companyId: EMPRESA, permissions: ['asignaciones.consultar', 'entregas.modificar'] }

    await expect(createDeliverOrder(m.deps)(deliverInput(), deOtroRol)).resolves.toEqual({
      status: 'delivered',
      orderStatus: 'TERMINADO',
    })
  })

  it('R3: un Administrador sin entregas.modificar en su conjunto es rechazado', async () => {
    const m = montar()
    const delAdministrador = [...SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]]
    expect(delAdministrador).toContain('entregas.modificar')
    const adminSinPermiso: Actor = {
      id: 'u-admin',
      companyId: EMPRESA,
      permissions: delAdministrador.filter((p) => p !== 'entregas.modificar'),
    }

    expect(await codigoDelFallo(() => createDeliverOrder(m.deps)(deliverInput(), adminSinPermiso))).toBe('unauthorized')
    ningunPuerto(m)
  })
})

describe('deliverOrder — forma de la entrada (R22)', () => {
  const invalidas: ReadonlyArray<readonly [string, unknown]> = [
    ['orderId sin forma de uuid', deliverInput({ orderId: 'pedido-1' })],
    ['deliveryKey sin forma de uuid', deliverInput({ deliveryKey: 'clave' })],
    ['batchId sin forma de uuid', deliverInput({ allocations: [{ presentationLineId: PENDING_LINE_ID, batchId: 'lote', packages: 1 }] })],
    [
      'presentationLineId sin forma de uuid',
      deliverInput({ allocations: [{ presentationLineId: 'linea', batchId: OLDER_BATCH_ID, packages: 1 }] }),
    ],
    ['envases cero', deliverInput({ allocations: [{ presentationLineId: PENDING_LINE_ID, batchId: OLDER_BATCH_ID, packages: 0 }] })],
    ['envases negativos', deliverInput({ allocations: [{ presentationLineId: PENDING_LINE_ID, batchId: OLDER_BATCH_ID, packages: -1 }] })],
    ['envases no enteros', deliverInput({ allocations: [{ presentationLineId: PENDING_LINE_ID, batchId: OLDER_BATCH_ID, packages: 1.5 }] })],
    [
      'envases como texto',
      { ...deliverInput(), allocations: [{ presentationLineId: PENDING_LINE_ID, batchId: OLDER_BATCH_ID, packages: '1' }] },
    ],
    [
      'la misma linea y lote repetidos',
      deliverInput({
        allocations: [
          { presentationLineId: PENDING_LINE_ID, batchId: OLDER_BATCH_ID, packages: 1 },
          { presentationLineId: PENDING_LINE_ID, batchId: OLDER_BATCH_ID, packages: 2 },
        ],
      }),
    ],
    ['ninguna linea', deliverInput({ allocations: [] })],
    [
      `mas de ${String(DELIVERY_MAX_ALLOCATIONS)} asignaciones`,
      deliverInput({
        allocations: Array.from({ length: DELIVERY_MAX_ALLOCATIONS + 1 }, (_, i) => ({
          presentationLineId: PENDING_LINE_ID,
          batchId: `e0000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
          packages: 1,
        })),
      }),
    ],
    ['un campo de mas', { ...deliverInput(), companyId: EMPRESA }],
    [
      'un campo de mas en una asignacion',
      { ...deliverInput(), allocations: [{ presentationLineId: PENDING_LINE_ID, batchId: OLDER_BATCH_ID, packages: 1, quantity: '1' }] },
    ],
    ['sin customerId', { orderId: DELIVERY_ORDER_ID, deliveryKey: DELIVERY_KEY, allocations: deliverInput().allocations }],
    ['sin allocations', { orderId: DELIVERY_ORDER_ID, deliveryKey: DELIVERY_KEY, customerId: DELIVERY_CUSTOMER_ID }],
    ['sin deliveryKey', { orderId: DELIVERY_ORDER_ID, customerId: DELIVERY_CUSTOMER_ID, allocations: deliverInput().allocations }],
    ['null', null],
  ]

  for (const [caso, entrada] of invalidas) {
    it(`R22: ${caso} es invalid_input y no lee ni escribe nada`, async () => {
      const m = montar()
      expect(await codigoDelFallo(() => createDeliverOrder(m.deps)(entrada, ENTREGADOR))).toBe('invalid_input')
      ningunPuerto(m)
      nadaEscrito(m)
    })
  }

  it('R22: una linea del reparto que no es del pedido es invalid_input, sin crear la entrega', async () => {
    const m = montar()
    const ajena = 'd0000000-0000-4000-8000-0000000000ff'
    const entrada = deliverInput({ allocations: [{ presentationLineId: ajena, batchId: OLDER_BATCH_ID, packages: 1 }] })

    expect(await codigoDelFallo(() => createDeliverOrder(m.deps)(entrada, ENTREGADOR))).toBe('invalid_input')
    expect(m.tx.deliveries.create).not.toHaveBeenCalled()
    nadaEscrito(m)
    expect(m.lanzoDentro()).not.toBeNull()
  })

  it('R22: un pedido sin lineas del reparto rechaza siempre con invalid_input', async () => {
    const m = montar({ lineas: [] })
    expect(await codigoDelFallo(() => createDeliverOrder(m.deps)(deliverInput(), ENTREGADOR))).toBe('invalid_input')
    expect(m.tx.deliveries.create).not.toHaveBeenCalled()
    nadaEscrito(m)
  })
})

describe('deliverOrder — cliente (R21)', () => {
  it('R21: un cliente que no vuelve del catalogo (inexistente, dado de baja o de otra empresa) es customer_not_found sin abrir la transaccion', async () => {
    const m = montar({ cliente: null })
    expect(await codigoDelFallo(() => createDeliverOrder(m.deps)(deliverInput(), ENTREGADOR))).toBe('customer_not_found')
    expect(m.findAliveRefById).toHaveBeenCalledWith(DELIVERY_CUSTOMER_ID, EMPRESA)
    expect(m.run).not.toHaveBeenCalled()
  })

  it('R21: un cliente sin forma de uuid es customer_not_found sin consultar el catalogo', async () => {
    const m = montar()
    expect(await codigoDelFallo(() => createDeliverOrder(m.deps)(deliverInput({ customerId: 'cliente' }), ENTREGADOR))).toBe(
      'customer_not_found',
    )
    expect(m.findAliveRefById).not.toHaveBeenCalled()
    expect(m.run).not.toHaveBeenCalled()
  })
})

describe('deliverOrder — el pedido bloqueado (R17)', () => {
  it('R17: un pedido que no vuelve del bloqueo (inexistente, borrado o de otra empresa) es order_not_found y no escribe nada', async () => {
    const m = montar({ pedido: null })
    expect(await codigoDelFallo(() => createDeliverOrder(m.deps)(deliverInput(), ENTREGADOR))).toBe('order_not_found')
    expect(m.tx.orders.lockAliveById).toHaveBeenCalledWith(DELIVERY_ORDER_ID, SCOPE)
    expect(m.tx.deliveries.create).not.toHaveBeenCalled()
    nadaEscrito(m)
  })

  for (const status of ORDER_STATUS_VALUES.filter((s): s is Exclude<OrderStatus, 'TERMINADO'> => s !== 'TERMINADO')) {
    it(`R17: un pedido ${status} es action_not_allowed y no escribe nada`, async () => {
      const m = montar({ pedido: pedidoTerminado({ status }) })
      expect(await codigoDelFallo(() => createDeliverOrder(m.deps)(deliverInput(), ENTREGADOR))).toBe('action_not_allowed')
      expect(m.tx.deliveries.create).not.toHaveBeenCalled()
      nadaEscrito(m)
    })
  }
})

describe('deliverOrder — tope por linea (R18)', () => {
  it('R18: mas envases que los que faltan en una linea es delivery_exceeds_remaining, sin despachar ni escribir lineas', async () => {
    const m = montar()
    const entrada = deliverInput({
      allocations: [
        { presentationLineId: PENDING_LINE_ID, batchId: OLDER_BATCH_ID, packages: 4 },
        { presentationLineId: PENDING_LINE_ID, batchId: NEWER_BATCH_ID, packages: 4 },
      ],
    })

    expect(await codigoDelFallo(() => createDeliverOrder(m.deps)(entrada, ENTREGADOR))).toBe('delivery_exceeds_remaining')
    expect(m.tx.deliveries.sumDeliveredPackages).toHaveBeenCalledWith(DELIVERY_ORDER_ID, SCOPE)
    nadaEscrito(m)
    expect(m.lanzoDentro()).not.toBeNull()
  })

  it('R18: cualquier envase a una linea que ya esta completa es delivery_exceeds_remaining', async () => {
    const m = montar()
    const entrada = deliverInput({ allocations: [{ presentationLineId: COMPLETE_LINE_ID, batchId: OLDER_BATCH_ID, packages: 1 }] })

    expect(await codigoDelFallo(() => createDeliverOrder(m.deps)(entrada, ENTREGADOR))).toBe('delivery_exceeds_remaining')
    nadaEscrito(m)
  })
})

describe('deliverOrder — salida fisica de inventario (R19, R20, R24)', () => {
  it('R24: despacha una vez por linea con la receta del pedido, la presentacion de la linea y la entrega creada, y guarda la cantidad que devuelve inventario', async () => {
    const m = montar()
    await createDeliverOrder(m.deps)(deliverInput(), ENTREGADOR)

    expect(m.tx.deliveries.create).toHaveBeenCalledWith(
      { deliveryKey: DELIVERY_KEY, orderId: DELIVERY_ORDER_ID, customerId: DELIVERY_CUSTOMER_ID, actorId: ENTREGADOR.id, now: AHORA },
      SCOPE,
    )
    expect(m.tx.finishedGoods.dispatchForDelivery).toHaveBeenCalledTimes(1)
    expect(m.tx.finishedGoods.dispatchForDelivery).toHaveBeenCalledWith({
      companyId: EMPRESA,
      orderId: DELIVERY_ORDER_ID,
      orderDeliveryId: DELIVERY_ID,
      recipeId: RECETA,
      presentationId: PENDING_PRESENTATION,
      allocations: [
        { batchId: OLDER_BATCH_ID, packages: 4 },
        { batchId: NEWER_BATCH_ID, packages: 2 },
      ],
      actorId: ENTREGADOR.id,
      now: AHORA,
    })
    expect(m.tx.deliveries.addLines).toHaveBeenCalledWith(
      DELIVERY_ID,
      [
        { presentationLineId: PENDING_LINE_ID, batchId: OLDER_BATCH_ID, packages: 4, quantity: '4.0000' },
        { presentationLineId: PENDING_LINE_ID, batchId: NEWER_BATCH_ID, packages: 2, quantity: '2.0000' },
      ],
      SCOPE,
    )
  })

  it('R24: con dos lineas pendientes despacha cada una con su presentacion', async () => {
    const m = montar({ entregados: new Map([[PENDING_LINE_ID, 3]]) })
    const entrada = deliverInput({
      allocations: [
        { presentationLineId: COMPLETE_LINE_ID, batchId: NEWER_BATCH_ID, packages: 1 },
        { presentationLineId: PENDING_LINE_ID, batchId: OLDER_BATCH_ID, packages: 2 },
      ],
    })
    await createDeliverOrder(m.deps)(entrada, ENTREGADOR)

    const presentaciones = m.tx.finishedGoods.dispatchForDelivery.mock.calls.map(
      (call) => (call[0] as FinishedGoodsDispatchInput).presentationId,
    )
    expect(presentaciones).toEqual([COMPLETE_PRESENTATION, PENDING_PRESENTATION])
  })

  it('R19: batch_not_found de inventario es batch_not_found y no guarda lineas ni mueve el estado', async () => {
    const m = montar({ despacho: () => ({ kind: 'batch_not_found', batchId: OLDER_BATCH_ID }) })
    expect(await codigoDelFallo(() => createDeliverOrder(m.deps)(deliverInput(), ENTREGADOR))).toBe('batch_not_found')
    expect(m.tx.deliveries.addLines).not.toHaveBeenCalled()
    expect(m.tx.orders.setStatus).not.toHaveBeenCalled()
    expect(m.lanzoDentro()).not.toBeNull()
  })

  it('R20: insufficient de inventario es delivery_batch_insufficient y no guarda lineas ni mueve el estado', async () => {
    const m = montar({ despacho: () => ({ kind: 'insufficient', batchId: NEWER_BATCH_ID, availablePackages: 1 }) })
    expect(await codigoDelFallo(() => createDeliverOrder(m.deps)(deliverInput(), ENTREGADOR))).toBe(
      'delivery_batch_insufficient',
    )
    expect(m.tx.deliveries.addLines).not.toHaveBeenCalled()
    expect(m.tx.orders.setStatus).not.toHaveBeenCalled()
    expect(m.lanzoDentro()).not.toBeNull()
  })
})

describe('deliverOrder — estado del pedido tras la entrega (R26, R27)', () => {
  it('R26: si a alguna linea le siguen faltando envases el pedido sigue TERMINADO y setStatus no se llama', async () => {
    const m = montar()
    await expect(createDeliverOrder(m.deps)(deliverInput(), ENTREGADOR)).resolves.toEqual({
      status: 'delivered',
      orderStatus: 'TERMINADO',
    })
    expect(m.tx.orders.setStatus).not.toHaveBeenCalled()
  })

  it('R27: si no le falta nada a ninguna linea pasa a ENTREGADO en la misma transaccion', async () => {
    const m = montar()
    const entrada = deliverInput({
      allocations: [
        { presentationLineId: PENDING_LINE_ID, batchId: OLDER_BATCH_ID, packages: 4 },
        { presentationLineId: PENDING_LINE_ID, batchId: NEWER_BATCH_ID, packages: 3 },
      ],
    })

    await expect(createDeliverOrder(m.deps)(entrada, ENTREGADOR)).resolves.toEqual({
      status: 'delivered',
      orderStatus: 'ENTREGADO',
    })
    expect(m.tx.orders.setStatus).toHaveBeenCalledTimes(1)
    expect(m.tx.orders.setStatus).toHaveBeenCalledWith(DELIVERY_ORDER_ID, 'TERMINADO', 'ENTREGADO', ENTREGADOR.id, AHORA, SCOPE)
    expect(m.run).toHaveBeenCalledTimes(1)
  })

  it('R27: si setStatus no mueve el pedido la entrega entera falla', async () => {
    const m = montar({ setStatus: 'stale' })
    const entrada = deliverInput({
      allocations: [{ presentationLineId: PENDING_LINE_ID, batchId: OLDER_BATCH_ID, packages: 7 }],
    })

    await expect(createDeliverOrder(m.deps)(entrada, ENTREGADOR)).rejects.toThrow(/setStatus/)
    expect(m.lanzoDentro()).not.toBeNull()
  })
})

describe('deliverOrder — clave de entrega ya registrada (R29)', () => {
  it('R29: duplicate_key es already_registered con el estado leido, y no despacha ni guarda lineas', async () => {
    for (const status of ['TERMINADO', 'ENTREGADO'] as const) {
      const m = montar({ creada: { kind: 'duplicate_key' }, leido: pedidoTerminado({ status }) })

      await expect(createDeliverOrder(m.deps)(deliverInput(), ENTREGADOR)).resolves.toEqual({
        status: 'already_registered',
        orderStatus: status,
      })
      expect(m.findAliveById).toHaveBeenCalledWith(DELIVERY_ORDER_ID, SCOPE)
      nadaEscrito(m)
      expect(m.lanzoDentro(), 'la senal tiene que deshacer la transaccion').not.toBeNull()
    }
  })

  it('R29: el reintento de una entrega parcial ya aplicada responde already_registered aunque hoy excederia lo que falta', async () => {
    const m = montar({
      creada: { kind: 'duplicate_key' },
      entregados: new Map([
        [COMPLETE_LINE_ID, 4],
        [PENDING_LINE_ID, 9],
      ]),
      leido: pedidoTerminado(),
    })

    await expect(createDeliverOrder(m.deps)(deliverInput(), ENTREGADOR)).resolves.toEqual({
      status: 'already_registered',
      orderStatus: 'TERMINADO',
    })
    nadaEscrito(m)
  })
  it('R29: un reintento sobre un pedido que la primera ya dejo ENTREGADO es already_registered con ENTREGADO, sin bloquear ni escribir', async () => {
    const m = montar({
      registrada: { id: DELIVERY_ID, orderId: DELIVERY_ORDER_ID },
      pedido: pedidoTerminado({ status: 'ENTREGADO' }),
      leido: pedidoTerminado({ status: 'ENTREGADO' }),
    })

    await expect(createDeliverOrder(m.deps)(deliverInput(), ENTREGADOR)).resolves.toEqual({
      status: 'already_registered',
      orderStatus: 'ENTREGADO',
    })
    expect(m.findByKey).toHaveBeenCalledTimes(1)
    expect(m.findByKey).toHaveBeenCalledWith(DELIVERY_KEY, SCOPE)
    expect(m.findAliveById).toHaveBeenCalledWith(DELIVERY_ORDER_ID, SCOPE)
    expect(m.run).not.toHaveBeenCalled()
    expect(m.findAliveRefById).not.toHaveBeenCalled()
    expect(m.tx.orders.lockAliveById).not.toHaveBeenCalled()
    expect(m.tx.deliveries.create).not.toHaveBeenCalled()
    nadaEscrito(m)
  })

  it('R29: una clave reutilizada contra OTRO pedido de la empresa responde con el estado del pedido de la entrega, no del pedido pedido', async () => {
    const OTRO_PEDIDO = '77777777-7777-4777-8777-777777777777'
    const m = montar({ registrada: { id: DELIVERY_ID, orderId: OTRO_PEDIDO } })
    m.findAliveById.mockImplementation(async (id: string) =>
      id === OTRO_PEDIDO ? pedidoTerminado({ id: OTRO_PEDIDO, status: 'ENTREGADO' }) : pedidoTerminado(),
    )

    await expect(createDeliverOrder(m.deps)(deliverInput(), ENTREGADOR)).resolves.toEqual({
      status: 'already_registered',
      orderStatus: 'ENTREGADO',
    })
    expect(m.findAliveById).toHaveBeenCalledTimes(1)
    expect(m.findAliveById).toHaveBeenCalledWith(OTRO_PEDIDO, SCOPE)
    expect(m.run).not.toHaveBeenCalled()
    nadaEscrito(m)
  })

  it('R29: la clave registrada en OTRA empresa no la ve la lectura con el ambito del actor, y la entrega se registra', async () => {
    const OTRA_EMPRESA = '44444444-4444-4444-8444-444444444444'
    const m = montar({
      claves: new Map([[`${OTRA_EMPRESA}:${DELIVERY_KEY}`, { id: DELIVERY_ID, orderId: DELIVERY_ORDER_ID }]]),
    })

    await expect(createDeliverOrder(m.deps)(deliverInput(), ENTREGADOR)).resolves.toEqual({
      status: 'delivered',
      orderStatus: 'TERMINADO',
    })
    expect(m.findByKey).toHaveBeenCalledWith(DELIVERY_KEY, SCOPE)
    expect(m.findAliveById).not.toHaveBeenCalled()
    expect(m.tx.deliveries.create).toHaveBeenCalledTimes(1)
  })

  // QC-223 2026-10-08: R29 enmendado por el humano; el reintento responde con el estado ACTUAL del
  // pedido de la entrega, no con el que dejo la primera.
  it('R29: parcial registrada, otra entrega completa el pedido y el reintento de la parcial es already_registered con ENTREGADO, sin escribir nada', async () => {
    const SEGUNDA_CLAVE = 'b0000000-0000-4000-8000-0000000000b2'
    const claves = new Map<string, RegisteredOrderDelivery>()
    const entregados = new Map(ENTREGADOS)
    let estado: OrderStatus = 'TERMINADO'
    let siguiente = 0
    const m = montar({ claves })
    m.tx.orders.lockAliveById.mockImplementation(async () => pedidoTerminado({ status: estado }))
    m.findAliveById.mockImplementation(async () => pedidoTerminado({ status: estado }))
    m.tx.deliveries.sumDeliveredPackages.mockImplementation(async () => new Map(entregados))
    m.tx.deliveries.create.mockImplementation(async (nueva: { deliveryKey: string; orderId: string }) => {
      siguiente += 1
      const id = `99999999-9999-4999-8999-00000000000${String(siguiente)}`
      claves.set(`${EMPRESA}:${nueva.deliveryKey}`, { id, orderId: nueva.orderId })
      return { kind: 'created', id }
    })
    m.tx.deliveries.addLines.mockImplementation(
      async (_id: string, lineas: readonly { presentationLineId: string; packages: number }[]) => {
        for (const l of lineas) entregados.set(l.presentationLineId, (entregados.get(l.presentationLineId) ?? 0) + l.packages)
      },
    )
    m.tx.orders.setStatus.mockImplementation(async (_id: string, _de: OrderStatus, a: OrderStatus) => {
      estado = a
      return 'ok'
    })
    const entregar = createDeliverOrder(m.deps)

    await expect(entregar(deliverInput(), ENTREGADOR)).resolves.toEqual({ status: 'delivered', orderStatus: 'TERMINADO' })
    await expect(
      entregar(
        deliverInput({
          deliveryKey: SEGUNDA_CLAVE,
          allocations: [{ presentationLineId: PENDING_LINE_ID, batchId: NEWER_BATCH_ID, packages: 1 }],
        }),
        ENTREGADOR,
      ),
    ).resolves.toEqual({ status: 'delivered', orderStatus: 'ENTREGADO' })

    const llamadas = {
      run: m.run.mock.calls.length,
      create: m.tx.deliveries.create.mock.calls.length,
      despacho: m.tx.finishedGoods.dispatchForDelivery.mock.calls.length,
      lineas: m.tx.deliveries.addLines.mock.calls.length,
      estado: m.tx.orders.setStatus.mock.calls.length,
    }

    await expect(entregar(deliverInput(), ENTREGADOR)).resolves.toEqual({
      status: 'already_registered',
      orderStatus: 'ENTREGADO',
    })
    expect({
      run: m.run.mock.calls.length,
      create: m.tx.deliveries.create.mock.calls.length,
      despacho: m.tx.finishedGoods.dispatchForDelivery.mock.calls.length,
      lineas: m.tx.deliveries.addLines.mock.calls.length,
      estado: m.tx.orders.setStatus.mock.calls.length,
    }).toEqual(llamadas)
    expect(claves.size).toBe(2)
    expect(entregados.get(PENDING_LINE_ID)).toBe(10)
  })

  it('R29: si otra peticion inserta la clave entre la lectura y el INSERT, duplicate_key vuelve a leer la entrega y responde con su pedido', async () => {
    const m = montar({ creada: { kind: 'duplicate_key' }, leido: pedidoTerminado() })

    await expect(createDeliverOrder(m.deps)(deliverInput(), ENTREGADOR)).resolves.toEqual({
      status: 'already_registered',
      orderStatus: 'TERMINADO',
    })
    expect(m.findByKey).toHaveBeenCalledTimes(2)
    expect(m.lanzoDentro(), 'la senal tiene que deshacer la transaccion').not.toBeNull()
    nadaEscrito(m)
  })
})
