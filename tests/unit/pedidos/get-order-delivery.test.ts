// QC-223 B4 — Lo que el sheet de entrega lee de un pedido, contra dobles de sus puertos. La
// lectura de punta a punta contra Postgres va en `order-delivery.int.test.ts` (B5).

import { describe, expect, it, vi } from 'vitest'

import { createGetOrderDelivery, type GetOrderDeliveryDeps } from '@/lib/modules/pedidos/domain/get-order-delivery'
import { ORDER_STATUS_VALUES } from '@/lib/modules/pedidos/domain/order-classification'
import { formatOrderNumber } from '@/lib/modules/pedidos/domain/order-number'
import { COMPLETE_LINE_ID, DELIVERY_CUSTOMER_ID, DELIVERY_ORDER_ID, PENDING_LINE_ID } from '@/tests/fixtures/order-delivery'
import { fakeOrderRow } from '@/tests/helpers/order-unit-of-work-double'

import type { CustomerRef } from '@/lib/modules/clientes'
import type { DeliverableBatch, PresentationRef } from '@/lib/modules/inventario'
import type { Actor } from '@/lib/modules/pedidos/domain/actor'
import type { PedidosError } from '@/lib/modules/pedidos/domain/errors'
import type { OrderStatus } from '@/lib/modules/pedidos/domain/order-classification'
import type { OrderRow } from '@/lib/modules/pedidos/domain/order-view'
import type { OrderRepository } from '@/lib/modules/pedidos/ports/order-repository'
import type { FinishPackingLine } from '@/lib/modules/pedidos/ports/order-write-repository'

const EMPRESA = '33333333-3333-4333-8333-333333333333'
const SCOPE = { companyId: EMPRESA }
const RECETA = '22222222-2222-4222-8222-222222222222'
const COMPLETE_PRESENTATION = 'f0000000-0000-4000-8000-000000000001'
const PENDING_PRESENTATION = 'f0000000-0000-4000-8000-000000000002'
const OTHER_PENDING_LINE_ID = 'd0000000-0000-4000-8000-000000000003'
const OTHER_PRESENTATION = 'f0000000-0000-4000-8000-000000000003'

const ENTREGADOR: Actor = { id: 'u-entrega', companyId: EMPRESA, permissions: ['entregas.modificar'] }

const LINEAS: readonly FinishPackingLine[] = [
  { id: COMPLETE_LINE_ID, presentationId: COMPLETE_PRESENTATION, packages: 4, presentationContent: '4.0000', packagingProductId: null },
  { id: PENDING_LINE_ID, presentationId: PENDING_PRESENTATION, packages: 10, presentationContent: '1.0000', packagingProductId: null },
  { id: OTHER_PENDING_LINE_ID, presentationId: OTHER_PRESENTATION, packages: 2, presentationContent: '2.0000', packagingProductId: null },
]

const PRESENTACIONES: readonly PresentationRef[] = [
  { id: COMPLETE_PRESENTATION, name: 'Galon 4 L', content: '4.0000', unitId: 'u-l' },
  { id: PENDING_PRESENTATION, name: 'Botella 1 L', content: '1.0000', unitId: 'u-l' },
  { id: OTHER_PRESENTATION, name: 'Garrafa 2 L', content: '2.0000', unitId: 'u-l' },
]

function lote(batchId: string, presentationId: string, availablePackages: number): DeliverableBatch {
  return {
    batchId,
    presentationId,
    lot: `L-${batchId.slice(-4)}`,
    purchaseDate: '2026-09-30',
    expiryDate: null,
    packageContent: '1.0000',
    availablePackages,
  }
}

const LOTES: readonly DeliverableBatch[] = [
  lote('e0000000-0000-4000-8000-000000000001', PENDING_PRESENTATION, 4),
  lote('e0000000-0000-4000-8000-000000000002', OTHER_PRESENTATION, 1),
  lote('e0000000-0000-4000-8000-000000000003', PENDING_PRESENTATION, 6),
]

const CLIENTE: CustomerRef = { id: DELIVERY_CUSTOMER_ID, firstNames: 'Ana', lastNames: 'Perez', isDeleted: false }

function pedido(overrides: Partial<OrderRow> = {}): OrderRow {
  return fakeOrderRow({
    id: DELIVERY_ORDER_ID,
    number: { year: 2026, sequence: 7 },
    status: 'TERMINADO',
    recipeId: RECETA,
    customerId: DELIVERY_CUSTOMER_ID,
    ...overrides,
  })
}

function montar(
  opciones: {
    pedido?: OrderRow | null
    entregados?: ReadonlyMap<string, number>
    cliente?: CustomerRef | null
    lineas?: readonly FinishPackingLine[]
  } = {},
) {
  const findAliveById = vi.fn(async () => (opciones.pedido === undefined ? pedido() : opciones.pedido))
  const sumDeliveredPackages = vi.fn(
    async () =>
      opciones.entregados ??
      new Map([
        [COMPLETE_LINE_ID, 4],
        [PENDING_LINE_ID, 3],
      ]),
  )
  const findPresentationLinesForFinish = vi.fn(async () => opciones.lineas ?? LINEAS)
  const findRefs = vi.fn(async () => PRESENTACIONES)
  const findDeliverableBatches = vi.fn(async () => LOTES)
  const findAliveRefById = vi.fn(async () => (opciones.cliente === undefined ? CLIENTE : opciones.cliente))
  const explota = (nombre: string) =>
    vi.fn(() => {
      throw new Error(`${nombre} no deberia llamarse`)
    })

  const deps: GetOrderDeliveryDeps = {
    orders: { findAliveById, listAlive: explota('listAlive'), findBlockedIds: explota('findBlockedIds') } as unknown as OrderRepository,
    deliveries: { sumDeliveredPackages },
    lines: { findPresentationLinesForFinish },
    presentations: { findRefs },
    finishedBatches: { findDeliverableBatches },
    customerCatalog: { findAliveRefById },
  }
  const puertos = [
    findAliveById,
    sumDeliveredPackages,
    findPresentationLinesForFinish,
    findRefs,
    findDeliverableBatches,
    findAliveRefById,
  ]
  return { deps, puertos, findAliveById, sumDeliveredPackages, findPresentationLinesForFinish, findRefs, findDeliverableBatches, findAliveRefById }
}

async function codigoDelFallo(operacion: () => Promise<unknown>): Promise<string> {
  const error = await operacion().then(
    () => null,
    (e: unknown) => e,
  )
  expect(error, 'la operacion tenia que fallar').not.toBeNull()
  return (error as PedidosError).code
}

describe('getOrderDelivery — acceso (R2)', () => {
  it('R2: sin entregas.modificar responde unauthorized y ningun puerto se llama', async () => {
    const m = montar()
    const leer = createGetOrderDelivery(m.deps)
    const soloPedidos: Actor = { ...ENTREGADOR, permissions: ['pedidos.consultar', 'pedidos.modificar'] }

    for (const actor of [null, undefined, { ...ENTREGADOR, permissions: [] }, soloPedidos]) {
      expect(await codigoDelFallo(() => leer(DELIVERY_ORDER_ID, actor))).toBe('unauthorized')
      expect(await codigoDelFallo(() => leer('no-es-uuid', actor))).toBe('unauthorized')
    }
    for (const puerto of m.puertos) expect(puerto).not.toHaveBeenCalled()
  })
})

describe('getOrderDelivery — pedido no encontrado o no entregable (R5)', () => {
  it('R5: un id sin forma de uuid es order_not_found sin consultar', async () => {
    const m = montar()
    expect(await codigoDelFallo(() => createGetOrderDelivery(m.deps)('pedido-7', ENTREGADOR))).toBe('order_not_found')
    for (const puerto of m.puertos) expect(puerto).not.toHaveBeenCalled()
  })

  it('R5: inexistente, borrado o de otra empresa (el puerto devuelve null en los tres) es order_not_found y no lee nada mas', async () => {
    const m = montar({ pedido: null })
    expect(await codigoDelFallo(() => createGetOrderDelivery(m.deps)(DELIVERY_ORDER_ID, ENTREGADOR))).toBe('order_not_found')
    expect(m.findAliveById).toHaveBeenCalledWith(DELIVERY_ORDER_ID, SCOPE)
    for (const puerto of m.puertos.slice(1)) expect(puerto).not.toHaveBeenCalled()
  })

  for (const status of ORDER_STATUS_VALUES.filter((s): s is Exclude<OrderStatus, 'TERMINADO'> => s !== 'TERMINADO')) {
    it(`R5: un pedido ${status} es action_not_allowed y no devuelve datos`, async () => {
      const m = montar({ pedido: pedido({ status }) })
      expect(await codigoDelFallo(() => createGetOrderDelivery(m.deps)(DELIVERY_ORDER_ID, ENTREGADOR))).toBe(
        'action_not_allowed',
      )
      for (const puerto of m.puertos.slice(1)) expect(puerto).not.toHaveBeenCalled()
    })
  }
})

describe('getOrderDelivery — lineas y lotes (R6, R8)', () => {
  it('R6: por cada presentacion devuelve nombre, pedidos, entregados y faltan, en el orden del reparto', async () => {
    const m = montar()
    const vista = await createGetOrderDelivery(m.deps)(DELIVERY_ORDER_ID, ENTREGADOR)

    expect(vista.orderId).toBe(DELIVERY_ORDER_ID)
    expect(vista.numberText).toBe(formatOrderNumber({ year: 2026, sequence: 7 }))
    expect(
      vista.lines.map(({ presentationLineId, presentationName, orderedPackages, deliveredPackages, remainingPackages }) => ({
        presentationLineId,
        presentationName,
        orderedPackages,
        deliveredPackages,
        remainingPackages,
      })),
    ).toEqual([
      { presentationLineId: COMPLETE_LINE_ID, presentationName: 'Galon 4 L', orderedPackages: 4, deliveredPackages: 4, remainingPackages: 0 },
      { presentationLineId: PENDING_LINE_ID, presentationName: 'Botella 1 L', orderedPackages: 10, deliveredPackages: 3, remainingPackages: 7 },
      { presentationLineId: OTHER_PENDING_LINE_ID, presentationName: 'Garrafa 2 L', orderedPackages: 2, deliveredPackages: 0, remainingPackages: 2 },
    ])
    expect(m.sumDeliveredPackages).toHaveBeenCalledWith(DELIVERY_ORDER_ID, SCOPE)
    expect(m.findPresentationLinesForFinish).toHaveBeenCalledWith(DELIVERY_ORDER_ID, SCOPE)
    expect(m.findRefs).toHaveBeenCalledWith([COMPLETE_PRESENTATION, PENDING_PRESENTATION, OTHER_PRESENTATION], EMPRESA)
  })

  it('R6: no devuelve ningun listado de entregas anteriores', async () => {
    const m = montar()
    const vista = await createGetOrderDelivery(m.deps)(DELIVERY_ORDER_ID, ENTREGADOR)
    expect(Object.keys(vista).sort()).toEqual(['customer', 'lines', 'numberText', 'orderId'])
    for (const linea of vista.lines) {
      expect(Object.keys(linea).sort()).toEqual([
        'batches',
        'deliveredPackages',
        'orderedPackages',
        'presentationLineId',
        'presentationName',
        'remainingPackages',
      ])
    }
  })

  it('R7: cada linea pendiente lleva los lotes de su presentacion, en el orden del catalogo, y los pide solo para las pendientes', async () => {
    const m = montar()
    const vista = await createGetOrderDelivery(m.deps)(DELIVERY_ORDER_ID, ENTREGADOR)

    expect(m.findDeliverableBatches).toHaveBeenCalledWith(RECETA, [PENDING_PRESENTATION, OTHER_PRESENTATION], EMPRESA)
    expect(vista.lines[1]?.batches).toEqual([LOTES[0], LOTES[2]])
    expect(vista.lines[2]?.batches).toEqual([LOTES[1]])
  })

  it('R8: una linea completa lleva batches vacio aunque el catalogo devolviera lotes de su presentacion', async () => {
    const m = montar()
    m.findDeliverableBatches.mockResolvedValue([...LOTES, lote('e0000000-0000-4000-8000-0000000000cc', COMPLETE_PRESENTATION, 3)])
    const vista = await createGetOrderDelivery(m.deps)(DELIVERY_ORDER_ID, ENTREGADOR)

    expect(vista.lines[0]?.remainingPackages).toBe(0)
    expect(vista.lines[0]?.batches).toEqual([])
  })

  it('R8: si no falta nada en ninguna linea no consulta lotes', async () => {
    const m = montar({
      entregados: new Map([
        [COMPLETE_LINE_ID, 4],
        [PENDING_LINE_ID, 10],
        [OTHER_PENDING_LINE_ID, 2],
      ]),
    })
    const vista = await createGetOrderDelivery(m.deps)(DELIVERY_ORDER_ID, ENTREGADOR)

    expect(m.findDeliverableBatches).not.toHaveBeenCalled()
    expect(vista.lines.every((linea) => linea.remainingPackages === 0 && linea.batches.length === 0)).toBe(true)
  })
})

describe('getOrderDelivery — cliente precargado (R9)', () => {
  it('R9: el cliente vivo del pedido viene precargado', async () => {
    const m = montar()
    const vista = await createGetOrderDelivery(m.deps)(DELIVERY_ORDER_ID, ENTREGADOR)
    expect(vista.customer).toEqual({ id: DELIVERY_CUSTOMER_ID, name: 'Ana Perez', isDeleted: false })
    expect(m.findAliveRefById).toHaveBeenCalledWith(DELIVERY_CUSTOMER_ID, EMPRESA)
  })

  it('R9: un pedido sin cliente da customer null sin consultar el catalogo', async () => {
    const m = montar({ pedido: pedido({ customerId: null }) })
    const vista = await createGetOrderDelivery(m.deps)(DELIVERY_ORDER_ID, ENTREGADOR)
    expect(vista.customer).toBeNull()
    expect(m.findAliveRefById).not.toHaveBeenCalled()
  })

  it('R9: un cliente dado de baja (el catalogo de vivos no lo devuelve) da customer null', async () => {
    const m = montar({ cliente: null })
    const vista = await createGetOrderDelivery(m.deps)(DELIVERY_ORDER_ID, ENTREGADOR)
    expect(vista.customer).toBeNull()
  })
})
