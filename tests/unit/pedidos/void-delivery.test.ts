// Anular una entrega: el caso de uso contra dobles de sus puertos. La transaccion real, la base y
// la concurrencia van en los `.int`.
//
// La unidad de trabajo doblada ejecuta el trabajo con el scope que se le da y recuerda si el
// trabajo lanzo: un error que sale de `run` es lo que, con la transaccion real, lo deshace todo.

import { describe, expect, it, vi } from 'vitest'

import { ROLE_ADMINISTRADOR, SEED_ROLE_PERMISSIONS } from '@/lib/modules/identity'
import { ORDER_STATUS_VALUES } from '@/lib/modules/pedidos/domain/order-classification'
import { DELIVERY_MAX_ALLOCATIONS } from '@/lib/modules/pedidos/domain/order-delivery'
import { createVoidDelivery, type VoidDeliveryDeps } from '@/lib/modules/pedidos/domain/void-delivery'
import {
  FIRST_BATCH_ID,
  NEWER_DELIVERY_ID,
  OPEN_LINE_ID,
  SECOND_BATCH_ID,
  THIRD_BATCH_ID,
  VOID_KEY,
  VOID_ORDER_ID,
  VOID_REASON,
  VOIDED_LINE_ID,
  voidInput,
} from '@/tests/fixtures/order-delivery-void'
import { fakeOrderRow } from '@/tests/helpers/order-unit-of-work-double'

import type { FinishedGoodsReturnOutcome } from '@/lib/modules/inventario'
import type { Actor } from '@/lib/modules/pedidos/domain/actor'
import type { PedidosError } from '@/lib/modules/pedidos/domain/errors'
import type { OrderStatus } from '@/lib/modules/pedidos/domain/order-classification'
import type { OrderRow } from '@/lib/modules/pedidos/domain/order-view'
import type {
  DeliveryForVoid,
  DeliveryLineForVoid,
  RegisteredDeliveryVoid,
} from '@/lib/modules/pedidos/ports/order-delivery-void-repository'
import type { OrderDeliveryVoidTransactionScope } from '@/lib/modules/pedidos/ports/order-delivery-void-unit-of-work'
import type { OrderRepository } from '@/lib/modules/pedidos/ports/order-repository'
import type { LockedOrderRow } from '@/lib/modules/pedidos/ports/order-write-repository'

const EMPRESA = '33333333-3333-4333-8333-333333333333'
const SCOPE = { companyId: EMPRESA }
const AHORA = new Date('2026-10-09T10:00:00.000Z')
const VOID_ID = '99999999-9999-4999-8999-999999999999'
/** Tercera presentacion de la entrega, sin anular, que ninguna peticion de este archivo pide. */
const OTHER_LINE_ID = 'd0000000-0000-4000-8000-000000000026'
const OTHER_BATCH_ID = 'e0000000-0000-4000-8000-000000000027'
const AJENA = 'd0000000-0000-4000-8000-000000000099'

const ANULADOR: Actor = { id: 'u-anula', companyId: EMPRESA, permissions: ['entregas.anular'] }

const ENTREGA: DeliveryForVoid = { id: NEWER_DELIVERY_ID, orderId: VOID_ORDER_ID }

/** La presentacion abierta sale en dos lotes; la anulada, en uno; la otra, en uno. */
const LINEAS: readonly DeliveryLineForVoid[] = [
  { id: 'l-1', presentationLineId: OPEN_LINE_ID, batchId: FIRST_BATCH_ID, packages: 4, quantity: '4.0000', voided: false },
  { id: 'l-2', presentationLineId: OPEN_LINE_ID, batchId: SECOND_BATCH_ID, packages: 2, quantity: '2.0000', voided: false },
  { id: 'l-3', presentationLineId: VOIDED_LINE_ID, batchId: THIRD_BATCH_ID, packages: 3, quantity: '12.0000', voided: true },
  { id: 'l-4', presentationLineId: OTHER_LINE_ID, batchId: OTHER_BATCH_ID, packages: 5, quantity: '2.5000', voided: false },
]

function pedido(status: OrderStatus = 'ENTREGADO'): LockedOrderRow {
  return fakeOrderRow({ id: VOID_ORDER_ID, status })
}

type Fn = ReturnType<typeof vi.fn>

type Montaje = {
  readonly deps: VoidDeliveryDeps
  readonly tx: {
    readonly orders: { readonly lockAliveById: Fn; readonly setStatus: Fn }
    readonly voids: {
      readonly findByKey: Fn
      readonly findDelivery: Fn
      readonly findDeliveryLines: Fn
      readonly create: Fn
      readonly addLines: Fn
    }
    readonly finishedGoods: { readonly returnForDeliveryVoid: Fn }
  }
  readonly run: Fn
  readonly findByKey: Fn
  readonly findDelivery: Fn
  readonly findAliveById: Fn
  readonly lanzoDentro: () => unknown
}

function montar(
  opciones: {
    pedido?: LockedOrderRow | null
    lineas?: readonly DeliveryLineForVoid[]
    entrega?: DeliveryForVoid | null
    /** Lo que devuelve la lectura previa de la clave; sin el, `null`. */
    registrada?: RegisteredDeliveryVoid | null
    /** Lo que devuelve la lectura de la clave ya con el pedido bloqueado; sin el, `null`. */
    registradaDentro?: RegisteredDeliveryVoid | null
    creada?: { kind: 'created'; id: string } | { kind: 'duplicate_key' }
    agregadas?: 'ok' | 'already_voided'
    devolucion?: FinishedGoodsReturnOutcome
    setStatus?: 'ok' | 'not_found' | 'stale'
    /** El pedido que lee la respuesta de una clave ya registrada. */
    leido?: OrderRow | null
  } = {},
): Montaje {
  const tx = {
    orders: {
      lockAliveById: vi.fn(async () => (opciones.pedido === undefined ? pedido() : opciones.pedido)),
      setStatus: vi.fn(async () => opciones.setStatus ?? 'ok'),
    },
    voids: {
      findByKey: vi.fn(async () => opciones.registradaDentro ?? null),
      findDelivery: vi.fn(async () => {
        throw new Error('findDelivery no se llama dentro de la transaccion')
      }),
      findDeliveryLines: vi.fn(async () => opciones.lineas ?? LINEAS),
      create: vi.fn(async () => opciones.creada ?? { kind: 'created', id: VOID_ID }),
      addLines: vi.fn(async () => opciones.agregadas ?? 'ok'),
    },
    finishedGoods: {
      returnForDeliveryVoid: vi.fn(
        async (): Promise<FinishedGoodsReturnOutcome> => opciones.devolucion ?? { kind: 'returned' },
      ),
    },
  }
  let lanzado: unknown = null
  const run = vi.fn(async (work: (scope: OrderDeliveryVoidTransactionScope) => Promise<unknown>) => {
    try {
      return await work(tx as unknown as OrderDeliveryVoidTransactionScope)
    } catch (error) {
      lanzado = error
      throw error
    }
  })
  // La primera lectura es la previa; una segunda solo ocurre tras la senal de clave ya registrada.
  let lecturasDeClave = 0
  const findByKey = vi.fn(async () => {
    lecturasDeClave += 1
    if (lecturasDeClave === 1) return opciones.registrada ?? null
    return { id: VOID_ID, orderId: VOID_ORDER_ID }
  })
  const findDelivery = vi.fn(async () => (opciones.entrega === undefined ? ENTREGA : opciones.entrega))
  const findAliveById = vi.fn(async () => (opciones.leido === undefined ? pedido('TERMINADO') : opciones.leido))
  const explota = (nombre: string) =>
    vi.fn(() => {
      throw new Error(`OrderRepository.${nombre} no deberia llamarse`)
    })
  const orders = { findAliveById, listAlive: explota('listAlive'), findBlockedIds: explota('findBlockedIds') }

  return {
    deps: {
      unitOfWork: { run } as unknown as VoidDeliveryDeps['unitOfWork'],
      voids: { findByKey, findDelivery },
      orders: orders as unknown as OrderRepository,
      now: () => AHORA,
    },
    tx,
    run,
    findByKey,
    findDelivery,
    findAliveById,
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
  expect(m.tx.voids.create).not.toHaveBeenCalled()
  expect(m.tx.voids.addLines).not.toHaveBeenCalled()
  expect(m.tx.finishedGoods.returnForDeliveryVoid).not.toHaveBeenCalled()
  expect(m.tx.orders.setStatus).not.toHaveBeenCalled()
}

function ningunPuerto(m: Montaje): void {
  expect(m.findByKey).not.toHaveBeenCalled()
  expect(m.findDelivery).not.toHaveBeenCalled()
  expect(m.findAliveById).not.toHaveBeenCalled()
  expect(m.run).not.toHaveBeenCalled()
  expect(m.tx.orders.lockAliveById).not.toHaveBeenCalled()
  expect(m.tx.voids.findDeliveryLines).not.toHaveBeenCalled()
  nadaEscrito(m)
}

describe('voidDelivery — acceso (R2, R3)', () => {
  it('R2: sin entregas.anular responde unauthorized antes de validar, y ningun puerto se llama', async () => {
    const m = montar()
    const anular = createVoidDelivery(m.deps)
    const soloEntregas: Actor = { ...ANULADOR, permissions: ['entregas.modificar', 'pedidos.consultar', 'pedidos.modificar'] }

    for (const actor of [null, undefined, { ...ANULADOR, permissions: [] }, soloEntregas]) {
      expect(await codigoDelFallo(() => anular(voidInput(), actor))).toBe('unauthorized')
      expect(await codigoDelFallo(() => anular({ basura: true }, actor))).toBe('unauthorized')
    }
    ningunPuerto(m)
  })

  it('R3: un actor con entregas.anular y otro rol es aceptado', async () => {
    const m = montar()
    const deOtroRol: Actor = { id: 'u-operador', companyId: EMPRESA, permissions: ['asignaciones.consultar', 'entregas.anular'] }

    await expect(createVoidDelivery(m.deps)(voidInput(), deOtroRol)).resolves.toEqual({
      status: 'voided',
      orderStatus: 'TERMINADO',
    })
  })

  it('R3: un Administrador sin entregas.anular en su conjunto es rechazado', async () => {
    const m = montar()
    const delAdministrador = [...SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]]
    expect(delAdministrador).toContain('entregas.anular')
    const adminSinPermiso: Actor = {
      id: 'u-admin',
      companyId: EMPRESA,
      permissions: delAdministrador.filter((p) => p !== 'entregas.anular'),
    }

    expect(await codigoDelFallo(() => createVoidDelivery(m.deps)(voidInput(), adminSinPermiso))).toBe('unauthorized')
    ningunPuerto(m)
  })
})

describe('voidDelivery — forma de la entrada (R17)', () => {
  const sinMotivo: Record<string, unknown> = { ...voidInput() }
  delete sinMotivo.reason
  const invalidas: ReadonlyArray<readonly [string, unknown]> = [
    ['deliveryId sin forma de uuid', voidInput({ deliveryId: 'entrega-1' })],
    ['voidKey sin forma de uuid', voidInput({ voidKey: 'clave' })],
    ['ninguna presentacion', voidInput({ presentationLineIds: [] })],
    ['una presentacion repetida', voidInput({ presentationLineIds: [OPEN_LINE_ID, OPEN_LINE_ID] })],
    ['una presentacion sin forma de uuid', voidInput({ presentationLineIds: ['linea'] })],
    [
      'mas presentaciones que el tope',
      voidInput({
        presentationLineIds: Array.from(
          { length: DELIVERY_MAX_ALLOCATIONS + 1 },
          (_, i) => `d0000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        ),
      }),
    ],
    ['motivo vacio', voidInput({ reason: '' })],
    ['motivo solo con espacios', voidInput({ reason: '   \t\n ' })],
    ['motivo de 501 caracteres', voidInput({ reason: 'x'.repeat(501) })],
    ['motivo que no es texto', { ...voidInput(), reason: 7 }],
    ['un campo de mas', { ...voidInput(), quantity: 3 }],
    ['un campo ausente (motivo)', sinMotivo],
    ['presentaciones que no son una lista', { ...voidInput(), presentationLineIds: OPEN_LINE_ID }],
    ['entrada que no es un objeto', 'anular'],
    ['entrada nula', null],
  ]

  for (const [caso, entrada] of invalidas) {
    it(`R17: ${caso} responde invalid_input sin leer ni escribir nada`, async () => {
      const m = montar()
      expect(await codigoDelFallo(() => createVoidDelivery(m.deps)(entrada, ANULADOR))).toBe('invalid_input')
      ningunPuerto(m)
    })
  }

  it('R17: el motivo de 500 caracteres con espacios alrededor se acepta y se guarda recortado', async () => {
    const m = montar()
    const motivo = 'y'.repeat(500)
    await createVoidDelivery(m.deps)(voidInput({ reason: `  ${motivo}  ` }), ANULADOR)
    expect(m.tx.voids.create).toHaveBeenCalledWith(expect.objectContaining({ reason: motivo }), SCOPE)
  })
})

describe('voidDelivery — entrega y pedido (R18, R19)', () => {
  it('R18: la entrega ausente o de otra empresa responde delivery_not_found sin abrir la transaccion', async () => {
    const m = montar({ entrega: null })
    expect(await codigoDelFallo(() => createVoidDelivery(m.deps)(voidInput(), ANULADOR))).toBe('delivery_not_found')
    expect(m.findDelivery).toHaveBeenCalledWith(NEWER_DELIVERY_ID, SCOPE)
    expect(m.run).not.toHaveBeenCalled()
    nadaEscrito(m)
  })

  it('R19: bloquea el pedido de la entrega; si ya no existe o esta borrado responde order_not_found sin escribir', async () => {
    const m = montar({ pedido: null })
    expect(await codigoDelFallo(() => createVoidDelivery(m.deps)(voidInput(), ANULADOR))).toBe('order_not_found')
    expect(m.tx.orders.lockAliveById).toHaveBeenCalledWith(VOID_ORDER_ID, SCOPE)
    expect(m.lanzoDentro()).not.toBeNull()
    nadaEscrito(m)
  })

  it('R19: un pedido CANCELADO responde action_not_allowed sin escribir', async () => {
    const m = montar({ pedido: pedido('CANCELADO') })
    expect(await codigoDelFallo(() => createVoidDelivery(m.deps)(voidInput(), ANULADOR))).toBe('action_not_allowed')
    expect(m.tx.voids.findDeliveryLines).not.toHaveBeenCalled()
    nadaEscrito(m)
  })

  const otros = ORDER_STATUS_VALUES.filter((s) => s !== 'TERMINADO' && s !== 'ENTREGADO')
  for (const status of otros) {
    it(`R19: un pedido ${status} responde action_not_allowed sin escribir`, async () => {
      const m = montar({ pedido: pedido(status) })
      expect(await codigoDelFallo(() => createVoidDelivery(m.deps)(voidInput(), ANULADOR))).toBe('action_not_allowed')
      nadaEscrito(m)
    })
  }

  it('R19: el estado se comprueba sobre la fila bloqueada, despues del bloqueo', async () => {
    const m = montar({ pedido: pedido('TERMINADO') })
    await createVoidDelivery(m.deps)(voidInput(), ANULADOR)
    const bloqueo = m.tx.orders.lockAliveById.mock.invocationCallOrder[0] ?? Infinity
    const lineas = m.tx.voids.findDeliveryLines.mock.invocationCallOrder[0] ?? -1
    expect(bloqueo).toBeLessThan(lineas)
  })
})

describe('voidDelivery — presentaciones pedidas (R20, R21)', () => {
  it('R20: una presentacion que no es de esa entrega responde invalid_input sin escribir', async () => {
    const m = montar()
    const entrada = voidInput({ presentationLineIds: [OPEN_LINE_ID, AJENA] })
    expect(await codigoDelFallo(() => createVoidDelivery(m.deps)(entrada, ANULADOR))).toBe('invalid_input')
    expect(m.tx.voids.findDeliveryLines).toHaveBeenCalledWith(NEWER_DELIVERY_ID, SCOPE)
    nadaEscrito(m)
  })

  it('R21: una presentacion ya anulada responde delivery_already_voided y no anula las otras pedidas', async () => {
    const m = montar()
    const entrada = voidInput({ presentationLineIds: [OPEN_LINE_ID, VOIDED_LINE_ID] })
    expect(await codigoDelFallo(() => createVoidDelivery(m.deps)(entrada, ANULADOR))).toBe('delivery_already_voided')
    nadaEscrito(m)
  })

  it('R21: basta con una linea anulada de la presentacion para rechazarla entera', async () => {
    const mixtas = LINEAS.map((l) => (l.id === 'l-2' ? { ...l, voided: true } : l))
    const m = montar({ lineas: mixtas })
    expect(await codigoDelFallo(() => createVoidDelivery(m.deps)(voidInput(), ANULADOR))).toBe('delivery_already_voided')
    nadaEscrito(m)
  })

  it('R21: addLines con already_voided (respaldo de la base) se traduce a delivery_already_voided y deshace', async () => {
    const m = montar({ agregadas: 'already_voided' })
    expect(await codigoDelFallo(() => createVoidDelivery(m.deps)(voidInput(), ANULADOR))).toBe('delivery_already_voided')
    expect(m.lanzoDentro()).not.toBeNull()
    expect(m.tx.finishedGoods.returnForDeliveryVoid).not.toHaveBeenCalled()
    expect(m.tx.orders.setStatus).not.toHaveBeenCalled()
  })
})

describe('voidDelivery — registro (R22, R23, R24)', () => {
  it('R22: guarda la anulacion con la entrega, el motivo recortado, el autor y el instante', async () => {
    const m = montar()
    await createVoidDelivery(m.deps)(voidInput({ reason: `   ${VOID_REASON}  ` }), ANULADOR)
    expect(m.tx.voids.create).toHaveBeenCalledWith(
      { voidKey: VOID_KEY, deliveryId: NEWER_DELIVERY_ID, reason: VOID_REASON, actorId: ANULADOR.id, now: AHORA },
      SCOPE,
    )
  })

  it('R22: addLines recibe todas las lineas de las presentaciones pedidas, en todos sus lotes, y ninguna otra', async () => {
    const m = montar()
    await createVoidDelivery(m.deps)(voidInput({ presentationLineIds: [OPEN_LINE_ID] }), ANULADOR)
    expect(m.tx.voids.addLines).toHaveBeenCalledTimes(1)
    expect(m.tx.voids.addLines).toHaveBeenCalledWith(VOID_ID, NEWER_DELIVERY_ID, ['l-1', 'l-2'], SCOPE)
  })

  it('R22: con dos presentaciones pedidas anula las lineas de las dos y deja la no pedida', async () => {
    const m = montar()
    await createVoidDelivery(m.deps)(voidInput({ presentationLineIds: [OTHER_LINE_ID, OPEN_LINE_ID] }), ANULADOR)
    const [, , ids] = m.tx.voids.addLines.mock.calls[0] as [string, string, string[]]
    expect([...ids].sort()).toEqual(['l-1', 'l-2', 'l-4'])
  })

  it('R23, R24: devuelve a cada lote la cantidad que desconto su linea de entrega, con el pedido y la anulacion', async () => {
    const m = montar()
    await createVoidDelivery(m.deps)(voidInput(), ANULADOR)
    expect(m.tx.finishedGoods.returnForDeliveryVoid).toHaveBeenCalledWith({
      companyId: EMPRESA,
      orderId: VOID_ORDER_ID,
      orderDeliveryVoidId: VOID_ID,
      lines: [
        { batchId: FIRST_BATCH_ID, quantity: '4.0000' },
        { batchId: SECOND_BATCH_ID, quantity: '2.0000' },
      ],
      actorId: ANULADOR.id,
      now: AHORA,
    })
  })

  it('R29: batch_not_found en la devolucion lanza dentro de la transaccion y no cambia el estado', async () => {
    const m = montar({ devolucion: { kind: 'batch_not_found', batchId: SECOND_BATCH_ID } })
    await expect(createVoidDelivery(m.deps)(voidInput(), ANULADOR)).rejects.toThrow(SECOND_BATCH_ID)
    expect(m.lanzoDentro()).not.toBeNull()
    expect(m.tx.orders.setStatus).not.toHaveBeenCalled()
  })
})

describe('voidDelivery — estado del pedido (R27)', () => {
  it('R27: un pedido ENTREGADO pasa a TERMINADO en la misma transaccion', async () => {
    const m = montar({ pedido: pedido('ENTREGADO') })
    await expect(createVoidDelivery(m.deps)(voidInput(), ANULADOR)).resolves.toEqual({
      status: 'voided',
      orderStatus: 'TERMINADO',
    })
    expect(m.tx.orders.setStatus).toHaveBeenCalledTimes(1)
    expect(m.tx.orders.setStatus).toHaveBeenCalledWith(VOID_ORDER_ID, 'ENTREGADO', 'TERMINADO', ANULADOR.id, AHORA, SCOPE)
    expect(m.run).toHaveBeenCalledTimes(1)
  })

  it('R27: un pedido TERMINADO sigue TERMINADO y no se llama a setStatus', async () => {
    const m = montar({ pedido: pedido('TERMINADO') })
    await expect(createVoidDelivery(m.deps)(voidInput(), ANULADOR)).resolves.toEqual({
      status: 'voided',
      orderStatus: 'TERMINADO',
    })
    expect(m.tx.orders.setStatus).not.toHaveBeenCalled()
  })

  it('R27, R29: setStatus distinto de ok con el pedido bloqueado lanza dentro de la transaccion', async () => {
    const m = montar({ pedido: pedido('ENTREGADO'), setStatus: 'stale' })
    await expect(createVoidDelivery(m.deps)(voidInput(), ANULADOR)).rejects.toThrow(/stale/)
    expect(m.lanzoDentro()).not.toBeNull()
  })
})

describe('voidDelivery — idempotencia (R28)', () => {
  it('R28: clave ya registrada antes de abrir la transaccion: already_registered con el estado leido, sin escribir', async () => {
    const m = montar({ registrada: { id: VOID_ID, orderId: VOID_ORDER_ID }, leido: pedido('ENTREGADO') })
    await expect(createVoidDelivery(m.deps)(voidInput(), ANULADOR)).resolves.toEqual({
      status: 'already_registered',
      orderStatus: 'ENTREGADO',
    })
    expect(m.findByKey).toHaveBeenCalledWith(VOID_KEY, SCOPE)
    expect(m.findAliveById).toHaveBeenCalledWith(VOID_ORDER_ID, SCOPE)
    expect(m.findDelivery).not.toHaveBeenCalled()
    expect(m.run).not.toHaveBeenCalled()
    nadaEscrito(m)
  })

  it('R28: la clave ya registrada responde aunque la entrega pedida no exista', async () => {
    const m = montar({ registrada: { id: VOID_ID, orderId: VOID_ORDER_ID }, entrega: null })
    await expect(createVoidDelivery(m.deps)(voidInput(), ANULADOR)).resolves.toEqual({
      status: 'already_registered',
      orderStatus: 'TERMINADO',
    })
  })

  it('R28: clave vista ya con el pedido bloqueado: deshace y responde already_registered con el estado leido', async () => {
    const m = montar({
      pedido: pedido('TERMINADO'),
      registradaDentro: { id: VOID_ID, orderId: VOID_ORDER_ID },
      leido: pedido('TERMINADO'),
    })
    await expect(createVoidDelivery(m.deps)(voidInput(), ANULADOR)).resolves.toEqual({
      status: 'already_registered',
      orderStatus: 'TERMINADO',
    })
    expect(m.lanzoDentro()).not.toBeNull()
    expect(m.tx.voids.findDeliveryLines).not.toHaveBeenCalled()
    nadaEscrito(m)
  })

  it('R28: la clave vista con el pedido bloqueado gana al estado: un pedido que ya no admite anular responde already_registered', async () => {
    const m = montar({
      pedido: pedido('CANCELADO'),
      registradaDentro: { id: VOID_ID, orderId: VOID_ORDER_ID },
      leido: pedido('ENTREGADO'),
    })
    await expect(createVoidDelivery(m.deps)(voidInput(), ANULADOR)).resolves.toEqual({
      status: 'already_registered',
      orderStatus: 'ENTREGADO',
    })
  })

  it('R28: duplicate_key al crear: deshace y responde already_registered con el estado leido', async () => {
    const m = montar({ creada: { kind: 'duplicate_key' }, leido: pedido('ENTREGADO') })
    await expect(createVoidDelivery(m.deps)(voidInput(), ANULADOR)).resolves.toEqual({
      status: 'already_registered',
      orderStatus: 'ENTREGADO',
    })
    expect(m.lanzoDentro()).not.toBeNull()
    expect(m.findByKey).toHaveBeenCalledTimes(2)
    expect(m.tx.voids.addLines).not.toHaveBeenCalled()
    expect(m.tx.finishedGoods.returnForDeliveryVoid).not.toHaveBeenCalled()
    expect(m.tx.orders.setStatus).not.toHaveBeenCalled()
  })

  it('R28: si el pedido de la anulacion registrada ya no se lee, responde order_not_found', async () => {
    const m = montar({ registrada: { id: VOID_ID, orderId: VOID_ORDER_ID }, leido: null })
    expect(await codigoDelFallo(() => createVoidDelivery(m.deps)(voidInput(), ANULADOR))).toBe('order_not_found')
  })
})
