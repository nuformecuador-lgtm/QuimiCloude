// tests/unit/pedidos/order-actions-distribution.test.ts — T11, T25: `design.md > 3`, `> 4.3`.
//
// Las dos Server Actions nuevas de la tanda D, mockeando `@/lib/composition` igual que
// `order-actions.test.ts`: se prueban contra dobles, nunca contra el dominio real.
//
//  - `quoteOrderPresentationAvailabilityAction` (T11): consulta de solo lectura, R6/R7/R39.
//  - `updateOrderDistributionAction` (T25): la edicion ACOTADA «Reparto y unidad», R7, R12,
//    R13, R35, R36, R41, R42, R46.

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { UnauthorizedError } from '@/lib/modules/pedidos'
import {
  quoteOrderPresentationAvailabilityAction,
  updateOrderDistributionAction,
} from '@/lib/modules/pedidos/adapters/driving/order-actions'

const { quoteOrderPresentationAvailabilityMock, updateOrderPresentationLinesMock, getSessionUserMock, getSessionContextMock } =
  vi.hoisted(() => ({
    quoteOrderPresentationAvailabilityMock: vi.fn(),
    updateOrderPresentationLinesMock: vi.fn(),
    getSessionUserMock: vi.fn(),
    getSessionContextMock: vi.fn(),
  }))

vi.mock('@/lib/composition', () => ({
  observabilidad: { readRequestIdHeader: vi.fn(async () => 'req-1') },
  identity: { getSessionUser: getSessionUserMock, getSessionContext: getSessionContextMock },
  pedidos: {
    quoteOrderPresentationAvailability: quoteOrderPresentationAvailabilityMock,
    updateOrderPresentationLines: updateOrderPresentationLinesMock,
  },
}))

const ADMIN_SESSION_USER = {
  id: 'user-admin-1',
  username: 'ana.perez',
  displayName: 'Ana Perez',
  roleName: 'Administrador',
  permissions: ['pedidos.consultar', 'pedidos.modificar'],
}

const SOLO_EMPAQUE_SESSION_USER = {
  ...ADMIN_SESSION_USER,
  id: 'user-empacador-1',
  roleName: 'Empacador',
  permissions: ['empaque.modificar'],
}

const SESSION_CONTEXT = { companyId: '33333333-3333-4333-8333-333333333333' }

const ORDER_ID = '11111111-1111-4111-8111-111111111111'
const PRESENTATION_ID = '66666666-6666-4666-8666-666666666666'
const UNIT_ID = '77777777-7777-4777-8777-777777777777'

beforeEach(() => {
  vi.clearAllMocks()
  getSessionUserMock.mockResolvedValue(ADMIN_SESSION_USER)
  getSessionContextMock.mockResolvedValue(SESSION_CONTEXT)
})

describe('quoteOrderPresentationAvailabilityAction — T11', () => {
  it('exito devuelve { status: success, data } con el resultado del caso de uso, tal cual', async () => {
    quoteOrderPresentationAvailabilityMock.mockResolvedValue({ kind: 'ok', available: '5' })
    const result = await quoteOrderPresentationAvailabilityAction({
      quantity: '10',
      unitId: UNIT_ID,
      presentationLines: [{ presentationId: PRESENTATION_ID, packages: 1 }],
    })
    expect(result).toEqual({ status: 'success', data: { kind: 'ok', available: '5' } })
  })

  it('R39: exceeds_quantity con disponible negativo tambien es success -es solo lectura, no rechaza-', async () => {
    quoteOrderPresentationAvailabilityMock.mockResolvedValue({ kind: 'exceeds_quantity', available: '-5' })
    const result = await quoteOrderPresentationAvailabilityAction({
      quantity: '10',
      unitId: UNIT_ID,
      presentationLines: [{ presentationId: PRESENTATION_ID, packages: 100 }],
    })
    expect(result).toEqual({ status: 'success', data: { kind: 'exceeds_quantity', available: '-5' } })
  })

  it('sin sesion, el actor null baja al caso de uso y el rechazo vuelve como unauthorized', async () => {
    getSessionUserMock.mockResolvedValue(null)
    quoteOrderPresentationAvailabilityMock.mockRejectedValueOnce(new UnauthorizedError())
    const result = await quoteOrderPresentationAvailabilityAction({
      quantity: '10',
      unitId: UNIT_ID,
      presentationLines: [],
    })
    expect(quoteOrderPresentationAvailabilityMock.mock.calls[0]?.[1]).toBeNull()
    expect(result).toEqual({ status: 'error', code: 'unauthorized', message: expect.any(String) })
  })

  it('un error ajeno se devuelve como unexpected, sin detalle', async () => {
    quoteOrderPresentationAvailabilityMock.mockRejectedValueOnce(new Error('boom'))
    const result = await quoteOrderPresentationAvailabilityAction({
      quantity: '10',
      unitId: UNIT_ID,
      presentationLines: [],
    })
    expect(result).toMatchObject({ status: 'error' })
    expect(JSON.stringify(result)).not.toContain('boom')
  })
})

describe('updateOrderDistributionAction — T25', () => {
  it('R12: exige pedidos.modificar; un actor con solo empaque.modificar rechaza con unauthorized sin llamar a la fachada', async () => {
    getSessionUserMock.mockResolvedValue(SOLO_EMPAQUE_SESSION_USER)

    const result = await updateOrderDistributionAction(ORDER_ID, {
      unitId: UNIT_ID,
      presentationLines: [{ presentationId: PRESENTATION_ID, packages: 1 }],
    })

    expect(result).toEqual({ status: 'error', code: 'unauthorized', message: expect.any(String) })
    expect(updateOrderPresentationLinesMock).not.toHaveBeenCalled()
  })

  it('R46: rechaza con invalid_input cualquier campo que no sea unitId/presentationLines, sin llamar a la fachada', async () => {
    const result = await updateOrderDistributionAction(ORDER_ID, {
      unitId: UNIT_ID,
      presentationLines: [],
      quantity: '999',
    })

    expect(result).toEqual({ status: 'error', code: 'invalid_input', message: expect.any(String) })
    expect(updateOrderPresentationLinesMock).not.toHaveBeenCalled()
  })

  it('llama a la fachada con el unitId y las lineas ya validadas, y el actor de la sesion', async () => {
    updateOrderPresentationLinesMock.mockResolvedValue('ok')

    const result = await updateOrderDistributionAction(ORDER_ID, {
      unitId: UNIT_ID,
      presentationLines: [{ presentationId: PRESENTATION_ID, packages: 2 }],
    })

    expect(result).toEqual({ status: 'success' })
    expect(updateOrderPresentationLinesMock).toHaveBeenCalledWith(
      ORDER_ID,
      {
        id: ADMIN_SESSION_USER.id,
        companyId: SESSION_CONTEXT.companyId,
        permissions: ADMIN_SESSION_USER.permissions,
      },
      { unitId: UNIT_ID, lines: [{ presentationId: PRESENTATION_ID, packages: 2 }] },
    )
  })

  it.each([
    ['not_found', 'order_not_found'],
    ['not_editable', 'order_presentation_line_not_editable'],
    ['unit_not_found', 'unit_not_found'],
    ['without_unit', 'order_without_unit'],
    ['presentation_not_found', 'presentation_not_found'],
    ['presentation_without_content', 'presentation_without_content'],
    ['incompatible_units', 'incompatible_units'],
    ['exceeds_quantity', 'order_distribution_exceeds_quantity'],
    ['packaging_not_found', 'product_not_found'],
    ['invalid_lines', 'invalid_input'],
  ] as const)('traduce %s al codigo %s del catalogo (R7, R13, R35, R36, R41, R42; QC-195 R11, R12, R34)', async (resultado, codigo) => {
    updateOrderPresentationLinesMock.mockResolvedValue(resultado)

    const result = await updateOrderDistributionAction(ORDER_ID, {
      unitId: UNIT_ID,
      presentationLines: [{ presentationId: PRESENTATION_ID, packages: 1 }],
    })

    expect(result).toEqual({ status: 'error', code: codigo, message: expect.any(String) })
  })

  it('QC-195 R11: una linea con envase llega a la fachada con el envase y los envases como numero', async () => {
    updateOrderPresentationLinesMock.mockResolvedValue('ok')
    const ENVASE_ID = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'

    const result = await updateOrderDistributionAction(ORDER_ID, {
      unitId: UNIT_ID,
      presentationLines: [{ packagingProductId: ENVASE_ID, packages: '30' }],
    })

    expect(result).toEqual({ status: 'success' })
    expect(updateOrderPresentationLinesMock.mock.calls[0]?.[2]).toEqual({
      unitId: UNIT_ID,
      lines: [{ packagingProductId: ENVASE_ID, packages: 30 }],
    })
  })

  it('un reparto vacio (R9) se acepta: presentationLines: [] pasa la validacion', async () => {
    updateOrderPresentationLinesMock.mockResolvedValue('ok')

    const result = await updateOrderDistributionAction(ORDER_ID, { unitId: UNIT_ID, presentationLines: [] })

    expect(result).toEqual({ status: 'success' })
  })

  it('un error ajeno se devuelve como unexpected, sin detalle', async () => {
    updateOrderPresentationLinesMock.mockRejectedValueOnce(new Error('la conexion se cayo'))
    const result = await updateOrderDistributionAction(ORDER_ID, { unitId: UNIT_ID, presentationLines: [] })
    expect(result).toMatchObject({ status: 'error' })
    expect(JSON.stringify(result)).not.toContain('la conexion se cayo')
  })
})
