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

import { ROLE_ADMINISTRADOR } from '@/lib/modules/identity'
import { createDeleteOrder } from '@/lib/modules/pedidos/domain/delete-order'
import {
  NotDeletableError,
  NotFoundError,
  type PedidosError,
} from '@/lib/modules/pedidos/domain/errors'

import type { Actor } from '@/lib/modules/pedidos/domain/actor'
import type { OrderStatus } from '@/lib/modules/pedidos/domain/order-classification'
import type { OrderRow } from '@/lib/modules/pedidos/domain/order-view'
import type { OrderRepository } from '@/lib/modules/pedidos/ports/order-repository'

const ADMIN: Actor = { id: 'admin-1', roleName: ROLE_ADMINISTRADOR }
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
    createdAt: new Date('2026-01-02T03:04:05.000Z'),
    updatedAt: new Date('2026-01-02T03:04:05.000Z'),
    createdBy: 'admin-0',
    updatedBy: 'admin-0',
  }
}

function dobles(opciones: { fila?: OrderRow | null; borrado?: 'ok' | 'not_found' } = {}) {
  const findAliveById = vi.fn(async () => (opciones.fila === undefined ? null : opciones.fila))
  const softDeleteAlive = vi.fn(async () => opciones.borrado ?? 'ok')

  const explota = (nombre: string) =>
    vi.fn(() => {
      throw new Error(`${nombre} no deberia llamarse al borrar`)
    })

  const orders = {
    create: explota('orders.create'),
    findAliveById,
    listAlive: explota('orders.listAlive'),
    updateAlive: explota('orders.updateAlive'),
    cancelAlive: explota('orders.cancelAlive'),
    softDeleteAlive,
  } as unknown as OrderRepository

  return { orders, now: () => AHORA, findAliveById, softDeleteAlive }
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
    expect(d.softDeleteAlive.mock.calls[0]).toEqual([ORDER_ID, ADMIN.id, AHORA])
  })

  it('borra un pedido EN_CURSO (R31)', async () => {
    const d = dobles({ fila: fila('EN_CURSO') })

    await createDeleteOrder(d)(ORDER_ID, ADMIN)

    expect(d.softDeleteAlive).toHaveBeenCalledTimes(1)
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

  it('borrar un pedido inexistente o ya borrado responde not_found (R33)', async () => {
    const d = dobles({ fila: null })

    expect(await codigoDelFallo(() => createDeleteOrder(d)(ORDER_ID, ADMIN))).toBe('not_found')
    expect(d.softDeleteAlive).not.toHaveBeenCalled()
    await expect(createDeleteOrder(d)(ORDER_ID, ADMIN)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('si la fila desaparece entre la lectura y la escritura, responde not_found (R33)', async () => {
    const d = dobles({ fila: fila('PENDIENTE'), borrado: 'not_found' })

    expect(await codigoDelFallo(() => createDeleteOrder(d)(ORDER_ID, ADMIN))).toBe('not_found')
  })
})
