// El proceso diario: `createExpireStaleOrders` sobre dobles de `OrderUnitOfWork`, sin base de
// datos. `listCompanyIds` y `findExpirable` ya vienen con el filtro por empresa y por vencidos
// hecho -es contrato del driven-, asi que estos tests afirman sobre lo que hace el CASO DE USO
// con cada candidato: bloquear, recomprobar bajo el candado y, solo entonces, cancelar y
// liberar.
import { describe, expect, it, vi } from 'vitest'

import { createExpireStaleOrders } from '@/lib/modules/pedidos/domain/expire-stale-orders'
import { EXPIRED_ORDER_REASON } from '@/lib/modules/pedidos/domain/order-expiry'

import { fakeOrderRow, fakeUnitOfWork } from '@/tests/helpers/order-unit-of-work-double'

const AHORA = new Date('2026-09-23T07:00:00.000Z')

const EMPRESA_A = '33333333-3333-4333-8333-333333333333'
const EMPRESA_B = '44444444-4444-4444-8444-444444444444'
const PEDIDO_A_ID = '11111111-1111-4111-8111-111111111111'
const PEDIDO_B_ID = '22222222-2222-4222-8222-222222222222'

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
    const listCompanyIds = vi.fn(async () => [EMPRESA_A])
    const findExpirable = vi.fn(async () => [PEDIDO_A_ID])

    const resultado = await createExpireStaleOrders({
      listCompanyIds,
      findExpirable,
      unitOfWork: d.unitOfWork,
      now: () => AHORA,
    })()

    expect(orden).toEqual(['lockAliveById', 'cancelAlive', 'releaseForOrder', 'setReservedAt'])
    expect(d.orders.cancelAlive.mock.calls[0]).toEqual([
      PEDIDO_A_ID,
      EXPIRED_ORDER_REASON,
      null,
      AHORA,
      { companyId: EMPRESA_A },
    ])
    expect(d.reservations.releaseForOrder.mock.calls[0]?.[0]).toMatchObject({
      orderId: PEDIDO_A_ID,
      companyId: EMPRESA_A,
      reason: 'expire',
      actorId: null,
      now: AHORA,
    })
    expect(d.orders.setReservedAt.mock.calls[0]).toEqual([PEDIDO_A_ID, null, { companyId: EMPRESA_A }])
    expect(resultado).toEqual({ expired: 1, failed: [] })
  })
})

describe('createExpireStaleOrders — R22: solo toca lo que sigue PENDIENTE bajo el candado', () => {
  it('si el candidato ya no esta PENDIENTE al bloquearlo, no cancela ni libera nada', async () => {
    const d = fakeUnitOfWork({
      orders: { lockAliveById: vi.fn(async () => fakeOrderRow({ status: 'EN_CURSO' })) },
    })
    const listCompanyIds = vi.fn(async () => [EMPRESA_A])
    const findExpirable = vi.fn(async () => [PEDIDO_A_ID])

    const resultado = await createExpireStaleOrders({
      listCompanyIds,
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
    const listCompanyIds = vi.fn(async () => [EMPRESA_A])
    const findExpirable = vi.fn(async () => [PEDIDO_A_ID])

    const resultado = await createExpireStaleOrders({
      listCompanyIds,
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
    const listCompanyIds = vi.fn(async () => [EMPRESA_A])
    const findExpirable = vi.fn(async () => [PEDIDO_A_ID])

    const resultado = await createExpireStaleOrders({
      listCompanyIds,
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
      if (id === PEDIDO_A_ID) throw new Error('fallo de base simulado')
      return fakeOrderRow({ id, presentationId: null })
    })
    const listCompanyIds = vi.fn(async () => [EMPRESA_A])
    const findExpirable = vi.fn(async () => [PEDIDO_A_ID, PEDIDO_B_ID])

    const resultado = await createExpireStaleOrders({
      listCompanyIds,
      findExpirable,
      unitOfWork: d.unitOfWork,
      now: () => AHORA,
    })()

    expect(resultado.expired).toBe(1)
    expect(resultado.failed).toEqual([{ id: PEDIDO_A_ID, companyId: EMPRESA_A }])
    // El pedido que SI se pudo procesar llego hasta el final.
    expect(d.orders.cancelAlive).toHaveBeenCalledTimes(1)
    expect(d.orders.cancelAlive.mock.calls[0]?.[0]).toBe(PEDIDO_B_ID)
  })

  it('una empresa que falla al listar sus candidatos no impide procesar las demas', async () => {
    const d = fakeUnitOfWork({
      orders: {
        lockAliveById: vi.fn(async (id: string) => fakeOrderRow({ id, presentationId: null })),
        cancelAlive: vi.fn(async () => 'ok' as const),
        setReservedAt: vi.fn(async () => undefined),
      },
    })
    const listCompanyIds = vi.fn(async () => [EMPRESA_A, EMPRESA_B])
    const findExpirable = vi.fn(async (companyId: string) =>
      companyId === EMPRESA_B ? [PEDIDO_B_ID] : [],
    )

    const resultado = await createExpireStaleOrders({
      listCompanyIds,
      findExpirable,
      unitOfWork: d.unitOfWork,
      now: () => AHORA,
    })()

    expect(findExpirable).toHaveBeenCalledWith(EMPRESA_A, expect.any(Date), 100)
    expect(findExpirable).toHaveBeenCalledWith(EMPRESA_B, expect.any(Date), 100)
    expect(resultado).toEqual({ expired: 1, failed: [] })
  })
})

describe('createExpireStaleOrders — empresa por empresa, sin que una lea los pedidos de otra', () => {
  it('el candidato de la empresa B nunca se busca con el umbral de la empresa A', async () => {
    const d = fakeUnitOfWork({
      orders: {
        lockAliveById: vi.fn(async (id: string) => fakeOrderRow({ id, presentationId: null })),
        cancelAlive: vi.fn(async () => 'ok' as const),
        setReservedAt: vi.fn(async () => undefined),
      },
    })
    const listCompanyIds = vi.fn(async () => [EMPRESA_A, EMPRESA_B])
    const findExpirable = vi.fn(async (companyId: string) =>
      companyId === EMPRESA_A ? [PEDIDO_A_ID] : [PEDIDO_B_ID],
    )

    const resultado = await createExpireStaleOrders({
      listCompanyIds,
      findExpirable,
      unitOfWork: d.unitOfWork,
      now: () => AHORA,
    })()

    expect(d.orders.cancelAlive.mock.calls.map((call) => call[0])).toEqual([PEDIDO_A_ID, PEDIDO_B_ID])
    expect(d.orders.cancelAlive.mock.calls.map((call) => call[4])).toEqual([
      { companyId: EMPRESA_A },
      { companyId: EMPRESA_B },
    ])
    expect(resultado).toEqual({ expired: 2, failed: [] })
  })
})

describe('createExpireStaleOrders — recorre lotes hasta vaciarlos, POR EMPRESA', () => {
  it('pide un segundo lote de la MISMA empresa cuando el primero viene LLENO, y pasa a la siguiente cuando llega vacio', async () => {
    const d = fakeUnitOfWork({
      orders: {
        lockAliveById: vi.fn(async (id: string) => fakeOrderRow({ id, presentationId: null })),
        cancelAlive: vi.fn(async () => 'ok' as const),
        setReservedAt: vi.fn(async () => undefined),
      },
    })
    // El caso de uso pide de a 100: un primer lote de exactamente 100 fuerza una segunda vuelta
    // sobre la MISMA empresa antes de pasar a la siguiente.
    const primerLote = Array.from({ length: 100 }, (_v, i) =>
      `11111111-1111-4111-8111-1111111111${String(i).padStart(2, '0')}`,
    )
    const listCompanyIds = vi.fn(async () => [EMPRESA_A])
    const findExpirable = vi.fn(async (_companyId: string, _threshold: Date, limit: number) => {
      void limit
      return findExpirable.mock.calls.length === 1 ? primerLote : []
    })

    const resultado = await createExpireStaleOrders({
      listCompanyIds,
      findExpirable,
      unitOfWork: d.unitOfWork,
      now: () => AHORA,
      budgetMs: 5000,
    })()

    expect(findExpirable).toHaveBeenCalledTimes(2)
    expect(findExpirable.mock.calls.every((call) => call[0] === EMPRESA_A)).toBe(true)
    expect(resultado.expired).toBe(100)
  })
})
