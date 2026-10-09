// Lista de entregas de un pedido: el caso de uso contra dobles de sus puertos. El orden real y el
// aislamiento por empresa contra Postgres van en los `.int`.

import { describe, expect, it, vi } from 'vitest'

import { ROLE_ADMINISTRADOR, SEED_ROLE_PERMISSIONS } from '@/lib/modules/identity'
import {
  createListOrderDeliveries,
  type ListOrderDeliveriesDeps,
} from '@/lib/modules/pedidos/domain/list-order-deliveries'
import {
  FIRST_BATCH_ID,
  NEWER_DELIVERY_ID,
  OLDER_DELIVERY_ID,
  OPEN_LINE_ID,
  SECOND_BATCH_ID,
  THIRD_BATCH_ID,
  VOID_ORDER_ID,
  VOID_REASON,
  VOIDED_LINE_ID,
  deliveryHistoryView,
} from '@/tests/fixtures/order-delivery-void'
import { fakeOrderRow } from '@/tests/helpers/order-unit-of-work-double'

import type { CustomerRef } from '@/lib/modules/clientes'
import type { PersonRef } from '@/lib/modules/identity'
import type { PresentationRef } from '@/lib/modules/inventario'
import type { Actor } from '@/lib/modules/pedidos/domain/actor'
import type { PedidosError } from '@/lib/modules/pedidos/domain/errors'
import type { OrderRow } from '@/lib/modules/pedidos/domain/order-view'
import type { DeliveryHistoryRow } from '@/lib/modules/pedidos/ports/order-delivery-void-repository'
import type { OrderRepository } from '@/lib/modules/pedidos/ports/order-repository'
import type { FinishPackingLine } from '@/lib/modules/pedidos/ports/order-write-repository'

const EMPRESA = '33333333-3333-4333-8333-333333333333'
const SCOPE = { companyId: EMPRESA }
const AHORA = new Date('2026-10-09T12:00:00.000Z')
const CLIENTE_ID = 'c0000000-0000-4000-8000-000000000024'
const LAURA = 'u-laura'
const CARLOS = 'u-carlos'
const BOTELLA = 'f0000000-0000-4000-8000-000000000001'
const GALON = 'f0000000-0000-4000-8000-000000000002'

const CONSULTOR: Actor = { id: 'u-consulta', companyId: EMPRESA, permissions: ['pedidos.consultar'] }

const PEDIDO: OrderRow = fakeOrderRow({
  id: VOID_ORDER_ID,
  number: { year: 2026, sequence: 24 },
  status: 'ENTREGADO',
})

const REPARTO: readonly FinishPackingLine[] = [
  { id: OPEN_LINE_ID, presentationId: BOTELLA, packages: 10, presentationContent: '1.0000', packagingProductId: null },
  { id: VOIDED_LINE_ID, presentationId: GALON, packages: 3, presentationContent: '4.0000', packagingProductId: null },
]

const PRESENTACIONES: readonly PresentationRef[] = [
  { id: BOTELLA, name: 'Botella 1 L', content: '1.0000', unitId: 'unit-l' },
  { id: GALON, name: 'Galon 4 L', content: '4.0000', unitId: 'unit-l' },
]

/** Cliente dado de baja: su nombre se sigue mostrando. */
const CLIENTE: CustomerRef = { id: CLIENTE_ID, firstNames: 'Ana', lastNames: 'Perez', isDeleted: true }

/** Laura esta dada de baja (inactiva): su nombre se sigue mostrando. */
const PERSONAS: readonly PersonRef[] = [
  { id: LAURA, displayName: 'Laura Gomez', isActive: false, permissions: [] },
  { id: CARLOS, displayName: 'Carlos Ruiz', isActive: true, permissions: [] },
]

const LOTES = new Map([
  [FIRST_BATCH_ID, 'L-2026-0101'],
  [SECOND_BATCH_ID, 'L-2026-0102'],
  [THIRD_BATCH_ID, 'L-2026-0103'],
])

/** Lo que devuelve el lector, ya ordenado: la mas reciente primero. Reproduce `deliveryHistoryView`. */
const FILAS: readonly DeliveryHistoryRow[] = [
  {
    id: NEWER_DELIVERY_ID,
    customerId: CLIENTE_ID,
    createdBy: LAURA,
    createdAt: new Date('2026-10-08T15:30:00.000Z'),
    lines: [
      { presentationLineId: OPEN_LINE_ID, batchId: FIRST_BATCH_ID, packages: 4, void: null },
      {
        presentationLineId: VOIDED_LINE_ID,
        batchId: THIRD_BATCH_ID,
        packages: 3,
        void: { reason: VOID_REASON, createdBy: LAURA, createdAt: new Date('2026-10-09T09:00:00.000Z') },
      },
      { presentationLineId: OPEN_LINE_ID, batchId: SECOND_BATCH_ID, packages: 2, void: null },
    ],
  },
  {
    id: OLDER_DELIVERY_ID,
    customerId: CLIENTE_ID,
    createdBy: CARLOS,
    createdAt: new Date('2026-10-07T11:00:00.000Z'),
    lines: [{ presentationLineId: OPEN_LINE_ID, batchId: FIRST_BATCH_ID, packages: 4, void: null }],
  },
]

type Fn = ReturnType<typeof vi.fn>

type Montaje = {
  readonly deps: ListOrderDeliveriesDeps
  readonly findAliveById: Fn
  readonly listByOrder: Fn
  readonly findPresentationLinesForFinish: Fn
  readonly findRefs: Fn
  readonly findRefsIncludingDeleted: Fn
  readonly findRefsIncludingDeletedInCompany: Fn
  readonly findLots: Fn
}

function montar(
  opciones: {
    pedido?: OrderRow | null
    filas?: readonly DeliveryHistoryRow[]
    personas?: readonly PersonRef[]
    clientes?: readonly CustomerRef[]
    lotes?: ReadonlyMap<string, string>
  } = {},
): Montaje {
  const findAliveById = vi.fn(async () => (opciones.pedido === undefined ? PEDIDO : opciones.pedido))
  const listByOrder = vi.fn(async () => opciones.filas ?? FILAS)
  const findPresentationLinesForFinish = vi.fn(async () => REPARTO)
  const findRefs = vi.fn(async () => PRESENTACIONES)
  const findRefsIncludingDeleted = vi.fn(async () => opciones.clientes ?? [CLIENTE])
  const findRefsIncludingDeletedInCompany = vi.fn(async () => opciones.personas ?? PERSONAS)
  const findLots = vi.fn(async () => opciones.lotes ?? LOTES)
  const explota = (nombre: string) =>
    vi.fn(() => {
      throw new Error(`OrderRepository.${nombre} no deberia llamarse`)
    })
  const orders = { findAliveById, listAlive: explota('listAlive'), findBlockedIds: explota('findBlockedIds') }

  return {
    deps: {
      orders: orders as unknown as OrderRepository,
      lines: { findPresentationLinesForFinish },
      history: { listByOrder },
      presentations: { findRefs },
      customerCatalog: { findRefsIncludingDeleted },
      people: { findRefsIncludingDeletedInCompany },
      batchLots: { findLots },
      now: () => AHORA,
    },
    findAliveById,
    listByOrder,
    findPresentationLinesForFinish,
    findRefs,
    findRefsIncludingDeleted,
    findRefsIncludingDeletedInCompany,
    findLots,
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

function ningunPuerto(m: Montaje): void {
  for (const puerto of [
    m.findAliveById,
    m.listByOrder,
    m.findPresentationLinesForFinish,
    m.findRefs,
    m.findRefsIncludingDeleted,
    m.findRefsIncludingDeletedInCompany,
    m.findLots,
  ]) {
    expect(puerto).not.toHaveBeenCalled()
  }
}

describe('listOrderDeliveries — acceso (R4)', () => {
  it('R4: sin pedidos.consultar responde unauthorized antes de leer nada', async () => {
    const m = montar()
    const listar = createListOrderDeliveries(m.deps)
    const soloEntregas: Actor = { ...CONSULTOR, permissions: ['entregas.anular', 'entregas.modificar', 'pedidos.modificar'] }

    for (const actor of [null, undefined, { ...CONSULTOR, permissions: [] }, soloEntregas]) {
      expect(await codigoDelFallo(() => listar(VOID_ORDER_ID, actor))).toBe('unauthorized')
      expect(await codigoDelFallo(() => listar('no-es-uuid', actor))).toBe('unauthorized')
    }
    ningunPuerto(m)
  })

  it('R4: decide por el permiso: un actor de otro rol con pedidos.consultar lee la lista', async () => {
    const m = montar()
    const deOtroRol: Actor = { id: 'u-operador', companyId: EMPRESA, permissions: ['asignaciones.consultar', 'pedidos.consultar'] }
    await expect(createListOrderDeliveries(m.deps)(VOID_ORDER_ID, deOtroRol)).resolves.toEqual(deliveryHistoryView())
  })

  it('R4: un Administrador sin pedidos.consultar en su conjunto es rechazado', async () => {
    const m = montar()
    const delAdministrador = [...SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]]
    expect(delAdministrador).toContain('pedidos.consultar')
    const adminSinPermiso: Actor = {
      id: 'u-admin',
      companyId: EMPRESA,
      permissions: delAdministrador.filter((p) => p !== 'pedidos.consultar'),
    }
    expect(await codigoDelFallo(() => createListOrderDeliveries(m.deps)(VOID_ORDER_ID, adminSinPermiso))).toBe('unauthorized')
    ningunPuerto(m)
  })
})

describe('listOrderDeliveries — pedido (R6)', () => {
  it('R6: un id sin forma de uuid responde order_not_found sin leer nada', async () => {
    const m = montar()
    expect(await codigoDelFallo(() => createListOrderDeliveries(m.deps)('pedido-1', CONSULTOR))).toBe('order_not_found')
    ningunPuerto(m)
  })

  for (const caso of ['no existe', 'esta borrado', 'es de otra empresa']) {
    it(`R6: el pedido que ${caso} (el puerto devuelve null) responde order_not_found sin devolver datos`, async () => {
      const m = montar({ pedido: null })
      expect(await codigoDelFallo(() => createListOrderDeliveries(m.deps)(VOID_ORDER_ID, CONSULTOR))).toBe('order_not_found')
      expect(m.findAliveById).toHaveBeenCalledWith(VOID_ORDER_ID, SCOPE)
      expect(m.listByOrder).not.toHaveBeenCalled()
      expect(m.findRefsIncludingDeleted).not.toHaveBeenCalled()
      expect(m.findRefsIncludingDeletedInCompany).not.toHaveBeenCalled()
      expect(m.findLots).not.toHaveBeenCalled()
    })
  }

  it('R6: lee con el ambito de la empresa del actor', async () => {
    const m = montar()
    await createListOrderDeliveries(m.deps)(VOID_ORDER_ID, CONSULTOR)
    expect(m.listByOrder).toHaveBeenCalledWith(VOID_ORDER_ID, SCOPE)
    expect(m.findPresentationLinesForFinish).toHaveBeenCalledWith(VOID_ORDER_ID, SCOPE)
    expect(m.findRefs).toHaveBeenCalledWith([BOTELLA, GALON], EMPRESA)
    expect(m.findRefsIncludingDeleted).toHaveBeenCalledWith([CLIENTE_ID], EMPRESA)
    expect(m.findRefsIncludingDeletedInCompany).toHaveBeenCalledWith(EMPRESA, [LAURA, CARLOS], AHORA)
    expect(m.findLots).toHaveBeenCalledWith([FIRST_BATCH_ID, THIRD_BATCH_ID, SECOND_BATCH_ID], EMPRESA)
  })
})

describe('listOrderDeliveries — la lista (R7, R8, R9)', () => {
  it('R7, R9: compone la vista entera: cabecera, entregas, presentaciones, lotes y lo anulado', async () => {
    const m = montar()
    await expect(createListOrderDeliveries(m.deps)(VOID_ORDER_ID, CONSULTOR)).resolves.toEqual(deliveryHistoryView())
  })

  it('R7: conserva el orden del lector, de la mas reciente a la mas antigua', async () => {
    const m = montar()
    const vista = await createListOrderDeliveries(m.deps)(VOID_ORDER_ID, CONSULTOR)
    expect(vista.deliveries.map((d) => d.id)).toEqual([NEWER_DELIVERY_ID, OLDER_DELIVERY_ID])
    expect(vista.deliveries.map((d) => d.createdAt)).toEqual(['2026-10-08T15:30:00.000Z', '2026-10-07T11:00:00.000Z'])
  })

  it('R7: agrupa por presentacion las lineas de una entrega, aunque lleguen intercaladas, y suma sus lotes', async () => {
    const m = montar()
    const [reciente] = (await createListOrderDeliveries(m.deps)(VOID_ORDER_ID, CONSULTOR)).deliveries
    expect(reciente?.presentations.map((p) => [p.presentationLineId, p.packages])).toEqual([
      [OPEN_LINE_ID, 6],
      [VOIDED_LINE_ID, 3],
    ])
    expect(reciente?.presentations[0]?.batches).toEqual([
      { batchId: FIRST_BATCH_ID, lot: 'L-2026-0101', packages: 4 },
      { batchId: SECOND_BATCH_ID, lot: 'L-2026-0102', packages: 2 },
    ])
  })

  it('R7: muestra el cliente y el autor aunque esten dados de baja', async () => {
    const m = montar()
    const vista = await createListOrderDeliveries(m.deps)(VOID_ORDER_ID, CONSULTOR)
    expect(vista.deliveries.map((d) => [d.customerName, d.authorName])).toEqual([
      ['Ana Perez', 'Laura Gomez'],
      ['Ana Perez', 'Carlos Ruiz'],
    ])
  })

  it('R7: un nombre que no vuelve de su catalogo se muestra como identificador corto, sin lanzar', async () => {
    const m = montar({ personas: [], clientes: [], lotes: new Map() })
    const [reciente] = (await createListOrderDeliveries(m.deps)(VOID_ORDER_ID, CONSULTOR)).deliveries
    expect(reciente?.customerName).toBe(CLIENTE_ID.slice(0, 8))
    expect(reciente?.authorName).toBe(LAURA.slice(0, 8))
    expect(reciente?.presentations[0]?.batches[0]?.lot).toBe(FIRST_BATCH_ID.slice(0, 8))
    expect(reciente?.presentations[1]?.void?.authorName).toBe(LAURA.slice(0, 8))
  })

  it('R8: un pedido sin entregas devuelve la lista vacia sin consultar catalogos', async () => {
    const m = montar({ filas: [] })
    await expect(createListOrderDeliveries(m.deps)(VOID_ORDER_ID, CONSULTOR)).resolves.toEqual(
      deliveryHistoryView({ deliveries: [] }),
    )
    expect(m.findRefs).not.toHaveBeenCalled()
    expect(m.findRefsIncludingDeleted).not.toHaveBeenCalled()
    expect(m.findRefsIncludingDeletedInCompany).not.toHaveBeenCalled()
    expect(m.findLots).not.toHaveBeenCalled()
  })

  it('R9: la presentacion anulada lleva motivo, autor y fecha de su anulacion, junto a sus envases y lotes', async () => {
    const m = montar()
    const [reciente] = (await createListOrderDeliveries(m.deps)(VOID_ORDER_ID, CONSULTOR)).deliveries
    expect(reciente?.presentations[1]).toEqual({
      presentationLineId: VOIDED_LINE_ID,
      presentationName: 'Galon 4 L',
      packages: 3,
      batches: [{ batchId: THIRD_BATCH_ID, lot: 'L-2026-0103', packages: 3 }],
      void: { reason: VOID_REASON, authorName: 'Laura Gomez', createdAt: '2026-10-09T09:00:00.000Z' },
    })
    expect(reciente?.presentations[0]?.void).toBeNull()
  })

  it('R9: el autor de la anulacion se resuelve aunque solo aparezca como autor de una anulacion', async () => {
    const OTRA = 'u-otra'
    const filas = FILAS.map((fila) =>
      fila.id !== NEWER_DELIVERY_ID
        ? fila
        : {
            ...fila,
            lines: fila.lines.map((l) => (l.void === null ? l : { ...l, void: { ...l.void, createdBy: OTRA } })),
          },
    )
    const m = montar({
      filas,
      personas: [...PERSONAS, { id: OTRA, displayName: 'Marta Diaz', isActive: true, permissions: [] }],
    })
    const [reciente] = (await createListOrderDeliveries(m.deps)(VOID_ORDER_ID, CONSULTOR)).deliveries
    expect(m.findRefsIncludingDeletedInCompany).toHaveBeenCalledWith(EMPRESA, [LAURA, CARLOS, OTRA], AHORA)
    expect(reciente?.presentations[1]?.void?.authorName).toBe('Marta Diaz')
  })
})
