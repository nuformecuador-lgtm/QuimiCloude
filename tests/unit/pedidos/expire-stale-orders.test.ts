// QC-141 T12 — el proceso diario (R21, R22, R25, R26): `createExpireStaleOrders` sobre dobles
// de `OrderUnitOfWork`, sin base de datos. `findExpirable` ya viene con el filtro de R22 hecho
// -es contrato del driven-, asi que estos tests afirman sobre lo que hace el CASO DE USO con
// cada candidato: bloquear, recomprobar bajo el candado y, solo entonces, cancelar y liberar.
import { describe, expect, it, vi } from 'vitest'

import { createExpireStaleOrders } from '@/lib/modules/pedidos/domain/expire-stale-orders'
import { EXPIRED_ORDER_REASON } from '@/lib/modules/pedidos/domain/order-expiry'

import { fakeOrderRow, fakeUnitOfWork } from '@/tests/helpers/order-unit-of-work-double'

import type { ExpirableOrderCandidate } from '@/lib/modules/pedidos/domain/expire-stale-orders'

const AHORA = new Date('2026-09-23T07:00:00.000Z')

const PEDIDO_A: ExpirableOrderCandidate = {
  id: '11111111-1111-4111-8111-111111111111',
  companyId: '33333333-3333-4333-8333-333333333333',
}
const PEDIDO_B: ExpirableOrderCandidate = {
  id: '22222222-2222-4222-8222-222222222222',
  companyId: '44444444-4444-4444-8444-444444444444',
}

describe('createExpireStaleOrders — R21: cancela con el motivo exacto, sin autor, y libera como expire', () => {
  it('cada candidato se bloquea, se cancela y se libera en ESE orden', async () => {
    const d = fakeUnitOfWork({ orders: { lockAliveById: vi.fn(async () => fakeOrderRow()) } })
    const orden: string[] = []
    d.orders.lockAliveById.mockImplementation(async () => {
      orden.push('lockAliveById')
      return fakeOrderRow()
    })
    d.orders.cancelAlive.mockImplementation(async () => {
      orden.push('cancelAlive')
      return 'ok' as const
    })
    d.reservations.releaseForOrder.mockImplementation(async () => {
      orden.push('releaseForOrder')
    })
    d.orders.setReservedAt.mockImplementation(async () => {
      orden.push('setReservedAt')
    })
    const findExpirable = vi.fn(async () => [PEDIDO_A])

    const resultado = await createExpireStaleOrders({
      findExpirable,
      unitOfWork: d.unitOfWork,
      now: () => AHORA,
    })()

    expect(orden).toEqual(['lockAliveById', 'cancelAlive', 'releaseForOrder', 'setReservedAt'])
    expect(d.orders.cancelAlive.mock.calls[0]).toEqual([
      PEDIDO_A.id,
      EXPIRED_ORDER_REASON,
      null,
      AHORA,
      { companyId: PEDIDO_A.companyId },
    ])
    expect(d.reservations.releaseForOrder.mock.calls[0]?.[0]).toMatchObject({
      orderId: PEDIDO_A.id,
      companyId: PEDIDO_A.companyId,
      reason: 'expire',
      actorId: null,
      now: AHORA,
    })
    expect(d.orders.setReservedAt.mock.calls[0]).toEqual([PEDIDO_A.id, null, { companyId: PEDIDO_A.companyId }])
    expect(resultado).toEqual({ expired: 1, failed: [] })
  })
})

describe('createExpireStaleOrders — R22: solo toca lo que sigue PENDIENTE bajo el candado', () => {
  it('si el candidato ya no esta PENDIENTE al bloquearlo, no cancela ni libera nada', async () => {
    const d = fakeUnitOfWork({
      orders: { lockAliveById: vi.fn(async () => fakeOrderRow({ status: 'EN_CURSO' })) },
    })
    const findExpirable = vi.fn(async () => [PEDIDO_A])

    const resultado = await createExpireStaleOrders({
      findExpirable,
      unitOfWork: d.unitOfWork,
      now: () => AHORA,
    })()

    expect(d.orders.cancelAlive).not.toHaveBeenCalled()
    expect(d.reservations.releaseForOrder).not.toHaveBeenCalled()
    expect(d.orders.setReservedAt).not.toHaveBeenCalled()
    expect(resultado).toEqual({ expired: 0, failed: [] })
  })

  it('si el candidato ya no existe (borrado o de otra empresa) al bloquearlo, no hace nada', async () => {
    const d = fakeUnitOfWork({ orders: { lockAliveById: vi.fn(async () => null) } })
    const findExpirable = vi.fn(async () => [PEDIDO_A])

    const resultado = await createExpireStaleOrders({
      findExpirable,
      unitOfWork: d.unitOfWork,
      now: () => AHORA,
    })()

    expect(d.orders.cancelAlive).not.toHaveBeenCalled()
    expect(resultado).toEqual({ expired: 0, failed: [] })
  })
})

describe('createExpireStaleOrders — R25: idempotente ante una repeticion o un solape', () => {
  it('un pedido ya CANCELADO por una ejecucion anterior no se cancela ni se libera otra vez', async () => {
    const d = fakeUnitOfWork({
      orders: { lockAliveById: vi.fn(async () => fakeOrderRow({ status: 'CANCELADO', cancellationReason: EXPIRED_ORDER_REASON })) },
    })
    const findExpirable = vi.fn(async () => [PEDIDO_A])

    const resultado = await createExpireStaleOrders({
      findExpirable,
      unitOfWork: d.unitOfWork,
      now: () => AHORA,
    })()

    expect(d.orders.cancelAlive).not.toHaveBeenCalled()
    expect(d.reservations.releaseForOrder).not.toHaveBeenCalled()
    expect(resultado).toEqual({ expired: 0, failed: [] })
  })
})

describe('createExpireStaleOrders — R26: un fallo no arrastra a los demas y queda anotado', () => {
  it('el pedido cuya transaccion lanza se anota en `failed`, y los demas se procesan igual', async () => {
    const d = fakeUnitOfWork({
      orders: {
        cancelAlive: vi.fn(async () => 'ok' as const),
        setReservedAt: vi.fn(async () => undefined),
      },
    })
    d.orders.lockAliveById.mockImplementation(async (id: string) => {
      if (id === PEDIDO_A.id) throw new Error('fallo de base simulado')
      return fakeOrderRow({ id, presentationId: null })
    })
    const findExpirable = vi.fn(async () => [PEDIDO_A, PEDIDO_B])

    const resultado = await createExpireStaleOrders({
      findExpirable,
      unitOfWork: d.unitOfWork,
      now: () => AHORA,
    })()

    expect(resultado.expired).toBe(1)
    expect(resultado.failed).toEqual([{ id: PEDIDO_A.id, companyId: PEDIDO_A.companyId }])
    // El pedido que SI se pudo procesar llego hasta el final.
    expect(d.orders.cancelAlive).toHaveBeenCalledTimes(1)
    expect(d.orders.cancelAlive.mock.calls[0]?.[0]).toBe(PEDIDO_B.id)
  })
})

describe('createExpireStaleOrders — recorre lotes hasta vaciarlos', () => {
  it('pide un segundo lote cuando el primero viene LLENO (el tamano del lote), y para cuando llega vacio', async () => {
    const d = fakeUnitOfWork({
      orders: {
        lockAliveById: vi.fn(async (id: string) => fakeOrderRow({ id, presentationId: null })),
        cancelAlive: vi.fn(async () => 'ok' as const),
        setReservedAt: vi.fn(async () => undefined),
      },
    })
    // El caso de uso pide de a 100: un primer lote de exactamente 100 fuerza una segunda vuelta.
    const primerLote: readonly ExpirableOrderCandidate[] = Array.from({ length: 100 }, (_v, i) => ({
      id: `11111111-1111-4111-8111-1111111111${String(i).padStart(2, '0')}`,
      companyId: PEDIDO_A.companyId,
    }))
    const findExpirable = vi.fn(async (_threshold: Date, limit: number) => {
      void limit
      return findExpirable.mock.calls.length === 1 ? primerLote : []
    })

    const resultado = await createExpireStaleOrders({
      findExpirable,
      unitOfWork: d.unitOfWork,
      now: () => AHORA,
      budgetMs: 5000,
    })()

    expect(findExpirable).toHaveBeenCalledTimes(2)
    expect(resultado.expired).toBe(100)
  })
})
