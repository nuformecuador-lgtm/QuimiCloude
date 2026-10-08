// T12 (QC-34) — Borrado (R31, R32, R33, R6).
//
// Borrado LOGICO y sin restaurar (decision cerrada 9): el pedido conserva su fila entera y su
// numero correlativo, que no se libera ni se reutiliza (R13). Ni un `ENTREGADO` ni un
// `CANCELADO` se borran, y se rechaza con `code` PROPIO -`not_deletable`-, distinto del
// `invalid_transition` de la edicion: son dos negativas distintas y QC-35 tiene que poder
// decirlas distinto sin leer el mensaje (R56).
//
// La otra mitad de R32 -el `CHECK orders_delivered_not_deleted` ampliado, que impide el mismo
// borrado escrito por consola- es del test de integracion.

import { describe, expect, it, vi } from 'vitest'

import { createDeleteOrder } from '@/lib/modules/pedidos/domain/delete-order'
import {
  NotDeletableError,
  OrderNotFoundError,
  UnauthorizedError,
  type PedidosError,
} from '@/lib/modules/pedidos/domain/errors'

import { fakeUnitOfWork } from '@/tests/helpers/order-unit-of-work-double'

import type { Actor } from '@/lib/modules/pedidos/domain/actor'
import type { OrderStatus } from '@/lib/modules/pedidos/domain/order-classification'
import type { OrderRow } from '@/lib/modules/pedidos/domain/order-view'
import type { OrderRepository } from '@/lib/modules/pedidos/ports/order-repository'

// QC-74: el actor lleva PERMISOS, no el nombre del rol (R18). Los dos codigos de `pedidos`,
// porque este archivo ejercita lecturas y escrituras con el mismo fixture.
// QC-60 (R16): el `Actor` de `pedidos` lleva la EMPRESA desde esta ficha.
const ADMIN: Actor = {
  id: 'admin-1',
  companyId: '33333333-3333-4333-8333-333333333333',
  permissions: ['pedidos.consultar', 'pedidos.modificar'],
}
const ORDER_ID = '11111111-1111-4111-8111-111111111111'
const AHORA = new Date('2026-09-04T12:00:00.000Z')

function fila(status: OrderStatus): OrderRow {
  return {
    id: ORDER_ID,
    number: { year: 2026, sequence: 7 },
    recipeId: '22222222-2222-4222-8222-222222222222',
    quantity: '10.0000',
    priority: 'BAJA',
    status,
    cancellationReason: status === 'CANCELADO' ? 'anulado por el cliente' : null,
    ingredientsCost: null,
    createdAt: new Date('2026-01-02T03:04:05.000Z'),
    updatedAt: new Date('2026-01-02T03:04:05.000Z'),
    createdBy: 'admin-0',
    updatedBy: 'admin-0',
    presentationLines: [],
    unitId: null,
    customerId: null,
  }
}

function dobles(opciones: { fila?: OrderRow | null; borrado?: 'ok' | 'not_found' } = {}) {
  const filaVista = opciones.fila === undefined ? null : opciones.fila
  const findAliveById = vi.fn(async () => filaVista)

  const explota = (nombre: string) =>
    vi.fn(() => {
      throw new Error(`${nombre} no deberia llamarse al borrar`)
    })

  const orders = {
    findAliveById,
    listAlive: explota('orders.listAlive'),
  } as unknown as OrderRepository

  const lockAliveById = vi.fn(async () => (filaVista === null ? null : { ...filaVista, reservedAt: null, packagingCost: null }))
  const softDeleteAlive = vi.fn(async () => opciones.borrado ?? 'ok')
  const setReservedAt = vi.fn(async (id: string, reservedAt: Date | null) => { void [id, reservedAt] })
  const releaseForOrder = vi.fn(async (input: { reason: 'release' | 'expire'; actorId: string | null }) => { void input })

  const { unitOfWork } = fakeUnitOfWork({
    orders: { lockAliveById, softDeleteAlive, setReservedAt },
    reservations: { releaseForOrder },
  })

  return { orders, unitOfWork, now: () => AHORA, findAliveById, lockAliveById, softDeleteAlive, setReservedAt, releaseForOrder }
}

async function codigoDelFallo(operacion: () => Promise<unknown>): Promise<string> {
  const error = await operacion().then(
    () => null,
    (e: unknown) => e,
  )
  expect(error, 'la operacion tenia que fallar').not.toBeNull()
  return (error as PedidosError).code
}

describe('deleteOrder — borrado logico (R31, R32, R33)', () => {
  it('borra un pedido PENDIENTE marcandolo, con el actor y el instante (R31, R6)', async () => {
    const d = dobles({ fila: fila('PENDIENTE') })

    await createDeleteOrder(d)(ORDER_ID, ADMIN)

    expect(d.softDeleteAlive).toHaveBeenCalledTimes(1)
    // QC-60 (R18): el ambito va AL FINAL de la firma y sale del ACTOR, nunca de la entrada.
    expect(d.softDeleteAlive.mock.calls[0]).toEqual([
      ORDER_ID,
      ADMIN.id,
      AHORA,
      { companyId: ADMIN.companyId },
    ])
  })

  it('borra un pedido EN_CURSO (R31)', async () => {
    const d = dobles({ fila: fila('EN_CURSO') })

    await createDeleteOrder(d)(ORDER_ID, ADMIN)

    expect(d.softDeleteAlive).toHaveBeenCalledTimes(1)
  })

  it('R27: borra logicamente un BLOQUEADO, igual que un PENDIENTE', async () => {
    // Un pedido sin material no dejo consumo ni lote que explicar, asi que borrarlo no pierde
    // nada: se va por la misma puerta que un PENDIENTE, con su marca de tiempo y su autor.
    const d = dobles({ fila: fila('BLOQUEADO') })

    await createDeleteOrder(d)(ORDER_ID, ADMIN)

    expect(d.softDeleteAlive).toHaveBeenCalledTimes(1)
    expect(d.softDeleteAlive.mock.calls[0]).toEqual([
      ORDER_ID,
      ADMIN.id,
      AHORA,
      { companyId: ADMIN.companyId },
    ])
  })

  it('R27, R5: borrar un BLOQUEADO libera sin encontrar nada y tampoco lo rompe', async () => {
    // No aparta material, asi que la liberacion no tiene filas que tocar; se afirma el camino
    // completo, no una excepcion: la operacion termina y el `reserved_at` queda vacio.
    const d = dobles({ fila: fila('BLOQUEADO') })

    await createDeleteOrder(d)(ORDER_ID, ADMIN)

    expect(d.releaseForOrder).toHaveBeenCalledTimes(1)
    expect(d.setReservedAt).toHaveBeenCalledWith(ORDER_ID, null, { companyId: ADMIN.companyId })
    expect(d.softDeleteAlive).toHaveBeenCalledTimes(1)
  })

  it('R27: BLOQUEADO no engaña a la lista de no borrables (y QC-215 R19, R30: los diez estados)', async () => {
    // La lista es explicita a proposito, asi que el caso anterior no basta: si alguien colara
    // BLOQUEADO en ella, ese caso caeria, y aqui se afirma el conjunto entero de los diez.
    for (const status of ['PENDIENTE', 'EN_CURSO', 'BLOQUEADO'] as const) {
      const d = dobles({ fila: fila(status) })
      await createDeleteOrder(d)(ORDER_ID, ADMIN)
      expect(d.softDeleteAlive, status).toHaveBeenCalledTimes(1)
    }
    for (const status of [
      'ENTREGADO',
      'CANCELADO',
      'POR_EMPACAR',
      'EN_EMPAQUE',
      'POR_ACONDICIONAR',
      'EN_ACONDICIONAMIENTO',
      'TERMINADO',
    ] as const) {
      const d = dobles({ fila: fila(status) })
      expect(await codigoDelFallo(() => createDeleteOrder(d)(ORDER_ID, ADMIN)), status).toBe(
        'not_deletable',
      )
    }
  })

  it('no borra un ENTREGADO, y falla con not_deletable, no con invalid_transition (R32)', async () => {
    const d = dobles({ fila: fila('ENTREGADO') })

    expect(await codigoDelFallo(() => createDeleteOrder(d)(ORDER_ID, ADMIN))).toBe('not_deletable')
    expect(d.softDeleteAlive).not.toHaveBeenCalled()
    await expect(createDeleteOrder(d)(ORDER_ID, ADMIN)).rejects.toBeInstanceOf(NotDeletableError)
  })

  it('no borra un CANCELADO: se cancela para dejar constancia (R32)', async () => {
    const d = dobles({ fila: fila('CANCELADO') })

    expect(await codigoDelFallo(() => createDeleteOrder(d)(ORDER_ID, ADMIN))).toBe('not_deletable')
    expect(d.softDeleteAlive).not.toHaveBeenCalled()
  })

  it('no borra un POR_EMPACAR ni un EN_EMPAQUE: el material ya se consumio (R32)', async () => {
    for (const status of ['POR_EMPACAR', 'EN_EMPAQUE'] as const) {
      const d = dobles({ fila: fila(status) })

      expect(
        await codigoDelFallo(() => createDeleteOrder(d)(ORDER_ID, ADMIN)),
        status,
      ).toBe('not_deletable')
      expect(d.softDeleteAlive, status).not.toHaveBeenCalled()
      expect(d.releaseForOrder, status).not.toHaveBeenCalled()
    }
  })

  it('R19, R30 (QC-215): no borra un POR_ACONDICIONAR, un EN_ACONDICIONAMIENTO ni un TERMINADO, sin escribir ni liberar', async () => {
    for (const status of ['POR_ACONDICIONAR', 'EN_ACONDICIONAMIENTO', 'TERMINADO'] as const) {
      const d = dobles({ fila: fila(status) })

      expect(
        await codigoDelFallo(() => createDeleteOrder(d)(ORDER_ID, ADMIN)),
        status,
      ).toBe('not_deletable')
      expect(d.softDeleteAlive, status).not.toHaveBeenCalled()
      expect(d.releaseForOrder, status).not.toHaveBeenCalled()
    }
  })

  it('borrar un pedido inexistente o ya borrado responde order_not_found (R33)', async () => {
    const d = dobles({ fila: null })

    expect(await codigoDelFallo(() => createDeleteOrder(d)(ORDER_ID, ADMIN))).toBe(
      'order_not_found',
    )
    expect(d.softDeleteAlive).not.toHaveBeenCalled()
    await expect(createDeleteOrder(d)(ORDER_ID, ADMIN)).rejects.toBeInstanceOf(OrderNotFoundError)
  })

  it('si la fila desaparece entre la lectura y la escritura, responde order_not_found (R33)', async () => {
    const d = dobles({ fila: fila('PENDIENTE'), borrado: 'not_found' })

    expect(await codigoDelFallo(() => createDeleteOrder(d)(ORDER_ID, ADMIN))).toBe(
      'order_not_found',
    )
  })

  it('R11: un pedido sin presentación se da de baja', async () => {
    const d = dobles({ fila: fila('PENDIENTE') })

    await createDeleteOrder(d)(ORDER_ID, ADMIN)

    expect(d.softDeleteAlive).toHaveBeenCalledTimes(1)
  })
})

describe('QC-141 T9 — borrar libera (R19, R41, N5)', () => {
  it('el orden real es lockAliveById -> releaseForOrder(release) -> setReservedAt(null) -> softDeleteAlive', async () => {
    const d = dobles({ fila: fila('PENDIENTE') })
    const orden: string[] = []
    d.lockAliveById.mockImplementation(async () => {
      orden.push('orders.lockAliveById')
      return { ...fila('PENDIENTE'), reservedAt: null, packagingCost: null }
    })
    d.softDeleteAlive.mockImplementation(async () => {
      orden.push('orders.softDeleteAlive')
      return 'ok' as const
    })
    d.releaseForOrder.mockImplementation(async () => {
      orden.push('reservations.releaseForOrder')
    })
    d.setReservedAt.mockImplementation(async () => {
      orden.push('orders.setReservedAt')
    })

    await createDeleteOrder(d)(ORDER_ID, ADMIN)

    expect(orden).toEqual([
      'orders.lockAliveById',
      'reservations.releaseForOrder',
      'orders.setReservedAt',
      'orders.softDeleteAlive',
    ])
    expect(d.releaseForOrder.mock.calls[0]?.[0]).toMatchObject({ reason: 'release', actorId: ADMIN.id })
    expect(d.setReservedAt.mock.calls[0]?.[1]).toBeNull()
  })

  it('R41: el permiso se exige ANTES de abrir la unidad de trabajo', async () => {
    const findAliveById = vi.fn(() => {
      throw new Error('orders.findAliveById no deberia llamarse sin permiso')
    })
    const unitOfWork = {
      run: vi.fn(() => {
        throw new Error('unitOfWork.run no deberia llamarse sin permiso')
      }),
    }
    const deleteOrder = createDeleteOrder({
      orders: { findAliveById, listAlive: vi.fn() } as unknown as OrderRepository,
      unitOfWork: unitOfWork as unknown as ReturnType<typeof dobles>['unitOfWork'],
      now: () => AHORA,
    })
    const SIN_PERMISO: Actor = { id: 'u-1', companyId: ADMIN.companyId, permissions: ['pedidos.consultar'] }

    await expect(deleteOrder(ORDER_ID, SIN_PERMISO)).rejects.toBeInstanceOf(UnauthorizedError)
    expect(findAliveById).not.toHaveBeenCalled()
    expect(unitOfWork.run).not.toHaveBeenCalled()
  })
})
