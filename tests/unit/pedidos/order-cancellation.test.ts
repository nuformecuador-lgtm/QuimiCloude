// La cancelacion por encargo de otro modulo y la definicion unica de «cancelable» en `pedidos`.
//
// `createCancelAliveOrder` corre el MISMO cuerpo que `cancelOrder` dentro de su unidad de
// trabajo: aqui se prueba con el doble compartido, que corre el trabajo sin transaccion real.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { ORDER_STATUS_VALUES, createCancelAliveOrder } from '@/lib/modules/pedidos'
import { isCancellableStatus } from '@/lib/modules/pedidos/domain/order-cancellation'

import { fakeOrderRow, fakeUnitOfWork } from '@/tests/helpers/order-unit-of-work-double'

import type { OrderStatus } from '@/lib/modules/pedidos'

const ORDER_ID = '11111111-1111-4111-8111-111111111111'
const COMPANY_ID = '33333333-3333-4333-8333-333333333333'
const ACTOR_ID = 'operador-1'
const AHORA = new Date('2026-10-06T12:00:00.000Z')
const MOTIVO = 'El cliente ya no lo quiere'

const repoRoot = process.cwd()
const pedidosDir = join(repoRoot, 'lib', 'modules', 'pedidos')

function fuentesDe(dir: string): readonly string[] {
  const salida: string[] = []
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) salida.push(...fuentesDe(ruta))
    else if (/\.tsx?$/.test(nombre)) salida.push(ruta)
  }
  return salida.sort()
}

function etiqueta(ruta: string): string {
  return relative(repoRoot, ruta).split(sep).join('/')
}

/** Codigo sin comentarios: la prosa puede nombrar `cancelAlive` sin que cuente como llamada. */
function sinComentarios(texto: string): string {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((linea) => linea.replace(/\/\/.*$/, ''))
    .join('\n')
}

function dobles(opciones: { estado?: OrderStatus | null; cancelacion?: 'ok' | 'not_found' } = {}) {
  const estado = opciones.estado === undefined ? 'PENDIENTE' : opciones.estado
  const lockAliveById = vi.fn(async (id: string, scope: { companyId: string }) => {
    void [id, scope]
    return estado === null ? null : fakeOrderRow({ status: estado })
  })
  const cancelAlive = vi.fn(
    async (id: string, reason: string, actorId: string | null, when: Date, scope: { companyId: string }) => {
      void [id, reason, actorId, when, scope]
      return opciones.cancelacion ?? 'ok'
    },
  )
  const setReservedAt = vi.fn(async (id: string, reservedAt: Date | null, scope: { companyId: string }) => {
    void [id, reservedAt, scope]
  })
  const releaseForOrder = vi.fn(async (input: unknown) => {
    void input
  })
  const { unitOfWork } = fakeUnitOfWork({
    orders: { lockAliveById, cancelAlive, setReservedAt },
    reservations: { releaseForOrder },
  })
  return { unitOfWork, lockAliveById, cancelAlive, setReservedAt, releaseForOrder }
}

describe('isCancellableStatus — una sola definicion de «cancelable» (R29, R43)', () => {
  const ESPERADO: Readonly<Record<OrderStatus, boolean>> = {
    PENDIENTE: true,
    EN_CURSO: true,
    BLOQUEADO: true,
    POR_EMPACAR: false,
    EN_EMPAQUE: false,
    POR_ACONDICIONAR: false,
    EN_ACONDICIONAMIENTO: false,
    TERMINADO: false,
    ENTREGADO: false,
    CANCELADO: false,
  }

  it('R29: clasifica los diez estados de OrderStatus, ni uno mas ni uno menos', () => {
    expect([...ORDER_STATUS_VALUES].sort()).toEqual(Object.keys(ESPERADO).sort())
  })

  for (const [estado, cancelable] of Object.entries(ESPERADO) as [OrderStatus, boolean][]) {
    it(`R29, R43: ${estado} ${cancelable ? 'se cancela' : 'no se cancela'}`, () => {
      expect(isCancellableStatus(estado)).toBe(cancelable)
    })
  }
})

describe('createCancelAliveOrder — cancelar por encargo, por el camino unico (R29, R43)', () => {
  it('R29: un pedido cancelable devuelve ok, y cancela, libera con el autor recibido y vacia reserved_at, en ese orden', async () => {
    const d = dobles({ estado: 'EN_CURSO' })

    const resultado = await createCancelAliveOrder({ unitOfWork: d.unitOfWork })(
      ORDER_ID,
      COMPANY_ID,
      MOTIVO,
      ACTOR_ID,
      AHORA,
    )

    expect(resultado).toBe('ok')
    expect(d.lockAliveById).toHaveBeenCalledWith(ORDER_ID, { companyId: COMPANY_ID })
    expect(d.cancelAlive.mock.calls).toEqual([[ORDER_ID, MOTIVO, ACTOR_ID, AHORA, { companyId: COMPANY_ID }]])
    expect(d.releaseForOrder.mock.calls).toEqual([
      [{ orderId: ORDER_ID, companyId: COMPANY_ID, reason: 'release', actorId: ACTOR_ID, now: AHORA }],
    ])
    expect(d.setReservedAt.mock.calls).toEqual([[ORDER_ID, null, { companyId: COMPANY_ID }]])

    const orden = [
      d.lockAliveById.mock.invocationCallOrder[0],
      d.cancelAlive.mock.invocationCallOrder[0],
      d.releaseForOrder.mock.invocationCallOrder[0],
      d.setReservedAt.mock.invocationCallOrder[0],
    ]
    expect(orden).toEqual([...orden].sort((a, b) => (a ?? 0) - (b ?? 0)))
  })

  it('R29: un BLOQUEADO tambien se cancela por encargo', async () => {
    const d = dobles({ estado: 'BLOQUEADO' })

    const resultado = await createCancelAliveOrder({ unitOfWork: d.unitOfWork })(
      ORDER_ID,
      COMPANY_ID,
      MOTIVO,
      ACTOR_ID,
      AHORA,
    )

    expect(resultado).toBe('ok')
    expect(d.cancelAlive).toHaveBeenCalledTimes(1)
  })

  it('R29: un pedido que no existe (o es de otra empresa) es not_found, sin cancelar ni liberar', async () => {
    const d = dobles({ estado: null })

    const resultado = await createCancelAliveOrder({ unitOfWork: d.unitOfWork })(
      ORDER_ID,
      COMPANY_ID,
      MOTIVO,
      ACTOR_ID,
      AHORA,
    )

    expect(resultado).toBe('not_found')
    expect(d.cancelAlive).not.toHaveBeenCalled()
    expect(d.releaseForOrder).not.toHaveBeenCalled()
    expect(d.setReservedAt).not.toHaveBeenCalled()
  })

  it('R29: si cancelAlive no encuentra la fila, es not_found y no libera', async () => {
    const d = dobles({ estado: 'PENDIENTE', cancelacion: 'not_found' })

    const resultado = await createCancelAliveOrder({ unitOfWork: d.unitOfWork })(
      ORDER_ID,
      COMPANY_ID,
      MOTIVO,
      ACTOR_ID,
      AHORA,
    )

    expect(resultado).toBe('not_found')
    expect(d.releaseForOrder).not.toHaveBeenCalled()
    expect(d.setReservedAt).not.toHaveBeenCalled()
  })

  for (const estado of ['POR_EMPACAR', 'EN_EMPAQUE', 'ENTREGADO', 'CANCELADO'] as const) {
    it(`R29, R43: un pedido ${estado} es not_cancellable (no not_found), sin cancelar ni liberar`, async () => {
      const d = dobles({ estado })

      const resultado = await createCancelAliveOrder({ unitOfWork: d.unitOfWork })(
        ORDER_ID,
        COMPANY_ID,
        MOTIVO,
        ACTOR_ID,
        AHORA,
      )

      expect(resultado).toBe('not_cancellable')
      expect(d.cancelAlive).not.toHaveBeenCalled()
      expect(d.releaseForOrder).not.toHaveBeenCalled()
      expect(d.setReservedAt).not.toHaveBeenCalled()
    })
  }

  for (const estado of ['POR_ACONDICIONAR', 'EN_ACONDICIONAMIENTO', 'TERMINADO'] as const) {
    it(`R18: un pedido ${estado} es not_cancellable, sin cancelar ni liberar`, async () => {
      const d = dobles({ estado })

      const resultado = await createCancelAliveOrder({ unitOfWork: d.unitOfWork })(
        ORDER_ID,
        COMPANY_ID,
        MOTIVO,
        ACTOR_ID,
        AHORA,
      )

      expect(resultado).toBe('not_cancellable')
      expect(d.cancelAlive).not.toHaveBeenCalled()
      expect(d.releaseForOrder).not.toHaveBeenCalled()
      expect(d.setReservedAt).not.toHaveBeenCalled()
    })
  }
})

describe('pedidos — una sola definicion de «cancelable» y un solo cuerpo de cancelacion (R29)', () => {
  const fuentes = fuentesDe(pedidosDir).map((ruta) => ({
    ruta: etiqueta(ruta),
    codigo: sinComentarios(readFileSync(ruta, 'utf8')),
  }))

  it('R29: cancel-order.ts ya no declara su propia lista de estados cancelables', () => {
    const cancelOrder = fuentes.find((f) => f.ruta === 'lib/modules/pedidos/domain/cancel-order.ts')
    expect(cancelOrder).toBeDefined()
    expect(cancelOrder?.codigo).not.toMatch(/\bCANCELABLES?\b/)
    expect(cancelOrder?.codigo).not.toMatch(/'PENDIENTE'|'EN_CURSO'|'BLOQUEADO'/)
    expect(cancelOrder?.codigo).toMatch(/\bisCancellableStatus\s*\(/)
    expect(cancelOrder?.codigo).toMatch(/\bcancelInsideTransaction\s*\(/)
  })

  it('R29: el modulo tiene UNA sola definicion de «cancelable»', () => {
    const definiciones = fuentes
      .filter((f) => /\b(?:function|const|let)\s+(?:isCancellable\w*|CANCEL+ABLES?|cancel+ables?)\b/i.test(f.codigo))
      .map((f) => f.ruta)
    expect(definiciones).toEqual(['lib/modules/pedidos/domain/order-cancellation.ts'])
  })

  it('R29: hay UNA sola llamada a cancelAlive fuera de la caducidad diaria, y es la del cuerpo unico', () => {
    const llamadas = fuentes.flatMap((f) =>
      [...f.codigo.matchAll(/\.cancelAlive\s*\(/g)].map(() => f.ruta),
    )
    const fueraDeLaCaducidad = llamadas.filter((ruta) => ruta !== 'lib/modules/pedidos/domain/expire-stale-orders.ts')
    expect(fueraDeLaCaducidad).toEqual(['lib/modules/pedidos/domain/order-cancellation.ts'])
  })
})
