// T12 (QC-34) — Cancelacion (R26, R27, R28, R29, R33, R6).
//
// `cancelOrder` es CASO DE USO PROPIO y el UNICO camino capaz de escribir `CANCELADO` y el
// motivo (decision cerrada 7). Este archivo cubre su mitad de aplicacion: el motivo
// obligatorio y su tope, los dos estados desde los que se cancela y los dos desde los que no.
// La mitad de BASE -el `CHECK orders_cancellation_reason_matches_status`, que impide una
// cancelacion sin motivo o un motivo sin cancelacion escritos por consola- es del test de
// integracion, no de aqui.
//
// Se afirma sobre el `code` de la clase, nunca sobre el texto (R56): que `not_cancellable` sea
// distinto de `invalid_transition` y de `not_deletable` no es cosmetico -QC-35 tiene que poder
// decir tres frases distintas sin leer el mensaje-.

import { describe, expect, it, vi } from 'vitest'

import { createCancelOrder } from '@/lib/modules/pedidos/domain/cancel-order'
import {
  NotCancellableError,
  OrderNotFoundError,
  UnauthorizedError,
  ValidationError,
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

function fila(status: OrderStatus, cancellationReason: string | null = null): OrderRow {
  return {
    id: ORDER_ID,
    number: { year: 2026, sequence: 7 },
    recipeId: '22222222-2222-4222-8222-222222222222',
    quantity: '10.0000',
    priority: 'BAJA',
    status,
    cancellationReason,
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

function dobles(opciones: { fila?: OrderRow | null; cancelacion?: 'ok' | 'not_found' } = {}) {
  const filaVista = opciones.fila === undefined ? null : opciones.fila
  const findAliveById = vi.fn(async () => filaVista)

  const explota = (nombre: string) =>
    vi.fn(() => {
      throw new Error(`${nombre} no deberia llamarse al cancelar`)
    })

  const orders = {
    findAliveById,
    listAlive: explota('orders.listAlive'),
  } as unknown as OrderRepository

  // `lockAliveById` bloquea la MISMA fila que `findAliveById` -en estos tests no hay carrera
  // que las separe-. Los parametros van TIPADOS -y no `vi.fn(async () => ...)`- para poder
  // afirmar sobre `mock.calls[0]`: sin ellos, TypeScript infiere una tupla vacia.
  const lockAliveById = vi.fn(async () => (filaVista === null ? null : { ...filaVista, reservedAt: null, packagingCost: null }))
  const cancelAlive = vi.fn(
    async (id: string, reason: string, actorId: string | null, when: Date) => {
      // El doble no usa los argumentos; los DECLARA para que `mock.calls` tenga tipo.
      void [id, reason, actorId, when]
      return opciones.cancelacion ?? 'ok'
    },
  )
  const setReservedAt = vi.fn(async (id: string, reservedAt: Date | null) => { void [id, reservedAt] })
  const releaseForOrder = vi.fn(async (input: { reason: 'release' | 'expire'; actorId: string | null }) => { void input })

  const { unitOfWork } = fakeUnitOfWork({
    orders: { lockAliveById, cancelAlive, setReservedAt },
    reservations: { releaseForOrder },
  })

  return { orders, unitOfWork, now: () => AHORA, findAliveById, lockAliveById, cancelAlive, setReservedAt, releaseForOrder }
}

async function codigoDelFallo(operacion: () => Promise<unknown>): Promise<string> {
  const error = await operacion().then(
    () => null,
    (e: unknown) => e,
  )
  expect(error, 'la operacion tenia que fallar').not.toBeNull()
  return (error as PedidosError).code
}

describe('cancelOrder — el unico camino hacia CANCELADO (R26, R28, R29, R6)', () => {
  it('cancela un pedido PENDIENTE y escribe el motivo y al actor (R28, R29, R6)', async () => {
    const d = dobles({ fila: fila('PENDIENTE') })

    await createCancelOrder(d)(ORDER_ID, { reason: 'El cliente anulo el pedido' }, ADMIN)

    expect(d.cancelAlive).toHaveBeenCalledTimes(1)
    expect(d.cancelAlive.mock.calls[0]).toEqual([
      ORDER_ID,
      'El cliente anulo el pedido',
      ADMIN.id,
      AHORA,
      // QC-60 (R18): el ambito va AL FINAL de la firma y sale del ACTOR, nunca de la entrada.
      { companyId: ADMIN.companyId },
    ])
  })

  it('cancela un pedido EN_CURSO (R28, decision cerrada 6)', async () => {
    const d = dobles({ fila: fila('EN_CURSO') })

    await createCancelOrder(d)(ORDER_ID, { reason: 'Falta materia prima' }, ADMIN)

    expect(d.cancelAlive).toHaveBeenCalledTimes(1)
  })

  it('R25: cancela un pedido BLOQUEADO con su motivo, igual que un PENDIENTE', async () => {
    // Es la unica salida manual de un pedido sin material: no se fabrico nada, asi que cancelar
    // no deja consumos sin explicacion, y esperar lotes no es cancelar.
    const d = dobles({ fila: fila('BLOQUEADO') })

    await createCancelOrder(d)(ORDER_ID, { reason: 'El cliente ya no lo quiere' }, ADMIN)

    expect(d.cancelAlive).toHaveBeenCalledTimes(1)
    expect(d.cancelAlive.mock.calls[0]).toEqual([
      ORDER_ID,
      'El cliente ya no lo quiere',
      ADMIN.id,
      AHORA,
      { companyId: ADMIN.companyId },
    ])
  })

  it('R25: cancelar un BLOQUEADO pide motivo y lo recorta igual que en los otros dos estados', async () => {
    // Mismo borde de entrada, sin excepciones por estado: el motivo es obligatorio para los tres.
    const sinMotivo = dobles({ fila: fila('BLOQUEADO') })
    expect(
      await codigoDelFallo(() => createCancelOrder(sinMotivo)(ORDER_ID, {}, ADMIN)),
    ).toBe('invalid_input')
    expect(sinMotivo.findAliveById).not.toHaveBeenCalled()

    const conEspacios = dobles({ fila: fila('BLOQUEADO') })
    await createCancelOrder(conEspacios)(ORDER_ID, { reason: '  ya no  ' }, ADMIN)
    expect(conEspacios.cancelAlive.mock.calls[0]?.[1]).toBe('ya no')
  })

  it('R5, R25: cancelar un BLOQUEADO no encuentra material que liberar, y eso no lo rompe', async () => {
    // Un bloqueado no aparta nada (R5), asi que la liberacion no tiene filas que tocar. El doble
    // no falla cuando no encuentra nada, igual que el repositorio: lo que se afirma es que la
    // operacion se completa y que el `reserved_at` se vacia igual.
    const d = dobles({ fila: fila('BLOQUEADO') })

    await createCancelOrder(d)(ORDER_ID, { reason: 'sin stock' }, ADMIN)

    expect(d.releaseForOrder).toHaveBeenCalledTimes(1)
    expect(d.setReservedAt).toHaveBeenCalledWith(ORDER_ID, null, { companyId: ADMIN.companyId })
  })

  it('recorta el motivo antes de escribirlo (R27)', async () => {
    const d = dobles({ fila: fila('PENDIENTE') })

    await createCancelOrder(d)(ORDER_ID, { reason: '   sin stock   ' }, ADMIN)

    expect(d.cancelAlive.mock.calls[0]?.[1]).toBe('sin stock')
  })

  it('acepta un motivo de exactamente 500 caracteres y rechaza el de 501 (R27)', async () => {
    const d = dobles({ fila: fila('PENDIENTE') })
    await createCancelOrder(d)(ORDER_ID, { reason: 'x'.repeat(500) }, ADMIN)
    expect(d.cancelAlive).toHaveBeenCalledTimes(1)

    const e = dobles({ fila: fila('PENDIENTE') })
    expect(
      await codigoDelFallo(() =>
        createCancelOrder(e)(ORDER_ID, { reason: 'x'.repeat(501) }, ADMIN),
      ),
    ).toBe('invalid_input')
    expect(e.findAliveById).not.toHaveBeenCalled()
    expect(e.cancelAlive).not.toHaveBeenCalled()
  })

  it('rechaza cancelar sin motivo, con motivo vacio o de solo espacios (R27)', async () => {
    for (const entrada of [{}, { reason: '' }, { reason: '     ' }, { reason: null }]) {
      const d = dobles({ fila: fila('PENDIENTE') })

      expect(await codigoDelFallo(() => createCancelOrder(d)(ORDER_ID, entrada, ADMIN))).toBe(
        'invalid_input',
      )
      // R27: no modifica ninguna fila, y ni siquiera la lee.
      expect(d.findAliveById).not.toHaveBeenCalled()
      expect(d.cancelAlive).not.toHaveBeenCalled()
    }

    const d = dobles({ fila: fila('PENDIENTE') })
    await expect(createCancelOrder(d)(ORDER_ID, {}, ADMIN)).rejects.toBeInstanceOf(ValidationError)
  })

  it('no cancela un pedido ENTREGADO: eso seria una devolucion, que no existe (R28)', async () => {
    const d = dobles({ fila: fila('ENTREGADO') })

    expect(
      await codigoDelFallo(() => createCancelOrder(d)(ORDER_ID, { reason: 'me equivoque' }, ADMIN)),
    ).toBe('not_cancellable')
    expect(d.cancelAlive).not.toHaveBeenCalled()
    await expect(
      createCancelOrder(d)(ORDER_ID, { reason: 'me equivoque' }, ADMIN),
    ).rejects.toBeInstanceOf(NotCancellableError)
  })

  it('no cancela un pedido POR_EMPACAR ni uno EN_EMPAQUE: el material ya se consumio (R29)', async () => {
    for (const status of ['POR_EMPACAR', 'EN_EMPAQUE'] as const) {
      const d = dobles({ fila: fila(status) })

      expect(
        await codigoDelFallo(() => createCancelOrder(d)(ORDER_ID, { reason: 'sin stock' }, ADMIN)),
        status,
      ).toBe('not_cancellable')
      expect(d.cancelAlive, status).not.toHaveBeenCalled()
      expect(d.releaseForOrder, status).not.toHaveBeenCalled()
    }
  })

  it('R18, R30 (QC-215): no cancela un POR_ACONDICIONAR, un EN_ACONDICIONAMIENTO ni un TERMINADO, sin escribir ni liberar', async () => {
    for (const status of ['POR_ACONDICIONAR', 'EN_ACONDICIONAMIENTO', 'TERMINADO'] as const) {
      const d = dobles({ fila: fila(status) })

      expect(
        await codigoDelFallo(() => createCancelOrder(d)(ORDER_ID, { reason: 'sin stock' }, ADMIN)),
        status,
      ).toBe('not_cancellable')
      expect(d.cancelAlive, status).not.toHaveBeenCalled()
      expect(d.releaseForOrder, status).not.toHaveBeenCalled()
    }
  })

  it('no cancela un pedido ya CANCELADO, y su motivo queda intacto (R28, R29)', async () => {
    const d = dobles({ fila: fila('CANCELADO', 'motivo original') })

    expect(
      await codigoDelFallo(() => createCancelOrder(d)(ORDER_ID, { reason: 'otro motivo' }, ADMIN)),
    ).toBe('not_cancellable')
    // R29: no hay ningun camino capaz de sustituir el motivo de una cancelacion.
    expect(d.cancelAlive).not.toHaveBeenCalled()
  })

  it('cancelar un pedido inexistente o ya borrado responde order_not_found (R33)', async () => {
    const d = dobles({ fila: null })

    expect(
      await codigoDelFallo(() => createCancelOrder(d)(ORDER_ID, { reason: 'sin stock' }, ADMIN)),
    ).toBe('order_not_found')
    expect(d.cancelAlive).not.toHaveBeenCalled()
    await expect(
      createCancelOrder(d)(ORDER_ID, { reason: 'sin stock' }, ADMIN),
    ).rejects.toBeInstanceOf(OrderNotFoundError)
  })

  it('si la fila desaparece entre la lectura y la escritura, responde order_not_found (R33)', async () => {
    const d = dobles({ fila: fila('PENDIENTE'), cancelacion: 'not_found' })

    expect(
      await codigoDelFallo(() => createCancelOrder(d)(ORDER_ID, { reason: 'sin stock' }, ADMIN)),
    ).toBe('order_not_found')
  })

  it('R11: un pedido sin presentación se cancela', async () => {
    const d = dobles({ fila: fila('PENDIENTE') })

    await createCancelOrder(d)(ORDER_ID, { reason: 'sin stock' }, ADMIN)

    expect(d.cancelAlive).toHaveBeenCalledTimes(1)
  })
})

describe('QC-141 T9 — cancelar libera (R18, R41)', () => {
  it('el orden real es lockAliveById -> cancelAlive -> releaseForOrder(release) -> setReservedAt(null)', async () => {
    const d = dobles({ fila: fila('PENDIENTE') })
    const orden: string[] = []
    d.lockAliveById.mockImplementation(async () => {
      orden.push('orders.lockAliveById')
      return { ...fila('PENDIENTE'), reservedAt: null, packagingCost: null }
    })
    d.cancelAlive.mockImplementation(async () => {
      orden.push('orders.cancelAlive')
      return 'ok' as const
    })
    d.releaseForOrder.mockImplementation(async () => {
      orden.push('reservations.releaseForOrder')
    })
    d.setReservedAt.mockImplementation(async () => {
      orden.push('orders.setReservedAt')
    })

    await createCancelOrder(d)(ORDER_ID, { reason: 'sin stock' }, ADMIN)

    expect(orden).toEqual([
      'orders.lockAliveById',
      'orders.cancelAlive',
      'reservations.releaseForOrder',
      'orders.setReservedAt',
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
    const cancelOrder = createCancelOrder({
      orders: { findAliveById, listAlive: vi.fn() } as unknown as OrderRepository,
      unitOfWork: unitOfWork as unknown as ReturnType<typeof dobles>['unitOfWork'],
      now: () => AHORA,
    })
    const SIN_PERMISO: Actor = { id: 'u-1', companyId: ADMIN.companyId, permissions: ['pedidos.consultar'] }

    await expect(
      cancelOrder(ORDER_ID, { reason: 'sin stock' }, SIN_PERMISO),
    ).rejects.toBeInstanceOf(UnauthorizedError)
    expect(findAliveById).not.toHaveBeenCalled()
    expect(unitOfWork.run).not.toHaveBeenCalled()
  })
})
